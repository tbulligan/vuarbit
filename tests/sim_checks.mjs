import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PERSONAS,
  SCENES,
  SETTING_SPECS,
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  FRAME_SHAPES,
  FRAME_COLORS,
  getPersonaById,
  getSceneById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  computeAmbientLight,
  computeAdaptedExposure,
  cycleTimeOfDay,
  createSimState,
  computeOcclusionFromDistance,
  computeDiplopiaOffsetDeg,
  computeMlnAngleDeg,
  computeMlnFreqScale,
  computeEffectiveLensPower,
  computeHeldRestOffset,
  computeMaxYaw,
  computeDecompensation,
  updateHeldRotation,
  toggleCompareNormal,
  toggleGlasses,
  updateSimState,
} from '../src/state.js';
import {
  AMSLER_SPEC,
  ETDRS_ROWS,
  EXAM_VIEW_DISTANCE_M,
  ISHIHARA_PLATES,
  JAEGER_ROWS,
  MACHADO_CVD_MATRICES,
  PELLI_ROBSON_TRIPLETS,
  SLOAN_GLYPHS,
  applyMachadoCvd,
  computeAmslerAngularDeg,
  computeJaegerHeightM,
  computeOptotypeHeightM,
  computePelliRobsonInkByte,
  computeWeberContrast,
  rgbDistance,
} from '../src/scene/exam_calibration.js';
import {
  CAR_CRUISE_SPEED_MPS,
  CAR_FAR_CLIP,
  FRIULI_ROUTE_SIGNS,
  ONCOMING_CLOSING_SPEED_MPS,
  ROAD_LOOP_LEN_M,
  ROAD_Z_MIN,
  ROAD_Z_MAX,
  computeLeadCarZ,
  computeRoadHeadingRad,
  computeRoadLighting,
  computeRoadRelativeOffset,
  computeSteeringWheelAngle,
  roadGlobalCurvatureX,
  wrapLoopZ,
} from '../src/scene/car_math.js';

function assertFiniteNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number`);
  assert.ok(Number.isFinite(value), `${label} must be finite (got ${value})`);
}

// 1. Validate public/data/nystagmus_waveform.json
const waveformUrl = new URL('../public/data/nystagmus_waveform.json', import.meta.url);
const waveformRaw = fs.readFileSync(waveformUrl, 'utf8');

const forbiddenPatterns = [
  new RegExp('tom' + 'aso', 'i'),
  new RegExp('\\btom' + 'as\\b', 'i'),
  new RegExp('\\bmo' + 'ok\\b', 'i'),
  new RegExp('\\bu' + 'wv\\b', 'i'),
  new RegExp('/mnt' + '/c', 'i'),
  new RegExp('\\.mp' + '4', 'i'),
  new RegExp('/ho' + 'me/', 'i'),
  /C:\\/i,
];
for (const pat of forbiddenPatterns) {
  assert.equal(pat.test(waveformRaw), false, `Waveform JSON matched forbidden pattern ${pat}`);
}

const wf = JSON.parse(waveformRaw);
assertFiniteNumber(wf.source_fps, 'source_fps');
assert.ok(wf.source_fps > 0, 'source_fps must be > 0');
assertFiniteNumber(wf.duration_s, 'duration_s');
assert.ok(wf.duration_s > 0, 'duration_s must be > 0');
assertFiniteNumber(wf.exotropia_estimate_deg, 'exotropia_estimate_deg');

assert.equal(wf.calibration?.method, 'inner_canthus_normalized', 'calibration.method mismatch');
assertFiniteNumber(wf.calibration?.eye_radius_mm, 'calibration.eye_radius_mm');
assert.ok(wf.calibration.eye_radius_mm > 0, 'eye_radius_mm must be > 0');

for (const phaseName of ['binocular', 'mln_occluded']) {
  const phase = wf.phases?.[phaseName];
  assert.ok(phase && typeof phase === 'object', `missing phase ${phaseName}`);
  assertFiniteNumber(phase.frame_count, `phases.${phaseName}.frame_count`);
  assert.ok(phase.frame_count > 0, `phases.${phaseName}.frame_count must be > 0`);
  assertFiniteNumber(phase.dominant_freq_hz, `phases.${phaseName}.dominant_freq_hz`);
  assertFiniteNumber(phase.peak_to_peak_deg, `phases.${phaseName}.peak_to_peak_deg`);
  assertFiniteNumber(phase.slow_phase_velocity_deg_s, `phases.${phaseName}.slow_phase_velocity_deg_s`);
}
assert.ok(
  wf.phases.mln_occluded.occluded_eye === 'OD' || wf.phases.mln_occluded.occluded_eye === 'OS',
  'mln_occluded.occluded_eye must be OD or OS'
);

assertFiniteNumber(wf.waveform?.sample_rate_hz, 'waveform.sample_rate_hz');
assertFiniteNumber(wf.waveform?.cycle_freq_hz, 'waveform.cycle_freq_hz');
assertFiniteNumber(wf.waveform?.amplitude_deg, 'waveform.amplitude_deg');
assert.ok(Array.isArray(wf.waveform?.samples_x_deg) && wf.waveform.samples_x_deg.length > 0, 'samples_x_deg must be non-empty');
assert.ok(Array.isArray(wf.waveform?.samples_y_deg) && wf.waveform.samples_y_deg.length > 0, 'samples_y_deg must be non-empty');
assert.equal(wf.waveform.samples_x_deg.length, wf.waveform.samples_y_deg.length, 'samples_x_deg and samples_y_deg length mismatch');

for (let i = 0; i < wf.waveform.samples_x_deg.length; i++) {
  assertFiniteNumber(wf.waveform.samples_x_deg[i], `samples_x_deg[${i}]`);
  assertFiniteNumber(wf.waveform.samples_y_deg[i], `samples_y_deg[${i}]`);
}

// 2. Validate src/state.js: computeOcclusionFromDistance (gradual ramp from 16.5 cm down to 6 cm)
assert.equal(computeOcclusionFromDistance(0.25), 0);
assert.equal(computeOcclusionFromDistance(0.165), 0);
assert.equal(computeOcclusionFromDistance(0.5), 0);
assert.equal(computeOcclusionFromDistance(3.8), 0);
assert.equal(computeOcclusionFromDistance(Infinity), 0);
assert.equal(computeOcclusionFromDistance(NaN), 0);

assert.equal(computeOcclusionFromDistance(0.06), 1);
assert.equal(computeOcclusionFromDistance(0.04), 1);
assert.equal(computeOcclusionFromDistance(0.0), 1);

const occFar = computeOcclusionFromDistance(0.145);
const occMid = computeOcclusionFromDistance(0.1125);
const occNear = computeOcclusionFromDistance(0.08);
assert.ok(occFar > 0 && occFar < occMid && occMid < occNear && occNear < 1, 'occlusion ramp must be strictly monotonic in (0.06, 0.165)');
assert.ok(Math.abs(occMid - 0.5) < 1e-6, `midpoint occlusion expected 0.5, got ${occMid}`);

// 3. Validate src/state.js: computeDiplopiaOffsetDeg (-1.53 deg L / +0.31 deg U -> 1.0cm L / 0.2cm U @ 0.375m seated triangle)
const metricFromDeg = (deg, distM) => Math.tan((Math.abs(deg) * Math.PI) / 180) * distM;
const dipTriangle = computeDiplopiaOffsetDeg(0.375);
const dipNear = computeDiplopiaOffsetDeg(0.10);
const dipFar = computeDiplopiaOffsetDeg(3.75);

assert.ok(dipTriangle.dxDeg < 0 && dipTriangle.dyDeg > 0, 'OS ghost must shift left (dx<0) and up (dy>0)');
assert.ok(Math.abs(metricFromDeg(dipTriangle.dxDeg, 0.375) - 0.01) < 2e-4, '0.375m seated triangle horizontal offset expected ~1.0cm (2 squares)');
assert.ok(Math.abs(metricFromDeg(dipTriangle.dyDeg, 0.375) - 0.002) < 2e-4, '0.375m seated triangle vertical offset expected ~0.2cm');
assert.equal(dipNear.dxDeg, dipTriangle.dxDeg, 'angular horizontal diplopia must stay constant across depths');
assert.equal(dipFar.dyDeg, dipTriangle.dyDeg, 'angular vertical diplopia must stay constant across depths');

// Verify GLSL diplopia constants stay in sync with state.js
const fragSrc = fs.readFileSync(new URL('../src/shaders/vision.frag.glsl', import.meta.url), 'utf8');
for (const c of ['-1.53', '0.31']) {
  assert.ok(fragSrc.includes(c), `vision.frag.glsl missing diplopia constant ${c}`);
}

// 4. Validate src/state.js: computeMlnAngleDeg (calibrated 2.5/1.125 Hz MLN decelerating slow phase + Alexander's law)
const dummyWave = { dxDeg: 1.2, dyDeg: -0.4, vxDegS: 10 };
const mlnRelaxStart = computeMlnAngleDeg(dummyWave, 0.01 / 2.5, 2.5, 0.0, 1.0, 0.0, 0.0, 1, 0.0);
const mlnRelaxMid = computeMlnAngleDeg(dummyWave, 0.42 / 2.5, 2.5, 0.0, 1.0, 0.0, 0.0, 1, 0.0);
const mlnRelaxLate = computeMlnAngleDeg(dummyWave, 0.80 / 2.5, 2.5, 0.0, 1.0, 0.0, 0.0, 1, 0.0);
assert.ok(
  Math.abs(mlnRelaxStart.velDegS) > Math.abs(mlnRelaxMid.velDegS) &&
    Math.abs(mlnRelaxMid.velDegS) > Math.abs(mlnRelaxLate.velDegS),
  'MLN slow-phase drift velocity must decelerate across beat'
);
assert.ok(mlnRelaxStart.dxDeg > 0 && mlnRelaxLate.dxDeg < 0, 'right-beating MLN slow phase drifts from + to - before rightward snap');

// Beat direction reverses when OS fixates (beatDir = -1)
const mlnLeftBeat = computeMlnAngleDeg(dummyWave, 0.01 / 2.5, 2.5, 0.0, 1.0, 0.0, 0.0, -1, 0.0);
assert.ok(Math.abs(mlnLeftBeat.dxDeg + mlnRelaxStart.dxDeg) < 1e-6, 'beatDir=-1 must mirror horizontal MLN direction');

// Occluded mechanical MLN ramps to full +/-2.5 deg horizontal sweep
const mlnOcclStart = computeMlnAngleDeg(dummyWave, 0.0, 2.5, 1.0, 1.0, 0.0, 0.0, 1, 0.0);
const mlnOcclEnd = computeMlnAngleDeg(dummyWave, 0.839 / 2.5, 2.5, 1.0, 1.0, 0.0, 0.0, 1, 0.0);
assert.ok(Math.abs(mlnOcclStart.dxDeg - 2.5) < 0.05, `occluded right-beating MLN starts at +2.5 deg, got ${mlnOcclStart.dxDeg}`);
assert.ok(mlnOcclEnd.dxDeg < -2.4, `occluded right-beating MLN drifts to -2.5 deg, got ${mlnOcclEnd.dxDeg}`);
assert.ok(Math.abs(mlnOcclStart.dyDeg) < 0.1, 'occluded mechanical MLN must be primarily horizontal');

// Focused stillness narrows amplitude vs relaxed; panning left/up/down expands amplitude back toward relaxed
const mlnFocusedStill = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 2.5, 0.0, 1.0, 0.0, 1.0, 1, 0.0);
const mlnFocusedPanOther = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 2.5, 0.0, 1.0, 0.8, 1.0, 1, 0.0);
const mlnRelaxZero = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 2.5, 0.0, 1.0, 0.0, 0.0, 1, 0.0);
assert.ok(
  Math.abs(mlnFocusedStill.dxDeg) < Math.abs(mlnRelaxZero.dxDeg) * 0.45,
  'calm Focus must tightly narrow MLN amplitude'
);
assert.ok(
  Math.abs(mlnFocusedPanOther.dxDeg) > Math.abs(mlnFocusedStill.dxDeg) * 2.5,
  'panning while focused must expand amplitude back toward relaxed'
);

// MLN frequency: 0.45x (~1.125 Hz mean) when calmly focused with irregular per-beat variation; 1.0x (2.5 Hz) when relaxed/occluded/fatigued/fast-pan
assert.ok(Math.abs(computeMlnFreqScale(1.0, 0.1, 0.0, 0.0) - 0.45) < 1e-6, 'calm Focus mean must scale MLN freq to 0.45x (~1.125 Hz)');
const fBeat0 = computeMlnFreqScale(1.0, 0.1, 0.0, 0.0, 0);
const fBeat1 = computeMlnFreqScale(1.0, 0.1, 0.0, 0.0, 1);
const fBeat2 = computeMlnFreqScale(1.0, 0.1, 0.0, 0.0, 2);
assert.ok(fBeat0 !== fBeat1 || fBeat1 !== fBeat2, 'calm Focus beat-to-beat frequency must vary irregularly (non-metronomic)');
assert.equal(computeMlnFreqScale(0.0, 0.1, 0.0, 0.0, 3), 1.0, 'relaxed MLN frequency must stay strictly regular 1.0x (2.5 Hz)');
assert.equal(computeMlnFreqScale(1.0, 0.96, 0.0, 0.0), 1.0, 'fatigued MLN frequency must stay 1.0x');
assert.equal(computeMlnFreqScale(1.0, 0.1, 1.0, 0.0), 1.0, 'full occlusion MLN frequency must reach 1.0x');
assert.ok(
  computeMlnFreqScale(1.0, 0.1, 0.5, 0.0) > 0.45 && computeMlnFreqScale(1.0, 0.1, 0.5, 0.0) < 1.0,
  'partial occlusion must gradually ramp MLN frequency from focused to full'
);
assert.equal(computeMlnFreqScale(1.0, 0.1, 0.0, 0.6, 2), 1.0, 'Alexander law fast-phase pan must restore regular 1.0x (2.5 Hz)');

// Vertex-distance lens power shift when glasses slide down nose (0..14 mm)
assert.equal(computeEffectiveLensPower(13.0, 0.0), 13.0, 'zero slide preserves nominal +13 D');
const slidPlus = computeEffectiveLensPower(13.0, 1.0);
assert.ok(slidPlus > 15.8 && slidPlus < 16.0, `+13 D slipped 14 mm expected ~+15.89 D, got ${slidPlus}`);
const slidNear = computeEffectiveLensPower(17.0, 1.0);
assert.ok(slidNear > 22.1 && slidNear < 22.5, `+17 D near half slipped 14 mm expected ~+22.31 D (10cm loupe), got ${slidNear}`);
const slidMinus = computeEffectiveLensPower(-4.0, 1.0);
assert.ok(slidMinus > -3.85 && slidMinus < -3.75, `-4 D slipped 14 mm expected ~-3.79 D, got ${slidMinus}`);

// Posture neck constraints & lower-right-lens held alignment
assert.equal(computeMaxYaw('standing', 0), Infinity, 'standing allows full 360 deg turn');
assert.ok(computeMaxYaw('seated', 0) < Math.PI && computeMaxYaw('seated', 0) > 1.2, 'seated yaw must constrain neck/body');
assert.ok(computeMaxYaw('seated', 1) < computeMaxYaw('seated', 0) * 0.6, 'deep lean must constrain neck yaw more tightly than upright');

const heldGlasses = computeHeldRestOffset(0.21, true);
assert.ok(heldGlasses.x > 0.065 && heldGlasses.y < -0.035, 'held object with glasses must center in lower right lens');
const heldClose = computeHeldRestOffset(0.14, true);
assert.ok(
  Math.hypot(heldClose.x - 0.029, heldClose.y) < 0.055,
  'held object pulled to 14cm must stay inside OD monocular occlusion cone'
);
const heldBare = computeHeldRestOffset(0.21, false);
assert.equal(heldBare.x, 0.029, 'held object without glasses must align to bare OD pupil');
assert.equal(heldBare.y, 0, 'held object without glasses must align to OD pupil height');

// 5. Validate src/state.js: updateSimState (starts Focused, two-speed fatigue, Focus suppression, occlusion, closed eyes)
const stRelaxed = createSimState();
assert.equal(stRelaxed.focusing, true, 'Vuarbit 1994 must start in Focused mode');
assert.equal(stRelaxed.focusStrength, 1, 'initial focusStrength must start engaged');
stRelaxed.focusing = false;
stRelaxed.focusStrength = 0;
const stFocused = createSimState();
stFocused.focusing = true;
for (let i = 0; i < 60; i++) {
  updateSimState(stRelaxed, 0.05);
  updateSimState(stFocused, 0.05);
}
assert.ok(stRelaxed.fatigue > 0.08, 'fatigue should rise while eyes open');
assert.ok(stFocused.fatigue > stRelaxed.fatigue + 0.005, 'Focus effort must build fatigue faster');
assert.ok(stFocused.focusStrength > 0.8, 'Focus effort should engage strongly at low fatigue');
assert.ok(stRelaxed.mlnIntensity >= 0.12, `unfocused baseline MLN should be clearly present, got ${stRelaxed.mlnIntensity}`);
assert.ok(
  stFocused.mlnIntensity < stRelaxed.mlnIntensity * 0.5,
  `Focus effort must curb baseline MLN (${stRelaxed.mlnIntensity} -> ${stFocused.mlnIntensity})`
);
assert.equal(stRelaxed.activeZone, 'distance');

// Reserve-depletion -> tipping-point crash curve
assert.equal(computeDecompensation(0.35), 0, 'symptoms must stay masked while compensatory reserve holds (<0.58)');
assert.ok(computeDecompensation(0.85) > 0.7, 'symptoms must spike sharply past tipping point');
assert.equal(computeDecompensation(1.0), 1, 'full exhaustion must reach 1.0 decompensation');

// Asymmetric monocular occlusion triggers MLN; symmetric bilateral occlusion does NOT
const stUnoccluded = createSimState();
stUnoccluded.fatigue = 0.2;
updateSimState(stUnoccluded, 0.016);

const stMonocular = createSimState();
stMonocular.fatigue = 0.2;
stMonocular.occlOS = 1.0;
stMonocular.occlOD = 0.0;
updateSimState(stMonocular, 0.016);
assert.equal(stMonocular.occlusionLevel, 1.0);
assert.ok(
  stMonocular.mlnIntensity > stUnoccluded.mlnIntensity + 0.5,
  `Monocular occlusion must ramp MLN strongly (${stUnoccluded.mlnIntensity} -> ${stMonocular.mlnIntensity})`
);

const stBilateral = createSimState();
stBilateral.fatigue = 0.2;
stBilateral.occlOS = 1.0;
stBilateral.occlOD = 1.0;
updateSimState(stBilateral, 0.016);
assert.equal(stBilateral.occlusionLevel, 0.0, 'Symmetric bilateral occlusion must not trigger monocular MLN');

// Near, uncorrected, normal compare, and closed zones + fatigue recovery
stRelaxed.focusDistM = 0.36;
updateSimState(stRelaxed, 0.016);
assert.equal(stRelaxed.activeZone, 'near');

stRelaxed.glassesOn = false;
updateSimState(stRelaxed, 0.016);
assert.equal(stRelaxed.activeZone, 'uncorrected');

stRelaxed.compareNormal = true;
updateSimState(stRelaxed, 0.016);
assert.equal(stRelaxed.activeZone, 'normal');
stRelaxed.compareNormal = false;

stRelaxed.eyesClosed = true;
stRelaxed.fatigue = 0.8;
for (let i = 0; i < 100; i++) {
  updateSimState(stRelaxed, 0.05);
}
assert.ok(stRelaxed.eyelidClose > 0.99, `eyelidClose should approach 1, got ${stRelaxed.eyelidClose}`);
assert.equal(stRelaxed.activeZone, 'closed');
assert.equal(stRelaxed.focusDistM, 0, 'focusDistM must be 0 when eyes are closed');
assert.ok(stRelaxed.fatigue < 0.8 && stRelaxed.fatigue >= 0.05, `fatigue should recover toward 0.05 when closed, got ${stRelaxed.fatigue}`);

// 6. Validate src/state.js: heldRot and updateHeldRotation
const stHeld = createSimState();
assert.deepEqual(stHeld.heldRot, { yaw: 0, pitch: 0 }, 'initial heldRot must be { yaw: 0, pitch: 0 }');

const returnedRot = updateHeldRotation(stHeld.heldRot, 100, -50);
assert.equal(returnedRot, stHeld.heldRot, 'updateHeldRotation must mutate and return heldRot');
assert.ok(Math.abs(stHeld.heldRot.yaw - 0.75) < 1e-9, `expected yaw 0.75, got ${stHeld.heldRot.yaw}`);
assert.ok(Math.abs(stHeld.heldRot.pitch - (-0.375)) < 1e-9, `expected pitch -0.375, got ${stHeld.heldRot.pitch}`);

// Pitch clamp [-1.45, 1.45]
updateHeldRotation(stHeld.heldRot, 0, 1000);
assert.equal(stHeld.heldRot.pitch, 1.45, 'pitch must clamp to +1.45');
updateHeldRotation(stHeld.heldRot, 0, -1000);
assert.equal(stHeld.heldRot.pitch, -1.45, 'pitch must clamp to -1.45');

// Yaw wrap [-Math.PI, Math.PI]
stHeld.heldRot.yaw = Math.PI - 0.1;
updateHeldRotation(stHeld.heldRot, 100, 0); // +0.75 -> wraps past +PI
assert.ok(stHeld.heldRot.yaw >= -Math.PI && stHeld.heldRot.yaw <= Math.PI, `wrapped yaw out of range: ${stHeld.heldRot.yaw}`);
assert.ok(Math.abs(stHeld.heldRot.yaw - (Math.PI - 0.1 + 0.75 - Math.PI * 2)) < 1e-9);

stHeld.heldRot.yaw = -Math.PI + 0.1;
updateHeldRotation(stHeld.heldRot, -100, 0); // -0.75 -> wraps past -PI
assert.ok(stHeld.heldRot.yaw >= -Math.PI && stHeld.heldRot.yaw <= Math.PI, `wrapped yaw out of range: ${stHeld.heldRot.yaw}`);
assert.ok(Math.abs(stHeld.heldRot.yaw - (-Math.PI + 0.1 - 0.75 + Math.PI * 2)) < 1e-9);

// Non-finite input safety
const snapYaw = stHeld.heldRot.yaw;
const snapPitch = stHeld.heldRot.pitch;
updateHeldRotation(stHeld.heldRot, NaN, Infinity);
assert.equal(stHeld.heldRot.yaw, snapYaw, 'non-finite dx must be ignored');
assert.equal(stHeld.heldRot.pitch, snapPitch, 'non-finite dy must be ignored');
updateHeldRotation(stHeld.heldRot, -Infinity, NaN, NaN);
assert.equal(stHeld.heldRot.yaw, snapYaw, 'non-finite dx/sensitivity must leave yaw finite and unchanged');
assert.equal(stHeld.heldRot.pitch, snapPitch, 'non-finite dy/sensitivity must leave pitch finite and unchanged');

// 7. Validate src/personas.js & persona/settings integration in src/state.js
assert.equal(QUALITY_PRESETS.high.dprCap, 1.75);
assert.equal(QUALITY_PRESETS.balanced.dprCap, 1.25);
assert.equal(QUALITY_PRESETS.performance.dprCap, 1.0);

assert.equal(PERSONAS.length, 12, 'must define exactly 12 clinical presets');
const expectedPersonas = {
  vuarbit_1994: { shortName: 'Vuarbit 1994', lensProfile: 'aphakic_bifocal', vodAcuity: 0.70, vosAcuity: 0.15, mlnScale: 1.0 },
  normal: { shortName: 'Normal Vision', lensProfile: 'none', vodAcuity: 1.0, vosAcuity: 1.0, mlnScale: 0.0 },
  glaucoma: { shortName: 'Glaucoma', lensProfile: 'none', vodAcuity: 0.90, vosAcuity: 0.85, glaucoma: 0.65 },
  amd: { shortName: 'Wet AMD', lensProfile: 'none', vodAcuity: 0.45, vosAcuity: 0.40, amd: 0.70 },
  cataracts: { shortName: 'Cataracts', lensProfile: 'none', vodAcuity: 0.40, vosAcuity: 0.35, cataract: 0.72 },
  diabetic_retinopathy: { shortName: 'Diabetic Retinop.', lensProfile: 'none', diabeticRetinopathy: 0.65 },
  retinitis_pigmentosa: { shortName: 'Retinitis Pigm.', lensProfile: 'none', retinitisPigmentosa: 0.65 },
  albinism: { shortName: 'Ocular Albinism', lensProfile: 'none', vodAcuity: 0.25, vosAcuity: 0.25, albinism: 0.75, mlnScale: 0.0 },
  deuteranopia: { shortName: 'Deuteranopia', lensProfile: 'none', vodAcuity: 1.0, vosAcuity: 1.0, cvdType: 'deutan', cvdSeverity: 1.0 },
  myopia: { shortName: 'Myopia (-4 D)', lensProfile: 'single_vision', lensPowerD: -4.0, myopiaD: 4.0 },
  astigmatism: { shortName: 'Astigmatism', lensProfile: 'single_vision', astigmatismD: 2.75, astigmatismAxisDeg: 135, lensCylD: 2.75, lensAxisDeg: 135 },
  presbyopia: { shortName: 'Presbyopia', lensProfile: 'progressive', nearAddD: 2.5, presbyopiaD: 2.75 },
};
for (const [id, checks] of Object.entries(expectedPersonas)) {
  const persona = getPersonaById(id);
  assert.ok(persona, `missing persona ${id}`);
  assert.equal(persona.shortName, checks.shortName, `persona ${id} shortName mismatch`);
  for (const [k, v] of Object.entries(checks)) {
    if (k !== 'shortName') {
      assert.equal(persona.settings[k], v, `persona ${id} setting ${k} mismatch`);
    }
  }
  for (const specKey of Object.keys(SETTING_SPECS)) {
    assert.ok(Object.hasOwn(persona.settings, specKey), `persona ${id} missing setting ${specKey}`);
  }
}
assert.equal(getPersonaById('nonexistent'), undefined);

// Sanitization, clamping, invalid/NaN/unknown-key rejection
const defaults = createDefaultVisualSettings();
assert.deepEqual(sanitizeVisualSettings(null), defaults);
const sanitized = sanitizeVisualSettings({
  lensProfile: 'invalid_lens',
  lensPowerD: 99,
  nearAddD: -5,
  dominantEye: 'OS',
  vodAcuity: NaN,
  vosAcuity: '0.35',
  diplopiaH: Infinity,
  diplopiaV: null,
  mlnScale: '',
  glaucoma: false,
  cvdType: 'protan',
  cvdSeverity: 2.5,
  unknownHack: 'drop_me',
});
assert.equal(sanitized.lensProfile, defaults.lensProfile, 'invalid enum must fall back to default');
assert.equal(sanitized.lensPowerD, 18, 'lensPowerD must clamp to max 18');
assert.equal(sanitized.nearAddD, 0, 'nearAddD must clamp to min 0');
assert.equal(sanitized.dominantEye, 'OS', 'valid enum must be preserved');
assert.equal(sanitized.vodAcuity, defaults.vodAcuity, 'NaN must fall back to default');
assert.equal(sanitized.vosAcuity, 0.35, 'numeric string must coerce cleanly');
assert.equal(sanitized.diplopiaH, defaults.diplopiaH, 'Infinity must fall back to default');
assert.equal(sanitized.diplopiaV, defaults.diplopiaV, 'null must fall back to default');
assert.equal(sanitized.mlnScale, defaults.mlnScale, 'empty string must fall back to default');
assert.equal(sanitized.glaucoma, defaults.glaucoma, 'boolean must fall back to default');
assert.equal(sanitized.cvdType, 'protan');
assert.equal(sanitized.cvdSeverity, 1.0, 'cvdSeverity must clamp to max 1.0');
assert.equal(Object.hasOwn(sanitized, 'unknownHack'), false, 'unknown keys must be ignored');

// computeAcuityBlurUV MAR calibration, shader cutoff clearance & Snellen formatting
assert.equal(computeAcuityBlurUV(1.0), 0);
assert.equal(computeAcuityBlurUV(2.0), 0);
assert.equal(computeAcuityBlurUV(NaN), 0);
assert.ok(computeAcuityBlurUV(0.05) >= 0.025 && computeAcuityBlurUV(0.05) <= 0.034, '0.05 (20/400) must produce strong blur');
assert.equal(computeAcuityBlurUV(0.01), computeAcuityBlurUV(0.05));
const blur006 = computeAcuityBlurUV(0.06);
const blur015 = computeAcuityBlurUV(0.15);
const blur040 = computeAcuityBlurUV(0.40);
const blur070 = computeAcuityBlurUV(0.70);
assert.ok(blur070 > 0.0005, `VOD 0.70 blur (${blur070}) must exceed shader 0.00012 cutoff`);
assert.ok(
  blur006 > blur015 && blur015 > blur040 && blur040 > blur070 && blur070 > 0,
  'computeAcuityBlurUV must be strictly decreasing with higher acuity'
);
assert.equal(formatSnellenAcuity(1.0), '1.00 (20/20)');
assert.equal(formatSnellenAcuity(0.70), '0.70 (20/29)');
assert.equal(formatSnellenAcuity(0.05), '0.05 (20/400)');

// dominantEye === 'OS' mirroring & custom diplopia offset
const heldOD = computeHeldRestOffset(0.21, true, 'OD');
const heldOS = computeHeldRestOffset(0.21, true, 'OS');
assert.equal(heldOS.x, -heldOD.x, 'OS dominant eye must mirror X held offset');
assert.equal(heldOS.y, heldOD.y, 'OS dominant eye must preserve Y held offset');
assert.equal(heldOS.z, heldOD.z, 'OS dominant eye must preserve Z held offset');
assert.equal(computeHeldRestOffset(0.21, false, 'OS').x, -0.029, 'bare OS pupil must mirror to -0.029m');

assert.deepEqual(computeDiplopiaOffsetDeg(0.375, { diplopiaH: 0, diplopiaV: 0 }), { dxDeg: 0, dyDeg: 0 });
assert.deepEqual(computeDiplopiaOffsetDeg(0.375, { diplopiaH: 2.2, diplopiaV: -0.9 }), { dxDeg: 2.2, dyDeg: -0.9 });

// createSimState persona defaults + applyPersona + updateVisualSetting
const stPersona = createSimState();
assert.equal(stPersona.personaId, 'vuarbit_1994');
assert.equal(stPersona.settingsOpen, false);
assert.equal(stPersona.qualityPreset, 'high');
assert.deepEqual(stPersona.settings, defaults);

assert.equal(applyPersona(stPersona, 'does_not_exist'), false);
assert.equal(stPersona.personaId, 'vuarbit_1994');

stPersona.compareNormal = true;
stPersona.fatigue = 0.72;
stPersona.focusStrength = 0.9;
assert.equal(applyPersona(stPersona, 'amd'), true);
assert.equal(stPersona.personaId, 'amd');
assert.equal(stPersona.compareNormal, false);
assert.equal(stPersona.fatigue, 0.08);
assert.equal(stPersona.focusStrength, 0);
assert.equal(stPersona.glassesOn, false);
assert.equal(stPersona.settings.amd, 0.70);

assert.equal(updateVisualSetting(stPersona, 'notASetting', 123), undefined);
assert.equal(stPersona.personaId, 'amd', 'unknown setting key must not change personaId');

assert.equal(updateVisualSetting(stPersona, 'lensProfile', 'aphakic_bifocal'), 'aphakic_bifocal');
assert.equal(stPersona.personaId, 'custom');
assert.equal(stPersona.glassesOn, true, 'lensProfile aphakic_bifocal must sync glassesOn=true');
assert.equal(updateVisualSetting(stPersona, 'lensPowerD', 99), 18);
assert.equal(stPersona.settings.lensPowerD, 18);
assert.equal(updateVisualSetting(stPersona, 'lensProfile', 'none'), 'none');
assert.equal(stPersona.glassesOn, false, 'lensProfile none must sync glassesOn=false');

// Normal vision: zero MLN (even occluded) and fatigue relaxes toward 0.05
const stNormal = createSimState();
applyPersona(stNormal, 'normal');
stNormal.fatigue = 0.4;
stNormal.occlOS = 1.0;
for (let i = 0; i < 60; i++) {
  updateSimState(stNormal, 0.05);
}
assert.equal(stNormal.mlnIntensity, 0, 'normal vision must have 0 MLN even under monocular occlusion');
assert.ok(stNormal.fatigue < 0.4 && stNormal.fatigue >= 0.05, `normal vision fatigue must relax toward 0.05, got ${stNormal.fatigue}`);
assert.equal(stNormal.activeZone, 'emmetropic');

// Albinism infantile nystagmus drive (starts Focused when suppression applies; relaxing raises MLN drive)
const stAlb = createSimState();
applyPersona(stAlb, 'albinism');
assert.equal(stAlb.focusing, true, 'albinism preset has suppression mechanics so starts Focused');
stAlb.focusing = false;
stAlb.focusStrength = 0;
updateSimState(stAlb, 0.016);
const albUnfocused = stAlb.mlnIntensity;
assert.equal(stAlb.mlnOnlyIntensity, 0, 'albinism preset must not inject MLN jerk drive');
assert.ok(albUnfocused > 0.25, `albinism must drive infantile nystagmus, got ${albUnfocused}`);
stAlb.focusing = true;
for (let i = 0; i < 30; i++) {
  updateSimState(stAlb, 0.05);
}
assert.ok(stAlb.mlnIntensity < albUnfocused, 'focus effort must modestly damp albinism nystagmus');

// Suppression gating: non-aphakic conditions must NOT suffer +13 D uncorrected glasses fatigue penalty
assert.equal(hasSuppressionMechanics(getPersonaById('vuarbit_1994').settings), true);
assert.equal(hasSuppressionMechanics(getPersonaById('albinism').settings), true);
assert.equal(hasSuppressionMechanics(getPersonaById('normal').settings), false);
assert.equal(hasSuppressionMechanics(getPersonaById('glaucoma').settings), false);
assert.equal(hasSuppressionMechanics(getPersonaById('amd').settings), false);
assert.equal(hasSuppressionMechanics(getPersonaById('cataracts').settings), false);
assert.equal(hasSuppressionMechanics(getPersonaById('deuteranopia').settings), false);

const stGlauc = createSimState();
applyPersona(stGlauc, 'glaucoma');
stGlauc.fatigue = 0.25;
stGlauc.focusing = true;
for (let i = 0; i < 40; i++) {
  updateSimState(stGlauc, 0.05);
}
assert.ok(stGlauc.fatigue < 0.25, `glaucoma must relax fatigue rather than drain aphakic strain, got ${stGlauc.fatigue}`);
assert.equal(stGlauc.focusStrength, 0, 'focusStrength must stay 0 when suppression mechanics do not apply');

// Opening settings drawer pauses fatigue accumulation; applyPersona clears focusing & eyesClosed
const stPaused = createSimState();
stPaused.focusing = true;
stPaused.settingsOpen = true;
const fatigueBefore = stPaused.fatigue;
for (let i = 0; i < 40; i++) {
  updateSimState(stPaused, 0.05);
}
assert.equal(stPaused.fatigue, fatigueBefore, 'settingsOpen must freeze fatigue drain');

stPaused.eyesClosed = true;
stPaused.eyelidClose = 1;
applyPersona(stPaused, 'normal');
assert.equal(stPaused.focusing, false, 'applyPersona must clear focusing');
assert.equal(stPaused.eyesClosed, false, 'applyPersona must clear eyesClosed');

// Flipping dominantEye mirrors currently held object X immediately
const stFlip = createSimState();
stFlip.holding = 'pencil';
stFlip.heldOffset = computeHeldRestOffset(0.22, true, 'OD');
const origX = stFlip.heldOffset.x;
updateVisualSetting(stFlip, 'dominantEye', 'OS');
assert.equal(stFlip.heldOffset.x, -origX, 'dominantEye OS swap must mirror active heldOffset.x');

// Refractive presets start uncorrected (glassesOn=false) so user sees condition, then Z toggles glasses; negative minus lenses clamp cleanly
const stMyo = createSimState();
applyPersona(stMyo, 'myopia');
assert.equal(stMyo.glassesOn, false, 'myopia preset starts uncorrected so Z demonstrates minus glasses');
assert.equal(stMyo.settings.lensProfile, 'single_vision');
assert.equal(stMyo.settings.lensPowerD, -4.0);
assert.equal(updateVisualSetting(stMyo, 'lensPowerD', -20), -12.0, 'lensPowerD must clamp to min -12 D');
assert.equal(updateVisualSetting(stMyo, 'lensProfile', 'progressive'), 'progressive');
assert.equal(stMyo.glassesOn, true, 'selecting progressive lens profile must put glasses on');
assert.equal(stMyo.settings.nearAddD, 2.5, 'switching to progressive with 0 add must default nearAddD to +2.5 D');

const stBif = createSimState();
applyPersona(stBif, 'myopia');
assert.equal(updateVisualSetting(stBif, 'lensProfile', 'bifocal'), 'bifocal');
assert.equal(stBif.glassesOn, true, 'switching to bifocal must put glasses on');
assert.equal(stBif.settings.nearAddD, 2.5, 'switching to bifocal with 0 add must default nearAddD to +2.5 D');

const stPresby = createSimState();
applyPersona(stPresby, 'presbyopia');
assert.equal(stPresby.glassesOn, false, 'presbyopia starts uncorrected');
stPresby.glassesOn = true;
stPresby.pitch = -0.4;
updateSimState(stPresby, 0.016);
assert.equal(stPresby.activeZone, 'near', 'progressive lens looking down must report near zone');

// Time-of-Day & Ceiling Lights ambient lux ordering, cycling + persona independence
assert.deepEqual(Object.keys(TIME_OF_DAY_PRESETS), ['sunny', 'overcast', 'dusk', 'night']);
assert.equal(cycleTimeOfDay('sunny'), 'overcast');
assert.equal(cycleTimeOfDay('overcast'), 'dusk');
assert.equal(cycleTimeOfDay('dusk'), 'night');
assert.equal(cycleTimeOfDay('night'), 'sunny');
assert.equal(cycleTimeOfDay('invalid'), 'sunny');
const luxSunnyOn = computeAmbientLight('sunny', true);
const luxSunnyOff = computeAmbientLight('sunny', false);
const luxNightOn = computeAmbientLight('night', true);
const luxDuskOff = computeAmbientLight('dusk', false);
const luxNightOff = computeAmbientLight('night', false);
assert.ok(
  luxSunnyOn === 1.0 && luxSunnyOn > luxSunnyOff && luxSunnyOff > luxNightOn && luxNightOn > luxDuskOff && luxDuskOff > luxNightOff && luxNightOff > 0,
  `ambient light must decrease monotonically from sunny+on -> sunny+off -> night+on -> dusk+off -> night+off (${luxSunnyOn}, ${luxSunnyOff}, ${luxNightOn}, ${luxDuskOff}, ${luxNightOff})`
);

// Retinal light adaptation exposure: lower in bright sun, higher in dim rooms, finite on bad input
const expSunny = computeAdaptedExposure(luxSunnyOn);
const expNightOn = computeAdaptedExposure(luxNightOn);
const expNightOff = computeAdaptedExposure(luxNightOff);
assert.ok(expSunny < expNightOn && expNightOn < expNightOff, `adapted exposure must rise as light drops (${expSunny}, ${expNightOn}, ${expNightOff})`);
assert.equal(computeAdaptedExposure(NaN), expSunny, 'non-finite ambient light must fall back cleanly');

// Every Time-of-Day preset defines HDR sky & window portal fields
for (const [id, p] of Object.entries(TIME_OF_DAY_PRESETS)) {
  assert.ok(typeof p.skyTop === 'string' && p.skyGain > 0, `${id} preset must define skyTop and positive skyGain`);
  assert.ok(typeof p.winColor === 'string' && p.winInt > 0, `${id} preset must define winColor and positive winInt`);
}

const stEnv = createSimState();
assert.equal(stEnv.timeOfDay, 'sunny');
assert.equal(stEnv.lightsOn, true);
stEnv.timeOfDay = 'night';
stEnv.lightsOn = false;
updateSimState(stEnv, 0.016);
assert.equal(stEnv.ambientLight, luxNightOff);
applyPersona(stEnv, 'retinitis_pigmentosa');
assert.equal(stEnv.timeOfDay, 'night', 'switching preset must preserve room timeOfDay');
assert.equal(stEnv.lightsOn, false, 'switching preset must preserve room lightsOn');

// Frame customization (shape & color) enum validation and persona reset
assert.ok(FRAME_SHAPES.includes('auto') && FRAME_SHAPES.includes('rimless'));
assert.ok(FRAME_COLORS.includes('auto') && FRAME_COLORS.includes('gold'));
const sanitizedFrame = sanitizeVisualSettings({ frameShape: 'rimless', frameColor: 'gold' });
assert.equal(sanitizedFrame.frameShape, 'rimless');
assert.equal(sanitizedFrame.frameColor, 'gold');
const invalidFrame = sanitizeVisualSettings({ frameShape: 'hexagon', frameColor: 'neon_pink' });
assert.equal(invalidFrame.frameShape, 'auto', 'invalid frameShape must fall back to auto');
assert.equal(invalidFrame.frameColor, 'auto', 'invalid frameColor must fall back to auto');

const stFrame = createSimState();
assert.equal(stFrame.settings.frameShape, 'auto');
assert.equal(stFrame.settings.frameColor, 'auto');
assert.equal(updateVisualSetting(stFrame, 'frameShape', 'semi_rimless'), 'semi_rimless');
assert.equal(updateVisualSetting(stFrame, 'frameColor', 'burgundy'), 'burgundy');
assert.equal(stFrame.personaId, 'custom');
applyPersona(stFrame, 'vuarbit_1994');
assert.equal(stFrame.settings.frameShape, 'auto', 'applyPersona must restore auto frameShape');
assert.equal(stFrame.settings.frameColor, 'auto', 'applyPersona must restore auto frameColor');

// Bifocal nearAddD=0 stays distance even when looking down
const stNoAdd = createSimState();
updateVisualSetting(stNoAdd, 'nearAddD', 0);
stNoAdd.pitch = -0.5;
updateSimState(stNoAdd, 0.016);
assert.equal(stNoAdd.activeZone, 'distance', 'zero nearAddD must not enter near bifocal zone');

// Glasses nose-slip increases while worn (faster looking down) and resets when glasses removed or persona switched
const stSlide = createSimState();
stSlide.pitch = -0.6;
for (let i = 0; i < 60; i++) {
  updateSimState(stSlide, 0.05);
}
assert.ok(stSlide.glassesSlide > 0.04 && stSlide.glassesSlide < 0.12, `aphakic glasses pitched down should slide gently (~55s full), got ${stSlide.glassesSlide}`);
stSlide.glassesOn = false;
updateSimState(stSlide, 0.016);
assert.equal(stSlide.glassesSlide, 0, 'removing glasses must reset glassesSlide');

// Sub-15 cm binocular convergence strain builds fatigue faster than normal distance; ultra-close held triggers stenopeic squint
const stNearBinoc = createSimState();
stNearBinoc.focusDistM = 0.12;
stNearBinoc.holding = 'pencil';
stNearBinoc.heldOffset = { x: 0.029, y: 0, z: 0.10 };
const stFarBinoc = createSimState();
stFarBinoc.focusDistM = 3.8;
for (let i = 0; i < 40; i++) {
  updateSimState(stNearBinoc, 0.05);
  updateSimState(stFarBinoc, 0.05);
}
assert.ok(stNearBinoc.fatigue > stFarBinoc.fatigue + 0.005, 'sub-15 cm binocular viewing must add convergence strain');
assert.ok(stNearBinoc.squint > 0.5, `ultra-close held object must trigger reflex stenopeic squint, got ${stNearBinoc.squint}`);

// Focused MLN produces irregular cycle-to-cycle variation (all finite) with C0 continuity across beat boundaries
const mlnFocC0 = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 2.5, 0.0, 1.0, 0.0, 1.0, 1, 0.0);
const mlnFocC1 = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 1.0 / 2.5, 2.5, 0.0, 1.0, 0.0, 1.0, 1, 0.0);
const mlnBeforeBoundary = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.9999 / 2.5, 2.5, 0.0, 1.0, 0.0, 1.0, 1, 0.0);
const mlnAfterBoundary = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 1.0001 / 2.5, 2.5, 0.0, 1.0, 0.0, 1.0, 1, 0.0);
assertFiniteNumber(mlnFocC0.dxDeg, 'mlnFocC0.dxDeg');
assertFiniteNumber(mlnFocC1.dxDeg, 'mlnFocC1.dxDeg');
assert.notEqual(mlnFocC0.dxDeg, mlnFocC1.dxDeg, 'focused MLN beats should vary irregularly across cycles');
assert.ok(
  Math.abs(mlnBeforeBoundary.dxDeg - mlnAfterBoundary.dxDeg) < 0.02,
  `focused MLN must stay continuous across beat boundary (${mlnBeforeBoundary.dxDeg} -> ${mlnAfterBoundary.dxDeg})`
);

// Resting (eyesClosed) ignores monocular occlusion and keeps Focused-like calm MLN while glasses still obey gravity
const stRest = createSimState();
stRest.eyesClosed = true;
stRest.occlOD = 1.0;
stRest.occlOS = 0.0;
stRest.pitch = -0.6;
for (let i = 0; i < 40; i++) {
  updateSimState(stRest, 0.05);
}
assert.equal(stRest.occlusionLevel, 0, 'closed eyelids must ignore asymmetric monocular occlusion');
assert.ok(stRest.mlnOnlyIntensity < 0.25, `closed-eye MLN must stay Focused-like calm, got ${stRest.mlnOnlyIntensity}`);
assert.ok(stRest.glassesSlide > 0.02, 'glasses pitched down should still obey gravity while resting');

// Pinning glasses (Space hold) prevents gravity slide
const stPin = createSimState();
stPin.pitch = -0.6;
stPin.glassesPinned = true;
for (let i = 0; i < 40; i++) {
  updateSimState(stPin, 0.05);
}
assert.equal(stPin.glassesSlide, 0, 'pinned glasses must not slide down while craning');

// applyPersona resets glassesSlide, glassesPinned, squint & restores Focused on Vuarbit 1994
stNearBinoc.glassesSlide = 0.8;
stNearBinoc.glassesPinned = true;
applyPersona(stNearBinoc, 'vuarbit_1994');
assert.equal(stNearBinoc.glassesSlide, 0, 'applyPersona must reset glassesSlide');
assert.equal(stNearBinoc.glassesPinned, false, 'applyPersona must reset glassesPinned');
assert.equal(stNearBinoc.squint, 0, 'applyPersona must reset squint');
assert.equal(stNearBinoc.focusing, true, 'applyPersona vuarbit_1994 must start Focused');

// Shared toggleCompareNormal (V) and toggleGlasses (Z) helpers keep keyboard & drawer behavior identical
const stToggle = createSimState();
stToggle.fatigue = 0.6;
stToggle.focusing = false;
stToggle.focusStrength = 0;
assert.equal(toggleCompareNormal(stToggle), true, 'toggleCompareNormal enters Normal Compare');
assert.equal(stToggle.fatigue, 0.05, 'toggleCompareNormal resets fatigue');
assert.equal(toggleCompareNormal(stToggle), false, 'toggleCompareNormal exits Normal Compare');
assert.equal(stToggle.focusing, true, 'exiting Normal Compare restores Focused on suppression persona');
assert.equal(stToggle.focusStrength, 1);

stToggle.glassesSlide = 0.7;
assert.equal(toggleGlasses(stToggle), false, 'toggleGlasses turns glasses off');
assert.equal(toggleGlasses(stToggle), true, 'toggleGlasses turns glasses back on');
assert.equal(stToggle.glassesSlide, 0, 'putting glasses on resets slide');
assert.ok(stToggle.glassesBounce < 0, 'putting glasses on sets tactile bounce');

// 8. Validate P3/P4 Scene Registry & Exam Room Clinical Calibration Math
assert.equal(SCENES.length, 3, 'must register 3 scenes (classroom, exam_room, car_passenger)');
assert.equal(getSceneById('classroom')?.defaultMode, 'standing');
assert.equal(getSceneById('exam_room')?.defaultMode, 'seated');
assert.equal(getSceneById('car_passenger')?.defaultMode, 'seated');
assert.equal(getSceneById('car_passenger')?.seatedOnly, true);
assert.equal(getSceneById('nonexistent_scene'), undefined);

const stScene = createSimState();
assert.equal(stScene.sceneId, 'classroom', 'initial scene must be 1994 classroom');
assert.equal(stScene.glareLightOn, true, 'exam glare lamp starts enabled');
stScene.sceneId = 'exam_room';
stScene.glareLightOn = false;
applyPersona(stScene, 'amd');
assert.equal(stScene.sceneId, 'exam_room', 'applyPersona must preserve active sceneId');
assert.equal(stScene.glareLightOn, false, 'applyPersona must preserve glareLightOn');

// ETDRS 4.00 m angular calibration (5 arcmin for 20/20 -> 5.818 mm; 50 arcmin for 20/200 -> 58.18 mm)
assert.equal(EXAM_VIEW_DISTANCE_M, 4.0);
const h20_20 = computeOptotypeHeightM(1.0, 4.0);
const h20_200 = computeOptotypeHeightM(0.10, 4.0);
assert.ok(Math.abs(h20_20 - 0.0058178) < 1e-5, `20/20 @ 4m expected 5.818 mm, got ${h20_20 * 1000} mm`);
assert.ok(Math.abs(h20_200 - 0.05818) < 2e-4, `20/200 @ 4m expected 58.18 mm, got ${h20_200 * 1000} mm`);
assert.equal(ETDRS_ROWS.length, 12, 'ETDRS chart must define 12 logMAR rows (20/200..20/16)');
for (let i = 0; i < ETDRS_ROWS.length; i++) {
  const row = ETDRS_ROWS[i];
  assert.equal(row.letters.length, 5, `ETDRS row ${row.snellen} must have 5 Sloan letters`);
  for (const ch of row.letters) {
    const glyph = SLOAN_GLYPHS[ch];
    assert.ok(glyph && glyph.length === 5 && glyph.every((r) => r.length === 5), `invalid 5x5 Sloan glyph ${ch}`);
  }
  if (i > 0) {
    assert.ok(row.heightM < ETDRS_ROWS[i - 1].heightM, 'ETDRS letter heights must strictly decrease down chart');
  }
}

// Pelli-Robson 16 triplets: 0.00 -> 2.25 logCS in 0.15 steps, strictly decreasing Weber contrast & rising sRGB ink
assert.equal(PELLI_ROBSON_TRIPLETS.length, 16);
assert.equal(PELLI_ROBSON_TRIPLETS[0].logCS, 0.0);
assert.equal(PELLI_ROBSON_TRIPLETS[15].logCS, 2.25);
assert.ok(Math.abs(computeWeberContrast(0) - 1.0) < 1e-9);
assert.ok(Math.abs(computeWeberContrast(1.0) - 0.1) < 1e-9);
assert.equal(computePelliRobsonInkByte(0.0, 242), 0);
for (let i = 1; i < PELLI_ROBSON_TRIPLETS.length; i++) {
  assert.ok(
    PELLI_ROBSON_TRIPLETS[i].weberContrast < PELLI_ROBSON_TRIPLETS[i - 1].weberContrast,
    'Pelli-Robson Weber contrast must strictly decrease'
  );
  assert.ok(
    PELLI_ROBSON_TRIPLETS[i].inkByte >= PELLI_ROBSON_TRIPLETS[i - 1].inkByte && PELLI_ROBSON_TRIPLETS[i].inkByte <= 242,
    'Pelli-Robson sRGB ink byte must rise monotonically toward chart background'
  );
}

// Amsler grid angular calibration (~19-20 deg total field, ~1 deg/square at 30 cm)
const amslerDeg = computeAmslerAngularDeg(AMSLER_SPEC.gridSizeM, AMSLER_SPEC.testDistM);
const amslerWallDeg = computeAmslerAngularDeg(AMSLER_SPEC.wallGridSizeM, AMSLER_SPEC.wallTestDistM);
assert.ok(amslerDeg > 18.5 && amslerDeg < 19.5, `handheld Amsler @ 30cm expected ~18.92 deg, got ${amslerDeg}`);
assert.ok(Math.abs(amslerDeg - amslerWallDeg) < 0.05, 'wall Amsler must match handheld 20-deg angular geometry');

// Jaeger near card M-unit calibration (1 M = 1.454 mm at 1 m)
assert.ok(Math.abs(computeJaegerHeightM(1.0) - 0.0014544) < 1e-5, '1 M print height must equal 1.454 mm');
assert.equal(JAEGER_ROWS.length, 6);
for (let i = 1; i < JAEGER_ROWS.length; i++) {
  assert.ok(JAEGER_ROWS[i].heightM < JAEGER_ROWS[i - 1].heightM, 'Jaeger print rows must strictly decrease J10->J1');
}

// Machado (2009) matrix sync with vision.frag.glsl & Ishihara pseudoisochromatic confusion verification
for (const coeff of ['0.367322', '0.152286', '1.255528', '0.691367']) {
  assert.ok(fragSrc.includes(coeff), `vision.frag.glsl missing Machado matrix coefficient ${coeff}`);
}
assert.equal(Object.keys(MACHADO_CVD_MATRICES).length, 3);
assert.equal(ISHIHARA_PLATES.length, 4);

const plateById = Object.fromEntries(ISHIHARA_PLATES.map((p) => [p.id, p]));
// Control "12" stays strongly visible across Normal + all 3 CVD types
for (const mode of ['none', 'deutan', 'protan', 'tritan']) {
  const fg = applyMachadoCvd(plateById.control.fgMeanLin, mode);
  const bg = applyMachadoCvd(plateById.control.bgMeanLin, mode);
  assert.ok(rgbDistance(fg, bg) > 0.30, `Control Ishihara plate must remain legible under ${mode}`);
}
// Deutan "8" pops in Normal, vanishes identically under Machado Deutanopia
assert.ok(rgbDistance(plateById.deutan.fgMeanLin, plateById.deutan.bgMeanLin) > 0.35);
assert.ok(
  rgbDistance(
    applyMachadoCvd(plateById.deutan.fgMeanLin, 'deutan'),
    applyMachadoCvd(plateById.deutan.bgMeanLin, 'deutan')
  ) < 0.002,
  'Deutan Ishihara plate must collapse along Machado deutan confusion axis'
);
// Protan "6" pops in Normal, vanishes identically under Machado Protanopia
assert.ok(rgbDistance(plateById.protan.fgMeanLin, plateById.protan.bgMeanLin) > 0.35);
assert.ok(
  rgbDistance(
    applyMachadoCvd(plateById.protan.fgMeanLin, 'protan'),
    applyMachadoCvd(plateById.protan.bgMeanLin, 'protan')
  ) < 0.002,
  'Protan Ishihara plate must collapse along Machado protan confusion axis'
);
// Tritan "5" pops in Normal, collapses >5x under Machado Tritanopia
const tritanNormDist = rgbDistance(plateById.tritan.fgMeanLin, plateById.tritan.bgMeanLin);
const tritanCvdDist = rgbDistance(
  applyMachadoCvd(plateById.tritan.fgMeanLin, 'tritan'),
  applyMachadoCvd(plateById.tritan.bgMeanLin, 'tritan')
);
assert.ok(tritanNormDist > 0.45 && tritanCvdDist < 0.095 && tritanNormDist / tritanCvdDist > 5.0,
  `Tritan Ishihara plate must collapse >5x under Machado tritan (${tritanNormDist.toFixed(3)} -> ${tritanCvdDist.toFixed(3)})`
);

// 9. Validate P4 Car Passenger road loop, traffic headway, and day/night glare profiles
assert.ok(CAR_CRUISE_SPEED_MPS > 0 && ONCOMING_CLOSING_SPEED_MPS > CAR_CRUISE_SPEED_MPS);
assert.ok(CAR_FAR_CLIP >= 120, 'outdoor car scene must extend camera far clip past indoor 30m');
assert.equal(wrapLoopZ(ROAD_Z_MIN), ROAD_Z_MIN);
assert.equal(wrapLoopZ(ROAD_Z_MAX), ROAD_Z_MIN, 'exact ROAD_Z_MAX wraps seamlessly to ROAD_Z_MIN');
assert.ok(Math.abs(wrapLoopZ(ROAD_Z_MAX + 5.5) - (ROAD_Z_MIN + 5.5)) < 1e-9);
assert.ok(Math.abs(wrapLoopZ(ROAD_Z_MIN - 4.0) - (ROAD_Z_MAX - 4.0)) < 1e-9);
assert.equal(wrapLoopZ(NaN), ROAD_Z_MIN);

for (let t = 0; t < 20; t += 1.3) {
  const lz = computeLeadCarZ(t);
  assert.ok(lz <= -19.9 && lz >= -26.1, `lead car Z must stay in [-26, -20] m, got ${lz}`);
}

// Friuli curving & rolling road spline tangent invariance + sign coherence with actual curvature
for (const s0 of [0, 42, 95, 170, 240, 315]) {
  const atCar = computeRoadRelativeOffset(0, s0);
  assert.ok(Math.abs(atCar.dx) < 1e-9 && Math.abs(atCar.dy) < 1e-9 && Math.abs(atCar.yaw) < 1e-9,
    'road tangent frame must anchor exact dx=dy=yaw=0 under car wheels');
  assertFiniteNumber(computeRoadHeadingRad(s0), 'roadHeadingRad');
  const steer = computeSteeringWheelAngle(s0);
  assert.ok(steer >= -0.55 && steer <= 0.55, 'steering angle must stay within anatomical clamp');
}
// Left bend (~80-110 m) has negative curvature (curves -X left); right bend (~230-260 m) has positive curvature (+X right)
assert.ok(roadGlobalCurvatureX(90) < 0, 'Friuli left bend at s=90m must curve left (curvature < 0)');
assert.ok(roadGlobalCurvatureX(240) > 0, 'Friuli right bend at s=240m must curve right (curvature > 0)');
assert.ok(computeSteeringWheelAngle(90) > 0, 'left bend must steer counterclockwise (+Z)');
assert.ok(computeSteeringWheelAngle(240) < 0, 'right bend must steer clockwise (-Z)');
// Coherent Friuli signage: curve warnings precede their actual bends
const warnLeft = FRIULI_ROUTE_SIGNS.find((s) => s.kind === 'warning_curve_left');
const warnRight = FRIULI_ROUTE_SIGNS.find((s) => s.kind === 'warning_curve_right');
assert.ok(warnLeft && warnLeft.s < 82, 'left-curve warning sign must precede left bend chevrons');
assert.ok(warnRight && warnRight.s < 226, 'right-curve warning sign must precede right bend chevrons');
assert.ok(FRIULI_ROUTE_SIGNS.some((s) => s.kind === 'hamlet_fagagna') && FRIULI_ROUTE_SIGNS.some((s) => s.kind === 'dir_san_daniele'));

const roadSunny = computeRoadLighting('sunny', true);
const roadOvercast = computeRoadLighting('overcast', true);
const roadDuskOn = computeRoadLighting('dusk', true);
const roadNightOn = computeRoadLighting('night', true);
const roadNightOff = computeRoadLighting('night', false);
assert.equal(roadSunny.sunVisible, true);
assert.ok(roadSunny.sunEmissive > 10, 'sunny road sun disk must exceed HDR HOA threshold');
assert.equal(roadSunny.streetlightsOn, false, 'streetlights stay off in bright sun');
assert.ok(roadNightOn.headlightEmissive > 12 && roadNightOn.taillightEmissive > 6, 'night vehicles must emit strong HDR glare');
assert.ok(roadNightOn.roadRoughness < roadSunny.roadRoughness, 'night/dusk wet road must have lower roughness speculars');
assert.equal(roadNightOn.streetlightsOn, true);
assert.ok(roadNightOn.streetlightEmissive > 8 && roadNightOn.streetlightPoolIntensity > 0);
assert.equal(roadNightOff.streetlightsOn, false, 'L OFF at night must disable streetlights for unlit rural highway');
assert.equal(roadNightOff.streetlightEmissive, 0);
assert.ok(roadNightOff.ownBeamIntensity > 8, 'own car headlights stay ON at night even with rural streetlights OFF');
assert.ok(roadOvercast.wetness > 0 && roadDuskOn.wetness > roadOvercast.wetness);

// Verify GLSL photopic-aware scotopic gating, continuous HOA streaks & bilateral OS glare invariants
assert.ok(fragSrc.includes('pixelDarkMask'), 'vision.frag.glsl must gate scotopic rod blur/shift on local pixel luminance');
assert.ok(fragSrc.includes('STREAK_STEPS = 8'), 'vision.frag.glsl must use continuous multi-step HOA streaks (no 3-tap pearls)');
assert.ok(fragSrc.includes('OS_STREAKS = 5'), 'vision.frag.glsl sampleOS must render bilateral OS HOA glare streaks');

console.log(
  `sim_checks.mjs PASSED: waveform=${wf.waveform.samples_x_deg.length} samples @ ${wf.waveform.sample_rate_hz} Hz (MLN p2p=${wf.phases.mln_occluded.peak_to_peak_deg} deg, SPV=${wf.phases.mln_occluded.slow_phase_velocity_deg_s} deg/s, exo=${wf.exotropia_estimate_deg} deg); all state/persona/MLN/diplopia/exam-room assertions green.`
);
