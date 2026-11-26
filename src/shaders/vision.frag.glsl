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
uniform float uAmbientLight;
uniform float uFatigue;
uniform float uOcclOD;
uniform float uFocusEffort;
uniform float uCompareNormal;
uniform vec2 uMlnOffsetUV;
uniform float uMlnVelUV;
uniform float uExposure;
uniform vec2 uResolution;
uniform float uLensProfile;
uniform float uLensPowerD;
uniform float uNearAddD;
uniform float uLensCylD;
uniform float uLensAxisRad;
uniform float uMyopiaD;
uniform float uPresbyopiaD;
uniform float uAstigmatismD;
uniform float uAstigmatismAxisRad;
uniform float uDomIsOS;
uniform float uAcuityBlurDom;
uniform float uAcuityBlurNonDom;
uniform vec2 uDiplopiaTan;
uniform float uPhospheneScale;
uniform float uFloaterScale;
uniform float uGlaucoma;
uniform float uAmd;
uniform float uAlbinism;
uniform float uCataract;
uniform float uDiabeticRetinopathy;
uniform float uRetinitisPigmentosa;
uniform float uCvdType;
uniform float uCvdSeverity;

varying vec2 vUv;

const float TAN_HALF_Y = 0.6008606; // tan(31 deg) for 62 deg OD camera
// Default diplopia angular offset matching state.js: -1.53 deg L (~1.0cm / 2 squares @ 0.375m), +0.31 deg U (~0.2cm)

float linearizeDepth(float d) {
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(0.0001, (uFar + uNear - ndc * (uFar - uNear)));
}

// Gamut-preserving Stephen Hill ACES Filmic tone mapping + IEC sRGB encoding (calibrated for linear classroom HDR)
vec3 linearToDisplay(vec3 lin) {
  mat3 inMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  mat3 outMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );
  vec3 v = inMat * (max(lin, vec3(0.0)) * (uExposure * 0.95));
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  vec3 mapped = clamp(outMat * (a / b), 0.0, 1.0);
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

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
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
  float veilAmount,
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

  // Smooth crossfade into pre-blurred quarter-res OD for heavy CoC, low acuity (20/200..20/400), & uncorrected +13 D aphakia
  float heavyBlurMix = smoothstep(0.011, 0.028, isoBlurUV);
  float fineBlurUV = min(isoBlurUV, 0.016);
  float blurDrive = fineBlurUV + motionSmearUV;

  if (heavyBlurMix < 0.995 && blurDrive > 0.00012) {
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
    col = mix(col, blurred, smoothstep(0.00012, 0.0009, blurDrive));
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
  if (heavyBlurMix < 0.85 && astBlurUV > 0.0001) {
    vec2 astEdgeOff = astDir * astBlurUV * invAspect;
    vec3 astGhost = 0.5 * (
      texture2D(tColorOD, clamp(baseUv + astEdgeOff, vec2(0.001), vec2(0.999))).rgb +
      texture2D(tColorOD, clamp(baseUv - astEdgeOff, vec2(0.001), vec2(0.999))).rgb
    );
    col = mix(col, astGhost, 0.06 * (1.0 - heavyBlurMix));
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

  // Add subtle linear intraocular glare before ACES + sRGB (prevents lifting blacks into gray haze)
  col += vec3(0.98, 0.96, 0.92) * veilAmount;
  return col;
}

// 8-tap uniform Vogel disk for amblyopic OS (VOS 0.15) with smooth crossfade into tBlurOD for +13 D uncorrected blur
vec3 sampleOS(vec2 baseUv, float isoBlurUV, float motionSmearUV, float veilAmount, float angleSeed) {
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
  col += vec3(0.98, 0.96, 0.92) * veilAmount;
  return col;
}

// Clinical pathologies & Machado (2009) CVD in linear HDR space before ACES + sRGB tone mapping
vec3 applyLinearPathologies(vec3 linCol, vec2 uv, vec2 p, vec2 pFovea) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);

  // 1. Cataracts: wide forward disability-glare scatter, cortical contrast loss, Beer-Lambert nuclear brunescence (100% = light perception only)
  if (uCataract > 0.005) {
    vec3 blurCenter = texture2D(tBlurOD, clamp(uv, vec2(0.003), vec2(0.997))).rgb;
    vec3 wideScatter = blurCenter * 0.28;
    float spread = 0.020 + 0.042 * uCataract;
    for (int j = 0; j < 4; j++) {
      float ang = float(j) * 1.5707963 + 0.35;
      vec2 off = vec2(cos(ang), sin(ang)) * spread * invAspect;
      wideScatter += texture2D(tBlurOD, clamp(uv + off, vec2(0.003), vec2(0.997))).rgb * 0.18;
    }
    float scatterLuma = dot(wideScatter, vec3(0.2126, 0.7152, 0.0722));
    float glareBoost = smoothstep(0.32, 1.35, scatterLuma) * uCataract;
    float scatterMix = smoothstep(0.0, 0.94, uCataract);
    linCol = mix(linCol, wideScatter, scatterMix);
    linCol = mix(linCol, vec3(max(0.04, scatterLuma)), uCataract * 0.36);
    linCol += wideScatter * (0.28 * uCataract + 0.38 * glareBoost);
    linCol *= exp(-uCataract * vec3(0.06, 0.24, 0.78));
  }

  // 2. Ocular Albinism: iris transillumination photophobia glare driven by tBlurOD luminance & uEyelidLight
  if (uAlbinism > 0.005) {
    vec3 albBlur = texture2D(tBlurOD, clamp(uv, vec2(0.003), vec2(0.997))).rgb;
    float sceneLuma = dot(albBlur, vec3(0.2126, 0.7152, 0.0722));
    float lightDrive = clamp(sceneLuma * 0.65 + clamp(uEyelidLight, 0.0, 1.0) * 0.55, 0.0, 1.5);
    float periph = smoothstep(0.15, 0.85, length(p));
    vec3 transillumTint = mix(vec3(1.0, 0.96, 0.94), vec3(1.0, 0.76, 0.72), periph * 0.45);
    linCol += albBlur * (0.28 * uAlbinism) + transillumTint * (lightDrive * uAlbinism * 0.22);
  }

  // 3. Wet AMD: retinal-locked irregular perceptual central scotoma around pFovea (100% = dense central blindness, intact periphery)
  if (uAmd > 0.005) {
    float rFov = length(pFovea);
    float ang = rFov > 1e-4 ? atan(pFovea.y, pFovea.x) : 0.0;
    float irreg = 1.0 + 0.18 * sin(ang * 3.0 + 0.7) + 0.11 * cos(ang * 5.0 - 1.2);
    float scotomaR = (0.045 + 0.205 * uAmd) * irreg;
    float scotomaMask = 1.0 - smoothstep(scotomaR * 0.24, scotomaR, rFov);
    float coreMask = 1.0 - smoothstep(scotomaR * 0.08, scotomaR * 0.68, rFov);

    vec3 fillCol = texture2D(tBlurOD, clamp(uv, vec2(0.003), vec2(0.997))).rgb;
    float fillLuma = max(0.02, dot(fillCol, vec3(0.2126, 0.7152, 0.0722)));
    vec3 mutedFill = mix(fillCol, vec3(fillLuma * 0.75), 0.48 + 0.45 * uAmd);
    linCol = mix(linCol, mutedFill, scotomaMask * smoothstep(0.05, 0.45, uAmd));
    float coreDark = smoothstep(0.32, 0.96, uAmd) * coreMask;
    linCol *= (1.0 - coreDark * 0.995);
    linCol = mix(linCol, min(linCol, vec3(0.08)), coreDark);
  }

  // 4. Crabb (2013) Glaucoma: Bjerrum arcuate + peripheral perceptual filling-in; narrows past 70%, 100% = total blindness (NLP)
  if (uGlaucoma > 0.005) {
    float domSign = mix(1.0, -1.0, step(0.5, uDomIsOS));
    float nasalX = -pFovea.x * domSign;
    float r = length(pFovea);
    float rArc = length(vec2(pFovea.x * 0.85, pFovea.y * 1.15));
    float dArc = (rArc - 0.27) / 0.11;
    float bjerrumBand = exp(-(dArc * dArc))
      * smoothstep(-0.18, 0.18, nasalX)
      * smoothstep(0.06, 0.18, abs(pFovea.y) + max(0.0, nasalX) * 0.45);
    float periphStart = mix(0.58, 0.0, clamp(uGlaucoma / 0.95, 0.0, 1.0));
    float periphWidth = mix(0.24, 0.06, smoothstep(0.65, 0.98, uGlaucoma));
    float periphMask = smoothstep(periphStart, periphStart + periphWidth, r);
    float lossMask = clamp(max(periphMask, bjerrumBand * smoothstep(0.15, 0.65, uGlaucoma) * 0.92) * smoothstep(0.02, 0.35, uGlaucoma), 0.0, 1.0);

    vec2 dirFov = r > 1e-4 ? (pFovea / r) : vec2(1.0, 0.0);
    vec3 gBlur = 0.5 * (
      texture2D(tBlurOD, clamp(uv, vec2(0.003), vec2(0.997))).rgb +
      texture2D(tBlurOD, clamp(uv + dirFov * 0.020 * invAspect, vec2(0.003), vec2(0.997))).rgb
    );
    float gLuma = dot(gBlur, vec3(0.2126, 0.7152, 0.0722));
    vec3 filled = mix(gBlur, vec3(gLuma), 0.58);
    filled = mix(filled, vec3(clamp(gLuma, 0.06, 0.50)), 0.30);
    linCol = mix(linCol, filled, lossMask * 0.92);

    float endStage = smoothstep(0.68, 0.96, uGlaucoma);
    float darkInner = mix(0.28, 0.015, endStage);
    float darkOuter = mix(0.62, 0.09, endStage);
    float outerDark = smoothstep(darkInner, darkOuter, r) * endStage;
    float totalBlind = smoothstep(0.92, 1.0, uGlaucoma);
    linCol *= (1.0 - max(outerDark, totalBlind));
  }

  // 5. Diabetic Retinopathy: retinal-locked irregular hemorrhage blotches & patchy macular blur; 100% = dense vitreous hemorrhage
  if (uDiabeticRetinopathy > 0.005) {
    float dr = clamp(uDiabeticRetinopathy, 0.0, 1.0);
    float blotch = 0.0;
    float edema = 0.0;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      vec2 c = vec2(
        (hash12(vec2(fk * 3.1, 1.7)) * 2.0 - 1.0) * 0.48,
        (hash12(vec2(fk * 2.7, 8.3)) * 2.0 - 1.0) * 0.34
      );
      vec2 d = pFovea - c;
      float ang = atan(d.y, d.x);
      float wobble = 1.0 + 0.28 * sin(ang * 3.0 + fk * 1.9) + 0.16 * cos(ang * 5.0 - fk * 2.3);
      float rad = (0.025 + 0.065 * hash12(vec2(fk, 4.9))) * (0.45 + 1.35 * dr) * wobble;
      float onset = smoothstep(fk * 0.10, fk * 0.10 + 0.28, dr);
      float m = (1.0 - smoothstep(rad * 0.35, rad, length(d))) * onset;
      blotch = max(blotch, m);
      edema = max(edema, (1.0 - smoothstep(rad * 0.6, rad * 1.85, length(d))) * onset);
    }
    vec3 drBlur = texture2D(tBlurOD, clamp(uv, vec2(0.003), vec2(0.997))).rgb;
    linCol = mix(linCol, drBlur * 0.88, edema * (0.42 + 0.45 * dr));
    vec3 hemeTint = vec3(0.045, 0.012, 0.009);
    linCol = mix(linCol, hemeTint, blotch * (0.62 + 0.36 * dr));
    float vitHeme = smoothstep(0.68, 1.0, dr);
    linCol = mix(linCol, drBlur * vec3(0.28, 0.09, 0.06), vitHeme * 0.72);
    linCol *= (1.0 - smoothstep(0.88, 1.0, dr) * 0.90);
  }

  // 6. Retinitis Pigmentosa: mid-peripheral ring scotoma -> dark concentric tunnel; nyctalopia scales sharply in dim/night lighting
  if (uRetinitisPigmentosa > 0.005) {
    float rp = clamp(uRetinitisPigmentosa, 0.0, 1.0);
    float dimness = 1.0 - clamp(uAmbientLight, 0.0, 1.0);
    float r = length(pFovea);
    float tunnelR = mix(0.64, 0.0, pow(rp, 0.85)) * (1.0 - dimness * 0.32 * rp);
    float edgeW = mix(0.15, 0.035, rp);
    float tunnelMask = smoothstep(tunnelR, tunnelR + edgeW, r);
    // Early-to-moderate mid-peripheral ring scotoma (leaves sliver of far periphery until ~55%)
    float ringD = (r - 0.34) / 0.10;
    float ringScotoma = exp(-(ringD * ringD)) * smoothstep(0.08, 0.35, rp) * (1.0 - smoothstep(0.45, 0.72, rp)) * 0.70;
    // Nyctalopia: gentle shadow dim in sunlit room, strong scotopic collapse at Dusk/Night/Lights OFF
    float luma = dot(linCol, vec3(0.2126, 0.7152, 0.0722));
    float nyctThresh = mix(0.16, 0.45, dimness);
    float nyctDepth = mix(0.22, 0.90, smoothstep(0.15, 0.88, dimness));
    float dimCollapse = (1.0 - smoothstep(0.015, nyctThresh, luma)) * rp * nyctDepth;
    linCol *= (1.0 - dimCollapse);
    float totalRpBlind = smoothstep(0.93, 1.0, rp);
    linCol *= (1.0 - max(max(tunnelMask, ringScotoma), totalRpBlind));
  }

  // 7. Machado (2009) CVD in linear RGB (explicit row-major dot products)
  if (uCvdSeverity > 0.005 && uCvdType > 0.5) {
    vec3 cvdCol;
    if (uCvdType < 1.5) {
      // Deutan (uCvdType == 1)
      cvdCol = vec3(
        dot(vec3(0.367322, 0.860646, -0.227968), linCol),
        dot(vec3(0.280085, 0.672501, 0.047413), linCol),
        dot(vec3(-0.011820, 0.042940, 0.968881), linCol)
      );
    } else if (uCvdType < 2.5) {
      // Protan (uCvdType == 2)
      cvdCol = vec3(
        dot(vec3(0.152286, 1.052583, -0.204868), linCol),
        dot(vec3(0.114503, 0.786281, 0.099216), linCol),
        dot(vec3(-0.003882, -0.048116, 1.051998), linCol)
      );
    } else {
      // Tritan (uCvdType == 3)
      cvdCol = vec3(
        dot(vec3(1.255528, -0.076749, -0.178779), linCol),
        dot(vec3(-0.078411, 0.930809, 0.147602), linCol),
        dot(vec3(0.004733, 0.691367, 0.303900), linCol)
      );
    }
    linCol = mix(linCol, clamp(cvdCol, 0.0, 4.0), clamp(uCvdSeverity, 0.0, 1.0));
  }

  return linCol;
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
  vec2 pFovea = p - uMlnOffsetUV * vec2(uAspect, 1.0) * 0.45;

  float hasLens = step(0.5, uLensProfile);
  float isAphakic = hasLens * (1.0 - step(1.5, uLensProfile));
  float isSingleVision = step(1.5, uLensProfile) * (1.0 - step(2.5, uLensProfile));
  float isModernBifocal = step(2.5, uLensProfile) * (1.0 - step(3.5, uLensProfile));
  float isProgressive = step(3.5, uLensProfile);
  float isModernLens = step(1.5, uLensProfile);
  float glassesOn = hasLens * step(0.5, uGlassesOn);
  float powerRatio = clamp(abs(uLensPowerD) / 13.0, 0.35, 1.5);
  float addRatio = clamp(uNearAddD / 4.0, 0.0, 1.35);

  // Distinct auto-matched frame geometry per lens type:
  // 1: Aphakic Bifocal (thick round amber executive)
  // 2: Single-Vision (sharp matte-black rectangular)
  // 3: Bifocal (taller warm tortoiseshell rounded-rect + flat-top D-segment window)
  // 4: Progressive (semi-rimless brushed-titanium top-bar + rimless lower glass edge)
  vec2 cL = isAphakic > 0.5 ? vec2(-0.36, -0.01) : vec2(-0.38, -0.01);
  vec2 cR = isAphakic > 0.5 ? vec2( 0.36, -0.01) : vec2( 0.38, -0.01);
  float lensR = 0.49;
  vec2 boxHalf = isModernBifocal > 0.5
    ? vec2(0.36, 0.34)
    : (isProgressive > 0.5 ? vec2(0.38, 0.31) : vec2(0.37, 0.26));
  float boxRad = isModernBifocal > 0.5 ? 0.12 : (isProgressive > 0.5 ? 0.08 : 0.05);

  float dL = isAphakic > 0.5 ? sdCircle(p, cL, lensR) : sdRoundedBox(p - cL, boxHalf, boxRad);
  float dR = isAphakic > 0.5 ? sdCircle(p, cR, lensR) : sdRoundedBox(p - cR, boxHalf, boxRad);
  float dLenses = min(dL, dR);

  float bridgeY = isAphakic > 0.5 ? 0.325 : (isModernBifocal > 0.5 ? 0.17 : 0.13);
  float bridgeHalfW = isAphakic > 0.5 ? 0.048 : 0.040;
  float bridgeR = isAphakic > 0.5 ? 0.016 : (isProgressive > 0.5 ? 0.008 : 0.012);
  float dBridge = sdSegment(p, vec2(-bridgeHalfW, bridgeY), vec2(bridgeHalfW, bridgeY)) - bridgeR;
  float rimThickness = isAphakic > 0.5 ? 0.025 : (isModernBifocal > 0.5 ? 0.019 : (isProgressive > 0.5 ? 0.011 : 0.015));
  float dRimFull = abs(dLenses) - rimThickness * 0.5;
  float rimBand = min(dRimFull, dBridge);

  float inLens = glassesOn * (1.0 - smoothstep(-0.004, 0.004, dLenses));
  // Dominant eye (OD or OS via uDomIsOS) + central binocular overlap vs non-dominant-only lens
  float inLeftLens = glassesOn * (1.0 - smoothstep(-0.012, 0.012, dL));
  float inRightLens = glassesOn * (1.0 - smoothstep(-0.012, 0.012, dR));
  float inDomLens = mix(inRightLens, inLeftLens, step(0.5, uDomIsOS));
  float inNonDomOnly = inLens * (1.0 - inDomLens);
  // Semi-rimless Progressive shows metallic browline on upper half only, plus delicate lower glass-edge glint
  float upperHalfMask = smoothstep(-0.04, 0.04, p.y);
  float rimMask = glassesOn * (1.0 - smoothstep(-0.004, 0.004, rimBand)) * mix(1.0, max(upperHalfMask, 1.0 - smoothstep(-0.004, 0.004, dBridge)), isProgressive);
  float glassEdgeGlint = glassesOn * isProgressive * (1.0 - upperHalfMask) * (1.0 - smoothstep(0.0, 0.007, abs(dLenses)));

  // Executive straight split (Aphakic) vs Flat-Top D-Segment (Modern Bifocal) vs Smooth Corridor (Progressive)
  float splitY = -0.02;
  float dSplit = p.y - splitY;
  float hasAphakicSplit = isAphakic * smoothstep(0.15, 0.45, uNearAddD);
  float inAphakicBifocal = inLens * hasAphakicSplit * (1.0 - smoothstep(-0.004, 0.004, dSplit));
  float aphakicSplitLine = inLens * hasAphakicSplit * (1.0 - smoothstep(0.0, 0.0055, abs(dSplit)));

  // Classic D-shaped flat-top reading segment in lower-inner quadrant of each modern bifocal lens
  float hasModernBifocal = isModernBifocal * smoothstep(0.15, 0.45, uNearAddD);
  float dSegL = max(p.y - (-0.075), sdRoundedBox(p - vec2(cL.x + 0.055, -0.185), vec2(0.165, 0.115), 0.085));
  float dSegR = max(p.y - (-0.075), sdRoundedBox(p - vec2(cR.x - 0.055, -0.185), vec2(0.165, 0.115), 0.085));
  float dSeg = min(dSegL, dSegR);
  float inModernBifocal = inLens * hasModernBifocal * (1.0 - smoothstep(-0.004, 0.004, dSeg));
  float dSegLine = inLens * hasModernBifocal * (1.0 - smoothstep(0.0, 0.006, abs(dSeg)));

  float inBifocal = max(inAphakicBifocal, inModernBifocal);
  float bifocalLine = max(aphakicSplitLine, dSegLine);
  float palBlend = inLens * isProgressive * smoothstep(0.09, -0.22, p.y);
  float palLat = min(abs(p.x - cL.x), abs(p.x - cR.x)) / 0.36;
  float palSwim = inLens * isProgressive * smoothstep(0.24, 0.88, palLat) * smoothstep(0.14, -0.22, p.y) * clamp(uNearAddD / 2.25, 0.0, 1.6);

  // Optical UV mapping: exact +13/+17 D aphakic mapping vs modern single-vision/bifocal/progressive + toric meridional mag
  vec2 pOpt = p - vec2(0.0, -0.02);
  float rLen = length(pOpt);
  float r2 = dot(pOpt, pOpt);
  float rLens = clamp(min(length(p - cL), length(p - cR)) / lensR, 0.0, 1.2);
  float periphFactor = isAphakic * smoothstep(0.42, 0.98, rLens);
  float effModernD = inLens * isModernLens * (uLensPowerD + uNearAddD * max(inModernBifocal, palBlend));

  vec2 uvOD = vUv;
  float scotomaBand = 0.0;
  vec2 radialDir = rLen > 1e-4 ? (pOpt / rLen) : vec2(0.0);

  if (isAphakic > 0.5) {
    float mag = mix(1.0 + 0.24 * powerRatio, 1.0 + 0.24 * powerRatio + 0.05 * addRatio, inBifocal);
    float pincushion = 1.0 + (0.24 * powerRatio) * r2;
    vec2 pMag = pOpt / (mag * pincushion) + vec2(0.0, -0.02);
    pMag += vec2(0.0, -0.022 * addRatio) * inBifocal; // Distinct bifocal split-line image jump
    vec2 uvLens = pMag / vec2(uAspect, 1.0) + 0.5;
    scotomaBand = glassesOn * (1.0 - inLens) * exp(-max(0.0, dLenses) * 11.0);
    vec2 uvOutside = vUv + (radialDir * (0.065 * powerRatio) * scotomaBand) / vec2(uAspect, 1.0);
    uvOD = mix(uvOutside, uvLens, inLens);
  } else if (isModernLens > 0.5 && glassesOn > 0.5) {
    float modMag = clamp(1.0 + effModernD * 0.017, 0.82, 1.20);
    float modDist = 1.0 + clamp(effModernD * 0.011, -0.10, 0.14) * r2;
    vec2 pMod = pOpt / (modMag * modDist);
    // Subtle toric meridional magnification (authentic trapezoid feel of astigmatism glasses)
    if (uLensCylD > 0.1) {
      vec2 ax = vec2(cos(uLensAxisRad), sin(uLensAxisRad));
      pMod -= ax * (dot(pMod, ax) * clamp(uLensCylD * 0.0085, 0.0, 0.04));
    }
    pMod += vec2(0.0, -0.02);
    // Distinct flat-top bifocal image jump across D-segment ledge
    pMod += vec2(0.0, -0.018 * clamp(uNearAddD / 2.5, 0.0, 1.5)) * inModernBifocal;
    // Noticeable lateral progressive swim warp in lower outer lens corners
    pMod += vec2(sin(p.y * 16.0) * 0.012, cos(p.x * 13.0) * 0.010) * palSwim;
    vec2 uvMod = clamp(pMod / vec2(uAspect, 1.0) + 0.5, vec2(0.002), vec2(0.998));
    uvOD = mix(vUv, uvMod, inLens);
  }

  // Wet AMD: retinal-locked static Amsler metamorphopsia BEFORE scene sampling (no uTime animation)
  if (uAmd > 0.005) {
    float rFov = length(pFovea);
    float ang = rFov > 1e-4 ? atan(pFovea.y, pFovea.x) : 0.0;
    float amdEnv = exp(-(rFov * rFov) / 0.032) * smoothstep(0.0, 0.025, rFov);
    float wave1 = sin(pFovea.x * 38.0 + cos(pFovea.y * 31.0) * 1.6);
    float wave2 = cos(pFovea.y * 42.0 - sin(pFovea.x * 29.0) * 1.5);
    float lobe = 0.65 + 0.35 * sin(ang * 3.0 + 1.1) * cos(ang * 2.0 - 0.7);
    vec2 radialFov = rFov > 1e-4 ? (pFovea / rFov) : vec2(0.0);
    vec2 tangFov = vec2(-radialFov.y, radialFov.x);
    vec2 amdWarp = (
      radialFov * (0.026 * lobe + 0.012 * wave1) +
      tangFov * (0.014 * wave2)
    ) * amdEnv * uAmd;
    uvOD = clamp(uvOD + amdWarp / vec2(uAspect, 1.0), vec2(0.002), vec2(0.998));
  }

  vec3 col = vec3(0.0);
  // Reserve-depletion -> tipping-point crash curve (matches state.js computeDecompensation)
  float decomp = smoothstep(0.58, 0.96, uFatigue);

  if (uEyelidClose < 0.995) {
    float depthOD = linearizeDepth(texture2D(tDepthOD, clamp(uvOD, vec2(0.001), vec2(0.999))).x);
    float objVergence = 1.0 / max(depthOD, 0.02);
    // Distance half (+13 D): crisp on ~1.8m..23m blackboard/room;
    // Near half (+17 D = +4 D add): ~22cm childhood aphakic reading distance, crisp ~19..26cm sweet spot
    float nearTargetFocus = 1.0 / max(0.35, 0.5454545 + uNearAddD);
    float targetFocus = mix(3.8, nearTargetFocus, inBifocal);
    float dofTolerance = mix(0.30, 0.72, inBifocal);
    float aphakicCocD = isAphakic * max(0.0, abs(objVergence - 1.0 / targetFocus) - dofTolerance);

    // Non-aphakic refractive vergence defocus (Myopia far-point, Presbyopia accommodation cap, Single-Vision/Bifocal/PAL correction)
    float accAmp = uPresbyopiaD > 0.05 ? max(0.25, 4.5 - uPresbyopiaD * 1.05) : 6.0;
    float minFocusD = uMyopiaD + effModernD;
    float maxFocusD = minFocusD + accAmp;
    float refDefocusD = (1.0 - isAphakic) * max(0.0, max(minFocusD - objVergence, objVergence - maxFocusD) - 0.22);
    float refBlur = clamp(refDefocusD * 0.0056, 0.0, 0.036);

    // Real Jackson cross-cylinder vector subtraction: eye astigmatism minus toric lens correction (mismatched axis induces oblique astigmatism!)
    vec2 eyeCylVec = uAstigmatismD * vec2(cos(2.0 * uAstigmatismAxisRad), sin(2.0 * uAstigmatismAxisRad));
    vec2 lensCylVec = (inLens * isModernLens) * uLensCylD * vec2(cos(2.0 * uLensAxisRad), sin(2.0 * uLensAxisRad));
    vec2 netCylVec = (1.0 - isAphakic) * (eyeCylVec - lensCylVec);
    float residualAstigD = length(netCylVec);
    float netAstigAxisRad = residualAstigD > 1e-4 ? (0.5 * atan(netCylVec.y, netCylVec.x)) : uAstigmatismAxisRad;
    float veil = isAphakic * smoothstep(0.45, 0.96, uEyelidLight) * (0.032 + decomp * 0.035);

    // Intrinsic acuity blur (VOD vs VOS) + foveal hypoplasia / cataract / refractive / progressive swim blur
    float baseAcuityBlur = mix(uAcuityBlurDom, uAcuityBlurNonDom, inNonDomOnly * isAphakic) + decomp * 0.0014 * isAphakic;
    baseAcuityBlur = max(baseAcuityBlur, uAlbinism * 0.0032);
    baseAcuityBlur += uCataract * 0.0095 + refBlur + residualAstigD * 0.0014 + palSwim * 0.0048;
    float periphBlur = isAphakic * inLens * periphFactor * periphFactor * 0.0055 * powerRatio;
    float correctedBlur = clamp(baseAcuityBlur + periphBlur + aphakicCocD * 0.0060 * powerRatio, 0.0, 0.038);
    float aphakicBlur = isAphakic * 0.044 * powerRatio;
    float inCorrection = mix(1.0, inLens, isAphakic);
    float isoBlurOD = mix(aphakicBlur, correctedBlur, inCorrection);

    vec2 userAstDir = vec2(cos(netAstigAxisRad), sin(netAstigAxisRad));
    vec2 aphakicAstDir = normalize(mix(vec2(cos(radians(123.0)), sin(radians(123.0))), vec2(1.0, 0.0), inNonDomOnly));
    vec2 astDirOD = isAphakic > 0.5 ? aphakicAstDir : userAstDir;
    float astBlurOD = isAphakic > 0.5
      ? (mix(0.011, 0.0010 + inNonDomOnly * 0.0022 + periphFactor * 0.0032, inLens) + decomp * 0.0014)
      : (residualAstigD * 0.0046 + palSwim * 0.0055);
    float dimness = 1.0 - clamp(uAmbientLight, 0.0, 1.0);
    float pupilHoaBoost = 1.0 + dimness * 0.75;
    float hoaOD = (isAphakic > 0.5
      ? mix(0.55, 0.34 + decomp * 0.24, inLens)
      : clamp(residualAstigD * 0.24, 0.0, 0.85)) * pupilHoaBoost;
    float chromaOD = isAphakic * inLens * clamp(rLens * rLens * 0.0072 * powerRatio, 0.0, 0.009);

    vec3 linOD = sampleOD(
      uvOD, isoBlurOD, astBlurOD, astDirOD, hoaOD, uMlnVelUV, chromaOD, radialDir, veil, noiseAngle
    );
    linOD = applyLinearPathologies(linOD, uvOD, p, pFovea);
    vec3 colOD = linearToDisplay(linOD);
    // Low-acuity & dim-light mesopic contrast loss (guarded so pure-black blind regions never lift to gray)
    float colLuma = dot(colOD, vec3(0.299, 0.587, 0.114));
    float nonBlack = smoothstep(0.004, 0.06, colLuma);
    float lowAcuityDrop = smoothstep(0.010, 0.030, baseAcuityBlur) * 0.24 * nonBlack;
    float mesopicDrop = dimness * max(uGlaucoma, uAmd) * 0.22 * nonBlack;
    float contrastDrop = clamp(lowAcuityDrop + mesopicDrop, 0.0, 0.36);
    colOD = mix(colOD, mix(vec3(0.42), colOD, 0.93), inNonDomOnly * nonBlack);
    colOD = mix(colOD, vec3(colLuma), contrastDrop * 0.35);
    colOD = mix(colOD, (colOD - 0.5) * 0.78 + 0.5, contrastDrop);
    colOD *= (1.0 - mesopicDrop * 0.30);

    if (length(uDiplopiaTan) >= 1e-4) {
      // Constant angular diplopia sampled from dominant view
      vec2 diplopiaUV = vec2(
        uDiplopiaTan.x / (2.0 * uAspect * TAN_HALF_Y),
        uDiplopiaTan.y / (2.0 * TAN_HALF_Y)
      );
      vec2 uvOS = clamp(uvOD - diplopiaUV, vec2(0.002), vec2(0.998));

      float depthOS = linearizeDepth(texture2D(tDepthOD, uvOS).x);
      float cocOS = isAphakic * max(0.0, abs(1.0 / max(depthOS, 0.02) - 1.0 / targetFocus) - dofTolerance);
      float nonDomBlur = max(0.0005, uAcuityBlurNonDom * 0.55) + uCataract * 0.0095 + uAlbinism * 0.0025 + refBlur;
      float isoBlurOS = mix(aphakicBlur, nonDomBlur + clamp(cocOS * 0.0072 * powerRatio, 0.0, 0.028), inCorrection);
      vec3 linOS = sampleOS(uvOS, isoBlurOS, uMlnVelUV, veil, noiseAngle + 1.57);
      linOS = applyLinearPathologies(linOS, uvOS, p, pFovea);
      vec3 colOS = linearToDisplay(linOS);

      float lumaOD = dot(colOD, vec3(0.299, 0.587, 0.114));
      float lumaOS = dot(colOS, vec3(0.299, 0.587, 0.114));
      colOS = mix(colOS, vec3(lumaOS), 0.04) * 0.99;

      // Binocular rivalry: dominant eye stays sharp while rivalry term keeps dark-on-light & light-on-dark OS strokes bold
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
    } else {
      col = colOD;
    }

    if (hasLens > 0.5) {
      // Dark ring scotoma dead-band transition just outside high-plus aphakic rim
      col *= (1.0 - scotomaBand * 0.28 * powerRatio);

      // Crisp bifocal ledge reflection (straight executive split or flat-top D-segment edge)
      float ledgeShade = isAphakic > 0.5
        ? mix(-0.06, 0.095, smoothstep(-0.003, 0.003, dSplit))
        : 0.11;
      col += vec3(ledgeShade) * bifocalLine;

      // Delicate specular glass edge along lower half of semi-rimless progressive lens
      col += vec3(0.11, 0.12, 0.14) * glassEdgeGlint;

      // Distinct auto-matched frames: amber acetate (aphakic), matte charcoal (SV), warm tortoiseshell (D-seg bifocal), brushed silver (semi-rimless PAL)
      if (rimMask > 0.01) {
        vec3 frameTint = isAphakic > 0.5
          ? vec3(0.72, 0.40, 0.11)
          : (isModernBifocal > 0.5
              ? mix(vec3(0.30, 0.16, 0.07), vec3(0.56, 0.33, 0.13), 0.5 + 0.5 * sin(p.x * 42.0 + p.y * 36.0))
              : (isProgressive > 0.5 ? vec3(0.58, 0.62, 0.68) : vec3(0.11, 0.12, 0.14)));
        float rimBevel = smoothstep(0.0, 0.011, abs(dLenses));
        vec3 rimCol = isAphakic > 0.5
          ? mix(col * frameTint * 1.15 + frameTint * 0.24, frameTint * 0.85, 0.45)
          : mix(col * 0.14 + frameTint * 0.86, frameTint, 0.76);
        rimCol += vec3(0.18, 0.17, 0.15) * (1.0 - rimBevel) * (isProgressive > 0.5 ? 0.55 : 0.35);
        col = mix(col, rimCol, rimMask * mix(0.94, 0.88, isAphakic));
      }
    }

    // Asthenopia crash vignette appears only past the compensatory reserve tipping point
    float vig = smoothstep(0.36, 0.94, length(p));
    col *= (1.0 - decomp * vig * 0.28);
  }

  // Eyelid closure (R): sunlit daytime warm reddish-amber eyelid translucency modulated by gaze light + diffuse bright glare
  if (uEyelidClose > 0.005) {
    float lidEdge = smoothstep(uEyelidClose * 1.15 - 0.15, uEyelidClose * 1.15 + 0.05, abs(p.y) * 2.0 + 0.06 * (p.x * p.x));
    float closedMask = mix(1.0 - lidEdge, 1.0, smoothstep(0.75, 1.0, uEyelidClose));
    vec3 lidBase = mix(vec3(0.012, 0.006, 0.006), vec3(0.42, 0.165, 0.082), clamp(uEyelidLight, 0.0, 1.0));
    vec3 diffuseGlare = sampleClosedEyelidGlare(vUv, noiseAngle);
    vec3 innerLid = lidBase + diffuseGlare * 0.45;
    col = mix(col, innerLid, clamp(closedMask * uEyelidClose, 0.0, 1.0));
  }

  // Plentiful tiny ultra-quick photopsia flashes: additive on dark/mid scenes, more vivid in dim lighting
  if (uPhospheneScale > 0.005) {
    float phosDimBoost = 1.0 + (1.0 - clamp(uAmbientLight, 0.0, 1.0)) * 0.45;
    vec3 phos = computeFlashPhosphenes(px + uMlnOffsetUV * uResolution * 0.35, uTime, uEyelidClose, decomp) * uPhospheneScale * phosDimBoost;
    float phosMag = max(phos.r, max(phos.g, phos.b));
    float bgLuma = dot(col, vec3(0.299, 0.587, 0.114));
    float brightBg = smoothstep(0.55, 0.92, bgLuma);
    vec3 phosHue = phos / max(phosMag, 1e-4);
    col = mix(col + phos, mix(col, phosHue * 0.62, clamp(phosMag * 3.0, 0.0, 0.72)), brightBg);
  }

  // Full-FOV drifting vitreous floaters across entire screen (silenced at 100% glaucoma/RP NLP blindness)
  if (uFloaterScale > 0.005) {
    float opticVis = 1.0 - max(smoothstep(0.92, 1.0, uGlaucoma), smoothstep(0.93, 1.0, uRetinitisPigmentosa));
    float speckVis = mix(1.0, 0.25, uEyelidClose) * opticVis;
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
    col *= (1.0 - clamp(speckShadow * uFloaterScale, 0.0, min(0.55, 0.32 * max(1.0, uFloaterScale))));
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
