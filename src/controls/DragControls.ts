import _ from 'lodash';
import * as THREE from 'three';

import * as TWEEN from '@tweenjs/tween.js';

enum PinchState {
  None = 1,
  Start = 2,
  ScaleRotate = 3,
  ScaleOnly = 4,
  PitchOnly = 5,
}

export class DragControls {
  private minCameraY = 50;
  private maxCameraY = 18000;
  private angleThreshold = (Math.PI / 180) * 12;
  private pinchZoomBuffer = 40;
  private pitchBuffer = 40;

  private mouse = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();

  private _rotateStart: THREE.Vector2 | null = null;
  private _dragStart: THREE.Vector3 | null = null;
  private _pinchStart: THREE.Vector2[] | null = null;
  private _pinchState: PinchState = PinchState.None;
  private _modifier = false;
  private _cameraStart: THREE.Camera | null = null;

  constructor(public camera: THREE.Camera, private el: HTMLElement, private plane: THREE.Mesh) {
    this.camera.rotation.order = "ZYX";
    this.el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    this.el.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.el.addEventListener("mouseup", () => this.reset());
    this.el.addEventListener("touchstart", (e) => this.onTouchStart(e));
    this.el.addEventListener("touchmove", (e) => this.onTouchMove(e));
    this.el.addEventListener("touchend", () => this.reset());
    window.addEventListener("wheel", (e) => this.onWheel(e));
  }

  getMouseWorldCoordinates(e: MouseEvent | TouchInit, camera: THREE.Camera) {
    if (e.clientX === undefined || e.clientY === undefined) {
      return null;
    }
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObject(this.plane);
    for (const intersect of intersects) {
      return intersect.point.clone();
    }
    return null;
  }

  onMouseDown(e: MouseEvent) {
    const modifier =
      e.getModifierState("Control") || e.getModifierState("Alt") || e.getModifierState("Meta");
    if (modifier) {
      this._modifier = true;
      this._rotateStart = new THREE.Vector2(e.clientX, e.clientY);
      this._cameraStart = this.camera.clone();
      this.el.classList.add("dragging");
    } else {
      this._modifier = false;
      this._dragStart = this.getMouseWorldCoordinates(e, this.camera);
      this._cameraStart = this.camera.clone();
      this.el.classList.add("dragging");
    }
  }

  onMouseMove(e: MouseEvent) {
    if (this._modifier && this._rotateStart && this._cameraStart) {
      this.hideInstructions();
      const dx = e.clientX - this._rotateStart.x;
      const dy = e.clientY - this._rotateStart.y;
      this.camera.rotation.x = Math.min(
        Math.PI / 2,
        Math.max(0, this._cameraStart.rotation.x - dy / 360.0)
      );
      this.camera.rotation.z = this._cameraStart.rotation.z - dx / 120.0;
      return;
    }
    if (!this._dragStart) {
      return;
    }
    if (!this._cameraStart) {
      return;
    }
    const point = this.getMouseWorldCoordinates(e, this._cameraStart);
    if (!point) {
      return;
    }
    this.hideInstructions();
    this.camera.position.copy(this._cameraStart.position);
    this.camera.position.add(this._dragStart);
    this.camera.position.sub(point);
  }

  hideInstructions() {
    const instructions = document.getElementById("instructions");
    if (instructions) {
      instructions.classList.add("hidden");
    }
  }

  reset() {
    this._dragStart = null;
    this._cameraStart = null;
    this._rotateStart = null;
    this._pinchStart = null;
    this._modifier = false;
    this._pinchState = PinchState.None;
    this.el.classList.remove("dragging");
  }

  onWheel(e: WheelEvent) {
    e.stopPropagation();
    e.preventDefault();
    const z = this.camera.position.z;
    this.camera.position.z = Math.min(this.maxCameraY, Math.max(this.minCameraY, z + e.deltaY));
    this.hideInstructions();
    return false;
  }

  onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      e.stopPropagation();
      const [touch] = e.touches;
      this._modifier = false;
      this._dragStart = this.getMouseWorldCoordinates(touch, this.camera);
      this._cameraStart = this.camera.clone();
      return false;
    } else if (e.touches.length === 2) {
      const [touch1, touch2] = e.touches;
      this._pinchStart = [
        new THREE.Vector2(touch1.clientX, touch1.clientY),
        new THREE.Vector2(touch2.clientX, touch2.clientY),
      ];
      this._pinchState = PinchState.Start;
      this._cameraStart = this.camera.clone();
    }
  }

  onTouchMove(e: TouchEvent) {
    if (this._dragStart && e.touches.length === 1 && this._cameraStart) {
      this.hideInstructions();
      e.stopPropagation();
      e.preventDefault();
      const [touch] = e.touches;
      const point = this.getMouseWorldCoordinates(touch, this._cameraStart);
      if (!point) {
        return;
      }
      if (!this._cameraStart) {
        return;
      }
      this.camera.position.copy(this._cameraStart.position);
      this.camera.position.add(this._dragStart);
      this.camera.position.sub(point);
      return false;
    } else if (this._pinchStart && e.touches.length === 2) {
      this.hideInstructions();
      e.stopPropagation();
      e.preventDefault();
      const [touch1, touch2] = e.touches;
      const deltas = [
        new THREE.Vector2(touch1.clientX, touch1.clientY),
        new THREE.Vector2(touch2.clientX, touch2.clientY),
      ];
      deltas[0].sub(this._pinchStart[0]);
      deltas[1].sub(this._pinchStart[1]);

      if (this._pinchState === PinchState.Start) {
        // Figure out of we are doing two finger drag
        if (
          deltas[0].length() > this.pitchBuffer &&
          deltas[1].length() > this.pitchBuffer &&
          Math.abs(deltas[0].x) < 50 &&
          Math.abs(deltas[1].x) < 50
        ) {
          this._pinchState = PinchState.PitchOnly;
        }
      }

      // The following controls are based off of world state
      const pinches = [
        new THREE.Vector2(touch1.clientX, touch1.clientY),
        new THREE.Vector2(touch2.clientX, touch2.clientY),
      ];

      if (this._pinchState === PinchState.PitchOnly && this._cameraStart) {
        const dy = _.maxBy([deltas[0].y, deltas[1].y], Math.abs) ?? 0;
        const dyBuffered =
          dy < 0 ? Math.min(dy + this.pitchBuffer, 0) : Math.max(dy - this.pitchBuffer, 0);
        const rx = this._cameraStart.rotation.x - (dyBuffered / window.innerHeight) * Math.PI;
        this.camera.rotation.x = Math.min(Math.PI / 2, Math.max(0, rx));
      }

      // Calculate pinch and expand distance
      if (
        [PinchState.Start, PinchState.ScaleOnly, PinchState.ScaleRotate].includes(this._pinchState)
      ) {
        const distStart = this._pinchStart[0].distanceTo(this._pinchStart[1]);
        let dist = pinches[0].distanceTo(pinches[1]);

        if (
          this._pinchState === PinchState.Start &&
          Math.abs(distStart - dist) > this.pinchZoomBuffer
        ) {
          this._pinchState = PinchState.ScaleOnly;
        }

        // Add a buffer into the pinch calculation
        if (dist < distStart) {
          dist = Math.min(distStart, dist + this.pinchZoomBuffer);
        } else if (dist > distStart) {
          dist = Math.max(distStart, dist - this.pinchZoomBuffer);
        }
        const scale = distStart / dist;
        if (this._cameraStart) {
          this.camera.position.z = this._cameraStart.position.z * scale;
        }
      }

      // Rotation determined by the angle difference in the two pinch vectors
      if ([PinchState.Start, PinchState.ScaleRotate].includes(this._pinchState)) {
        const vecStart = this._pinchStart[1].clone();
        vecStart.sub(this._pinchStart[0]);
        const vecEnd = pinches[1].clone();
        vecEnd.sub(pinches[0]);

        const angleStart = Math.atan2(vecStart.y, vecStart.x);
        const angleEnd = Math.atan2(vecEnd.y, vecEnd.x);
        const angleDiff = angleEnd - angleStart;

        if (this._pinchState === PinchState.Start) {
          if (Math.abs(angleDiff) > this.angleThreshold) {
            this._pinchState = PinchState.ScaleRotate;
          }
        }
        if (this._pinchState === PinchState.ScaleRotate && this._cameraStart) {
          this.camera.rotation.z = this._cameraStart.rotation.z + angleDiff;
        }
      }
    }
  }

  moveTo(
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w: number },
    durationMs = 1000
  ) {
    this.hideInstructions();
    new TWEEN.Tween(this.camera.position)
      // Set the target position
      .to(position, durationMs)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .start();

    const currentRotation = new THREE.Quaternion();
    currentRotation.setFromEuler(this.camera.rotation);
    new TWEEN.Tween(currentRotation)
      .to({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, durationMs)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate((q) => {
        this.camera.rotation.setFromQuaternion(q);
      })
      .start();
  }

  update() {}
}
