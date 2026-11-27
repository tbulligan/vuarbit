import { computeDecompensation } from './state.js';

const FREQ_E7 = 2637.02;
const FREQ_C9 = 8372.02;
const MAX_TOTAL_GAIN = 0.028;

/**
 * Web Audio API dual-tone tinnitus synthesizer:
 * E7 (2637.02 Hz) panned right; C9 (8372.02 Hz) centered intracranially ("inside head") via slight binaural split.
 */
export function createTinnitusAudio() {
  let ctx = null;
  let masterGain = null;
  let gainE7 = null;
  let gainC9L = null;
  let gainC9R = null;
  let oscE7 = null;
  let oscC9L = null;
  let oscC9R = null;
  let started = false;

  function connectPanned(node, panVal) {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = panVal;
      node.connect(panner);
      panner.connect(masterGain);
    } else {
      node.connect(masterGain);
    }
  }

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

      // E7 strongly right-lateralized
      gainE7 = ctx.createGain();
      gainE7.gain.value = 0.66;
      connectPanned(gainE7, 0.82);

      oscE7 = ctx.createOscillator();
      oscE7.type = 'sine';
      oscE7.frequency.value = FREQ_E7;
      oscE7.connect(gainE7);
      oscE7.start();

      // C9 centered inside head (subtle ±0.15 Hz binaural decorrelation localizes intracranially on headphones)
      gainC9L = ctx.createGain();
      gainC9L.gain.value = 0.17;
      connectPanned(gainC9L, -0.35);

      gainC9R = ctx.createGain();
      gainC9R.gain.value = 0.17;
      connectPanned(gainC9R, 0.35);

      oscC9L = ctx.createOscillator();
      oscC9L.type = 'sine';
      oscC9L.frequency.value = FREQ_C9 - 0.15;
      oscC9L.connect(gainC9L);
      oscC9L.start();

      oscC9R = ctx.createOscillator();
      oscC9R.type = 'sine';
      oscC9R.frequency.value = FREQ_C9 + 0.15;
      oscC9R.connect(gainC9R);
      oscC9R.start();

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
      oscC9L?.stop();
      oscC9R?.stop();
      ctx?.close();
    } catch {
      // Ignore cleanup errors on closed AudioContext
    }
    started = false;
    ctx = null;
    masterGain = null;
    gainE7 = null;
    gainC9L = null;
    gainC9R = null;
    oscE7 = null;
    oscC9L = null;
    oscC9R = null;
  }

  return { start, update, dispose };
}
