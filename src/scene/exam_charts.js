import * as THREE from 'three';
import {
  AMSLER_SPEC,
  ETDRS_ROWS,
  ISHIHARA_PLATES,
  JAEGER_ROWS,
  PELLI_ROBSON_TRIPLETS,
  SLOAN_GLYPHS,
  linearRgbToHex,
} from './exam_calibration.js';

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  return tex;
}

function drawSloanLetter(ctx, ch, x, y, sizePx, color) {
  const grid = SLOAN_GLYPHS[ch];
  if (!grid) return;
  const cell = sizePx / 5;
  ctx.fillStyle = color;
  for (let r = 0; r < 5; r += 1) {
    const row = grid[r];
    for (let c = 0; c < 5; c += 1) {
      if (row[c] === '1') {
        // Tiny 0.35 px overlap eliminates fractional canvas hairline seams between cells
        ctx.fillRect(x + c * cell, y + r * cell, cell + 0.35, cell + 0.35);
      }
    }
  }
}

/**
 * 4.00 m physically angular-calibrated ETDRS / Snellen acuity chart.
 * Board active print face: 0.74 m wide x 0.76 m tall -> 2368 x 2432 px (3.20 px/mm).
 */
export function createEtdrsChartTexture(boardWidthM = 0.74, boardHeightM = 0.76) {
  const pxPerM = 3200;
  const w = Math.round(boardWidthM * pxPerM);
  const h = Math.round(boardHeightM * pxPerM);
  return makeCanvasTexture(w, h, (ctx, cw, ch) => {
    // Clean clinical backlit diffuser white (non-clipping sRGB matte white)
    ctx.fillStyle = '#f5f6f3';
    ctx.fillRect(0, 0, cw, ch);

    // Subtle lightbox perimeter border
    ctx.strokeStyle = '#d3d7dc';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, cw - 36, ch - 36);

    // Header
    ctx.fillStyle = '#252a32';
    ctx.font = 'bold 46px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ETDRS · 4.0 m CALIBRATED ACUITY', cw * 0.5, 44);

    ctx.fillStyle = '#5d6572';
    ctx.font = '28px system-ui, -apple-system, sans-serif';
    ctx.fillText('SNELLEN (20/xx)   ·   5 ARCMIN OPTOTYPES   ·   DECIMAL / LOGMAR', cw * 0.5, 102);

    let cursorY = 196;
    for (let idx = 0; idx < ETDRS_ROWS.length; idx += 1) {
      const row = ETDRS_ROWS[idx];
      const letterPx = row.heightM * pxPerM;
      const letters = row.letters;
      // Standard ETDRS spacing: 1 letter width gap between letters (total = 9 * letterPx)
      const totalRowW = (letters.length * 2 - 1) * letterPx;
      const startX = (cw - totalRowW) * 0.5;

      for (let i = 0; i < letters.length; i += 1) {
        drawSloanLetter(ctx, letters[i], startX + i * 2 * letterPx, cursorY, letterPx, '#0d1014');
      }

      // Row clinical annotations (left: Snellen 20/xx, right: decimal & logMAR)
      const labelFontPx = Math.max(24, Math.min(36, Math.round(letterPx * 0.34)));
      ctx.font = `600 ${labelFontPx}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#47505c';
      ctx.textBaseline = 'middle';
      const midY = cursorY + letterPx * 0.5;

      ctx.textAlign = 'left';
      ctx.fillText(row.snellen, 54, midY);

      ctx.textAlign = 'right';
      const logStr = row.logMar >= 0 ? `+${row.logMar.toFixed(1)}` : row.logMar.toFixed(1);
      ctx.fillText(`${row.decimal.toFixed(2)} (${logStr})`, cw - 54, midY);

      // Subtle green clinical reference line under 20/20 row (logMAR 0.0)
      if (row.snellen === '20/20') {
        ctx.strokeStyle = '#1f8a52';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cw * 0.28, cursorY + letterPx + 14);
        ctx.lineTo(cw * 0.72, cursorY + letterPx + 14);
        ctx.stroke();
      }

      // Row spacing: standard clinical proportional spacing with clean floor so bottom lines stay crisp
      const nextRow = ETDRS_ROWS[idx + 1];
      const gapPx = nextRow ? Math.max(52, nextRow.heightM * pxPerM * 1.24) : 44;
      cursorY += letterPx + gapPx;
    }

    // Bottom calibration footer
    ctx.fillStyle = '#5d6572';
    ctx.font = '26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('20/20 = 5.82 mm @ 4.00 m  ·  20/200 = 58.18 mm', cw * 0.5, ch - 36);
  });
}

/**
 * Pelli-Robson 16-triplet contrast sensitivity chart (0.00 -> 2.25 logCS in 0.15 logCS steps).
 */
export function createPelliRobsonTexture(boardWidthM = 0.58, boardHeightM = 0.76) {
  const pxPerM = 2400;
  const w = Math.round(boardWidthM * pxPerM);
  const h = Math.round(boardHeightM * pxPerM);
  return makeCanvasTexture(w, h, (ctx, cw, ch) => {
    // Background sRGB 242 matches computePelliRobsonInkByte(logCS, 242)
    ctx.fillStyle = 'rgb(242, 242, 242)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.strokeStyle = '#cfd4da';
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, cw - 32, ch - 32);

    ctx.fillStyle = '#252a32';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('PELLI-ROBSON CONTRAST SENSITIVITY', cw * 0.5, 40);

    ctx.fillStyle = '#5c6470';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText('0.00 – 2.25 LOG CS  ·  0.15 LOG STEPS (1 m TEST)', cw * 0.5, 84);

    // 8 rows x 2 triplets; letter height = 4.6 cm (~110 px)
    const letterPx = Math.round(0.044 * pxPerM);
    const letterStep = letterPx * 1.24;
    const tripletW = letterPx + letterStep * 2;
    const colGap = letterPx * 1.45;
    const totalW = tripletW * 2 + colGap;
    const leftX = (cw - totalW) * 0.5;
    const topY = 172;
    const rowPitch = Math.round((ch - topY - 96) / 8);

    for (const triplet of PELLI_ROBSON_TRIPLETS) {
      const y = topY + triplet.row * rowPitch;
      const baseX = leftX + triplet.col * (tripletW + colGap);
      const b = triplet.inkByte;
      const color = `rgb(${b}, ${b}, ${b})`;

      for (let i = 0; i < triplet.letters.length; i += 1) {
        drawSloanLetter(ctx, triplet.letters[i], baseX + i * letterStep, y, letterPx, color);
      }

      // Discrete logCS margin label on outer edge
      ctx.font = '600 22px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.textBaseline = 'middle';
      if (triplet.col === 0) {
        ctx.textAlign = 'left';
        ctx.fillText(triplet.logCS.toFixed(2), 40, y + letterPx * 0.5);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(triplet.logCS.toFixed(2), cw - 40, y + letterPx * 0.5);
      }
    }

    ctx.fillStyle = '#5c6470';
    ctx.font = '21px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CATARACT / DR / GLAUCOMA / MESOPIC CONTRAST CHECK', cw * 0.5, ch - 30);
  });
}

/**
 * Amsler Grid texture (wall board or 13 cm x 16 cm handheld card with exact 10 cm x 10 cm 20x20 grid).
 */
export function createAmslerTexture({ isHandheld = false, cardW = 0.13, cardH = 0.16 } = {}) {
  const w = 1024;
  const h = isHandheld ? Math.round((w * cardH) / cardW) : 1024;
  return makeCanvasTexture(w, h, (ctx, cw, ch) => {
    // Matte cream-white clinical card so glare never hides fine lines
    ctx.fillStyle = '#edeae1';
    ctx.fillRect(0, 0, cw, ch);

    ctx.strokeStyle = '#c4c0b6';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, cw - 24, ch - 24);

    // Exact physical grid proportion (10 cm / 13 cm for handheld card -> 10.0 cm x 10.0 cm)
    const gridPx = isHandheld
      ? Math.round((AMSLER_SPEC.gridSizeM / cardW) * cw)
      : Math.round(cw * 0.78);
    const gx = Math.round((cw - gridPx) * 0.5);
    const gy = isHandheld ? Math.round((ch - gridPx) * 0.54) : Math.round((ch - gridPx) * 0.53);
    const divs = AMSLER_SPEC.divisions;
    const step = gridPx / divs;

    // Header
    ctx.fillStyle = '#1b1f26';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('AMSLER GRID (CHART 1)', cw * 0.5, 36);

    ctx.fillStyle = '#4e5663';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      isHandheld ? 'Hold at 30 cm · 1°/sq · Fixate center dot' : 'Fixate center dot at ~1.3 m (20° field)',
      cw * 0.5,
      80
    );

    // Clean crisp black 20x20 squares
    ctx.strokeStyle = '#121418';
    ctx.lineWidth = isHandheld ? 2.6 : 3.0;
    for (let i = 0; i <= divs; i += 1) {
      const pos = Math.round(i * step) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx + pos, gy);
      ctx.lineTo(gx + pos, gy + gridPx);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(gx, gy + pos);
      ctx.lineTo(gx + gridPx, gy + pos);
      ctx.stroke();
    }

    // Outer frame stroke slightly bolder
    ctx.lineWidth = 5;
    ctx.strokeRect(gx, gy, gridPx, gridPx);

    // Central fixation dot
    ctx.fillStyle = '#101216';
    ctx.beginPath();
    ctx.arc(gx + gridPx * 0.5, gy + gridPx * 0.5, isHandheld ? 9.5 : 10.5, 0, Math.PI * 2);
    ctx.fill();

    // Footer note
    ctx.fillStyle = '#4e5663';
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('WET AMD METAMORPHOPSIA & CENTRAL SCOTOMA', cw * 0.5, ch - 28);
  });
}

function buildPlateMask(numeral, size) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, size, size);
  octx.fillStyle = '#ffffff';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  const fontSize = numeral.length > 1 ? Math.round(size * 0.54) : Math.round(size * 0.66);
  octx.font = `900 ${fontSize}px "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif`;
  octx.fillText(numeral, size * 0.5, size * 0.52);
  return octx.getImageData(0, 0, size, size).data;
}

function drawIshiharaPlate(ctx, plate, cx, cy, radius, seedInit) {
  const maskSize = 192;
  const maskData = buildPlateMask(plate.numeral, maskSize);
  const fgHex = plate.fgLin.map(linearRgbToHex);
  const bgHex = plate.bgLin.map(linearRgbToHex);

  let s = seedInit >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Subtle neutral-dark matte disc backing (matches clinical Ishihara book page contrast)
  ctx.fillStyle = '#e7e4db';
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.fill();

  // Deterministic non-overlapping variable-radius circle packing (authentic Ishihara mosaic)
  const circles = [];
  const radiiSteps = [0.068, 0.056, 0.046, 0.038, 0.031, 0.024];
  const attemptsPerStep = [360, 520, 720, 960, 1200, 1500];
  const pad = Math.max(1.2, radius * 0.008);

  for (let rs = 0; rs < radiiSteps.length; rs += 1) {
    const rDot = radius * radiiSteps[rs];
    const maxR = radius - rDot - 1;
    const attempts = attemptsPerStep[rs];
    for (let a = 0; a < attempts; a += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * maxR;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;

      let overlaps = false;
      for (let j = 0; j < circles.length; j += 1) {
        const c = circles[j];
        const minD = rDot + c.r + pad;
        const ox = dx - c.x;
        const oy = dy - c.y;
        if (ox * ox + oy * oy < minD * minD) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        circles.push({ x: dx, y: dy, r: rDot });
      }
    }
  }

  for (let i = 0; i < circles.length; i += 1) {
    const c = circles[i];
    const u = Math.min(maskSize - 1, Math.max(0, Math.floor(((c.x / radius) * 0.5 + 0.5) * maskSize)));
    const v = Math.min(maskSize - 1, Math.max(0, Math.floor(((c.y / radius) * 0.5 + 0.5) * maskSize)));
    const isFg = maskData[(v * maskSize + u) * 4] > 128;
    const palette = isFg ? fgHex : bgHex;
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.beginPath();
    ctx.arc(cx + c.x, cy + c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 2x2 Clinical Ishihara Panel (Control 12, Deutan 8, Protan 6, Tritan 5) calibrated to Machado (2009).
 */
export function createIshiharaPanelTexture({ isHandheld = false } = {}) {
  const size = isHandheld ? 1024 : 1408;
  return makeCanvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#3a414d';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    ctx.fillStyle = '#e8ecf2';
    ctx.font = `bold ${Math.round(w * 0.030)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ISHIHARA COLOR VISION PLATES', w * 0.5, Math.round(h * 0.032));

    const centers = [
      [w * 0.275, h * 0.315],
      [w * 0.725, h * 0.315],
      [w * 0.275, h * 0.735],
      [w * 0.725, h * 0.735],
    ];
    const plateR = w * 0.178;

    for (let i = 0; i < ISHIHARA_PLATES.length; i += 1) {
      const plate = ISHIHARA_PLATES[i];
      const [cx, cy] = centers[i];
      drawIshiharaPlate(ctx, plate, cx, cy, plateR, 88101 + i * 7919);

      ctx.fillStyle = '#c9d1dc';
      ctx.font = `600 ${Math.round(w * 0.022)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(plate.label, cx, cy + plateR + Math.round(h * 0.016));
    }
  });
}

/**
 * Handheld Near Jaeger Reading Card (11.5 cm x 18.0 cm, calibrated for 35 cm & bifocal near test).
 */
export function createJaegerCardTexture(cardW = 0.115, cardH = 0.18) {
  const pxPerM = 9000; // 9 px/mm -> 1035 x 1620 px
  const w = Math.round(cardW * pxPerM);
  const h = Math.round(cardH * pxPerM);
  return makeCanvasTexture(w, h, (ctx, cw, ch) => {
    // Matte clinical ivory card stock
    ctx.fillStyle = '#ece9df';
    ctx.fillRect(0, 0, cw, ch);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, cw - 40, ch - 40);

    // Header bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 20, cw - 40, 108);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEAR VISION CARD · JAEGER', cw * 0.5, 56);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillText('CALIBRATED FOR 35 cm (14 in) · BIFOCAL / PRESBYOPIA', cw * 0.5, 98);

    const padX = 56;
    const maxLineW = cw - padX * 2;
    let y = 172;

    for (const row of JAEGER_ROWS) {
      // Tag row (J10 / 2.5 M / 20/140)
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 21px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${row.label}  ·  ${row.mUnits.toFixed(2)} M  (${row.snellen35cm} @ 35 cm)`, padX, y);
      y += 30;

      // Exact physical cap-height scaling (Georgia cap height ~ 0.70 * fontSize)
      const capPx = row.heightM * pxPerM;
      const fontPx = Math.max(9.5, capPx / 0.70);
      ctx.fillStyle = '#10141a';
      ctx.font = `${fontPx.toFixed(1)}px Georgia, "Times New Roman", serif`;

      // Simple greedy word wrap inside maxLineW
      const words = row.text.split(' ');
      let line = '';
      const lineStep = Math.max(fontPx * 1.32, 22);
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxLineW && line) {
          ctx.fillText(line, padX, y);
          y += lineStep;
          line = word;
        } else {
          line = next;
        }
      }
      if (line) {
        ctx.fillText(line, padX, y);
        y += lineStep;
      }

      // Subtle divider line
      y += 14;
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(cw - padX, y);
      ctx.stroke();
      y += 22;
    }

    // Bottom near Sloan optotype verification strip (1.0 M = 1.45 mm and 0.5 M = 0.73 mm)
    const stripY = ch - 180;
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEAR SLOAN CHECK (2.0 M / 1.0 M / 0.5 M)', cw * 0.5, stripY);

    const checkSizesM = [0.00291, 0.001454, 0.000727];
    const checkWords = ['CDHKN', 'ORSVZ', 'NHCRD'];
    let sy = stripY + 34;
    for (let i = 0; i < checkSizesM.length; i += 1) {
      const sz = checkSizesM[i] * pxPerM;
      const letters = checkWords[i];
      const rowW = (letters.length * 2 - 1) * sz;
      const sx = (cw - rowW) * 0.5;
      for (let c = 0; c < letters.length; c += 1) {
        drawSloanLetter(ctx, letters[c], sx + c * 2 * sz, sy, sz, '#0d1014');
      }
      sy += sz + 22;
    }
  });
}

/**
 * Dark light-trap baffle texture for the Point-Light Glare Source with 1°/2°/3° angular rings at 4.0 m.
 */
export function createGlareTargetTexture(boardSizeM = 0.58) {
  return makeCanvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#111419';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#2d3440';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const pxPerM = w / boardSizeM;

    // Angular radius rings at 4.0 m: r = 4.0 * tan(deg)
    const rings = [1, 2, 3];
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 2.5;
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.52)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const deg of rings) {
      const rM = 4.0 * Math.tan((deg * Math.PI) / 180);
      const rPx = rM * pxPerM;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${deg}°`, cx, cy - rPx - 4);
    }

    // Crosshair meridian ticks (0°, 45°, 90°, 135°) to inspect astigmatism streak axis
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 2;
    const outerR = 4.0 * Math.tan((3 * Math.PI) / 180) * pxPerM;
    for (const deg of [0, 45, 90, 135]) {
      const rad = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(rad) * outerR, cy - Math.sin(rad) * outerR);
      ctx.lineTo(cx + Math.cos(rad) * outerR, cy + Math.sin(rad) * outerR);
      ctx.stroke();
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('POINT-LIGHT GLARE SOURCE', cx, 26);

    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ASTIGMATISM / CATARACT / HALO CHECK (G)', cx, h - 24);
  });
}

/**
 * Clean clinical vinyl floor tile texture.
 */
export function createExamFloorTexture() {
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#cfd5db';
      ctx.fillRect(0, 0, w, h);

      let seed = 314159;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 1200; i += 1) {
        ctx.fillStyle = rand() > 0.5 ? 'rgba(155, 165, 176, 0.18)' : 'rgba(240, 244, 248, 0.18)';
        ctx.fillRect(rand() * w, rand() * h, 4, 2);
      }

      ctx.strokeStyle = 'rgba(110, 120, 132, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();
    },
    5,
    6
  );
}

/**
 * Floor lane calibration strip texture (e.g. "4.0 m", "2.0 m", "1.0 m").
 */
export function createDistanceMarkerTexture(label) {
  return makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 58px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w * 0.5, h * 0.52);
  });
}
