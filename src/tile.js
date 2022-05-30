import _ from "lodash";
import * as THREE from "three";

const BASE_URL = "https://washingtonthree.s3.us-east-2.amazonaws.com/tiles";
const TILES = [100, 300, 900, 2700, 8100, 24300];
const [XMIN, XMAX] = [389400, 408600];
const [YMIN, YMAX] = [124200, 148200];

const VERTEX_SHADER = `
uniform float zMin;
uniform float zMax;
uniform float size;
varying vec3 v_heightColor;

void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size;
  highp float height = (position.z - zMin) / (zMax - zMin) * 16581375.0;
  int h = int(height);
  if (h < 0) {
    h = h + 16581375;
  }
  float r = float(h % 256) / 256.0;
  float g = float((h / 256) % 256) / 256.0;
  float b = float((h / 65536) % 256) / 256.0;
  v_heightColor = vec3(b, b, 0.3);
}
`;

const FRAGMENT_SHADER = `
varying vec3 v_heightColor;
void main() {
	gl_FragColor = vec4(v_heightColor, 1.0);
}
`;

function tileSquareKeys(x, y, tile, length = 1) {
  const cx = Math.floor((x - XMIN) / tile);
  const cy = Math.floor((y - YMIN) / tile);
  const dists = _.range(-length + 1, length).flatMap((dx) =>
    _.range(-length + 1, length).map((dy) => [dx, dy])
  );
  const sortedDists = _.sortBy(dists, ([x, y]) => Math.abs(x) + Math.abs(y));
  return sortedDists.map(([dx, dy]) => {
    const tx = (cx + dx) * tile + XMIN;
    const ty = (cy + dy) * tile + YMIN;
    return `${tx}_${ty}_${tile}`;
  });
}

export class TileManager {
  constructor(scene) {
    this.scene = scene;
    this.visibleTiles = {};
    this.loadingTiles = {};
    this.brokenTiles = {};
  }

  async loadTile(tileKey, size = 1) {
    if (this.loadingTiles[tileKey] || this.brokenTiles[tileKey]) {
      return;
    }
    this.loadingTiles[tileKey] = Date.now();
    const tileUrl = `${BASE_URL}/tile_${tileKey}.json`;
    try {
      const response = await fetch(tileUrl);
      const points = await response.json();
      const zs = points.map((p) => p[2]);
      const zMin = _.min(zs) - 1.0;
      const zMax = Math.min(_.max(zs) + 1.0, zMin + 150);
      const pointsBuffer = _.flatten(points);
      const vertices = new Float32Array(pointsBuffer);
      const sizes = new Float32Array(points.map((p) => size));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          zMin: { type: "f", value: zMin },
          zMax: { type: "f", value: zMax },
          size: { type: "f", value: size },
        },
      });
      const mesh = new THREE.Points(geometry, material);
      this.scene.add(mesh);
      this.visibleTiles[tileKey] = mesh;
    } catch (err) {
      this.brokenTiles[tileKey] = true;
    }
  }

  discardUnloadedKeys(loadedKeys) {
    const visibleKeys = _.keys(this.visibleTiles);
    const evictKeys = _.difference(visibleKeys, loadedKeys);
    for (const evictKey of evictKeys) {
      const mesh = this.visibleTiles[evictKey];
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      delete this.visibleTiles[evictKey];
      delete this.loadingTiles[evictKey];
    }
  }

  async updatePosition(position) {
    // TODO: Get 1, 4, 9 closest tiles of various densities
    const tileKeyParams = [
      [tileSquareKeys(position.x, position.y, 8100, 4), 2, 100000000],
      [tileSquareKeys(position.x, position.y, 2700, 4), 2, 20000],
      [tileSquareKeys(position.x, position.y, 900, 4), 2, 5000],
      [tileSquareKeys(position.x, position.y, 300, 4), 2, 2000],
      [tileSquareKeys(position.x, position.y, 100, 3), 2, 700],
    ];
    const tilePromises = [];
    const loadedKeys = [];
    for (const [tileKeys, size, maxHeight] of tileKeyParams) {
      if (position.z > maxHeight) {
        continue;
      }
      for (const tileKey of tileKeys) {
        loadedKeys.push(tileKey);
        tilePromises.push(this.loadTile(tileKey, size));
      }
    }
    await Promise.all(tilePromises);
    this.discardUnloadedKeys(loadedKeys);
  }
}
