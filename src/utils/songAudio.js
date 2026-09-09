// Playback for the practice view.
//
// Every stem runs through its own SoundTouch pitch shifter, so speed and key
// are separate live controls: slowing a song down no longer drops its pitch,
// and transposing takes effect immediately instead of re-rendering the file.
//
// Positions are always reported in the song's own timeline. SoundTouch reads
// the source at a rate set by the tempo, and the position we track is the
// source position, so a bookmark at 1:12 stays at 1:12 at any speed.

import { PitchShifter } from 'soundtouchjs';

const BUFFER_SIZE = 4096;

/**
 * Reads from an AudioBuffer, folding positions past the loop end back to the
 * loop start. The loop happens inside the sample pull, so it is seamless: no
 * seek, no restart, no gap.
 */
class LoopingBufferSource {
  constructor(buffer) {
    this.buffer = buffer;
    this.loop = null; // { start, end } in frames
    this._position = 0;
  }

  get dualChannel() {
    return this.buffer.numberOfChannels > 1;
  }

  get position() {
    return this._position;
  }

  set position(value) {
    this._position = value;
  }

  /** Where the audio really is, once looping has folded the position */
  fold(position) {
    const loop = this.loop;
    if (!loop) return position;
    const length = loop.end - loop.start;
    if (length <= 0 || position < loop.start) return position;
    return loop.start + ((position - loop.start) % length);
  }

  extract(target, numFrames = 0, position = 0) {
    this.position = position;
    const left = this.buffer.getChannelData(0);
    const right = this.dualChannel ? this.buffer.getChannelData(1) : left;

    for (let i = 0; i < numFrames; i++) {
      const at = this.fold(position + i);
      target[i * 2] = left[at] || 0;
      target[i * 2 + 1] = right[at] || 0;
    }

    if (this.loop) return numFrames; // a loop never runs out
    return Math.max(0, Math.min(numFrames, left.length - position));
  }
}

export default class SongAudio {
  constructor() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContextClass();
    this.tracks = []; // { src, buffer, shifter, gain, source, volume, muted }
    this.isPlaying = false;
    this.duration = 0;
    this.tempo = 1;
    this.semitones = 0;
    this.loop = null; // { start, end } in seconds
    this.listeners = {};
    this.pausedAt = 0;
  }

  on(event, handler) {
    (this.listeners[event] = this.listeners[event] || []).push(handler);
    return () => {
      this.listeners[event] = this.listeners[event].filter(item => item !== handler);
    };
  }

  emit(event, detail) {
    (this.listeners[event] || []).forEach(handler => handler(detail));
  }

  /** Fetch and decode `stems`, replacing whatever was loaded before */
  async load(stems) {
    this.stop();
    this.tracks = [];

    const decoded = await Promise.all(stems.map(async (stem) => {
      const response = await fetch(stem.src);
      if (!response.ok) throw new Error(`Could not load ${stem.label} (${response.status})`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      return { stem, buffer };
    }));

    this.duration = decoded.reduce((longest, item) => Math.max(longest, item.buffer.duration), 0);
    this.tracks = decoded.map(({ stem, buffer }) => ({
      src: stem.src,
      label: stem.label,
      buffer,
      volume: stem.volume ?? 1,
      muted: !!stem.muted,
      shifter: null,
      gain: null,
      source: null
    }));

    this.pausedAt = 0;
    this.emit('load', { duration: this.duration });
    return this.duration;
  }

  get isLoaded() {
    return this.tracks.length > 0;
  }

  /** Position in the song's own timeline, in seconds */
  get currentTime() {
    const track = this.tracks[0];
    if (!track || !track.shifter) return this.pausedAt;
    const frames = track.source.fold(track.shifter.sourcePosition);
    return frames / this.context.sampleRate;
  }

  /** Build the graph for every stem, starting at `startAt` seconds */
  #start(startAt) {
    const startFrame = Math.floor(startAt * this.context.sampleRate);

    this.tracks.forEach(track => {
      const source = new LoopingBufferSource(track.buffer);
      source.loop = this.#loopFrames();

      const shifter = new PitchShifter(this.context, track.buffer, BUFFER_SIZE, () => {
        // Fires when a stem runs out; the longest one decides the end
        if (track.buffer.duration >= this.duration - 0.05 && !this.loop) {
          this.pause();
          this.emit('end');
        }
      });

      // Swap in the looping reader and jump it to where playback should begin
      shifter._filter.sourceSound = source;
      shifter._filter.sourcePosition = startFrame;
      shifter.tempo = this.tempo;
      shifter.pitchSemitones = this.semitones;

      const gain = this.context.createGain();
      gain.gain.value = track.muted ? 0 : track.volume;
      shifter.connect(gain);
      gain.connect(this.context.destination);

      track.shifter = shifter;
      track.gain = gain;
      track.source = source;
    });
  }

  #teardown() {
    this.tracks.forEach(track => {
      if (track.shifter) {
        try {
          track.shifter.disconnect();
        } catch {
          // already disconnected
        }
      }
      if (track.gain) track.gain.disconnect();
      track.shifter = null;
      track.gain = null;
      track.source = null;
    });
  }

  #loopFrames() {
    if (!this.loop) return null;
    return {
      start: Math.floor(this.loop.start * this.context.sampleRate),
      end: Math.floor(this.loop.end * this.context.sampleRate)
    };
  }

  async play() {
    if (!this.isLoaded || this.isPlaying) return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.#start(this.pausedAt);
    this.isPlaying = true;
    this.emit('play');
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedAt = this.currentTime;
    this.#teardown();
    this.isPlaying = false;
    this.emit('pause');
  }

  stop() {
    this.#teardown();
    this.isPlaying = false;
    this.pausedAt = 0;
  }

  seek(seconds) {
    const target = Math.min(Math.max(0, seconds), Math.max(0, this.duration - 0.05));
    if (this.isPlaying) {
      const frame = Math.floor(target * this.context.sampleRate);
      this.tracks.forEach(track => {
        track.shifter._filter.sourcePosition = frame;
        track.shifter.sourcePosition = frame;
      });
    }
    this.pausedAt = target;
    return target;
  }

  setTempo(tempo) {
    this.tempo = tempo;
    this.tracks.forEach(track => {
      if (track.shifter) track.shifter.tempo = tempo;
    });
    this.#flush();
  }

  setSemitones(semitones) {
    this.semitones = semitones;
    this.tracks.forEach(track => {
      if (track.shifter) track.shifter.pitchSemitones = semitones;
    });
    this.#flush();
  }

  /**
   * SoundTouch re-arranges its own processing chain when the effective rate
   * crosses 1, and samples already in the pipe carry the old setting. Seeking
   * to where we already are clears them, so a change always takes effect.
   */
  #flush() {
    if (this.isPlaying) this.seek(this.currentTime);
  }

  setLoop(start, end) {
    this.loop = (start !== null && end !== null && end > start) ? { start, end } : null;
    const frames = this.#loopFrames();
    this.tracks.forEach(track => {
      if (track.source) track.source.loop = frames;
    });
    // Drop into the loop if playback is outside it
    if (this.loop) {
      const now = this.currentTime;
      if (now < this.loop.start || now >= this.loop.end) this.seek(this.loop.start);
    }
  }

  setStemVolume(index, volume) {
    const track = this.tracks[index];
    if (!track) return;
    track.volume = volume;
    if (track.gain) track.gain.gain.value = track.muted ? 0 : volume;
  }

  setStemMuted(index, muted) {
    const track = this.tracks[index];
    if (!track) return;
    track.muted = muted;
    if (track.gain) track.gain.gain.value = muted ? 0 : track.volume;
  }

  destroy() {
    this.stop();
    this.tracks = [];
    this.listeners = {};
    if (this.context.state !== 'closed') this.context.close();
  }
}
