/**
 * Pure simulation state and clinical optical/ocular math helpers for Vuarbit.
 * Zero DOM or Three.js dependencies so Node unit tests can import directly.
 */

import {
  PERSONAS,
  SETTING_SPECS,
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  getPersonaById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  computeAmbientLight,
} from './personas.js';

export {
  PERSONAS,
  SETTING_SPECS,
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  getPersonaById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  computeAmbientLight,
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Reserve-depletion -> tipping-point crash curve:
 * Compensatory reserve masks symptoms up to ~58% fatigue, then decompensates sharply toward 100%.
 */
export function computeDecompensation(fatigue) {
  return smoothstep(0.58, 0.96, clamp(fatigue || 0, 0, 1));
}

/**
 * Compute MLN beat frequency multiplier in [0.5, 1.0].
 * Halves beat frequency (0.5x) only when calmly Focused; stays 1.0x when unfocused,
 * fatigued/decompensated, occluded, or actively moving head/gaze.
 */
export function computeMlnFreqScale(focusStrength, fatigue, occlusionLevel, gazeSpike) {
  const focus = clamp(focusStrength || 0, 0, 1);
  const decomp = computeDecompensation(fatigue || 0);
  const occl = clamp((occlusionLevel || 0) * 2.0, 0, 1);
  const gaze = clamp((gazeSpike || 0) * 2.0, 0, 1);
  const calmFocus = focus * (1.0 - decomp) * (1.0 - occl) * (1.0 - gaze);
  return 1.0 - 0.5 * calmFocus;
}

/**
 * Compute target head-local offset (meters) placing a held object in the center
 * of the dominant right eye's lower bifocal lens (or bare OD pupil when glasses off).
 * Converges gently toward OD's pupillary axis at very close range (<0.18m) for smooth monocular occlusion.
 */
export function computeHeldRestOffset(zMeters, glassesOn, dominantEye = 'OD') {
  const z = clamp(Number.isFinite(zMeters) ? zMeters : 0.22, 0.04, 0.65);
  const closeBlend = smoothstep(0.08, 0.18, z);
  const xMag = 0.029 + (glassesOn ? 0.22 * z * closeBlend : 0);
  return {
    x: dominantEye === 'OS' ? -xMag : xMag,
    y: glassesOn ? -0.21 * z * (0.35 + 0.65 * closeBlend) : 0,
    z,
  };
}

/**
 * Compute anatomical horizontal yaw limit (radians) from posture.
 * Standing allows full 360 deg body turn; seated constrains neck/torso (~95 deg),
 * tightening smoothly (~37 deg) when leaned deeply over the desk.
 */
export function computeMaxYaw(mode, lean) {
  if (mode !== 'seated') return Infinity;
  const t = smoothstep(0.3, 0.85, lean || 0);
  return 1.66 + (0.65 - 1.66) * t;
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
 * Create initial simulation state.
 */
export function createSimState() {
  return {
    personaId: 'vuarbit_1994',
    settings: createDefaultVisualSettings(),
    settingsOpen: false,
    qualityPreset: 'high',
    timeOfDay: 'sunny',
    lightsOn: true,
    ambientLight: 1.0,
    mode: 'standing',
    glassesOn: true,
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
    focusing: false,
    focusStrength: 0,
    compareNormal: false,
    mlnIntensity: 0,
    mlnOnlyIntensity: 0,
    gazeVel: 0,
    activeZone: 'distance',
    focusDistM: 3.8,
    muted: false,
    hudVisible: true,
    pointerLocked: false,
    yaw: 0,
    pitch: 0,
  };
}

/**
 * Compute monocular occlusion factor [0, 1] from object-to-eye distance in meters.
 * Returns 0 at >= 0.25m, smoothly ramping to 1 at <= 0.08m.
 */
export function computeOcclusionFromDistance(distMeters) {
  if (!Number.isFinite(distMeters) || distMeters >= 0.25) {
    return 0;
  }
  if (distMeters <= 0.08) {
    return 1;
  }
  const t = clamp((0.25 - distMeters) / (0.25 - 0.08), 0, 1);
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
 * Unoccluded: organic video-derived waveform + prominent 5.5 Hz gaze-shift burst while mouse moves (stronger unfocused).
 * Occluded (asymmetric monocular): blends into mechanical horizontal Point A (-2.5 deg) -> Point B (+2.5 deg) jerk.
 */
export function computeMlnAngleDeg(wave, elapsed, freqHz, occlusionLevel, mlnScale, gazeSpike, focusStrength = 0) {
  const f = freqHz > 0 ? freqHz : 5.5;
  const occl = clamp(occlusionLevel || 0, 0, 1);
  const mechMix = smoothstep(0.12, 0.78, occl);
  const phase = (((elapsed * f) % 1.0) + 1.0) % 1.0;
  const slowFrac = 0.84;

  let mechDegX;
  let mechVelX;
  if (phase < slowFrac) {
    const t = phase / slowFrac;
    mechDegX = -2.5 + 5.0 * (0.55 * t + 0.45 * t * t);
    mechVelX = (5.0 * (0.55 + 0.9 * t) * f) / slowFrac;
  } else {
    const t = (phase - slowFrac) / (1.0 - slowFrac);
    const snap = t * t * (3.0 - 2.0 * t);
    mechDegX = 2.5 - 5.0 * snap;
    mechVelX = (-5.0 * 6.0 * t * (1.0 - t) * f) / (1.0 - slowFrac);
  }

  // Prominent gaze-shift jerk beat while mouse moves (strongest unfocused, damped ~58% in Focus, stops instantly on 0 speed)
  const focusDamp = 1.0 - 0.58 * clamp(focusStrength || 0, 0, 1);
  const gazeGain = 1.15 * focusDamp;
  const gazeBurst = (gazeSpike || 0) * mechDegX * gazeGain;
  const gazeVelX = (gazeSpike || 0) * mechVelX * gazeGain;

  const scale = clamp(mlnScale || 0, 0, 1.35);
  const organicX = (wave?.dxDeg || 0) * scale;
  const organicY = (wave?.dyDeg || 0) * scale;

  const dxDeg = organicX * (1.0 - mechMix) + mechDegX * scale * mechMix + gazeBurst;
  const dyDeg = organicY * (1.0 - mechMix * 0.88);
  const velDegS = (mechVelX * scale * mechMix) + gazeVelX + (wave?.vxDegS || 0) * scale * (1.0 - mechMix);

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
  // MLN Patching Paradox: triggered by asymmetric monocular occlusion (one eye occluded, NOT both)
  state.occlusionLevel = clamp(Math.abs(state.occlOD - state.occlOS), 0, 1);

  // Cortical focus suppression (C toggle / Space hold): active only when suppression mechanics apply
  const wantsFocus = suppressionActive && Boolean(state.focusing) && !state.eyesClosed && !state.compareNormal;
  const decomp = computeDecompensation(state.fatigue);
  const fatigueBreakdown = 1.0 - 0.78 * decomp;
  const targetFocusStrength = wantsFocus ? fatigueBreakdown : 0;
  const focusAlpha = 1 - Math.exp(-8 * step);
  state.focusStrength = suppressionActive
    ? clamp((state.focusStrength || 0) + (targetFocusStrength - (state.focusStrength || 0)) * focusAlpha, 0, 1)
    : 0;

  // Two-speed central visual fatigue dynamics (paused while settings drawer is open; gated to suppression mechanics)
  if (!paused) {
    if (state.eyesClosed || !suppressionActive) {
      const recovAlpha = 1 - Math.exp(-0.14 * step);
      state.fatigue = clamp(state.fatigue + (0.05 - state.fatigue) * recovAlpha, 0, 1);
    } else if (!state.compareNormal) {
      const isAphakic = s.lensProfile === 'aphakic_bifocal';
      let rate = 0.0012;
      if ((isAphakic || Math.abs(s.diplopiaH || 0) >= 0.01) && state.focusDistM > 0 && state.focusDistM < 0.7) {
        rate += 0.0018;
      }
      if ((s.mlnScale || 0) > 0.005 && state.occlusionLevel > 0.05) {
        rate += 0.006 * state.occlusionLevel;
      }
      if (isAphakic && !state.glassesOn) {
        rate += 0.003;
      }
      if (wantsFocus) {
        rate = rate * 2.4 + 0.0035;
      }
      state.fatigue = clamp(state.fatigue + rate * step, 0, 1);
    }
  }

  // Separate MLN jerk drive from infantile albinism pendular nystagmus drive (no double-counting in optics.js)
  const postDecomp = computeDecompensation(state.fatigue);
  const unocclDrive = (0.15 + 0.34 * postDecomp) * (state.eyesClosed ? 0.35 : 1.0) * (1 - 0.68 * state.focusStrength);
  const mlnScale = clamp(s.mlnScale ?? 1, 0, 2);
  const mlnDrive = (state.occlusionLevel * 0.95 + unocclDrive) * mlnScale;
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
