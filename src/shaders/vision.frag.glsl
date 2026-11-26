uniform sampler2D tColorOD;
uniform sampler2D tBlurOD;
uniform sampler2D tDepthOD;

uniform float uNear;
uniform float uFar;
uniform float uAspect;
uniform float uTime;
uniform float uGlassesOn;
uniform float uEyelidClose;
uniform float uEyelidLight;
uniform float uFatigue;
uniform float uOcclOD;
uniform float uFocusEffort;
uniform float uCompareNormal;
uniform vec2 uMlnOffsetUV;
uniform float uMlnVelUV;
uniform float uExposure;
uniform vec2 uResolution;

varying vec2 vUv;

const float TAN_HALF_Y = 0.6008606; // tan(31 deg) for 62 deg OD camera
// Constant angular diplopia offset matching state.js: -1.53 deg L (~1.0cm / 2 squares @ 0.375m), +0.31 deg U (~0.2cm)
const vec2 DIPLOPIA_TAN = vec2(-0.0267099, 0.0054106); // tan(radians(vec2(-1.53, 0.31)))

float linearizeDepth(float d) {
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(0.0001, (uFar + uNear - ndc * (uFar - uNear)));
}

// ACES Filmic tone mapping (0.75 pre-scale aligns Narkowicz curve to neutral exposure=1.0) + IEC sRGB encoding
vec3 linearToDisplay(vec3 lin) {
  vec3 x = max(lin, vec3(0.0)) * (uExposure * 0.75);
  vec3 mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  vec3 lo = mapped * 12.92;
  vec3 hi = 1.055 * pow(mapped, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), mapped));
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float sdCircle(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// O(1) jittered micro-flash layer (no visible grid: randomized position per firing + rotated coordinates)
vec3 flashLayer(vec2 coord, float t, float closed, float decomp, float sparkScale, float speedScale, float seedOff) {
  vec2 cell = floor(coord);
  vec2 f = fract(coord);

  // Fast asynchronous per-cell firing cadence (quick 35-95ms flashes)
  float period = (0.18 + hash12(cell + vec2(seedOff, 1.7)) * 0.28) / speedScale;
  float phaseOff = hash12(cell + vec2(seedOff, 4.3)) * period;
  float ts = t + phaseOff;
  float cycle = floor(ts / period);
  float age = ts - cycle * period;

  // Ultra-quick sharp onset + fast decay flash envelope
  float peakT = 0.015 / speedScale;
  float u = age / peakT;
  float env = (u > 0.0 && u < 6.0) ? (u * exp(1.0 - u)) : 0.0;

  // Plentiful firing when closed; sparser when open
  float fireRoll = hash12(cell * 1.37 + vec2(cycle * 7.3, seedOff));
  float fireChance = mix(0.14 + decomp * 0.14, 0.58, closed);
  if (env < 0.005 || fireRoll > fireChance) return vec3(0.0);

  // Random non-grid sub-cell center per firing event
  vec2 center = vec2(
    0.16 + 0.68 * hash12(cell + vec2(cycle * 11.1, seedOff + 2.1)),
    0.16 + 0.68 * hash12(cell + vec2(cycle * 17.7, seedOff + 5.9))
  );
  vec2 d = f - center;
  float r = sparkScale * (0.65 + 0.65 * hash12(cell + vec2(cycle, seedOff + 8.3)));
  float dotMask = exp(-dot(d, d) / max(1e-5, r * r));

  // Vivid chromatic flash tint (closely matches closed-eye colorfulness when open)
  vec3 raw = hash32(cell * 2.13 + vec2(cycle * 9.1, seedOff));
  vec3 vivid = smoothstep(0.10, 0.88, raw);
  float luma = dot(vivid, vec3(0.299, 0.587, 0.114));
  vec3 tint = mix(vec3(luma), mix(vec3(0.95, 0.97, 1.0), vivid, 0.92), mix(0.84, 0.98, closed));

  float amp = mix(0.10 + decomp * 0.06, 0.52, closed);
  return tint * dotMask * env * amp;
}

// Plentiful, tiny, ultra-quick non-grid photopsia flashes (2 rotated O(1) jittered scales, 0 texture reads)
vec3 computeFlashPhosphenes(vec2 px, float t, float closed, float decomp) {
  mat2 rot1 = mat2(0.92, -0.39, 0.39, 0.92);
  mat2 rot2 = mat2(0.60,  0.80, -0.80, 0.60);
  // Layer 1: very small, rapid pinpoint sparks (~2px radius, ~16px avg spacing)
  vec3 fine = flashLayer((rot1 * px) / 16.0, t, closed, decomp, 0.12, 1.15, 3.1);
  // Layer 2: slightly larger quick micro-flashes (~4px radius, ~30px avg spacing)
  vec3 mid = flashLayer((rot2 * px) / 30.0, t, closed, decomp, 0.13, 0.85, 19.7) * 0.72;
  return fine + mid;
}

// Realism OD sampling (intrinsic VOD 0.7 BCVA + uniform 12-tap CoC + smooth quarter-res +13 D blur; Focus does not alter OD acuity)
vec3 sampleOD(
  vec2 baseUv,
  float isoBlurUV,
  float astBlurUV,
  vec2 astDir,
  float hoaStrength,
  float motionSmearUV,
  float chromaShiftUV,
  vec2 radialDir,
  float angleSeed
) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  vec2 perpDir = vec2(-astDir.y, astDir.x);
  vec2 cUv = clamp(baseUv, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(tColorOD, cUv).rgb;

  // High-plus eccentric lateral chromatic aberration (Delta = c * D)
  if (chromaShiftUV > 0.0003) {
    vec2 cOff = radialDir * chromaShiftUV * invAspect;
    col.r = texture2D(tColorOD, clamp(baseUv + cOff, vec2(0.001), vec2(0.999))).r;
    col.b = texture2D(tColorOD, clamp(baseUv - cOff, vec2(0.001), vec2(0.999))).b;
  }

  // Smooth crossfade into pre-blurred quarter-res OD for heavy CoC & uncorrected +13 D aphakia
  float heavyBlurMix = smoothstep(0.011, 0.032, isoBlurUV);
  float fineBlurUV = min(isoBlurUV, 0.016);
  float blurDrive = fineBlurUV + motionSmearUV;

  if (heavyBlurMix < 0.995 && blurDrive > 0.0004) {
    vec3 acc = vec3(0.0);
    const int TAPS = 12;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(TAPS));
      float theta = fi * 2.39996323 + angleSeed;
      vec2 disk = vec2(cos(theta), sin(theta)) * r;
      vec2 off = disk * fineBlurUV + astDir * (disk.x * astBlurUV) + perpDir * (disk.y * astBlurUV * 0.25) + vec2(disk.x * motionSmearUV, 0.0);
      acc += texture2D(tColorOD, clamp(baseUv + off * invAspect, vec2(0.001), vec2(0.999))).rgb;
    }
    vec3 blurred = acc / float(TAPS);
    col = mix(col, blurred, smoothstep(0.0004, 0.0018, blurDrive));
  }

  if (heavyBlurMix > 0.005) {
    // Extra 4-tap wide gather over pre-blurred target yields smooth ~2.8 deg +13 D aphakic blur with zero text leakage
    float extraR = max(0.0, isoBlurUV - 0.022) * 0.65;
    vec3 heavy = vec3(0.0);
    for (int j = 0; j < 4; j++) {
      float ang = float(j) * 1.5707963 + angleSeed * 0.5;
      vec2 hOff = (vec2(cos(ang), sin(ang)) * extraR + astDir * (cos(ang) * astBlurUV * 0.5)) * invAspect;
      heavy += texture2D(tBlurOD, clamp(baseUv + hOff, vec2(0.003), vec2(0.997))).rgb;
    }
    heavy *= 0.25;
    col = mix(col, heavy, heavyBlurMix);
  }

  // Subtle directional 123-deg astigmatism micro-edge artifact (damped when heavy +13 D blur already dominates)
  if (heavyBlurMix < 0.85) {
    vec2 astEdgeOff = astDir * astBlurUV * invAspect;
    vec3 astGhost = 0.5 * (
      texture2D(tColorOD, clamp(baseUv + astEdgeOff, vec2(0.001), vec2(0.999))).rgb +
      texture2D(tColorOD, clamp(baseUv - astEdgeOff, vec2(0.001), vec2(0.999))).rgb
    );
    col = mix(col, astGhost, 0.10 * (1.0 - heavyBlurMix));
  }

  // Daytime constricted-pupil astigmatism & corneal HOAs (runs in linear HDR before ACES + sRGB)
  if (hoaStrength > 0.01) {
    vec3 flare = vec3(0.0);
    // 1. Directional astigmatic light streaks along 123-deg meridian
    for (int s = 1; s <= 3; s++) {
      float rad = float(s) * 0.012;
      float w = 0.10 / float(s);
      vec2 dA = astDir * rad * invAspect;
      vec3 cPos = texture2D(tColorOD, clamp(baseUv + dA, vec2(0.001), vec2(0.999))).rgb;
      vec3 cNeg = texture2D(tColorOD, clamp(baseUv - dA, vec2(0.001), vec2(0.999))).rgb;
      float bPos = pow(smoothstep(0.78, 1.15, dot(cPos, vec3(0.299, 0.587, 0.114))), 1.6);
      float bNeg = pow(smoothstep(0.78, 1.15, dot(cNeg, vec3(0.299, 0.587, 0.114))), 1.6);
      flare += (cPos * bPos + cNeg * bNeg) * w;
    }
    // 2. Subtle spherical-aberration halo + asymmetric coma tail
    vec2 comaAxis = normalize(astDir + vec2(0.28, -0.46));
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float ang = fj * 1.5707963 + angleSeed * 0.5;
      vec2 haloOff = vec2(cos(ang), sin(ang)) * 0.025 * invAspect;
      vec3 hc = texture2D(tColorOD, clamp(baseUv + haloOff, vec2(0.001), vec2(0.999))).rgb;
      float hb = pow(smoothstep(0.80, 1.20, dot(hc, vec3(0.299, 0.587, 0.114))), 1.7);
      flare += hc * hb * 0.065;
    }
    vec3 comaCol = texture2D(tColorOD, clamp(baseUv + comaAxis * 0.019 * invAspect, vec2(0.001), vec2(0.999))).rgb;
    float comaB = pow(smoothstep(0.78, 1.15, dot(comaCol, vec3(0.299, 0.587, 0.114))), 1.5);
    flare += comaCol * comaB * 0.12;

    col += flare * hoaStrength;
  }

  // Convert linear HDR scene light to ACES Filmic sRGB, then apply perceptual VOD 0.7 contrast rolloff
  col = linearToDisplay(col);
  col = mix(vec3(0.5), col, 0.965);

  return col;
}

// 8-tap uniform Vogel disk for amblyopic OS (VOS 0.15) with smooth crossfade into tBlurOD for +13 D uncorrected blur
vec3 sampleOS(vec2 baseUv, float isoBlurUV, float motionSmearUV, float angleSeed) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  float heavyBlurMix = smoothstep(0.014, 0.034, isoBlurUV);
  float fineBlurUV = min(isoBlurUV, 0.018);

  vec3 col = vec3(0.0);
  if (heavyBlurMix < 0.995) {
    const int TAPS = 8;
    float rx = fineBlurUV + motionSmearUV;
    float ry = fineBlurUV;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(TAPS));
      float theta = fi * 2.39996323 + angleSeed;
      vec2 off = vec2(cos(theta) * rx, sin(theta) * ry) * r;
      col += texture2D(tColorOD, clamp(baseUv + off * invAspect, vec2(0.002), vec2(0.998))).rgb;
    }
    col /= float(TAPS);
  }
  if (heavyBlurMix > 0.005) {
    vec3 heavy = texture2D(tBlurOD, clamp(baseUv, vec2(0.003), vec2(0.997))).rgb;
    col = mix(col, heavy, heavyBlurMix);
  }
  return linearToDisplay(col);
}

// Diffuse bright-only light bleed through closed eyelids (zero recognizable room shapes)
vec3 sampleClosedEyelidGlare(vec2 baseUv, float angleSeed) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  vec3 glare = vec3(0.0);
  const int GTAPS = 6;
  for (int i = 0; i < GTAPS; i++) {
    float fi = float(i);
    float r = 0.06 + 0.14 * sqrt((fi + 0.5) / float(GTAPS));
    float theta = fi * 2.39996323 + angleSeed;
    vec3 sc = texture2D(tColorOD, clamp(baseUv + vec2(cos(theta), sin(theta)) * r * invAspect, vec2(0.005), vec2(0.995))).rgb;
    float bright = pow(smoothstep(0.74, 1.0, dot(sc, vec3(0.299, 0.587, 0.114))), 1.6);
    glare += vec3(1.0, 0.52, 0.28) * bright;
  }
  return glare / float(GTAPS);
}

void main() {
  // Comparison mode (V): always clean ACES + sRGB baseline normal vision regardless of eyelid transition
  if (uCompareNormal > 0.5) {
    gl_FragColor = vec4(linearToDisplay(texture2D(tColorOD, vUv).rgb), 1.0);
    return;
  }

  vec2 px = vUv * uResolution;
  float noiseAngle = ign(px + fract(uTime * 17.3) * 100.0) * 6.2831853;

  // Aspect-normalized screen space centered at (0, 0), height = 1.0
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Round amber executive bifocal worn close at ~13mm vertex distance (fills viewport while keeping rim/scotoma visible)
  vec2 cL = vec2(-0.36, -0.01);
  vec2 cR = vec2( 0.36, -0.01);
  float lensR = 0.49;

  float dL = sdCircle(p, cL, lensR);
  float dR = sdCircle(p, cR, lensR);
  float dLenses = min(dL, dR);

  // Subtle amber acetate nose bridge right at the upper rim cusp
  float dBridge = sdSegment(p, vec2(-0.048, 0.325), vec2(0.048, 0.325)) - 0.016;
  float rimThickness = 0.025;
  float rimBand = min(abs(dLenses) - rimThickness * 0.5, dBridge);
  float glassesOn = step(0.5, uGlassesOn);

  float inLens = glassesOn * (1.0 - smoothstep(-0.004, 0.004, dLenses));
  // OD (right lens + central binocular overlap) is always favored at VOD 0.7; left-only lens shows amblyopic VOS 0.15
  float inRightLens = glassesOn * (1.0 - smoothstep(-0.012, 0.012, dR));
  float inLeftOnly = inLens * (1.0 - inRightLens);
  float rimMask = glassesOn * (1.0 - smoothstep(-0.004, 0.004, rimBand));

  // Executive bifocal: straight horizontal split across the middle of both lenses
  float splitY = -0.02;
  float dSplit = p.y - splitY;
  float inBifocal = inLens * (1.0 - smoothstep(-0.004, 0.004, dSplit));
  float bifocalLine = inLens * (1.0 - smoothstep(0.0, 0.0055, abs(dSplit)));

  // High-plus (+13D / +16.5D) 1994 optical UV mapping + distinct split-line jump + jack-in-the-box ring scotoma
  vec2 pOpt = p - vec2(0.0, -0.02);
  float rLen = length(pOpt);
  float r2 = dot(pOpt, pOpt);
  float rLens = clamp(min(length(p - cL), length(p - cR)) / lensR, 0.0, 1.2);
  float periphFactor = smoothstep(0.42, 0.98, rLens);
  float mag = mix(1.24, 1.29, inBifocal);
  float pincushion = 1.0 + 0.24 * r2;
  vec2 pMag = pOpt / (mag * pincushion) + vec2(0.0, -0.02);
  pMag += vec2(0.0, -0.022) * inBifocal; // Distinct 1994 bifocal split-line image jump
  vec2 uvLens = pMag / vec2(uAspect, 1.0) + 0.5;

  // Outside rim: outward prismatic dead-band creates authentic ~11-13 deg roving ring scotoma jump
  vec2 radialDir = rLen > 1e-4 ? (pOpt / rLen) : vec2(0.0);
  float scotomaBand = glassesOn * (1.0 - inLens) * exp(-max(0.0, dLenses) * 11.0);
  vec2 uvOutside = vUv + (radialDir * 0.065 * scotomaBand) / vec2(uAspect, 1.0);
  vec2 uvOD = mix(uvOutside, uvLens, inLens);

  vec3 col = vec3(0.0);
  // Reserve-depletion -> tipping-point crash curve (matches state.js computeDecompensation)
  float decomp = smoothstep(0.58, 0.96, uFatigue);

  if (uEyelidClose < 0.995) {
    float depthOD = linearizeDepth(texture2D(tDepthOD, clamp(uvOD, vec2(0.001), vec2(0.999))).x);
    // Distance half: crisp on ~2.1m..23m blackboard/room;
    // Near half (~21cm childhood aphakic reading distance): tight zero-accommodation sweet spot (~19..24cm)
    float targetFocus = mix(3.8, 0.27, inBifocal);
    float dofTolerance = mix(0.30, 1.15, inBifocal);
    float cocDiopters = max(0.0, abs(1.0 / max(depthOD, 0.02) - 1.0 / targetFocus) - dofTolerance);

    // Intrinsic VOD 0.7 in right lens & binocular overlap vs amblyopic VOS 0.15 in left-only lens (unchanged by Focus)
    float baseAcuityBlur = mix(0.0008, 0.0052, inLeftOnly) + decomp * 0.0014;
    float periphBlur = inLens * periphFactor * periphFactor * 0.0055;
    float correctedBlur = clamp(baseAcuityBlur + periphBlur + cocDiopters * 0.0045, 0.0, 0.038);
    float aphakicBlur = 0.044;
    float isoBlurOD = mix(aphakicBlur, correctedBlur, inLens);

    vec2 astDirOD = normalize(mix(vec2(cos(radians(123.0)), sin(radians(123.0))), vec2(1.0, 0.0), inLeftOnly));
    float astBlurOD = mix(0.011, 0.0012 + inLeftOnly * 0.0022 + periphFactor * 0.0032, inLens) + decomp * 0.0014;
    float hoaOD = mix(0.55, 0.34 + decomp * 0.24, inLens);
    float chromaOD = inLens * clamp(rLens * rLens * 0.0072, 0.0, 0.0068);

    vec3 colOD = sampleOD(
      uvOD, isoBlurOD, astBlurOD, astDirOD, hoaOD, uMlnVelUV, chromaOD, radialDir, noiseAngle
    );
    // Slightly lower amblyopic contrast in left-only lens (VOS 0.15) to visually reinforce OD dominance
    colOD = mix(colOD, mix(vec3(0.5), colOD, 0.92), inLeftOnly);

    // Constant angular diplopia sampled from OD view: fake OS image ALWAYS stays left & up at every distance/depth edge
    vec2 diplopiaUV = vec2(
      DIPLOPIA_TAN.x / (2.0 * uAspect * TAN_HALF_Y),
      DIPLOPIA_TAN.y / (2.0 * TAN_HALF_Y)
    );
    vec2 uvOS = clamp(uvOD - diplopiaUV, vec2(0.002), vec2(0.998));

    float depthOS = linearizeDepth(texture2D(tDepthOD, uvOS).x);
    float cocOS = max(0.0, abs(1.0 / max(depthOS, 0.02) - 1.0 / targetFocus) - dofTolerance);
    // VOS 0.15 amblyopic softness (softer than VOD 0.7 yet clearly legible in shape/strokes) + CoC / uncorrected +13 D blur
    float isoBlurOS = mix(aphakicBlur, 0.0022 + clamp(cocOS * 0.0072, 0.0, 0.028), inLens);
    vec3 colOS = sampleOS(uvOS, isoBlurOS, uMlnVelUV, noiseAngle + 1.57);

    float lumaOD = dot(colOD, vec3(0.299, 0.587, 0.114));
    float lumaOS = dot(colOS, vec3(0.299, 0.587, 0.114));
    colOS = mix(colOS, vec3(lumaOS), 0.04) * 0.99;

    // Binocular rivalry: OD stays sharp & dominant (>=56% linear), while rivalry term keeps dark-on-light (ink) & light-on-dark (chalk) OS strokes bold
    float odNearSolid = smoothstep(0.95, 0.55, depthOD) * smoothstep(0.08, 0.25, depthOS - depthOD);
    float focusClamped = clamp(uFocusEffort, 0.0, 1.0);
    float baseOsBlend = mix(0.38, 0.58, clamp(uOcclOD, 0.0, 1.0));
    float osWeight = mix(baseOsBlend * (1.0 - 0.58 * focusClamped), 0.14, odNearSolid * 0.65);

    vec3 linMix = mix(colOD, colOS, osWeight);
    vec3 localBgDisp = linearToDisplay(texture2D(tBlurOD, clamp(uvOD, vec2(0.003), vec2(0.997))).rgb);
    float localBg = dot(localBgDisp, vec3(0.299, 0.587, 0.114));
    float bgBright = smoothstep(0.32, 0.62, localBg);
    vec3 rival = mix(max(colOD, colOS), min(colOD, colOS), bgBright);
    float edgeStrength = smoothstep(0.03, 0.28, abs(lumaOS - lumaOD));
    float rivalMix = edgeStrength * mix(0.46, 0.18, focusClamped) * (1.0 - odNearSolid * 0.65);
    col = mix(linMix, rival, rivalMix);

    // Subtle intraocular veiling glare when looking toward bright sunny windows
    float veil = smoothstep(0.45, 0.96, uEyelidLight) * (0.028 + decomp * 0.03);
    col += vec3(0.98, 0.96, 0.90) * veil;

    // Dark ring scotoma dead-band transition just outside the high-plus rim
    col *= (1.0 - scotomaBand * 0.28);

    // Crisp horizontal executive bifocal ledge reflection
    float ledgeShade = mix(-0.06, 0.095, smoothstep(-0.003, 0.003, dSplit));
    col += vec3(ledgeShade) * bifocalLine;

    // Warm translucent amber acetate rim + gentle bevel highlight
    if (rimMask > 0.01) {
      vec3 amberTint = vec3(0.72, 0.40, 0.11);
      float rimBevel = smoothstep(0.0, 0.011, abs(dLenses));
      vec3 rimCol = mix(col * amberTint * 1.15 + amberTint * 0.24, amberTint * 0.85, 0.45);
      rimCol += vec3(0.14, 0.10, 0.04) * (1.0 - rimBevel) * 0.5;
      col = mix(col, rimCol, rimMask * 0.88);
    }

    // Asthenopia crash vignette appears only past the compensatory reserve tipping point
    float vig = smoothstep(0.36, 0.94, length(p));
    col *= (1.0 - decomp * vig * 0.28);
  }

  // Eyelid closure (R): sunlit daytime warm reddish-amber eyelid translucency modulated by gaze light + diffuse bright glare
  if (uEyelidClose > 0.005) {
    float lidEdge = smoothstep(uEyelidClose * 1.15 - 0.15, uEyelidClose * 1.15 + 0.05, abs(p.y) * 2.0 + 0.06 * (p.x * p.x));
    float closedMask = mix(1.0 - lidEdge, 1.0, smoothstep(0.75, 1.0, uEyelidClose));
    vec3 lidBase = mix(vec3(0.095, 0.036, 0.026), vec3(0.42, 0.165, 0.082), clamp(uEyelidLight, 0.0, 1.0));
    vec3 diffuseGlare = sampleClosedEyelidGlare(vUv, noiseAngle);
    vec3 innerLid = lidBase + diffuseGlare * 0.45;
    col = mix(col, innerLid, clamp(closedMask * uEyelidClose, 0.0, 1.0));
  }

  // Plentiful tiny ultra-quick photopsia flashes: additive on dark/mid scenes, contrast-preserving over bright windows/lights
  vec3 phos = computeFlashPhosphenes(px + uMlnOffsetUV * uResolution * 0.35, uTime, uEyelidClose, decomp);
  float phosMag = max(phos.r, max(phos.g, phos.b));
  float bgLuma = dot(col, vec3(0.299, 0.587, 0.114));
  float brightBg = smoothstep(0.55, 0.92, bgLuma);
  vec3 phosHue = phos / max(phosMag, 1e-4);
  col = mix(col + phos, mix(col, phosHue * 0.62, clamp(phosMag * 3.0, 0.0, 0.72)), brightBg);

  // Full-FOV drifting vitreous floaters across entire screen (inside AND outside glasses frames)
  float speckVis = mix(1.0, 0.25, uEyelidClose);
  float speckShadow = 0.0;
  float halfW = uAspect * 0.48;
  const int FLOATERS = 10;
  for (int k = 0; k < FLOATERS; k++) {
    float fk = float(k);
    vec2 basePos = vec2(
      (hash12(vec2(fk, 2.3)) * 2.0 - 1.0) * halfW,
      (hash12(vec2(fk, 5.7)) * 2.0 - 1.0) * 0.47
    );
    vec2 drift = vec2(
      sin(fk * 1.93 + uTime * (0.16 + mod(fk, 4.0) * 0.03)) * 0.06,
      cos(fk * 1.47 + uTime * (0.13 + mod(fk, 3.0) * 0.03)) * 0.045
    );
    vec2 fPos = basePos + drift + uMlnOffsetUV * 2.2;
    float dSpeck = length(p - fPos);
    float rSpeck = 0.007 + 0.005 * hash12(vec2(fk, 9.1));
    speckShadow += (1.0 - smoothstep(rSpeck * 0.3, rSpeck * 2.3, dSpeck)) * 0.12 * speckVis;
  }
  col *= (1.0 - clamp(speckShadow, 0.0, 0.32));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
