import Controller from '@firstcoders/hls-web-audio/controller.js';

/**
 * A controller that supports gapless looping.
 *
 * The stock controller "loops" by seeking back to the start of the loop
 * region whenever a clock tick (every `refreshRate` ms) notices that the end
 * has been passed. That reacts up to 250ms late, suspends the AudioContext
 * and restarts every source node — an audible gap on every pass.
 *
 * Instead, the source nodes loop natively (AudioBufferSourceNode.loop) so the
 * audio wraps sample-accurately in the audio thread. This controller only
 * wraps its own clock (modulo the loop duration, preserving the overshoot) so
 * that the reported time stays in sync with the already-looped audio, without
 * suspending the AudioContext or restarting any sources.
 *
 * @fires loop - when the clock wraps; sources that cannot loop natively
 *               (e.g. their buffer is shorter than the loop region) can
 *               restart themselves
 * @fires loopchange - when looping is enabled/disabled
 */
export default class GaplessController extends Controller {
  get loop() {
    return !!this._loop;
  }

  set loop(loop) {
    this._loop = !!loop;
    this.notifyUpdated('loopchange', this._loop);
  }

  get currentTime() {
    // The epsilon absorbs floating point cancellation errors: recomputing
    // adjustedStart from ac.currentTime can land rawCurrentTime a few ulps
    // below offset, and a strict comparison then recurses infinitely
    // (fixAdjustedStart -> currentTime -> fixAdjustedStart -> ...)
    if (this.rawCurrentTime < this.offset - 1e-6) {
      this.fixAdjustedStart(this.offset);
    }

    if (this.loop && this.rawCurrentTime >= this.offset + this.playDuration) {
      // Wrap the clock in place rather than via fixAdjustedStart: that fires
      // a 'seek', which would restart the (natively looping) source nodes.
      const overshoot = (this.rawCurrentTime - this.offset) % this.playDuration;
      this.adjustedStart = this.ac.currentTime - (this.offset + overshoot);

      this.fireEvent('loop', { t: this.rawCurrentTime });
    }

    return this.rawCurrentTime;
  }

  set currentTime(t) {
    super.currentTime = t;
  }
}
