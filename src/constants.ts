export const [XMIN, XMAX] = [397100, 397700];
export const [YMIN, YMAX] = [136700, 137300];
export const CX = (XMIN + XMAX) / 2;
export const CY = (YMIN + YMAX) / 2;

// @ts-ignore
export const BASE_URL = import.meta.env.DEV
  ? "http://localhost:8080/bintiles_resampled"
  : "https://s3.us-east-2.wasabisys.com/washingtonthree/bintiles_resampled";

export const HEIGHT_MAP_TEXTURE_URL =
  "https://s3.us-east-2.wasabisys.com/washingtonthree/textures/ground_heightmap_small.png";

export const CEILING_HEIGHT_TEXTURE_URL =
  "https://s3.us-east-2.wasabisys.com/washingtonthree/textures/ceiling_heightmap_small.png";
