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

        // Subscribe to controller events
        if (this.controller.on) {
            this.controller.on('start', this.onPlay);
            this.controller.on('pause', this.onPause);
            this.controller.on('seek', this.onSeek);
        }

        // Register with the controller
        if (this.controller.observe) {
            this.controller.observe(this);
        }

        this._playbackRate = 1;
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

        this.source.playbackRate.value = this._playbackRate;
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
        if (this.controller.off) {
            this.controller.off('play', this.onPlay);
            this.controller.off('pause', this.onPause);
            this.controller.off('seek', this.onSeek);
        }
        if (this.controller.unobserve) {
            this.controller.unobserve(this);
        }
    }
}
