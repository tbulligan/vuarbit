import * as THREE from 'three';
import { computeOcclusionFromDistance } from './state.js';
import { createStylizedPerson, populateClassmates } from './scene/classmates.js';
import { createUpgradedPickables, populateClassroomProps } from './scene/props.js';
import { createPlayerShadowCaster } from './scene/player_shadow.js';

// shortcut: procedural geometry + canvas textures only (no external glTF models), upgrade if custom rigged/scanned meshes are ever added

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

function createTerrazzoTexture() {
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#c8c2b6';
      ctx.fillRect(0, 0, w, h);

      // Deterministic PRNG for clean repeatable tiles
      let seed = 19950914;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const fleckColors = ['#8c7d6e', '#a97458', '#686b6e', '#dfd9ce', '#b59457', '#53575b'];
      for (let i = 0; i < 2400; i += 1) {
        ctx.fillStyle = fleckColors[Math.floor(rand() * fleckColors.length)];
        const x = rand() * w;
        const y = rand() * h;
        const rx = 1.2 + rand() * 5.0;
        const ry = 1.0 + rand() * 4.2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rand() * Math.PI);
        ctx.beginPath();
        ctx.moveTo(-rx, -ry * 0.4);
        ctx.lineTo(rx * 0.7, -ry);
        ctx.lineTo(rx, ry * 0.6);
        ctx.lineTo(-rx * 0.5, ry);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Subtle floor tile seams
      ctx.strokeStyle = 'rgba(90, 86, 78, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();
    },
    6,
    7
  );
}

function drawHandwrittenLine(ctx, text, x, y, opts = {}) {
  const {
    font = 'italic 44px "Segoe Print", "Bradley Hand", "Chalkboard SE", Georgia, cursive',
    color = '#f2f3ec',
    chalk = false,
    seedInit = 1337,
    jitterY = 1.8,
    slant = -0.10,
  } = opts;

  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';

  let s = seedInit >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };

  let cx = x;
  let driftY = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;
    if (ch !== ' ') {
      driftY = driftY * 0.65 + rand() * jitterY;
      const rot = slant + rand() * 0.085;
      ctx.save();
      ctx.translate(cx, y + driftY);
      ctx.rotate(rot);
      if (chalk) {
        ctx.globalAlpha = 0.88 + rand() * 0.16;
        ctx.fillText(ch, 0, 0);
        // Subtle second chalk grain pass for dusty hand-drawn texture
        ctx.globalAlpha = 0.28;
        ctx.fillText(ch, 1.4, -0.9);
      } else {
        ctx.globalAlpha = 0.94 + rand() * 0.08;
        ctx.fillText(ch, 0, 0);
      }
      ctx.restore();
    }
    cx += w * (0.97 + rand() * 0.07);
  }
  ctx.restore();
}

function drawWobblyLine(ctx, x1, y1, x2, y2, color, width = 3, seedInit = 77) {
  let s = seedInit >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  const steps = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const j = i < steps ? rand() * 4.5 : 0;
    ctx.lineTo(x1 + (x2 - x1) * t + j * 0.3, y1 + (y2 - y1) * t + j);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRadical(ctx, x, y, width, height, color, lineWidth = 4, seed = 88) {
  // Authentic hand-drawn Italian school square-root sign √ with horizontal overbar
  drawWobblyLine(ctx, x, y - height * 0.35, x + 10, y - height * 0.42, color, lineWidth, seed);
  drawWobblyLine(ctx, x + 10, y - height * 0.42, x + 20, y + 2, color, lineWidth, seed + 1);
  drawWobblyLine(ctx, x + 20, y + 2, x + 36, y - height, color, lineWidth, seed + 2);
  drawWobblyLine(ctx, x + 36, y - height, x + 36 + width, y - height, color, lineWidth, seed + 3);
}

function createBlackboardTexture() {
  return makeCanvasTexture(2048, 1024, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1e3c2f');
    grad.addColorStop(0.5, '#224435');
    grad.addColorStop(1, '#1a3529');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Organic scattered chalk eraser smudges (deterministic PRNG avoids diagonal aliasing)
    let cSeed = 4091994;
    const cRand = () => {
      cSeed = (cSeed * 1664525 + 1013904223) >>> 0;
      return cSeed / 4294967296;
    };
    for (let i = 0; i < 120; i += 1) {
      const x = cRand() * w;
      const y = cRand() * h;
      const rx = 55 + cRand() * 85;
      const ry = 22 + cRand() * 34;
      ctx.fillStyle = `rgba(235, 240, 232, ${(0.010 + cRand() * 0.016).toFixed(4)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (cRand() - 0.5) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const chalkFont = (size, weight = '') =>
      `${weight} italic ${size}px "Segoe Print", "Bradley Hand", "Chalkboard SE", Georgia, cursive`.trim();

    // 1994 Italian 2ª Media (12yo) math lesson: Proporzioni, Frazioni, Teorema di Pitagora
    drawHandwrittenLine(ctx, '25 novembre 1994', 1480, 92, {
      font: chalkFont(40),
      color: 'rgba(242, 243, 236, 0.85)',
      chalk: true,
      seedInit: 99,
      jitterY: 2.0,
    });

    drawHandwrittenLine(ctx, 'Aritmetica: Proporzioni', 95, 134, {
      font: chalkFont(74, 'bold'),
      color: '#f2f3ec',
      chalk: true,
      seedInit: 101,
      jitterY: 3.2,
      slant: -0.05,
    });
    drawWobblyLine(ctx, 92, 158, 1020, 162, 'rgba(242, 243, 236, 0.68)', 4.5, 102);

    drawHandwrittenLine(ctx, '12 : x = 4 : 7', 115, 275, {
      font: chalkFont(68),
      color: '#f2f3ec',
      chalk: true,
      seedInit: 201,
      jitterY: 2.8,
    });
    drawHandwrittenLine(ctx, 'x = (12 × 7) : 4 = 21', 145, 362, {
      font: chalkFont(56),
      color: 'rgba(242, 243, 236, 0.90)',
      chalk: true,
      seedInit: 202,
      jitterY: 2.5,
    });

    // Stacked fractions expression (2ª Media Aritmetica)
    drawHandwrittenLine(ctx, '3', 135, 495, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 301 });
    drawWobblyLine(ctx, 120, 514, 182, 514, '#f6e7a6', 4, 302);
    drawHandwrittenLine(ctx, '4', 135, 574, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 303 });

    drawHandwrittenLine(ctx, '+', 205, 535, { font: chalkFont(56), color: '#f6e7a6', chalk: true, seedInit: 304 });

    drawHandwrittenLine(ctx, '1', 268, 495, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 305 });
    drawWobblyLine(ctx, 254, 514, 316, 514, '#f6e7a6', 4, 306);
    drawHandwrittenLine(ctx, '2', 268, 574, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 307 });

    drawHandwrittenLine(ctx, '×', 340, 535, { font: chalkFont(56), color: '#f6e7a6', chalk: true, seedInit: 308 });

    drawHandwrittenLine(ctx, '2', 404, 495, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 309 });
    drawWobblyLine(ctx, 390, 514, 452, 514, '#f6e7a6', 4, 310);
    drawHandwrittenLine(ctx, '3', 404, 574, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 311 });

    drawHandwrittenLine(ctx, '=', 485, 535, { font: chalkFont(56), color: '#f6e7a6', chalk: true, seedInit: 312 });

    drawHandwrittenLine(ctx, '13', 545, 495, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 313 });
    drawWobblyLine(ctx, 540, 514, 622, 514, '#f6e7a6', 4, 314);
    drawHandwrittenLine(ctx, '12', 545, 574, { font: chalkFont(54), color: '#f6e7a6', chalk: true, seedInit: 315 });

    // Right side: 2ª Media Geometria — Teorema di Pitagora with authentic radical sign
    drawHandwrittenLine(ctx, 'Teorema di Pitagora', 1170, 232, {
      font: chalkFont(60, 'bold'),
      color: '#f2f3ec',
      chalk: true,
      seedInit: 400,
      jitterY: 2.6,
    });
    drawHandwrittenLine(ctx, 'i =', 1175, 336, { font: chalkFont(58), color: '#f2f3ec', chalk: true, seedInit: 401 });
    drawRadical(ctx, 1265, 338, 285, 62, '#f2f3ec', 5, 402);
    drawHandwrittenLine(ctx, 'c₁² + c₂²', 1310, 336, { font: chalkFont(56), color: '#f2f3ec', chalk: true, seedInit: 406 });

    drawWobblyLine(ctx, 1260, 680, 1260, 460, '#f2f3ec', 6, 410);
    drawWobblyLine(ctx, 1260, 460, 1580, 680, '#f2f3ec', 6, 411);
    drawWobblyLine(ctx, 1580, 680, 1260, 680, '#f2f3ec', 6, 412);
    drawWobblyLine(ctx, 1260, 644, 1296, 644, '#f2f3ec', 4, 413);
    drawWobblyLine(ctx, 1296, 644, 1296, 680, '#f2f3ec', 4, 414);

    drawHandwrittenLine(ctx, 'c₁', 1192, 585, { font: chalkFont(48), chalk: true, seedInit: 420 });
    drawHandwrittenLine(ctx, 'c₂', 1408, 738, { font: chalkFont(48), chalk: true, seedInit: 421 });
    drawHandwrittenLine(ctx, 'i', 1445, 545, { font: chalkFont(48), chalk: true, seedInit: 422 });

    // Fine bottom homework line to test distance acuity
    drawHandwrittenLine(ctx, 'Compiti: pag. 84 n. 12, 15, 18', 98, 932, {
      font: chalkFont(44),
      color: 'rgba(242, 243, 236, 0.92)',
      chalk: true,
      seedInit: 501,
      jitterY: 2.2,
    });
  });
}

function createWorkbookTexture() {
  // Workbook pages are 39.0 cm x 27.5 cm -> 1950 x 1375 px = exact 50 px/cm -> 25 px = exact 0.5 cm square!
  return makeCanvasTexture(1950, 1375, (ctx, w, h) => {
    // Matte cream paper so classroom daylight never blows out grid or pencil marks
    ctx.fillStyle = '#e7e3d6';
    ctx.fillRect(0, 0, w, h);

    // Subtle paper fiber grain
    let pSeed = 9182;
    const pRand = () => {
      pSeed = (pSeed * 1664525 + 1013904223) >>> 0;
      return pSeed / 4294967296;
    };
    ctx.fillStyle = 'rgba(120, 110, 94, 0.035)';
    for (let i = 0; i < 1400; i += 1) {
      ctx.fillRect(pRand() * w, pRand() * h, 4, 2);
    }

    // Center spine shadow
    const spine = ctx.createLinearGradient(w * 0.465, 0, w * 0.535, 0);
    spine.addColorStop(0, 'rgba(0,0,0,0)');
    spine.addColorStop(0.5, 'rgba(42,36,28,0.28)');
    spine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spine;
    ctx.fillRect(w * 0.465, 0, w * 0.07, h);

    // Subtle low-vision 0.5 cm x 0.5 cm dark-green guide squares (25 px): guide without overwhelming pencil writing
    const step = 25;
    ctx.strokeStyle = 'rgba(42, 108, 66, 0.34)';
    ctx.lineWidth = 1.25;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Soft green vertical margin guides
    ctx.strokeStyle = 'rgba(34, 92, 54, 0.48)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(150, 0);
    ctx.lineTo(150, h);
    ctx.moveTo(975 + 125, 0);
    ctx.lineTo(975 + 125, h);
    ctx.stroke();

    const pencilFont = (size, weight = '') =>
      `${weight} italic ${size}px "Segoe Script", "Bradley Hand", "Chalkboard SE", Georgia, cursive`.trim();

    // Crisp graphite pencil handwriting (clear 2-square letter height for Near Bifocal legibility)
    const drawPencilText = (txt, x, y, size, seedInit, bold = false) => {
      drawHandwrittenLine(ctx, txt, x, y, {
        font: pencilFont(size, bold ? 'bold' : ''),
        color: '#20242b',
        chalk: true,
        seedInit,
        jitterY: 1.8,
        slant: -0.08,
      });
    };

    // Left page: 1994 2ª Media Aritmetica — Proporzioni & Frazioni
    drawPencilText('25/11/1994', 690, 82, 34, 599);
    drawPencilText('Aritmetica - Proporzioni', 175, 148, 52, 601, true);
    drawWobblyLine(ctx, 175, 162, 740, 164, '#252a32', 3.4, 602);

    const leftLines = [
      ['Es. 1)  12 : x = 4 : 7', 272],
      ['  x = (12 × 7) : 4 = 84 : 4 = 21', 348],
      ['Es. 2)  15 : 5 = x : 4', 472],
      ['  x = (15 × 4) : 5 = 60 : 5 = 12', 548],
      ['Es. 3)  Espressione con frazioni:', 696],
    ];
    leftLines.forEach(([txt, ly], idx) => {
      drawPencilText(txt, 178, ly, 44, 700 + idx * 17);
    });

    // Stacked fractions written by hand in graphite pencil on left page
    drawPencilText('3', 218, 795, 42, 740);
    drawWobblyLine(ctx, 204, 810, 258, 810, '#20242b', 3.2, 741);
    drawPencilText('4', 218, 856, 42, 742);

    drawPencilText('+', 274, 826, 44, 743);

    drawPencilText('1', 326, 795, 42, 744);
    drawWobblyLine(ctx, 312, 810, 366, 810, '#20242b', 3.2, 745);
    drawPencilText('2', 326, 856, 42, 746);

    drawPencilText('×', 382, 826, 44, 747);

    drawPencilText('2', 436, 795, 42, 748);
    drawWobblyLine(ctx, 422, 810, 476, 810, '#20242b', 3.2, 749);
    drawPencilText('3', 436, 856, 42, 750);

    drawPencilText('=', 502, 826, 44, 751);

    drawPencilText('9 + 4', 554, 795, 42, 752);
    drawWobblyLine(ctx, 548, 810, 668, 810, '#20242b', 3.2, 753);
    drawPencilText('12', 584, 856, 42, 754);

    drawPencilText('=', 692, 826, 44, 755);

    drawPencilText('13', 744, 795, 42, 756);
    drawWobblyLine(ctx, 738, 810, 804, 810, '#20242b', 3.2, 757);
    drawPencilText('12', 744, 856, 42, 758);

    // Hand-drawn pencil box around 13/12
    drawWobblyLine(ctx, 728, 754, 816, 754, '#20242b', 2.8, 760);
    drawWobblyLine(ctx, 816, 754, 816, 872, '#20242b', 2.8, 761);
    drawWobblyLine(ctx, 816, 872, 728, 872, '#20242b', 2.8, 762);
    drawWobblyLine(ctx, 728, 872, 728, 754, '#20242b', 2.8, 763);

    // Right page: 1994 2ª Media Geometria — Dati / Richiesta / Svolgimento (Teorema di Pitagora)
    const rx = 975 + 150;
    drawPencilText('Geometria - Pitagora', rx, 148, 50, 801, true);
    drawWobblyLine(ctx, rx, 162, rx + 510, 164, '#252a32', 3.4, 802);

    drawPencilText('Dati:  c₁ = 6 cm,  c₂ = 8 cm', rx, 248, 42, 900);
    drawPencilText('Richiesta:  i = ?   2p = ?   A = ?', rx, 322, 40, 901);
    drawPencilText('Svolgimento:', rx, 422, 42, 902, true);

    // Real hand-drawn radical signs: i = √(6² + 8²) = √100 = 10 cm
    drawPencilText('i =', rx, 518, 44, 903);
    drawRadical(ctx, rx + 72, 520, 210, 48, '#20242b', 3.5, 904);
    drawPencilText('6² + 8²', rx + 114, 518, 42, 908);
    drawPencilText('=', rx + 332, 518, 44, 909);
    drawRadical(ctx, rx + 372, 520, 128, 48, '#20242b', 3.5, 910);
    drawPencilText('100', rx + 414, 518, 42, 914);
    drawPencilText('= 10 cm', rx + 542, 518, 42, 915);

    drawPencilText('2p = 6 + 8 + 10 = 24 cm', rx, 616, 42, 916);
    drawPencilText('A = (6 × 8) : 2 = 24 cm²', rx, 692, 42, 917);

    // Hand-drawn graphite triangle + pencil shading hatch marks
    drawWobblyLine(ctx, rx + 85, 1100, rx + 85, 800, '#20242b', 4.5, 950);
    drawWobblyLine(ctx, rx + 85, 800, rx + 485, 1100, '#20242b', 4.5, 951);
    drawWobblyLine(ctx, rx + 485, 1100, rx + 85, 1100, '#20242b', 4.5, 952);
    drawWobblyLine(ctx, rx + 85, 1050, rx + 135, 1050, '#20242b', 3.0, 953);
    drawWobblyLine(ctx, rx + 135, 1050, rx + 135, 1100, '#20242b', 3.0, 954);
    for (let hIdx = 0; hIdx < 6; hIdx += 1) {
      const hx = rx + 105 + hIdx * 42;
      drawWobblyLine(ctx, hx, 1094, hx + 25, 1066, 'rgba(36, 40, 48, 0.30)', 2.0, 955 + hIdx);
    }
    drawPencilText('c₁ = 6', rx - 22, 960, 34, 960);
    drawPencilText('c₂ = 8', rx + 220, 1152, 34, 961);
    drawPencilText('i = 10', rx + 295, 915, 34, 962);

    drawPencilText('Compiti: pag. 84 n. 12, 15, 18', rx, 1265, 34, 980);

    // Small pencil page numbers
    drawPencilText('14', 60, h - 28, 30, 990);
    drawPencilText('15', w - 95, h - 28, 30, 991);
  });
}

function createClockTexture() {
  return makeCanvasTexture(512, 512, (ctx, w, h) => {
    const c = w / 2;
    ctx.fillStyle = '#f3efe4';
    ctx.beginPath();
    ctx.arc(c, c, 240, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#333330';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(c, c, 232, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px Georgia, serif';
    for (let i = 1; i <= 12; i += 1) {
      const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(ang) * 182;
      const y = c + Math.sin(ang) * 182;
      ctx.fillText(String(i), x, y);
    }
    for (let m = 0; m < 60; m += 1) {
      const ang = (m / 60) * Math.PI * 2;
      const r1 = m % 5 === 0 ? 210 : 216;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = m % 5 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
      ctx.lineTo(c + Math.cos(ang) * 224, c + Math.sin(ang) * 224);
      ctx.stroke();
    }
  });
}

function createItalyMapTexture() {
  return makeCanvasTexture(512, 680, (ctx, w, h) => {
    ctx.fillStyle = '#ebe3c7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6c5a42';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // Sea
    ctx.fillStyle = '#b9d4e2';
    ctx.fillRect(28, 86, w - 56, h - 114);

    // Title
    ctx.fillStyle = '#3a3024';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('ITALIA FISICA', w / 2, 56);

    // Stylized peninsula silhouette
    ctx.fillStyle = '#c5b77b';
    ctx.strokeStyle = '#756844';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 140);
    ctx.lineTo(270, 130);
    ctx.lineTo(295, 195);
    ctx.lineTo(260, 240);
    ctx.lineTo(350, 390);
    ctx.lineTo(410, 445);
    ctx.lineTo(382, 470);
    ctx.lineTo(355, 455);
    ctx.lineTo(368, 520);
    ctx.lineTo(335, 535);
    ctx.lineTo(315, 455);
    ctx.lineTo(225, 340);
    ctx.lineTo(185, 260);
    ctx.lineTo(130, 230);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sicily & Sardinia
    ctx.beginPath();
    ctx.moveTo(260, 545);
    ctx.lineTo(320, 548);
    ctx.lineTo(302, 598);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(108, 415, 52, 108, 12);
    ctx.fill();
    ctx.stroke();
  });
}

function createCorkboardTexture() {
  return makeCanvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#b58452';
    ctx.fillRect(0, 0, w, h);
    let seed = 4412;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(90,56,28,0.22)' : 'rgba(220,180,130,0.2)';
      ctx.fillRect(rand() * w, rand() * h, 3, 2);
    }

    // Pinned paper notices
    const sheets = [
      { x: 36, y: 34, pw: 130, ph: 170, col: '#f7f4e9' },
      { x: 192, y: 28, pw: 145, ph: 120, col: '#f7e9a3' },
      { x: 360, y: 42, pw: 118, ph: 165, col: '#e7f0f5' },
      { x: 196, y: 168, pw: 135, ph: 112, col: '#f7f4e9' },
    ];
    for (const s of sheets) {
      ctx.fillStyle = s.col;
      ctx.fillRect(s.x, s.y, s.pw, s.ph);
      ctx.fillStyle = '#4e5460';
      for (let ly = s.y + 22; ly < s.y + s.ph - 16; ly += 16) {
        ctx.fillRect(s.x + 14, ly, s.pw - 28, 3);
      }
      ctx.fillStyle = '#c83434';
      ctx.beginPath();
      ctx.arc(s.x + s.pw / 2, s.y + 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function buildDeskRowGroup(seats, frameMat, sharedMats, sharedGeos) {
  const group = new THREE.Group();
  const seatWidth = 0.66;
  const totalWidth = seats * seatWidth;
  const { topMat, woodEdgeMat, plyMat } = sharedMats;
  const { legGeo, seatGeo, backGeo, cLegGeo, uprightGeo } = sharedGeos;

  // Desktop: seats * 0.66m wide, 0.54m deep, top surface at Y = 0.73m
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, 0.025, 0.54), topMat);
  deskTop.position.set(0, 0.7175, 0);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  group.add(deskTop);

  // Under-desk book shelf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(totalWidth - 0.08, 0.015, 0.36), woodEdgeMat);
  shelf.position.set(0, 0.58, -0.02);
  group.add(shelf);

  // Tubular metal desk legs (no shadow casting on thin tubes for high FPS)
  const legXs = [];
  for (let i = 0; i <= seats; i += 1) {
    const rawX = -totalWidth / 2 + i * seatWidth;
    const inset = i === 0 ? 0.04 : i === seats ? -0.04 : 0;
    legXs.push(rawX + inset);
  }
  for (const lx of legXs) {
    for (const lz of [-0.23, 0.23]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, 0.355, lz);
      group.add(leg);
    }
  }

  // Plywood + tubular steel chairs behind desk (at +Z facing -Z)
  for (let s = 0; s < seats; s += 1) {
    const cx = -totalWidth / 2 + (s + 0.5) * seatWidth;
    const chair = new THREE.Group();
    chair.position.set(cx, 0, 0.42);

    const seat = new THREE.Mesh(seatGeo, plyMat);
    seat.position.set(0, 0.44, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    chair.add(seat);

    const back = new THREE.Mesh(backGeo, plyMat);
    back.position.set(0, 0.72, 0.175);
    back.rotation.x = 0.08;
    back.castShadow = true;
    chair.add(back);

    for (const [xOff, zOff] of [
      [-0.17, -0.16],
      [0.17, -0.16],
      [-0.17, 0.16],
      [0.17, 0.16],
    ]) {
      const cl = new THREE.Mesh(cLegGeo, frameMat);
      cl.position.set(xOff, 0.22, zOff);
      chair.add(cl);
    }

    for (const xOff of [-0.15, 0.15]) {
      const up = new THREE.Mesh(uprightGeo, frameMat);
      up.position.set(xOff, 0.62, 0.17);
      chair.add(up);
    }

    group.add(chair);
  }

  return group;
}

/**
 * Build procedural mid-1990s Italian middle-school classroom scene.
 */
export function createClassroomScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c7ddf0');

  // Bright natural Italian classroom daylight + warm fill (matte desktops & cream paper prevent clipping)
  const hemiLight = new THREE.HemisphereLight('#f5f7fc', '#ad926f', 0.86);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#fff8eb', 1.72);
  sunLight.position.set(-7.5, 4.4, -1.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 18;
  sunLight.shadow.camera.left = -5.5;
  sunLight.shadow.camera.right = 5.5;
  sunLight.shadow.camera.top = 5.5;
  sunLight.shadow.camera.bottom = -5.5;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const ceilingFill = new THREE.PointLight('#f2f6ff', 10.5, 16, 1.4);
  ceilingFill.position.set(0, 3.0, -0.5);
  scene.add(ceilingFill);

  const colliders = [];
  const focusTargets = [];

  const addFocusMesh = (mesh) => {
    focusTargets.push(mesh);
    return mesh;
  };

  // Room dimensions: X [-3.8..+3.8] (7.6m), Z [-4.15..+4.2] (~8.4m), Y [0..3.2]
  const floorTex = createTerrazzoTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 8.4),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.025);
  floor.receiveShadow = true;
  scene.add(addFocusMesh(floor));

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 8.4),
    new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.9 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.2, 0.025);
  scene.add(ceiling);

  // Wall materials: ochre/mustard lower (#d49234, h=1.25m), off-white upper (#eceae4)
  const lowerWallMat = new THREE.MeshStandardMaterial({ color: '#d49234', roughness: 0.85 });
  const upperWallMat = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#9c6e2c', roughness: 0.7 });

  function addSolidWall(width, cx, cy, cz, rotY) {
    const low = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.25), lowerWallMat);
    low.position.set(cx, 0.625, cz);
    low.rotation.y = rotY;
    low.receiveShadow = true;

    const up = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.95), upperWallMat);
    up.position.set(cx, 1.25 + 0.975, cz);
    up.rotation.y = rotY;
    up.receiveShadow = true;

    const dado = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.03), trimMat);
    dado.position.set(cx, 1.25, cz);
    dado.rotation.y = rotY;

    scene.add(addFocusMesh(low), addFocusMesh(up), dado);
  }

  // Front wall (Z = -4.15), Back wall (Z = +4.2), Right wall (X = +3.8)
  addSolidWall(7.6, 0, 0, -4.15, 0);
  addSolidWall(7.6, 0, 0, 4.2, Math.PI);
  addSolidWall(8.4, 3.8, 0, 0.025, -Math.PI / 2);

  // Left wall (X = -3.8) with 3 tall aluminum windows + bright sky & venetian blinds
  const leftLow = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.05), lowerWallMat);
  leftLow.position.set(-3.8, 0.525, 0.025);
  leftLow.rotation.y = Math.PI / 2;
  leftLow.receiveShadow = true;
  scene.add(addFocusMesh(leftLow));

  const leftTop = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 0.35), upperWallMat);
  leftTop.position.set(-3.8, 3.025, 0.025);
  leftTop.rotation.y = Math.PI / 2;
  scene.add(addFocusMesh(leftTop));

  const pillarZ = [-3.6, -1.25, 1.25, 3.65];
  const pillarWidths = [1.1, 0.85, 0.85, 1.1];
  for (let i = 0; i < pillarZ.length; i += 1) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, pillarWidths[i]), upperWallMat);
    pil.position.set(-3.8, 1.95, pillarZ[i]);
    scene.add(addFocusMesh(pil));
  }

  // Exterior daylight sky backdrop outside left windows (NOT in focusTargets so raycast hits blinds/room)
  const skyPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    new THREE.MeshBasicMaterial({ color: '#eef7ff' })
  );
  skyPlane.position.set(-5.6, 2.2, 0);
  skyPlane.rotation.y = Math.PI / 2;
  scene.add(skyPlane);

  // 3 aluminum windows with venetian blinds
  const aluMat = new THREE.MeshStandardMaterial({ color: '#b5bcc4', metalness: 0.55, roughness: 0.35 });
  const blindMat = new THREE.MeshStandardMaterial({ color: '#ded9cc', roughness: 0.65 });
  const winCentersZ = [-2.42, 0.0, 2.45];
  for (const wz of winCentersZ) {
    const wWidth = 1.5;
    const frameGroup = new THREE.Group();
    frameGroup.position.set(-3.8, 1.95, wz);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, wWidth + 0.14), aluMat);
    sill.position.set(0.05, -0.9, 0);
    frameGroup.add(sill);

    for (const zOff of [-wWidth / 2, 0, wWidth / 2]) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.045), aluMat);
      mullion.position.set(0, 0, zOff);
      frameGroup.add(mullion);
    }

    // Venetian blind slats (high-contrast bright/dark horizontal pattern)
    for (let sy = 0.2; sy <= 0.84; sy += 0.065) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, wWidth - 0.08), blindMat);
      slat.position.set(0.06, sy, 0);
      slat.rotation.z = 0.25;
      frameGroup.add(addFocusMesh(slat));
    }

    // Cast-iron wall radiator under window
    const rad = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.62, 1.15),
      new THREE.MeshStandardMaterial({ color: '#dad6cb', roughness: 0.55, metalness: 0.2 })
    );
    rad.position.set(0.14, -1.42, 0);
    frameGroup.add(addFocusMesh(rad));
    scene.add(frameGroup);
  }

  // Twin-tube 1990s fluorescent ceiling fixtures
  const lampTubeMat = new THREE.MeshBasicMaterial({ color: '#fbfdff' });
  const lampBodyMat = new THREE.MeshStandardMaterial({ color: '#d8dad7', roughness: 0.5 });
  for (const lx of [-1.75, 1.75]) {
    for (const lz of [-2.0, 0.35, 2.5]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 1.25), lampBodyMat);
      body.position.set(lx, 3.16, lz);
      const tubes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 1.18), lampTubeMat);
      tubes.position.set(lx, 3.12, lz);
      scene.add(body, tubes);
    }
  }

  // Front wall: Slate Blackboard (lavagna)
  const boardTex = createBlackboardTexture();
  const boardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.4, 0.04),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.88 })
  );
  boardMesh.position.set(0.0, 1.72, -4.11);
  boardMesh.receiveShadow = true;
  scene.add(addFocusMesh(boardMesh));

  const woodFrameMat = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.72 });
  const boardFrameTop = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.06, 0.07), woodFrameMat);
  boardFrameTop.position.set(0, 2.45, -4.1);
  const boardTray = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.05, 0.14), woodFrameMat);
  boardTray.position.set(0, 0.99, -4.06);
  const boardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.46, 0.07), woodFrameMat);
  boardLeft.position.set(-1.63, 1.72, -4.1);
  const boardRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.46, 0.07), woodFrameMat);
  boardRight.position.set(1.63, 1.72, -4.1);
  scene.add(boardFrameTop, boardTray, boardLeft, boardRight);

  // Chalk sticks + felt eraser (cancellino) on blackboard tray
  const chalkMat = new THREE.MeshStandardMaterial({ color: '#f5f5ef', roughness: 0.9 });
  for (let c = 0; c < 3; c += 1) {
    const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 8), chalkMat);
    chalk.rotation.z = Math.PI / 2;
    chalk.position.set(-0.7 + c * 0.12, 1.022, -4.03);
    scene.add(chalk);
  }
  const cancellino = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.04, 0.055),
    new THREE.MeshStandardMaterial({ color: '#454340', roughness: 0.95 })
  );
  cancellino.position.set(0.65, 1.035, -4.03);
  scene.add(cancellino);

  // Corkboard on front-left wall
  const corkBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.76, 0.03),
    new THREE.MeshStandardMaterial({ map: createCorkboardTexture(), roughness: 0.88 })
  );
  corkBoard.position.set(-2.55, 1.78, -4.12);
  scene.add(addFocusMesh(corkBoard));

  // Analog wall clock above front-right
  const clockGroup = new THREE.Group();
  clockGroup.position.set(2.0, 2.68, -4.11);
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.035, 24),
    new THREE.MeshStandardMaterial({ map: createClockTexture(), roughness: 0.5 })
  );
  clockFace.rotation.x = Math.PI / 2;
  clockGroup.add(addFocusMesh(clockFace));

  const hourHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.09, 0.01),
    new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
  );
  hourHand.position.set(0, 0.035, 0.022);
  const minHandPivot = new THREE.Group();
  minHandPivot.position.set(0, 0, 0.025);
  const minHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.14, 0.008),
    new THREE.MeshBasicMaterial({ color: '#1b1b1b' })
  );
  minHand.position.set(0, 0.055, 0);
  minHandPivot.add(minHand);
  clockGroup.add(hourHand, minHandPivot);
  scene.add(clockGroup);

  // Classroom door on right wall near front-right corner (as per reference photo)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(3.77, 1.05, -3.10);
  doorGroup.rotation.y = -Math.PI / 2;
  const yellowTrimMat = new THREE.MeshStandardMaterial({ color: '#d8a62a', roughness: 0.55 });
  const doorWoodMat = new THREE.MeshStandardMaterial({ color: '#8f6038', roughness: 0.68 });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.14, 0.06), yellowTrimMat);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.04, 0.05), doorWoodMat);
  doorLeaf.position.set(0, -0.02, 0.015);
  const portholeRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 10, 24), yellowTrimMat);
  portholeRing.position.set(0, 0.48, 0.045);
  const portholeGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 20),
    new THREE.MeshStandardMaterial({ color: '#cfdbe2', roughness: 0.25, metalness: 0.1 })
  );
  portholeGlass.position.set(0, 0.48, 0.043);
  const doorHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.025, 0.06),
    new THREE.MeshStandardMaterial({ color: '#c8a852', metalness: 0.7, roughness: 0.3 })
  );
  doorHandle.position.set(-0.34, -0.04, 0.055);
  doorGroup.add(doorFrame, addFocusMesh(doorLeaf), portholeRing, portholeGlass, doorHandle);
  scene.add(doorGroup);

  // Italy physical wall map & wooden cabinet on right wall (clear of door)
  const italyMap = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 1.15, 0.88),
    new THREE.MeshStandardMaterial({ map: createItalyMapTexture(), roughness: 0.8 })
  );
  italyMap.position.set(3.77, 1.88, -1.05);
  scene.add(addFocusMesh(italyMap));

  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 1.75, 1.3),
    new THREE.MeshStandardMaterial({ color: '#9c7852', roughness: 0.75 })
  );
  cabinet.position.set(3.54, 0.875, 1.25);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  scene.add(addFocusMesh(cabinet));
  colliders.push({ minX: 3.28, maxX: 3.8, minZ: 0.58, maxZ: 1.92 });

  // Teacher's desk (cattedra) + register + chair + teacher
  const cattedraGroup = new THREE.Group();
  cattedraGroup.position.set(0.85, 0, -2.95);
  const cattedraTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.38, 0.04, 0.72),
    new THREE.MeshStandardMaterial({ color: '#c49d6a', roughness: 0.65 })
  );
  cattedraTop.position.set(0, 0.76, 0);
  cattedraTop.castShadow = true;
  cattedraTop.receiveShadow = true;
  const cattedraFront = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.52, 0.03),
    new THREE.MeshStandardMaterial({ color: '#ab8455', roughness: 0.7 })
  );
  cattedraFront.position.set(0, 0.47, 0.32);
  const cattedraPedestal = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.74, 0.64),
    new THREE.MeshStandardMaterial({ color: '#997348', roughness: 0.72 })
  );
  cattedraPedestal.position.set(0.44, 0.37, 0);
  cattedraPedestal.castShadow = true;

  // Left-side support legs & stretcher so the cattedra stands solidly on both sides
  const cattedraLegMat = new THREE.MeshStandardMaterial({ color: '#5c4b3c', roughness: 0.55, metalness: 0.25 });
  const cattedraLegGeo = new THREE.BoxGeometry(0.045, 0.74, 0.045);
  const cLegFront = new THREE.Mesh(cattedraLegGeo, cattedraLegMat);
  cLegFront.position.set(-0.63, 0.37, 0.30);
  cLegFront.castShadow = true;
  const cLegBack = new THREE.Mesh(cattedraLegGeo, cattedraLegMat);
  cLegBack.position.set(-0.63, 0.37, -0.30);
  cLegBack.castShadow = true;
  const cLeftRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.60), cattedraLegMat);
  cLeftRail.position.set(-0.63, 0.18, 0);

  cattedraGroup.add(
    addFocusMesh(cattedraTop),
    cattedraFront,
    cattedraPedestal,
    cLegFront,
    cLegBack,
    cLeftRail
  );
  scene.add(cattedraGroup);
  colliders.push({ minX: 0.14, maxX: 1.56, minZ: -3.55, maxZ: -2.56 });

  // Standing teacher near blackboard, angled toward class (+Z) while gesturing
  const teacher = createStylizedPerson('#3e6259', '#323842', '#4c382c', false, { scale: 1.08 });
  teacher.group.position.set(-0.05, 0, -3.05);
  teacher.group.rotation.y = Math.PI - 0.28;
  scene.add(addFocusMesh(teacher.group));
  colliders.push({ minX: -0.35, maxX: 0.25, minZ: -3.35, maxZ: -2.75 });

  // 4 rows deep: left column 4x2 (window side, Vuarbit sits row 1), right column 4x3 (shared materials/geometries for FPS)
  const rowsZ = [-1.45, -0.05, 1.35, 2.75];
  const deskColumns = [
    { x: -2.25, seats: 2 },
    { x: 1.45, seats: 3 },
  ];
  const frameMats = [
    new THREE.MeshStandardMaterial({ color: '#b43c3c', roughness: 0.48, metalness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: '#356099', roughness: 0.48, metalness: 0.35 }),
  ];
  const sharedDeskMats = {
    topMat: new THREE.MeshStandardMaterial({ color: '#cbc8be', roughness: 0.86 }),
    woodEdgeMat: new THREE.MeshStandardMaterial({ color: '#9e784c', roughness: 0.7 }),
    plyMat: new THREE.MeshStandardMaterial({ color: '#cfa86e', roughness: 0.62 }),
  };
  const sharedDeskGeos = {
    legGeo: new THREE.CylinderGeometry(0.014, 0.014, 0.71, 6),
    seatGeo: new THREE.BoxGeometry(0.38, 0.018, 0.37),
    backGeo: new THREE.BoxGeometry(0.38, 0.19, 0.016),
    cLegGeo: new THREE.CylinderGeometry(0.011, 0.011, 0.44, 6),
    uprightGeo: new THREE.CylinderGeometry(0.011, 0.011, 0.36, 6),
  };

  for (let r = 0; r < rowsZ.length; r += 1) {
    for (let c = 0; c < deskColumns.length; c += 1) {
      const colSpec = deskColumns[c];
      const rowGroup = buildDeskRowGroup(colSpec.seats, frameMats[(r + c) % 2], sharedDeskMats, sharedDeskGeos);
      rowGroup.position.set(colSpec.x, 0, rowsZ[r]);
      scene.add(addFocusMesh(rowGroup));
      const halfW = (colSpec.seats * 0.66) / 2 + 0.02;
      colliders.push({
        minX: colSpec.x - halfW,
        maxX: colSpec.x + halfW,
        minZ: rowsZ[r] - 0.30,
        maxZ: rowsZ[r] + 0.64,
      });
    }
  }

  // Populate 15 seated classmates, varied desk items, and 6 tucked backpacks across 4x2 + 4x3 grid
  const { updateClassmates } = populateClassmates({
    scene,
    addFocusMesh,
    rowsZ,
    deskColumns,
    makeCanvasTexture,
  });

  // Vuarbit's desk (RIGHT half of Row 1 Left 4x2 column: X = -2.25 + 0.33 = -1.92)
  const deskPos = new THREE.Vector3(-1.92, 0.73, -1.37);
  const seatPose = {
    position: new THREE.Vector3(-1.92, 1.06, -1.05),
    yaw: 0.0,
    pitch: 0.02,
  };
  const standPose = {
    position: new THREE.Vector3(-0.78, 1.40, -0.45),
    yaw: 0.14,
    pitch: 0.0,
  };

  // Fixed open Italian 0.5cm dark-green quadretti math workbook on Vuarbit's desk
  const workbookGroup = new THREE.Group();
  workbookGroup.position.set(-1.92, 0.734, -1.30);
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.41, 0.006, 0.29),
    new THREE.MeshStandardMaterial({ color: '#b43232', roughness: 0.72 })
  );
  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(0.39, 0.008, 0.275),
    new THREE.MeshStandardMaterial({ map: createWorkbookTexture(), roughness: 0.94 })
  );
  pages.position.set(0, 0.004, 0);
  workbookGroup.add(cover, addFocusMesh(pages));
  scene.add(workbookGroup);

  // Upgraded pickable pencil, eraser, pencil case, 15 cm ruler, and sharpener on Vuarbit's desk
  const { pickables } = createUpgradedPickables({
    scene,
    addFocusMesh,
    makeCanvasTexture,
  });

  // Classroom props (open backpack, school bell, coat rack, teacher chair, cattedra props, wall charts, wastebasket, cabinet details)
  const { updateProps } = populateClassroomProps({
    scene,
    addFocusMesh,
    colliders,
    makeCanvasTexture,
  });

  // Invisible first-person player shadow caster aligned to camera
  const playerShadow = createPlayerShadowCaster(scene);

  // Reusable scratch objects for zero-GC update loop
  let simTime = 0;
  let heldLiftY = 0;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const windowLightDir = new THREE.Vector3(-1, 0.25, 0).normalize();
  const eyeOD = new THREE.Vector3();
  const eyeOS = new THREE.Vector3();
  const localEyeOD = new THREE.Vector3(0.029, 0, 0);
  const localEyeOS = new THREE.Vector3(-0.029, 0, 0);
  const localHeld = new THREE.Vector3();
  const heldWorldPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const heldBox = new THREE.Box3();
  const heldTiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.45, -0.55));
  const heldRotEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const heldRotQuat = new THREE.Quaternion();
  const deskBounds = { minX: -2.91, maxX: -1.59, y: 0.73, minZ: -1.72, maxZ: -1.18 };

  function updateScene(dt, state, camera) {
    simTime += Math.min(dt || 0, 0.1);

    // Animate standing teacher (facing class, gesturing toward blackboard/pupils)
    teacher.torso.scale.y = 1 + Math.sin(simTime * 2.1) * 0.015;
    teacher.headPivot.rotation.y = Math.sin(simTime * 0.7) * 0.24;
    teacher.rightArm.rotation.x = 0.78 + Math.sin(simTime * 2.4) * 0.24;
    teacher.rightArm.rotation.z = 0.22 + Math.cos(simTime * 1.6) * 0.12;
    teacher.leftArm.rotation.x = 0.22 + Math.sin(simTime * 1.1) * 0.08;

    updateClassmates(simTime);
    updateProps(simTime);

    // Subtle analog clock minute hand drift
    minHandPivot.rotation.z = -simTime * 0.02;

    if (!camera) return;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);
    playerShadow.update(state, camera);

    // Gaze-dependent light reaching closed eyelids (bright toward sunny left windows & ceiling lights)
    const winAlign = Math.max(0, forward.dot(windowLightDir));
    const ceilAlign = Math.max(0, forward.y);
    state.eyelidLight = Math.min(1, Math.max(0.08, 0.12 + winAlign * 0.78 + ceilAlign * 0.32));

    // Move held pickable into camera-relative space; apply transient lift on desk collision so it returns smoothly when clear
    let heldEntry = null;
    if (state.holding) {
      heldEntry = pickables.find((p) => p.id === state.holding) || null;
      if (heldEntry) {
        const off = state.heldOffset;
        localHeld.set(off.x, off.y, -off.z);
        heldWorldPos.copy(localHeld).applyMatrix4(camera.matrixWorld);
        heldEntry.mesh.position.copy(heldWorldPos);
        heldRotEuler.set(state.heldRot?.pitch || 0, state.heldRot?.yaw || 0, 0, 'YXZ');
        heldRotQuat.setFromEuler(heldRotEuler);
        heldEntry.mesh.quaternion.copy(camera.quaternion).multiply(heldRotQuat).multiply(heldTiltQuat);
        heldEntry.mesh.updateMatrixWorld(true);

        heldBox.setFromObject(heldEntry.mesh);
        const overDesk =
          heldBox.max.x >= deskBounds.minX &&
          heldBox.min.x <= deskBounds.maxX &&
          heldBox.max.z >= deskBounds.minZ &&
          heldBox.min.z <= deskBounds.maxZ;
        const minSurfaceY = deskBounds.y + 0.014; // clears y=0.73 desk and y=0.742 open workbook
        const reqLift = overDesk && heldBox.min.y < minSurfaceY ? minSurfaceY - heldBox.min.y : 0;
        if (reqLift >= heldLiftY) {
          heldLiftY = reqLift;
        } else {
          heldLiftY += (reqLift - heldLiftY) * (1 - Math.exp(-12 * Math.min(dt || 0, 0.1)));
          if (Math.abs(heldLiftY - reqLift) < 1e-4) heldLiftY = reqLift;
        }
        if (heldLiftY > 0) {
          heldWorldPos.y += heldLiftY;
          heldEntry.mesh.position.copy(heldWorldPos);
          heldEntry.mesh.updateMatrixWorld(true);
        }
      }
    } else {
      heldLiftY = 0;
    }

    // Eye world positions: OD (+0.029m right), OS (-0.029m left)
    eyeOD.copy(localEyeOD).applyMatrix4(camera.matrixWorld);
    eyeOS.copy(localEyeOS).applyMatrix4(camera.matrixWorld);

    let occlOD = 0;
    let occlOS = 0;

    // 1. Held object monocular occlusion: check per-eye proximity along each eye's sightline
    //    (OD accepts lower-right-lens sightline up to 5.5cm while rejecting bilateral center overlap)
    if (heldEntry) {
      const r = heldEntry.occluderRadius;
      const evalHeldOccl = (eyePos, maxLat) => {
        toTarget.copy(heldWorldPos).sub(eyePos);
        const depthAlongRay = toTarget.dot(forward);
        if (depthAlongRay <= 0.01) return 0;
        const distSq = toTarget.lengthSq();
        const lateralDist = Math.sqrt(Math.max(0, distSq - depthAlongRay * depthAlongRay));
        if (lateralDist > maxLat) return 0;
        return computeOcclusionFromDistance(Math.max(0.01, Math.sqrt(distSq) - r));
      };
      occlOD = Math.max(occlOD, evalHeldOccl(eyeOD, 0.055));
      occlOS = Math.max(occlOS, evalHeldOccl(eyeOS, 0.038));
    }

    // 2. Per-eye surface occlusion (desk edge, workbook, props, walls, classmate) via short per-eye rays
    //    Excludes currently held item (handled by evalHeldOccl) and skips when eyelids closed or in Normal Compare
    if (state.eyelidClose <= 0.8 && !state.compareNormal) {
      const envTargets = heldEntry ? focusTargets.filter((obj) => obj !== heldEntry.mesh) : focusTargets;
      const evalEyeRayOccl = (eyePos) => {
        raycaster.set(eyePos, forward);
        raycaster.near = 0.01;
        raycaster.far = 0.25;
        const eyeHits = raycaster.intersectObjects(envTargets, true);
        if (eyeHits.length > 0) {
          return computeOcclusionFromDistance(eyeHits[0].distance);
        }
        return 0;
      };
      occlOD = Math.max(occlOD, evalEyeRayOccl(eyeOD));
      occlOS = Math.max(occlOS, evalEyeRayOccl(eyeOS));
    }

    state.occlOD = occlOD;
    state.occlOS = occlOS;

    // 3. Focus distance telemetry (use held item only when within near inspection cone; otherwise center raycast)
    if (state.eyelidClose > 0.8) {
      state.focusDistM = 0;
      return;
    }
    if (
      heldEntry &&
      state.heldOffset.z <= 0.45 &&
      Math.abs(state.heldOffset.x - 0.029) < 0.16 &&
      state.heldOffset.y < 0.06
    ) {
      state.focusDistM = Math.min(20.0, Math.max(0.04, eyeOD.distanceTo(heldWorldPos)));
      return;
    }
    raycaster.set(camera.position, forward);
    raycaster.near = 0.02;
    raycaster.far = 20.0;
    const hits = raycaster.intersectObjects(focusTargets, true);
    if (hits.length > 0) {
      state.focusDistM = Math.min(20.0, Math.max(0.04, hits[0].distance));
    } else {
      state.focusDistM = 3.8;
    }
  }

  return {
    scene,
    deskPos,
    seatPose,
    standPose,
    pickables,
    colliders,
    updateScene,
  };
}
