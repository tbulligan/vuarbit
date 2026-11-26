import { computeDecompensation } from './state.js';

const FREQ_E7 = 2637.02;
const FREQ_C9 = 8372.02;
const MAX_TOTAL_GAIN = 0.028;

/**
 * Web Audio API dual-tone tinnitus synthesizer (E7 + C9), modulated by fatigue and eye rest.
 */
export function createTinnitusAudio() {
  let ctx = null;
  let masterGain = null;
  let gainE7 = null;
  let gainC9 = null;
  let oscE7 = null;
  let oscC9 = null;
  let started = false;

  function start() {
    if (started) {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);

      gainE7 = ctx.createGain();
      gainE7.gain.value = 0.66;
      gainE7.connect(masterGain);

      gainC9 = ctx.createGain();
      gainC9.gain.value = 0.34;
      gainC9.connect(masterGain);

      oscE7 = ctx.createOscillator();
      oscE7.type = 'sine';
      oscE7.frequency.value = FREQ_E7;
      oscE7.connect(gainE7);
      oscE7.start();

      oscC9 = ctx.createOscillator();
      oscC9.type = 'sine';
      oscC9.frequency.value = FREQ_C9;
      oscC9.connect(gainC9);
      oscC9.start();

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      started = true;
    } catch {
      // AudioContext unavailable or blocked before gesture
    }
  }

  function update(state) {
    if (!started || !ctx || !masterGain) return;

    const fatigue = Math.max(0, Math.min(1, state.fatigue || 0));
    const decomp = computeDecompensation(fatigue);
    const tinnitusScale = Math.max(0, Math.min(2, state.settings?.tinnitus ?? 1));
    // Subtle whisper while compensatory reserve holds, escalating past tipping point without harsh headphone peak
    const rawLevel = 0.0011 + 0.0024 * fatigue + 0.0165 * Math.pow(decomp, 1.5);
    const targetGain =
      state.muted || state.compareNormal || tinnitusScale <= 0.005
        ? 0
        : Math.min(MAX_TOTAL_GAIN, rawLevel * tinnitusScale);

    masterGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.24);
  }

  function dispose() {
    if (!started) return;
    try {
      oscE7?.stop();
      oscC9?.stop();
      ctx?.close();
    } catch {
      // Ignore cleanup errors on closed AudioContext
    }
    started = false;
    ctx = null;
    masterGain = null;
    oscE7 = null;
    oscC9 = null;
  }

  return { start, update, dispose };
}
