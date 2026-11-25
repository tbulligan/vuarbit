import * as THREE from 'three';
import { clamp } from './state.js';

/**
 * Pointer-lock mouse look, standing collision movement, seating toggle,
 * object pickup/manipulation, and clinical toggle keybinds.
 */
export function createControls(domElement, state, sceneApi) {
  const keys = new Set();
  const colliders = sceneApi.colliders || [];
  const standPos = sceneApi.standPose.position.clone();
  const seatPos = sceneApi.seatPose.position;
  const playerRadius = 0.30;

  let angularAccum = 0;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const moveDir = new THREE.Vector3();

  // Initialize camera pose from standPose
  state.yaw = sceneApi.standPose.yaw;
  state.pitch = sceneApi.standPose.pitch;

  function placeBackHeldObject() {
    if (!state.holding) return;
    const item = sceneApi.pickables.find((p) => p.id === state.holding);
    if (item) {
      item.mesh.position.copy(item.restPosition);
      item.mesh.quaternion.copy(item.restQuaternion);
      item.mesh.updateMatrixWorld(true);
    }
    state.holding = null;
  }

  function tryTogglePickup(camera) {
    if (state.holding) {
      placeBackHeldObject();
      return;
    }

    // Allow pickup when seated or within 1.6m of Vuarbit's desk
    const horizDistToDesk = Math.hypot(
      standPos.x - sceneApi.deskPos.x,
      standPos.z - sceneApi.deskPos.z
    );
    if (state.mode !== 'seated' && horizDistToDesk > 1.65) {
      return;
    }

    // Prefer pickable nearest center view ray, fallback to closest pickable
    let chosen = null;
    if (camera) {
      camera.getWorldDirection(forward);
      raycaster.set(camera.position, forward);
      let bestScore = Infinity;
      for (const item of sceneApi.pickables) {
        const toItem = item.mesh.position.clone().sub(camera.position);
        const dist = toItem.length();
        const angle = forward.angleTo(toItem.normalize());
        const score = dist + angle * 0.6;
        if (score < bestScore) {
          bestScore = score;
          chosen = item;
        }
      }
    } else {
      chosen = sceneApi.pickables[0] || null;
    }

    if (chosen) {
      state.holding = chosen.id;
      state.heldOffset = { x: 0.06, y: -0.05, z: 0.36 };
    }
  }

  function toggleSeatMode() {
    if (state.mode === 'standing') {
      state.mode = 'seated';
      state.lean = 0;
      state.yaw = sceneApi.seatPose.yaw;
      state.pitch = sceneApi.seatPose.pitch;
    } else {
      placeBackHeldObject();
      state.mode = 'standing';
      state.lean = 0;
      standPos.copy(sceneApi.standPose.position);
    }
  }

  function collidesAt(x, z) {
    if (x < -3.8 + playerRadius || x > 3.8 - playerRadius) return true;
    if (z < -4.15 + playerRadius || z > 4.2 - playerRadius) return true;
    for (const c of colliders) {
      if (
        x + playerRadius > c.minX &&
        x - playerRadius < c.maxX &&
        z + playerRadius > c.minZ &&
        z - playerRadius < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  let latestCamera = null;

  const onCanvasClick = () => {
    if (document.pointerLockElement !== domElement && domElement.requestPointerLock) {
      domElement.requestPointerLock();
    }
  };

  const onPointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === domElement;
  };

  const onMouseMove = (e) => {
    if (!state.pointerLocked) return;
    const sens = 0.0021;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    state.yaw -= dx * sens;
    state.pitch = clamp(state.pitch - dy * sens, -1.45, 1.45);
    angularAccum += Math.hypot(dx, dy) * sens;
  };

  const onKeyDown = (e) => {
    keys.add(e.code);
    if (e.repeat) return;

    switch (e.code) {
      case 'KeyX':
        toggleSeatMode();
        break;
      case 'KeyF':
        tryTogglePickup(latestCamera);
        break;
      case 'KeyR':
        state.eyesClosed = !state.eyesClosed;
        break;
      case 'KeyZ':
        state.glassesOn = !state.glassesOn;
        break;
      case 'KeyM':
        state.muted = !state.muted;
        break;
      case 'KeyH':
        state.hudVisible = !state.hudVisible;
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e) => {
    keys.delete(e.code);
  };

  const onBlur = () => {
    keys.clear();
  };

  domElement.addEventListener('click', onCanvasClick);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function update(dt, camera) {
    latestCamera = camera;
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);

    // Angular velocity tracker (rad/s) for velocity-coupled MLN burst
    const instVel = step > 1e-4 ? angularAccum / step : 0;
    angularAccum = 0;
    const velAlpha = 1 - Math.exp(-14 * step);
    state.gazeVel += (instVel - state.gazeVel) * velAlpha;
    if (state.gazeVel < 1e-4) state.gazeVel = 0;

    const fwdInput =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafeInput =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const leanIn = keys.has('KeyE') ? 1 : 0;
    const leanOut = keys.has('KeyQ') ? 1 : 0;

    if (state.mode === 'seated' && state.holding) {
      // Move held object in camera plane (X/Y) and depth (Z: 0.06m..0.65m)
      const xySpeed = 0.42;
      const zSpeed = 0.45;
      state.heldOffset.x = clamp(state.heldOffset.x + strafeInput * xySpeed * step, -0.22, 0.22);
      state.heldOffset.y = clamp(state.heldOffset.y + fwdInput * xySpeed * step, -0.18, 0.16);
      state.heldOffset.z = clamp(state.heldOffset.z - (leanIn - leanOut) * zSpeed * step, 0.06, 0.65);
    } else {
      // Lean control via E (forward) / Q (back)
      const leanDelta = (leanIn - leanOut) * 1.5 * step;
      if (leanDelta !== 0) {
        state.lean = clamp(state.lean + leanDelta, -0.25, 1.0);
      }

      if (state.mode === 'standing' && (fwdInput !== 0 || strafeInput !== 0)) {
        const walkSpeed = 2.4;
        forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        moveDir
          .set(0, 0, 0)
          .addScaledVector(forward, fwdInput)
          .addScaledVector(right, strafeInput);
        if (moveDir.lengthSq() > 1e-6) {
          moveDir.normalize().multiplyScalar(walkSpeed * step);
          const nextX = standPos.x + moveDir.x;
          if (!collidesAt(nextX, standPos.z)) {
            standPos.x = nextX;
          }
          const nextZ = standPos.z + moveDir.z;
          if (!collidesAt(standPos.x, nextZ)) {
            standPos.z = nextZ;
          }
        }
      }
    }

    if (camera) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;
      camera.rotation.z = 0;

      if (state.mode === 'seated') {
        // Leaning forward moves head toward workbook/desk (~0.24m forward, ~0.22m down at lean=1)
        const fwdLean = state.lean * 0.24;
        const dropLean = Math.max(0, state.lean) * 0.22 - Math.min(0, state.lean) * 0.05;
        camera.position.set(
          seatPos.x - Math.sin(state.yaw) * fwdLean,
          seatPos.y - dropLean,
          seatPos.z - Math.cos(state.yaw) * fwdLean
        );
      } else {
        const fwdLean = state.lean * 0.20;
        const dropLean = Math.max(0, state.lean) * 0.08;
        camera.position.set(
          standPos.x - Math.sin(state.yaw) * fwdLean,
          1.40 - dropLean,
          standPos.z - Math.cos(state.yaw) * fwdLean
        );
      }
      camera.updateMatrixWorld(true);
    }
  }

  function dispose() {
    domElement.removeEventListener('click', onCanvasClick);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  }

  return { update, dispose };
}
