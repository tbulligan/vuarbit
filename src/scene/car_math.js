/**
 * Pure Friulian moraine-hill curving road spline, coherent Udine -> San Daniele signage,
 * traffic headway, and day/night glare lighting math for P4 Car Passenger.
 * Zero DOM or Three.js dependencies so Node unit tests verify directly.
 */

export const CAR_CRUISE_SPEED_MPS = 18.0; // ~65 km/h Friulian provincial road (SR 464 / SP 49)
export const ONCOMING_CLOSING_SPEED_MPS = 34.0; // combined relative speed (~122 km/h)
export const ROAD_LOOP_LEN_M = 320.0; // full scenic loop with left & right sweeping moraine bends
export const ROAD_Z_MIN = -140.0;
export const ROAD_Z_MAX = ROAD_Z_MIN + ROAD_LOOP_LEN_M;
export const CAR_FAR_CLIP = 140.0;

const TWO_PI_OVER_LOOP = (Math.PI * 2) / ROAD_LOOP_LEN_M;

/**
 * Wrap any world coordinate seamlessly into [zMin, zMin + loopLen).
 */
export function wrapLoopZ(z, zMin = ROAD_Z_MIN, loopLen = ROAD_LOOP_LEN_M) {
  const safeZ = Number.isFinite(z) ? z : zMin;
  const span = Math.max(1, Number.isFinite(loopLen) ? loopLen : ROAD_LOOP_LEN_M);
  const rel = (((safeZ - zMin) % span) + span) % span;
  return zMin + rel;
}

/**
 * Periodic global centerline X(s) for the Udine -> Fagagna -> San Daniele moraine road.
 * Curves left smoothly around s ~ 80 m (curvature < 0) and right around s ~ 240 m (curvature > 0).
 */
export function roadGlobalX(s) {
  const safeS = Number.isFinite(s) ? s : 0;
  return 16.0 * Math.sin(safeS * TWO_PI_OVER_LOOP) + 4.2 * Math.sin(safeS * 2.0 * TWO_PI_OVER_LOOP + 0.55);
}

export function roadGlobalSlopeX(s) {
  const safeS = Number.isFinite(s) ? s : 0;
  return (
    16.0 * TWO_PI_OVER_LOOP * Math.cos(safeS * TWO_PI_OVER_LOOP) +
    8.4 * TWO_PI_OVER_LOOP * Math.cos(safeS * 2.0 * TWO_PI_OVER_LOOP + 0.55)
  );
}

export function roadGlobalCurvatureX(s) {
  const safeS = Number.isFinite(s) ? s : 0;
  const k2 = TWO_PI_OVER_LOOP * TWO_PI_OVER_LOOP;
  return (
    -16.0 * k2 * Math.sin(safeS * TWO_PI_OVER_LOOP) -
    16.8 * k2 * Math.sin(safeS * 2.0 * TWO_PI_OVER_LOOP + 0.55)
  );
}

/**
 * Gentle Friulian moraine hills elevation profile Y(s) (+/- 2.2 m smooth crests & dips).
 */
export function roadGlobalY(s) {
  const safeS = Number.isFinite(s) ? s : 0;
  return 1.7 * Math.sin(safeS * TWO_PI_OVER_LOOP + 0.85) + 0.55 * Math.cos(safeS * 2.0 * TWO_PI_OVER_LOOP);
}

export function roadGlobalSlopeY(s) {
  const safeS = Number.isFinite(s) ? s : 0;
  return (
    1.7 * TWO_PI_OVER_LOOP * Math.cos(safeS * TWO_PI_OVER_LOOP + 0.85) -
    1.1 * TWO_PI_OVER_LOOP * Math.sin(safeS * 2.0 * TWO_PI_OVER_LOOP)
  );
}

/**
 * Tangent-frame offset (dx, dy, yaw, pitch) of a road point at car-local Z (z < 0 ahead)
 * when the car is at continuous road arc distance s0.
 * Strictly satisfies dx(0, s0) = 0, dy(0, s0) = 0, yaw(0, s0) = 0 so the car stays aligned with its lane.
 */
export function computeRoadRelativeOffset(z, s0) {
  const ahead = -(Number.isFinite(z) ? z : 0);
  const baseS = Number.isFinite(s0) ? s0 : 0;
  const s = baseS + ahead;
  const x0 = roadGlobalX(baseS);
  const sx0 = roadGlobalSlopeX(baseS);
  const y0 = roadGlobalY(baseS);
  const sy0 = roadGlobalSlopeY(baseS);
  const dx = roadGlobalX(s) - x0 - ahead * sx0;
  const dy = roadGlobalY(s) - y0 - ahead * sy0;
  const yaw = -Math.atan(roadGlobalSlopeX(s) - sx0);
  const pitch = Math.atan(roadGlobalSlopeY(s) - sy0);
  return { dx, dy, yaw, pitch };
}

/**
 * Instantaneous global road heading (radians) used to rotate the distant Julian Prealps & sun azimuth.
 */
export function computeRoadHeadingRad(s0) {
  return Math.atan(roadGlobalSlopeX(s0));
}

/**
 * Steering wheel rotation angle (radians around +Z, negative = clockwise right turn) from live curvature.
 */
export function computeSteeringWheelAngle(s0) {
  const k = roadGlobalCurvatureX(s0);
  return Math.max(-0.55, Math.min(0.55, -k * 52.0));
}

/**
 * Coherent Udine -> Fagagna -> San Daniele del Friuli provincial route signs (s in [0, 320 m)),
 * placed strictly in sync with the physical left bend (s ~ 75..125 m) and right bend (s ~ 225..275 m).
 */
export const FRIULI_ROUTE_SIGNS = Object.freeze([
  Object.freeze({ s: 24, kind: 'dir_fagagna', side: 'right', lateralX: 3.1 }),
  Object.freeze({ s: 54, kind: 'warning_curve_left', side: 'right', lateralX: 2.95 }),
  Object.freeze({ s: 82, kind: 'chevron_left', side: 'right', lateralX: 2.65 }),
  Object.freeze({ s: 96, kind: 'chevron_left', side: 'right', lateralX: 2.65 }),
  Object.freeze({ s: 110, kind: 'chevron_left', side: 'right', lateralX: 2.65 }),
  Object.freeze({ s: 146, kind: 'speed_50', side: 'right', lateralX: 2.95 }),
  Object.freeze({ s: 162, kind: 'hamlet_fagagna', side: 'right', lateralX: 3.05 }),
  Object.freeze({ s: 196, kind: 'warning_curve_right', side: 'right', lateralX: 2.95 }),
  Object.freeze({ s: 226, kind: 'chevron_right', side: 'left', lateralX: -6.55 }),
  Object.freeze({ s: 240, kind: 'chevron_right', side: 'left', lateralX: -6.55 }),
  Object.freeze({ s: 254, kind: 'chevron_right', side: 'left', lateralX: -6.55 }),
  Object.freeze({ s: 286, kind: 'dir_san_daniele', side: 'right', lateralX: 3.1 }),
  Object.freeze({ s: 306, kind: 'speed_70', side: 'right', lateralX: 2.95 }),
]);

/**
 * Smooth lead-car distance ahead in our lane (meters, negative Z in front of camera).
 */
export function computeLeadCarZ(simTime) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return -23.0 + Math.sin(t * 0.35) * 3.0;
}

const ROAD_LIGHTING_PROFILES = Object.freeze({
  sunny: Object.freeze({
    fogColor: '#b9d6ef',
    fogNear: 56,
    fogFar: 136,
    skyTop: '#357bd1',
    skyMid: '#86bbea',
    skyHorizon: '#e5eef8',
    mountainNear: '#3b5246',
    mountainFar: '#6b85a3',
    sunVisible: true,
    sunEmissive: 16.0,
    sunPos: Object.freeze([-32, 26, -118]),
    roadRoughness: 0.62,
    roadMetalness: 0.04,
    wetness: 0.0,
    headlightEmissive: 0.6,
    taillightEmissive: 1.4,
    ownBeamIntensity: 0.0,
    dashEmissive: 0.15,
    houseWindowEmissive: 0.0,
    mirrorColor: '#7b8c9d',
    streetlightsActive: false,
  }),
  overcast: Object.freeze({
    fogColor: '#8e9aa6',
    fogNear: 44,
    fogFar: 122,
    skyTop: '#6b7785',
    skyMid: '#8d99a6',
    skyHorizon: '#b9c4cf',
    mountainNear: '#47535c',
    mountainFar: '#707e8c',
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
    houseWindowEmissive: 0.4,
    mirrorColor: '#586470',
    streetlightsActive: false,
  }),
  dusk: Object.freeze({
    fogColor: '#2a2236',
    fogNear: 40,
    fogFar: 120,
    skyTop: '#141730',
    skyMid: '#4c344f',
    skyHorizon: '#d97244',
    mountainNear: '#1c1c28',
    mountainFar: '#3a2d44',
    sunVisible: true,
    sunEmissive: 9.0,
    sunPos: Object.freeze([-28, 12.5, -120]),
    roadRoughness: 0.18,
    roadMetalness: 0.22,
    wetness: 0.85,
    headlightEmissive: 12.5,
    taillightEmissive: 7.2,
    ownBeamIntensity: 7.5,
    dashEmissive: 0.65,
    houseWindowEmissive: 2.2,
    mirrorColor: '#262b38',
    streetlightsActive: true,
  }),
  night: Object.freeze({
    fogColor: '#040710',
    fogNear: 28,
    fogFar: 112,
    skyTop: '#02040a',
    skyMid: '#060c1a',
    skyHorizon: '#0e182c',
    mountainNear: '#060910',
    mountainFar: '#0b1220',
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
    houseWindowEmissive: 2.8,
    mirrorColor: '#101520',
    streetlightsActive: true,
  }),
});

/**
 * Resolve outdoor road lighting, wet-asphalt speculars, and HDR vehicle/streetlight intensities.
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
