export class SimpleAudioStem {
    constructor({ controller, volume }) {
        this.controller = controller;
        this._volume = volume;
        this.ac = controller.ac;
        this.buffer = null;
        this.source = null;
        this.gainNode = this.ac.createGain();
        this.gainNode.gain.value = volume;
        this.gainNode.connect(controller.destination || this.ac.destination);

        this.onPlay = this.onPlay.bind(this);
        this.onPause = this.onPause.bind(this);
        this.onSeek = this.onSeek.bind(this);
        this.onLoopWrap = this.onLoopWrap.bind(this);
        this.applyLoop = this.applyLoop.bind(this);

        // Subscribe to controller events
        if (this.controller.on) {
            this.controller.on('start', this.onPlay);
            this.controller.on('pause', this.onPause);
            this.controller.on('seek', this.onSeek);
            this.controller.on('loop', this.onLoopWrap);
            this.controller.on('loopchange', this.applyLoop);
            this.controller.on('offset', this.applyLoop);
            this.controller.on('playDuration', this.applyLoop);
        }

        // Register with the controller
        if (this.controller.observe) {
            this.controller.observe(this);
        }

        this._playbackRate = 1;
        this._preservePitch = true; // Enable pitch preservation by default
    }

    load(src) {
        this.src = src;
        const promise = (async () => {
            try {
                const response = await fetch(src);
                const arrayBuffer = await response.arrayBuffer();
                this.buffer = await this.ac.decodeAudioData(arrayBuffer);

                // Notify controller of duration change
                if (this.controller.notify) {
                    this.controller.notify('duration', this.buffer.duration);
                }
            } catch (e) {
                console.error("Error loading stem:", e);
                throw e;
            }
        })();
        return { promise };
    }

    onPlay() {
        this.play(this.controller.currentTime);
    }

    onPause() {
        this.stop();
    }

    onSeek({ t }) {
        if (this.controller.state === 'running') {
            this.stop();
            this.play(t);
        }
    }

    /**
     * Called when the controller clock wraps around the loop. Sources that
     * loop natively have already wrapped sample-accurately in the audio
     * thread; only sources that can't (buffer shorter than the loop region)
     * need restarting.
     */
    onLoopWrap({ t }) {
        if (this.controller.state === 'running' && !this.canLoopNatively) {
            this.stop();
            this.play(t);
        }
    }

    /**
     * The playback (and loop) region, in buffer time
     */
    get loopRegion() {
        const start = this.controller.offset || 0;
        const duration = this.controller.playDuration;
        const end = start + (duration || (this.buffer ? this.buffer.duration : 0));
        return { start, end };
    }

    get canLoopNatively() {
        if (!this.buffer) return false;
        const { start, end } = this.loopRegion;
        return start < this.buffer.duration && end <= this.buffer.duration + 0.001;
    }

    /**
     * Configure native looping on the live source node so that the loop is
     * gapless (handled sample-accurately in the audio thread)
     */
    applyLoop() {
        if (!this.source || !this.buffer) return;

        const loop = !!this.controller.loop && this.canLoopNatively;
        this.source.loop = loop;

        if (loop) {
            const { start, end } = this.loopRegion;
            this.source.loopStart = start;
            this.source.loopEnd = Math.min(end, this.buffer.duration);
        }
    }

    async play(startTime) {
        if (!this.buffer) return;

        // Ensure AudioContext is running
        if (this.ac.state === 'suspended') {
            await this.ac.resume();
        }

        this.stop();
        this.source = this.ac.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.connect(this.gainNode);

        const offset = startTime;
        // If offset is beyond duration, don't play
        if (offset >= this.buffer.duration) return;

        // Set playback rate
        // Note: Currently pitch will change with playback rate
        // True pitch-preservation requires complex DSP (phase vocoder, time-stretching algorithms)
        // which would need to be implemented with offline processing or a specialized library
        this.source.playbackRate.value = this._playbackRate;

        this.applyLoop();

        this.source.start(0, offset);
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop();
            } catch (e) { }
            this.source.disconnect();
            this.source = null;
        }
    }

    set volume(v) {
        this._volume = v;
        if (this.gainNode) {
            this.gainNode.gain.value = v;
        }
    }

    get volume() {
        return this._volume;
    }

    set playbackRate(rate) {
        this._playbackRate = rate;
        if (this.source) {
            this.source.playbackRate.value = rate;
        }
    }

    get playbackRate() {
        return this._playbackRate;
    }

    // Interface required by Controller

    get end() {
        return this.buffer ? this.buffer.duration : 0;
    }

    get shouldAndCanPlay() {
        return !!this.buffer;
    }

    get isSeeking() {
        return false;
    }

    destroy() {
        this.stop();
        this.gainNode.disconnect();
        if (this.controller.un) {
            this.controller.un('start', this.onPlay);
            this.controller.un('pause', this.onPause);
            this.controller.un('seek', this.onSeek);
            this.controller.un('loop', this.onLoopWrap);
            this.controller.un('loopchange', this.applyLoop);
            this.controller.un('offset', this.applyLoop);
            this.controller.un('playDuration', this.applyLoop);
        }
        if (this.controller.unobserve) {
            this.controller.unobserve(this);
        }
    }
}
