uniform sampler2D tColorOD;
uniform sampler2D tBlurOD;
uniform sampler2D tDepthOD;
uniform sampler2D tColorNonDom;
uniform sampler2D tDepthNonDom;
uniform float uHasNonDomRT;

uniform float uNear;
uniform float uFar;
uniform float uAspect;
uniform float uTime;
uniform float uGlassesOn;
uniform float uGlassesSlide;
uniform float uGlassesBounce;
uniform float uSquint;
uniform float uEyelidClose;
uniform float uEyelidLight;
uniform float uAmbientLight;
uniform float uFatigue;
uniform float uOcclOD;
uniform float uOcclNonDom;
uniform float uFocusEffort;
uniform float uCompareNormal;
uniform vec2 uMlnOffsetUV;
uniform float uMlnVelUV;
uniform vec2 uEyeOffset;
uniform float uExposure;
uniform vec2 uResolution;
uniform float uLensProfile;
uniform float uFrameShape;
uniform float uFrameColor;
uniform float uLensPowerD;
uniform float uEffLensPowerD;
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

// Realism OD sampling (intrinsic VOD 0.7 BCVA + depth-guarded 12-tap CoC + smooth quarter-res +13 D blur)
vec3 sampleOD(
  vec2 baseUv,
  float centerDepth,
  float depthCocShare,
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
    float wSum = 0.0;
    const int TAPS = 12;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(TAPS));
      float theta = fi * 2.39996323 + angleSeed;
      vec2 disk = vec2(cos(theta), sin(theta)) * r;
      vec2 off = disk * fineBlurUV + astDir * (disk.x * astBlurUV) + perpDir * (disk.y * astBlurUV * 0.25) + vec2(disk.x * motionSmearUV, 0.0);
      vec2 tapUv = clamp(baseUv + off * invAspect, vec2(0.001), vec2(0.999));
      float w = 1.0;
      if (depthCocShare > 0.25 && fineBlurUV > 0.0028) {
        // Bilateral foreground guard on high-CoC pixels: kills foreground halos uniformly across all taps
        float tapDepth = linearizeDepth(texture2D(tDepthOD, tapUv).x);
        float fgIntrude = smoothstep(0.10, 0.32, centerDepth - tapDepth);
        w = 1.0 - 0.90 * depthCocShare * fgIntrude;
      }
      acc += texture2D(tColorOD, tapUv).rgb * w;
      wSum += w;
    }
    vec3 blurred = wSum > 0.001 ? (acc / wSum) : col;
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

  // Astigmatism & corneal HOAs (runs in linear HDR before ACES + sRGB; calibrated above matte paper/sleeves so only lamps/windows/hotspots flare)
  if (hoaStrength > 0.01) {
    float hoaLo = mix(0.40, 1.58, clamp(uAmbientLight, 0.0, 1.0));
    float hoaHi = mix(1.00, 2.55, clamp(uAmbientLight, 0.0, 1.0));
    vec3 flare = vec3(0.0);
    // 1. Directional astigmatic light streaks along meridian
    for (int s = 1; s <= 3; s++) {
      float rad = float(s) * 0.012;
      float w = 0.10 / float(s);
      vec2 dA = astDir * rad * invAspect;
      vec3 cPos = texture2D(tColorOD, clamp(baseUv + dA, vec2(0.001), vec2(0.999))).rgb;
      vec3 cNeg = texture2D(tColorOD, clamp(baseUv - dA, vec2(0.001), vec2(0.999))).rgb;
      float bPos = pow(smoothstep(hoaLo, hoaHi, dot(cPos, vec3(0.299, 0.587, 0.114))), 1.6);
      float bNeg = pow(smoothstep(hoaLo, hoaHi, dot(cNeg, vec3(0.299, 0.587, 0.114))), 1.6);
      flare += (cPos * bPos + cNeg * bNeg) * w;
    }
    // 2. Spherical-aberration halo + asymmetric coma tail
    vec2 comaAxis = normalize(astDir + vec2(0.28, -0.46));
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float ang = fj * 1.5707963 + angleSeed * 0.5;
      vec2 haloOff = vec2(cos(ang), sin(ang)) * 0.025 * invAspect;
      vec3 hc = texture2D(tColorOD, clamp(baseUv + haloOff, vec2(0.001), vec2(0.999))).rgb;
      float hb = pow(smoothstep(hoaLo + 0.02, hoaHi + 0.05, dot(hc, vec3(0.299, 0.587, 0.114))), 1.7);
      flare += hc * hb * 0.065;
    }
    vec3 comaCol = texture2D(tColorOD, clamp(baseUv + comaAxis * 0.019 * invAspect, vec2(0.001), vec2(0.999))).rgb;
    float comaB = pow(smoothstep(hoaLo, hoaHi, dot(comaCol, vec3(0.299, 0.587, 0.114))), 1.5);
    flare += comaCol * comaB * 0.12;

    col += flare * hoaStrength;
  }

  // Add subtle linear intraocular glare before ACES + sRGB (prevents lifting blacks into gray haze)
  col += vec3(0.98, 0.96, 0.92) * veilAmount;
  return col;
}

// Uniform Vogel disk for amblyopic non-dominant eye (4 taps on pre-filtered quarter-res stereo tColorNonDom, 8 taps on full-res fallback)
vec3 sampleOS(vec2 baseUv, float isoBlurUV, float motionSmearUV, float veilAmount, float angleSeed) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  if (uHasNonDomRT > 0.5) {
    float rx = clamp(isoBlurUV, 0.001, 0.036) + motionSmearUV;
    float ry = clamp(isoBlurUV, 0.001, 0.036);
    vec3 col = vec3(0.0);
    const int QTAPS = 4;
    for (int i = 0; i < QTAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(QTAPS));
      float theta = fi * 2.39996323 + angleSeed;
      vec2 off = vec2(cos(theta) * rx, sin(theta) * ry) * r;
      col += texture2D(tColorNonDom, clamp(baseUv + off * invAspect, vec2(0.003), vec2(0.997))).rgb;
    }
    col /= float(QTAPS);
    col += vec3(0.98, 0.96, 0.92) * veilAmount;
    return col;
  }

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
vec3 sampleBlurEye(vec2 uv, bool useNonDom) {
  vec2 cUv = clamp(uv, vec2(0.003), vec2(0.997));
  return useNonDom ? texture2D(tColorNonDom, cUv).rgb : texture2D(tBlurOD, cUv).rgb;
}

vec3 applyLinearPathologies(vec3 linCol, vec2 uv, vec2 p, vec2 pFovea, bool useNonDom) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);

  // 1. Cataracts: wide forward disability-glare scatter, cortical contrast loss, Beer-Lambert nuclear brunescence (100% = light perception only)
  if (uCataract > 0.005) {
    vec3 blurCenter = sampleBlurEye(uv, useNonDom);
    vec3 wideScatter = blurCenter * 0.28;
    float spread = 0.020 + 0.042 * uCataract;
    for (int j = 0; j < 4; j++) {
      float ang = float(j) * 1.5707963 + 0.35;
      vec2 off = vec2(cos(ang), sin(ang)) * spread * invAspect;
      wideScatter += sampleBlurEye(uv + off, useNonDom) * 0.18;
    }
    float scatterLuma = dot(wideScatter, vec3(0.2126, 0.7152, 0.0722));
    float glareLo = mix(0.14, 0.32, clamp(uAmbientLight, 0.0, 1.0));
    float glareHi = mix(0.68, 1.35, clamp(uAmbientLight, 0.0, 1.0));
    float glareBoost = smoothstep(glareLo, glareHi, scatterLuma) * uCataract;
    float scatterMix = smoothstep(0.0, 0.94, uCataract);
    linCol = mix(linCol, wideScatter, scatterMix);
    linCol = mix(linCol, vec3(scatterLuma), uCataract * 0.30);
    linCol += wideScatter * (0.28 * uCataract + 0.42 * glareBoost);
    linCol *= exp(-uCataract * vec3(0.06, 0.24, 0.78));
  }

  // 2. Ocular Albinism: iris transillumination photophobia glare driven by blurred scene luminance & uEyelidLight
  if (uAlbinism > 0.005) {
    vec3 albBlur = sampleBlurEye(uv, useNonDom);
    float sceneLuma = dot(albBlur, vec3(0.2126, 0.7152, 0.0722));
    float lightDrive = clamp(sceneLuma * 0.65 + clamp(uEyelidLight, 0.0, 1.0) * 0.55, 0.0, 1.5);
    float periph = smoothstep(0.15, 0.85, length(p));
    vec3 transillumTint = mix(vec3(1.0, 0.96, 0.94), vec3(1.0, 0.76, 0.72), periph * 0.45);
    linCol += albBlur * (0.28 * uAlbinism) + transillumTint * (lightDrive * uAlbinism * 0.22);
  }

  // 3. Wet AMD (Taylor 2018): retinal-locked central perceptual missing/blur fill-in (avoids clichéd black disk until end-stage scar)
  if (uAmd > 0.005) {
    float rFov = length(pFovea);
    float ang = rFov > 1e-4 ? atan(pFovea.y, pFovea.x) : 0.0;
    float irreg = 1.0 + 0.18 * sin(ang * 3.0 + 0.7) + 0.11 * cos(ang * 5.0 - 1.2);
    float scotomaR = (0.045 + 0.205 * uAmd) * irreg;
    float scotomaMask = 1.0 - smoothstep(scotomaR * 0.24, scotomaR, rFov);
    float coreMask = 1.0 - smoothstep(scotomaR * 0.12, scotomaR * 0.72, rFov);

    // Sample surrounding intact ring for perceptual cortical filling-in + heavy central blur wash
    vec2 ringDir = rFov > 1e-4 ? (pFovea / rFov) : vec2(1.0, 0.0);
    vec2 ringOff = ringDir * (scotomaR * 0.65) * invAspect;
    vec3 fillCol = 0.55 * sampleBlurEye(uv, useNonDom)
      + 0.45 * sampleBlurEye(uv + ringOff, useNonDom);
    float fillLuma = dot(fillCol, vec3(0.2126, 0.7152, 0.0722));
    vec3 mutedFill = mix(fillCol, vec3(fillLuma * 0.84), 0.52 + 0.36 * uAmd);
    linCol = mix(linCol, mutedFill, scotomaMask * smoothstep(0.05, 0.45, uAmd));
    // Soft dim smudge only in severe end-stage macular scarring (>80%)
    float scarDim = smoothstep(0.78, 1.0, uAmd) * coreMask;
    linCol = mix(linCol, vec3(fillLuma * 0.22), scarDim * 0.78);
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
      sampleBlurEye(uv, useNonDom) +
      sampleBlurEye(uv + dirFov * 0.020 * invAspect, useNonDom)
    );
    float gLuma = dot(gBlur, vec3(0.2126, 0.7152, 0.0722));
    vec3 filled = mix(gBlur, vec3(gLuma), 0.58);
    filled = mix(filled, vec3(min(gLuma, 0.50)), 0.30);
    linCol = mix(linCol, filled, lossMask * 0.92);

    float endStage = smoothstep(0.68, 0.96, uGlaucoma);
    float darkInner = mix(0.28, 0.015, endStage);
    float darkOuter = mix(0.62, 0.09, endStage);
    float outerDark = smoothstep(darkInner, darkOuter, r) * endStage;
    float totalBlind = smoothstep(0.92, 1.0, uGlaucoma);
    linCol *= (1.0 - max(outerDark, totalBlind));
  }

  // 5. Diabetic Retinopathy: patchy macular edema/scotomas + eye-motion-lagging drifting vitreous-blood floaters; 100% = dense vitreous hemorrhage
  if (uDiabeticRetinopathy > 0.005) {
    float dr = clamp(uDiabeticRetinopathy, 0.0, 1.0);
    float blotch = 0.0;
    float edema = 0.0;
    float vitFloat = 0.0;
    vec2 vitLag = uEyeOffset * 1.45 + uMlnOffsetUV * vec2(uAspect, 1.0) * 1.8;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      vec2 c = vec2(
        (hash12(vec2(fk * 3.1, 1.7)) * 2.0 - 1.0) * 0.48,
        (hash12(vec2(fk * 2.7, 8.3)) * 2.0 - 1.0) * 0.34
      );
      // Organic irregular cloud scotoma (rotated soft ellipse + offset lobe, no geometric clover/butterfly rose)
      vec2 d = pFovea - c;
      float ca = cos(fk * 1.37);
      float sa = sin(fk * 1.37);
      float du = d.x * ca + d.y * sa;
      float dv = -d.x * sa + d.y * ca;
      float aspectB = 1.0 + 0.55 * hash12(vec2(fk, 6.3));
      float baseRad = (0.024 + 0.052 * hash12(vec2(fk, 4.9))) * (0.45 + 1.25 * dr);
      float dEllip = length(vec2(du / aspectB, dv));
      vec2 subOff = vec2(baseRad * 0.55, baseRad * (hash12(vec2(fk, 9.4)) - 0.5) * 0.7);
      float dSub = length(vec2(du, dv) - subOff) * 1.25;
      float dCloud = min(dEllip, dSub);
      float onset = smoothstep(fk * 0.10, fk * 0.10 + 0.28, dr);
      float m = (1.0 - smoothstep(baseRad * 0.22, baseRad * 1.15, dCloud)) * onset;
      blotch = max(blotch, m);
      edema = max(edema, (1.0 - smoothstep(baseRad * 0.45, baseRad * 1.95, dCloud)) * onset);

      // Organic curved vitreous-blood wisp/filament lagging behind eye motion
      vec2 fc = c * 0.85 + vitLag + vec2(sin(uTime * 0.24 + fk * 2.1) * 0.035, -0.025 + cos(uTime * 0.19 + fk * 1.7) * 0.03);
      vec2 fd = p - fc;
      float fdLen = length(fd);
      float ru = fd.x * ca + fd.y * sa;
      float rv = -fd.x * sa + fd.y * ca;
      float curveDist = abs(ru - sin(rv * 22.0 + fk * 2.7) * 0.011);
      float wispLen = (0.038 + 0.045 * hash12(vec2(fk, 7.1))) * (0.55 + 0.85 * dr);
      float wispThin = 0.0045 + 0.0055 * dr;
      float wispMask = (1.0 - smoothstep(wispThin * 0.35, wispThin * 2.0, curveDist))
        * (1.0 - smoothstep(wispLen * 0.45, wispLen, abs(rv)));
      float blobR = (0.011 + 0.016 * hash12(vec2(fk, 3.9))) * (0.5 + 0.8 * dr);
      float blobMask = 1.0 - smoothstep(blobR * 0.25, blobR * 1.3, fdLen);
      vitFloat = max(vitFloat, max(wispMask * 0.85, blobMask * 0.72) * onset);
    }
    vec3 drBlur = sampleBlurEye(uv, useNonDom);
    float drLuma = dot(drBlur, vec3(0.2126, 0.7152, 0.0722));
    linCol = mix(linCol, mix(drBlur, vec3(drLuma), 0.35) * 0.88, edema * (0.45 + 0.42 * dr));
    // Patchy dark desaturated scotomas + drifting amber-ochre vitreous strands (scaled by local luma so blacks never glow)
    linCol *= (1.0 - blotch * (0.58 + 0.36 * dr));
    vec3 strandTint = mix(linCol * 0.35, vec3(0.11, 0.045, 0.025) * clamp(drLuma * 2.5, 0.0, 1.0), 0.55);
    linCol = mix(linCol, strandTint, vitFloat * (0.42 + 0.38 * dr));
    float vitHeme = smoothstep(0.68, 1.0, dr);
    linCol = mix(linCol, drBlur * vec3(0.28, 0.09, 0.06), vitHeme * 0.74);
    linCol *= (1.0 - smoothstep(0.88, 1.0, dr) * 0.90);
  }

  // 6. Retinitis Pigmentosa: soft perceptual fill/fade tunnel boundary + nyctalopia dim collapse; 100% = total blindness
  if (uRetinitisPigmentosa > 0.005) {
    float rp = clamp(uRetinitisPigmentosa, 0.0, 1.0);
    float dimness = 1.0 - clamp(uAmbientLight, 0.0, 1.0);
    float r = length(pFovea);
    float tunnelR = mix(0.64, 0.0, pow(rp, 0.85)) * (1.0 - dimness * 0.32 * rp);
    float edgeW = mix(0.18, 0.045, rp);
    float blurBand = smoothstep(max(0.0, tunnelR - edgeW * 0.55), tunnelR + edgeW * 0.35, r);
    float tunnelMask = smoothstep(tunnelR, tunnelR + edgeW, r);
    // Early-to-moderate mid-peripheral ring scotoma (leaves sliver of far periphery until ~55%)
    float ringD = (r - 0.34) / 0.11;
    float ringScotoma = exp(-(ringD * ringD)) * smoothstep(0.08, 0.35, rp) * (1.0 - smoothstep(0.45, 0.72, rp)) * 0.65;
    // Soft perceptual blur & desaturation at tunnel edge instead of hard black cookie-cutter ring
    vec3 rpBlur = sampleBlurEye(uv, useNonDom);
    float rpBlurLuma = dot(rpBlur, vec3(0.2126, 0.7152, 0.0722));
    linCol = mix(linCol, mix(rpBlur, vec3(rpBlurLuma * 0.65), 0.72), max(blurBand, ringScotoma) * 0.85);
    // Nyctalopia: gentle shadow dim in sunlit room, strong scotopic collapse at Dusk/Night/Lights OFF
    float luma = dot(linCol, vec3(0.2126, 0.7152, 0.0722));
    float nyctThresh = mix(0.16, 0.45, dimness);
    float nyctDepth = mix(0.22, 0.90, smoothstep(0.15, 0.88, dimness));
    float dimCollapse = (1.0 - smoothstep(0.015, nyctThresh, luma)) * rp * nyctDepth;
    linCol *= (1.0 - dimCollapse);
    float totalRpBlind = smoothstep(0.93, 1.0, rp);
    linCol *= (1.0 - max(max(tunnelMask * 0.96, ringScotoma * 0.58), totalRpBlind));
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
  vec2 px = vUv * uResolution;
  float noiseAngle = ign(px + fract(uTime * 17.3) * 100.0) * 6.2831853;

  // Aspect-normalized screen space centered at (0, 0), height = 1.0
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 pFovea = p - uMlnOffsetUV * vec2(uAspect, 1.0) * 0.45;
  vec2 sampleUv = vUv;
  vec3 col = vec3(0.0);
  float decomp = smoothstep(0.58, 0.96, uFatigue);

  // Comparison mode (V): clean ACES + sRGB normal vision, falling through cleanly to R eyelid closure
  if (uCompareNormal > 0.5) {
    if (uEyelidClose < 0.995) {
      col = linearToDisplay(texture2D(tColorOD, vUv).rgb);
    }
  } else {

  float hasLens = step(0.5, uLensProfile);
  float isAphakic = hasLens * (1.0 - step(1.5, uLensProfile));
  float isModernBifocal = step(2.5, uLensProfile) * (1.0 - step(3.5, uLensProfile));
  float isProgressive = step(3.5, uLensProfile);
  float isModernLens = step(1.5, uLensProfile);
  float glassesOn = hasLens * step(0.5, uGlassesOn);
  float powerRatio = clamp(abs(uEffLensPowerD) / 13.0, 0.35, 1.5);
  float addRatio = clamp(uNearAddD / 4.0, 0.0, 1.35);

  // Head-fixed frame coordinates shifted by eye-in-head gaze lead, nose-slip drop (0..14 mm), & Space spring settle
  float slideDropY = uGlassesSlide * 0.052 + uGlassesBounce;
  vec2 pFrame = p + uEyeOffset + vec2(0.0, slideDropY);

  // Resolve cosmetic frame shape & color (0 = Auto matched to lens profile; optics stay strictly tied to uLensProfile)
  float effShape = uFrameShape > 0.5 ? uFrameShape : uLensProfile;
  float effColor = uFrameColor > 0.5 ? uFrameColor : uLensProfile;
  float shapeRound = step(0.5, effShape) * (1.0 - step(1.5, effShape));
  float shapeRoundedRect = step(2.5, effShape) * (1.0 - step(3.5, effShape));
  float shapeSemiRim = step(3.5, effShape) * (1.0 - step(4.5, effShape));
  float shapeRimless = step(4.5, effShape);

  vec2 cL = shapeRound > 0.5 ? vec2(-0.36, -0.01) : vec2(-0.38, -0.01);
  vec2 cR = shapeRound > 0.5 ? vec2( 0.36, -0.01) : vec2( 0.38, -0.01);
  float lensR = 0.49;
  vec2 boxHalf = shapeRoundedRect > 0.5
    ? vec2(0.36, 0.34)
    : (shapeSemiRim > 0.5 ? vec2(0.38, 0.31) : (shapeRimless > 0.5 ? vec2(0.38, 0.30) : vec2(0.37, 0.26)));
  float boxRad = shapeRoundedRect > 0.5 ? 0.12 : ((shapeSemiRim > 0.5 || shapeRimless > 0.5) ? 0.08 : 0.05);

  float dL = shapeRound > 0.5 ? sdCircle(pFrame, cL, lensR) : sdRoundedBox(pFrame - cL, boxHalf, boxRad);
  float dR = shapeRound > 0.5 ? sdCircle(pFrame, cR, lensR) : sdRoundedBox(pFrame - cR, boxHalf, boxRad);
  float dLenses = min(dL, dR);

  float bridgeY = shapeRound > 0.5 ? 0.325 : (shapeRoundedRect > 0.5 ? 0.17 : 0.13);
  float bridgeHalfW = shapeRound > 0.5 ? 0.048 : 0.040;
  float bridgeR = shapeRound > 0.5 ? 0.016 : ((shapeSemiRim > 0.5 || shapeRimless > 0.5) ? 0.008 : 0.012);
  float dBridge = sdSegment(pFrame, vec2(-bridgeHalfW, bridgeY), vec2(bridgeHalfW, bridgeY)) - bridgeR;
  float rimThickness = shapeRound > 0.5 ? 0.025 : (shapeRoundedRect > 0.5 ? 0.019 : (shapeSemiRim > 0.5 ? 0.011 : 0.015));
  float dRimFull = abs(dLenses) - rimThickness * 0.5;
  float rimBand = shapeRimless > 0.5 ? dBridge : min(dRimFull, dBridge);

  // Soft out-of-focus frame & lens edge (12 mm from eye -> deeply defocused, never razor-sharp)
  float rimBlur = isAphakic > 0.5 ? 0.022 : 0.011;
  float inLens = glassesOn * (1.0 - smoothstep(-0.009, 0.009, dLenses));
  // Dominant eye (OD or OS via uDomIsOS) + central binocular overlap vs non-dominant-only lens
  float inLeftLens = glassesOn * (1.0 - smoothstep(-0.016, 0.016, dL));
  float inRightLens = glassesOn * (1.0 - smoothstep(-0.016, 0.016, dR));
  float inDomLens = mix(inRightLens, inLeftLens, step(0.5, uDomIsOS));
  float inNonDomOnly = inLens * (1.0 - inDomLens);
  // Semi-rimless keeps metallic browline on upper half + lower glass glint; Rimless shows slim bridge + full glass-edge glint
  float upperHalfMask = smoothstep(-0.04, 0.04, pFrame.y);
  float bridgeOnlyMask = 1.0 - smoothstep(-rimBlur, rimBlur, dBridge);
  float rimMask = glassesOn * (1.0 - smoothstep(-rimBlur, rimBlur, rimBand)) * mix(1.0, max(upperHalfMask, bridgeOnlyMask), shapeSemiRim);
  float glassEdgeBand = 1.0 - smoothstep(0.0, 0.013, abs(dLenses));
  float glassEdgeGlint = glassesOn * max(shapeSemiRim * (1.0 - upperHalfMask), shapeRimless * 0.85) * glassEdgeBand;

  // Executive straight split (Aphakic) vs Flat-Top D-Segment (Modern Bifocal) vs Smooth Corridor (Progressive)
  float splitY = -0.02;
  float dSplit = pFrame.y - splitY;
  float splitBlur = isAphakic > 0.5 ? 0.018 : 0.011;
  float hasAphakicSplit = isAphakic * smoothstep(0.15, 0.45, uNearAddD);
  float inAphakicBifocal = inLens * hasAphakicSplit * (1.0 - smoothstep(-0.009, 0.009, dSplit));
  float aphakicSplitLine = inLens * hasAphakicSplit * (1.0 - smoothstep(0.0, splitBlur, abs(dSplit)));

  // Classic D-shaped flat-top reading segment in lower-inner quadrant of each modern bifocal lens
  float hasModernBifocal = isModernBifocal * smoothstep(0.15, 0.45, uNearAddD);
  float dSegL = max(pFrame.y - (-0.075), sdRoundedBox(pFrame - vec2(cL.x + 0.055, -0.185), vec2(0.165, 0.115), 0.085));
  float dSegR = max(pFrame.y - (-0.075), sdRoundedBox(pFrame - vec2(cR.x - 0.055, -0.185), vec2(0.165, 0.115), 0.085));
  float dSeg = min(dSegL, dSegR);
  float inModernBifocal = inLens * hasModernBifocal * (1.0 - smoothstep(-0.008, 0.008, dSeg));
  float dSegLine = inLens * hasModernBifocal * (1.0 - smoothstep(0.0, 0.013, abs(dSeg)));

  float inBifocal = max(inAphakicBifocal, inModernBifocal);
  float bifocalLine = max(aphakicSplitLine, dSegLine);
  float palBlend = inLens * isProgressive * smoothstep(0.09, -0.22, pFrame.y);
  float palLat = min(abs(pFrame.x - cL.x), abs(pFrame.x - cR.x)) / 0.36;
  float palSwim = inLens * isProgressive * smoothstep(0.24, 0.88, palLat) * smoothstep(0.14, -0.22, pFrame.y) * clamp(uNearAddD / 2.25, 0.0, 1.6);

  // Optical UV mapping: exact +13/+17 D aphakic mapping vs modern single-vision/bifocal/progressive + Prentice's rule prism
  vec2 pOpt = pFrame - vec2(0.0, -0.02);
  float rLen = length(pOpt);
  float r2 = dot(pOpt, pOpt);
  float rLens = clamp(min(length(pFrame - cL), length(pFrame - cR)) / lensR, 0.0, 1.2);
  float periphFactor = isAphakic * smoothstep(0.42, 0.98, rLens);
  float effModernD = inLens * isModernLens * (uEffLensPowerD + uNearAddD * max(inModernBifocal, palBlend));
  // Prentice's rule (Delta = c * D): off-axis gaze behind high-power spectacle lenses bends rays proportionally
  vec2 prenticeShift = uEyeOffset * clamp(uEffLensPowerD / 13.0, -0.85, 1.35) * 0.14 * inLens;

  vec2 uvOD = vUv;
  float scotomaBand = 0.0;
  vec2 radialDir = rLen > 1e-4 ? (pOpt / rLen) : vec2(0.0);

  if (isAphakic > 0.5) {
    float mag = mix(1.0 + 0.24 * powerRatio, 1.0 + 0.24 * powerRatio + 0.05 * addRatio, inBifocal);
    float pincushion = 1.0 + (0.24 * powerRatio) * r2;
    vec2 pMag = (pOpt / (mag * pincushion)) + vec2(0.0, -0.02) - uEyeOffset - vec2(0.0, slideDropY) - prenticeShift;
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
    pMod += vec2(0.0, -0.02) - uEyeOffset - vec2(0.0, slideDropY) - prenticeShift;
    // Distinct flat-top bifocal image jump across D-segment ledge
    pMod += vec2(0.0, -0.018 * clamp(uNearAddD / 2.5, 0.0, 1.5)) * inModernBifocal;
    // Noticeable lateral progressive swim warp in lower outer lens corners
    pMod += vec2(sin(pFrame.y * 16.0) * 0.012, cos(pFrame.x * 13.0) * 0.010) * palSwim;
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
  sampleUv = uvOD;

  if (uEyelidClose < 0.995) {
    float dimness = 1.0 - clamp(uAmbientLight, 0.0, 1.0);
    // Pupil dilation in dim light widens blur CoC & tightens DoF; reflex stenopeic squint narrows aperture up close
    float pupilScale = (1.0 + 0.45 * smoothstep(0.10, 0.92, dimness)) * (1.0 - 0.36 * clamp(uSquint, 0.0, 1.0));

    float depthOD = linearizeDepth(texture2D(tDepthOD, clamp(uvOD, vec2(0.001), vec2(0.999))).x);
    float objVergence = 1.0 / max(depthOD, 0.02);
    // Exact per-zone vertex-distance power shift (0..14 mm slip):
    // Distance +13 D -> up to +15.89 D (blurs blackboard); Near +17 D -> up to +22.31 D (pulls crisp focus to ~10 cm loupe!)
    float slideM = clamp(uGlassesSlide, 0.0, 1.0) * 0.014;
    float zonePowerD = uLensPowerD + uNearAddD * inBifocal;
    float zoneEffD = zonePowerD / max(0.25, 1.0 - slideM * zonePowerD);
    float slideErrorD = isAphakic * inLens * (zoneEffD - zonePowerD);
    float nearTargetFocus = 1.0 / max(0.35, 0.5454545 + uNearAddD);
    float targetVergence = mix(1.0 / 3.8, 1.0 / nearTargetFocus, inBifocal) + slideErrorD;
    float dofTolerance = mix(0.30, 0.72, inBifocal) / pupilScale;
    float aphakicCocD = isAphakic * max(0.0, abs(objVergence - targetVergence) - dofTolerance);

    // Non-aphakic refractive vergence defocus (Myopia far-point, Presbyopia accommodation cap, pupil-scaled CoC)
    float accAmp = uPresbyopiaD > 0.05 ? max(0.25, 4.5 - uPresbyopiaD * 1.05) : 6.0;
    float minFocusD = uMyopiaD + effModernD;
    float maxFocusD = minFocusD + accAmp;
    float refDefocusD = (1.0 - isAphakic) * max(0.0, max(minFocusD - objVergence, objVergence - maxFocusD) - (0.22 / pupilScale));
    float refBlur = clamp(refDefocusD * 0.0056 * pupilScale, 0.0, 0.036);

    // Real Jackson cross-cylinder vector subtraction: eye astigmatism minus toric lens correction (mismatched axis induces oblique astigmatism!)
    vec2 eyeCylVec = uAstigmatismD * vec2(cos(2.0 * uAstigmatismAxisRad), sin(2.0 * uAstigmatismAxisRad));
    vec2 lensCylVec = (inLens * isModernLens) * uLensCylD * vec2(cos(2.0 * uLensAxisRad), sin(2.0 * uLensAxisRad));
    vec2 netCylVec = (1.0 - isAphakic) * (eyeCylVec - lensCylVec);
    float residualAstigD = length(netCylVec);
    float netAstigAxisRad = residualAstigD > 1e-4 ? (0.5 * atan(netCylVec.y, netCylVec.x)) : uAstigmatismAxisRad;
    float veil = isAphakic * smoothstep(0.45, 0.96, uEyelidLight) * (0.032 + decomp * 0.035);

    // Intrinsic acuity blur (VOD vs VOS) + foveal hypoplasia / cataract / refractive / progressive swim / scotopic rod blur
    float scotopicBlur = smoothstep(0.22, 0.03, uAmbientLight) * 0.0030;
    float baseAcuityBlur = mix(uAcuityBlurDom, uAcuityBlurNonDom, inNonDomOnly * isAphakic) + decomp * 0.0014 * isAphakic + scotopicBlur;
    baseAcuityBlur = max(baseAcuityBlur, uAlbinism * 0.0032);
    baseAcuityBlur += uCataract * 0.0095 + refBlur + residualAstigD * 0.0014 * pupilScale + palSwim * 0.0048;
    float periphBlur = isAphakic * inLens * periphFactor * periphFactor * 0.0055 * powerRatio;
    float aphakicCocBlur = aphakicCocD * 0.0060 * powerRatio;
    float depthCocBlur = aphakicCocBlur + refBlur;
    float correctedBlur = clamp(baseAcuityBlur + periphBlur + aphakicCocBlur, 0.0, 0.038);
    float aphakicBlur = isAphakic * 0.044 * powerRatio;
    float inCorrection = mix(1.0, inLens, isAphakic);
    float isoBlurOD = mix(aphakicBlur, correctedBlur, inCorrection);
    float depthCocShare = inCorrection * clamp(depthCocBlur / max(isoBlurOD, 0.0005), 0.0, 1.0);

    vec2 userAstDir = vec2(cos(netAstigAxisRad), sin(netAstigAxisRad));
    vec2 aphakicAstDir = normalize(mix(vec2(cos(radians(123.0)), sin(radians(123.0))), vec2(1.0, 0.0), inNonDomOnly));
    vec2 astDirOD = isAphakic > 0.5 ? aphakicAstDir : userAstDir;
    float astBlurOD = isAphakic > 0.5
      ? (mix(0.011, 0.0010 + inNonDomOnly * 0.0022 + periphFactor * 0.0032, inLens) + decomp * 0.0014) * (1.0 - 0.35 * clamp(uSquint, 0.0, 1.0))
      : (residualAstigD * 0.0046 * pupilScale + palSwim * 0.0055);
    float pupilHoaBoost = 1.0 + dimness * 0.75;
    float hoaOD = (isAphakic > 0.5
      ? mix(0.55, 0.34 + decomp * 0.24, inLens)
      : clamp(residualAstigD * 0.24, 0.0, 0.85)) * pupilHoaBoost;
    float chromaOD = isAphakic * inLens * clamp(rLens * rLens * 0.0072 * powerRatio, 0.0, 0.009);

    vec3 linOD = sampleOD(
      uvOD, depthOD, depthCocShare, isoBlurOD, astBlurOD, astDirOD, hoaOD, uMlnVelUV, chromaOD, radialDir, veil, noiseAngle
    );
    linOD = applyLinearPathologies(linOD, uvOD, p, pFovea, false);
    // Genuine mesopic sensitivity attenuation in linear light for Glaucoma / Wet AMD / DR (dims dark scenes, never lifts blacks!)
    float mesopicPath = dimness * max(max(uGlaucoma, uAmd), uDiabeticRetinopathy * 0.85);
    linOD *= (1.0 - mesopicPath * 0.48);
    vec3 colOD = linearToDisplay(linOD);
    // Low-acuity contrast compression (pivot anchored to local brightness so dark scenes never brighten!) + scotopic rod desaturation
    float colLuma = dot(colOD, vec3(0.299, 0.587, 0.114));
    float nonBlack = smoothstep(0.004, 0.06, colLuma);
    float lowAcuityDrop = smoothstep(0.010, 0.030, baseAcuityBlur) * 0.24 * nonBlack;
    float scotopic = smoothstep(0.20, 0.03, uAmbientLight) * nonBlack;
    float pivot = min(0.5, colLuma * 0.95);
    colOD = mix(colOD, mix(vec3(0.42), colOD, 0.93), inNonDomOnly * nonBlack);
    colOD = mix(colOD, vec3(colLuma), lowAcuityDrop * 0.35);
    colOD = mix(colOD, (colOD - pivot) * 0.78 + pivot, lowAcuityDrop);
    colOD = mix(colOD, vec3(colLuma) * vec3(0.86, 0.93, 1.06), scotopic * 0.52);

    if (length(uDiplopiaTan) >= 1e-4) {
      // Real quarter-res stereo second-eye target when active (fallback to constant angular shift)
      vec2 uvOS = uvOD;
      float depthOS;
      if (uHasNonDomRT > 0.5) {
        depthOS = linearizeDepth(texture2D(tDepthNonDom, clamp(uvOS, vec2(0.002), vec2(0.998))).x);
      } else {
        vec2 diplopiaUV = vec2(
          uDiplopiaTan.x / (2.0 * uAspect * TAN_HALF_Y),
          uDiplopiaTan.y / (2.0 * TAN_HALF_Y)
        );
        uvOS = clamp(uvOD - diplopiaUV, vec2(0.002), vec2(0.998));
        depthOS = linearizeDepth(texture2D(tDepthOD, uvOS).x);
      }

      float focusClamped = clamp(uFocusEffort, 0.0, 1.0);
      float cocOS = isAphakic * max(0.0, abs(1.0 / max(depthOS, 0.02) - targetVergence) - dofTolerance);
      // Unfocused fake OS contour registers crisper/sharper ("two sharp images"); Focus attentionally softens & deprioritizes OS
      float nonDomBlur = max(0.00035, uAcuityBlurNonDom * mix(0.22, 0.52, focusClamped)) + uCataract * 0.0095 + uAlbinism * 0.0025 + refBlur;
      float isoBlurOS = mix(aphakicBlur, nonDomBlur + clamp(cocOS * 0.0072 * powerRatio, 0.0, 0.028), inCorrection);
      vec3 linOS = sampleOS(uvOS, isoBlurOS, uMlnVelUV, veil, noiseAngle + 1.57);
      linOS = applyLinearPathologies(linOS, uvOS, p, pFovea, uHasNonDomRT > 0.5);
      linOS *= (1.0 - mesopicPath * 0.48);
      vec3 colOS = linearToDisplay(linOS);

      float lumaOD = dot(colOD, vec3(0.299, 0.587, 0.114));
      float lumaOS = dot(colOS, vec3(0.299, 0.587, 0.114));
      colOS = mix(colOS, vec3(lumaOS) * vec3(0.88, 0.94, 1.06), scotopic * 0.48);
      colOS = mix(colOS, vec3(lumaOS), 0.04) * 0.99;

      // Binocular rivalry & per-eye occlusion: covering non-dom removes ghost; genuine obstacle cover of dom switches to stereo OS
      float occlDom = clamp(uOcclOD, 0.0, 1.0);
      float occlNonDom = clamp(uOcclNonDom, 0.0, 1.0);
      float nonDomOpen = 1.0 - smoothstep(0.15, 0.85, occlNonDom);
      float domBlocked = uHasNonDomRT * smoothstep(0.45, 0.92, occlDom) * nonDomOpen;
      float odNearSolid = smoothstep(0.95, 0.55, depthOD) * smoothstep(0.08, 0.25, depthOS - depthOD) * (1.0 - domBlocked);

      // Keep OS image clearly present even in Focus (attentional OD preference, not total disappearance)
      float baseOsBlend = mix(mix(0.38, 0.18, focusClamped), 0.92, domBlocked);
      float osWeight = mix(baseOsBlend, 0.12, odNearSolid * 0.65) * nonDomOpen;

      vec3 linMix = mix(colOD, colOS, osWeight);
      vec3 localBgDisp = linearToDisplay(texture2D(tBlurOD, clamp(uvOD, vec2(0.003), vec2(0.997))).rgb);
      float localBg = dot(localBgDisp, vec3(0.299, 0.587, 0.114));
      float bgBright = smoothstep(0.32, 0.62, localBg);
      vec3 rival = mix(max(colOD, colOS), min(colOD, colOS), bgBright);
      float edgeStrength = smoothstep(0.03, 0.28, abs(lumaOS - lumaOD));
      // Preserve crisp dark OD ink on bright paper (prevents bright shifted OS paper washing black letters to gray)
      float odDarkInk = bgBright * smoothstep(0.06, 0.30, lumaOS - lumaOD) * (1.0 - domBlocked);
      float baseRivalMix = edgeStrength * mix(0.44, 0.22, focusClamped);
      float rivalMix = max(baseRivalMix, odDarkInk * mix(0.55, 0.82, focusClamped)) * (1.0 - odNearSolid * 0.65) * nonDomOpen * (1.0 - domBlocked * 0.85);
      col = mix(linMix, rival, rivalMix);
    } else {
      col = colOD;
    }

    if (hasLens > 0.5) {
      float frameLight = mix(0.10, 1.0, smoothstep(0.03, 0.72, uAmbientLight));
      float edgeLight = mix(0.18, 1.0, smoothstep(0.03, 0.65, uAmbientLight));
      // Dark ring scotoma dead-band transition just outside high-plus aphakic rim
      col *= (1.0 - scotomaBand * 0.28 * powerRatio);

      // Soft out-of-focus bifocal ledge reflection (straight executive split or flat-top D-segment edge)
      float ledgeShade = isAphakic > 0.5
        ? mix(-0.045, 0.070, smoothstep(-0.012, 0.012, dSplit))
        : 0.085;
      col += vec3(ledgeShade * edgeLight) * bifocalLine;

      // Delicate blurred glass edge glint along lower half of semi-rimless / rimless lenses
      col += vec3(0.09, 0.10, 0.12) * edgeLight * glassEdgeGlint;

      // Custom or auto-matched frame finish (blurred translucent out-of-focus silhouette at ~12mm vertex)
      if (rimMask > 0.01) {
        vec3 baseTint = vec3(0.11, 0.12, 0.14);
        float isAcetateTrans = 0.0;
        float isMetallic = 0.0;
        if (effColor < 1.5) {
          baseTint = vec3(0.72, 0.40, 0.11);
          isAcetateTrans = 1.0;
        } else if (effColor < 2.5) {
          baseTint = vec3(0.11, 0.12, 0.14);
        } else if (effColor < 3.5) {
          baseTint = mix(vec3(0.30, 0.16, 0.07), vec3(0.56, 0.33, 0.13), 0.5 + 0.5 * sin(pFrame.x * 42.0 + pFrame.y * 36.0));
        } else if (effColor < 4.5) {
          baseTint = vec3(0.58, 0.62, 0.68);
          isMetallic = 1.0;
        } else if (effColor < 5.5) {
          baseTint = vec3(0.76, 0.60, 0.26);
          isMetallic = 1.0;
        } else if (effColor < 6.5) {
          baseTint = vec3(0.13, 0.20, 0.36);
        } else {
          baseTint = vec3(0.44, 0.11, 0.16);
        }
        vec3 frameTint = baseTint * frameLight;
        float rimBevel = smoothstep(0.0, 0.018, abs(dLenses));
        vec3 rimCol = isAcetateTrans > 0.5
          ? mix(col * frameTint * 1.15 + frameTint * 0.22, frameTint * 0.85, 0.42)
          : mix(col * 0.18 + frameTint * 0.82, frameTint, 0.72);
        rimCol += vec3(0.14, 0.13, 0.12) * frameLight * (1.0 - rimBevel) * (isMetallic > 0.5 ? 0.48 : 0.28);
        col = mix(col, rimCol, rimMask * mix(0.84, 0.76, isAcetateTrans));
      }
    }

    // Subtle reflex squint eyelid narrowing at ultra-close range (< 17 cm)
    if (uSquint > 0.01) {
      float sqEdge = smoothstep(0.44 - uSquint * 0.14, 0.52 - uSquint * 0.12, abs(p.y));
      col *= (1.0 - sqEdge * uSquint * 0.52);
    }

    // Asthenopia crash vignette appears only past the compensatory reserve tipping point
    float vig = smoothstep(0.36, 0.94, length(p));
    col *= (1.0 - decomp * vig * 0.28);
  }
  } // end !uCompareNormal

  // Eyelid closure (R): works in both clinical modes and Normal Compare (V)
  if (uEyelidClose > 0.005) {
    float lidEdge = smoothstep(uEyelidClose * 1.15 - 0.15, uEyelidClose * 1.15 + 0.05, abs(p.y) * 2.0 + 0.06 * (p.x * p.x));
    float closedMask = mix(1.0 - lidEdge, 1.0, smoothstep(0.75, 1.0, uEyelidClose));
    vec3 lidBase = mix(vec3(0.012, 0.006, 0.006), vec3(0.42, 0.165, 0.082), clamp(uEyelidLight, 0.0, 1.0));
    vec3 diffuseGlare = sampleClosedEyelidGlare(vUv, noiseAngle);
    vec3 innerLid = lidBase + diffuseGlare * 0.45;
    col = mix(col, innerLid, clamp(closedMask * uEyelidClose, 0.0, 1.0));
  }

  // Cortical photopsia flashes: vivid even in daylight, edge-preserving so text stays readable "beyond" them (never darkens white paper)
  if (uCompareNormal < 0.5 && uPhospheneScale > 0.005) {
    float phosDimBoost = 1.0 + (1.0 - clamp(uAmbientLight, 0.0, 1.0)) * 0.45;
    vec3 phos = computeFlashPhosphenes(px + uMlnOffsetUV * uResolution * 0.35, uTime, uEyelidClose, decomp) * uPhospheneScale * phosDimBoost;
    float phosMag = max(phos.r, max(phos.g, phos.b));
    if (phosMag > 1e-4) {
      vec3 phosBgDisp = linearToDisplay(texture2D(tBlurOD, clamp(sampleUv, vec2(0.003), vec2(0.997))).rgb);
      float edgeContrast = (1.0 - uEyelidClose) * smoothstep(0.07, 0.34, length(col - phosBgDisp));
      float seeThrough = mix(1.0, 0.30, edgeContrast);
      float bgLuma = dot(col, vec3(0.299, 0.587, 0.114));
      float brightBg = smoothstep(0.55, 0.92, bgLuma);
      vec3 phosHue = phos / phosMag;
      vec3 darkBlend = col + phos * seeThrough;
      // Non-darkening luminous chromatic glint on bright surfaces (white paper stays bright while sparks shimmer vividly)
      vec3 brightGlint = max(col, col * 0.96 + phosHue * clamp(phosMag * 1.45 * seeThrough, 0.0, 0.34));
      col = mix(darkBlend, brightGlint, brightBg);
    }
  }

  // Full-FOV drifting vitreous floaters across entire screen (silenced at 100% glaucoma/RP NLP blindness)
  if (uCompareNormal < 0.5 && uFloaterScale > 0.005) {
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
