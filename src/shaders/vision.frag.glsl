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
uniform float uEyelidLight;
uniform float uFatigue;
uniform float uOcclOD;
uniform float uFocusEffort;
uniform float uCompareNormal;
uniform vec2 uMlnOffsetUV;
uniform float uMlnVelUV;
uniform vec2 uResolution;

varying vec2 vUv;

const float TAN_HALF_Y = 0.6008606; // tan(31 deg)
const float IPD_M = 0.058;

float linearizeDepth(float d) {
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / max(0.0001, (uFar + uNear - ndc * (uFar - uNear)));
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

// Per-pixel diplopia offset (degrees) matching state.js:
// 1cm L / 0.5cm U @ 0.1m, 2cm L / 1cm U @ 0.4m, 5cm L / 1.5cm U @ 3m+
vec2 computePerPixelDiplopiaDeg(float distMeters) {
  float d = clamp(distMeters, 0.05, 3.0);
  float dx = -(0.552 + 1.2535 / (d + 0.143));
  float dy = 0.0295 + 0.8316 / (d + 0.1938);
  return vec2(dx, dy);
}

// Zero-texture-cost sparse rapidly-flickering coarse pixel phosphenes (preserves warm eyelid translucency)
vec3 computeTwinklingPhosphenes(vec2 px, float t, float closed, float decomp) {
  float cellSize = mix(5.5, 6.5, closed);
  vec2 cellPos = px / cellSize;
  vec2 cell = floor(cellPos);
  // Soft rounded pixel kernel so phosphenes twinkle organically instead of looking like a hard checkerboard
  vec2 cellLocal = fract(cellPos) - 0.5;
  float dotShape = smoothstep(0.52, 0.14, length(cellLocal));

  float phase = hash12(cell * 0.73) * 9.0;
  float tick = floor(t * 20.0 + phase);
  float onRoll = hash12(cell + vec2(tick * 13.7, tick * 7.3));
  float threshold = mix(0.92 - decomp * 0.04, 0.78, closed);
  float isLit = step(threshold, onRoll) * dotShape;

  vec3 rawCol = hash32(cell * 1.17 + vec2(tick * 19.1, tick * 5.9));
  vec3 vivid = smoothstep(0.15, 0.85, rawCol);
  float luma = dot(vivid, vec3(0.299, 0.587, 0.114));
  vec3 tinted = mix(vec3(luma), vivid, mix(0.30, 0.96, closed));

  float amp = mix(0.032 + decomp * 0.025, 0.14, closed);
  return tinted * isLit * amp;
}

// Fast optical OD sampling: razor-sharp when in focal sweet-spot, 6-tap blur only when defocused, bright-only HOA
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
  vec2 cUv = clamp(baseUv, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(tColorOD, cUv).rgb;

  // High-plus eccentric lateral chromatic aberration (Delta = c * D)
  if (chromaShiftUV > 0.0004) {
    vec2 cOff = radialDir * chromaShiftUV * invAspect;
    col.r = texture2D(tColorOD, clamp(baseUv + cOff, vec2(0.001), vec2(0.999))).r;
    col.b = texture2D(tColorOD, clamp(baseUv - cOff, vec2(0.001), vec2(0.999))).b;
  }

  // Skip multi-tap defocus completely when pixel lies inside the focal sweet-spot
  float blurDrive = isoBlurUV + motionSmearUV;
  if (blurDrive > 0.0007) {
    vec2 perpDir = vec2(-astDir.y, astDir.x);
    vec3 acc = col;
    const int TAPS = 6;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / float(TAPS));
      float theta = fi * 2.39996323 + angleSeed;
      vec2 disk = vec2(cos(theta), sin(theta)) * r;
      vec2 off = disk * isoBlurUV + astDir * (disk.x * astBlurUV) + perpDir * (disk.y * astBlurUV * 0.25) + vec2(disk.x * motionSmearUV, 0.0);
      acc += texture2D(tColorOD, clamp(baseUv + off * invAspect, vec2(0.001), vec2(0.999))).rgb;
    }
    vec3 blurred = acc / float(TAPS + 1);
    col = mix(col, blurred, smoothstep(0.0007, 0.0042, blurDrive));
  }

  // Subtle directional 123-deg astigmatism micro-edge artifact (keeps sharp readability)
  vec2 astEdgeOff = astDir * astBlurUV * invAspect;
  vec3 astGhost = 0.5 * (
    texture2D(tColorOD, clamp(baseUv + astEdgeOff, vec2(0.001), vec2(0.999))).rgb +
    texture2D(tColorOD, clamp(baseUv - astEdgeOff, vec2(0.001), vec2(0.999))).rgb
  );
  col = mix(col, astGhost, 0.12);

  // 4-tap asymmetric coma/trefoil HOA glare strictly on bright highlights (windows, bright chalk)
  if (hoaStrength > 0.01) {
    vec3 hoa = vec3(0.0);
    vec2 comaAxis = normalize(astDir + vec2(0.25, -0.45));
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float ang = (fj < 2.0) ? (fj * 2.0943951 + 0.45) : atan(comaAxis.y, comaAxis.x);
      float rad = (fj < 2.0) ? 0.013 : (0.009 + (fj - 2.0) * 0.011);
      vec3 hc = texture2D(tColorOD, clamp(baseUv + vec2(cos(ang), sin(ang)) * rad * invAspect, vec2(0.001), vec2(0.999))).rgb;
      float bright = smoothstep(0.76, 1.0, dot(hc, vec3(0.299, 0.587, 0.114)));
      hoa += hc * bright * 0.12;
    }
    col += hoa * hoaStrength;
  }

  return col;
}

// Lightweight 4-tap amblyopic OS sampling (already half-res target -> fast & naturally soft VOS 0.15)
vec3 sampleOS(vec2 baseUv, float isoBlurUV, float motionSmearUV, float angleSeed) {
  vec2 invAspect = vec2(1.0 / uAspect, 1.0);
  vec3 acc = vec3(0.0);
  const int TAPS = 4;
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i);
    float theta = fi * 1.5707963 + angleSeed;
    vec2 disk = vec2(cos(theta), sin(theta));
    vec2 off = vec2(disk.x * (isoBlurUV + 0.004 + motionSmearUV), disk.y * isoBlurUV);
    acc += texture2D(tColorOS, clamp(baseUv + off * invAspect, vec2(0.002), vec2(0.998))).rgb;
  }
  return acc * 0.25;
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
  // Comparison mode (V): always clean baseline normal vision regardless of eyelid transition
  if (uCompareNormal > 0.5) {
    gl_FragColor = vec4(texture2D(tColorOD, vUv).rgb, 1.0);
    return;
  }

  vec2 px = vUv * uResolution;
  float noiseAngle = ign(px + fract(uTime * 17.3) * 100.0) * 6.2831853;

  // Aspect-normalized screen space centered at (0, 0), height = 1.0
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Round amber executive bifocal sized for realistic ~13mm vertex distance while keeping rim blur visible
  vec2 cL = vec2(-0.30, -0.02);
  vec2 cR = vec2( 0.30, -0.02);
  float lensR = 0.42;

  float dL = sdCircle(p, cL, lensR);
  float dR = sdCircle(p, cR, lensR);
  float dLenses = min(dL, dR);

  // Subtle amber acetate nose bridge right at the upper rim cusp
  float dBridge = sdSegment(p, vec2(-0.045, 0.275), vec2(0.045, 0.275)) - 0.015;
  float rimThickness = 0.022;
  float rimBand = min(abs(dLenses) - rimThickness * 0.5, dBridge);
  float glassesOn = step(0.5, uGlassesOn);

  float inLens = glassesOn * (1.0 - smoothstep(-0.004, 0.004, dLenses));
  float rimMask = glassesOn * (1.0 - smoothstep(-0.004, 0.004, rimBand));

  // Executive bifocal: straight horizontal split across the middle of both lenses
  float splitY = -0.02;
  float dSplit = p.y - splitY;
  float inBifocal = inLens * (1.0 - smoothstep(-0.004, 0.004, dSplit));
  float bifocalLine = inLens * (1.0 - smoothstep(0.0, 0.0055, abs(dSplit)));

  // High-plus (+13D / +15.75D) optical UV mapping + jack-in-the-box ring scotoma jump at rim
  vec2 pOpt = p - vec2(0.0, -0.02);
  float rLen = length(pOpt);
  float r2 = dot(pOpt, pOpt);
  float mag = mix(1.24, 1.29, inBifocal);
  float pincushion = 1.0 + 0.16 * r2;
  vec2 pMag = pOpt / (mag * pincushion) + vec2(0.0, -0.02);
  pMag += vec2(0.0, -0.012) * inBifocal;
  vec2 uvLens = pMag / vec2(uAspect, 1.0) + 0.5;

  // Outside rim: outward prismatic push creates authentic ring scotoma dead-band
  vec2 radialDir = rLen > 1e-4 ? (pOpt / rLen) : vec2(0.0);
  float scotomaBand = glassesOn * (1.0 - inLens) * exp(-max(0.0, dLenses) * 14.0);
  vec2 uvOutside = vUv + (radialDir * 0.022 * scotomaBand) / vec2(uAspect, 1.0);
  vec2 uvOD = mix(uvOutside, uvLens, inLens);

  vec3 col = vec3(0.0);
  // Reserve-depletion -> tipping-point crash curve (matches state.js computeDecompensation)
  float decomp = smoothstep(0.58, 0.96, uFatigue);

  if (uEyelidClose < 0.995) {
    float depthOD = linearizeDepth(texture2D(tDepthOD, clamp(uvOD, vec2(0.001), vec2(0.999))).x);
    // Distance half: crisp on 2.5m..8m blackboard/room; Near half: crisp sweet-spot around 0.30m..0.52m workbook/held items
    float targetFocus = mix(3.8, 0.40, inBifocal);
    float dofTolerance = mix(0.22, 0.58, inBifocal);
    float cocDiopters = max(0.0, abs(1.0 / max(depthOD, 0.02) - 1.0 / targetFocus) - dofTolerance);

    float correctedBlur = clamp(cocDiopters * 0.0062, 0.0, 0.030);
    float aphakicBlur = 0.036;
    float isoBlurOD = mix(aphakicBlur, correctedBlur, inLens);

    vec2 astDirOD = vec2(cos(radians(123.0)), sin(radians(123.0)));
    float astBlurOD = mix(0.009, 0.0013, inLens) + decomp * 0.0014;
    float hoaOD = mix(0.75, 0.40 + decomp * 0.35, inLens);
    float chromaOD = inLens * clamp(rLen * 0.0055, 0.0, 0.0036);

    vec3 colOD = sampleOD(
      uvOD, isoBlurOD, astBlurOD, astDirOD, hoaOD, uMlnVelUV, chromaOD, radialDir, noiseAngle
    );

    // Per-pixel depth-varying diplopia: cancel parallel OS stereo baseline, then apply exact metric offset
    vec2 dipDeg = computePerPixelDiplopiaDeg(depthOD);
    vec2 diplopiaUV = vec2(
      tan(radians(dipDeg.x)) / (2.0 * uAspect * TAN_HALF_Y),
      tan(radians(dipDeg.y)) / (2.0 * TAN_HALF_Y)
    );
    float stereoParallaxU = (IPD_M / max(depthOD, 0.05)) / (2.0 * uAspect * TAN_HALF_Y);
    vec2 prenticeDiv = inLens * (-0.011 * pOpt / vec2(uAspect, 1.0));
    vec2 uvOS = clamp(uvOD + vec2(stereoParallaxU, 0.0) - diplopiaUV + prenticeDiv, vec2(0.002), vec2(0.998));

    float depthOS = linearizeDepth(texture2D(tDepthOS, uvOS).x);
    float cocOS = max(0.0, abs(1.0 / max(depthOS, 0.02) - 1.0 / targetFocus) - dofTolerance);
    float isoBlurOS = mix(aphakicBlur * 1.1, 0.0045 + clamp(cocOS * 0.007, 0.0, 0.026), inLens);
    vec3 colOS = sampleOS(uvOS, isoBlurOS, uMlnVelUV, noiseAngle + 1.57);

    float lumaOS = dot(colOS, vec3(0.299, 0.587, 0.114));
    colOS = mix(colOS, vec3(lumaOS), 0.18) * 0.96;

    // Binocular rivalry: solid near foreground objects in OD stay opaque & solid
    float odNearSolid = smoothstep(0.95, 0.55, depthOD) * smoothstep(0.08, 0.25, depthOS - depthOD);
    float baseOsBlend = mix(0.38, 0.56, clamp(uOcclOD, 0.0, 1.0));
    float suppressedOsBlend = baseOsBlend * (1.0 - 0.62 * clamp(uFocusEffort, 0.0, 1.0));
    float osBlend = mix(suppressedOsBlend, 0.05, odNearSolid);
    col = mix(colOD, colOS, osBlend);

    // Subtle dark ring scotoma shadow just outside the high-plus rim
    col *= (1.0 - scotomaBand * 0.20);

    // Crisp horizontal executive bifocal ledge reflection
    float ledgeShade = mix(-0.04, 0.075, smoothstep(-0.003, 0.003, dSplit));
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

  // Subtle sparse rapidly-twinkling coarse pixel phosphenes (zero extra textures; preserves eyelid shade)
  col += computeTwinklingPhosphenes(px, uTime, uEyelidClose, decomp);

  // Ever-present CRT-static snow across full FOV (open AND closed)
  vec2 staticCoord = floor(px * 0.75);
  vec3 snow = hash32(staticCoord + fract(uTime * 31.7) * 251.0);
  float snowMono = dot(snow, vec3(0.333));
  vec3 unsatSnow = mix(vec3(snowMono), snow, 0.35) - 0.5;
  float staticAmp = mix(0.042, 0.070, uEyelidClose) + decomp * 0.032;
  col += unsatSnow * staticAmp;

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
