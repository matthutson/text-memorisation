// Playback for the practice view.
//
// Speed and key are separate live controls: slowing a song down does not drop
// its pitch, and transposing takes effect immediately instead of re-rendering
// the file. That is done by SoundTouch, which runs in JavaScript on the same
// thread as the page, and with several stems it runs often enough to be felt:
// taps get dropped while a song plays.
//
// So it is only used when it is needed. At normal speed in the original key,
// which is most practice, each stem is an ordinary buffer source and the
// browser plays it away from the page entirely. Changing speed or key swaps
// the graph over at the current position, and changing them back swaps it
// home again.
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
    this.tracks = []; // { src, buffer, shifter, node, gain, panner, source, volume, muted, pan }
    this.isPlain = true; // playing straight, without the shifter in the way
    this.startedAt = 0;  // context time when the straight playback began
    this.startOffset = 0; // and where in the song that was
    this.isPlaying = false;
    this.duration = 0;
    this.tempo = 1;
    this.semitones = 0;
    this.loop = null; // { start, end } in seconds
    this.listeners = {};
    this.pausedAt = 0;
    this.clock = { estimate: 0, wall: 0 }; // the smoothed view of the position

    // A phone that locks, or a tab left for another app, suspends the audio
    // clock. Coming back does not restart it on its own, so the song would sit
    // there looking as though it were playing while nothing moved.
    this.wake = () => {
      if (document.visibilityState !== 'visible') return;
      if (this.isPlaying && this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this.wake);
  }

  on(event, handler) {
    (this.listeners[event] = this.listeners[event] || []).push(handler);
    return () => {
      // An engine that has been destroyed has already let its listeners go, so
      // unsubscribing after the fact is a no-op rather than an error
      this.listeners[event] = (this.listeners[event] || []).filter(item => item !== handler);
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
      pan: stem.pan ?? 0, // -1 hard left, 0 centre, 1 hard right
      shifter: null,
      node: null,
      gain: null,
      panner: null,
      source: null
    }));

    this.pausedAt = 0;
    this.emit('load', { duration: this.duration });
    return this.duration;
  }

  get isLoaded() {
    return this.tracks.length > 0;
  }

  /**
   * The same position, but fit to watch.
   *
   * The real clock comes from the pitch shifter, which only moves when its
   * processor runs: about eleven times a second, in steps. Anything drawn
   * straight from it stutters. This runs a clock of its own between those
   * steps, at whatever rate the song is being played, and leans it back
   * towards the truth a little on every read.
   */
  get smoothTime() {
    const now = performance.now();
    const actual = this.currentTime;

    if (!this.isPlaying) {
      this.clock = { estimate: actual, wall: now };
      return actual;
    }

    const elapsed = this.clock.wall ? (now - this.clock.wall) / 1000 : 0;
    let estimate = this.clock.estimate + elapsed * this.tempo;
    const drift = actual - estimate;
    // A jump too big to be drift, from a seek or a loop coming round, is taken
    // as it is. Otherwise lean towards the truth, but never backwards: a page
    // that slips back a pixel reads as a stumble.
    if (Math.abs(drift) > 0.3) estimate = actual;
    else estimate = Math.max(this.clock.estimate, estimate + drift * 0.08);

    this.clock = { estimate, wall: now };
    return estimate;
  }

  /** Position in the song's own timeline, in seconds */
  get currentTime() {
    if (this.isPlain) {
      if (!this.isPlaying) return this.pausedAt;
      // The context's own clock, which is exact and costs nothing to read
      const at = this.startOffset + (this.context.currentTime - this.startedAt);
      return Math.min(this.#fold(at), this.duration);
    }
    const track = this.tracks[0];
    if (!track || !track.shifter) return this.pausedAt;
    const frames = track.source.fold(track.shifter.sourcePosition);
    return frames / this.context.sampleRate;
  }

  /** A position past the end of the loop, brought back round */
  #fold(at) {
    const loop = this.loop;
    if (!loop || at < loop.start) return at;
    const length = loop.end - loop.start;
    if (length <= 0) return at;
    return loop.start + ((at - loop.start) % length);
  }

  /** Volume and position in the stereo field, the same either way */
  #output(track) {
    const gain = this.context.createGain();
    gain.gain.value = track.muted ? 0 : track.volume;
    // Panning a part away from the middle is how a singer hears their own
    // line against the rest, so every stem gets its own panner.
    const panner = this.context.createStereoPanner();
    panner.pan.value = track.pan;
    gain.connect(panner);
    panner.connect(this.context.destination);
    track.gain = gain;
    track.panner = panner;
    return gain;
  }

  /** Build the graph for every stem, starting at `startAt` seconds */
  #start(startAt) {
    this.isPlain = this.tempo === 1 && this.semitones === 0;
    if (this.isPlain) {
      this.#startPlain(startAt);
      return;
    }
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

      shifter.connect(this.#output(track));
      track.shifter = shifter;
      track.source = source;
    });
  }

  /** The straight path: the browser plays the buffers, the page does nothing */
  #startPlain(startAt) {
    this.startedAt = this.context.currentTime;
    this.startOffset = startAt;

    this.tracks.forEach(track => {
      const node = this.context.createBufferSource();
      node.buffer = track.buffer;
      if (this.loop) {
        node.loop = true;
        node.loopStart = this.loop.start;
        node.loopEnd = this.loop.end;
      }
      node.connect(this.#output(track));
      node.onended = () => {
        // The longest stem decides when the song is over
        if (!this.loop && this.isPlaying && track.buffer.duration >= this.duration - 0.05) {
          this.pause();
          this.emit('end');
        }
      };
      node.start(0, Math.min(startAt, Math.max(0, track.buffer.duration - 0.01)));
      track.node = node;
    });
  }

  #teardown() {
    this.tracks.forEach(track => {
      if (track.node) {
        track.node.onended = null;
        try {
          track.node.stop();
        } catch {
          // never started, or already finished
        }
        track.node.disconnect();
        track.node = null;
      }
      if (track.shifter) {
        try {
          track.shifter.disconnect();
        } catch {
          // already disconnected
        }
      }
      if (track.gain) track.gain.disconnect();
      if (track.panner) track.panner.disconnect();
      track.shifter = null;
      track.gain = null;
      track.panner = null;
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
    if (this.isPlaying && this.isPlain) {
      // A buffer source cannot be moved, so it is replaced. Nothing is decoded
      // again, so this is cheap enough to do on every frame of a drag.
      this.#teardown();
      this.#start(target);
    } else if (this.isPlaying) {
      const frame = Math.floor(target * this.context.sampleRate);
      this.tracks.forEach(track => {
        track.shifter._filter.sourcePosition = frame;
        track.shifter.sourcePosition = frame;
      });
    }
    this.pausedAt = target;
    // Anything else showing the position needs to hear about a seek it did not
    // make itself, such as a hand dragging the words along
    this.emit('seek', target);
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
   * Two reasons to rebuild where we stand. Leaving or returning to normal
   * speed and key swaps the shifter in or out of the graph. And SoundTouch
   * re-arranges its own chain when the effective rate crosses 1, leaving
   * samples in the pipe that carry the old setting.
   */
  #flush() {
    if (!this.isPlaying) return;
    const at = this.currentTime;
    const wantsPlain = this.tempo === 1 && this.semitones === 0;
    if (wantsPlain !== this.isPlain) {
      this.#teardown();
      this.#start(at);
      return;
    }
    this.seek(at);
  }

  setLoop(start, end) {
    this.loop = (start !== null && end !== null && end > start) ? { start, end } : null;
    const frames = this.#loopFrames();
    this.tracks.forEach(track => {
      if (track.source) track.source.loop = frames;
      // A buffer source takes its loop while it plays, so this needs no restart
      if (track.node) {
        track.node.loop = !!this.loop;
        if (this.loop) {
          track.node.loopStart = this.loop.start;
          track.node.loopEnd = this.loop.end;
        }
      }
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

  /** -1 is hard left, 0 the middle, 1 hard right */
  setStemPan(index, pan) {
    const track = this.tracks[index];
    if (!track) return;
    track.pan = Math.min(1, Math.max(-1, pan));
    if (track.panner) track.panner.pan.value = track.pan;
  }

  setStemMuted(index, muted) {
    const track = this.tracks[index];
    if (!track) return;
    track.muted = muted;
    if (track.gain) track.gain.gain.value = muted ? 0 : track.volume;
  }

  destroy() {
    document.removeEventListener('visibilitychange', this.wake);
    this.stop();
    this.tracks = [];
    this.listeners = {};
    if (this.context.state !== 'closed') this.context.close();
  }
}
