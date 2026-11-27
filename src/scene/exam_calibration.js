/**
 * Pure clinical optometry calibration math for the P3 Exam Room.
 * Zero DOM or Three.js dependencies so Node unit tests verify exact optics directly.
 */

export const EXAM_VIEW_DISTANCE_M = 4.0;

/**
 * Standard 5x5 Sloan optotype bitmaps (stroke width = 1/5 letter height = 1 MAR).
 */
export const SLOAN_GLYPHS = Object.freeze({
  C: Object.freeze(['01110', '10001', '10000', '10001', '01110']),
  D: Object.freeze(['11110', '10001', '10001', '10001', '11110']),
  H: Object.freeze(['10001', '10001', '11111', '10001', '10001']),
  K: Object.freeze(['10001', '10010', '11100', '10010', '10001']),
  N: Object.freeze(['10001', '11001', '10101', '10011', '10001']),
  O: Object.freeze(['01110', '10001', '10001', '10001', '01110']),
  R: Object.freeze(['11110', '10001', '11110', '10010', '10001']),
  S: Object.freeze(['01111', '10000', '01110', '00001', '11110']),
  V: Object.freeze(['10001', '10001', '10001', '01010', '00100']),
  Z: Object.freeze(['11111', '00010', '00100', '01000', '11111']),
});

/**
 * Exact physical optotype height (meters) for Snellen decimal acuity at viewing distance D.
 * A 20/20 (1.0) optotype subtends 5 arcminutes (1 arcminute per stroke); MAR = 1 / acuity.
 */
export function computeOptotypeHeightM(acuityDecimal, distanceM = EXAM_VIEW_DISTANCE_M) {
  const a = Math.max(0.05, Number.isFinite(acuityDecimal) ? acuityDecimal : 1.0);
  const d = Math.max(0.1, Number.isFinite(distanceM) ? distanceM : EXAM_VIEW_DISTANCE_M);
  const totalArcmin = 5.0 / a;
  const halfAngleRad = ((totalArcmin / 60.0) * 0.5 * Math.PI) / 180.0;
  return 2.0 * d * Math.tan(halfAngleRad);
}

/**
 * Standard 4 m ETDRS logMAR rows (1.0 down to -0.1 in 0.1 logMAR steps, 5 Sloan letters per row).
 */
export const ETDRS_ROWS = Object.freeze(
  [
    { logMar: 1.0, snellen: '20/200', decimal: 0.10, letters: 'NCKZO' },
    { logMar: 0.9, snellen: '20/160', decimal: 0.125, letters: 'RHSDK' },
    { logMar: 0.8, snellen: '20/125', decimal: 0.16, letters: 'DOVHR' },
    { logMar: 0.7, snellen: '20/100', decimal: 0.20, letters: 'CZRHS' },
    { logMar: 0.6, snellen: '20/80', decimal: 0.25, letters: 'ONHRC' },
    { logMar: 0.5, snellen: '20/63', decimal: 0.32, letters: 'DKSNV' },
    { logMar: 0.4, snellen: '20/50', decimal: 0.40, letters: 'ZSOKN' },
    { logMar: 0.3, snellen: '20/40', decimal: 0.50, letters: 'CKDNR' },
    { logMar: 0.2, snellen: '20/32', decimal: 0.63, letters: 'SRZKD' },
    { logMar: 0.1, snellen: '20/25', decimal: 0.80, letters: 'HZOVC' },
    { logMar: 0.0, snellen: '20/20', decimal: 1.00, letters: 'NVDOK' },
    { logMar: -0.1, snellen: '20/16', decimal: 1.25, letters: 'KCSRH' },
  ].map((row) =>
    Object.freeze({
      ...row,
      heightM: computeOptotypeHeightM(row.decimal, EXAM_VIEW_DISTANCE_M),
    })
  )
);

/**
 * Exact IEC 61966-2-1 linear <-> sRGB transfer helpers.
 */
export function linearToSrgb(lin) {
  const c = Math.min(1, Math.max(0, Number.isFinite(lin) ? lin : 0));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbToLinear(srgb) {
  const c = Math.min(1, Math.max(0, Number.isFinite(srgb) ? srgb : 0));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearRgbToHex(rgbLin) {
  const toByte = (v) =>
    Math.round(linearToSrgb(v) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(rgbLin[0])}${toByte(rgbLin[1])}${toByte(rgbLin[2])}`;
}

export function hexToLinearRgb(hex) {
  const clean = String(hex || '#000000').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/**
 * Pelli-Robson Weber contrast C_W = 10^(-logCS) and sRGB ink byte against chart background.
 */
export function computeWeberContrast(logCS) {
  const v = Math.max(0, Number.isFinite(logCS) ? logCS : 0);
  return Math.pow(10, -v);
}

export function computePelliRobsonInkByte(logCS, bgSrgbByte = 242) {
  const bgLin = srgbToLinear(bgSrgbByte / 255);
  const contrast = computeWeberContrast(logCS);
  const inkLin = Math.max(0, bgLin * (1.0 - contrast));
  return Math.round(linearToSrgb(inkLin) * 255);
}

const PELLI_LETTERS = [
  'VRS', 'KDR',
  'NHC', 'SOK',
  'SCN', 'OZV',
  'CNH', 'ZOK',
  'NOD', 'VHR',
  'CDN', 'ZSV',
  'KCH', 'ODK',
  'RSZ', 'HVR',
];

export const PELLI_ROBSON_TRIPLETS = Object.freeze(
  PELLI_LETTERS.map((letters, idx) => {
    const logCS = Number((idx * 0.15).toFixed(2));
    return Object.freeze({
      index: idx,
      row: Math.floor(idx / 2),
      col: idx % 2,
      letters,
      logCS,
      weberContrast: computeWeberContrast(logCS),
      inkByte: computePelliRobsonInkByte(logCS),
    });
  })
);

/**
 * Amsler grid specification: 10 cm x 10 cm (20 x 20 squares of 5 mm) subtends ~19-20 deg at 30 cm.
 */
export const AMSLER_SPEC = Object.freeze({
  gridSizeM: 0.10,
  divisions: 20,
  testDistM: 0.30,
  wallGridSizeM: 0.44,
  wallTestDistM: 1.32,
});

export function computeAmslerAngularDeg(sizeM = AMSLER_SPEC.gridSizeM, distM = AMSLER_SPEC.testDistM) {
  const s = Math.max(0.01, Number.isFinite(sizeM) ? sizeM : AMSLER_SPEC.gridSizeM);
  const d = Math.max(0.05, Number.isFinite(distM) ? distM : AMSLER_SPEC.testDistM);
  return (2.0 * Math.atan(s / (2.0 * d)) * 180.0) / Math.PI;
}

/**
 * Near Jaeger reading card rows calibrated in M-units (1 M = 1.4544 mm cap height = 5 arcmin at 1 m).
 */
export function computeJaegerHeightM(mUnits) {
  const m = Math.max(0.2, Number.isFinite(mUnits) ? mUnits : 1.0);
  return computeOptotypeHeightM(1.0, 1.0) * m;
}

export const JAEGER_ROWS = Object.freeze(
  [
    {
      label: 'J10',
      mUnits: 2.5,
      snellen35cm: '20/140',
      text: 'The morning light fills the quiet room.',
    },
    {
      label: 'J7',
      mUnits: 1.6,
      snellen35cm: '20/90',
      text: 'Steady near focus needs clear reading power and good illumination.',
    },
    {
      label: 'J5',
      mUnits: 1.25,
      snellen35cm: '20/70',
      text: 'Hold this card at 35 cm to evaluate presbyopia, bifocal segments, and progressive reading corridors under normal lighting.',
    },
    {
      label: 'J3',
      mUnits: 0.8,
      snellen35cm: '20/45',
      text: 'Standard newsprint text tests reading comfort across the lower near lens. Notice how slight changes in viewing distance affect clarity when accommodation is absent or reduced.',
    },
    {
      label: 'J2',
      mUnits: 0.6,
      snellen35cm: '20/35',
      text: 'Compact medication labels and fine book footnotes verify near optical precision, residual astigmatism alignment, and contrast sensitivity at standard reading range.',
    },
    {
      label: 'J1',
      mUnits: 0.4,
      snellen35cm: '20/23',
      text: 'Finest Jaeger clinical print (0.4 M at 35 cm) for near acuity calibration. With +17 D aphakic near bifocals, sliding the card closer to 20 cm brings fine print into crisp focus.',
    },
  ].map((row) =>
    Object.freeze({
      ...row,
      heightM: computeJaegerHeightM(row.mUnits),
    })
  )
);

/**
 * Exact Machado (2009) linear-RGB CVD matrices (kept in strict sync with src/shaders/vision.frag.glsl).
 */
export const MACHADO_CVD_MATRICES = Object.freeze({
  deutan: Object.freeze([
    Object.freeze([0.367322, 0.860646, -0.227968]),
    Object.freeze([0.280085, 0.672501, 0.047413]),
    Object.freeze([-0.011820, 0.042940, 0.968881]),
  ]),
  protan: Object.freeze([
    Object.freeze([0.152286, 1.052583, -0.204868]),
    Object.freeze([0.114503, 0.786281, 0.099216]),
    Object.freeze([-0.003882, -0.048116, 1.051998]),
  ]),
  tritan: Object.freeze([
    Object.freeze([1.255528, -0.076749, -0.178779]),
    Object.freeze([-0.078411, 0.930809, 0.147602]),
    Object.freeze([0.004733, 0.691367, 0.303900]),
  ]),
});

export function applyMachadoCvd(rgbLin, cvdType) {
  const mat = MACHADO_CVD_MATRICES[cvdType];
  if (!mat) return [...rgbLin];
  return [
    Math.min(4, Math.max(0, mat[0][0] * rgbLin[0] + mat[0][1] * rgbLin[1] + mat[0][2] * rgbLin[2])),
    Math.min(4, Math.max(0, mat[1][0] * rgbLin[0] + mat[1][1] * rgbLin[1] + mat[1][2] * rgbLin[2])),
    Math.min(4, Math.max(0, mat[2][0] * rgbLin[0] + mat[2][1] * rgbLin[1] + mat[2][2] * rgbLin[2])),
  ];
}

export function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function buildLinearPalette(baseLin, deltaLin, scales) {
  return Object.freeze(
    scales.map((s) =>
      Object.freeze([
        Math.min(0.95, Math.max(0.01, (baseLin[0] + deltaLin[0]) * s)),
        Math.min(0.95, Math.max(0.01, (baseLin[1] + deltaLin[1]) * s)),
        Math.min(0.95, Math.max(0.01, (baseLin[2] + deltaLin[2]) * s)),
      ])
    )
  );
}

/**
 * Pseudoisochromatic Ishihara plates mathematically solved along Machado (2009) null/confusion vectors:
 *  - Control "12": high contrast in Normal, Deutan, Protan, and Tritan
 *  - Deutan "8": coral-red vs sage-green along exact M_deutan null vector (||M_d * (fg - bg)|| = 0)
 *  - Protan "6": terracotta-red vs forest-green along exact M_protan null vector (||M_p * (fg - bg)|| = 0)
 *  - Tritan "5": olive-yellow vs violet-blue along M_tritan minimum-singular confusion vector
 */
const JITTER_SCALES = [0.84, 0.94, 1.0, 1.08, 1.18];

export const ISHIHARA_PLATES = Object.freeze([
  Object.freeze({
    id: 'control',
    numeral: '12',
    label: 'Control (12)',
    targetCvd: 'none',
    fgMeanLin: Object.freeze([0.74, 0.24, 0.04]),
    bgMeanLin: Object.freeze([0.07, 0.26, 0.34]),
    fgLin: buildLinearPalette([0.74, 0.24, 0.04], [0, 0, 0], JITTER_SCALES),
    bgLin: buildLinearPalette([0.07, 0.26, 0.34], [0, 0, 0], JITTER_SCALES),
  }),
  Object.freeze({
    id: 'deutan',
    numeral: '8',
    label: 'Deutan (8)',
    targetCvd: 'deutan',
    fgMeanLin: Object.freeze([0.4844, 0.1628, 0.1457]),
    bgMeanLin: Object.freeze([0.1156, 0.3172, 0.1343]),
    fgLin: buildLinearPalette([0.30, 0.24, 0.14], [0.1844, -0.0772, 0.0057], JITTER_SCALES),
    bgLin: buildLinearPalette([0.30, 0.24, 0.14], [-0.1844, 0.0772, -0.0057], JITTER_SCALES),
  }),
  Object.freeze({
    id: 'protan',
    numeral: '6',
    label: 'Protan (6)',
    targetCvd: 'protan',
    fgMeanLin: Object.freeze([0.4979, 0.2113, 0.1394]),
    bgMeanLin: Object.freeze([0.1021, 0.2687, 0.1406]),
    fgLin: buildLinearPalette([0.30, 0.24, 0.14], [0.1979, -0.0287, -0.0006], JITTER_SCALES),
    bgLin: buildLinearPalette([0.30, 0.24, 0.14], [-0.1979, 0.0287, 0.0006], JITTER_SCALES),
  }),
  Object.freeze({
    id: 'tritan',
    numeral: '5',
    label: 'Tritan (5)',
    targetCvd: 'tritan',
    fgMeanLin: Object.freeze([0.2062, 0.3194, 0.0708]),
    bgMeanLin: Object.freeze([0.2738, 0.1806, 0.6092]),
    fgLin: buildLinearPalette([0.24, 0.25, 0.34], [-0.0338, 0.0694, -0.2692], JITTER_SCALES),
    bgLin: buildLinearPalette([0.24, 0.25, 0.34], [0.0338, -0.0694, 0.2692], JITTER_SCALES),
  }),
]);
