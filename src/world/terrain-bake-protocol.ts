import type { TerrainBakeData } from './terrain-bake-data';

export interface TerrainChunkRequest { cx: number; cy: number; season: number }
export type TerrainWorkerRequest = { kind: 'init'; data: TerrainBakeData } | ({ kind: 'bake' } & TerrainChunkRequest);
export type TerrainWorkerReply = { kind: 'ready' } | ({ kind: 'done'; bitmap: ImageBitmap; ms: number } & TerrainChunkRequest);
