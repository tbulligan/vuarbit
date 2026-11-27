/**
 * Pure simulation state and clinical optical/ocular math helpers for Vuarbit.
 * Zero DOM or Three.js dependencies so Node unit tests can import directly.
 */

import {
  PERSONAS,
  SCENES,
  SETTING_SPECS,
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  LENS_PROFILES,
  IOL_GLASSES_SLOTS,
  IOL_INTERMEDIATE_ADD_D,
  IOL_OS_RESIDUAL_DIFF_D,
  FRAME_SHAPES,
  FRAME_COLORS,
  getPersonaById,
  getSceneById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  resolveIolGlassesOptics,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  computeAmbientLight,
  computeAdaptedExposure,
  cycleTimeOfDay,
} from './personas.js';

import {
  LANGUAGES,
  LANGUAGE_OPTIONS,
  detectDefaultLanguage,
  normalizeLanguage,
  t,
} from './i18n.js';

export {
  LANGUAGES,
  LANGUAGE_OPTIONS,
  detectDefaultLanguage,
  normalizeLanguage,
  t,
  PERSONAS,
  SCENES,
  SETTING_SPECS,
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  LENS_PROFILES,
  IOL_GLASSES_SLOTS,
  IOL_INTERMEDIATE_ADD_D,
  IOL_OS_RESIDUAL_DIFF_D,
  FRAME_SHAPES,
  FRAME_COLORS,
  getPersonaById,
  getSceneById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  resolveIolGlassesOptics,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  computeAmbientLight,
  computeAdaptedExposure,
  cycleTimeOfDay,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Pure touch-primary environment detection (hybrid laptops with fine mouse + touchscreen stay desktop).
 */
export function detectTouchDevice(env) {
  if (env && typeof env === 'object') {
    const coarse = Boolean(env.coarsePointer);
    const fine = Boolean(env.finePointer);
    const points = Number(env.maxTouchPoints) || 0;
    return coarse || (points > 0 && !fine);
  }
  const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const coarse = hasMatchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  const fine = hasMatchMedia ? window.matchMedia('(pointer: fine)').matches : false;
  const points = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;
  return coarse || (points > 0 && !fine);
}

/**
 * Apply pixel look delta to simulation yaw/pitch with anatomical posture clamp.
 */
export function applyLookDelta(state, dx, dy, sensitivity = 0.0021) {
  if (!state || typeof state !== 'object') return state;
  const sens = Number.isFinite(sensitivity) ? sensitivity : 0.0021;
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  state.yaw = (Number.isFinite(state.yaw) ? state.yaw : 0) - safeDx * sens;
  state.pitch = clamp(
    (Number.isFinite(state.pitch) ? state.pitch : 0) - safeDy * sens,
    -1.48,
    state.mode === 'seated' ? 1.15 : 1.45
  );
  const maxYaw = computeMaxYaw(state.mode, state.lean);
  if (Number.isFinite(maxYaw)) {
    state.yaw = clamp(state.yaw, -maxYaw, maxYaw);
  }
  return state;
}

/**
 * Reserve-depletion -> tipping-point crash curve:
 * Compensatory reserve masks symptoms up to ~58% fatigue, then decompensates sharply toward 100%.
 */
export function computeDecompensation(fatigue) {
  return smoothstep(0.58, 0.96, clamp(fatigue || 0, 0, 1));
}

function cycleNoise(idx, salt) {
  const s = Math.sin(idx * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Vertex-distance lens power shift when glasses slide forward down the nose (0..14 mm).
 * D_eff = D / (1 - d * D): +13 D slipped 14 mm -> ~+15.89 D; +17 D near half -> ~+22.31 D (10 cm loupe!).
 */
export function computeEffectiveLensPower(powerD, slideNorm) {
  const p = Number.isFinite(powerD) ? powerD : 0;
  const dMeters = clamp(Number.isFinite(slideNorm) ? slideNorm : 0, 0, 1) * 0.014;
  const denom = Math.max(0.25, 1.0 - dMeters * p);
  return p / denom;
}

/**
 * Compute MLN beat frequency multiplier (base 2.5 Hz relaxed -> ~1.125 Hz mean calmly focused).
 * When beatIdx is provided and calmly focused, varies per-beat period irregularly (0.45x..2.10x, mean 1.0x)
 * so focused nystagmus produces natural unpredictable pauses and quick doublets instead of a metronome.
 * Alexander's law: panning toward fast-phase side (fastPanSpike > 0) restores regular 1.0x (2.5 Hz).
 */
export function computeMlnFreqScale(focusStrength, fatigue, occlusionLevel, fastPanSpike = 0, beatIdx = null) {
  const focus = clamp(focusStrength || 0, 0, 1);
  const decomp = computeDecompensation(fatigue || 0);
  const occl = clamp(occlusionLevel || 0, 0, 1);
  const fastPan = clamp((fastPanSpike || 0) * 2.0, 0, 1);
  const calmFocus = focus * (1.0 - decomp) * (1.0 - occl) * (1.0 - fastPan);
  const baseScale = 1.0 - 0.55 * calmFocus;
  if (beatIdx === null || beatIdx === undefined || calmFocus < 0.01) {
    return baseScale;
  }
  const u = cycleNoise(Math.floor(beatIdx), 7.1);
  // Skewed random period [0.45, 2.10] with mean 1.0 -> ~0.40s quick beats to ~1.85s quiet holds
  const periodScale = 1.0 + calmFocus * ((0.45 + 1.65 * u * u) - 1.0);
  return clamp(baseScale / periodScale, 0.18, 1.35);
}

/**
 * Compute target head-local offset (meters) placing a held object in the center
 * of the dominant right eye's lower bifocal lens (or bare OD pupil when glasses off).
 * Converges gently toward OD's pupillary axis at very close range (<0.18m) for smooth monocular occlusion.
 */
export function computeHeldRestOffset(zMeters, glassesOn, dominantEye = 'OD', glassesSlide = 0) {
  const z = clamp(Number.isFinite(zMeters) ? zMeters : 0.22, 0.04, 0.65);
  const slide = clamp(Number.isFinite(glassesSlide) ? glassesSlide : 0, 0, 1);
  const closeBlend = smoothstep(0.08, 0.18, z);
  const xMag = 0.029 + (glassesOn ? 0.22 * z * closeBlend : 0);
  // Keep held items centered inside lower +17 D near segment even as glasses slide down (clear of split-line glare)
  const nearDrop = glassesOn ? -(0.23 * (0.72 + 0.28 * closeBlend) + 0.055 * slide) * z : 0;
  return {
    x: dominantEye === 'OS' ? -xMag : xMag,
    y: nearDrop,
    z,
  };
}

/**
 * Compute anatomical horizontal yaw limit (radians) from posture.
 * Standing allows full 360 deg body turn; seated constrains neck/torso (~95 deg),
 * tightening smoothly (~49 deg) when leaned deeply over the desk.
 */
export function computeMaxYaw(mode, lean) {
  if (mode !== 'seated') return Infinity;
  const t = smoothstep(0.3, 0.85, lean || 0);
  return 1.66 + (0.85 - 1.66) * t;
}

/**
 * Update held-object inspection rotation from mouse deltas.
 * Ignores non-finite inputs, wraps yaw into [-PI, PI], and clamps pitch to [-1.45, 1.45].
 */
export function updateHeldRotation(heldRot, dx, dy, sensitivity = 0.0075) {
  if (!heldRot || typeof heldRot !== 'object') return heldRot;
  const sens = Number.isFinite(sensitivity) ? sensitivity : 0.0075;
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;

  let yaw = (Number.isFinite(heldRot.yaw) ? heldRot.yaw : 0) + safeDx * sens;
  const twoPi = Math.PI * 2;
  if (yaw > Math.PI || yaw < -Math.PI) {
    yaw = ((((yaw + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  }

  const basePitch = Number.isFinite(heldRot.pitch) ? heldRot.pitch : 0;
  heldRot.yaw = yaw;
  heldRot.pitch = clamp(basePitch + safeDy * sens, -1.45, 1.45);
  return heldRot;
}

/**
 * Shared Compare Normal (V) toggle used by both keyboard controls and settings drawer.
 */
export function toggleCompareNormal(state) {
  if (!state) return false;
  state.compareNormal = !state.compareNormal;
  state.fatigue = 0.05;
  if (!state.compareNormal) {
    const supp = hasSuppressionMechanics(state.settings);
    state.focusing = supp;
    state.focusStrength = supp ? 1 : 0;
  }
  return state.compareNormal;
}

/**
 * Shared Glasses ON/OFF (Z) toggle, or 3-glasses cycle (Distance -> Computer -> Reading -> Off) for pseudophakic IOL.
 */
export function toggleGlasses(state) {
  if (!state || state.settings?.lensProfile === 'none') return false;
  if (state.settings?.lensProfile === 'pseudophakic_iol') {
    const curSlot = !state.glassesOn
      ? 'off'
      : IOL_GLASSES_SLOTS.includes(state.glassesSlot)
        ? state.glassesSlot
        : 'distance';
    const nextSlot = IOL_GLASSES_SLOTS[(IOL_GLASSES_SLOTS.indexOf(curSlot) + 1) % IOL_GLASSES_SLOTS.length];
    state.glassesSlot = nextSlot;
    state.glassesOn = nextSlot !== 'off';
    state.glassesSlide = 0;
    if (state.glassesOn) {
      state.glassesBounce = -0.014;
    }
    return state.glassesOn;
  }
  state.glassesOn = !state.glassesOn;
  state.glassesSlot = state.glassesOn ? 'distance' : 'off';
  if (state.glassesOn) {
    state.glassesSlide = 0;
    state.glassesBounce = -0.014;
  }
  return state.glassesOn;
}

/**
 * Create initial simulation state.
 */
export function createSimState(env) {
  const isTouchDevice = detectTouchDevice(env);
  return {
    language: detectDefaultLanguage(),
    isTouchDevice,
    sceneId: 'classroom',
    sceneLoading: false,
    personaId: 'vuarbit_frut',
    settings: createDefaultVisualSettings(),
    settingsOpen: false,
    qualityPreset: isTouchDevice ? 'balanced' : 'high',
    timeOfDay: 'sunny',
    lightsOn: true,
    glareLightOn: true,
    ambientLight: 1.0,
    mode: 'standing',
    aimingPickable: false,
    glassesOn: true,
    glassesSlot: 'distance',
    glassesSlide: 0,
    glassesPinned: false,
    glassesBounce: 0,
    squint: 0,
    eyesClosed: false,
    eyelidClose: 0,
    lean: 0,
    holding: null,
    heldOffset: computeHeldRestOffset(0.22, true),
    heldRot: { yaw: 0, pitch: 0 },
    occlOD: 0,
    occlOS: 0,
    occlusionLevel: 0,
    eyelidLight: 0.35,
    fatigue: 0.08,
    focusing: true,
    focusStrength: 1,
    compareNormal: false,
    mlnIntensity: 0,
    mlnOnlyIntensity: 0,
    gazeVel: 0,
    gazeVelX: 0,
    gazeVelY: 0,
    activeZone: 'distance',
    focusDistM: 3.8,
    muted: false,
    hudVisible: true,
    pointerLocked: false,
    yaw: 0,
    pitch: 0,
    headYaw: 0,
    headPitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
  };
}

/**
 * Compute monocular occlusion factor [0, 1] from object-to-eye distance in meters.
 * Returns 0 at >= 0.165 m (normal 18-22 cm reading stays unoccluded), smoothly ramping to 1 at <= 0.06 m.
 */
export function computeOcclusionFromDistance(distMeters) {
  if (!Number.isFinite(distMeters) || distMeters >= 0.165) {
    return 0;
  }
  if (distMeters <= 0.06) {
    return 1;
  }
  const t = clamp((0.165 - distMeters) / (0.165 - 0.06), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Compute diplopic angular offset (degrees) of amblyopic OS image relative to OD.
 * Constant angular offset (kept in sync with vision.frag.glsl):
 *  - Horizontal (left): -1.53 deg (~1.0cm / 2 workbook squares @ 0.375m seated triangle)
 *  - Vertical (up): +0.31 deg (~0.2cm @ 0.375m)
 */
export function computeDiplopiaOffsetDeg(distMeters, settings) {
  void distMeters;
  if (settings && typeof settings === 'object') {
    return {
      dxDeg: Number.isFinite(settings.diplopiaH) ? settings.diplopiaH : -1.53,
      dyDeg: Number.isFinite(settings.diplopiaV) ? settings.diplopiaV : 0.31,
    };
  }
  return { dxDeg: -1.53, dyDeg: 0.31 };
}

/**
 * Compute instantaneous MLN eye-oscillation angle (degrees) and angular velocity (deg/s).
 * Clinical MLN decelerating slow-phase drift + fast corrective snap toward beatDir (+1 right / -1 left).
 * - Relaxed (2.5 Hz): regular, gentler decelerating drift between snapping points.
 * - Focused (~1.125 Hz mean, randomized inter-beat timing): irregular, jerkier, tight narrow beats when still;
 *   expands to relaxed amplitude when panning (Alexander's law restores regular 2.5 Hz on fast-phase pan).
 * - Monocularly occluded: strong mechanical jerk beating toward the uncovered fixating eye.
 */
export function computeMlnAngleDeg(
  wave,
  elapsed,
  freqHz,
  occlusionLevel,
  mlnScale,
  gazeSpike,
  focusStrength = 0,
  beatDir = 1,
  fastPanSpike = 0
) {
  const f = freqHz > 0 ? freqHz : 2.5;
  const dir = beatDir < 0 ? -1 : 1;
  const occl = clamp(occlusionLevel || 0, 0, 1);
  const focus = clamp(focusStrength || 0, 0, 1);
  const gaze = clamp(gazeSpike || 0, 0, 1);
  const fastPan = clamp(fastPanSpike || 0, 0, 1);
  const scale = clamp(mlnScale || 0, 0, 1.35);

  // Calm focused stillness yields irregular, tight narrow jerky beats;
  // monocular occlusion ramps gradually (0 -> 1 over 16.5..6 cm) from focused back to full unfocused MLN
  const calmFocus = focus * (1.0 - occl) * (1.0 - smoothstep(0.05, 0.45, fastPan));
  const rawCycles = elapsed * f;
  const cycleIdx = Math.floor(rawCycles);
  const phase = ((rawCycles % 1.0) + 1.0) % 1.0;

  const irregA = cycleNoise(cycleIdx, 1.3);
  const slowFrac = clamp(0.84 + calmFocus * (irregA - 0.5) * 0.18, 0.70, 0.92);

  // Decelerating exponential slow phase (MLN hallmark): gentler when relaxed, sharper/jerkier when calmly focused
  const decelK = 1.5 + 2.8 * calmFocus;
  const expDenom = 1.0 - Math.exp(-decelK);

  // Half-amplitude (deg): relaxed ~1.35 deg (2.7 deg p2p), focused still ~0.24 deg (0.48 deg p2p), occluded ~2.5 deg
  const panWiden = smoothstep(0.04, 0.45, gaze);
  const focusAmpFactor = 1.0 - calmFocus * (1.0 - panWiden) * 0.82;
  const baseHalfAmp = 1.35 + (2.50 - 1.35) * smoothstep(0.10, 0.75, occl);
  const beatBounds = (idx) => {
    const amp = baseHalfAmp * focusAmpFactor * (1.0 + calmFocus * (cycleNoise(idx, 4.7) - 0.5) * 0.65) * scale;
    const center = calmFocus * (1.0 - panWiden) * (cycleNoise(idx, 9.2) - 0.5) * 0.22 * scale;
    return { start: dir * amp + center, end: -dir * amp + center };
  };
  const cur = beatBounds(cycleIdx);
  const next = beatBounds(cycleIdx + 1);

  // Slow phase drifts from cur.start -> cur.end; fast phase snaps continuously from cur.end -> next.start (zero boundary jump)
  let dxDeg;
  let velDegS;
  if (phase < slowFrac) {
    const t = phase / slowFrac;
    const decel = (1.0 - Math.exp(-decelK * t)) / expDenom;
    const span = cur.end - cur.start;
    dxDeg = cur.start + span * decel;
    velDegS = span * ((decelK * Math.exp(-decelK * t)) / expDenom) * (f / slowFrac);
  } else {
    const t = (phase - slowFrac) / (1.0 - slowFrac);
    const snap = t * t * (3.0 - 2.0 * t);
    const span = next.start - cur.end;
    dxDeg = cur.end + span * snap;
    velDegS = span * (6.0 * t * (1.0 - t)) * (f / (1.0 - slowFrac));
  }

  // Subtle vertical coupling from recorded waveform when unoccluded (damped under horizontal mechanical occlusion)
  const dyDeg = (wave?.dyDeg || 0) * scale * 0.35 * (1.0 - occl * 0.85);

  return { dxDeg, dyDeg, velDegS };
}

/**
 * Advance simulation state by dt seconds.
 */
export function updateSimState(state, dt) {
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const s = state.settings || createDefaultVisualSettings();
  state.ambientLight = computeAmbientLight(state.timeOfDay, state.lightsOn !== false);
  const suppressionActive = hasSuppressionMechanics(s);
  const paused = Boolean(state.settingsOpen);

  // Smooth eyelid transition
  const targetClose = state.eyesClosed ? 1 : 0;
  const closeAlpha = 1 - Math.exp(-12 * step);
  state.eyelidClose = clamp(
    state.eyelidClose + (targetClose - state.eyelidClose) * closeAlpha,
    0,
    1
  );
  if (Math.abs(targetClose - state.eyelidClose) < 1e-4) {
    state.eyelidClose = targetClose;
  }

  state.occlOD = clamp(state.occlOD || 0, 0, 1);
  state.occlOS = clamp(state.occlOS || 0, 0, 1);
  // MLN Patching Paradox: asymmetric monocular occlusion when open; closed eyelids = symmetric darkness (0 occlusion)
  state.occlusionLevel = state.eyesClosed ? 0 : clamp(Math.abs(state.occlOD - state.occlOS), 0, 1);

  // Cortical focus suppression (C toggle): active only when suppression mechanics apply
  const wantsFocus = suppressionActive && Boolean(state.focusing) && !state.eyesClosed && !state.compareNormal;
  const decomp = computeDecompensation(state.fatigue);
  const fatigueBreakdown = 1.0 - 0.78 * decomp;
  const targetFocusStrength = wantsFocus ? fatigueBreakdown : 0;
  const focusAlpha = 1 - Math.exp(-8 * step);
  state.focusStrength = suppressionActive
    ? clamp((state.focusStrength || 0) + (targetFocusStrength - (state.focusStrength || 0)) * focusAlpha, 0, 1)
    : 0;

  // Glasses nose-slip dynamics (0..14 mm): zero slip when looking up; very gentle creep upright (~12 min still),
  // accelerating naturally when pitched down, leaning over desk, or turning head; Space pins, Shift slides down.
  if (!state.glassesOn || s.lensProfile === 'none') {
    state.glassesSlide = 0;
    state.glassesPinned = false;
  } else if (!paused && !state.compareNormal && !state.glassesPinned) {
    const isAphakic = s.lensProfile === 'aphakic_bifocal';
    const pitch = state.pitch || 0;
    const uprightGravity = 1.0 - smoothstep(-0.04, 0.14, pitch); // stops sliding when chin tilts up
    const downTilt = smoothstep(-0.15, -0.78, pitch);
    const leanFactor = clamp(state.lean || 0, 0, 1);
    const motionFactor = clamp((state.gazeVel || 0) * 0.45, 0, 1);
    const maxSlide = isAphakic ? 1.0 : 0.35;
    const weightScale = isAphakic ? 1.0 : 0.22;
    const slideRate =
      (0.0012 * uprightGravity + 0.017 * downTilt + 0.008 * leanFactor + 0.0045 * motionFactor * uprightGravity) *
      weightScale;
    state.glassesSlide = clamp((state.glassesSlide || 0) + slideRate * step, 0, maxSlide);
  }
  // Decay tactile glasses-on spring settle
  if (Math.abs(state.glassesBounce || 0) > 1e-4) {
    state.glassesBounce *= Math.exp(-10 * step);
    if (Math.abs(state.glassesBounce) < 1e-4) state.glassesBounce = 0;
  }

  // Reflex stenopeic squint when brute-forcing ultra-close held object (< 17 cm)
  const targetSquint =
    !state.compareNormal &&
    !state.eyesClosed &&
    state.holding &&
    state.heldOffset &&
    state.heldOffset.z < 0.17
      ? smoothstep(0.17, 0.085, state.heldOffset.z)
      : 0;
  const squintAlpha = 1 - Math.exp(-7 * step);
  state.squint = clamp((state.squint || 0) + (targetSquint - (state.squint || 0)) * squintAlpha, 0, 1);

  // Two-speed central visual fatigue dynamics (~10x accelerated vs real schoolwork; tuned for Focused waking default)
  if (!paused) {
    if (state.eyesClosed || !suppressionActive) {
      const recovAlpha = 1 - Math.exp(-0.14 * step);
      state.fatigue = clamp(state.fatigue + (0.05 - state.fatigue) * recovAlpha, 0, 1);
    } else if (!state.compareNormal) {
      const isAphakic = s.lensProfile === 'aphakic_bifocal';
      const hasDip = Math.abs(s.diplopiaH || 0) >= 0.01 || Math.abs(s.diplopiaV || 0) >= 0.01;
      let rate = 0.0009;
      if ((isAphakic || hasDip) && state.focusDistM > 0 && state.focusDistM < 0.7) {
        rate += 0.0010;
      }
      // Sub-15 cm binocular convergence mismatch strain (both eyes unoccluded, trying & failing to converge)
      if ((isAphakic || hasDip) && state.focusDistM > 0 && state.focusDistM < 0.16 && state.occlOD < 0.25 && state.occlOS < 0.25) {
        rate += 0.0016;
      }
      if ((s.mlnScale || 0) > 0.005 && state.occlusionLevel > 0.05) {
        rate += 0.0035 * state.occlusionLevel;
      }
      if (isAphakic && !state.glassesOn) {
        rate += 0.0022;
      }
      if (wantsFocus) {
        rate = rate * 2.0 + 0.0014;
      }
      state.fatigue = clamp(state.fatigue + rate * step, 0, 1);
    }
  }

  // Separate MLN jerk drive from infantile albinism pendular nystagmus drive (no double-counting in optics.js)
  // Closed eyelids behave like open + Focused (unaffected by monocular occlusion)
  const postDecomp = computeDecompensation(state.fatigue);
  const effFocusForMln = state.eyesClosed ? 1.0 : state.focusStrength;
  const unocclDrive = (0.38 + 0.34 * postDecomp) * (1 - 0.58 * effFocusForMln);
  const mlnScale = clamp(s.mlnScale ?? 1, 0, 2);
  const mlnDrive = clamp(state.occlusionLevel * 0.95 + unocclDrive * (1 - 0.45 * state.occlusionLevel), 0, 1.15) * mlnScale;
  const albinismDrive =
    clamp(s.albinism || 0, 0, 1) * 0.48 * (state.eyesClosed ? 0.25 : 1.0) * (1 - 0.35 * state.focusStrength);
  state.mlnOnlyIntensity = clamp(mlnDrive, 0, 1);
  state.mlnIntensity = clamp(mlnDrive + albinismDrive, 0, 1);

  if (state.eyelidClose > 0.8) {
    state.activeZone = 'closed';
    state.focusDistM = 0;
  } else if (state.compareNormal) {
    state.activeZone = 'normal';
  } else if (s.lensProfile === 'none') {
    state.activeZone = 'emmetropic';
  } else if (!state.glassesOn) {
    state.activeZone = 'uncorrected';
  } else if (s.lensProfile === 'pseudophakic_iol') {
    if (state.glassesSlot === 'intermediate') {
      state.activeZone = 'intermediate';
    } else if (state.glassesSlot === 'near') {
      state.activeZone = 'near';
    } else {
      state.activeZone = 'distance';
    }
  } else if (
    (s.lensProfile === 'aphakic_bifocal' || s.lensProfile === 'bifocal' || s.lensProfile === 'progressive') &&
    s.nearAddD > 0.25 &&
    (state.pitch < -0.22 || (state.focusDistM > 0 && state.focusDistM < 0.7))
  ) {
    state.activeZone = 'near';
  } else {
    state.activeZone = 'distance';
  }

  return state;
}
