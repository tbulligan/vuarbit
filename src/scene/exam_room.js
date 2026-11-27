import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeOcclusionFromDistance, TIME_OF_DAY_PRESETS } from '../state.js';
import { createPlayerShadowCaster } from './player_shadow.js';
import { EXAM_VIEW_DISTANCE_M } from './exam_calibration.js';
import {
  createAmslerTexture,
  createDistanceMarkerTexture,
  createEtdrsChartTexture,
  createExamFloorTexture,
  createEyeAnatomyTexture,
  createGlareTargetTexture,
  createIshiharaPanelTexture,
  createJaegerCardTexture,
  createPelliRobsonTexture,
} from './exam_charts.js';

// shortcut: procedural clinical geometry + canvas diagnostic charts (no external glTF assets); occlusion/held loop duplicates scene.js until a 3rd scene (P4) justifies a shared helper

const FRONT_CHART_Z = -2.25;
const SEATED_EYE_Z = FRONT_CHART_Z + EXAM_VIEW_DISTANCE_M; // +1.75 m -> exact 4.000 m to ETDRS plane
const SEATED_EYE_Y = 1.26;

function buildExamChair() {
  const group = new THREE.Group();
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cfd5dd', metalness: 0.78, roughness: 0.22 });
  const baseMat = new THREE.MeshStandardMaterial({ color: '#3b3f3d', roughness: 0.55, metalness: 0.3 });
  const vinylMat = new THREE.MeshStandardMaterial({ color: '#2f5c4a', roughness: 0.58 }); // 1990s Italian bottle-green clinical vinyl

  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.05, 24), baseMat);
  basePlate.position.y = 0.025;
  basePlate.receiveShadow = true;

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.48, 16), chromeMat);
  column.position.y = 0.28;
  column.castShadow = true;

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.11, 0.52), vinylMat);
  seat.position.set(0, 0.56, 0.04);
  seat.castShadow = true;
  seat.receiveShadow = true;

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.64, 0.10), vinylMat);
  backrest.position.set(0, 0.90, 0.27);
  backrest.rotation.x = 0.08;
  backrest.castShadow = true;

  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.09), vinylMat);
  headrest.position.set(0, 1.30, 0.31);
  headrest.castShadow = true;

  const headrestPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 10), chromeMat);
  headrestPost.position.set(0, 1.22, 0.30);

  const footrest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.20), baseMat);
  footrest.position.set(0, 0.18, -0.32);

  const footStem = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.04), chromeMat);
  footStem.position.set(0, 0.36, -0.22);

  for (const sx of [-0.29, 0.29]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.42), vinylMat);
    arm.position.set(sx, 0.78, 0.06);
    arm.castShadow = true;
    const armPost = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10), chromeMat);
    armPost.position.set(sx, 0.66, 0.16);
    group.add(arm, armPost);
  }

  group.add(basePlate, column, seat, backrest, headrest, headrestPost, footrest, footStem);
  return group;
}

function buildClinicianStool() {
  const group = new THREE.Group();
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cfd5dd', metalness: 0.78, roughness: 0.24 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#242930', roughness: 0.65 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#2f5c4a', roughness: 0.58 });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.44, 12), chromeMat);
  stem.position.y = 0.26;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.075, 20), padMat);
  seat.position.y = 0.50;
  seat.castShadow = true;
  group.add(stem, seat);

  for (let i = 0; i < 5; i += 1) {
    const ang = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.022, 0.24), darkMat);
    leg.position.set(Math.sin(ang) * 0.12, 0.06, Math.cos(ang) * 0.12);
    leg.rotation.y = ang;
    group.add(leg);
  }
  return group;
}

function buildSlitLampUnit() {
  const group = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#edf1f4', roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#262d36', roughness: 0.48, metalness: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.78, roughness: 0.22 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#2b5f7a', roughness: 0.5 });

  // Motorized clinical instrument table
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.46), darkMat);
  base.position.y = 0.04;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.70, 14), chromeMat);
  col.position.y = 0.40;
  col.castShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.032, 0.46), whiteMat);
  top.position.y = 0.77;
  top.castShadow = true;
  top.receiveShadow = true;

  // Slit-lamp base carriage + joystick
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.22), darkMat);
  carriage.position.set(0, 0.81, 0.04);
  const joystick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.11, 10), darkMat);
  joystick.position.set(0.05, 0.88, 0.11);
  joystick.rotation.x = 0.18;

  // Chinrest & forehead frame (patient side)
  for (const sx of [-0.085, 0.085]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 8), chromeMat);
    post.position.set(sx, 0.96, -0.14);
    group.add(post);
  }
  const browBar = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.016, 0.022), darkMat);
  browBar.position.set(0, 1.13, -0.14);
  const chinCup = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.045), darkMat);
  chinCup.position.set(0, 0.90, -0.14);

  // Illumination tower & binocular microscope arm
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.26, 12), whiteMat);
  tower.position.set(-0.04, 0.97, 0.02);
  tower.rotation.z = 0.14;
  const towerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 12), accentMat);
  towerCap.position.set(-0.06, 1.10, 0.02);
  const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.16), darkMat);
  scopeBody.position.set(0.02, 0.99, 0.02);
  for (const ex of [-0.022, 0.022]) {
    const ocular = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.065, 10), darkMat);
    ocular.rotation.x = Math.PI / 2;
    ocular.position.set(0.02 + ex, 1.00, 0.12);
    group.add(ocular);
  }

  group.add(base, col, top, carriage, joystick, browBar, chinCup, tower, towerCap, scopeBody);
  return group;
}

function buildPhoropterStand() {
  const group = new THREE.Group();
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.8, roughness: 0.22 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#dde3e8', roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#242a33', roughness: 0.5 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.05, 18), darkMat);
  base.position.y = 0.025;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 1.88, 14), chromeMat);
  pole.position.y = 0.96;
  pole.castShadow = true;

  // Parked upper swing arm angled away from patient sightline (-X)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.036, 0.042), bodyMat);
  arm.position.set(-0.18, 1.48, 0.0);
  arm.castShadow = true;

  // Compact retracted phoropter head (dual lens wheels)
  const head = new THREE.Group();
  head.position.set(-0.34, 1.38, 0.03);
  head.rotation.y = 0.45;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), darkMat);
  for (const dx of [-0.075, 0.075]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.032, 18), darkMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(dx, -0.04, 0);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.036, 14), chromeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(dx, -0.04, 0);
    head.add(wheel, ring);
  }
  head.add(bridge);

  // Overhead exam gooseneck lamp hood
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8), chromeMat);
  lampArm.position.set(0.09, 1.88, -0.08);
  lampArm.rotation.z = -0.65;
  const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.10, 14), bodyMat);
  lampHead.position.set(0.20, 1.82, -0.10);
  lampHead.rotation.z = 0.35;

  group.add(base, pole, arm, head, lampArm, lampHead);
  return group;
}

function buildPottedPlant() {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({ color: '#a86444', roughness: 0.78 }); // 1990s Italian terracotta planter
  const soilMat = new THREE.MeshStandardMaterial({ color: '#46382b', roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3b6b4c', roughness: 0.62, side: THREE.DoubleSide });
  const leafLightMat = new THREE.MeshStandardMaterial({ color: '#4f825e', roughness: 0.58, side: THREE.DoubleSide });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.115, 0.30, 18), potMat);
  pot.position.y = 0.15;
  pot.castShadow = true;
  pot.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 16), soilMat);
  soil.position.y = 0.29;
  group.add(pot, soil);

  // Upright architectural Sansevieria blades (clean modern clinic aesthetic)
  for (let i = 0; i < 11; i += 1) {
    const ang = (i / 11) * Math.PI * 2 + (i % 2) * 0.22;
    const h = 0.42 + (i % 4) * 0.13;
    const rad = 0.03 + (i % 3) * 0.028;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.036, h, 4), i % 2 === 0 ? leafMat : leafLightMat);
    blade.scale.set(1.0, 1.0, 0.22);
    blade.position.set(Math.cos(ang) * rad, 0.29 + h * 0.48, Math.sin(ang) * rad);
    blade.rotation.y = ang;
    blade.rotation.z = (i % 2 === 0 ? 1 : -1) * (0.06 + (i % 3) * 0.04);
    blade.castShadow = true;
    group.add(blade);
  }
  return group;
}

function buildFrontClinicalCounter() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#dcd5c6', roughness: 0.56 }); // 1990s putty-beige medical enamel cabinetry
  const oakTopMat = new THREE.MeshStandardMaterial({ color: '#e7e1d2', roughness: 0.52 }); // warm ivory clinical laminate
  const toeMat = new THREE.MeshStandardMaterial({ color: '#474a46', roughness: 0.74 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.82, roughness: 0.20 });
  const sinkMat = new THREE.MeshStandardMaterial({ color: '#aeb7c2', metalness: 0.72, roughness: 0.28 });

  const width = 3.20;
  const depth = 0.44;
  const height = 0.76;

  // Recessed dark plinth toe-kick
  const toe = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, 0.08, depth - 0.06), toeMat);
  toe.position.set(0, 0.04, -0.02);
  // Main cabinet carcass
  const carcass = new THREE.Mesh(new THREE.BoxGeometry(width, height - 0.11, depth), bodyMat);
  carcass.position.set(0, 0.08 + (height - 0.11) * 0.5, 0);
  carcass.castShadow = true;
  carcass.receiveShadow = true;
  // Warm oak countertop
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.032, depth + 0.03), oakTopMat);
  counterTop.position.set(0, height - 0.016, 0.01);
  counterTop.castShadow = true;
  counterTop.receiveShadow = true;
  // Low backsplash lip
  const splash = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.065, 0.02), oakTopMat);
  splash.position.set(0, height + 0.032, -depth * 0.5 + 0.01);
  group.add(toe, carcass, counterTop, splash);

  // 5 crisp cabinet doors with subtle groove shadows & brushed chrome bar pulls
  const doorW = (width - 0.08) / 5;
  const grooveMat = new THREE.MeshStandardMaterial({ color: '#cbd3da', roughness: 0.75 });
  for (let i = 0; i < 5; i += 1) {
    const dx = -width * 0.5 + 0.04 + (i + 0.5) * doorW;
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.016, 0.60, 0.014), bodyMat);
    door.position.set(dx, 0.41, depth * 0.5 + 0.005);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), chromeMat);
    pull.position.set(dx + (i % 2 === 0 ? doorW * 0.34 : -doorW * 0.34), 0.55, depth * 0.5 + 0.024);
    group.add(door, pull);
    if (i > 0) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.62, 0.006), grooveMat);
      seam.position.set(dx - doorW * 0.5, 0.41, depth * 0.5 + 0.003);
      group.add(seam);
    }
  }

  // Far-left clinical hand-washing basin + gooseneck chrome faucet (clear of Pelli-Robson chart edge)
  const basin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.012, 0.26), sinkMat);
  basin.position.set(-1.37, height + 0.004, 0.01);
  const faucetStem = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.013, 0.13, 10), chromeMat);
  faucetStem.position.set(-1.37, height + 0.065, -0.14);
  const faucetSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 10), chromeMat);
  faucetSpout.rotation.x = Math.PI * 0.42;
  faucetSpout.position.set(-1.37, height + 0.125, -0.10);
  const soapBottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.028, 0.11, 12),
    new THREE.MeshStandardMaterial({ color: '#3b82a6', roughness: 0.35 })
  );
  soapBottle.position.set(-1.52, height + 0.055, -0.11);
  group.add(basin, faucetStem, faucetSpout, soapBottle);

  // Right-side clinical counter items: tissue cube, lens-spray bottle, stacked exam folders
  const tissueBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.11, 0.12),
    new THREE.MeshStandardMaterial({ color: '#e2e8ee', roughness: 0.8 })
  );
  tissueBox.position.set(1.18, height + 0.055, -0.03);
  tissueBox.castShadow = true;
  const folder1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.014, 0.30),
    new THREE.MeshStandardMaterial({ color: '#355c7d', roughness: 0.72 })
  );
  folder1.position.set(0.72, height + 0.007, 0.02);
  folder1.rotation.y = 0.08;
  const lensCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.042, 0.16),
    new THREE.MeshStandardMaterial({ color: '#6b492d', roughness: 0.58 }) // classic 90s wooden trial-lens case
  );
  lensCase.position.set(-0.46, height + 0.021, 0.02);
  lensCase.castShadow = true;
  group.add(tissueBox, folder1, lensCase);

  return group;
}

/**
 * Build compact 4.0 m Optometry Exam Room for clinical MAR acuity & pathology calibration.
 */
export function createExamRoomScene(renderer = null) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c7daf0');

  let envRT = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.36;
    roomEnv.dispose();
    pmrem.dispose();
  }

  // Lighting rig (driven by state.timeOfDay, state.lightsOn, state.glareLightOn)
  const hemiLight = new THREE.HemisphereLight('#e5eef9', '#9ea6b0', 1.05);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#fff2dc', 1.6);
  sunLight.position.set(-5.8, 3.6, -0.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 16;
  sunLight.shadow.camera.left = -4.2;
  sunLight.shadow.camera.right = 4.2;
  sunLight.shadow.camera.top = 4.2;
  sunLight.shadow.camera.bottom = -4.2;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.015;
  scene.add(sunLight);

  const ceilLight = new THREE.DirectionalLight('#f4f8ff', 1.05);
  ceilLight.position.set(0.0, 2.82, 0.45);
  ceilLight.castShadow = true;
  ceilLight.shadow.mapSize.set(1024, 1024);
  ceilLight.shadow.camera.near = 0.05;
  ceilLight.shadow.camera.far = 4.2;
  ceilLight.shadow.camera.left = -3.4;
  ceilLight.shadow.camera.right = 3.4;
  ceilLight.shadow.camera.top = 3.4;
  ceilLight.shadow.camera.bottom = -3.4;
  ceilLight.shadow.bias = -0.0005;
  ceilLight.shadow.normalBias = 0.015;
  scene.add(ceilLight);

  const windowLight = new THREE.PointLight('#d4e6ff', 2.0, 8.0, 1.6);
  windowLight.position.set(-1.95, 1.75, 0.35);
  scene.add(windowLight);

  const bounds = { minX: -2.20, maxX: 2.20, minZ: -2.30, maxZ: 3.30 };
  const colliders = [];
  const focusTargets = [];
  const addFocusMesh = (mesh) => {
    focusTargets.push(mesh);
    return mesh;
  };

  // Room shell: 4.40 m wide (X: -2.20..2.20), 5.60 m deep (Z: -2.30..3.30), 2.90 m tall
  const roomW = bounds.maxX - bounds.minX;
  const roomD = bounds.maxZ - bounds.minZ;
  const roomCenterZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const roomH = 2.90;

  const floorTex = createExamFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomD),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.64 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, roomCenterZ);
  floor.receiveShadow = true;
  scene.add(addFocusMesh(floor));

  // Calibrated floor distance strips (1.0 m, 2.0 m, 3.0 m, 4.0 m from ETDRS chart at Z = -2.25)
  for (const distM of [1.0, 2.0, 3.0, 4.0]) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.105),
      new THREE.MeshStandardMaterial({
        map: createDistanceMarkerTexture(`${distM.toFixed(1)} m`),
        roughness: 0.72,
      })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.002, FRONT_CHART_Z + distM);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW + 0.1, roomD + 0.1),
    new THREE.MeshStandardMaterial({ color: '#eff2f5', roughness: 0.9, shadowSide: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, roomH, roomCenterZ);
  ceiling.castShadow = true;
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#ece9df', roughness: 0.88, shadowSide: THREE.DoubleSide });
  const lowerWallMat = new THREE.MeshStandardMaterial({ color: '#bfd0c3', roughness: 0.82, shadowSide: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#a8895e', roughness: 0.62 });
  const baseBoardMat = new THREE.MeshStandardMaterial({ color: '#6b6d67', roughness: 0.72 });

  function addClinicWall(width, cx, cz, rotY, castShadow = true) {
    const low = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.98), lowerWallMat);
    low.position.set(cx, 0.49, cz);
    low.rotation.y = rotY;
    low.castShadow = castShadow;
    low.receiveShadow = true;

    const up = new THREE.Mesh(new THREE.PlaneGeometry(width, roomH - 0.98), wallMat);
    up.position.set(cx, 0.98 + (roomH - 0.98) * 0.5, cz);
    up.rotation.y = rotY;
    up.castShadow = castShadow;
    up.receiveShadow = true;

    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.036, 0.028), trimMat);
    rail.position.set(cx, 0.98, cz);
    rail.rotation.y = rotY;

    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.095, 0.022), baseBoardMat);
    base.position.set(cx, 0.0475, cz);
    base.rotation.y = rotY;

    scene.add(addFocusMesh(low), addFocusMesh(up), rail, base);
  }

  // Front (-Z), Back (+Z), Right (+X) walls
  addClinicWall(roomW, 0, bounds.minZ, 0, true);
  addClinicWall(roomW, 0, bounds.maxZ, Math.PI, true);
  addClinicWall(roomD, bounds.maxX, roomCenterZ, -Math.PI / 2, false);

  // Left wall (-X) with clinical frosted window bay (Z: -0.75..+1.35, Y: 0.98..2.42) driving T Time-of-Day
  const leftLow = new THREE.Mesh(new THREE.PlaneGeometry(roomD, 0.98), lowerWallMat);
  leftLow.position.set(bounds.minX, 0.49, roomCenterZ);
  leftLow.rotation.y = Math.PI / 2;
  leftLow.castShadow = true;
  leftLow.receiveShadow = true;
  const leftBase = new THREE.Mesh(new THREE.BoxGeometry(roomD, 0.095, 0.022), baseBoardMat);
  leftBase.position.set(bounds.minX, 0.0475, roomCenterZ);
  leftBase.rotation.y = Math.PI / 2;
  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(roomD, 0.036, 0.028), trimMat);
  leftRail.position.set(bounds.minX, 0.98, roomCenterZ);
  leftRail.rotation.y = Math.PI / 2;
  scene.add(addFocusMesh(leftLow), leftBase, leftRail);

  const leftTop = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH - 2.42), wallMat);
  leftTop.position.set(bounds.minX, 2.42 + (roomH - 2.42) * 0.5, roomCenterZ);
  leftTop.rotation.y = Math.PI / 2;
  leftTop.castShadow = true;
  leftTop.receiveShadow = true;
  scene.add(addFocusMesh(leftTop));

  const leftFrontPillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.44, 1.55), wallMat);
  leftFrontPillar.position.set(bounds.minX, 1.70, -1.525);
  leftFrontPillar.castShadow = true;
  leftFrontPillar.receiveShadow = true;
  const leftBackPillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.44, 1.95), wallMat);
  leftBackPillar.position.set(bounds.minX, 1.70, 2.325);
  leftBackPillar.castShadow = true;
  leftBackPillar.receiveShadow = true;
  scene.add(addFocusMesh(leftFrontPillar), addFocusMesh(leftBackPillar));

  // Exterior HDR sky plane outside left window
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 128;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const paintSkyGradient = (topHex, botHex) => {
    const g = skyCtx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, topHex);
    g.addColorStop(1, botHex);
    skyCtx.fillStyle = g;
    skyCtx.fillRect(0, 0, 4, 128);
    skyTex.needsUpdate = true;
  };
  paintSkyGradient(TIME_OF_DAY_PRESETS.sunny.skyTop, TIME_OF_DAY_PRESETS.sunny.skyPlane);

  const skyPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.4),
    new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(1.9, 1.9, 1.9) })
  );
  skyPlane.position.set(bounds.minX - 0.55, 1.72, 0.30);
  skyPlane.rotation.y = Math.PI / 2;
  scene.add(skyPlane);

  // Window aluminum frame + translucent clinical blinds (softens daylight so ETDRS stays readable)
  const frameMat = new THREE.MeshStandardMaterial({ color: '#aeb7c2', metalness: 0.55, roughness: 0.36 });
  const winGlassMat = new THREE.MeshStandardMaterial({
    color: '#dce9f5',
    transparent: true,
    opacity: 0.24,
    roughness: 0.35,
  });
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.10, 1.40), winGlassMat);
  winGlass.position.set(bounds.minX + 0.01, 1.72, 0.30);
  winGlass.rotation.y = Math.PI / 2;
  scene.add(addFocusMesh(winGlass));

  const slatMat = new THREE.MeshStandardMaterial({ color: '#e6eaee', roughness: 0.72 });
  for (let i = 0; i < 14; i += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 2.06), slatMat);
    slat.position.set(bounds.minX + 0.03, 1.09 + i * 0.095, 0.30);
    slat.rotation.z = 0.24;
    scene.add(slat);
  }
  const winSill = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 2.18), frameMat);
  winSill.position.set(bounds.minX + 0.03, 1.01, 0.30);
  scene.add(winSill);

  // 4 Classic 1990s twin-tube fluorescent ceiling fixtures (matches Classroom 90s Italian architecture)
  const ledPanelMat = new THREE.MeshStandardMaterial({
    color: '#fafaf4',
    emissive: '#f4f6ec',
    emissiveIntensity: 2.2,
    roughness: 0.25,
  });
  const fixtureMat = new THREE.MeshStandardMaterial({ color: '#d4cfc2', roughness: 0.55, metalness: 0.2 });
  const tubeGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.12, 10);
  tubeGeo.rotateX(Math.PI / 2);
  const ledLights = [];
  for (const [lx, lz] of [
    [-0.95, -0.75],
    [0.95, -0.75],
    [-0.95, 1.35],
    [0.95, 1.35],
  ]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 1.18), fixtureMat);
    housing.position.set(lx, roomH - 0.025, lz);
    const tubeL = new THREE.Mesh(tubeGeo, ledPanelMat);
    tubeL.position.set(lx - 0.055, roomH - 0.058, lz);
    const tubeR = new THREE.Mesh(tubeGeo, ledPanelMat);
    tubeR.position.set(lx + 0.055, roomH - 0.058, lz);
    scene.add(housing, tubeL, tubeR);

    const pl = new THREE.PointLight('#f5f7ef', 1.15, 6.5, 1.6);
    pl.position.set(lx, roomH - 0.16, lz);
    scene.add(pl);
    ledLights.push(pl);
  }

  // --- FRONT DIAGNOSTIC WALL (Z = -2.25 -> exact 4.000 m from seated eyes at Z = +1.75) ---

  // 1. Center: 4.00 m Backlit ETDRS / Snellen Acuity Lightbox (1990s beige enamel metal cabinet)
  const etdrsW = 0.74;
  const etdrsH = 0.76;
  const etdrsTex = createEtdrsChartTexture(etdrsW, etdrsH);
  const etdrsFaceMat = new THREE.MeshStandardMaterial({
    map: etdrsTex,
    emissiveMap: etdrsTex,
    emissive: '#fffdf5',
    emissiveIntensity: 0.42,
    roughness: 0.42,
  });
  const etdrsCabinet = new THREE.Mesh(
    new THREE.BoxGeometry(etdrsW + 0.055, etdrsH + 0.055, 0.075),
    new THREE.MeshStandardMaterial({ color: '#ccc5b6', metalness: 0.25, roughness: 0.45 })
  );
  etdrsCabinet.position.set(0, SEATED_EYE_Y, FRONT_CHART_Z - 0.040);
  etdrsCabinet.castShadow = true;
  const etdrsFace = new THREE.Mesh(new THREE.PlaneGeometry(etdrsW, etdrsH), etdrsFaceMat);
  etdrsFace.position.set(0, SEATED_EYE_Y, FRONT_CHART_Z);
  scene.add(etdrsCabinet, addFocusMesh(etdrsFace));

  // 2. Front-Left: Pelli-Robson Contrast Sensitivity Chart (0.58 m x 0.76 m)
  const pelliW = 0.58;
  const pelliH = 0.76;
  const pelliTex = createPelliRobsonTexture(pelliW, pelliH);
  const pelliFrame = new THREE.Mesh(
    new THREE.BoxGeometry(pelliW + 0.035, pelliH + 0.035, 0.025),
    new THREE.MeshStandardMaterial({ color: '#39414d', roughness: 0.55 })
  );
  pelliFrame.position.set(-0.96, SEATED_EYE_Y, FRONT_CHART_Z - 0.015);
  const pelliFace = new THREE.Mesh(
    new THREE.PlaneGeometry(pelliW, pelliH),
    new THREE.MeshStandardMaterial({ map: pelliTex, roughness: 0.86 })
  );
  pelliFace.position.set(-0.96, SEATED_EYE_Y, FRONT_CHART_Z);
  pelliFace.receiveShadow = true;
  scene.add(pelliFrame, addFocusMesh(pelliFace));

  // 3. Front-Right: Calibrated Point-Light Glare Target Panel (0.58 m x 0.58 m dark baffle + HDR LED core)
  const glarePanelSize = 0.58;
  const glareX = 1.05;
  const glareTex = createGlareTargetTexture(glarePanelSize);
  const glareBoard = new THREE.Mesh(
    new THREE.BoxGeometry(glarePanelSize + 0.03, glarePanelSize + 0.03, 0.03),
    new THREE.MeshStandardMaterial({ color: '#1b2028', roughness: 0.7 })
  );
  glareBoard.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z - 0.018);
  const glareFace = new THREE.Mesh(
    new THREE.PlaneGeometry(glarePanelSize, glarePanelSize),
    new THREE.MeshStandardMaterial({ map: glareTex, roughness: 0.94 })
  );
  glareFace.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z);
  scene.add(glareBoard, addFocusMesh(glareFace));

  // Central HDR point-light bead (linear emissive ~10.0 pairs with smooth continuous IGN-jittered HOA streaks in vision.frag.glsl)
  const glareCoreMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fff8ea',
    emissiveIntensity: 10.0,
    roughness: 0.1,
  });
  const glareHaloMat = new THREE.MeshStandardMaterial({
    color: '#fff5e0',
    emissive: '#ffefd0',
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.65,
    roughness: 0.2,
  });
  const glareBezel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.031, 0.022, 20),
    new THREE.MeshStandardMaterial({ color: '#1b2028', metalness: 0.6, roughness: 0.35 })
  );
  glareBezel.rotation.x = Math.PI / 2;
  glareBezel.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z + 0.008);

  const glareCore = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), glareCoreMat);
  glareCore.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z + 0.018);

  const glareHalo = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), glareHaloMat);
  glareHalo.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z + 0.019);

  const glarePointLight = new THREE.PointLight('#fff3dc', 0.38, 1.8, 2.0);
  glarePointLight.position.set(glareX, SEATED_EYE_Y, FRONT_CHART_Z + 0.09);
  scene.add(glareBezel, glareCore, glareHalo, glarePointLight);

  // Front clinical counter/cabinetry under charts (grounds front wall & removes sterile void)
  const frontCounter = buildFrontClinicalCounter();
  frontCounter.position.set(0, 0, bounds.minZ + 0.24);
  scene.add(addFocusMesh(frontCounter));
  colliders.push({ minX: -1.66, maxX: 1.66, minZ: bounds.minZ, maxZ: bounds.minZ + 0.49 });

  // Slit-lamp biomicroscope on wheeled instrument table along left-mid lane (clear of 4 m sightlines)
  const slitLamp = buildSlitLampUnit();
  slitLamp.position.set(-1.76, 0, -0.82);
  slitLamp.rotation.y = 0.52;
  scene.add(addFocusMesh(slitLamp));
  colliders.push({ minX: -2.14, maxX: -1.38, minZ: -1.18, maxZ: -0.46 });

  // Retracted phoropter column & parked arm beside exam chair (left-side peripheral cue)
  const phoropter = buildPhoropterStand();
  phoropter.position.set(-0.56, 0, SEATED_EYE_Z + 0.04);
  scene.add(addFocusMesh(phoropter));
  colliders.push({ minX: -0.78, maxX: -0.34, minZ: SEATED_EYE_Z - 0.18, maxZ: SEATED_EYE_Z + 0.28 });

  // Modern potted clinic plant in front-right corner
  const plant = buildPottedPlant();
  plant.position.set(1.88, 0, bounds.minZ + 0.34);
  scene.add(addFocusMesh(plant));
  colliders.push({ minX: 1.68, maxX: 2.12, minZ: bounds.minZ + 0.12, maxZ: bounds.minZ + 0.56 });

  // Framed Eye Cross-Section Anatomy Poster on left-front wall pillar
  const anatomyTex = createEyeAnatomyTexture();
  const anatomyFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.68, 0.52),
    new THREE.MeshStandardMaterial({ color: '#39414d', roughness: 0.55 })
  );
  anatomyFrame.position.set(bounds.minX + 0.068, 1.56, -1.52);
  const anatomyFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.64),
    new THREE.MeshStandardMaterial({ map: anatomyTex, roughness: 0.84 })
  );
  anatomyFace.position.set(bounds.minX + 0.082, 1.56, -1.52);
  anatomyFace.rotation.y = Math.PI / 2;
  scene.add(anatomyFrame, addFocusMesh(anatomyFace));

  // 1990s walnut Italian clinic door with frosted sidelight on back wall
  const doorMat = new THREE.MeshStandardMaterial({ color: '#8f6544', roughness: 0.62 });
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: '#644831', roughness: 0.58 });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.16, 0.04), doorFrameMat);
  doorFrame.position.set(0.88, 1.08, bounds.maxZ - 0.02);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.10, 0.03), doorMat);
  doorLeaf.position.set(0.88, 1.05, bounds.maxZ - 0.03);
  const doorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.88),
    new THREE.MeshStandardMaterial({ color: '#dce8f0', roughness: 0.25 })
  );
  doorGlass.position.set(1.06, 1.44, bounds.maxZ - 0.046);
  doorGlass.rotation.y = Math.PI;
  const doorHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.018, 0.05),
    new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.8, roughness: 0.22 })
  );
  doorHandle.position.set(0.54, 1.02, bounds.maxZ - 0.06);
  scene.add(doorFrame, addFocusMesh(doorLeaf), doorGlass, doorHandle);

  // --- RIGHT DIAGNOSTIC WALL (X = +2.20, facing -X): Walk-up Ishihara 4-Plate Panel & Amsler Reference ---

  const wallIshiharaTex = createIshiharaPanelTexture({ isHandheld: false });
  const wallIshiharaFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.65, 0.65),
    new THREE.MeshStandardMaterial({ color: '#2b313a', roughness: 0.55 })
  );
  wallIshiharaFrame.position.set(bounds.maxX - 0.016, 1.32, -0.55);
  const wallIshiharaFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshStandardMaterial({ map: wallIshiharaTex, roughness: 0.82 })
  );
  wallIshiharaFace.position.set(bounds.maxX - 0.032, 1.32, -0.55);
  wallIshiharaFace.rotation.y = -Math.PI / 2;
  scene.add(wallIshiharaFrame, addFocusMesh(wallIshiharaFace));

  const wallAmslerTex = createAmslerTexture({ isHandheld: false });
  const wallAmslerFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.59, 0.59),
    new THREE.MeshStandardMaterial({ color: '#2b313a', roughness: 0.55 })
  );
  wallAmslerFrame.position.set(bounds.maxX - 0.016, 1.32, 0.35);
  const wallAmslerFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.56),
    new THREE.MeshStandardMaterial({ map: wallAmslerTex, roughness: 0.88 })
  );
  wallAmslerFace.position.set(bounds.maxX - 0.032, 1.32, 0.35);
  wallAmslerFace.rotation.y = -Math.PI / 2;
  scene.add(wallAmslerFrame, addFocusMesh(wallAmslerFace));

  // --- EXAM CHAIR, CLINICAL SIDE TRAY & PICKABLE NEAR DIAGNOSTIC CARDS ---

  const examChair = buildExamChair();
  examChair.position.set(0, 0, SEATED_EYE_Z + 0.07);
  scene.add(addFocusMesh(examChair));
  colliders.push({ minX: -0.36, maxX: 0.36, minZ: SEATED_EYE_Z - 0.34, maxZ: SEATED_EYE_Z + 0.44 });

  // Clinical side tray table to the patient's right (easy reach while seated or standing)
  const trayX = 0.58;
  const trayZ = 1.46;
  const trayTopY = 0.82;
  const trayGroup = new THREE.Group();
  const trayTopMat = new THREE.MeshStandardMaterial({ color: '#eef2f5', roughness: 0.58 });
  const trayLegMat = new THREE.MeshStandardMaterial({ color: '#9ea8b3', metalness: 0.65, roughness: 0.28 });

  const trayTop = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.024, 0.44), trayTopMat);
  trayTop.position.set(trayX, trayTopY - 0.012, trayZ);
  trayTop.castShadow = true;
  trayTop.receiveShadow = true;

  const trayStem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, trayTopY - 0.05, 14), trayLegMat);
  trayStem.position.set(trayX, (trayTopY - 0.05) * 0.5 + 0.04, trayZ);
  trayStem.castShadow = true;

  const trayBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 18), trayLegMat);
  trayBase.position.set(trayX, 0.02, trayZ);

  // Decorative black trial-lens box & hand occluder paddle on back edge of tray
  const lensBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.032, 0.11),
    new THREE.MeshStandardMaterial({ color: '#252a32', roughness: 0.55 })
  );
  lensBox.position.set(trayX + 0.14, trayTopY + 0.016, trayZ - 0.13);
  lensBox.castShadow = true;

  trayGroup.add(trayTop, trayStem, trayBase, lensBox);
  scene.add(addFocusMesh(trayGroup));
  colliders.push({ minX: trayX - 0.29, maxX: trayX + 0.29, minZ: trayZ - 0.24, maxZ: trayZ + 0.24 });

  // Clinician rolling stool tucked in back-right corner
  const stool = buildClinicianStool();
  stool.position.set(1.38, 0, 2.35);
  scene.add(addFocusMesh(stool));
  colliders.push({ minX: 1.12, maxX: 1.64, minZ: 2.09, maxZ: 2.61 });

  // Low clinical supply cabinet along back wall
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.50, 0.86, 0.44),
    new THREE.MeshStandardMaterial({ color: '#e6eaee', roughness: 0.65 })
  );
  cabinet.position.set(-0.95, 0.43, bounds.maxZ - 0.24);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  scene.add(addFocusMesh(cabinet));
  colliders.push({ minX: -1.72, maxX: -0.18, minZ: bounds.maxZ - 0.48, maxZ: bounds.maxZ });

  // Pickable handheld clinical cards resting flat on the side tray (+Y face printed)
  const cardBackMat = new THREE.MeshStandardMaterial({ color: '#d7dce2', roughness: 0.82 });
  const cardEdgeMat = new THREE.MeshStandardMaterial({ color: '#b7c0ca', roughness: 0.78 });

  function createPickableCard({ id, width, height, texture, restPos, rotY = 0, defaultHoldZ = 0.35 }) {
    const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.90 });
    const mats = [cardEdgeMat, cardEdgeMat, faceMat, cardBackMat, cardEdgeMat, cardEdgeMat];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, height), mats);
    mesh.position.copy(restPos);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    scene.add(addFocusMesh(mesh));
    return {
      id,
      mesh,
      restPosition: restPos.clone(),
      restQuaternion: mesh.quaternion.clone(),
      occluderRadius: Math.max(width, height) * 0.45,
      halfDepth: 0.032,
      defaultHoldZ,
    };
  }

  const pickables = [
    createPickableCard({
      id: 'jaeger_card',
      width: 0.115,
      height: 0.18,
      texture: createJaegerCardTexture(0.115, 0.18),
      restPos: new THREE.Vector3(trayX - 0.15, trayTopY + 0.003, trayZ + 0.06),
      rotY: -0.12,
      defaultHoldZ: 0.35,
    }),
    createPickableCard({
      id: 'amsler_card',
      width: 0.13,
      height: 0.16,
      texture: createAmslerTexture({ isHandheld: true, cardW: 0.13, cardH: 0.16 }),
      restPos: new THREE.Vector3(trayX + 0.01, trayTopY + 0.003, trayZ + 0.08),
      rotY: 0.05,
      defaultHoldZ: 0.30,
    }),
    createPickableCard({
      id: 'ishihara_card',
      width: 0.15,
      height: 0.15,
      texture: createIshiharaPanelTexture({ isHandheld: true }),
      restPos: new THREE.Vector3(trayX + 0.16, trayTopY + 0.003, trayZ + 0.08),
      rotY: 0.16,
      defaultHoldZ: 0.42,
    }),
  ];

  // Anchor poses
  const deskPos = new THREE.Vector3(trayX, trayTopY, trayZ);
  const seatPose = {
    position: new THREE.Vector3(0.0, SEATED_EYE_Y, SEATED_EYE_Z),
    yaw: 0.0,
    pitch: 0.0,
  };
  const standPose = {
    position: new THREE.Vector3(-0.88, 1.50, 0.75),
    yaw: -0.26,
    pitch: -0.04,
  };

  const playerShadow = createPlayerShadowCaster(scene);

  // Reusable zero-GC update scratch objects
  let heldLiftY = 0;
  let envRayFrame = 0;
  let cachedEnvOcclOD = 0;
  let cachedEnvOcclOS = 0;
  let lastTimeOfDay = null;
  let lastLightsOn = null;
  let lastGlareOn = null;
  let lastSkyTod = 'sunny';
  const artHemiSky = new THREE.Color('#eef4fb');
  const artHemiGround = new THREE.Color('#99a3ae');
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
  // Rotate card +Y top face directly toward viewer (+Z camera local) with upright reading orientation
  const cardTiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.5, 0, 0));
  const heldRotEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const heldRotQuat = new THREE.Quaternion();
  const trayBounds = {
    minX: trayX - 0.27,
    maxX: trayX + 0.27,
    y: trayTopY,
    minZ: trayZ - 0.22,
    maxZ: trayZ + 0.22,
  };

  function updateScene(dt, state, camera) {
    if (!camera) return;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);
    playerShadow.update(state, camera);

    const todId = TIME_OF_DAY_PRESETS[state.timeOfDay] ? state.timeOfDay : 'sunny';
    const lightsOn = state.lightsOn !== false;
    const glareOn = state.glareLightOn !== false;
    const todPreset = TIME_OF_DAY_PRESETS[todId];

    if (todId !== lastTimeOfDay || lightsOn !== lastLightsOn) {
      lastTimeOfDay = todId;
      lastLightsOn = lightsOn;
      scene.background.set(todPreset.skyBg);
      if (todId !== lastSkyTod) {
        lastSkyTod = todId;
        paintSkyGradient(todPreset.skyTop, todPreset.skyPlane);
      }
      skyPlane.material.color.setScalar(todPreset.skyGain * 0.8);

      const artHemiInt = lightsOn ? 0.58 : 0.04;
      const outdoorHemi = todPreset.hemiInt * 0.55;
      const totalHemi = outdoorHemi + artHemiInt;
      const artFrac = totalHemi > 0 ? artHemiInt / totalHemi : 0.0;
      hemiLight.color.set(todPreset.hemiSky).lerp(artHemiSky, artFrac);
      hemiLight.groundColor.set(todPreset.hemiGround).lerp(artHemiGround, artFrac);
      hemiLight.intensity = totalHemi;

      sunLight.color.set(todPreset.sunColor);
      sunLight.intensity = todPreset.sunInt * 0.45;
      sunLight.position.set(todPreset.sunPos[0] * 0.75, todPreset.sunPos[1], todPreset.sunPos[2]);

      windowLight.color.set(todPreset.winColor);
      windowLight.intensity = todPreset.winInt * 0.55;

      ceilLight.intensity = lightsOn ? 1.05 : 0.0;
      for (const pl of ledLights) {
        pl.intensity = lightsOn ? 1.15 : 0.0;
      }
      ledPanelMat.emissiveIntensity = lightsOn ? 2.0 : 0.0;
      // Backlit ETDRS lightbox stays photopic & glare-free (strictly below dark HOA floor 1.05) even when room lights are OFF
      etdrsFaceMat.emissiveIntensity = lightsOn ? 0.42 : 0.72;
      scene.environmentIntensity = 0.04 + todPreset.outdoorLux * 0.16 + (lightsOn ? 0.22 : 0.0);
    }

    if (glareOn !== lastGlareOn) {
      lastGlareOn = glareOn;
      glareCoreMat.emissiveIntensity = glareOn ? 10.0 : 0.0;
      glareCoreMat.color.set(glareOn ? '#ffffff' : '#2a2f38');
      glareHalo.visible = glareOn;
      glarePointLight.intensity = glareOn ? 0.38 : 0.0;
    }

    const winAlign = Math.max(0, forward.dot(windowLightDir));
    const ceilAlign = Math.max(0, forward.y);
    const ceilFlux = lightsOn ? 0.56 : 0.0;
    state.eyelidLight = Math.min(
      1,
      Math.max(0.02, 0.03 + todPreset.outdoorLux * 0.55 * (0.14 + winAlign * 0.65) + ceilFlux * (0.10 + ceilAlign * 0.48))
    );

    // Move held diagnostic card into camera-relative reading space
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
        heldEntry.mesh.quaternion.copy(camera.quaternion).multiply(heldRotQuat).multiply(cardTiltQuat);
        heldEntry.mesh.updateMatrixWorld(true);

        heldBox.setFromObject(heldEntry.mesh);
        const overTray =
          heldBox.max.x >= trayBounds.minX &&
          heldBox.min.x <= trayBounds.maxX &&
          heldBox.max.z >= trayBounds.minZ &&
          heldBox.min.z <= trayBounds.maxZ;
        const minSurfaceY = trayBounds.y + 0.010;
        const reqLift = overTray && heldBox.min.y < minSurfaceY ? minSurfaceY - heldBox.min.y : 0;
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

    eyeOD.copy(localEyeOD).applyMatrix4(camera.matrixWorld);
    eyeOS.copy(localEyeOS).applyMatrix4(camera.matrixWorld);

    let occlOD = 0;
    let occlOS = 0;

    if (heldEntry) {
      const r = heldEntry.occluderRadius;
      const evalHeldOccl = (eyePos, maxLat) => {
        toTarget.copy(heldWorldPos).sub(eyePos);
        const depthAlongRay = toTarget.dot(forward);
        if (depthAlongRay <= 0.01) return 0;
        const distSq = toTarget.lengthSq();
        const lateralDist = Math.sqrt(Math.max(0, distSq - depthAlongRay * depthAlongRay));
        if (lateralDist > maxLat) return 0;
        return computeOcclusionFromDistance(Math.max(0.01, Math.sqrt(distSq) - r * 0.45));
      };
      const domIsOS = state.settings?.dominantEye === 'OS';
      occlOD = Math.max(occlOD, evalHeldOccl(eyeOD, domIsOS ? 0.038 : 0.055));
      occlOS = Math.max(occlOS, evalHeldOccl(eyeOS, domIsOS ? 0.055 : 0.038));
    }

    if (state.eyelidClose <= 0.8 && !state.compareNormal) {
      if (envRayFrame % 2 === 0) {
        const heldRoot = heldEntry?.mesh || null;
        const isHeldObj = (obj) => {
          let cur = obj;
          while (cur) {
            if (cur === heldRoot) return true;
            cur = cur.parent;
          }
          return false;
        };
        const evalEyeRayOccl = (eyePos) => {
          raycaster.set(eyePos, forward);
          raycaster.near = 0.01;
          raycaster.far = 0.25;
          const eyeHits = raycaster.intersectObjects(focusTargets, true);
          for (let i = 0; i < eyeHits.length; i += 1) {
            if (!heldRoot || !isHeldObj(eyeHits[i].object)) {
              return computeOcclusionFromDistance(eyeHits[i].distance);
            }
          }
          return 0;
        };
        cachedEnvOcclOD = evalEyeRayOccl(eyeOD);
        cachedEnvOcclOS = evalEyeRayOccl(eyeOS);
      }
      envRayFrame += 1;
      occlOD = Math.max(occlOD, cachedEnvOcclOD);
      occlOS = Math.max(occlOS, cachedEnvOcclOS);
    } else {
      cachedEnvOcclOD = 0;
      cachedEnvOcclOS = 0;
    }

    state.occlOD = occlOD;
    state.occlOS = occlOS;

    if (state.eyelidClose > 0.8) {
      state.focusDistM = 0;
      return;
    }
    const domEye = state.settings?.dominantEye === 'OS' ? eyeOS : eyeOD;
    const domX = state.settings?.dominantEye === 'OS' ? -0.029 : 0.029;
    if (
      heldEntry &&
      state.heldOffset.z <= 0.50 &&
      Math.abs(state.heldOffset.x - domX) < 0.16 &&
      state.heldOffset.y < 0.08
    ) {
      state.focusDistM = Math.min(20.0, Math.max(0.04, domEye.distanceTo(heldWorldPos)));
      return;
    }
    raycaster.set(camera.position, forward);
    raycaster.near = 0.02;
    raycaster.far = 20.0;
    const hits = raycaster.intersectObjects(focusTargets, true);
    if (hits.length > 0) {
      state.focusDistM = Math.min(20.0, Math.max(0.04, hits[0].distance));
    } else {
      state.focusDistM = EXAM_VIEW_DISTANCE_M;
    }
  }

  function dispose() {
    const geos = new Set();
    const mats = new Set();
    const texs = new Set([skyTex]);
    const mapKeys = ['map', 'roughnessMap', 'metalnessMap', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap'];
    scene.traverse((obj) => {
      if (obj.geometry) geos.add(obj.geometry);
      if (!obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of list) {
        if (!mat) continue;
        mats.add(mat);
        for (const key of mapKeys) {
          if (mat[key]?.dispose) texs.add(mat[key]);
        }
      }
    });
    for (const g of geos) g.dispose();
    for (const t of texs) t.dispose();
    for (const m of mats) m.dispose();
    envRT?.dispose();
    scene.environment = null;
    scene.background = null;
  }

  return {
    id: 'exam_room',
    defaultMode: 'seated',
    bounds,
    scene,
    deskPos,
    seatPose,
    standPose,
    pickables,
    colliders,
    updateScene,
    dispose,
  };
}
