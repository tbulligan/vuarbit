import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSimState,
  computeOcclusionFromDistance,
  computeDiplopiaOffsetDeg,
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

// 3. Validate src/state.js: computeDiplopiaOffsetDeg
const dipNear = computeDiplopiaOffsetDeg(0.1);
const dipMid = computeDiplopiaOffsetDeg(0.4);
const dipFar = computeDiplopiaOffsetDeg(3.0);

assert.ok(dipNear.dxDeg < 0 && dipNear.dyDeg > 0, 'OS ghost must shift left (dx<0) and up (dy>0)');
assert.ok(Math.abs(dipNear.dxDeg - (-5.71)) < 0.15, `0.10m dxDeg expected ~-5.71, got ${dipNear.dxDeg}`);
assert.ok(Math.abs(dipNear.dyDeg - 2.86) < 0.15, `0.10m dyDeg expected ~+2.86, got ${dipNear.dyDeg}`);
assert.ok(Math.abs(dipMid.dxDeg - (-2.86)) < 0.15, `0.40m dxDeg expected ~-2.86, got ${dipMid.dxDeg}`);
assert.ok(Math.abs(dipMid.dyDeg - 1.43) < 0.15, `0.40m dyDeg expected ~+1.43, got ${dipMid.dyDeg}`);
assert.ok(Math.abs(dipFar.dxDeg - (-0.95)) < 0.15, `3.00m dxDeg expected ~-0.95, got ${dipFar.dxDeg}`);
assert.ok(Math.abs(dipFar.dyDeg - 0.29) < 0.15, `3.00m dyDeg expected ~+0.29, got ${dipFar.dyDeg}`);
assert.ok(
  Math.abs(dipNear.dxDeg) > Math.abs(dipMid.dxDeg) && Math.abs(dipMid.dxDeg) > Math.abs(dipFar.dxDeg),
  'horizontal diplopia divergence must increase at near'
);
assert.ok(
  dipNear.dyDeg > dipMid.dyDeg && dipMid.dyDeg > dipFar.dyDeg,
  'vertical diplopia divergence must increase at near'
);

// 4. Validate src/state.js: updateSimState
const stOpen = createSimState();
const initialFatigue = stOpen.fatigue;
for (let i = 0; i < 60; i++) {
  updateSimState(stOpen, 0.05);
}
assert.ok(stOpen.fatigue > initialFatigue, `fatigue should rise while eyes open (${initialFatigue} -> ${stOpen.fatigue})`);
assert.equal(stOpen.activeZone, 'distance');

// MLN ramps with occlusion
const stUnoccluded = createSimState();
stUnoccluded.fatigue = 0.2;
updateSimState(stUnoccluded, 0.016);

const stOccluded = createSimState();
stOccluded.fatigue = 0.2;
stOccluded.occlOS = 1.0;
updateSimState(stOccluded, 0.016);
assert.equal(stOccluded.occlusionLevel, 1.0);
assert.ok(
  stOccluded.mlnIntensity > stUnoccluded.mlnIntensity + 0.5,
  `MLN must ramp strongly with occlusion (${stUnoccluded.mlnIntensity} -> ${stOccluded.mlnIntensity})`
);

// Near, uncorrected, and closed zones + fatigue recovery
stOpen.focusDistM = 0.36;
updateSimState(stOpen, 0.016);
assert.equal(stOpen.activeZone, 'near');

stOpen.glassesOn = false;
updateSimState(stOpen, 0.016);
assert.equal(stOpen.activeZone, 'uncorrected');

stOpen.eyesClosed = true;
stOpen.fatigue = 0.8;
for (let i = 0; i < 100; i++) {
  updateSimState(stOpen, 0.05);
}
assert.ok(stOpen.eyelidClose > 0.99, `eyelidClose should approach 1, got ${stOpen.eyelidClose}`);
assert.equal(stOpen.activeZone, 'closed');
assert.ok(stOpen.fatigue < 0.8 && stOpen.fatigue >= 0.05, `fatigue should recover toward 0.05 when closed, got ${stOpen.fatigue}`);

console.log(
  `sim_checks.mjs PASSED: waveform=${wf.waveform.samples_x_deg.length} samples @ ${wf.waveform.sample_rate_hz} Hz (MLN p2p=${wf.phases.mln_occluded.peak_to_peak_deg} deg, SPV=${wf.phases.mln_occluded.slow_phase_velocity_deg_s} deg/s, exo=${wf.exotropia_estimate_deg} deg); all state/math assertions green.`
);
