import _ from "lodash";
import * as THREE from "three";

const BASE_URL = "https://s3.us-east-2.wasabisys.com/washingtonthree/bintiles";
const [XMIN, YMIN] = [389400, 124200];

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
  int bi = (h / 65536);
  int gi = (h - bi * 65536) / 256;
  int ri = (h - bi * 65536 - gi * 256);
  float r = float(ri) / 256.0;
  float g = float(gi) / 256.0;
  float b = float(bi) / 256.0;
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
    this.loadedKeys = [];
    this.loadingTiles = {};
    this.brokenTiles = {};
  }

  async loadTile(tileKey, size = 2) {
    if (this.loadingTiles[tileKey] || this.brokenTiles[tileKey]) {
      return;
    }
    if (!this.loadedKeys.includes(tileKey)) {
      return;
    }
    this.loadingTiles[tileKey] = Date.now();
    const tileUrl = `${BASE_URL}/tile_${tileKey}.bin`;
    try {
      const response = await fetch(tileUrl);
      if (!this.loadedKeys.includes(tileKey)) {
        if (this.loadingTiles[tileKey]) {
          delete this.loadingTiles[tileKey];
        }
        return;
      }
      const buffer = await response.arrayBuffer();
      if (!this.loadedKeys.includes(tileKey)) {
        if (this.loadingTiles[tileKey]) {
          delete this.loadingTiles[tileKey];
        }
        return;
      }
      const vertices = new Float32Array(buffer);
      const zMin = vertices[2];
      const zMax = vertices[vertices.length - 1];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

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

  discardUnloadedKeys() {
    const visibleKeys = _.keys(this.visibleTiles);
    const evictKeys = _.difference(visibleKeys, this.loadedKeys);
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
      [tileSquareKeys(position.x, position.y, 8100, 5), 100000000],
      [tileSquareKeys(position.x, position.y, 2700, 5), 20000],
      [tileSquareKeys(position.x, position.y, 900, 5), 5000],
      [tileSquareKeys(position.x, position.y, 300, 5), 2000],
      [tileSquareKeys(position.x, position.y, 100, 5), 700],
    ];
    const tilePromises = [];
    const loadedKeys = [];
    for (const [tileKeys, maxHeight] of tileKeyParams) {
      if (position.z > maxHeight) {
        continue;
      }
      for (const tileKey of tileKeys) {
        loadedKeys.push(tileKey);
        tilePromises.push();
      }
    }
    this.loadedKeys = loadedKeys;
    await Promise.all(loadedKeys.map((tileKey) => this.loadTile(tileKey)));
    this.discardUnloadedKeys();
  }
}
