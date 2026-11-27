/**
 * Pure outdoor road loop, traffic headway, and day/night glare lighting math for P4 Car Passenger.
 * Zero DOM or Three.js dependencies so Node unit tests verify directly.
 */

export const CAR_CRUISE_SPEED_MPS = 18.0; // ~65 km/h suburban/provincial cruise
export const ONCOMING_CLOSING_SPEED_MPS = 34.0; // combined relative speed (~122 km/h)
export const ROAD_LOOP_LEN_M = 160.0;
export const ROAD_Z_MIN = -140.0;
export const ROAD_Z_MAX = ROAD_Z_MIN + ROAD_LOOP_LEN_M; // +20 m behind passenger cabin
export const CAR_FAR_CLIP = 140.0;

/**
 * Wrap any world Z coordinate seamlessly into [zMin, zMin + loopLen).
 */
export function wrapLoopZ(z, zMin = ROAD_Z_MIN, loopLen = ROAD_LOOP_LEN_M) {
  const safeZ = Number.isFinite(z) ? z : zMin;
  const span = Math.max(1, Number.isFinite(loopLen) ? loopLen : ROAD_LOOP_LEN_M);
  const rel = (((safeZ - zMin) % span) + span) % span;
  return zMin + rel;
}

/**
 * Smooth lead-car distance ahead in our lane (meters, negative Z in front of camera).
 * Varies gently between -19 m and -25 m to showcase traffic-depth diplopia and myopia blur.
 */
export function computeLeadCarZ(simTime) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return -22.0 + Math.sin(t * 0.35) * 3.0;
}

const ROAD_LIGHTING_PROFILES = Object.freeze({
  sunny: Object.freeze({
    fogColor: '#b9d6ef',
    fogNear: 52,
    fogFar: 132,
    skyTop: '#3e84d6',
    skyMid: '#8ec0ec',
    skyHorizon: '#e5eef8',
    sunVisible: true,
    sunEmissive: 16.0,
    sunPos: Object.freeze([-26, 22, -110]),
    roadRoughness: 0.62,
    roadMetalness: 0.04,
    wetness: 0.0,
    headlightEmissive: 0.6,
    taillightEmissive: 1.4,
    ownBeamIntensity: 0.0,
    dashEmissive: 0.15,
    streetlightsActive: false,
  }),
  overcast: Object.freeze({
    fogColor: '#8e9aa6',
    fogNear: 42,
    fogFar: 118,
    skyTop: '#6b7785',
    skyMid: '#8d99a6',
    skyHorizon: '#b9c4cf',
    sunVisible: false,
    sunEmissive: 0.0,
    sunPos: Object.freeze([-18, 38, -95]),
    roadRoughness: 0.30,
    roadMetalness: 0.14,
    wetness: 0.45,
    headlightEmissive: 3.4,
    taillightEmissive: 3.2,
    ownBeamIntensity: 1.5,
    dashEmissive: 0.35,
    streetlightsActive: false,
  }),
  dusk: Object.freeze({
    fogColor: '#2a2236',
    fogNear: 38,
    fogFar: 116,
    skyTop: '#141730',
    skyMid: '#4c344f',
    skyHorizon: '#d97244',
    sunVisible: true,
    sunEmissive: 9.0,
    sunPos: Object.freeze([-22, 6.5, -112]),
    roadRoughness: 0.18,
    roadMetalness: 0.22,
    wetness: 0.85,
    headlightEmissive: 12.5,
    taillightEmissive: 7.2,
    ownBeamIntensity: 7.5,
    dashEmissive: 0.65,
    streetlightsActive: true,
  }),
  night: Object.freeze({
    fogColor: '#040710',
    fogNear: 28,
    fogFar: 108,
    skyTop: '#02040a',
    skyMid: '#060c1a',
    skyHorizon: '#0e182c',
    sunVisible: false,
    sunEmissive: 0.0,
    sunPos: Object.freeze([-20, 26, -100]),
    roadRoughness: 0.15,
    roadMetalness: 0.25,
    wetness: 1.0,
    headlightEmissive: 15.0,
    taillightEmissive: 8.5,
    ownBeamIntensity: 12.0,
    dashEmissive: 0.78,
    streetlightsActive: true,
  }),
});

/**
 * Resolve outdoor road lighting, wet-asphalt speculars, and HDR vehicle/streetlight intensities.
 * `lightsOn` (L key) toggles roadside streetlights ON (urban/suburban) vs OFF (unlit rural highway).
 */
export function computeRoadLighting(timeOfDay, lightsOn = true) {
  const base = ROAD_LIGHTING_PROFILES[timeOfDay] || ROAD_LIGHTING_PROFILES.sunny;
  const streetOn = Boolean(base.streetlightsActive) && lightsOn !== false;
  return {
    ...base,
    streetlightsOn: streetOn,
    streetlightEmissive: streetOn ? (timeOfDay === 'night' ? 10.5 : 7.5) : 0.0,
    streetlightPoolIntensity: streetOn ? (timeOfDay === 'night' ? 8.5 : 5.0) : 0.0,
  };
}
