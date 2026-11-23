import type { Terrain } from './terrain';
import type { TerrainChunkRequest, TerrainWorkerReply, TerrainWorkerRequest } from './terrain-bake-protocol';

export interface TerrainWorkerPort {
  onmessage: ((event: MessageEvent<TerrainWorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: TerrainWorkerRequest): void;
  terminate(): void;
}
type WorkerFactory = () => Promise<TerrainWorkerPort | null>;
type State = 'starting' | 'ready' | 'fallback';

async function makeWorker(): Promise<TerrainWorkerPort | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !OffscreenCanvas.prototype.transferToImageBitmap) return null;
  const module = await import('./terrain.worker?worker&inline');
  return new module.default();
}

export class TerrainChunkJobs {
  private worker: TerrainWorkerPort | null = null;
  private state: State = 'starting';
  private wanted: TerrainChunkRequest[] = [];
  private wantedKeys = new Set<string>();
  private inflight: TerrainChunkRequest | null = null;
  private disposed = false;
  private completed = 0;
  private discarded = 0;
  private lastBakeMs = 0;

  constructor(private readonly terrain: Terrain, factory: WorkerFactory = makeWorker) {
    void factory().then(worker => {
      if (this.disposed) { worker?.terminate(); return; }
      if (!worker) { this.state = 'fallback'; return; }
      this.worker = worker;
      worker.onmessage = event => this.receive(event.data);
      worker.onerror = event => { console.warn('地形后台烘焙失败，回退同步生成', event.message); this.fail(); };
      worker.postMessage({ kind: 'init', data: terrain.bakeData() });
    }).catch(error => { if (!this.disposed) { console.warn('地形后台烘焙不可用，回退同步生成', error); this.fail(); } });
  }

  request(order: readonly { cx: number; cy: number }[]): boolean {
    if (this.state === 'fallback') return false;
    const season = this.terrain.season;
    this.wanted = order.map(({ cx, cy }) => ({ cx, cy, season }));
    this.wantedKeys = new Set(this.wanted.map(({ cx, cy }) => cx + ',' + cy));
    this.pump();
    return true;
  }

  get stats() {
    let queued = 0;
    for (const request of this.wanted) {
      const chunk = this.terrain.chunks.get(request.cx + ',' + request.cy);
      if ((!chunk || chunk.preview || chunk.season !== request.season) && (request.cx !== this.inflight?.cx || request.cy !== this.inflight.cy || request.season !== this.inflight.season)) queued++;
    }
    return { state: this.state, queued, inflight: !!this.inflight, completed: this.completed, discarded: this.discarded, lastBakeMs: this.lastBakeMs };
  }

  dispose(): void { this.disposed = true; this.worker?.terminate(); this.worker = null; this.state = 'fallback'; this.inflight = null; this.wanted = []; this.wantedKeys.clear(); }

  private fail(): void { this.dispose(); }

  private receive(reply: TerrainWorkerReply): void {
    if (this.disposed) { if (reply.kind === 'done') reply.bitmap.close(); return; }
    if (reply.kind === 'ready') { this.state = 'ready'; this.pump(); return; }
    this.inflight = null; this.lastBakeMs = reply.ms;
    if (reply.season === this.terrain.season && this.wantedKeys.has(reply.cx + ',' + reply.cy)) {
      this.terrain.adoptChunk(reply.cx, reply.cy, reply.season, reply.bitmap); this.completed++;
    } else { reply.bitmap.close(); this.discarded++; }
    this.pump();
  }

  private pump(): void {
    if (this.state !== 'ready' || this.inflight) return;
    for (const request of this.wanted) {
      const chunk = this.terrain.chunks.get(request.cx + ',' + request.cy);
      if (chunk && !chunk.preview && chunk.season === request.season) continue;
      this.inflight = request;
      this.worker!.postMessage({ kind: 'bake', ...request });
      return;
    }
  }
}

const instances = new WeakMap<Terrain, TerrainChunkJobs>();
export function terrainChunkJobs(terrain: Terrain, factory?: WorkerFactory): TerrainChunkJobs {
  let jobs = instances.get(terrain);
  if (!jobs) { jobs = new TerrainChunkJobs(terrain, factory); instances.set(terrain, jobs); }
  return jobs;
}
export function releaseTerrainChunkJobs(terrain: Terrain): void {
  const jobs = instances.get(terrain);
  if (jobs) { jobs.dispose(); instances.delete(terrain); }
}
