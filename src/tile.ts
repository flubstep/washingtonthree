import _ from "lodash";
import * as THREE from "three";

import { BASE_URL, XMAX, XMIN, YMAX, YMIN } from "./constants";
import FRAGMENT_SHADER from "./shaders/fragment.glsl";
import VERTEX_SHADER from "./shaders/vertex.glsl";

// Computes which tile keys to load around a given position and a radius
function tileSquareKeys(x: number, y: number, tile: number, length = 1) {
  const cx = Math.floor((x - XMIN) / tile);
  const cy = Math.floor((y - YMIN) / tile);
  const dists = _.range(-length + 1, length).flatMap((dx) =>
    _.range(-length + 1, length).map((dy) => [dx, dy])
  );
  const sortedDists = _.sortBy(dists, ([x, y]) => Math.abs(x) + Math.abs(y));
  const keys = sortedDists.map(([dx, dy]) => {
    const tx = (cx + dx) * tile + XMIN;
    const ty = (cy + dy) * tile + YMIN;
    if (tx < XMIN || tx >= XMAX || ty < YMIN || ty >= YMAX) {
      return null;
    }
    return `${tx}_${ty}_${tile}`;
  });
  return _.compact(keys);
}

let pointsLoaded = 0;

export class TileManager {
  // For each tile length, the radius of tiles to load around the camera
  // and the max height at which the tiles are displayable
  public tileConfigurations: { [key: string]: { radius: number; maxHeight: number } } = {
    100: { radius: 8, maxHeight: 100000000 },
  };
  // Tiles that are loaded and added to the scene
  private visibleTiles: { [key: string]: THREE.Points } = {};
  // Cache of tile keys that have been loaded
  private loadedKeys: string[] = [];
  // Tiles that are currently being downloaded
  private loadingTiles: { [key: string]: number } = {};
  // Keep track of which tiles 404'ed so we don't request them again
  private brokenTiles: { [key: string]: boolean } = {};
  constructor(
    public scene: THREE.Scene,
    public heightMapTexture: THREE.Texture,
    public ceilingMapTexture: THREE.Texture
  ) {}

  async loadTile(tileKey: string, size = 1.5) {
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
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

      pointsLoaded += vertices.length / 3;

      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          size: { value: size },
          ground: { value: this.heightMapTexture },
          ceiling: { value: this.ceilingMapTexture },
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
    return;
  }

  async updatePosition(position: THREE.Vector3) {
    const tilePromises = [];
    const loadedKeys = [];
    for (const tileLength in this.tileConfigurations) {
      const { radius, maxHeight } = this.tileConfigurations[tileLength];
      const tileKeys = tileSquareKeys(position.x, position.y, parseInt(tileLength), radius);
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
