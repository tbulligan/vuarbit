uniform sampler2D tColorOD;
uniform sampler2D tDepthOD;
uniform sampler2D tColorOS;
uniform sampler2D tDepthOS;

uniform float uNear;
uniform float uFar;
uniform float uAspect;
uniform float uTime;
uniform float uGlassesOn;
uniform float uEyelidClose;
uniform float uFatigue;
uniform float uOcclusion;
uniform float uMlnIntensity;
uniform vec2 uDiplopiaDeg;
uniform vec2 uMlnOffsetUV;
uniform vec2 uResolution;

varying vec2 vUv;

const float FOV_Y_DEG = 62.0;
const float TAN_HALF_Y = 0.6008606; // tan(31 deg)

float linearizeDepth(float d) {
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(0.0001, (uFar + uNear - ndc * (uFar - uNear)));
}

// Interleaved gradient noise for low-artifact rotated blur taps
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

// Sample scene with anisotropic astigmatism + isotropic CoC defocus + HOA scatter
vec3 sampleEyeOptical(
  sampler2D texColor,
  vec2 baseUv,
  float isoBlurUV,
  float astBlurUV,
  vec2 astDir,
  float hoaStrength,
  float angleSeed
) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  vec2 perpDir = vec2(-astDir.y, astDir.x);

  vec3 acc = vec3(0.0);
  float wSum = 0.0;

  // 14-tap Vogel spiral combining isotropic CoC and directional astigmatism
  const int TAPS = 14;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(TAPS));
    float theta = fi * 2.39996323 + angleSeed;
    vec2 disk = vec2(cos(theta), sin(theta)) * r;

    // Stretch along astigmatic meridian, keep minor axis narrower
    vec2 astOffset = (astDir * (disk.x * astBlurUV) + perpDir * (disk.y * astBlurUV * 0.28));
    vec2 isoOffset = disk * isoBlurUV;
    vec2 tapUv = clamp(baseUv + (isoOffset + astOffset) * invAspect, vec2(0.001), vec2(0.999));

    vec3 c = texture2D(texColor, tapUv).rgb;
    float w = 1.0;
    acc += c * w;
    wSum += w;
  }
  vec3 col = acc / wSum;

  // Asymmetrical coma & trefoil corneal HOA scatter on bright highlights (windows, chalk)
  if (hoaStrength > 0.01) {
    vec3 hoa = vec3(0.0);
    vec2 comaAxis = normalize(astDir + vec2(0.25, -0.45));
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      // 3 asymmetric trefoil lobes + 3 coma tail steps
      float ang = (fj < 3.0) ? (fj * 2.0943951 + 0.45) : atan(comaAxis.y, comaAxis.x);
      float rad = (fj < 3.0) ? 0.014 : (0.008 + (fj - 3.0) * 0.011);
      vec2 hUv = clamp(baseUv + vec2(cos(ang), sin(ang)) * rad * invAspect, vec2(0.001), vec2(0.999));
      vec3 hc = texture2D(texColor, hUv).rgb;
      float luma = dot(hc, vec3(0.299, 0.587, 0.114));
      float bright = smoothstep(0.68, 1.0, luma);
      hoa += hc * bright * (fj < 3.0 ? 0.11 : 0.15);
    }
    col += hoa * hoaStrength;
  }

  return col;
}

void main() {
  vec2 px = vUv * uResolution;
  float noiseAngle = ign(px + fract(uTime * 17.3) * 100.0) * 6.2831853;

  // Aspect-normalized screen space centered at (0, 0), height = 1.0
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Childhood round-frame amber blended bifocal geometry
  vec2 cL = vec2(-0.27, -0.02);
  vec2 cR = vec2( 0.27, -0.02);
  float lensR = 0.38;

  float dL = sdCircle(p, cL, lensR);
  float dR = sdCircle(p, cR, lensR);
  float dLenses = min(dL, dR);

  // Keyhole amber acetate nose bridge connecting left and right rims
  float dBridge = sdSegment(p, vec2(-0.10, 0.17), vec2(0.10, 0.17)) - 0.024;
  float rimThickness = 0.024;
  float rimBand = min(abs(dLenses) - rimThickness * 0.5, dBridge);
  float glassesOn = step(0.5, uGlassesOn);

  // Inside glass aperture vs outside rim
  float inLens = glassesOn * (1.0 - smoothstep(-0.004, 0.004, dLenses));
  float rimMask = glassesOn * (1.0 - smoothstep(-0.004, 0.004, rimBand));

  // Lower round/blended bifocal segment (~38% lower arc, nasally inset for convergence)
  vec2 sL = vec2(-0.13, -0.38);
  vec2 sR = vec2( 0.13, -0.38);
  float segR = 0.27;
  float dSeg = min(sdCircle(p, sL, segR), sdCircle(p, sR, segR));
  float inBifocal = inLens * (1.0 - smoothstep(-0.014, 0.014, dSeg));
  float bifocalEdge = inLens * (1.0 - smoothstep(0.0, 0.012, abs(dSeg)));

  // Optical UV mapping (C1-smooth across x=0):
  // +13D distance lens: ~1.26x magnification + pincushion distortion + Prentice prismatic pull
  vec2 pOpt = p - vec2(0.0, -0.02);
  float r2 = dot(pOpt, pOpt);
  float mag = mix(1.26, 1.31, inBifocal);
  float pincushion = 1.0 + 0.18 * r2;
  vec2 pMag = pOpt / (mag * pincushion) + vec2(0.0, -0.02);

  // Slight prismatic jump downward in +2.75D bifocal segment + Prentice decentration
  pMag += vec2(0.0, -0.012) * inBifocal;
  vec2 uvLens = pMag / vec2(uAspect, 1.0) + 0.5;
  vec2 uvOD = mix(vUv, uvLens, inLens);

  // Sample OD depth and compute zero-accommodation optical blur
  float depthOD = linearizeDepth(texture2D(tDepthOD, clamp(uvOD, vec2(0.001), vec2(0.999))).x);
  float targetFocus = mix(3.8, 0.36, inBifocal);
  float cocDiopters = abs(1.0 / max(depthOD, 0.04) - 1.0 / targetFocus);

  // Heavy uncorrected +13D aphakic blur outside lens rims or when glasses are OFF
  float correctedBlur = clamp(cocDiopters * 0.0075, 0.0, 0.032);
  float aphakicBlur = 0.038;
  float isoBlurOD = mix(aphakicBlur, correctedBlur, inLens);

  // Residual astigmatism at 123 deg (OD) persists even with glasses ON
  vec2 astDirOD = vec2(cos(radians(123.0)), sin(radians(123.0)));
  float astBlurOD = mix(0.012, 0.0032, inLens) + uFatigue * 0.0018;
  float hoaOD = mix(0.85, 0.55 + uFatigue * 0.35, inLens);

  vec3 colOD = sampleEyeOptical(tColorOD, uvOD, isoBlurOD, astBlurOD, astDirOD, hoaOD, noiseAngle);

  // Diplopia: amblyopic OS (VOS 0.15) shifted UP & LEFT + eccentric Prentice prismatic divergence
  vec2 diplopiaUV = vec2(
    tan(radians(uDiplopiaDeg.x)) / (2.0 * uAspect * TAN_HALF_Y),
    tan(radians(uDiplopiaDeg.y)) / (2.0 * TAN_HALF_Y)
  );
  vec2 prenticeDivergence = inLens * (-0.011 * pOpt / vec2(uAspect, 1.0));
  vec2 uvOS = clamp(uvOD - diplopiaUV + prenticeDivergence, vec2(0.001), vec2(0.999));

  // OS has lower acuity (VOS 0.15) and horizontal 180 deg residual astigmatism
  float depthOS = linearizeDepth(texture2D(tDepthOS, uvOS).x);
  float cocOS = abs(1.0 / max(depthOS, 0.04) - 1.0 / targetFocus);
  float isoBlurOS = mix(aphakicBlur * 1.15, 0.014 + clamp(cocOS * 0.0085, 0.0, 0.032), inLens);
  vec2 astDirOS = vec2(-1.0, 0.0); // 180 deg axis
  vec3 colOS = sampleEyeOptical(tColorOS, uvOS, isoBlurOS, 0.011, astDirOS, 0.35, noiseAngle + 1.57);

  // Desaturate and reduce contrast of amblyopic OS image, blend ~0.35 (stronger if OD occluded)
  float lumaOS = dot(colOS, vec3(0.299, 0.587, 0.114));
  colOS = mix(colOS, vec3(lumaOS), 0.32) * 0.92;
  float osBlend = mix(0.35, 0.52, clamp(uOcclusion, 0.0, 1.0));
  vec3 col = mix(colOD, colOS, osBlend);

  // Subtle blended bifocal demarcation cue
  col += vec3(0.06, 0.05, 0.03) * bifocalEdge * 0.55;

  // Warm translucent amber acetate rim + gentle specular highlight
  if (rimMask > 0.01) {
    vec3 amberTint = vec3(0.72, 0.40, 0.11);
    float rimBevel = smoothstep(0.0, 0.012, abs(dLenses));
    vec3 rimCol = mix(col * amberTint * 1.15 + amberTint * 0.24, amberTint * 0.85, 0.45);
    rimCol += vec3(0.14, 0.10, 0.04) * (1.0 - rimBevel) * 0.5;
    col = mix(col, rimCol, rimMask * 0.88);
  }

  // Eyelid closure (R): warm dark inner eyelid with faint ambient light bleed
  if (uEyelidClose > 0.005) {
    float lidEdge = smoothstep(uEyelidClose * 1.15 - 0.15, uEyelidClose * 1.15 + 0.05, abs(p.y) * 2.0 + 0.06 * (p.x * p.x));
    float closedMask = mix(1.0 - lidEdge, 1.0, smoothstep(0.75, 1.0, uEyelidClose));
    vec3 innerLid = vec3(0.055, 0.022, 0.018) + col * vec3(0.08, 0.03, 0.02);
    col = mix(col, innerLid, clamp(closedMask * uEyelidClose, 0.0, 1.0));
  }

  // Ever-present CRT-static snow & soft vitreous floaters (visible open AND closed)
  vec2 staticCoord = floor(px * 0.75);
  vec3 snow = hash32(staticCoord + fract(uTime * 31.7) * 251.0);
  float snowMono = dot(snow, vec3(0.333));
  vec3 unsatSnow = mix(vec3(snowMono), snow, 0.35) - 0.5;
  float staticAmp = mix(0.065, 0.095, uEyelidClose) + uFatigue * 0.035;
  col += unsatSnow * staticAmp;

  // Soft drifting vitreous micro-specks
  float speckShadow = 0.0;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    vec2 seedPos = vec2(
      sin(fk * 2.13 + uTime * (0.18 + fk * 0.03)) * 0.36 + cos(fk * 4.7) * 0.22,
      cos(fk * 1.71 + uTime * (0.14 + fk * 0.02)) * 0.26 + sin(fk * 3.1) * 0.12
    ) + uMlnOffsetUV * 2.2;
    float dSpeck = length(p - seedPos);
    float rSpeck = 0.008 + 0.005 * hash12(vec2(fk, 1.0));
    speckShadow += (1.0 - smoothstep(rSpeck * 0.3, rSpeck * 2.2, dSpeck)) * 0.14;
  }
  col *= (1.0 - clamp(speckShadow, 0.0, 0.35));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
