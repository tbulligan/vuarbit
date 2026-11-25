import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSimState,
  computeOcclusionFromDistance,
  computeDiplopiaOffsetDeg,
  computeMlnAngleDeg,
  computeDecompensation,
  updateSimState,
} from '../src/state.js';

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

// 2. Validate src/state.js: computeOcclusionFromDistance
assert.equal(computeOcclusionFromDistance(0.25), 0);
assert.equal(computeOcclusionFromDistance(0.5), 0);
assert.equal(computeOcclusionFromDistance(3.8), 0);
assert.equal(computeOcclusionFromDistance(Infinity), 0);
assert.equal(computeOcclusionFromDistance(NaN), 0);

assert.equal(computeOcclusionFromDistance(0.08), 1);
assert.equal(computeOcclusionFromDistance(0.04), 1);
assert.equal(computeOcclusionFromDistance(0.0), 1);

const occFar = computeOcclusionFromDistance(0.22);
const occMid = computeOcclusionFromDistance(0.165);
const occNear = computeOcclusionFromDistance(0.11);
assert.ok(occFar > 0 && occFar < occMid && occMid < occNear && occNear < 1, 'occlusion ramp must be strictly monotonic in (0.08, 0.25)');
assert.ok(Math.abs(occMid - 0.5) < 1e-6, `midpoint occlusion expected 0.5, got ${occMid}`);

// 3. Validate src/state.js: computeDiplopiaOffsetDeg (1cm/0.5cm @ 0.1m, 2cm/1cm @ 0.4m, 5cm/1.5cm @ 3m+)
const dipNear = computeDiplopiaOffsetDeg(0.1);
const dipMid = computeDiplopiaOffsetDeg(0.4);
const dipFar = computeDiplopiaOffsetDeg(3.0);
const dipBeyond = computeDiplopiaOffsetDeg(6.0);

assert.ok(dipNear.dxDeg < 0 && dipNear.dyDeg > 0, 'OS ghost must shift left (dx<0) and up (dy>0)');
assert.ok(Math.abs(dipNear.dxDeg - (-5.71)) < 0.15, `0.10m dxDeg expected ~-5.71, got ${dipNear.dxDeg}`);
assert.ok(Math.abs(dipNear.dyDeg - 2.86) < 0.15, `0.10m dyDeg expected ~+2.86, got ${dipNear.dyDeg}`);
assert.ok(Math.abs(dipMid.dxDeg - (-2.86)) < 0.15, `0.40m dxDeg expected ~-2.86, got ${dipMid.dxDeg}`);
assert.ok(Math.abs(dipMid.dyDeg - 1.43) < 0.15, `0.40m dyDeg expected ~+1.43, got ${dipMid.dyDeg}`);
assert.ok(Math.abs(dipFar.dxDeg - (-0.95)) < 0.15, `3.00m dxDeg expected ~-0.95, got ${dipFar.dxDeg}`);
assert.ok(Math.abs(dipFar.dyDeg - 0.29) < 0.15, `3.00m dyDeg expected ~+0.29, got ${dipFar.dyDeg}`);
assert.equal(dipBeyond.dxDeg, dipFar.dxDeg, 'beyond 3m must hold steady 3m+ offset');

// Verify GLSL per-pixel diplopia constants stay in sync with state.js
const fragSrc = fs.readFileSync(new URL('../src/shaders/vision.frag.glsl', import.meta.url), 'utf8');
for (const c of ['0.552', '1.2535', '0.143', '0.0295', '0.8316', '0.1938']) {
  assert.ok(fragSrc.includes(c), `vision.frag.glsl missing diplopia constant ${c}`);
}

// 4. Validate src/state.js: computeMlnAngleDeg (organic unoccluded vs mechanical Point A -> Point B occluded)
const dummyWave = { dxDeg: 1.2, dyDeg: -0.4, vxDegS: 10 };
const mlnOrganic = computeMlnAngleDeg(dummyWave, 0.0, 5.5, 0.0, 1.0, 0.0);
assert.ok(Math.abs(mlnOrganic.dxDeg - 1.2) < 1e-6, 'unoccluded MLN must preserve organic waveform X');
assert.ok(Math.abs(mlnOrganic.dyDeg - (-0.4)) < 1e-6, 'unoccluded MLN must preserve organic waveform Y');

const mlnOcclStart = computeMlnAngleDeg(dummyWave, 0.0, 5.5, 1.0, 1.0, 0.0);
const mlnOcclPeak = computeMlnAngleDeg(dummyWave, 0.839 / 5.5, 5.5, 1.0, 1.0, 0.0);
assert.ok(Math.abs(mlnOcclStart.dxDeg - (-2.5)) < 0.05, `occluded MLN must start at Point A (-2.5 deg), got ${mlnOcclStart.dxDeg}`);
assert.ok(mlnOcclPeak.dxDeg > 2.4, `occluded MLN must reach Point B (+2.5 deg), got ${mlnOcclPeak.dxDeg}`);
assert.ok(Math.abs(mlnOcclStart.dyDeg) < 0.1, 'occluded mechanical MLN must be primarily horizontal');

const mlnGazeUnfocused = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 5.5, 0.0, 0.0, 1.0, 0.0);
const mlnGazeFocused = computeMlnAngleDeg({ dxDeg: 0, dyDeg: 0, vxDegS: 0 }, 0.0, 5.5, 0.0, 0.0, 1.0, 1.0);
assert.ok(Math.abs(mlnGazeUnfocused.dxDeg) > 2.0, 'unfocused mouse gaze-shift burst must trigger prominent nystagmus');
assert.ok(
  Math.abs(mlnGazeFocused.dxDeg) < Math.abs(mlnGazeUnfocused.dxDeg) * 0.55,
  'Focus effort must damp gaze-shift nystagmus'
);

// 5. Validate src/state.js: updateSimState (two-speed fatigue, Focus suppression, occlusion, closed eyes)
const stRelaxed = createSimState();
const stFocused = createSimState();
stFocused.focusing = true;
for (let i = 0; i < 60; i++) {
  updateSimState(stRelaxed, 0.05);
  updateSimState(stFocused, 0.05);
}
assert.ok(stRelaxed.fatigue > 0.08, 'fatigue should rise while eyes open');
assert.ok(stFocused.fatigue > stRelaxed.fatigue + 0.01, 'Focus effort must build fatigue faster');
assert.ok(stFocused.focusStrength > 0.8, 'Focus effort should engage strongly at low fatigue');
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

console.log(
  `sim_checks.mjs PASSED: waveform=${wf.waveform.samples_x_deg.length} samples @ ${wf.waveform.sample_rate_hz} Hz (MLN p2p=${wf.phases.mln_occluded.peak_to_peak_deg} deg, SPV=${wf.phases.mln_occluded.slow_phase_velocity_deg_s} deg/s, exo=${wf.exotropia_estimate_deg} deg); all state/MLN/diplopia assertions green.`
);
