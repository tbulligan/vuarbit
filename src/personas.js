/**
 * Clinical vision presets, allow-listed visual setting specs, and pure validation helpers.
 * Zero DOM or Three.js dependencies so Node unit tests can import directly.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({ id: 'high', label: 'High (1.75x)', dprCap: 1.75 }),
  balanced: Object.freeze({ id: 'balanced', label: 'Balanced (1.25x)', dprCap: 1.25 }),
  performance: Object.freeze({ id: 'performance', label: 'Performance (1.0x)', dprCap: 1.0 }),
});

export const SCENES = Object.freeze([
  Object.freeze({
    id: 'classroom',
    label: '1994 Classroom',
    shortName: '1994 Classroom',
    description: 'Mid-1990s Italian classroom with 3.8 m blackboard, quadretti math workbook, classmates, and desk props.',
    defaultMode: 'standing',
  }),
  Object.freeze({
    id: 'exam_room',
    label: 'Optometry Exam Room',
    shortName: 'Exam Room',
    description: '4.0 m clinical exam lane with backlit ETDRS acuity chart, Pelli-Robson contrast, Amsler grid, Ishihara plates, near Jaeger card, and HDR glare lamp.',
    defaultMode: 'seated',
    seatedOnly: false,
  }),
  Object.freeze({
    id: 'car_passenger',
    label: 'Car Passenger (Friuli Road)',
    shortName: 'Car Passenger',
    description: 'Seated cabin cruising the curving Friuli moraine road (Udine → Fagagna → San Daniele) with Julian Prealps horizon, day sun glare, and wet-road night headlights.',
    defaultMode: 'seated',
    seatedOnly: true,
  }),
]);

export function getSceneById(id) {
  return SCENES.find((scene) => scene.id === id);
}

export const TIME_OF_DAY_PRESETS = Object.freeze({
  sunny: Object.freeze({
    id: 'sunny',
    label: 'Sunny Morning',
    skyBg: '#b8d8f4',
    skyTop: '#5ca0e6',
    skyPlane: '#e8f3ff',
    skyGain: 2.5,
    hemiSky: '#d9eaff',
    hemiGround: '#b59d7a',
    hemiInt: 0.62,
    sunColor: '#fff2dc',
    sunInt: 3.6,
    sunPos: Object.freeze([-7.5, 4.3, -1.0]),
    winColor: '#cfe4ff',
    winInt: 3.6,
    outdoorLux: 1.0,
  }),
  overcast: Object.freeze({
    id: 'overcast',
    label: 'Overcast',
    skyBg: '#8e9aa6',
    skyTop: '#7f8c99',
    skyPlane: '#b8c5d1',
    skyGain: 1.35,
    hemiSky: '#bcc9d6',
    hemiGround: '#7a756c',
    hemiInt: 0.44,
    sunColor: '#d8e4f0',
    sunInt: 0.30,
    sunPos: Object.freeze([-6.5, 5.2, -0.5]),
    winColor: '#c6d4e2',
    winInt: 2.5,
    outdoorLux: 0.45,
  }),
  dusk: Object.freeze({
    id: 'dusk',
    label: 'Dusk',
    skyBg: '#271e35',
    skyTop: '#1d1b38',
    skyPlane: '#c45e3d',
    skyGain: 0.95,
    hemiSky: '#684860',
    hemiGround: '#3d281f',
    hemiInt: 0.14,
    sunColor: '#ff7b3b',
    sunInt: 1.45,
    sunPos: Object.freeze([-9.0, 1.35, 1.4]),
    winColor: '#8f5d72',
    winInt: 0.60,
    outdoorLux: 0.14,
  }),
  night: Object.freeze({
    id: 'night',
    label: 'Night',
    skyBg: '#040710',
    skyTop: '#03060f',
    skyPlane: '#0b1429',
    skyGain: 0.55,
    hemiSky: '#152344',
    hemiGround: '#0a0c12',
    hemiInt: 0.035,
    sunColor: '#7ea2e0',
    sunInt: 0.14,
    sunPos: Object.freeze([-7.5, 4.6, 2.0]),
    winColor: '#203666',
    winInt: 0.10,
    outdoorLux: 0.02,
  }),
});

export const TIME_OF_DAY_ORDER = Object.freeze(['sunny', 'overcast', 'dusk', 'night']);

export function cycleTimeOfDay(current) {
  const idx = TIME_OF_DAY_ORDER.indexOf(current);
  return TIME_OF_DAY_ORDER[(idx + 1) % TIME_OF_DAY_ORDER.length];
}

export function computeAmbientLight(timeOfDay, lightsOn) {
  const preset = TIME_OF_DAY_PRESETS[timeOfDay] || TIME_OF_DAY_PRESETS.sunny;
  const artLux = lightsOn ? 0.52 : 0.0;
  return clamp(preset.outdoorLux * 0.78 + artLux, 0.03, 1.0);
}

/**
 * Physiological eye/retinal light adaptation multiplier for tone mapping exposure.
 */
export function computeAdaptedExposure(ambientLight) {
  const a = clamp(Number.isFinite(ambientLight) ? ambientLight : 1.0, 0.03, 1.0);
  return 1.34 - 0.48 * Math.pow(a, 0.7);
}

export const LENS_PROFILES = Object.freeze([
  'aphakic_bifocal',
  'single_vision',
  'bifocal',
  'progressive',
  'none',
]);

export const FRAME_SHAPES = Object.freeze([
  'auto',
  'round',
  'rect',
  'rounded_rect',
  'semi_rimless',
  'rimless',
]);

export const FRAME_COLORS = Object.freeze([
  'auto',
  'amber',
  'charcoal',
  'tortoise',
  'titanium',
  'gold',
  'navy',
  'burgundy',
]);

export const SETTING_SPECS = Object.freeze({
  lensProfile: Object.freeze({ type: 'enum', values: LENS_PROFILES, default: 'aphakic_bifocal' }),
  frameShape: Object.freeze({ type: 'enum', values: FRAME_SHAPES, default: 'auto' }),
  frameColor: Object.freeze({ type: 'enum', values: FRAME_COLORS, default: 'auto' }),
  lensPowerD: Object.freeze({ type: 'number', min: -12.0, max: 18.0, step: 0.25, default: 13.0 }),
  nearAddD: Object.freeze({ type: 'number', min: 0.0, max: 5.0, step: 0.25, default: 4.0 }),
  lensCylD: Object.freeze({ type: 'number', min: 0.0, max: 5.0, step: 0.25, default: 0.0 }),
  lensAxisDeg: Object.freeze({ type: 'number', min: 0, max: 180, step: 5, default: 90 }),
  myopiaD: Object.freeze({ type: 'number', min: 0.0, max: 10.0, step: 0.25, default: 0.0 }),
  presbyopiaD: Object.freeze({ type: 'number', min: 0.0, max: 4.0, step: 0.25, default: 0.0 }),
  astigmatismD: Object.freeze({ type: 'number', min: 0.0, max: 5.0, step: 0.25, default: 0.0 }),
  astigmatismAxisDeg: Object.freeze({ type: 'number', min: 0, max: 180, step: 5, default: 90 }),
  dominantEye: Object.freeze({ type: 'enum', values: ['OD', 'OS'], default: 'OD' }),
  vodAcuity: Object.freeze({ type: 'number', min: 0.05, max: 1.0, step: 0.05, default: 0.70 }),
  vosAcuity: Object.freeze({ type: 'number', min: 0.05, max: 1.0, step: 0.05, default: 0.15 }),
  diplopiaH: Object.freeze({ type: 'number', min: -6.0, max: 6.0, step: 0.1, default: -1.53 }),
  diplopiaV: Object.freeze({ type: 'number', min: -4.0, max: 4.0, step: 0.1, default: 0.31 }),
  mlnScale: Object.freeze({ type: 'number', min: 0, max: 2.0, step: 0.05, default: 1.0 }),
  phosphenes: Object.freeze({ type: 'number', min: 0, max: 2.0, step: 0.05, default: 1.0 }),
  floaters: Object.freeze({ type: 'number', min: 0, max: 2.0, step: 0.05, default: 1.0 }),
  tinnitus: Object.freeze({ type: 'number', min: 0, max: 2.0, step: 0.05, default: 1.0 }),
  glaucoma: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  amd: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  albinism: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  cataract: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  diabeticRetinopathy: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  retinitisPigmentosa: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
  cvdType: Object.freeze({ type: 'enum', values: ['none', 'deutan', 'protan', 'tritan'], default: 'none' }),
  cvdSeverity: Object.freeze({ type: 'number', min: 0, max: 1.0, step: 0.05, default: 0.0 }),
});

function sanitizeSettingValue(spec, raw) {
  if (spec.type === 'enum') {
    return spec.values.includes(raw) ? raw : spec.default;
  }
  let num = NaN;
  if (typeof raw === 'number') {
    num = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    num = Number(raw);
  }
  if (!Number.isFinite(num)) {
    return spec.default;
  }
  return clamp(num, spec.min, spec.max);
}

/**
 * Return a fresh settings object populated with clinical Vuarbit 1994 defaults.
 */
export function createDefaultVisualSettings() {
  const settings = {};
  for (const [key, spec] of Object.entries(SETTING_SPECS)) {
    settings[key] = spec.default;
  }
  return settings;
}

/**
 * Sanitize a partial settings map against SETTING_SPECS:
 * ignores unknown keys, replaces non-finite/invalid values with defaults, and clamps numbers to [min, max].
 */
export function sanitizeVisualSettings(partial) {
  const out = createDefaultVisualSettings();
  if (!partial || typeof partial !== 'object') {
    return out;
  }
  for (const [key, spec] of Object.entries(SETTING_SPECS)) {
    if (Object.hasOwn(partial, key)) {
      out[key] = sanitizeSettingValue(spec, partial[key]);
    }
  }
  return out;
}

const EMMETROPIC_BASE = {
  lensProfile: 'none',
  lensPowerD: 0.0,
  nearAddD: 0.0,
  lensCylD: 0.0,
  lensAxisDeg: 90,
  myopiaD: 0.0,
  presbyopiaD: 0.0,
  astigmatismD: 0.0,
  astigmatismAxisDeg: 90,
  vodAcuity: 1.0,
  vosAcuity: 1.0,
  diplopiaH: 0.0,
  diplopiaV: 0.0,
  mlnScale: 0.0,
  phosphenes: 0.0,
  floaters: 0.0,
  tinnitus: 0.0,
  glaucoma: 0.0,
  amd: 0.0,
  albinism: 0.0,
  cataract: 0.0,
  diabeticRetinopathy: 0.0,
  retinitisPigmentosa: 0.0,
  cvdType: 'none',
  cvdSeverity: 0.0,
};

export const PERSONAS = Object.freeze([
  Object.freeze({
    id: 'vuarbit_1994',
    group: 'vuarbit',
    defaultGlassesOn: true,
    name: 'Vuarbit 1994 (Childhood Aphakia)',
    shortName: 'Vuarbit 1994',
    description: 'Bilateral childhood aphakia (+13/+17 D amber executive bifocal), OD-dominant, OS amblyopia & diplopia, manifest latent nystagmus (MLN).',
    settings: Object.freeze(createDefaultVisualSettings()),
  }),
  Object.freeze({
    id: 'normal',
    group: 'vuarbit',
    defaultGlassesOn: false,
    name: 'Normal Vision',
    shortName: 'Normal Vision',
    description: 'Healthy 20/20 binocular vision with no refractive error or ocular pathology.',
    settings: Object.freeze(sanitizeVisualSettings(EMMETROPIC_BASE)),
  }),
  Object.freeze({
    id: 'glaucoma',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Primary Open-Angle Glaucoma',
    shortName: 'Glaucoma',
    description: 'Arcuate & peripheral visual-field loss with Crabb (2013) perceptual filling-in; 100% reaches total blindness.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.90,
      vosAcuity: 0.85,
      floaters: 0.25,
      glaucoma: 0.65,
    })),
  }),
  Object.freeze({
    id: 'amd',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Macular Degeneration (Wet AMD)',
    shortName: 'Wet AMD',
    description: 'Retinal-locked Amsler metamorphopsia (wavy straight lines) and central macular scotoma.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.45,
      vosAcuity: 0.40,
      phosphenes: 0.15,
      floaters: 0.30,
      amd: 0.70,
    })),
  }),
  Object.freeze({
    id: 'cataracts',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Nuclear & Cortical Cataracts',
    shortName: 'Cataracts',
    description: 'Nuclear brunescence yellowing, cortical haze, and forward disability glare; 100% is light-perception only.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.40,
      vosAcuity: 0.35,
      floaters: 0.35,
      cataract: 0.72,
    })),
  }),
  Object.freeze({
    id: 'diabetic_retinopathy',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Diabetic Retinopathy',
    shortName: 'Diabetic Retinop.',
    description: 'Retinal-locked hemorrhage blotches, patchy exudate blur, and contrast loss; 100% causes dense vitreous hemorrhage.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.55,
      vosAcuity: 0.50,
      floaters: 0.55,
      diabeticRetinopathy: 0.65,
    })),
  }),
  Object.freeze({
    id: 'retinitis_pigmentosa',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Retinitis Pigmentosa',
    shortName: 'Retinitis Pigm.',
    description: 'Progressive dark concentric tunnel constriction and low-light shadow collapse (nyctalopia); 100% is total blindness.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.80,
      vosAcuity: 0.80,
      retinitisPigmentosa: 0.65,
    })),
  }),
  Object.freeze({
    id: 'albinism',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Ocular Albinism',
    shortName: 'Ocular Albinism',
    description: 'Foveal hypoplasia, iris-transillumination photophobia glare, and ~3.8 Hz infantile nystagmus.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      vodAcuity: 0.25,
      vosAcuity: 0.25,
      mlnScale: 0.0,
      floaters: 0.15,
      albinism: 0.75,
    })),
  }),
  Object.freeze({
    id: 'deuteranopia',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Deuteranopia (Red-Green CVD)',
    shortName: 'Deuteranopia',
    description: 'Complete M-cone deficiency (Machado 2009 red-green shift) with normal spatial acuity.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      cvdType: 'deutan',
      cvdSeverity: 1.0,
    })),
  }),
  Object.freeze({
    id: 'myopia',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Myopia (-4.0 D Nearsighted)',
    shortName: 'Myopia (-4 D)',
    description: 'Depth-accurate -4.0 D nearsightedness: workbook sharp up close, blackboard deeply blurred. Press Z to wear -4.0 D glasses.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      lensProfile: 'single_vision',
      lensPowerD: -4.0,
      myopiaD: 4.0,
    })),
  }),
  Object.freeze({
    id: 'astigmatism',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Astigmatism (2.75 D Cyl)',
    shortName: 'Astigmatism',
    description: 'Directional corneal blur & light streaks at 135°. Press Z for matched 2.75 D × 135° toric glasses (detune lens axis in Optics Details).',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      lensProfile: 'single_vision',
      lensPowerD: 0.0,
      lensCylD: 2.75,
      lensAxisDeg: 135,
      astigmatismD: 2.75,
      astigmatismAxisDeg: 135,
    })),
  }),
  Object.freeze({
    id: 'presbyopia',
    group: 'condition',
    defaultGlassesOn: false,
    name: 'Presbyopia (+2.5 D Near Loss)',
    shortName: 'Presbyopia',
    description: 'Age-related near accommodation loss: blackboard sharp, workbook & held items blurry. Press Z for progressive glasses.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      lensProfile: 'progressive',
      lensPowerD: 0.0,
      nearAddD: 2.5,
      presbyopiaD: 2.75,
    })),
  }),
]);

/**
 * Look up a clinical persona by id.
 */
export function getPersonaById(id) {
  return PERSONAS.find((persona) => persona.id === id);
}

/**
 * Whether cortical focus suppression & asthenopia fatigue reserve apply to these settings.
 */
export function hasSuppressionMechanics(settings) {
  const s = settings || createDefaultVisualSettings();
  return (
    s.lensProfile === 'aphakic_bifocal' ||
    (s.mlnScale || 0) > 0.005 ||
    (s.albinism || 0) > 0.005 ||
    Math.abs(s.diplopiaH || 0) >= 0.01 ||
    Math.abs(s.diplopiaV || 0) >= 0.01
  );
}

/**
 * Apply a named clinical persona to simulation state. Returns true if applied, false if id unknown.
 */
export function applyPersona(state, personaId) {
  const persona = getPersonaById(personaId);
  if (!state || !persona) {
    return false;
  }
  state.settings = sanitizeVisualSettings(persona.settings);
  state.personaId = persona.id;
  state.compareNormal = false;
  state.fatigue = 0.08;
  const suppression = hasSuppressionMechanics(state.settings);
  state.focusing = suppression;
  state.focusStrength = suppression ? 1 : 0;
  state.eyesClosed = false;
  state.eyelidClose = 0;
  state.glassesSlide = 0;
  state.glassesPinned = false;
  state.glassesBounce = 0;
  state.squint = 0;
  state.glassesOn =
    typeof persona.defaultGlassesOn === 'boolean'
      ? persona.defaultGlassesOn
      : persona.settings.lensProfile !== 'none';
  return true;
}

/**
 * Validate and apply one setting key/value to simulation state, marking personaId as 'custom'.
 * Returns the validated value, or undefined if key is not in SETTING_SPECS.
 */
export function updateVisualSetting(state, key, value) {
  if (!state || typeof key !== 'string' || !Object.hasOwn(SETTING_SPECS, key)) {
    return undefined;
  }
  if (!state.settings || typeof state.settings !== 'object') {
    state.settings = createDefaultVisualSettings();
  }
  const validated = sanitizeSettingValue(SETTING_SPECS[key], value);
  state.settings[key] = validated;
  state.personaId = 'custom';
  if (key === 'lensProfile') {
    state.glassesOn = validated !== 'none';
    if ((validated === 'bifocal' || validated === 'progressive') && (state.settings.nearAddD || 0) < 0.5) {
      state.settings.nearAddD = 2.5;
    } else if (validated === 'aphakic_bifocal') {
      if ((state.settings.lensPowerD || 0) < 6) state.settings.lensPowerD = 13.0;
      if ((state.settings.nearAddD || 0) < 0.5) state.settings.nearAddD = 4.0;
    }
  } else if (key === 'dominantEye' && state.holding && state.heldOffset) {
    const absX = Math.abs(state.heldOffset.x || 0);
    state.heldOffset.x = validated === 'OS' ? -absX : absX;
  }
  return validated;
}

/**
 * Convert Snellen decimal acuity [0.05, 1.0] into MAR-calibrated UV blur radius [0, 0.034].
 * 1.00 (20/20) -> 0.0, 0.70 (20/29) -> ~0.00065, 0.15 (20/133) -> ~0.0084, 0.05 (20/400) -> ~0.028.
 */
export function computeAcuityBlurUV(acuityDecimal) {
  const a = clamp(Number.isFinite(acuityDecimal) ? acuityDecimal : 1.0, 0.05, 1.0);
  const marExcess = 1.0 / a - 1.0;
  return clamp(0.0015 * Math.pow(marExcess, 0.99), 0, 0.034);
}

/**
 * Format Snellen decimal acuity alongside 20/xx equivalent (e.g. "0.70 (20/29)").
 */
export function formatSnellenAcuity(acuityDecimal) {
  const a = clamp(Number.isFinite(acuityDecimal) ? acuityDecimal : 1.0, 0.05, 1.0);
  const denom = Math.round(20 / a);
  return `${a.toFixed(2)} (20/${denom})`;
}
