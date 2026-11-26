import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PERSONAS,
  SETTING_SPECS,
  QUALITY_PRESETS,
  getPersonaById,
  createDefaultVisualSettings,
  sanitizeVisualSettings,
  applyPersona,
  updateVisualSetting,
  computeAcuityBlurUV,
  formatSnellenAcuity,
  hasSuppressionMechanics,
  createSimState,
  computeOcclusionFromDistance,
  computeDiplopiaOffsetDeg,
  computeMlnAngleDeg,
  computeMlnFreqScale,
  computeHeldRestOffset,
  computeMaxYaw,
  computeDecompensation,
  updateHeldRotation,
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

// MLN frequency halves only when calmly focused; stays 1.0x when unfocused, fatigued, occluded, or moving gaze
assert.equal(computeMlnFreqScale(1.0, 0.1, 0.0, 0.0), 0.5, 'calm Focus must halve MLN frequency');
assert.equal(computeMlnFreqScale(0.0, 0.1, 0.0, 0.0), 1.0, 'unfocused MLN frequency must stay 1.0x');
assert.equal(computeMlnFreqScale(1.0, 0.96, 0.0, 0.0), 1.0, 'fatigued MLN frequency must stay 1.0x');
assert.equal(computeMlnFreqScale(1.0, 0.1, 0.5, 0.0), 1.0, 'occluded MLN frequency must stay 1.0x');
assert.equal(computeMlnFreqScale(1.0, 0.1, 0.0, 0.5), 1.0, 'gaze-shift MLN frequency must stay 1.0x');

// Posture neck constraints & lower-right-lens held alignment
assert.equal(computeMaxYaw('standing', 0), Infinity, 'standing allows full 360 deg turn');
assert.ok(computeMaxYaw('seated', 0) < Math.PI && computeMaxYaw('seated', 0) > 1.2, 'seated yaw must constrain neck/body');
assert.ok(computeMaxYaw('seated', 1) < computeMaxYaw('seated', 0) * 0.5, 'deep lean must constrain neck yaw more tightly than upright');

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

assert.equal(PERSONAS.length, 7, 'must define exactly 7 clinical personas');
const expectedPersonas = {
  vuarbit_1994: { shortName: 'Vuarbit 1994', lensProfile: 'aphakic_bifocal', vodAcuity: 0.70, vosAcuity: 0.15, mlnScale: 1.0 },
  normal: { shortName: 'Normal Vision', lensProfile: 'none', vodAcuity: 1.0, vosAcuity: 1.0, mlnScale: 0.0 },
  glaucoma: { shortName: 'Glaucoma', lensProfile: 'none', vodAcuity: 0.90, vosAcuity: 0.85, glaucoma: 0.65 },
  amd: { shortName: 'Wet AMD', lensProfile: 'none', vodAcuity: 0.45, vosAcuity: 0.40, amd: 0.70 },
  albinism: { shortName: 'Ocular Albinism', lensProfile: 'none', vodAcuity: 0.25, vosAcuity: 0.25, albinism: 0.75, mlnScale: 0.0 },
  cataracts: { shortName: 'Cataracts', lensProfile: 'none', vodAcuity: 0.40, vosAcuity: 0.35, cataract: 0.72 },
  deuteranopia: { shortName: 'Deuteranopia', lensProfile: 'none', vodAcuity: 1.0, vosAcuity: 1.0, cvdType: 'deutan', cvdSeverity: 1.0 },
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

// Albinism infantile nystagmus drive (mlnScale is 0 by default -> no dual-waveform double counting)
const stAlb = createSimState();
applyPersona(stAlb, 'albinism');
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

// Bifocal nearAddD=0 stays distance even when looking down
const stNoAdd = createSimState();
updateVisualSetting(stNoAdd, 'nearAddD', 0);
stNoAdd.pitch = -0.5;
updateSimState(stNoAdd, 0.016);
assert.equal(stNoAdd.activeZone, 'distance', 'zero nearAddD must not enter near bifocal zone');

console.log(
  `sim_checks.mjs PASSED: waveform=${wf.waveform.samples_x_deg.length} samples @ ${wf.waveform.sample_rate_hz} Hz (MLN p2p=${wf.phases.mln_occluded.peak_to_peak_deg} deg, SPV=${wf.phases.mln_occluded.slow_phase_velocity_deg_s} deg/s, exo=${wf.exotropia_estimate_deg} deg); all state/persona/MLN/diplopia assertions green.`
);
