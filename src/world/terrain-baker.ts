import { Terrain } from './terrain';
import type { TerrainBakeData } from './terrain-bake-data';

export class TerrainBaker {
  private readonly terrain: Terrain;

  constructor(data: TerrainBakeData) {
    this.terrain = Object.assign(new Terrain(), data);
  }

  bake(cx: number, cy: number, season: number): HTMLCanvasElement {
    this.terrain.season = season;
    return this.terrain.buildChunk(cx, cy).canvas;
  }
}
