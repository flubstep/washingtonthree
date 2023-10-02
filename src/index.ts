import "./index.css";

import { GUI } from "dat.gui";
import _ from "lodash";
import * as THREE from "three";
// @ts-ignore
import Stats from "three/examples/jsm/libs/stats.module";

import * as TWEEN from "@tweenjs/tween.js";

import { Bookmarks } from "./bookmarks";
import {
  CEILING_HEIGHT_TEXTURE_URL,
  CX,
  CY,
  HEIGHT_MAP_TEXTURE_URL,
  XMAX,
  XMIN,
  YMAX,
  YMIN,
} from "./constants";
import { DragControls } from "./controls/DragControls";
import { TileManager } from "./tile";

async function main() {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000022, 1.0);
  document.body.appendChild(renderer.domElement);

  // Must load textures first before any points are visible
  const [heightMapTexture, ceilingMapTexture] = await Promise.all([
    new THREE.TextureLoader().loadAsync(HEIGHT_MAP_TEXTURE_URL),
    new THREE.TextureLoader().loadAsync(CEILING_HEIGHT_TEXTURE_URL),
  ]);
  const tiles = new TileManager(scene, heightMapTexture, ceilingMapTexture);
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    50000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(CX + 400, CY - 300, 300);
  camera.rotation.set(1.0333, 0, 0.8416);

  // Displays frames per second
  const stats = Stats();
  document.body.appendChild(stats.dom);

  // Needed for the drag controls
  // TODO: Use a ground mesh instead of a plane
  const planeGeometry = new THREE.PlaneGeometry(XMAX - XMIN * 3, YMAX - YMIN * 3);
  const planeMaterial = new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.position.set(CX, CY, 0);
  scene.add(plane);

  // Install drag controls for mouse and touch
  const controls = new DragControls(camera, renderer.domElement, plane);

  // updatePosition will reload the tiles based on the camera
  // position. Debounce this so it doesn't happen too frequently.
  const delay = 500;
  tiles.updatePosition(camera.position);
  let nextCameraUpdate = Date.now() + delay;

  function animate(time: number) {
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

  // Resize the renderer when the window is resized
  window.addEventListener(
    "resize",
    () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );

  // Add bookmarks as GUI controls
  const bookmarks = Bookmarks;
  let bookmarkIndex = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key === "c") {
      const name = prompt("Give a name for this shortcut location.") || "Unnamed Location";
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
      const { position, rotation } = bookmarks[bookmarkIndex];
      controls.moveTo(position, rotation, 1000);
      bookmarkIndex++;
      bookmarkIndex %= bookmarks.length;
    }
  });

  const gui = new GUI({ autoPlace: false });
  const navigationFolder = gui.addFolder("Navigate to Landmark");
  const navigationActions: { [name: string]: any } = {};
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
  //document.body.appendChild(gui.domElement);

  // Helpful for debugging in the browser console
  // @ts-ignore
  window.camera = camera;
  // @ts-ignore
  window.tiles = tiles;
}
main();
