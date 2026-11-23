import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
import { getLayout, LOC_SCALE } from '../src/gfx/building';
import { TownSpace } from '../src/world/townspace';
import { grandSectPlan } from '../src/data/sectPlan';
import type { Game } from '../src/world/game';

export type SceneId = 'qixuan' | 'huangfeng' | 'jingzhou' | 'yejia';
export interface Point { x: number; y: number }
export interface Route { id: SceneId; name: string; points: Point[]; description: string }

export const sceneMaps: Record<SceneId, 'tiannan' | 'dajin'> = {
  qixuan: 'tiannan', huangfeng: 'tiannan', jingzhou: 'tiannan', yejia: 'dajin',
};

function roadPaths(segments: Float32Array): Point[][] {
  const paths: Point[][] = [];
  let path: Point[] = [];
  for (let i = 0; i < segments.length; i += 8) {
    const a = { x: segments[i], y: segments[i + 1] }, b = { x: segments[i + 2], y: segments[i + 3] };
    const last = path[path.length - 1];
    if (last && (last.x !== a.x || last.y !== a.y)) { paths.push(path); path = []; }
    if (!path.length) path.push(a);
    path.push(b);
  }
  if (path.length) paths.push(path);
  return paths;
}

function passable(game: Game, path: readonly Point[]): boolean {
  const space = new TownSpace();
  for (let i = 0; i < path.length; i++) {
    const start = path[Math.max(0, i - 1)], end = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 30));
    let previous = start;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps, point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      space.update(0.6, point.x, point.y);
      if (game.terrain.walkFactor(point.x, point.y) <= 0 || space.blocked(point.x, point.y)
        || !game.terrain.canTraverse(previous.x, previous.y, point.x, point.y)) return false;
      previous = point;
    }
  }
  return true;
}

export function sectRoute(game: Game, id: 'qixuan' | 'huangfeng'): Route {
  const loc = LOC_BY_ID.get(id)!;
  // P10 起宗门是一座山（大宗门占山、一般宗门是小号）：山道不再通到宗门中心，而是接到山脚的引道口（gateOut），
  // 从那里起是宗门自己的登山石阶，一直上到山门广场（gate）。所以「真实道路」= 通到引道口的那条路 + 引道石阶。
  const plan = grandSectPlan(loc), ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE;
  const center = plan ? { x: ox + plan.gateOut.x, y: oy + plan.gateOut.y } : { x: ox, y: oy };
  const stair: Point[] = [];
  if (plan) { const n = Math.max(2, Math.ceil(Math.hypot(plan.gate.x - plan.gateOut.x, plan.gate.y - plan.gateOut.y) / 120)); for (let k = 1; k <= n; k++) stair.push({ x: ox + plan.gateOut.x + (plan.gate.x - plan.gateOut.x) * k / n, y: oy + plan.gateOut.y + (plan.gate.y - plan.gateOut.y) * k / n - (k === n ? 120 : 0) }); }
  const distance = (p: Point) => Math.hypot(p.x - center.x, p.y - center.y);
  const routes: Point[][] = [];
  for (const points of roadPaths(game.terrain.roadSegW)) {
    const first = distance(points[0]), last = distance(points[points.length - 1]);
    if (Math.min(first, last) > 60) continue;
    const outward = first <= last ? points : [...points].reverse();
    const path: Point[] = [];
    for (const point of outward) {
      if (distance(point) > 4500) break;
      path.push(point);
    }
    const full = [...path].reverse().concat(stair);
    if (path.length >= 4 && passable(game, full)) routes.push(full);
  }
  routes.sort((a, b) => game.terrain.surfaceHeight(a[0].x, a[0].y) - game.terrain.surfaceHeight(b[0].x, b[0].y));
  if (!routes.length) throw new Error(`${loc.name}没有找到可步行的真实道路`);
  const points = routes[0], start = points[0], end = points[points.length - 1];
  const rise = game.terrain.surfaceHeight(end.x, end.y) - game.terrain.surfaceHeight(start.x, start.y);
  return { id, name: `${loc.name}登山`, points, description: `真实道路 ${points.length - stair.length} 点 + 引道石阶 ${stair.length} 点；山脚到山门高差 ${rise.toFixed(1)}` };
}

export function townRoute(game: Game, id: 'jingzhou' | 'yejia'): Route {
  const loc = LOC_BY_ID.get(id)!;
  const layout = getLayout(loc);
  // 镜州：P10 起是成片街坊的新城（城池代理的布局），房屋构件叫 chouse；取一座前街走得通的
  const front = (p: { x: number; y: number }) => { const x = loc.x * WORLD_SCALE + p.x * LOC_SCALE, y = loc.y * WORLD_SCALE + p.y * LOC_SCALE; return passable(game, [{ x: x - 240, y: y + 250 }, { x: x + 240, y: y + 250 }]); };
  const piece = id === 'jingzhou'
    ? layout.pieces.find(p => p.kind === 'house') ?? layout.pieces.find(p => p.kind === 'chouse' && front(p))
    : layout.pieces.find(p => p.kind === 'B' && p.p.k === 'j07_gate');
  if (!piece) throw new Error(`${loc.name}缺少验收建筑`);
  const x = loc.x * WORLD_SCALE + piece.x * LOC_SCALE, y = loc.y * WORLD_SCALE + piece.y * LOC_SCALE;
  const points = id === 'jingzhou'
    ? [{ x: x - 240, y: y + 250 }, { x: x + 240, y: y + 250 }]
    : [{ x, y: y + 350 }, { x, y: y - 350 }];
  if (!passable(game, points)) throw new Error(`${loc.name}验收起终点不可步行`);
  return { id, name: id === 'jingzhou' ? '镜州建筑' : '叶家城墙门洞', points,
    description: id === 'jingzhou' ? '原版房屋前街，可旋转观察四面' : '沿原城门中线行走，观察门洞与建筑遮挡' };
}

/** 只设置目的地，由 Game.update 执行正常移动与碰撞。 */
export class RouteRunner {
  active = false;
  arrived = false;
  direction: 1 | -1 = 1;
  waypoint = 1;
  distance = 0;
  stuckSeconds = 0;
  readonly length: number;
  private previous: Point;

  constructor(private readonly game: Game, readonly route: Route) {
    this.previous = { x: game.player.x, y: game.player.y };
    this.length = route.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y), 0);
  }

  start(): void { this.active = true; this.arrived = false; this.stuckSeconds = 0; this.rebase(); }
  pause(): void { this.active = false; this.game.destination = null; this.stuckSeconds = 0; }
  reverse(): void {
    this.direction = this.direction === 1 ? -1 : 1;
    this.waypoint = Math.max(0, Math.min(this.route.points.length - 1, this.waypoint + this.direction));
    this.start();
  }
  rebase(): void { this.previous = { x: this.game.player.x, y: this.game.player.y }; }
  align(): void {
    const p = this.game.player, points = this.route.points;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.hypot(points[i].x - p.x, points[i].y - p.y)
      < Math.hypot(points[best].x - p.x, points[best].y - p.y)) best = i;
    this.waypoint = best;
    this.rebase();
  }

  step(dt: number): void {
    const p = this.game.player, moved = Math.hypot(p.x - this.previous.x, p.y - this.previous.y);
    this.previous = { x: p.x, y: p.y };
    if (!this.active) return;
    this.distance += moved;
    if (this.game.halted || this.game.hero.dead) { this.stuckSeconds = 0; return; }
    this.stuckSeconds = moved < 0.1 ? this.stuckSeconds + dt : 0;
    const points = this.route.points;
    while (Math.hypot(points[this.waypoint].x - p.x, points[this.waypoint].y - p.y) < 30) {
      const next = this.waypoint + this.direction;
      if (next < 0 || next >= points.length) {
        this.active = false; this.arrived = true; this.game.destination = null; return;
      }
      this.waypoint = next;
    }
    const target = points[this.waypoint];
    this.game.setDestination(target.x, target.y);
  }
}
