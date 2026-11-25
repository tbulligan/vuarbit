/**
 * Pure simulation state and clinical optical/ocular math helpers for Vuarbit.
 * Zero DOM or Three.js dependencies so Node unit tests can import directly.
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Create initial simulation state.
 */
export function createSimState() {
  return {
    mode: 'standing',
    glassesOn: true,
    eyesClosed: false,
    eyelidClose: 0,
    lean: 0,
    holding: null,
    heldOffset: { x: 0.06, y: -0.05, z: 0.36 },
    occlOD: 0,
    occlOS: 0,
    occlusionLevel: 0,
    fatigue: 0.1,
    mlnIntensity: 0,
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
 * OS ghost shifts LEFT (negative dxDeg) and UP (positive dyDeg), increasing at near:
 * ~(-5.71, +2.86) at 0.10m, ~(-2.86, +1.43) at 0.40m, ~(-0.95, +0.29) at 3.00m.
 */
export function computeDiplopiaOffsetDeg(distMeters) {
  const d = Math.max(0.05, Number.isFinite(distMeters) ? distMeters : 3.8);
  const dxDeg = -(0.552 + 1.2535 / (d + 0.143));
  const dyDeg = 0.0295 + 0.8316 / (d + 0.1938);
  return { dxDeg, dyDeg };
}

/**
 * Advance simulation state by dt seconds.
 */
export function updateSimState(state, dt) {
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);

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
  state.occlusionLevel = clamp(Math.max(state.occlOD, state.occlOS), 0, 1);

  // Central visual fatigue dynamics
  if (state.eyesClosed) {
    const recovAlpha = 1 - Math.exp(-0.14 * step);
    state.fatigue = clamp(state.fatigue + (0.05 - state.fatigue) * recovAlpha, 0, 1);
  } else {
    let rate = 0.008;
    if (state.focusDistM < 0.7) rate += 0.015;
    if (state.occlusionLevel > 0.05) rate += 0.035 * state.occlusionLevel;
    if (!state.glassesOn) rate += 0.02;
    state.fatigue = clamp(state.fatigue + rate * step, 0, 1);
  }

  // Manifest-latent nystagmus intensity driven by occlusion + fatigue + visual effort
  state.mlnIntensity = clamp(
    state.occlusionLevel * 0.95 + state.fatigue * 0.28 + (state.eyesClosed ? 0 : 0.03),
    0,
    1
  );

  if (state.eyelidClose > 0.8) {
    state.activeZone = 'closed';
  } else if (!state.glassesOn) {
    state.activeZone = 'uncorrected';
  } else if (state.pitch < -0.22 || state.focusDistM < 0.7) {
    state.activeZone = 'near';
  } else {
    state.activeZone = 'distance';
  }

  return state;
}
