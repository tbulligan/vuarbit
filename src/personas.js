/**
 * Clinical vision personas, allow-listed visual setting specs, and pure validation helpers.
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

export const SETTING_SPECS = Object.freeze({
  lensProfile: Object.freeze({ type: 'enum', values: ['aphakic_bifocal', 'none'], default: 'aphakic_bifocal' }),
  lensPowerD: Object.freeze({ type: 'number', min: 6, max: 18, step: 0.5, default: 13.0 }),
  nearAddD: Object.freeze({ type: 'number', min: 0, max: 5, step: 0.25, default: 4.0 }),
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
  cvdType: 'none',
  cvdSeverity: 0.0,
};

export const PERSONAS = Object.freeze([
  Object.freeze({
    id: 'vuarbit_1994',
    group: 'vuarbit',
    name: 'Vuarbit 1994 (Childhood Aphakia)',
    shortName: 'Vuarbit 1994',
    description: 'Bilateral childhood aphakia (+13/+17 D bifocal), OD-dominant, OS amblyopia & diplopia, manifest latent nystagmus (MLN).',
    settings: Object.freeze(createDefaultVisualSettings()),
  }),
  Object.freeze({
    id: 'normal',
    group: 'vuarbit',
    name: 'Normal Vision',
    shortName: 'Normal Vision',
    description: 'Healthy 20/20 binocular vision with no refractive error or ocular pathology.',
    settings: Object.freeze(sanitizeVisualSettings(EMMETROPIC_BASE)),
  }),
  Object.freeze({
    id: 'glaucoma',
    group: 'condition',
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
    id: 'albinism',
    group: 'condition',
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
    id: 'cataracts',
    group: 'condition',
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
    id: 'deuteranopia',
    group: 'condition',
    name: 'Deuteranopia (Red-Green CVD)',
    shortName: 'Deuteranopia',
    description: 'Complete M-cone deficiency (Machado 2009 red-green shift) with normal spatial acuity.',
    settings: Object.freeze(sanitizeVisualSettings({
      ...EMMETROPIC_BASE,
      cvdType: 'deutan',
      cvdSeverity: 1.0,
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
  state.focusing = false;
  state.focusStrength = 0;
  state.eyesClosed = false;
  state.eyelidClose = 0;
  state.glassesOn = persona.settings.lensProfile === 'aphakic_bifocal';
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
    state.glassesOn = validated === 'aphakic_bifocal';
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
