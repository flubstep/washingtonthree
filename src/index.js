import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Stats from "three/examples/jsm/libs/stats.module";
import { GUI } from "lil-gui";

import "./index.css";

import { TileManager } from "./tile";

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
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    50000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(CX, CY, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(CX, CY, 50);

  const stats = Stats();
  document.body.appendChild(stats.dom);

  const gui = new GUI();
  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.add(camera.position, "z", 0, 10000);
  cameraFolder.open();

  tiles.updatePosition(camera.position);
  let nextCameraUpdate = Date.now() + 1000;

  function animate() {
    if (Date.now() > nextCameraUpdate) {
      tiles.updatePosition(camera.position);
      nextCameraUpdate = Date.now() + 1000;
    }
    requestAnimationFrame(animate);
    controls.update();
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
    },
    false
  );

  window.camera = camera;
  window.controls = controls;
}
main();
