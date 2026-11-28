import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeOcclusionFromDistance, TIME_OF_DAY_PRESETS } from '../state.js';
import {
  CAR_CRUISE_SPEED_MPS,
  CAR_FAR_CLIP,
  FRIULI_ROUTE_SIGNS,
  ONCOMING_CLOSING_SPEED_MPS,
  ROAD_LOOP_LEN_M,
  computeLeadCarZ,
  computeRoadHeadingRad,
  computeRoadLighting,
  computeRoadRelativeOffset,
  computeSteeringWheelAngle,
  wrapLoopZ,
} from './car_math.js';
import {
  createCenterConsoleTexture,
  createInstrumentClusterTexture,
  createRoadAsphaltTexture,
  createRoadSignTexture,
  createRoadsideGroundTexture,
  createWetStreakTexture,
  paintMountainHorizonCanvas,
} from './car_assets.js';

// shortcut: procedural cabin/traffic/Friulian landscape geometry + additive wet-road speculars (no SSR/glTF), upgrade if custom vehicle models are added

function createWetStreakRibbon(width, length, segZ, tex, colorHex) {
  const geo = new THREE.PlaneGeometry(width, length, 1, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const count = pos.count;
  const baseX = new Float32Array(count);
  const baseZ = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    baseX[i] = pos.getX(i);
    baseZ[i] = pos.getZ(i);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: colorHex,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, geo, mat, baseX, baseZ };
}

function updateWetStreakRibbon(ribbon, lateralX, centerZ, travelDist, opacity, fogFar = 108.0) {
  const fadeEnd = fogFar - 2.0;
  const distFade = Math.min(1, Math.max(0, (fadeEnd + centerZ) / 28.0));
  const effOp = opacity * distFade;
  const show = effOp > 0.002 && centerZ > -fadeEnd && centerZ < 14.0;
  ribbon.mesh.visible = show;
  if (!show) return;
  ribbon.mat.opacity = effOp;
  const { geo, baseX, baseZ } = ribbon;
  const pos = geo.attributes.position;
  const count = pos.count;
  let lastZ = Infinity;
  let cachedDx = 0;
  let cachedDy = 0;
  for (let i = 0; i < count; i += 1) {
    const wz = centerZ + baseZ[i];
    if (wz !== lastZ) {
      lastZ = wz;
      const off = computeRoadRelativeOffset(wz, travelDist);
      cachedDx = off.dx;
      cachedDy = off.dy;
    }
    pos.setXYZ(i, lateralX + baseX[i] + cachedDx, cachedDy + 0.035, wz);
  }
  pos.needsUpdate = true;
}

function computeEmbankmentY(lateralX) {
  if (lateralX > 3.2) return -0.04 + (lateralX - 3.2) * 0.045;
  if (lateralX < -7.2) return -0.04 + (-7.2 - lateralX) * 0.035;
  return 0;
}

function buildTrafficVehicle({
  bodyColor,
  kind = 'sedan',
  facingViewer,
  headlightMat,
  headlightHaloMat,
  taillightMat,
  wetHeadTex,
  wetTailTex,
  shared,
  scene,
}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.36, metalness: 0.40 });
  const { trimMat, glassMat, wheelMat, wheelGeo, plateMat } = shared;

  const isVan = kind === 'van';
  const isHatch = kind === 'hatch';
  const length = isVan ? 4.65 : isHatch ? 3.80 : 4.25;
  const width = isVan ? 1.88 : 1.72;
  const halfL = length * 0.5;

  const lower = new THREE.Mesh(new THREE.BoxGeometry(width, isVan ? 0.66 : 0.54, length), bodyMat);
  lower.position.y = isVan ? 0.58 : 0.52;
  lower.castShadow = true;
  lower.receiveShadow = false;
  group.add(lower);

  if (isVan) {
    // Tall Italian commercial van (furgone) with steep windshield & higher headlights
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(width - 0.06, 1.15, length * 0.76), bodyMat);
    cargo.position.set(0, 1.44, facingViewer ? -0.34 : 0.34);
    cargo.castShadow = true;
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.56, 0.05), glassMat);
    cabGlass.position.set(0, 1.24, facingViewer ? halfL - 0.78 : -(halfL - 0.78));
    cabGlass.rotation.x = facingViewer ? -0.22 : 0.22;
    group.add(cargo, cabGlass);
  } else {
    const cabinLen = isHatch ? 2.15 : 2.00;
    const cabinZ = facingViewer ? (isHatch ? -0.26 : -0.10) : isHatch ? 0.26 : 0.10;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(width - 0.24, 0.52, cabinLen), bodyMat);
    cabin.position.set(0, 1.03, cabinZ);
    cabin.castShadow = true;

    const windFront = new THREE.Mesh(new THREE.BoxGeometry(width - 0.32, 0.42, 0.04), glassMat);
    windFront.position.set(0, 1.01, cabinZ + (facingViewer ? cabinLen * 0.5 + 0.075 : -(cabinLen * 0.5 + 0.075)));
    windFront.rotation.x = facingViewer ? -0.34 : 0.34;

    const windRear = new THREE.Mesh(new THREE.BoxGeometry(width - 0.34, 0.40, 0.04), glassMat);
    windRear.position.set(0, 1.01, cabinZ + (facingViewer ? -(cabinLen * 0.5 + 0.06) : cabinLen * 0.5 + 0.06));
    windRear.rotation.x = facingViewer ? 0.28 : -0.28;

    group.add(cabin, windFront, windRear);
  }

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.18, 0.16), trimMat);
  bumperF.position.set(0, 0.34, halfL - 0.02);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.18, 0.16), trimMat);
  bumperR.position.set(0, 0.34, -(halfL - 0.02));
  group.add(bumperF, bumperR);

  const wheelZ = halfL - 0.78;
  for (const wx of [-(width * 0.47), width * 0.47]) {
    for (const wz of [-wheelZ, wheelZ]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.28, wz);
      group.add(w);
    }
  }

  const wetRibbons = [];
  const halos = [];
  const lampY = isVan ? 0.78 : 0.60;
  const lampX = width * 0.35;

  if (facingViewer) {
    const headZ = halfL + 0.02;
    for (const lx of [-lampX, lampX]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.04), headlightMat);
      lamp.position.set(lx, lampY, headZ);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), headlightHaloMat);
      halo.position.set(lx, lampY, headZ + 0.06);
      halo.visible = false;
      group.add(lamp, halo);
      halos.push(halo);

      const ribbon = createWetStreakRibbon(0.95, 8.5, 6, wetHeadTex, '#fff2d8');
      scene.add(ribbon.mesh);
      wetRibbons.push({ ribbon, lx, zOffset: headZ + 4.3 });
    }
  } else {
    const tailZ = halfL + 0.02;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), plateMat);
    plate.position.set(0, 0.50, tailZ + 0.01);
    group.add(plate);

    for (const lx of [-lampX, lampX]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.04), taillightMat);
      lamp.position.set(lx, 0.62, tailZ);
      group.add(lamp);

      const ribbon = createWetStreakRibbon(0.85, 7.2, 6, wetTailTex, '#ff2b1a');
      scene.add(ribbon.mesh);
      wetRibbons.push({ ribbon, lx, zOffset: tailZ + 3.6 });
    }
  }

  return { group, wetRibbons, halos };
}

function buildFriulianHouse(plasterColor, windowMat) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: plasterColor, roughness: 0.88 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#8f442b', roughness: 0.82 });
  const shutterMat = new THREE.MeshStandardMaterial({ color: '#2b4a3c', roughness: 0.78 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.2, 6.8), wallMat);
  body.position.y = 2.6;
  body.castShadow = true;
  body.receiveShadow = true;

  // Classic Friulian pitched terracotta roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.5, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.06, 1.0, 0.88);
  roof.position.y = 6.4;
  roof.castShadow = true;

  group.add(body, roof);

  // Two rows of shuttered windows on road-facing facade
  for (const wy of [1.8, 3.85]) {
    for (const wx of [-2.4, 0.0, 2.4]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.08), windowMat);
      win.position.set(wx, wy, 3.42);
      const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.10, 0.05), shutterMat);
      shutterL.position.set(wx - 0.56, wy, 3.43);
      const shutterR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.10, 0.05), shutterMat);
      shutterR.position.set(wx + 0.56, wy, 3.43);
      group.add(win, shutterL, shutterR);
    }
  }
  return group;
}

function buildCabinInterior(dashTex, consoleTex, addFocusMesh) {
  const cabin = new THREE.Group();
  const dashMat = new THREE.MeshStandardMaterial({ color: '#1f2329', roughness: 0.84 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.78 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#383d44', roughness: 0.86 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#45494e', roughness: 0.92 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: '#2b445e', roughness: 0.34, metalness: 0.45 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#aeb7c2', metalness: 0.75, roughness: 0.25 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#c6997a', roughness: 0.78 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: '#27313d', roughness: 0.88 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#2f241c', roughness: 0.9 });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: '#7b8c9d', metalness: 0.86, roughness: 0.14 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#33373f', roughness: 0.90 });
  // CRITICAL: transparent glass MUST have depthWrite: false so tDepthOD reads true outdoor road/traffic distances!
  // MeshBasicMaterial avoids artificial floating PointLight specular dots on windshield & saves full-screen PBR cost.
  const glassMat = new THREE.MeshBasicMaterial({
    color: '#c9dff0',
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
  });

  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 2.30), dashMat);
  floorPan.position.set(0, 0.32, 0.42);

  const dashUpper = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 0.46), dashMat);
  dashUpper.position.set(0, 0.87, -0.52);
  dashUpper.receiveShadow = true;

  const dashFront = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.36, 0.28), trimMat);
  dashFront.position.set(0, 0.66, -0.44);

  // Passenger glovebox recess & latch
  const gloveLid = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.20, 0.02), dashMat);
  gloveLid.position.set(0.42, 0.66, -0.295);
  const gloveLatch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.026), trimMat);
  gloveLatch.position.set(0.42, 0.73, -0.288);

  // Lower center gearshift tunnel + visible upper center-stack 90s cassette stereo & HVAC panel
  const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.56), dashMat);
  centerConsole.position.set(0, 0.44, -0.14);
  const consoleFaceMat = new THREE.MeshStandardMaterial({
    map: consoleTex,
    emissiveMap: consoleTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.18,
    roughness: 0.45,
  });
  const consoleFace = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.19), consoleFaceMat);
  consoleFace.position.set(0, 0.70, -0.282);
  consoleFace.rotation.x = -0.16;

  const gearStick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.18, 8), trimMat);
  gearStick.position.set(0, 0.60, -0.06);
  gearStick.rotation.x = 0.18;
  const gearKnob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), dashMat);
  gearKnob.position.set(0, 0.69, -0.04);

  // Driver instrument binnacle (left side, X = -0.36; face sits cleanly in front of z = -0.34 front face)
  const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.24), dashMat);
  binnacle.position.set(-0.36, 0.97, -0.46);
  const dashFaceMat = new THREE.MeshStandardMaterial({
    map: dashTex,
    emissiveMap: dashTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.2,
    roughness: 0.35,
  });
  const dashFace = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.12), dashFaceMat);
  dashFace.position.set(-0.36, 0.96, -0.324);
  dashFace.rotation.x = -0.18;

  // Turning steering wheel pivot with driver's hands gripping at 9 & 3 o'clock!
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(-0.36, 0.92, -0.18);
  wheelPivot.rotation.x = -0.34;
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.018, 10, 24), dashMat);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), trimMat);
  wheelHub.rotation.x = Math.PI * 0.5;
  const wheelSpokeH = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.026, 0.018), trimMat);
  const wheelSpokeV = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.15, 0.018), trimMat);
  wheelSpokeV.position.y = -0.085;
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skinMat);
  handL.scale.set(0.95, 1.15, 0.85);
  handL.position.set(-0.172, 0.02, 0.015);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skinMat);
  handR.scale.set(0.95, 1.15, 0.85);
  handR.position.set(0.172, 0.02, 0.015);
  wheelPivot.add(wheelRim, wheelHub, wheelSpokeH, wheelSpokeV, handL, handR);

  // Driver torso, forearms, and head on left (X = -0.38)
  const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.22), jacketMat);
  driverTorso.position.set(-0.38, 0.92, 0.18);
  const driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), skinMat);
  driverHead.position.set(-0.38, 1.22, 0.18);
  const driverHair = new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  driverHair.position.set(-0.38, 1.23, 0.19);
  for (const ax of [-0.15, 0.15]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.36, 8), jacketMat);
    arm.position.set(-0.37 + ax, 0.93, 0.0);
    arm.rotation.x = Math.PI * 0.46;
    cabin.add(arm);
  }

  // Sloped left & right A-pillars framing the windshield (+0.56 tilts top backward to roof header)
  const pillarGeo = new THREE.BoxGeometry(0.075, 0.74, 0.085);
  const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
  pillarL.position.set(-0.73, 1.18, -0.46);
  pillarL.rotation.x = 0.56;
  const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
  pillarR.position.set(0.73, 1.18, -0.46);
  pillarR.rotation.x = 0.56;

  // Roof headliner & windshield upper header
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.06, 1.88), roofMat);
  roof.position.set(0, 1.49, 0.67);
  roof.castShadow = true;
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.14), roofMat);
  header.position.set(0, 1.47, -0.25);
  header.castShadow = true;
  const rearHeader = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.14), roofMat);
  rearHeader.position.set(0, 1.46, 1.54);

  // B-pillars & sloped C-pillars enclosing rear cabin
  const bPillarGeo = new THREE.BoxGeometry(0.08, 0.64, 0.10);
  const bPillarL = new THREE.Mesh(bPillarGeo, pillarMat);
  bPillarL.position.set(-0.74, 1.18, 0.56);
  const bPillarR = new THREE.Mesh(bPillarGeo, pillarMat);
  bPillarR.position.set(0.74, 1.18, 0.56);
  const cPillarGeo = new THREE.BoxGeometry(0.09, 0.64, 0.14);
  const cPillarL = new THREE.Mesh(cPillarGeo, pillarMat);
  cPillarL.position.set(-0.73, 1.18, 1.46);
  cPillarL.rotation.x = -0.34;
  const cPillarR = new THREE.Mesh(cPillarGeo, pillarMat);
  cPillarR.position.set(0.73, 1.18, 1.46);
  cPillarR.rotation.x = -0.34;

  // Front seatbacks + headrests (clear of passenger camera pan maxZ = 0.28) & rear bench/parcel shelf/bulkhead
  const seatBackGeo = new THREE.BoxGeometry(0.46, 0.58, 0.10);
  const headrestGeo = new THREE.BoxGeometry(0.22, 0.16, 0.08);
  const driverSeatBack = new THREE.Mesh(seatBackGeo, seatMat);
  driverSeatBack.position.set(-0.38, 0.84, 0.36);
  driverSeatBack.rotation.x = -0.10;
  const driverHeadrest = new THREE.Mesh(headrestGeo, seatMat);
  driverHeadrest.position.set(-0.38, 1.22, 0.39);
  const passSeatBack = new THREE.Mesh(seatBackGeo, seatMat);
  passSeatBack.position.set(0.36, 0.84, 0.42);
  passSeatBack.rotation.x = -0.10;
  const passHeadrest = new THREE.Mesh(headrestGeo, seatMat);
  passHeadrest.position.set(0.36, 1.22, 0.45);

  const rearBench = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.18, 0.48), seatMat);
  rearBench.position.set(0, 0.48, 1.02);
  const rearSeatBack = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 0.14), seatMat);
  rearSeatBack.position.set(0, 0.80, 1.28);
  rearSeatBack.rotation.x = -0.16;
  const parcelShelf = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.05, 0.34), dashMat);
  parcelShelf.position.set(0, 1.02, 1.44);
  const rearBulkhead = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.72, 0.08), trimMat);
  rearBulkhead.position.set(0, 0.68, 1.56);

  // Interior rearview mirror
  const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), dashMat);
  mirrorStem.position.set(0, 1.41, -0.34);
  const mirrorCase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.065, 0.025), dashMat);
  mirrorCase.position.set(0, 1.36, -0.34);
  const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.052), mirrorMat);
  mirrorGlass.position.set(0, 1.36, -0.326);

  // Full-length side door panels (front + rear doors)
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.58, 2.05), trimMat);
  doorR.position.set(0.76, 0.62, 0.53);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.58, 2.05), trimMat);
  doorL.position.set(-0.76, 0.62, 0.53);

  // Right exterior passenger side mirror
  const sideMirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.05), dashMat);
  sideMirrorArm.position.set(0.84, 0.94, -0.38);
  const sideMirrorCase = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.07), hoodMat);
  sideMirrorCase.position.set(0.95, 0.96, -0.38);
  sideMirrorCase.rotation.y = -0.18;
  const sideMirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.088), mirrorMat);
  sideMirrorGlass.position.set(0.95, 0.96, -0.342);
  sideMirrorGlass.rotation.y = -0.18;

  // Metallic car hood + resting wipers
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.24), hoodMat);
  hood.position.set(0, 0.81, -1.32);
  hood.rotation.x = 0.05;
  hood.receiveShadow = true;

  const wiper1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.018), dashMat);
  wiper1.position.set(-0.26, 0.89, -0.68);
  wiper1.rotation.z = 0.06;
  const wiper2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.018), dashMat);
  wiper2.position.set(0.28, 0.89, -0.67);
  wiper2.rotation.z = 0.05;

  // depthWrite: false transparent windshield & side glass
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.72), glassMat);
  windshield.position.set(0, 1.18, -0.46);
  windshield.rotation.x = 0.56;
  const sideWindowR = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.56), glassMat);
  sideWindowR.position.set(0.75, 1.19, 0.10);
  sideWindowR.rotation.y = -Math.PI / 2;

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.09), chromeMat);
  handle.position.set(0.71, 0.80, -0.06);

  cabin.add(
    floorPan,
    addFocusMesh(dashUpper),
    addFocusMesh(dashFront),
    gloveLid,
    gloveLatch,
    centerConsole,
    consoleFace,
    gearStick,
    gearKnob,
    binnacle,
    dashFace,
    wheelPivot,
    driverTorso,
    driverHead,
    driverHair,
    addFocusMesh(pillarL),
    addFocusMesh(pillarR),
    roof,
    header,
    rearHeader,
    bPillarL,
    bPillarR,
    cPillarL,
    cPillarR,
    driverSeatBack,
    driverHeadrest,
    passSeatBack,
    passHeadrest,
    rearBench,
    rearSeatBack,
    parcelShelf,
    rearBulkhead,
    mirrorStem,
    mirrorCase,
    mirrorGlass,
    addFocusMesh(doorR),
    doorL,
    sideMirrorArm,
    sideMirrorCase,
    sideMirrorGlass,
    addFocusMesh(hood),
    wiper1,
    wiper2,
    windshield,
    sideWindowR,
    handle
  );

  return { cabin, wheelPivot, dashFaceMat, consoleFaceMat, mirrorMat, glassMat };
}

function buildTree(variant, shared) {
  const group = new THREE.Group();
  if (variant === 0) {
    const trunk = new THREE.Mesh(shared.trunkGeo0, shared.trunkMat);
    trunk.position.y = 0.8;
    const foliage = new THREE.Mesh(shared.foliageGeo0, shared.pineMat0);
    foliage.position.y = 4.4;
    foliage.castShadow = true;
    group.add(trunk, foliage);
  } else if (variant === 1) {
    const trunk = new THREE.Mesh(shared.trunkGeo1, shared.trunkMat);
    trunk.position.y = 1.0;
    const c1 = new THREE.Mesh(shared.coneGeo1a, shared.pineMat1);
    c1.position.y = 3.2;
    const c2 = new THREE.Mesh(shared.coneGeo1b, shared.pineMat1);
    c2.position.y = 4.9;
    c1.castShadow = true;
    group.add(trunk, c1, c2);
  } else {
    const trunk = new THREE.Mesh(shared.trunkGeo2, shared.trunkMat);
    trunk.position.y = 1.25;
    const crown = new THREE.Mesh(shared.crownGeo2, shared.leafMat);
    crown.position.y = 3.7;
    crown.scale.set(1.0, 0.88, 1.0);
    crown.castShadow = true;
    group.add(trunk, crown);
  }
  return group;
}

function createDeformableRibbon(width, length, segX, segZ, centerX, centerZ, ySlopeFn) {
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(centerX, 0, centerZ);
  const pos = geo.attributes.position;
  const count = pos.count;
  const baseX = new Float32Array(count);
  const baseY = new Float32Array(count);
  const baseZ = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const bx = pos.getX(i);
    const bz = pos.getZ(i);
    const by = ySlopeFn ? ySlopeFn(bx) : 0;
    baseX[i] = bx;
    baseY[i] = by;
    baseZ[i] = bz;
    pos.setY(i, by);
  }
  return { geo, baseX, baseY, baseZ };
}

function deformRibbon(ribbon, travelDist) {
  const { geo, baseX, baseY, baseZ } = ribbon;
  const pos = geo.attributes.position;
  const count = pos.count;
  let lastZ = Infinity;
  let cachedDx = 0;
  let cachedDy = 0;
  for (let i = 0; i < count; i += 1) {
    const bz = baseZ[i];
    if (bz !== lastZ) {
      lastZ = bz;
      const off = computeRoadRelativeOffset(bz, travelDist);
      cachedDx = off.dx;
      cachedDy = off.dy;
    }
    pos.setXYZ(i, baseX[i] + cachedDx, baseY[i] + cachedDy, bz);
  }
  pos.needsUpdate = true;
}

/**
 * Build P4 Car Passenger Scene: Friuli moraine-hills road (Udine -> Fagagna -> San Daniele del Friuli)
 * with curving & rolling 3D road, Julian Prealps horizon, coherent signage, wet-road HDR glare, and traffic.
 */
export function createCarPassengerScene(renderer = null) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b9d6ef');
  scene.fog = new THREE.Fog('#b9d6ef', 56, 136);

  let envRT = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.28;
    roomEnv.dispose();
    pmrem.dispose();
  }

  const focusTargets = [];
  const addFocusMesh = (mesh) => {
    focusTargets.push(mesh);
    return mesh;
  };

  // --- SKY DOME, ROTATING JULIAN PREALPS HORIZON RING & HDR SUN ---
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 128;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const paintSky = (topHex, midHex, horizonHex) => {
    const g = skyCtx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, topHex);
    g.addColorStop(0.45, midHex);
    g.addColorStop(0.56, horizonHex);
    g.addColorStop(1.0, horizonHex);
    skyCtx.fillStyle = g;
    skyCtx.fillRect(0, 0, 4, 128);
    skyTex.needsUpdate = true;
  };
  paintSky('#357bd1', '#86bbea', '#e5eef8');

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(132, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  skyDome.renderOrder = -3;
  scene.add(skyDome);

  const horizonPivot = new THREE.Group();
  scene.add(horizonPivot);

  const sunDiskMat = new THREE.MeshStandardMaterial({
    color: '#fffef5',
    emissive: '#fff4d4',
    emissiveIntensity: 16.0,
    roughness: 0.1,
    fog: false,
    depthWrite: false,
  });
  const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12), sunDiskMat);
  sunDisk.position.set(-32, 26, -118);
  sunDisk.renderOrder = -2;
  horizonPivot.add(sunDisk);

  const mtnCanvas = document.createElement('canvas');
  mtnCanvas.width = 1024;
  mtnCanvas.height = 256;
  const mtnCtx = mtnCanvas.getContext('2d');
  const mtnTex = new THREE.CanvasTexture(mtnCanvas);
  mtnTex.colorSpace = THREE.SRGBColorSpace;
  paintMountainHorizonCanvas(mtnCtx, 1024, 256, '#3b5246', '#6b85a3', '#b9d6ef');
  mtnTex.needsUpdate = true;

  // Render mountains AFTER sunDisk (and closer at r=114 < sun r=124) so Prealps cleanly silhouette in front of setting sun
  const mountainRing = new THREE.Mesh(
    new THREE.CylinderGeometry(114, 114, 34, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: mtnTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  mountainRing.position.y = 11.5;
  mountainRing.renderOrder = -1;
  horizonPivot.add(mountainRing);

  // --- LIGHTS ---
  const hemiLight = new THREE.HemisphereLight('#d9eaff', '#5d5548', 0.9);
  scene.add(hemiLight);

  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0, 0, -24);
  scene.add(sunTarget);

  const sunLight = new THREE.DirectionalLight('#fff2dc', 2.8);
  sunLight.position.set(-22, 20, -64);
  sunLight.target = sunTarget;
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 115;
  sunLight.shadow.camera.left = -36;
  sunLight.shadow.camera.right = 36;
  sunLight.shadow.camera.top = 36;
  sunLight.shadow.camera.bottom = -36;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  scene.add(sunLight);

  const ownBeamTargets = [];
  const ownBeams = [-0.62, 0.62].map((bx) => {
    const spot = new THREE.SpotLight('#fff6e5', 0, 58, Math.PI * 0.25, 0.58, 1.32);
    spot.position.set(bx, 0.68, -1.85);
    const tgt = new THREE.Object3D();
    tgt.position.set(bx * 0.6, 0.0, -24.0);
    scene.add(tgt);
    spot.target = tgt;
    scene.add(spot);
    ownBeamTargets.push(tgt);
    return spot;
  });

  const streetPools = [0, 1].map(() => {
    const pl = new THREE.PointLight('#ffbe66', 0, 26, 1.5);
    pl.position.set(0.9, 5.5, -20);
    scene.add(pl);
    return pl;
  });
  const oncomingFlashLight = new THREE.PointLight('#fff4de', 0, 34, 1.6);
  oncomingFlashLight.position.set(-3.9, 0.85, -30);
  scene.add(oncomingFlashLight);

  // Soft overhead night cabin ambient fill (high & wide decay -> even dim cabin contours with zero dashboard hotspot)
  const dashBounceLight = new THREE.PointLight('#b6c4ba', 0, 3.2, 1.0);
  dashBounceLight.position.set(0.0, 1.32, 0.18);
  scene.add(dashBounceLight);
  const sodiumHemiSky = new THREE.Color('#ffbe66');
  const sodiumHemiGround = new THREE.Color('#3b2c1d');

  // --- CURVING & ROLLING ROAD RIBBON + FRIULIAN MORAINE EMBANKMENTS ---
  const roadTileM = 16.0;
  const roadLenM = 168.0; // spans Z: [-152, +16]
  const roadTex = createRoadAsphaltTexture(roadLenM / roadTileM);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.62, metalness: 0.04 });
  const roadRibbon = createDeformableRibbon(8.4, roadLenM, 2, 56, -1.95, -68, null);
  const roadMesh = new THREE.Mesh(roadRibbon.geo, roadMat);
  roadMesh.receiveShadow = true;
  roadMesh.frustumCulled = false;
  scene.add(addFocusMesh(roadMesh));

  const groundTex = createRoadsideGroundTexture(4, roadLenM / roadTileM);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94 });
  const groundRightRibbon = createDeformableRibbon(42, roadLenM, 2, 56, 23.25, -68, computeEmbankmentY);
  const groundRight = new THREE.Mesh(groundRightRibbon.geo, groundMat);
  groundRight.receiveShadow = true;
  groundRight.frustumCulled = false;
  const groundLeftRibbon = createDeformableRibbon(42, roadLenM, 2, 56, -27.15, -68, computeEmbankmentY);
  const groundLeft = new THREE.Mesh(groundLeftRibbon.geo, groundMat);
  groundLeft.receiveShadow = true;
  groundLeft.frustumCulled = false;
  scene.add(groundRight, groundLeft);

  // --- PASSENGER CABIN ---
  const dashTex = createInstrumentClusterTexture();
  const consoleTex = createCenterConsoleTexture();
  const { cabin, wheelPivot, dashFaceMat, consoleFaceMat, mirrorMat, glassMat } = buildCabinInterior(
    dashTex,
    consoleTex,
    addFocusMesh
  );
  scene.add(cabin);

  // --- SHARED HDR MATERIALS ---
  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fff6e0',
    emissiveIntensity: 0.6,
    roughness: 0.1,
  });
  const headlightHaloMat = new THREE.MeshBasicMaterial({
    map: createWetStreakTexture('#fff5dc'),
    color: '#fff5dc',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: '#991b1b',
    emissive: '#ff2214',
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const streetLampMat = new THREE.MeshStandardMaterial({
    color: '#d4d8de',
    emissive: '#ffbe66',
    emissiveIntensity: 0.0,
    roughness: 0.2,
  });
  const houseWindowMat = new THREE.MeshStandardMaterial({
    color: '#343c48',
    emissive: '#ffbe6b',
    emissiveIntensity: 0.0,
    roughness: 0.35,
  });
  const wetHeadTex = createWetStreakTexture('#fff2d4');
  const wetTailTex = createWetStreakTexture('#ff2414');
  const wetStreetTex = createWetStreakTexture('#ffb854');

  // --- STREETLIGHTS (12 poles spaced along the 320 m route) ---
  const poleMat = new THREE.MeshStandardMaterial({ color: '#5b6470', metalness: 0.6, roughness: 0.42 });
  const streetlights = [];
  for (let i = 0; i < 12; i += 1) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 6.2, 8), poleMat);
    pole.position.set(3.2, 3.1, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.08), poleMat);
    arm.position.set(2.05, 6.05, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), poleMat);
    head.position.set(1.05, 5.98, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.20), streetLampMat);
    bulb.position.set(1.05, 5.91, 0);

    const wetRibbon = createWetStreakRibbon(2.6, 9.5, 6, wetStreetTex, '#ffba58');
    scene.add(wetRibbon.mesh);

    group.add(pole, arm, head, bulb);
    scene.add(group);
    streetlights.push({ group, s: i * (ROAD_LOOP_LEN_M / 12), wetRibbon });
  }

  // --- COHERENT FRIULI ROUTE SIGNS & CURVE CHEVRONS ---
  const uniqueKinds = [...new Set(FRIULI_ROUTE_SIGNS.map((item) => item.kind))];
  const signTextures = Object.fromEntries(uniqueKinds.map((k) => [k, createRoadSignTexture(k)]));
  const signBackMat = new THREE.MeshStandardMaterial({ color: '#8b939c', roughness: 0.65 });
  const roadSigns = FRIULI_ROUTE_SIGNS.map((spec) => {
    const group = new THREE.Group();
    const isRound = spec.kind.startsWith('speed_');
    const isDir = spec.kind.startsWith('dir_');
    const isHamlet = spec.kind.startsWith('hamlet_');
    const isChevron = spec.kind.startsWith('chevron_');

    const postH = isChevron ? 1.30 : 2.35;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, postH, 8), poleMat);
    post.position.y = postH * 0.5;

    const faceMat = new THREE.MeshStandardMaterial({
      map: signTextures[spec.kind],
      roughness: 0.36,
      metalness: 0.08,
    });
    const signGeo = isRound
      ? new THREE.CircleGeometry(0.39, 28)
      : isChevron
        ? new THREE.PlaneGeometry(1.15, 0.44)
        : isDir
          ? new THREE.PlaneGeometry(1.68, 0.78)
          : isHamlet
            ? new THREE.PlaneGeometry(1.55, 0.64)
            : new THREE.PlaneGeometry(0.78, 0.78);
    const boardY = isChevron ? 1.18 : 2.22;
    const board = new THREE.Mesh(signGeo, faceMat);
    board.position.set(0, boardY, 0.02);
    const back = new THREE.Mesh(signGeo, signBackMat);
    back.position.set(0, boardY, -0.02);
    back.rotation.y = Math.PI;
    group.add(post, addFocusMesh(board), back);
    scene.add(group);
    return {
      group,
      s: spec.s,
      lateralX: spec.lateralX,
      yawBias: isChevron ? (spec.side === 'right' ? -0.22 : 0.22) : 0,
    };
  });

  // --- DELINEATOR POSTS (16 pairs along 320 m route) ---
  const postWhiteMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 });
  const reflectorRedMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 0.35, roughness: 0.25 });
  const reflectorWhiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#e2e8f0', emissiveIntensity: 0.30, roughness: 0.25 });
  const delineators = [];
  for (let i = 0; i < 16; i += 1) {
    const group = new THREE.Group();
    for (const [px, refMat] of [
      [2.45, reflectorRedMat],
      [-6.35, reflectorWhiteMat],
    ]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.85, 0.04), postWhiteMat);
      p.position.set(px, 0.425, 0);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.14, 0.048), refMat);
      strip.position.set(px, 0.68, 0);
      group.add(p, strip);
    }
    scene.add(group);
    delineators.push({ group, s: i * (ROAD_LOOP_LEN_M / 16) });
  }

  // --- FRIULIAN FARMHOUSES (case friulane around Fagagna hillside stretch) ---
  const houseSpecs = [
    { s: 156, x: 11.5, rotY: -Math.PI * 0.52, col: '#dfd0b8' },
    { s: 174, x: -14.8, rotY: Math.PI * 0.46, col: '#d8b796' },
    { s: 190, x: 13.0, rotY: -Math.PI * 0.44, col: '#e2dcd0' },
    { s: 280, x: -16.2, rotY: Math.PI * 0.55, col: '#d9c5a3' },
  ];
  const houses = houseSpecs.map((h) => {
    const mesh = buildFriulianHouse(h.col, houseWindowMat);
    scene.add(mesh);
    return { group: mesh, s: h.s, lateralX: h.x, baseRotY: h.rotY };
  });

  // --- ROADSIDE TREES (36 cypresses, pines & deciduous trees along 320 m route, shared materials & geometries) ---
  const treeShared = {
    trunkMat: new THREE.MeshStandardMaterial({ color: '#4c3a2b', roughness: 0.92 }),
    pineMat0: new THREE.MeshStandardMaterial({ color: '#244028', roughness: 0.88 }),
    pineMat1: new THREE.MeshStandardMaterial({ color: '#2e4f30', roughness: 0.88 }),
    leafMat: new THREE.MeshStandardMaterial({ color: '#395a33', roughness: 0.86 }),
    trunkGeo0: new THREE.CylinderGeometry(0.11, 0.15, 1.6, 6),
    foliageGeo0: new THREE.ConeGeometry(0.72, 6.2, 8),
    trunkGeo1: new THREE.CylinderGeometry(0.14, 0.20, 2.0, 6),
    coneGeo1a: new THREE.ConeGeometry(1.7, 3.4, 7),
    coneGeo1b: new THREE.ConeGeometry(1.25, 2.8, 7),
    trunkGeo2: new THREE.CylinderGeometry(0.14, 0.20, 2.5, 6),
    crownGeo2: new THREE.DodecahedronGeometry(1.65, 1),
  };
  const trees = [];
  for (let i = 0; i < 36; i += 1) {
    const sideRight = i % 2 === 0;
    const tree = buildTree(i % 3, treeShared);
    const lateralJitter = ((i * 37) % 10) * 0.72;
    const x = sideRight ? 5.4 + lateralJitter : -(8.4 + lateralJitter);
    const scale = 0.85 + ((i * 19) % 7) * 0.08;
    tree.scale.setScalar(scale);
    scene.add(tree);
    trees.push({ group: tree, s: (i / 36) * ROAD_LOOP_LEN_M, lateralX: x });
  }

  // --- TRAFFIC: LEAD HATCHBACK (our lane) & 4 VARIED ONCOMING VEHICLES (shared trim/glass/wheel assets) ---
  const sharedWheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.20, 12);
  sharedWheelGeo.rotateZ(Math.PI / 2);
  const trafficShared = {
    trimMat: new THREE.MeshStandardMaterial({ color: '#1b1e24', roughness: 0.72 }),
    glassMat: new THREE.MeshStandardMaterial({ color: '#1a2430', roughness: 0.20, metalness: 0.50 }),
    wheelMat: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.85 }),
    plateMat: new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.55 }),
    wheelGeo: sharedWheelGeo,
  };
  const leadCar = buildTrafficVehicle({
    bodyColor: '#8d2d2d',
    kind: 'hatch',
    facingViewer: false,
    headlightMat,
    headlightHaloMat,
    taillightMat,
    wetHeadTex,
    wetTailTex,
    shared: trafficShared,
    scene,
  });
  scene.add(addFocusMesh(leadCar.group));

  const oncomingSpecs = [
    { col: '#c9ced6', kind: 'sedan' },
    { col: '#eef1f5', kind: 'van' },
    { col: '#2e4a62', kind: 'hatch' },
    { col: '#3d454d', kind: 'sedan' },
  ];
  const oncomingCars = oncomingSpecs.map((spec, idx) => {
    const car = buildTrafficVehicle({
      bodyColor: spec.col,
      kind: spec.kind,
      facingViewer: true,
      headlightMat,
      headlightHaloMat,
      taillightMat,
      wetHeadTex,
      wetTailTex,
      shared: trafficShared,
      scene,
    });
    scene.add(addFocusMesh(car.group));
    return { ...car, relZ: -25 - idx * (160 / oncomingSpecs.length) };
  });

  const seatPose = {
    position: new THREE.Vector3(0.36, 1.16, 0.20),
    yaw: 0.0,
    pitch: -0.02,
  };
  const standPose = {
    position: seatPose.position.clone(),
    yaw: seatPose.yaw,
    pitch: seatPose.pitch,
  };

  // Zero-GC update scratch objects
  let simTime = 0;
  let travelDist = 0;
  let lastTimeOfDay = null;
  let lastLightsOn = null;
  let currentRoadLight = computeRoadLighting('sunny', true);
  let worldDirty = true;
  let closestOncomingZ = -999;
  let closestOncomingX = -3.9;
  let closestOncomingY = 0;
  let envRayFrame = 0;
  let cachedEnvOcclOD = 0;
  let cachedEnvOcclOS = 0;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const sunWorldDir = new THREE.Vector3(-0.24, 0.20, -0.95).normalize();
  const toOncoming = new THREE.Vector3();
  const eyeOD = new THREE.Vector3();
  const eyeOS = new THREE.Vector3();
  const localEyeOD = new THREE.Vector3(0.029, 0, 0);
  const localEyeOS = new THREE.Vector3(-0.029, 0, 0);

  function placeRouteObject(objGroup, itemS, lateralX, yawBias = 0, useEmbankment = false) {
    const ahead = wrapLoopZ(itemS - travelDist, -18.0, ROAD_LOOP_LEN_M);
    const z = -ahead;
    // Spawn behind fog.far (<=108 m) inside CAR_FAR_CLIP so props dissolve seamlessly out of fog without pop-in
    const visible = z > -118.0 && z < 16.0;
    objGroup.visible = visible;
    if (!visible) return z;
    const off = computeRoadRelativeOffset(z, travelDist);
    const embankY = useEmbankment ? computeEmbankmentY(lateralX) : 0;
    objGroup.position.set(lateralX + off.dx, off.dy + embankY, z);
    objGroup.rotation.y = off.yaw + yawBias;
    return z;
  }

  function updateScene(dt, state, camera) {
    const step = Math.min(dt || 0, 0.1);
    const paused = Boolean(state.settingsOpen);

    if (!paused) {
      simTime += step;
      travelDist += CAR_CRUISE_SPEED_MPS * step;

      const uvDelta = (CAR_CRUISE_SPEED_MPS * step) / roadTileM;
      roadTex.offset.y = (roadTex.offset.y + uvDelta) % 1.0;
      groundTex.offset.y = (groundTex.offset.y + uvDelta) % 1.0;

      const oncomingDz = ONCOMING_CLOSING_SPEED_MPS * step;
      for (const oc of oncomingCars) {
        oc.relZ = wrapLoopZ(oc.relZ + oncomingDz, -142.0, 160.0);
      }
      worldDirty = true;
    }

    const todId = TIME_OF_DAY_PRESETS[state.timeOfDay] ? state.timeOfDay : 'sunny';
    const lightsOn = state.lightsOn !== false;
    const todPreset = TIME_OF_DAY_PRESETS[todId];
    const lightingChanged = todId !== lastTimeOfDay || lightsOn !== lastLightsOn;

    if (lightingChanged) {
      lastTimeOfDay = todId;
      lastLightsOn = lightsOn;
      currentRoadLight = computeRoadLighting(todId, lightsOn);
      worldDirty = true;

      scene.background.set(currentRoadLight.fogColor);
      scene.fog.color.set(currentRoadLight.fogColor);
      scene.fog.near = currentRoadLight.fogNear;
      scene.fog.far = currentRoadLight.fogFar;
      paintSky(currentRoadLight.skyTop, currentRoadLight.skyMid, currentRoadLight.skyHorizon);
      paintMountainHorizonCanvas(
        mtnCtx,
        1024,
        256,
        currentRoadLight.mountainNear,
        currentRoadLight.mountainFar,
        currentRoadLight.fogColor
      );
      mtnTex.needsUpdate = true;

      sunDisk.visible = currentRoadLight.sunVisible;
      sunDisk.position.set(currentRoadLight.sunPos[0], currentRoadLight.sunPos[1], currentRoadLight.sunPos[2]);
      sunDiskMat.emissiveIntensity = currentRoadLight.sunEmissive;

      const streetHemi = currentRoadLight.streetlightsOn ? 0.16 : 0.02;
      const totalHemi = todPreset.hemiInt + streetHemi;
      const sodiumFrac = currentRoadLight.streetlightsOn && totalHemi > 0 ? Math.min(0.62, streetHemi / totalHemi) : 0;
      hemiLight.color.set(todPreset.hemiSky).lerp(sodiumHemiSky, sodiumFrac);
      hemiLight.groundColor.set(todPreset.hemiGround).lerp(sodiumHemiGround, sodiumFrac);
      hemiLight.intensity = totalHemi;

      sunLight.color.set(todPreset.sunColor);
      sunLight.intensity = todPreset.sunInt * 0.85;

      roadMat.roughness = currentRoadLight.roadRoughness;
      roadMat.metalness = currentRoadLight.roadMetalness;

      headlightMat.emissiveIntensity = currentRoadLight.headlightEmissive;
      headlightHaloMat.opacity = currentRoadLight.wetness * 0.65;
      const showHalo = currentRoadLight.wetness > 0.001;
      for (const oc of oncomingCars) {
        for (const h of oc.halos) h.visible = showHalo;
      }
      taillightMat.emissiveIntensity = currentRoadLight.taillightEmissive;
      dashFaceMat.emissiveIntensity = currentRoadLight.dashEmissive;
      consoleFaceMat.emissiveIntensity = currentRoadLight.dashEmissive * 0.9;
      streetLampMat.emissiveIntensity = currentRoadLight.streetlightEmissive;
      houseWindowMat.emissiveIntensity = currentRoadLight.houseWindowEmissive;
      mirrorMat.color.set(currentRoadLight.mirrorColor);
      glassMat.opacity = 0.005 + todPreset.outdoorLux * 0.032;

      for (const b of ownBeams) {
        b.intensity = currentRoadLight.ownBeamIntensity;
      }

      reflectorRedMat.emissiveIntensity = todId === 'night' || todId === 'dusk' ? 1.8 : 0.2;
      reflectorWhiteMat.emissiveIntensity = todId === 'night' || todId === 'dusk' ? 1.4 : 0.15;
      dashBounceLight.intensity = todId === 'night' ? 0.085 : todId === 'dusk' ? 0.05 : 0.0;
      scene.environmentIntensity = 0.08 + todPreset.outdoorLux * 0.26 + (currentRoadLight.streetlightsOn ? 0.06 : 0.0);
    }

    if (worldDirty) {
      // Deform curving & rolling road + grassy hillsides
      deformRibbon(roadRibbon, travelDist);
      deformRibbon(groundRightRibbon, travelDist);
      deformRibbon(groundLeftRibbon, travelDist);

      // Rotate distant horizon & sun azimuth with road heading; steer wheel & subtle body roll into bends
      const heading = computeRoadHeadingRad(travelDist);
      horizonPivot.rotation.y = heading;
      const steerAng = computeSteeringWheelAngle(travelDist);
      wheelPivot.rotation.z = steerAng;
      cabin.rotation.z = -steerAng * 0.022;

      // Position looping route props & landmarks cleanly along the live curve (reuse placed pole x/y)
      let near1Z = -999;
      let near1X = 0.9;
      let near1Y = 0;
      let near2Z = -999;
      let near2X = 0.9;
      let near2Y = 0;
      for (const st of streetlights) {
        const z = placeRouteObject(st.group, st.s, 0);
        if (z < 4.0 && z > -55.0) {
          const sx = 0.9 + st.group.position.x;
          const sy = st.group.position.y;
          if (z > near1Z) {
            near2Z = near1Z;
            near2X = near1X;
            near2Y = near1Y;
            near1Z = z;
            near1X = sx;
            near1Y = sy;
          } else if (z > near2Z) {
            near2Z = z;
            near2X = sx;
            near2Y = sy;
          }
        }
      }
      for (const sg of roadSigns) {
        placeRouteObject(sg.group, sg.s, sg.lateralX, sg.yawBias);
      }
      for (const d of delineators) {
        placeRouteObject(d.group, d.s, 0);
      }
      for (const h of houses) {
        placeRouteObject(h.group, h.s, h.lateralX, h.baseRotY, true);
      }
      for (const tr of trees) {
        placeRouteObject(tr.group, tr.s, tr.lateralX, 0, true);
      }

      // Position lead car & oncoming cars on curved/rolling road surface
      const leadZ = computeLeadCarZ(simTime);
      const leadOff = computeRoadRelativeOffset(leadZ, travelDist);
      leadCar.group.position.set(leadOff.dx, leadOff.dy + Math.sin(simTime * 5.2) * 0.008, leadZ);
      leadCar.group.rotation.set(leadOff.pitch, leadOff.yaw, 0, 'YXZ');

      closestOncomingZ = -999;
      closestOncomingX = -3.9;
      closestOncomingY = 0;
      for (const oc of oncomingCars) {
        const z = oc.relZ;
        const vis = z > -118.0 && z < 16.0;
        oc.group.visible = vis;
        if (!vis) continue;
        const off = computeRoadRelativeOffset(z, travelDist);
        const wx = -3.90 + off.dx;
        oc.group.position.set(wx, off.dy, z);
        oc.group.rotation.set(off.pitch, off.yaw, 0, 'YXZ');
        // Smoothly scale additive headlight halos down to 0 before current fog.far so distant cars never pop bright dots
        const haloScale = Math.min(1, Math.max(0, (currentRoadLight.fogFar - 2.0 + z) / 26.0));
        for (const h of oc.halos) {
          h.scale.setScalar(haloScale);
        }
        if (z < -1.0 && z > -48.0 && z > closestOncomingZ) {
          closestOncomingZ = z;
          closestOncomingX = wx;
          closestOncomingY = off.dy;
        }
      }

      // Aim own low-beam headlights gently into upcoming curve
      const beamOff = computeRoadRelativeOffset(-24.0, travelDist);
      for (let i = 0; i < ownBeamTargets.length; i += 1) {
        ownBeamTargets[i].position.set((i === 0 ? -0.4 : 0.4) + beamOff.dx, beamOff.dy, -24.0);
      }

      // Update road-conforming wet reflections (follows roadGlobalX/Y spline to eliminate hill-clipping & Z-fighting flicker)
      const wetHeadOp = currentRoadLight.wetness * 0.28;
      const wetTailOp = currentRoadLight.wetness * 0.26;
      const wetStreetOp = currentRoadLight.streetlightsOn ? currentRoadLight.wetness * 0.09 : 0.0;
      const fogFar = currentRoadLight.fogFar;
      for (const st of streetlights) {
        const stZ = st.group.visible ? st.group.position.z : -999;
        updateWetStreakRibbon(st.wetRibbon, 0.6, stZ, travelDist, wetStreetOp, fogFar);
      }
      for (const wr of leadCar.wetRibbons) {
        updateWetStreakRibbon(wr.ribbon, wr.lx, leadZ + wr.zOffset, travelDist, wetTailOp, fogFar);
      }
      for (const oc of oncomingCars) {
        for (const wr of oc.wetRibbons) {
          updateWetStreakRibbon(wr.ribbon, -3.90 + wr.lx, oc.relZ + wr.zOffset, travelDist, wetHeadOp, fogFar);
        }
      }

      const poolFade = (pz) =>
        Math.min(1, Math.max(0, (4.0 - pz) / 5.0)) * Math.min(1, Math.max(0, (pz + 55.0) / 8.0));
      streetPools[0].position.set(near1X, near1Y + 5.5, near1Z > -900 ? near1Z : -25);
      streetPools[0].intensity = near1Z > -900 ? currentRoadLight.streetlightPoolIntensity * poolFade(near1Z) : 0;
      streetPools[1].position.set(near2X, near2Y + 5.5, near2Z > -900 ? near2Z : -45);
      streetPools[1].intensity = near2Z > -900 ? currentRoadLight.streetlightPoolIntensity * poolFade(near2Z) : 0;

      if (closestOncomingZ > -900 && currentRoadLight.headlightEmissive > 2.0) {
        oncomingFlashLight.position.set(closestOncomingX, closestOncomingY + 0.85, closestOncomingZ + 2.2);
        const prox = Math.max(0, 1.0 - Math.abs(closestOncomingZ) / 48.0);
        const nearFade = Math.min(1, Math.max(0, (-closestOncomingZ - 1.0) / 4.5));
        oncomingFlashLight.intensity = prox * prox * nearFade * currentRoadLight.headlightEmissive * 0.85;
      } else {
        oncomingFlashLight.intensity = 0;
      }

      // Sync horizonPivot world matrix before reading sun direction (no 1-frame shadow lag in bends or on T switch)
      horizonPivot.updateMatrixWorld(true);
      sunDisk.getWorldPosition(sunWorldDir).normalize();
      if (currentRoadLight.sunVisible) {
        sunLight.position.set(
          sunTarget.position.x + sunWorldDir.x * 52,
          Math.max(6.0, sunWorldDir.y * 52),
          sunTarget.position.z + sunWorldDir.z * 52
        );
      }

      worldDirty = false;
    }

    if (!camera) return;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);

    const sunAlign = currentRoadLight.sunVisible ? Math.max(0, forward.dot(sunWorldDir)) : 0;
    let oncomingGlare = 0;
    if (closestOncomingZ > -900 && currentRoadLight.headlightEmissive > 2.0) {
      toOncoming.set(
        closestOncomingX - camera.position.x,
        closestOncomingY + 0.65 - camera.position.y,
        closestOncomingZ - camera.position.z
      );
      const dist = toOncoming.length();
      if (dist > 0.5) {
        const align = Math.max(0, forward.dot(toOncoming.divideScalar(dist)));
        oncomingGlare = Math.pow(align, 3.0) * Math.max(0, 1.0 - dist / 46.0) * 0.65;
      }
    }
    const streetFlux = currentRoadLight.streetlightsOn ? 0.05 + Math.max(0, forward.y) * 0.18 : 0.0;
    state.eyelidLight = Math.min(
      1,
      Math.max(0.02, 0.03 + todPreset.outdoorLux * (0.18 + sunAlign * 0.78) + streetFlux + oncomingGlare)
    );

    eyeOD.copy(localEyeOD).applyMatrix4(camera.matrixWorld);
    eyeOS.copy(localEyeOS).applyMatrix4(camera.matrixWorld);
    if (state.eyelidClose <= 0.8 && !state.compareNormal) {
      if (envRayFrame % 2 === 0) {
        const evalEyeRayOccl = (eyePos) => {
          raycaster.set(eyePos, forward);
          raycaster.near = 0.01;
          raycaster.far = 0.25;
          const hits = raycaster.intersectObjects(focusTargets, true);
          return hits.length > 0 ? computeOcclusionFromDistance(hits[0].distance) : 0;
        };
        cachedEnvOcclOD = evalEyeRayOccl(eyeOD);
        cachedEnvOcclOS = evalEyeRayOccl(eyeOS);
      }
      envRayFrame += 1;
      state.occlOD = cachedEnvOcclOD;
      state.occlOS = cachedEnvOcclOS;
    } else {
      cachedEnvOcclOD = 0;
      cachedEnvOcclOS = 0;
      state.occlOD = 0;
      state.occlOS = 0;
    }

    if (state.eyelidClose > 0.8) {
      state.focusDistM = 0;
      return;
    }
    raycaster.set(camera.position, forward);
    raycaster.near = 0.05;
    raycaster.far = CAR_FAR_CLIP;
    const hits = raycaster.intersectObjects(focusTargets, true);
    if (hits.length > 0) {
      state.focusDistM = Math.min(CAR_FAR_CLIP, Math.max(0.15, hits[0].distance));
    } else {
      state.focusDistM = 24.0;
    }
  }

  function dispose() {
    const geos = new Set();
    const mats = new Set();
    const texs = new Set([skyTex, mtnTex, wetHeadTex, wetTailTex, wetStreetTex]);
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
    scene.fog = null;
  }

  return {
    id: 'car_passenger',
    defaultMode: 'seated',
    canStand: false,
    farClip: CAR_FAR_CLIP,
    seatPanBounds: { minX: -0.10, maxX: 0.10, minZ: -0.14, maxZ: 0.08 },
    bounds: { minX: -1.0, maxX: 1.0, minZ: -1.0, maxZ: 1.0 },
    scene,
    deskPos: new THREE.Vector3(0.36, 0.85, -0.35),
    seatPose,
    standPose,
    pickables: [],
    colliders: [],
    updateScene,
    dispose,
  };
}
