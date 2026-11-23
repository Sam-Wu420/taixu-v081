// 恩怨与江湖重做 · 第三批（一）：NPC 执法
//
// 第二批的报官是后台结算：日子到了掷一次骰子。这一批让执法弟子、巡察使真的出发去抓人，写法照 pianju 的执法队：
//   · NPC 之间的劫道（living.rob 日结里、神识内当面的劫道斗法 npc.endDuel）记一笔「案底」（note，只往队列里推，不取随机数）；
//   · 玩家侧的日结（daily）把案底过一遍：有没有人看见、有没有人报案（荒郊野外少、城镇附近多，当着你的面的必报）；
//     报了的进第二批的通缉榜（enyuan 的 EyReport，多了 npc 字段：苦主、罪名），从报案的城镇 / 宗门派出一名执法弟子或巡察使；
//   · 你自己报的案（enyuan.report）也一样派人——你在城里就能看着他驾遁光出城；
//   · 追捕（frame）：画面外照直线赶路；进了你的神识范围，就真在路上追：通缉犯见了往远处逃，追上了当场斗法（npc 的 duel，能插手），
//     执法的赢了押走归案（npc.endDuel 先问这里），输了负伤退走、下回换个更强的来；两人都在画面外碰上了就在后台按实力结算；
//   · 结果进江湖传音（通缉榜的「看通缉榜」钩子），地图上标「执」字。
//
// 固定种子：note 在日结路径上，只往 ws.zfa.q 里推一条记录，不取随机数、不读游玩时间；其余都在玩家侧，随机一律用本模块的小随机数，
// 不动 Math.random（test-pursuit 等固定种子的测试按它的序列走）。执法弟子是本模块自己捏的人（不走 roster.pick / daoxin.mkNpc，那两处取 Math.random）。
import type { Game } from './game';
import type { NpcData, Active, Pers } from './npc';
import { npcMap, makeName, SECT_ROBE_OF } from './npc';
import type { EyReport } from './enyuan';
import { LOC_BY_ID, LOCATIONS, ACTIVE_MAP, WORLD_SCALE, type MapId } from '../data/world';
import { REALMS, realmName } from '../data/realms';
import { sectTitle, SECT_DEF } from './roster';
import { dirName } from './sites';
import { playOf, cn } from './feud';

// ============================================================ 存档
/** 一笔案底：谁在哪劫了谁（日结里记下，玩家侧再判有没有人看见、报案） */
export interface ZfNote { by: string; v: string; day: number; kind: 'rob' | 'kill'; at: string; x: number; y: number; map: string; loss: number; seen?: boolean }
/** 一趟追捕：哪张通缉、谁去拿、拿谁 */
export interface ZfCase { id: number; rep: number; law: string; tgt: string; st: 'go' | 'fight' | 'done'; told?: boolean; fled?: boolean; t0: number }
export interface ZfSave { v: 1; seq: number; q: ZfNote[]; cases: ZfCase[]; nextDay?: number; nextP?: number; gone?: string[] }

// ============================================================ 数值
/** 有人看见的概率：城镇附近 / 荒郊；当着你的面的必有人看见 */
export const ZF_SEE = { town: 0.75, wild: 0.4, kill: 0.15 };
/** 苦主自己去报案的概率（他还活着、又不是狠辣的人） */
export const ZF_SELF = 0.5;
/** 两张 NPC 通缉之间至少隔多久（日 + 游玩秒）；同时最多几张 NPC 之间的通缉 */
export const ZF_GAP_DAYS = 6, ZF_GAP_PLAY = 60, ZF_MAX_OPEN = 4;
/** 画面外赶路的速度（世界坐标 / 秒）；追上的距离；神识里开打的距离 */
export const ZF_SPEED = 700, ZF_MEET = 500, ZF_FIGHT = 650;
/** 神识里追：执法的每秒多赶多远（遁光）；通缉犯逃几个半秒跑不掉就站住拼命 */
export const ZF_DASH = 260, ZF_RUN = 8;
/** 你在多远之内会「神识中」看到一趟追捕 */
export const ZF_TELL = 12000;

let lcgS = 0x51f15e;
const lcg = () => { lcgS = (Math.imul(lcgS, 1664525) + 1013904223) >>> 0; return lcgS / 4294967296; };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const pw = (d: NpcData) => d.realm * 13 + d.stage;

/**
 * 本批自己捏人（执法弟子、巡察使、夺宝局的守卫、雇来的帮手）：随机数由调用方传进来，不碰 Math.random。
 * 捏出来的人进 npcs.list；没和你打过交道的，事情了结后由各自的系统收走。
 */
export function mkNpc3(g: Game, o: { realm: number; stage?: number; pers: Pers; faction: NpcData['faction']; sect?: string; x: number; y: number; map?: MapId; title?: string; why?: string; home?: string; favor?: number; sex?: 'm' | 'f' }, rnd: () => number): NpcData {
  const map = o.map ?? ACTIVE_MAP;
  const realm = clamp(Math.round(o.realm), 1, 5), R = REALMS[realm];
  const stage = clamp(o.stage ?? Math.floor(rnd() * R.stages.length), 0, R.stages.length - 1);
  const sex = o.sex ?? (rnd() < 0.3 ? 'f' : 'm');
  let home = o.home;
  if (!home) { let bd = 1e18; for (const l of LOCATIONS) { if (l.map !== map) continue; const dd = Math.hypot(l.x * WORLD_SCALE - o.x, l.y * WORLD_SCALE - o.y); if (dd < bd) { bd = dd; home = l.id; } } }
  const d: NpcData = {
    id: `f3_${Math.floor(g.day)}_${Math.floor(rnd() * 1e9).toString(36)}`, name: makeName(rnd, sex), sex, role: realm >= 3 ? 'elder' : 'cultivator',
    realm, stage, faction: o.faction, sect: o.sect, home: home ?? 'kuangye', pers: o.pers, favor: o.favor ?? 0, shown: o.favor ?? 0, grudge: 0, met: false, alive: true,
    age: 20 + rnd() * R.life * 0.4, life: R.life * (0.9 + rnd() * 0.2), x: o.x, y: o.y, tx: o.x, ty: o.y, goal: 'stay', until: g.day + 1e6,
    wealth: Math.round(20 * Math.pow(3, realm) * (0.5 + rnd())), seed: Math.floor(rnd() * 1e9), map, bag: {}, title: o.title,
    bio: o.why ? [{ d: Math.floor(g.day), t: o.why }] : [],
  };
  if (o.sect) d.robe = SECT_ROBE_OF(o.sect);
  g.npcs.list.push(d); g.npcs.byId.set(d.id, d);
  return d;
}
/** 收走一个本批捏的、没和你打过交道的人（不在画面里时） */
export function dropNpc3(g: Game, d: NpcData): boolean {
  if (d.met || d.bond || g.npcs.activeOf(d.id) || (d.grudge ?? 0) > 0) return false;
  g.npcs.forget(d.id);
  const k = g.npcs.list.indexOf(d); if (k >= 0) g.npcs.list.splice(k, 1);
  g.npcs.byId.delete(d.id);
  return true;
}

export class Zhifa {
  constructor(private readonly g: Game) {}
  get S(): ZfSave { const ws = this.g.ws as { zfa?: ZfSave }; return (ws.zfa ??= { v: 1, seq: 1, q: [], cases: [] }); }
  private t = 0;

  // ============================================================ 日结路径：只记一笔
  /** NPC d 劫了 v（living.rob 日结里调；npc.endDuel 当面的也调，seen = 你神识里看见了） */
  note(d: NpcData, v: NpcData, kind: 'rob' | 'kill', vd: number, loss: number, at: string, seen = false) {
    if (d.zf || d.db || v.zf) return;   // 执法弟子拿人、夺宝局里的打斗不算
    const q = this.S.q;
    q.push({ by: d.id, v: v.id, day: Math.floor(vd), kind, at, x: Math.round(d.x), y: Math.round(d.y), map: npcMap(d), loss: Math.round(loss), seen: seen || undefined });
    if (q.length > 8) q.splice(0, q.length - 8);
  }

  // ============================================================ 玩家侧日结：报案、贴通缉、派人
  daily() {
    const g = this.g, S = this.S, play = playOf(g), E = g.enyuan;
    S.q = S.q.filter((n) => g.day - n.day < 30);
    this.sweep();
    if (!S.q.length || g.day < (S.nextDay ?? 0) || play < (S.nextP ?? 0)) return;
    const open = E.S.reports.filter((r) => r.status === 'open' && r.npc).length;
    if (open >= ZF_MAX_OPEN) return;
    const n = S.q.shift()!;
    const d = g.npcs.byId.get(n.by), v = g.npcs.byId.get(n.v);
    if (!d?.alive || d.wanted !== undefined || d.canon || d.bond) return;
    const z = g.terrain?.inLocZone?.(n.x, n.y, 3000);
    const seeP = n.seen ? 1 : (z ? ZF_SEE.town : ZF_SEE.wild) + (n.kind === 'kill' ? ZF_SEE.kill : 0);
    const seen = lcg() < seeP;
    const self = !!v?.alive && v.pers !== 'ruthless' && lcg() < ZF_SELF;
    if (!seen && !self) { if (n.map === ACTIVE_MAP) E.news(`${n.at}出了一桩劫案，${v?.name ?? '苦主'}${n.kind === 'kill' ? '横死道旁' : '丢了财物'}，四下无人看见是谁下的手。`, { tone: 'mid', quiet: true }); return; }
    // 报到哪：离出事地点最近的城镇，或最近的正道宗门（执法堂）
    const L = this.nearestHall(n.x, n.y, n.map); if (!L) return;
    const crime = `${n.kind === 'kill' ? '劫杀' : '拦路劫掠'}${v?.name ?? '路人'}`;
    const rep = E.npcReport(d, L, { victim: v?.name ?? '路人', victimId: v?.id, crime, loss: n.loss, by: seen ? (n.seen ? '你' : '路人') : '苦主' });
    if (!rep) return;
    S.nextDay = g.day + ZF_GAP_DAYS; S.nextP = play + ZF_GAP_PLAY;
    this.dispatch(rep);
  }
  /** 出事地点附近的城镇或正道宗门 */
  nearestHall(x: number, y: number, map: string) {
    let best = null as (typeof LOCATIONS)[number] | null, bd = 1e18;
    for (const l of LOCATIONS) {
      if (l.map !== map || l.minor) continue;
      if (!(l.type === 'city' || l.type === 'town' || (l.type === 'sect' && !SECT_DEF.get(l.id)?.demon))) continue;
      const dd = Math.hypot(l.x * WORLD_SCALE - x, l.y * WORLD_SCALE - y); if (dd < bd) { bd = dd; best = l; }
    }
    return best;
  }

  // ============================================================ 派人
  /** 给一张通缉派一名执法弟子（宗门）/ 巡察使（城镇），从报案的地方出发 */
  dispatch(rep: EyReport): ZfCase | null {
    const g = this.g, S = this.S, crim = g.npcs.byId.get(rep.npcId), L = LOC_BY_ID.get(rep.where);
    if (!crim?.alive || !L || L.map !== npcMap(crim)) return null;
    if (S.cases.some((c) => c.rep === rep.id && c.st !== 'done')) return null;
    const sect = rep.at === 'sect' ? rep.where : undefined;
    const role = sect ? '执法弟子' : '巡察使';
    const realm = clamp(crim.realm + (rep.tries > 0 ? 1 : 0) + (lcg() < 0.35 ? 1 : 0), Math.max(1, crim.realm), 5);
    const cx = L.x * WORLD_SCALE, cy = L.y * WORLD_SCALE;
    const p = g.player, here = L.map === ACTIVE_MAP && Math.hypot(p.x - cx, p.y - cy) < 6000;
    // 你就在报案的地方：从你身边出发（看得见他驾遁光出城）
    const sx = here ? p.x + 160 : cx + (lcg() - 0.5) * 400, sy = here ? p.y - 60 : cy + 200;
    const law = mkNpc3(g, { realm, pers: lcg() < 0.6 ? 'righteous' : 'cautious', faction: sect ? 'sect' : 'rogue', sect, x: sx, y: sy, map: L.map as MapId, home: L.id, title: sect ? `${sectTitle(sect)}执法弟子` : `${L.name}巡察使`, why: `领了${L.name}的通缉令，去拿${crim.name}` }, lcg);
    const c: ZfCase = { id: S.seq++, rep: rep.id, law: law.id, tgt: crim.id, st: 'go', t0: playOf(g) };
    law.zf = { c: c.id, tgt: crim.id, role };
    S.cases.push(c); if (S.cases.length > 16) S.cases.splice(0, S.cases.length - 16);
    rep.law = law.id; rep.lawName = `${sect ? sectTitle(sect) : L.name}${role}${law.name}`; rep.lawRealm = law.realm;
    g.enyuan.news(`${L.name}${sect ? '执法堂' : ''}派出${role}${law.name}（${realmName(law.realm, law.stage)}），动身去拿通缉犯${crim.name}。`, { tone: 'mid', src: `${L.name}${sect ? '执法堂' : '坊市'}`, hook: { k: 'wanted' } });
    if (here) {
      const a = g.npcs.summon(law.id);
      if (a) { a.act = 'idle'; a.wait = 0; a.st.x = law.x = sx; a.st.y = law.y = sy; a.bubble = { text: `${crim.name}？我这就去拿人！`, t: 3.2 }; }
      g.toast(`${role}${law.name}领了通缉令，驾起遁光去拿${crim.name}了。`, 'info', { lv: 'high' });
    }
    return c;
  }

  // ============================================================ 每帧：追
  frame(dt: number) {
    this.t -= dt; if (this.t > 0) return;
    const step = 0.5 - this.t; this.t = 0.5;
    const g = this.g, S = this.S;
    if (!S.cases.length) return;
    const p = g.player;
    for (const c of S.cases) {
      if (c.st === 'done') continue;
      const law = g.npcs.byId.get(c.law), crim = g.npcs.byId.get(c.tgt), rep = g.enyuan.S.reports.find((r) => r.id === c.rep);
      if (!rep || rep.status !== 'open') { this.release(c); continue; }
      if (!law?.alive) { this.release(c); rep.law = undefined; continue; }
      if (!crim?.alive) { this.release(c); continue; }
      if (npcMap(law) !== npcMap(crim)) { law.map = npcMap(crim); law.x = crim.x + 3000; law.y = crim.y; }   // 跨了图：执法的跟过去（画面外）
      if (npcMap(law) !== ACTIVE_MAP) continue;
      const aL = g.npcs.activeOf(law.id), aC = g.npcs.activeOf(crim.id);
      const dd = Math.hypot(law.x - crim.x, law.y - crim.y);
      // 神识中：远远看见一趟追捕
      if (!c.told && Math.hypot(law.x - p.x, law.y - p.y) < ZF_TELL && !g.offWorld && !g.inCave) {
        c.told = true;
        const li = Math.max(1, Math.round(Math.hypot(crim.x - p.x, crim.y - p.y) / 5400));
        g.toast(`神识中：${law.title ?? '执法弟子'}${law.name}正追着通缉犯${crim.name}，往你${dirName(crim.x - p.x, crim.y - p.y)}${cn(li)}里外去了。`, 'info', { lv: 'low' });
      }
      if (aL && aC) {
        if (aL.duel || aC.duel) { c.st = 'fight'; continue; }
        if (aL.enemy || aC.enemy) continue;   // 你插手了：交给战斗
        if (dd < ZF_FIGHT) { this.engage(c, aL, aC); continue; }
        law.tx = crim.x; law.ty = crim.y; aL.wait = 0; if (aL.act !== 'walk') aL.act = 'walk';
        // 执法的驾遁光追（比走路快）：每半秒多赶一截
        { const ux = (crim.x - law.x) / (dd || 1), uy = (crim.y - law.y) / (dd || 1), s = Math.min(dd - ZF_FIGHT * 0.8, ZF_DASH * step); if (s > 0) { aL.st.x = law.x = law.x + ux * s; aL.st.y = law.y = law.y + uy * s; aL.st.faceToward(ux, uy); } }
        // 通缉犯见了执法的往远处逃；逃了一阵跑不掉，就站住拼命
        if (dd < 2600 && !crim.zfRun) { crim.zfRun = 1; aC.bubble = { text: `${law.title?.includes('执法') ? '执法堂' : '巡察'}的鹰犬？！`, t: 2.4 }; aL.bubble = { text: `${crim.name}，站住！`, t: 2.4 }; }
        if (crim.zfRun) {
          crim.zfRun++;
          if (crim.zfRun < ZF_RUN) { const ux = (crim.x - law.x) / (dd || 1), uy = (crim.y - law.y) / (dd || 1); crim.tx = crim.x + ux * 1400; crim.ty = crim.y + uy * 1400; aC.wait = 0; aC.act = 'walk'; }
          else if (crim.zfRun === ZF_RUN) { crim.tx = crim.x; crim.ty = crim.y; aC.act = 'idle'; aC.wait = 3; aC.bubble = { text: '跑不掉了——拼了！', t: 2.4 }; }
        }
        continue;
      }
      if (aL && !aC) { law.tx = crim.x; law.ty = crim.y; aL.wait = 0; if (aL.act !== 'walk' && !aL.duel && !aL.enemy) aL.act = 'walk'; continue; }
      if (aC && !aL) {   // 他还在画面外，照直线赶过来
        this.fly(law, crim.x, crim.y, step);
        continue;
      }
      // 都在画面外：照直线追；追上了在后台按实力结算
      if (dd < ZF_MEET) { this.resolve(c, law, crim, rep); continue; }
      this.fly(law, crim.x, crim.y, step);
    }
  }
  private fly(d: NpcData, x: number, y: number, dt: number) {
    const dx = x - d.x, dy = y - d.y, dd = Math.hypot(dx, dy) || 1, s = Math.min(dd, ZF_SPEED * dt);
    d.x += dx / dd * s; d.y += dy / dd * s; d.tx = d.x; d.ty = d.y;
  }
  /** 当着你的面：执法的追上了，斗法 */
  engage(c: ZfCase, aL: Active, aC: Active) {
    const g = this.g, law = aL.d, crim = aC.d;
    aL.duel = { foe: aC, hp: 1, cd: 0.5, t: 0 }; aC.duel = { foe: aL, hp: 1, cd: 0.9, t: 0 };
    aL.act = aC.act = 'duel'; aL.life = aC.life = undefined;
    aL.bubble = { text: `奉${law.title?.replace(/执法弟子|巡察使/, '') || '执法堂'}之命，拿你归案！`, t: 3 };
    aC.bubble = { text: crim.pers === 'ruthless' ? '想拿我？拿命来换！' : '欺人太甚！', t: 3 };
    c.st = 'fight';
    g.npcs.gatherWatchers((aL.st.x + aC.st.x) / 2, (aL.st.y + aC.st.y) / 2, [aL, aC]);
    if (g.life.vis({ x: aL.st.x, y: aL.st.y }) > 0.3 || g.life.vis({ x: aC.st.x, y: aC.st.y }) > 0.3) g.toast(`神识中：${law.title ?? '执法弟子'}${law.name}追上了通缉犯${crim.name}，两人斗起法来！（靠近可插手）`, 'info');
  }
  /** npc.endDuel 先问这里：是一趟追捕就由这里结（不走寻常的斩杀、掉袋） */
  duelEnd(win: Active, lose: Active): boolean {
    const g = this.g, S = this.S;
    const c = S.cases.find((x) => x.st !== 'done' && ((x.law === win.d.id && x.tgt === lose.d.id) || (x.law === lose.d.id && x.tgt === win.d.id)));
    if (!c) return false;
    const rep = g.enyuan.S.reports.find((r) => r.id === c.rep);
    win.duel = lose.duel = undefined; win.act = lose.act = 'idle';
    if (!rep || rep.status !== 'open') { this.release(c); return true; }
    if (win.d.id === c.law) {
      win.bubble = { text: '拿下！随我回去听候发落。', t: 3 };
      lose.bubble = { text: '……栽了。', t: 2.5 };
      g.enyuan.caught(rep, lose.d, rep.lawName ?? win.d.name, true);
    } else {
      lose.act = 'flee'; lose.bubble = { text: '此獠好生厉害……回去请援！', t: 3 };
      win.bubble = { text: '回去告诉你们的人，少来管我！', t: 3 };
      this.lost(c, rep, win.d, true);
    }
    return true;
  }
  /** 两人都在画面外碰上了：按实力结算 */
  private resolve(c: ZfCase, law: NpcData, crim: NpcData, rep: EyReport) {
    const p = clamp(0.55 + (pw(law) - pw(crim)) * 0.03, 0.15, 0.92);
    if (lcg() < p) this.g.enyuan.caught(rep, crim, rep.lawName ?? law.name, false);
    else this.lost(c, rep, crim, false);
  }
  /** 执法的没拿住：负伤退走；第一回换个更强的再来，第二回通缉犯远遁 */
  private lost(c: ZfCase, rep: EyReport, crim: NpcData, seen: boolean) {
    const g = this.g, E = g.enyuan;
    this.release(c); rep.law = undefined;
    rep.tries++;
    if (rep.tries >= 2) { E.fled(rep); return; }
    E.news(`${rep.lawName ?? '执法弟子'}追上了通缉犯${crim.name}，${seen ? '当着众人' : ''}斗了一场，反被打伤退回。${rep.whereName}说要再派人去。`, { tone: 'bad', hook: { k: 'wanted' } });
    rep.dueDay = g.day + 15; rep.dueP = playOf(g) + 4 * 60;
    this.dispatch(rep);
  }
  /** 一趟追捕了结（拿到了 / 没拿到 / 通缉撤了）：执法的回去 */
  release(c: ZfCase | number) {
    const S = this.S, cc = typeof c === 'number' ? S.cases.find((x) => x.rep === c && x.st !== 'done') : c;
    if (!cc || cc.st === 'done') return;
    cc.st = 'done';
    const g = this.g, law = g.npcs.byId.get(cc.law), crim = g.npcs.byId.get(cc.tgt);
    if (crim) crim.zfRun = undefined;
    if (law) { law.zf = undefined; law.tx = law.x; law.ty = law.y; (S.gone ??= []).push(law.id); }
  }
  /** 回去了的执法弟子不在画面里、也没和你打过交道，就收走 */
  private sweep() {
    const g = this.g, S = this.S; if (!S.gone?.length) return;
    S.gone = S.gone.filter((id) => { const d = g.npcs.byId.get(id); if (!d) return false; if (!d.alive) return false; return !dropNpc3(g, d); });
    S.cases = S.cases.filter((c) => c.st !== 'done');
  }
  /** 有没有执法弟子在拿这个人（enyuan.reportTick 问：当着你的面在追，就别在后台结算） */
  chasingNow(rep: EyReport) {
    const g = this.g; if (!rep.law) return false;
    const law = g.npcs.byId.get(rep.law); if (!law?.alive) return false;
    const crim = g.npcs.byId.get(rep.npcId); if (!crim?.alive) return false;
    return !!g.npcs.activeOf(law.id) && !!g.npcs.activeOf(crim.id) && Math.hypot(law.x - crim.x, law.y - crim.y) < 4000;   // 两人都在你神识里、快碰上了
  }

  // ============================================================ 地图
  marks(): { x: number; y: number; glyph: string; color: string; name: string }[] {
    const g = this.g, out: { x: number; y: number; glyph: string; color: string; name: string }[] = [];
    for (const c of this.S.cases) {
      if (c.st === 'done') continue;
      const law = g.npcs.byId.get(c.law), crim = g.npcs.byId.get(c.tgt);
      if (law?.alive && npcMap(law) === ACTIVE_MAP) out.push({ x: law.x, y: law.y, glyph: '执', color: '#ffd27a', name: `${law.title ?? '执法弟子'}${law.name}：去拿${crim?.name ?? '通缉犯'}` });
    }
    return out;
  }
}
