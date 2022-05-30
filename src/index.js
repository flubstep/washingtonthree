import _ from "lodash";
import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module";

import "./index.css";

import { TileManager } from "./tile";

const PinchState = {
  None: 1,
  Start: 2,
  ScaleRotate: 3,
  ScaleOnly: 4,
  PitchOnly: 5,
};

class DragControls {
  constructor(camera, el, plane) {
    camera.rotation.order = "ZYX";

    this.camera = camera;
    this.el = el;
    this.plane = plane;
    this.mouse = new THREE.Vector2();
    this.minCameraY = 50;
    this.maxCameraY = 10000;
    this.angleThreshold = (Math.PI / 180) * 12;
    this.scaleThreshold = 1.5;

    this.el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    this.el.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.el.addEventListener("mouseup", (e) => this.reset(e));

    this.el.addEventListener("touchstart", (e) => this.onTouchStart(e));
    this.el.addEventListener("touchmove", (e) => this.onTouchMove(e));
    this.el.addEventListener("touchend", (e) => this.reset(e));

    window.addEventListener("wheel", (e) => this.onWheel(e));

    this.raycaster = new THREE.Raycaster();
    this.raycasterDelta = new THREE.Raycaster();
    this._rotateStart = null;
    this._dragStart = null;
    this._pinchStart = null;
    this._pinchState = PinchState.None;
    this._modifier = false;
    this._cameraStart = null;
  }

  getMouseWorldCoordinates(e, camera) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObject(this.plane);
    for (const intersect of intersects) {
      return intersect.point.clone();
    }
    return null;
  }

  onMouseDown(e) {
    const modifier =
      e.getModifierState("Control") || e.getModifierState("Alt") || e.getModifierState("Meta");
    if (modifier) {
      this._modifier = true;
      this._rotateStart = { x: e.clientX, y: e.clientY };
      this._cameraStart = this.camera.clone();
    } else {
      this._modifier = false;
      this._dragStart = this.getMouseWorldCoordinates(e, this.camera);
      this._cameraStart = this.camera.clone();
    }
  }

  onMouseMove(e) {
    if (this._modifier && this._rotateStart) {
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
    const point = this.getMouseWorldCoordinates(e, this._cameraStart);
    if (!point) {
      return;
    }
    this.camera.position.copy(this._cameraStart.position);
    this.camera.position.add(this._dragStart);
    this.camera.position.sub(point);
  }

  reset(e) {
    this._dragStart = null;
    this._cameraStart = null;
    this._rotateStart = null;
    this._pinchStart = null;
    this._modifier = false;
    this._pinchState = PinchState.None;
  }

  onWheel(e) {
    e.stopPropagation();
    e.preventDefault();
    const z = camera.position.z;
    camera.position.z = Math.min(this.maxCameraY, Math.max(this.minCameraY, z + e.deltaY));
    return false;
  }

  onTouchStart(e) {
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
        this.getMouseWorldCoordinates(touch1, this.camera),
        this.getMouseWorldCoordinates(touch2, this.camera),
      ];
      if (!this._pinchStart[0] || !this._pinchStart[1]) {
        this._pinchStart = null;
        return;
      }
      this._pinchState = PinchState.Start;
      this._cameraStart = this.camera.clone();
    }
  }

  onTouchMove(e) {
    if (this._dragStart && e.touches.length === 1) {
      e.stopPropagation();
      e.preventDefault();
      const [touch] = e.touches;
      const point = this.getMouseWorldCoordinates(touch, this._cameraStart);
      if (!point) {
        return;
      }
      this.camera.position.copy(this._cameraStart.position);
      this.camera.position.add(this._dragStart);
      this.camera.position.sub(point);
      return false;
    } else if (this._pinchStart && e.touches.length === 2) {
      e.stopPropagation();
      e.preventDefault();
      const [touch1, touch2] = e.touches;
      const pinches = [
        this.getMouseWorldCoordinates(touch1, this._cameraStart),
        this.getMouseWorldCoordinates(touch2, this._cameraStart),
      ];

      // Calculate pinch and expand distance
      if (
        [PinchState.Start, PinchState.ScaleOnly, PinchState.ScaleRotate].includes(this._pinchState)
      ) {
        const distStart = this._pinchStart[0].distanceTo(this._pinchStart[1]);
        const dist = pinches[0].distanceTo(pinches[1]);
        const scale = distStart / dist;
        this.camera.position.z = this._cameraStart.position.z * scale;
        if (
          this._pinchState === PinchState.Start &&
          (scale > this.scaleThreshold || scale < 1 / this.scaleThreshold)
        ) {
          this._pinchState = PinchState.ScaleOnly;
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
        const angleDiff = angleStart - angleEnd;

        if (this._pinchState === PinchState.Start) {
          if (Math.abs(angleDiff) > this.angleThreshold) {
            this._pinchState = PinchState.ScaleRotate;
          }
        }
        if (this._pinchState === PinchState.ScaleRotate) {
          this.camera.rotation.z = this._cameraStart.rotation.z + angleDiff;
        }
      }
    }
  }

  update() {}
}

const [XMIN, XMAX] = [389400, 408600];
const [YMIN, YMAX] = [124200, 148200];
const CX = (XMIN + XMAX) / 2;
const CY = (YMIN + YMAX) / 2;

async function main() {
  const scene = new THREE.Scene();
  const tiles = new TileManager(scene);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    50000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(CX, CY, 3000);

  const stats = Stats();
  document.body.appendChild(stats.dom);

  const planeGeometry = new THREE.PlaneGeometry(XMAX - XMIN, YMAX - YMIN);
  const planeMaterial = new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.position.set(CX, CY, 0);
  scene.add(plane);

  const controls = new DragControls(camera, renderer.domElement, plane);

  const delay = 100;
  tiles.updatePosition(camera.position);
  let nextCameraUpdate = Date.now() + delay;

  function animate() {
    if (Date.now() > nextCameraUpdate) {
      tiles.updatePosition(camera.position);
      nextCameraUpdate = Date.now() + delay;
    }
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    stats.update();
  }
  animate();

  window.addEventListener(
    "resize",
    () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      controls.update();
    },
    false
  );
  window.camera = camera;
  window.tiles = tiles;
}
main();
