import * as THREE from 'three';
import { clamp, computeHeldRestOffset, computeMaxYaw, cycleTimeOfDay, updateHeldRotation } from './state.js';

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
  const toItem = new THREE.Vector3();
  const pickableMeshes = sceneApi.pickables.map((p) => p.mesh);

  // Initialize camera pose from standPose
  state.yaw = sceneApi.standPose.yaw;
  state.pitch = sceneApi.standPose.pitch;

  function placeBackHeldObject() {
    state.heldRot.yaw = 0;
    state.heldRot.pitch = 0;
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

    // Prefer direct view-ray hit on pickable mesh, fallback to angle-dominant nearest item
    let chosen = null;
    if (camera) {
      camera.getWorldDirection(forward);
      raycaster.set(camera.position, forward);
      raycaster.near = 0.02;
      raycaster.far = 2.0;
      const hits = raycaster.intersectObjects(pickableMeshes, true);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        chosen = sceneApi.pickables.find((item) => {
          let cur = hitObj;
          while (cur) {
            if (cur === item.mesh) return true;
            cur = cur.parent;
          }
          return false;
        }) || null;
      }
      if (!chosen) {
        let bestScore = Infinity;
        for (const item of sceneApi.pickables) {
          toItem.copy(item.mesh.position).sub(camera.position);
          const dist = toItem.length();
          const angle = forward.angleTo(toItem.normalize());
          const score = angle + dist * 0.05;
          if (score < bestScore) {
            bestScore = score;
            chosen = item;
          }
        }
      }
    } else {
      chosen = sceneApi.pickables[0] || null;
    }

    if (chosen) {
      state.holding = chosen.id;
      // Start centered in dominant eye's lower bifocal reading sweet spot (~22cm for +17 D)
      state.heldOffset = computeHeldRestOffset(0.22, state.glassesOn, state.settings?.dominantEye);
      state.heldRot.yaw = 0;
      state.heldRot.pitch = 0;
    }
  }

  let seatPanX = 0;
  let seatPanZ = 0;

  function toggleSeatMode() {
    if (state.mode === 'standing') {
      state.mode = 'seated';
      state.lean = 0;
      seatPanX = 0;
      seatPanZ = 0;
      state.yaw = sceneApi.seatPose.yaw;
      state.pitch = sceneApi.seatPose.pitch;
    } else {
      placeBackHeldObject();
      state.mode = 'standing';
      state.lean = 0;
      seatPanX = 0;
      seatPanZ = 0;
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
  let focusToggle = false;
  let wheelDeltaAccum = 0;
  let rmbDown = false;

  const onCanvasClick = () => {
    if (state.settingsOpen) return;
    if (document.pointerLockElement !== domElement && domElement.requestPointerLock) {
      Promise.resolve(domElement.requestPointerLock()).catch(() => {});
    }
  };

  const onMouseDown = (e) => {
    if (state.settingsOpen) return;
    if (e.button === 2) {
      rmbDown = true;
    }
  };

  const onMouseUp = (e) => {
    if (e.button === 2) {
      rmbDown = false;
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault();
  };

  const onPointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === domElement;
    if (!state.pointerLocked) {
      rmbDown = false;
    }
  };

  const onMouseMove = (e) => {
    if (!state.pointerLocked || state.settingsOpen) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (state.holding && rmbDown) {
      updateHeldRotation(state.heldRot, dx, dy);
      return;
    }
    const sens = 0.0021;
    state.yaw -= dx * sens;
    state.pitch = clamp(state.pitch - dy * sens, -1.48, state.mode === 'seated' ? 1.15 : 1.45);

    const maxYaw = computeMaxYaw(state.mode, state.lean);
    if (Number.isFinite(maxYaw)) {
      state.yaw = clamp(state.yaw, -maxYaw, maxYaw);
    }
    angularAccum += Math.hypot(dx, dy) * sens;
  };

  const onWheel = (e) => {
    if (state.settingsOpen) return;
    if (Math.abs(e.deltaY) < 0.01) return;
    // Scroll up (<0) -> positive (lean in / push held away); drained smoothly across frames in update()
    wheelDeltaAccum = clamp(
      wheelDeltaAccum + Math.sign(-e.deltaY) * Math.min(1.5, Math.abs(e.deltaY) / 100),
      -3.0,
      3.0
    );
  };

  const onKeyDown = (e) => {
    if (!e.repeat && e.code === 'KeyP') {
      e.preventDefault();
      const opening = !state.settingsOpen;
      state.settingsOpen = opening;
      if (opening) {
        document.exitPointerLock?.();
        keys.clear();
        rmbDown = false;
        wheelDeltaAccum = 0;
        state.focusing = focusToggle;
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (!e.repeat && e.code === 'Escape' && state.settingsOpen) {
      state.settingsOpen = false;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (!e.repeat && e.code === 'KeyV') {
      if (state.settingsOpen) e.preventDefault();
      state.compareNormal = !state.compareNormal;
      state.fatigue = 0.05;
      if (!state.compareNormal) {
        focusToggle = false;
        state.focusing = state.settingsOpen ? false : keys.has('Space');
        state.focusStrength = 0;
      }
      return;
    }

    if (!e.repeat && e.code === 'KeyZ') {
      if (state.settingsOpen) e.preventDefault();
      if (state.settings?.lensProfile !== 'none') {
        state.glassesOn = !state.glassesOn;
      }
      return;
    }

    if (!e.repeat && e.code === 'KeyL') {
      if (state.settingsOpen) e.preventDefault();
      state.lightsOn = state.lightsOn === false;
      return;
    }

    if (!e.repeat && e.code === 'KeyT') {
      if (state.settingsOpen) {
        e.preventDefault();
        if (document.activeElement?.tagName === 'SELECT') {
          document.activeElement.blur();
        }
      }
      state.timeOfDay = cycleTimeOfDay(state.timeOfDay);
      return;
    }

    if (!e.repeat && e.code === 'KeyC') {
      if (state.settingsOpen) e.preventDefault();
      focusToggle = !focusToggle;
      state.focusing = focusToggle || (!state.settingsOpen && keys.has('Space'));
      return;
    }

    if (state.settingsOpen) return;

    keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      state.focusing = true;
    }
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
        focusToggle = false;
        state.focusing = state.eyesClosed ? false : keys.has('Space');
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
    if (e.code === 'Space') {
      state.focusing = focusToggle;
    }
  };

  const onBlur = () => {
    keys.clear();
    rmbDown = false;
    state.focusing = focusToggle;
  };

  domElement.addEventListener('click', onCanvasClick);
  domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function update(dt, camera) {
    latestCamera = camera;
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    if (!state.focusing && focusToggle) {
      focusToggle = false;
    }

    // Instantaneous angular velocity (rad/s): drops immediately to 0 the frame mouse movement stops
    const instVel = step > 1e-4 ? angularAccum / step : 0;
    angularAccum = 0;
    state.gazeVel = state.settingsOpen || instVel < 0.04 ? 0 : instVel;

    const suppressed = Boolean(state.settingsOpen);
    const fwdInput = suppressed
      ? 0
      : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafeInput = suppressed
      ? 0
      : (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const leanIn = suppressed ? 0 : keys.has('KeyE') ? 1 : 0;
    const leanOut = suppressed ? 0 : keys.has('KeyQ') ? 1 : 0;
    // Exponentially drain wheel accumulator so discrete scroll detents glide continuously (~100ms)
    const wheelStep = suppressed ? 0 : wheelDeltaAccum * (1 - Math.exp(-14 * step));
    if (suppressed) {
      wheelDeltaAccum = 0;
    } else {
      wheelDeltaAccum -= wheelStep;
      if (Math.abs(wheelDeltaAccum) < 1e-4) wheelDeltaAccum = 0;
    }

    if (state.holding) {
      // Keep nearest rotated corner outside glasses (~4.8cm) or bare cornea (~4.2cm, clear of 2cm near clip)
      const heldItem = sceneApi.pickables.find((p) => p.id === state.holding);
      const halfDepth = heldItem?.halfDepth || 0.048;
      const minZ = (state.glassesOn ? 0.048 : 0.042) + halfDepth;

      const xySpeed = 0.42;
      const zSpeed = 0.45;
      state.heldOffset.x = clamp(state.heldOffset.x + strafeInput * xySpeed * step, -0.22, 0.22);
      state.heldOffset.y = clamp(state.heldOffset.y + fwdInput * xySpeed * step, -0.18, 0.16);
      // Scroll down (wheelStep < 0) pulls held object closer; scroll up (wheelStep > 0) pushes it further away
      const zDelta = (leanIn - leanOut) * zSpeed * step - wheelStep * 0.032;
      state.heldOffset.z = clamp(state.heldOffset.z - zDelta, minZ, 0.65);

      // Moving object closer (E or scroll down) guides its center directly into the lower dominant bifocal lens
      if (zDelta > 0 && strafeInput === 0 && fwdInput === 0) {
        const pullAlpha = 1 - Math.exp(-(leanIn > 0 ? 8.5 * step : Math.abs(wheelStep) * 0.48));
        const target = computeHeldRestOffset(
          state.heldOffset.z,
          state.glassesOn,
          state.settings?.dominantEye
        );
        state.heldOffset.x += (target.x - state.heldOffset.x) * pullAlpha;
        state.heldOffset.y += (target.y - state.heldOffset.y) * pullAlpha;
      }
    } else {
      // Lean control via E/Q or mouse scroll wheel
      const leanDelta = (leanIn - leanOut) * 1.5 * step + wheelStep * 0.14;
      if (leanDelta !== 0) {
        state.lean = clamp(state.lean + leanDelta, -0.25, 1.0);
      }

      if (fwdInput !== 0 || strafeInput !== 0) {
        forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        moveDir
          .set(0, 0, 0)
          .addScaledVector(forward, fwdInput)
          .addScaledVector(right, strafeInput);
        if (moveDir.lengthSq() > 1e-6) {
          if (state.mode === 'seated') {
            // Slower fine panning when leaned close over the workbook (~0.24 m/s at 20cm, ~0.16 m/s closest)
            const panSpeed = 0.32 - 0.16 * clamp(state.lean, 0, 1);
            moveDir.normalize().multiplyScalar(panSpeed * step);
            seatPanX = clamp(seatPanX + moveDir.x, -0.30, 0.30);
            seatPanZ = clamp(seatPanZ + moveDir.z, -0.36, 0.10);
          } else if (state.mode === 'standing') {
            moveDir.normalize().multiplyScalar(2.4 * step);
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
    }

    if (camera) {
      const maxYaw = computeMaxYaw(state.mode, state.lean);
      if (Number.isFinite(maxYaw)) {
        state.yaw = clamp(state.yaw, -maxYaw, maxYaw);
      }

      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;
      camera.rotation.z = 0;

      if (state.mode === 'seated') {
        // Yaw-aligned slouch (E/Q/Scroll) + desk-aligned torso pan (WASD), clamped to clear classmate & desk bounds
        const fwdLean = state.lean * 0.28;
        const dropLean = Math.max(0, state.lean) * 0.24 - Math.min(0, state.lean) * 0.05;
        const dx = clamp(-Math.sin(state.yaw) * fwdLean + seatPanX, -0.30, 0.30);
        const dz = clamp(-Math.cos(state.yaw) * fwdLean + seatPanZ, -0.36, 0.10);
        camera.position.set(seatPos.x + dx, seatPos.y - dropLean, seatPos.z + dz);
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
    domElement.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    domElement.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  }

  return { update, dispose };
}
