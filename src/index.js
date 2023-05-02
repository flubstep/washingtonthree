import _ from "lodash";
import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import Stats from "three/examples/jsm/libs/stats.module";
import {
  HEIGHT_MAP_TEXTURE_URL,
  CEILING_HEIGHT_TEXTURE_URL,
  XMIN,
  XMAX,
  YMIN,
  YMAX,
  CX,
  CY,
} from "./constants";
import { TileManager } from "./tile";
import { GUI } from "dat.gui";

import "./index.css";
import { Bookmarks } from "./bookmarks";

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
    this.maxCameraY = 18000;
    this.angleThreshold = (Math.PI / 180) * 12;
    this.pinchZoomBuffer = 40;
    this.pitchBuffer = 40;

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
      this.el.classList.add("dragging");
    } else {
      this._modifier = false;
      this._dragStart = this.getMouseWorldCoordinates(e, this.camera);
      this._cameraStart = this.camera.clone();
      this.el.classList.add("dragging");
    }
  }

  onMouseMove(e) {
    if (this._modifier && this._rotateStart) {
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
    document.getElementById("instructions").classList.add("hidden");
  }

  reset(e) {
    this._dragStart = null;
    this._cameraStart = null;
    this._rotateStart = null;
    this._pinchStart = null;
    this._modifier = false;
    this._pinchState = PinchState.None;
    this.el.classList.remove("dragging");
  }

  onWheel(e) {
    e.stopPropagation();
    e.preventDefault();
    const z = camera.position.z;
    camera.position.z = Math.min(this.maxCameraY, Math.max(this.minCameraY, z + e.deltaY));
    this.hideInstructions();
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
        new THREE.Vector2(touch1.clientX, touch1.clientY),
        new THREE.Vector2(touch2.clientX, touch2.clientY),
      ];
      this._pinchState = PinchState.Start;
      this._cameraStart = this.camera.clone();
    }
  }

  onTouchMove(e) {
    if (this._dragStart && e.touches.length === 1) {
      this.hideInstructions();
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

      if (this._pinchState === PinchState.PitchOnly) {
        const dy = _.maxBy([deltas[0].y, deltas[1].y], Math.abs);
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
        this.camera.position.z = this._cameraStart.position.z * scale;
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
        if (this._pinchState === PinchState.ScaleRotate) {
          this.camera.rotation.z = this._cameraStart.rotation.z + angleDiff;
        }
      }
    }
  }

  moveTo(position, rotation, durationMs = 1000) {
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

async function main() {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000022, 1.0);
  document.body.appendChild(renderer.domElement);

  const heightMapTexture = await new THREE.TextureLoader().loadAsync(HEIGHT_MAP_TEXTURE_URL);
  const ceilingMapTexture = await new THREE.TextureLoader().loadAsync(CEILING_HEIGHT_TEXTURE_URL);
  const tiles = new TileManager(scene, heightMapTexture, ceilingMapTexture);

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

  const delay = 500;
  tiles.updatePosition(camera.position);
  let nextCameraUpdate = Date.now() + delay;

  function animate(time) {
    if (Date.now() > nextCameraUpdate) {
      tiles.updatePosition(camera.position);
      nextCameraUpdate = Date.now() + delay;
    }
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    TWEEN.update(time);
    controls.update();
    stats.update();
  }
  animate(0);

  window.addEventListener(
    "resize",
    () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );

  const bookmarks = Bookmarks;
  let bookmarkIndex = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key === "c") {
      const name = prompt("Give a name for this shortcut location.");
      const quaternion = new THREE.Quaternion();
      quaternion.setFromEuler(camera.rotation);
      bookmarks.push({
        name,
        position: _.pick(camera.position, ["x", "y", "z"]),
        rotation: _.pick(quaternion, ["x", "y", "z", "w"]),
      });
    }
    if (e.key === "d") {
      const dataStr =
        "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bookmarks));
      const anchor = document.createElement("a");
      document.body.appendChild(anchor);
      anchor.setAttribute("href", dataStr);
      anchor.setAttribute("download", "bookmarks.json");
      anchor.click();
      setTimeout(() => {
        anchor.remove();
      });
    }
    if (e.key === "m") {
      const bookmark = bookmarks[bookmarkIndex];
      controls.moveTo(bookmark.position, bookmark.rotation, 1000);
      bookmarkIndex++;
      bookmarkIndex %= bookmarks.length;
    }
  });

  const gui = new GUI({ autoPlace: false });
  const navigationFolder = gui.addFolder("Navigate to Landmark");
  const navigationActions = {};
  for (const bookmark of Bookmarks) {
    navigationActions[bookmark.name] = () => {
      controls.moveTo(bookmark.position, bookmark.rotation, 1000);
    };
  }
  for (const bookmark of Bookmarks) {
    navigationFolder.add(navigationActions, bookmark.name);
  }
  navigationFolder.open();
  gui.domElement.id = "gui";
  document.body.appendChild(gui.domElement);

  window.camera = camera;
  window.tiles = tiles;
}
main();
