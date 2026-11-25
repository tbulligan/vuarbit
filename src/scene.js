import * as THREE from 'three';
import { computeOcclusionFromDistance } from './state.js';

// shortcut: procedural low-poly geometry + canvas textures only (16 extra classmates deferred to TODO.md), upgrade if external glTF assets are ever added

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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

function createBlackboardTexture() {
  return makeCanvasTexture(2048, 1024, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1e3c2f');
    grad.addColorStop(0.5, '#224435');
    grad.addColorStop(1, '#1a3529');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle chalk dust smudge
    for (let i = 0; i < 160; i += 1) {
      const x = ((i * 193) % w);
      const y = ((i * 97) % h);
      ctx.fillStyle = 'rgba(235, 240, 232, 0.025)';
      ctx.beginPath();
      ctx.ellipse(x, y, 90, 32, (i % 5) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#f2f3ec';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 74px Georgia, serif';
    ctx.fillText('EQUAZIONI DI 1° GRADO', 90, 74);

    ctx.strokeStyle = 'rgba(242, 243, 236, 0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(90, 166);
    ctx.lineTo(1060, 166);
    ctx.stroke();

    ctx.font = '68px "Courier New", monospace';
    ctx.fillText('2x + 5 = 13', 110, 230);
    ctx.fillStyle = 'rgba(242, 243, 236, 0.85)';
    ctx.font = '56px "Courier New", monospace';
    ctx.fillText('2x = 13 - 5   =>   x = 4', 150, 320);

    ctx.fillStyle = '#f6e7a6';
    ctx.font = '66px "Courier New", monospace';
    ctx.fillText('(3/4)x - 2 = 7', 110, 445);
    ctx.fillStyle = 'rgba(246, 231, 166, 0.85)';
    ctx.font = '54px "Courier New", monospace';
    ctx.fillText('(3/4)x = 9   =>   x = 12', 150, 535);

    // Right side geometry & Pythagoras
    ctx.fillStyle = '#f2f3ec';
    ctx.font = '68px Georgia, serif';
    ctx.fillText('a² + b² = c²', 1240, 260);

    ctx.strokeStyle = '#f2f3ec';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(1290, 610);
    ctx.lineTo(1290, 410);
    ctx.lineTo(1590, 610);
    ctx.closePath();
    ctx.stroke();

    // Right angle mark
    ctx.lineWidth = 4;
    ctx.strokeRect(1290, 578, 32, 32);

    ctx.font = '44px Georgia, serif';
    ctx.fillText('a', 1245, 495);
    ctx.fillText('b', 1435, 628);
    ctx.fillText('c', 1455, 470);

    // Fine bottom homework line to test acuity & bifocal vs distance clarity
    ctx.fillStyle = 'rgba(242, 243, 236, 0.92)';
    ctx.font = '42px Georgia, serif';
    ctx.fillText('Compiti: pag. 84 n. 12, 15, 18', 95, 895);
  });
}

function createWorkbookTexture() {
  return makeCanvasTexture(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#f8f6ee';
    ctx.fillRect(0, 0, w, h);

    // Center spine shadow
    const spine = ctx.createLinearGradient(w * 0.47, 0, w * 0.53, 0);
    spine.addColorStop(0, 'rgba(0,0,0,0)');
    spine.addColorStop(0.5, 'rgba(55,48,38,0.22)');
    spine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spine;
    ctx.fillRect(w * 0.47, 0, w * 0.06, h);

    // 5mm quadretti grid
    const step = 28;
    ctx.strokeStyle = 'rgba(110, 165, 215, 0.42)';
    ctx.lineWidth = 1.5;
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

    // Red vertical margin lines on both pages
    ctx.strokeStyle = 'rgba(205, 72, 72, 0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(160, 0);
    ctx.lineTo(160, h);
    ctx.moveTo(w * 0.5 + 150, 0);
    ctx.lineTo(w * 0.5 + 150, h);
    ctx.stroke();

    // Left page crisp blue-pen notes
    ctx.fillStyle = '#1f3f88';
    ctx.font = 'italic 36px Georgia, serif';
    ctx.fillText('Matematica - Equazioni', 200, 96);
    ctx.fillStyle = '#243a6e';
    ctx.font = '34px "Courier New", monospace';
    ctx.fillText('1) 2x + 5 = 13', 200, 195);
    ctx.fillText('   2x = 13 - 5 = 8', 200, 251);
    ctx.fillText('   x = 8 / 2 = 4', 200, 307);

    ctx.fillText('2) (3/4)x - 2 = 7', 200, 419);
    ctx.fillText('   3x - 8 = 28', 200, 475);
    ctx.fillText('   3x = 36  =>  x = 12', 200, 531);

    // Right page fraction & geometry work
    const rx = w * 0.5 + 190;
    ctx.fillStyle = '#9b2929';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText('Verifica di geometria', rx, 96);

    ctx.fillStyle = '#1f3f88';
    ctx.font = '34px "Courier New", monospace';
    ctx.fillText('3) a² + b² = c²', rx, 195);
    ctx.fillText('   a = 6 cm,  b = 8 cm', rx, 251);
    ctx.fillText('   c = sqrt(36 + 64) = 10 cm', rx, 307);

    // Fraction notation
    ctx.fillText('4) 5/6 + 1/3 = (5 + 2)/6 = 7/6', rx, 419);
    ctx.fillText('   (2/5)x + 4 = 10  =>  x = 15', rx, 475);

    ctx.fillStyle = '#2e5d34';
    ctx.font = '28px Georgia, serif';
    ctx.fillText('Compiti: pag. 84 n. 12, 15, 18', rx, 620);

    // Small page numbers at bottom corners
    ctx.fillStyle = '#3c4352';
    ctx.font = '24px Georgia, serif';
    ctx.fillText('14', 76, h - 46);
    ctx.fillText('15', w - 104, h - 46);
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

function buildPairedDeskAndChairs(frameColorHex) {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColorHex,
    roughness: 0.48,
    metalness: 0.35,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: '#d9c5a0',
    roughness: 0.65,
  });
  const woodEdgeMat = new THREE.MeshStandardMaterial({
    color: '#9e784c',
    roughness: 0.7,
  });
  const plyMat = new THREE.MeshStandardMaterial({
    color: '#cfa86e',
    roughness: 0.62,
  });

  // Paired desktop: 1.32m wide (2 x 0.66m), 0.54m deep, top surface at Y = 0.73m
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.025, 0.54), topMat);
  deskTop.position.set(0, 0.7175, 0);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  group.add(deskTop);

  // Under-desk book shelf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.015, 0.36), woodEdgeMat);
  shelf.position.set(0, 0.58, -0.02);
  group.add(shelf);

  // Tubular metal desk legs (4 outer + 2 center)
  const legGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.71, 8);
  const legPositions = [
    [-0.62, 0.355, -0.23],
    [0.62, 0.355, -0.23],
    [-0.62, 0.355, 0.23],
    [0.62, 0.355, 0.23],
    [0, 0.355, -0.23],
    [0, 0.355, 0.23],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, frameMat);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    group.add(leg);
  }

  // Two plywood + tubular steel chairs behind desk (at +Z facing -Z)
  for (const cx of [-0.33, 0.33]) {
    const chair = new THREE.Group();
    chair.position.set(cx, 0, 0.42);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.018, 0.37), plyMat);
    seat.position.set(0, 0.44, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    chair.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.19, 0.016), plyMat);
    back.position.set(0, 0.72, 0.175);
    back.rotation.x = 0.08;
    back.castShadow = true;
    chair.add(back);

    const cLegGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.44, 7);
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

    const uprightGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.36, 7);
    for (const xOff of [-0.15, 0.15]) {
      const up = new THREE.Mesh(uprightGeo, frameMat);
      up.position.set(xOff, 0.62, 0.17);
      chair.add(up);
    }

    group.add(chair);
  }

  return group;
}

function createStylizedPerson(shirtColor, pantsColor, hairColor, seated = false) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: '#e1b594', roughness: 0.72 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.88 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.20), shirtMat);
  torso.position.set(0, seated ? 0.69 : 1.15, 0);
  torso.castShadow = true;
  group.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, seated ? 0.96 : 1.44, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), skinMat);
  head.position.set(0, 0.09, 0);
  head.castShadow = true;
  headPivot.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  hair.position.set(0, 0.10, -0.01);
  hair.rotation.x = -0.18;
  headPivot.add(hair);
  group.add(headPivot);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.21, seated ? 0.88 : 1.34, 0);
  const leftLimb = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.34, 0.085), shirtMat);
  leftLimb.position.set(0, -0.15, 0);
  leftArm.add(leftLimb);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.21, seated ? 0.88 : 1.34, 0);
  const rightLimb = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.34, 0.085), shirtMat);
  rightLimb.position.set(0, -0.15, 0);
  rightArm.add(rightLimb);
  group.add(rightArm);

  if (!seated) {
    const legGeo = new THREE.BoxGeometry(0.13, 0.88, 0.14);
    const lLeg = new THREE.Mesh(legGeo, pantsMat);
    lLeg.position.set(-0.09, 0.44, 0);
    lLeg.castShadow = true;
    const rLeg = new THREE.Mesh(legGeo, pantsMat);
    rLeg.position.set(0.09, 0.44, 0);
    rLeg.castShadow = true;
    group.add(lLeg, rLeg);
  } else {
    const thighGeo = new THREE.BoxGeometry(0.12, 0.11, 0.34);
    const lThigh = new THREE.Mesh(thighGeo, pantsMat);
    lThigh.position.set(-0.085, 0.49, -0.13);
    const rThigh = new THREE.Mesh(thighGeo, pantsMat);
    rThigh.position.set(0.085, 0.49, -0.13);
    const shinGeo = new THREE.BoxGeometry(0.11, 0.44, 0.11);
    const lShin = new THREE.Mesh(shinGeo, pantsMat);
    lShin.position.set(-0.085, 0.22, -0.25);
    const rShin = new THREE.Mesh(shinGeo, pantsMat);
    rShin.position.set(0.085, 0.22, -0.25);
    group.add(lThigh, rThigh, lShin, rShin);
  }

  return { group, headPivot, leftArm, rightArm, torso };
}

function createPickablePencil() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0042, 0.0042, 0.15, 6),
    new THREE.MeshStandardMaterial({ color: '#e2aa2e', roughness: 0.5 })
  );
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const woodCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.0042, 0.018, 6),
    new THREE.MeshStandardMaterial({ color: '#e4c298', roughness: 0.75 })
  );
  woodCone.rotation.z = -Math.PI / 2;
  woodCone.position.set(0.084, 0, 0);
  group.add(woodCone);

  const graphiteTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.0017, 0.007, 6),
    new THREE.MeshStandardMaterial({ color: '#27292e', roughness: 0.45 })
  );
  graphiteTip.rotation.z = -Math.PI / 2;
  graphiteTip.position.set(0.091, 0, 0);
  group.add(graphiteTip);

  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0044, 0.0044, 0.012, 10),
    new THREE.MeshStandardMaterial({ color: '#c4c7cc', metalness: 0.65, roughness: 0.3 })
  );
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.set(-0.081, 0, 0);
  group.add(ferrule);

  const capEraser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0041, 0.0041, 0.01, 10),
    new THREE.MeshStandardMaterial({ color: '#da7685', roughness: 0.75 })
  );
  capEraser.rotation.z = Math.PI / 2;
  capEraser.position.set(-0.092, 0, 0);
  group.add(capEraser);

  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}

function createPickableEraser() {
  const group = new THREE.Group();
  const redHalf = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.012, 0.022),
    new THREE.MeshStandardMaterial({ color: '#c84b4b', roughness: 0.85 })
  );
  redHalf.position.set(-0.012, 0, 0);
  const blueHalf = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.012, 0.022),
    new THREE.MeshStandardMaterial({ color: '#396aa6', roughness: 0.85 })
  );
  blueHalf.position.set(0.014, 0, 0);
  group.add(redHalf, blueHalf);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}

/**
 * Build procedural mid-1990s Italian middle-school classroom scene.
 */
export function createClassroomScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c7ddf0');

  // Lighting: bright left-window daylight + warm indoor fluorescent fill
  const hemiLight = new THREE.HemisphereLight('#f5f7fc', '#b6986d', 0.85);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#fff8ea', 2.05);
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

  const ceilingFill = new THREE.PointLight('#f2f6ff', 14, 16, 1.4);
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

  // Front-right wooden classroom door with yellow trim & round porthole
  const doorGroup = new THREE.Group();
  doorGroup.position.set(3.0, 1.05, -4.12);
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

  // Italy physical wall map & wooden cabinet on right wall
  const italyMap = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 1.15, 0.88),
    new THREE.MeshStandardMaterial({ map: createItalyMapTexture(), roughness: 0.8 })
  );
  italyMap.position.set(3.77, 1.88, -1.65);
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
    new THREE.BoxGeometry(0.42, 0.72, 0.64),
    new THREE.MeshStandardMaterial({ color: '#997348', roughness: 0.72 })
  );
  cattedraPedestal.position.set(0.44, 0.36, 0);
  const register = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.035, 0.24),
    new THREE.MeshStandardMaterial({ color: '#1d4c8a', roughness: 0.6 })
  );
  register.position.set(-0.22, 0.798, 0.04);
  register.rotation.y = 0.08;
  cattedraGroup.add(addFocusMesh(cattedraTop), cattedraFront, cattedraPedestal, register);

  const teacherChair = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.45, 0.44),
    new THREE.MeshStandardMaterial({ color: '#8f653b', roughness: 0.7 })
  );
  teacherChair.position.set(-0.08, 0.225, -0.58);
  cattedraGroup.add(teacherChair);
  scene.add(cattedraGroup);
  colliders.push({ minX: 0.14, maxX: 1.56, minZ: -3.55, maxZ: -2.56 });

  const teacher = createStylizedPerson('#3e6259', '#323842', '#4c382c', false);
  teacher.group.position.set(-0.05, 0, -3.15);
  teacher.group.rotation.y = 0.25;
  scene.add(addFocusMesh(teacher.group));
  colliders.push({ minX: -0.35, maxX: 0.25, minZ: -3.45, maxZ: -2.85 });

  // 3 rows x 2 columns paired tubular red/blue Italian school desks
  const rowsZ = [-1.1, 0.55, 2.2];
  const colsX = [-2.0, 1.35];
  const colors = ['#b43c3c', '#356099'];

  for (let r = 0; r < rowsZ.length; r += 1) {
    for (let c = 0; c < colsX.length; c += 1) {
      const pair = buildPairedDeskAndChairs(colors[(r + c) % 2]);
      pair.position.set(colsX[c], 0, rowsZ[r]);
      scene.add(addFocusMesh(pair));
      // Desk + chairs combined AABB collider
      colliders.push({
        minX: colsX[c] - 0.68,
        maxX: colsX[c] + 0.68,
        minZ: rowsZ[r] - 0.30,
        maxZ: rowsZ[r] + 0.64,
      });
    }
  }

  // 1 classmate in LEFT chair of Vuarbit's paired desk (Row 1, Left col: X = -2.0, Z = -1.1)
  const classmate = createStylizedPerson('#4b739c', '#353e4a', '#2c231c', true);
  classmate.group.position.set(-2.33, 0, -0.68);
  scene.add(addFocusMesh(classmate.group));

  // Classmate's closed notebook
  const mateBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.015, 0.28),
    new THREE.MeshStandardMaterial({ color: '#396ba6', roughness: 0.7 })
  );
  mateBook.position.set(-2.33, 0.738, -1.0);
  scene.add(mateBook);

  // Vuarbit's desk (RIGHT half of Row 1 Left paired desk)
  const deskPos = new THREE.Vector3(-1.67, 0.73, -1.02);
  const seatPose = {
    position: new THREE.Vector3(-1.67, 1.08, -0.72),
    yaw: 0.0,
    pitch: 0.04,
  };
  const standPose = {
    position: new THREE.Vector3(-0.82, 1.40, -0.20),
    yaw: 0.12,
    pitch: 0.0,
  };

  // Fixed open Italian 5mm quadretti math workbook on Vuarbit's desk
  const workbookGroup = new THREE.Group();
  workbookGroup.position.set(-1.67, 0.734, -0.97);
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.41, 0.006, 0.29),
    new THREE.MeshStandardMaterial({ color: '#b43232', roughness: 0.72 })
  );
  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(0.39, 0.008, 0.275),
    new THREE.MeshStandardMaterial({ map: createWorkbookTexture(), roughness: 0.82 })
  );
  pages.position.set(0, 0.004, 0);
  workbookGroup.add(cover, addFocusMesh(pages));
  scene.add(workbookGroup);

  // Pickable pencil & eraser on Vuarbit's desk
  const pencilMesh = createPickablePencil();
  const pencilRestPos = new THREE.Vector3(-1.41, 0.736, -0.94);
  const pencilRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.25, 0));
  pencilMesh.position.copy(pencilRestPos);
  pencilMesh.quaternion.copy(pencilRestQuat);
  scene.add(addFocusMesh(pencilMesh));

  const eraserMesh = createPickableEraser();
  const eraserRestPos = new THREE.Vector3(-1.43, 0.737, -1.08);
  const eraserRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 0));
  eraserMesh.position.copy(eraserRestPos);
  eraserMesh.quaternion.copy(eraserRestQuat);
  scene.add(addFocusMesh(eraserMesh));

  const pickables = [
    {
      id: 'pencil',
      name: 'Wooden Pencil',
      mesh: pencilMesh,
      restPosition: pencilRestPos.clone(),
      restQuaternion: pencilRestQuat.clone(),
      occluderRadius: 0.012,
    },
    {
      id: 'eraser',
      name: 'Red/Blue Eraser',
      mesh: eraserMesh,
      restPosition: eraserRestPos.clone(),
      restQuaternion: eraserRestQuat.clone(),
      occluderRadius: 0.016,
    },
  ];

  // Reusable scratch objects for zero-GC update loop
  let simTime = 0;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const eyeOD = new THREE.Vector3();
  const eyeOS = new THREE.Vector3();
  const localEyeOD = new THREE.Vector3(0.029, 0, 0);
  const localEyeOS = new THREE.Vector3(-0.029, 0, 0);
  const localHeld = new THREE.Vector3();
  const heldWorldPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const nearestDeskPt = new THREE.Vector3();
  const heldTiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.45, -0.55));
  const deskBounds = { minX: -2.66, maxX: -1.34, y: 0.73, minZ: -1.37, maxZ: -0.83 };

  function updateScene(dt, state, camera) {
    simTime += Math.min(dt || 0, 0.1);

    // Animate teacher (subtle breathing, head turn, gesturing arm)
    teacher.torso.scale.y = 1 + Math.sin(simTime * 2.1) * 0.015;
    teacher.headPivot.rotation.y = Math.sin(simTime * 0.7) * 0.28;
    teacher.rightArm.rotation.x = -0.85 + Math.sin(simTime * 2.4) * 0.26;
    teacher.rightArm.rotation.z = 0.18 + Math.cos(simTime * 1.6) * 0.12;
    teacher.leftArm.rotation.x = -0.2 + Math.sin(simTime * 1.1) * 0.08;

    // Animate classmate (subtle writing & breathing)
    classmate.torso.scale.y = 1 + Math.sin(simTime * 2.6 + 1.0) * 0.014;
    classmate.headPivot.rotation.x = 0.34 + Math.sin(simTime * 1.4) * 0.04;
    classmate.rightArm.rotation.x = -0.75 + Math.sin(simTime * 5.2) * 0.07;
    classmate.rightArm.rotation.y = Math.cos(simTime * 4.1) * 0.05;

    // Subtle analog clock minute hand drift
    minHandPivot.rotation.z = -simTime * 0.02;

    if (!camera) return;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);

    // Move held pickable into camera-relative space via state.heldOffset
    let heldEntry = null;
    if (state.holding) {
      heldEntry = pickables.find((p) => p.id === state.holding) || null;
      if (heldEntry) {
        const off = state.heldOffset;
        localHeld.set(off.x, off.y, -off.z);
        heldWorldPos.copy(localHeld).applyMatrix4(camera.matrixWorld);
        heldEntry.mesh.position.copy(heldWorldPos);
        heldEntry.mesh.quaternion.copy(camera.quaternion).multiply(heldTiltQuat);
        heldEntry.mesh.updateMatrixWorld(true);
      }
    }

    // Eye world positions: OD (+0.029m right), OS (-0.029m left)
    eyeOD.copy(localEyeOD).applyMatrix4(camera.matrixWorld);
    eyeOS.copy(localEyeOS).applyMatrix4(camera.matrixWorld);

    let occlOD = 0;
    let occlOS = 0;

    // 1. Held object monocular/binocular occlusion when within eye view cone
    if (heldEntry) {
      const r = heldEntry.occluderRadius;
      toTarget.copy(heldWorldPos).sub(eyeOD);
      const distOD = toTarget.length();
      if (distOD > 1e-4 && toTarget.dot(forward) / distOD > 0.35) {
        occlOD = Math.max(occlOD, computeOcclusionFromDistance(Math.max(0.01, distOD - r)));
      }
      toTarget.copy(heldWorldPos).sub(eyeOS);
      const distOS = toTarget.length();
      if (distOS > 1e-4 && toTarget.dot(forward) / distOS > 0.35) {
        occlOS = Math.max(occlOS, computeOcclusionFromDistance(Math.max(0.01, distOS - r)));
      }
    }

    // 2. Desk surface occlusion when leaning close while seated
    if (state.mode === 'seated') {
      const evalDeskOccl = (eyePos) => {
        nearestDeskPt.set(
          Math.min(deskBounds.maxX, Math.max(deskBounds.minX, eyePos.x)),
          deskBounds.y,
          Math.min(deskBounds.maxZ, Math.max(deskBounds.minZ, eyePos.z))
        );
        const dist = eyePos.distanceTo(nearestDeskPt);
        if (dist < 0.25 && (forward.y < -0.05 || dist < 0.18)) {
          return computeOcclusionFromDistance(dist);
        }
        return 0;
      };
      occlOD = Math.max(occlOD, evalDeskOccl(eyeOD));
      occlOS = Math.max(occlOS, evalDeskOccl(eyeOS));
    }

    state.occlOD = occlOD;
    state.occlOS = occlOS;

    // 3. Center-ray focus distance
    raycaster.set(camera.position, forward);
    raycaster.near = 0.04;
    raycaster.far = 20.0;
    const hits = raycaster.intersectObjects(focusTargets, true);
    if (hits.length > 0) {
      state.focusDistM = Math.min(20.0, Math.max(0.06, hits[0].distance));
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
