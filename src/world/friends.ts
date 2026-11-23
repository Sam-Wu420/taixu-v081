// v0.54：友——社交不再只围着知交转
// - 友人录：同行 · 知交（好友以上 / 结拜 / 师徒）· 知交 · 邀约
// - 同行最多三人（含伴侣）：跟随 / 原地等候 / 散去；不在身边的好友可传音相邀，按路程几日后赶到（也可能推辞）
// - NPC 主动邀约：好友会传音约你「同探古修洞府」或「被围求援」。有真有假——心怀鬼胎的人约你，
//   会合处可能埋着伏兵，或者干脆是要杀人夺宝（表里两张脸见 renxin.ts）。读心、阅历、神识外放能看出几分蹊跷
import { pressKey } from '../core/keymap';   // 第五轮：说明里的键位从 keymap 取，触屏换说法
import type { Game } from './game';
import type { NpcData } from './npc';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, LOCATIONS, WORLD_SCALE, MAP_NAME, LOC_BY_ID } from '../data/world';
import { BEAUTIES } from '../data/beauties';
import { SECT_DEF } from './roster';
import { foeRealm } from './demog';
import { dirName } from './sites';
import * as C from './cultivation';
import { MIJING_ON } from '../data/mijing';
import { itemDef } from '../data/items';
import { audio } from './audio';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const TAU = Math.PI * 2;

export type InviteKind = 'explore' | 'help';
export interface Invite {
  id: number; npc: string; kind: InviteKind; map: string; x: number; y: number; place: string;
  day: number; until: number; trap: boolean; accepted?: boolean; done?: boolean; declined?: boolean; fired?: boolean;
}
export interface Remote { id: string; arrive: number }
interface FrState { invites: Invite[]; next: number; remote: Remote[]; seq: number }

export class FriendsSys {
  /** 正在进行的会合事件（伏兵 / 求援之战） */
  private scene: { inv: Invite; foes: Enemy[]; t: number; turned: boolean } | null = null;
  constructor(public game: Game) {}
  reset() { this.scene = null; }
  restore() {
    this.reset();
    const state = (this.game.ws as { fr?: FrState }).fr;
    if (state) for (const invite of state.invites) if (invite.fired && !invite.done) invite.fired = false;
  }
  get S(): FrState { const ws = this.game.ws as any; return (ws.fr ??= { invites: [], next: this.game.day + 8 + Math.random() * 10, remote: [], seq: 1 }); }
  get npcs() { return this.game.npcs; }

  // ------------------------------------------------------------ 名册
  /** 知交：见过面、好感三十以上，或结拜 / 师徒 */
  friends(): NpcData[] {
    const out: NpcData[] = [];
    for (const d of this.npcs.list) {
      if (!d.alive || !d.met || d.beauty || (d.grudge ?? 0) > 0) continue;
      if (d.favor >= 30 || d.bond === 'sworn' || d.bond === 'master' || d.bond === 'disciple') out.push(d);
    }
    return out.sort((a, b) => (b.bond ? 50 : 0) + b.favor - ((a.bond ? 50 : 0) + a.favor));
  }
  /** 同行者（含伴侣） */
  party() { return this.npcs.followers(); }
  partyMax() { return 3; }
  partyFull() { return this.party().length + this.S.remote.length >= this.partyMax(); }
  isWaiting(d: NpcData) { return !!(d as any).waitAt; }
  where(d: NpcData): string {
    const g = this.game, map = d.map ?? 'tiannan';
    if (map !== ACTIVE_MAP) return MAP_NAME[map as keyof typeof MAP_NAME] ?? '他图';
    const a = this.npcs.activeOf(d.id);
    if (a && a.act === 'follow') return '同行中';
    const dist = Math.hypot(d.x - g.player.x, d.y - g.player.y);
    if (dist < 1200) return '就在附近';
    return `${dirName(d.x - g.player.x, d.y - g.player.y)}方约 ${Math.max(1, Math.round(dist / 260))} 里`;
  }
  sectName(d: NpcData) { return d.sect ? SECT_DEF.get(d.sect)?.name ?? '' : d.faction === 'rogue' ? '散修' : ''; }

  // ------------------------------------------------------------ 同行指令
  setWait(d: NpcData, on: boolean) {
    const a = this.npcs.activeOf(d.id);
    if (on && a) (d as any).waitAt = { x: a.st.x, y: a.st.y };
    else delete (d as any).waitAt;
  }
  waitAll(on: boolean) { for (const a of this.party()) this.setWait(a.d, on); }
  dismiss(d: NpcData) {
    const g = this.game;
    delete (d as any).waitAt;
    if (d.beauty) { g.hearts.setFollow(d.beauty, false); return; }
    if (d.bond === 'companion' || d.bond === 'guard') { d.bond = undefined; d.bondUntil = undefined; }
    this.npcs.dismiss(d.id);
    g.toast(`${d.name}拱手作别：「后会有期。」`, 'info');
  }
  /** 当面 / 传音邀人同行；返回回话 */
  invite(d: NpcData): string {
    const g = this.game, h = g.hero;
    if (this.S.remote.some((r) => r.id === d.id)) return `${d.name}已在赶来的路上。`;
    if (this.npcs.activeOf(d.id)?.act === 'follow') return `${d.name}已在同行。`;
    if (this.partyFull()) return `同行已满（最多 ${this.partyMax()} 人）。`;
    if (g.jianghu?.credBlocksTeam?.()) return '你信义不佳，没人愿与你同行。';
    if (d.hunting || d.chasing) return `${d.name}正忙着别的事，脱不开身。`;
    const a = this.npcs.activeOf(d.id);
    const near = (d.map ?? 'tiannan') === ACTIVE_MAP && Math.hypot((a ? a.st.x : d.x) - g.player.x, (a ? a.st.y : d.y) - g.player.y) < 600;
    const sworn = d.bond === 'sworn' || d.bond === 'master' || d.bond === 'disciple';
    if (!near && d.favor < 40 && !sworn) return `与${d.name}交情还浅（好感 40 以上才肯应你的传音）。`;
    const ch = clamp(0.35 + (d.favor - 30) / 80 + (sworn ? 0.35 : 0) - (d.pers === 'aloof' ? 0.25 : 0) - (d.realm > h.realm ? 0.15 : 0), 0.08, 0.97);
    if (Math.random() > ch) { (d as any).inviteCd = g.day + 5; return pick([`${d.name}回信：「近日闭关，恕难从命。」`, `${d.name}回信：「手头有桩要紧事，下回吧。」`, `${d.name}婉言谢绝了。`]); }
    if (near) {
      d.bond = sworn ? d.bond : 'companion'; d.bondUntil = g.day + 30; if (sworn) d.helpUntil = g.time + 30 * 2 * 60;
      this.npcs.summon(d.id);
      return `${d.name}欣然应允：「好，路上也有个照应。」`;
    }
    const dist = (d.map ?? 'tiannan') === ACTIVE_MAP ? Math.hypot(d.x - g.player.x, d.y - g.player.y) : 120000;
    const days = clamp(Math.round(dist / 26000) + 1, 1, 7);
    this.S.remote.push({ id: d.id, arrive: g.day + days });
    g.rel?.log?.(`传音邀${d.name}同行，约 ${days} 日后赶到。`);
    return `${d.name}回信：「${days} 日内必到。」（到了自会寻到你身边）`;
  }

  // ------------------------------------------------------------ 邀约
  /** 心怀鬼胎：表面亲热、心里另有打算的人 */
  private schemer(d: NpcData) {
    const shown = (d as any).shown ?? d.favor;
    return (d.pers === 'greedy' || d.pers === 'ruthless') && (shown - d.favor > 12 || d.favor < 42);
  }
  /** 看得出蹊跷：神识外放、境界高两层、阅历（骗局吃过亏）、天衍诀 / 明清灵目 */
  sees(inv: Invite): boolean {
    const g = this.game, h = g.hero, d = this.npcs.byId.get(inv.npc);
    if (!d) return false;
    const exp = g.renxin?.hasExp2?.('ruin_betray') || g.renxin?.hasExp2?.('sworn_trap');
    const soul = h.gongfa === 'dayan' || h.arts.some((a) => a.id === 'mingqing');
    return h.realm - d.realm >= 2 || (g.senseBurstT > 0 && h.realm > d.realm) || !!exp || soul;
  }
  daily(days: number) {
    const g = this.game, S = this.S;
    // 传音相邀：到日子了，人寻到你身边
    for (const r of S.remote.slice()) {
      if (g.day < r.arrive) continue;
      S.remote.splice(S.remote.indexOf(r), 1);
      const d = this.npcs.byId.get(r.id); if (!d || !d.alive) continue;
      d.map = ACTIVE_MAP as any;
      if (!(d.bond === 'sworn' || d.bond === 'master' || d.bond === 'disciple')) d.bond = 'companion';
      d.bondUntil = g.day + 30; if (d.bond !== 'companion') d.helpUntil = g.time + 3600;
      this.npcs.summon(d.id);
      g.toast(`一道遁光落在身旁——${d.name}赶到了：「来迟一步，没误事吧？」`, 'good');
      audio.sfx('whoosh');
    }
    // 过期 / 爽约
    for (const inv of S.invites) {
      if (inv.done || inv.declined || g.day < inv.until) continue;
      inv.done = true;
      const d = this.npcs.byId.get(inv.npc);
      if (inv.accepted && !inv.fired && d && !inv.trap) { g.rel.addFavor(d, -8); g.toast(`你爽了${d.name}的约，对方颇为不快。（好感 -8）`, 'warn'); }
    }
    if (S.invites.length > 24) S.invites = S.invites.filter((i) => !i.done && !i.declined).slice(-16);
    // 新的邀约
    if (g.day >= S.next) {
      S.next = g.day + 12 + Math.random() * 16;
      this.makeInvite();
    }
    void days;
  }
  makeInvite(kind?: InviteKind, from?: NpcData): Invite | null {
    const g = this.game, p = g.player, S = this.S;
    const pool = this.friends().filter((d) => (d.map ?? 'tiannan') === ACTIVE_MAP && this.npcs.activeOf(d.id)?.act !== 'follow' && !d.hunting && !d.chasing && d.realm > 0);
    const d = from ?? (pool.length ? pick(pool) : null);
    if (!d) return null;
    const k: InviteKind = kind ?? (Math.random() < 0.6 ? 'explore' : 'help');
    // 地点：探秘去一处遗府 / 险地；求援就在离你几里外的野地
    let x = 0, y = 0, place = '';
    const T = g.terrain;
    if (k === 'explore') {
      const cand = LOCATIONS.filter((l) => (l.type === 'secret' || l.type === 'danger') && (l.map ?? 'tiannan') === ACTIVE_MAP && Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) < 90000);
      const l = cand.length && Math.random() < 0.5 ? pick(cand) : null;
      if (l) { x = l.x * WORLD_SCALE; y = l.y * WORLD_SCALE + 500; place = l.name; }
    }
    if (!place) {
      for (let tries = 0; tries < 40; tries++) {
        const an = Math.random() * TAU, r = 3000 + Math.random() * 9000;
        const qx = p.x + Math.cos(an) * r, qy = p.y + Math.sin(an) * r;
        if (T.walkFactor(qx, qy) > 0 && !T.inLocZone(qx, qy, 400)) { x = qx; y = qy; break; }
      }
      if (!x) return null;
      place = k === 'explore' ? pick(['一处新塌出的古修洞府', '山腹里一座无名石窟', '一口冒灵气的枯井', '一座被藤蔓封住的石殿']) : pick(['山坳', '乱石滩', '密林边', '荒岭']);
    }
    const trap = this.schemer(d) && Math.random() < (k === 'explore' ? 0.6 : 0.45);
    const inv: Invite = { id: S.seq++, npc: d.id, kind: k, map: ACTIVE_MAP, x, y, place, day: g.day, until: g.day + (k === 'help' ? 4 : 10), trap };
    S.invites.push(inv);
    g.toast(k === 'help' ? `传音玉符一亮——${d.name}：「我在${dirName(x - p.x, y - p.y)}边的${place}被围，速来！」（${pressKey('hearts', '点「≡ 菜单 → 友人」')}打开友人录应约）` : `传音玉符一亮——${d.name}约你同探「${place}」。（${pressKey('hearts', '点「≡ 菜单 → 友人」')}打开友人录应约）`, k === 'help' ? 'warn' : 'info');
    audio.sfx('chime');
    return inv;
  }
  accept(inv: Invite) { inv.accepted = true; this.game.toast(`已应约。地图上标了「约」：${inv.place}。`, 'good'); }
  decline(inv: Invite) {
    inv.declined = true;
    const d = this.npcs.byId.get(inv.npc);
    if (d && !inv.trap) this.game.rel.addFavor(d, inv.kind === 'help' ? -6 : -2);
  }
  /** 邀约的说辞（看得出蹊跷时多一句旁白） */
  inviteText(inv: Invite): string {
    const d = this.npcs.byId.get(inv.npc);
    const nm = d?.name ?? '故人';
    const base = inv.kind === 'help'
      ? `「${nm}在此！我在${inv.place}被一伙${pick(['妖兽', '劫修'])}围住，撑不了几日，道友速来！」`
      : `「道友，我在${inv.place}外摸到了前人留下的禁制，一人破不开。你我联手，所得平分，如何？」`;
    const tell = this.sees(inv) ? (inv.trap ? '\n（你反复读了两遍——措辞热络得过了头，约的地方又偏僻无人。此事恐怕有诈。）' : '\n（字迹仓促却诚恳，看不出什么破绽。）') : '';
    return base + tell;
  }

  // ------------------------------------------------------------ 每帧：到了会合处
  update(dt: number) {
    const g = this.game, p = g.player;
    // 原地等候的同行者：到了地方就站住（npc.ts 的跟随逻辑读 waitAt）
    if (this.scene) { this.tickScene(dt); return; }
    for (const inv of this.S.invites) {
      if (!inv.accepted || inv.done || inv.fired || inv.map !== ACTIVE_MAP) continue;
      if (Math.hypot(inv.x - p.x, inv.y - p.y) > 420) continue;
      inv.fired = true;
      this.fire(inv);
      break;
    }
  }
  private spawnFoes(inv: Invite, n: number, human: boolean): Enemy[] {
    const g = this.game, out: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU + Math.random() * 0.6, r = 260 + Math.random() * 160;
      const x = inv.x + Math.cos(an) * r, y = inv.y + Math.sin(an) * r * 0.6;
      let e: Enemy;
      if (human) { const rk = foeRealm(g, x, y, 'rogue'); e = new Enemy(ENEMIES[rk.realm >= 2 ? 'zhujixiu' : 'bandit'], x, y, rk.realm, rk.stage); e.name = '埋伏的劫修'; e.team = 'fr:ambush'; }
      else { const rb = g.combat.rollBeast(x, y, 0.4); if (!rb) continue; e = new Enemy(rb.def, x, y, rb.realm, rb.stage); }
      e.aggro = true; e.hx = inv.x; e.hy = inv.y;
      g.combat.enemies.push(e); out.push(e);
    }
    return out;
  }
  private fire(inv: Invite) {
    const g = this.game, d = this.npcs.byId.get(inv.npc);
    if (!d || !d.alive) { inv.done = true; g.toast('约你的人不见踪影，只留下一地凌乱的脚印。', 'info'); return; }
    d.x = inv.x; d.y = inv.y; d.map = ACTIVE_MAP as any;
    const a = this.npcs.summon(d.id);
    if (!a) { inv.done = true; return; }
    if (inv.kind === 'help') {
      const foes = this.spawnFoes(inv, inv.trap ? 3 : 3 + Math.floor(Math.random() * 3), inv.trap || Math.random() < 0.5);
      this.scene = { inv, foes, t: 0, turned: false };
      g.toast(inv.trap ? `${d.name}迎上来：「你可算来了！」——四周的人却不像是在围攻他……` : `${d.name}浑身是血：「道友来得正好！」四周的敌人扑了上来！`, 'warn');
    } else if (inv.trap) {
      const foes = this.spawnFoes(inv, 2 + Math.floor(Math.random() * 2), true);
      for (const e of foes) { e.aggro = false; e.busy = true; }   // 先藏着
      this.scene = { inv, foes, t: 0, turned: false };
      g.toast(`${d.name}满面春风迎上来：「道友果然守信！禁制就在前面——」`, 'info');
    } else {
      d.bond = d.bond ?? 'companion'; d.bondUntil = g.day + 12;
      inv.done = true;
      g.rel.addFavor(d, 5);
      if (MIJING_ON) {
        // 真心相约：人与你会合、结伴，会合处现出一座小秘境，一同进去
        g.mijing.inviteEntrance(inv.x, inv.y, d.id, inv.place.replace(/^一[处座口]/, ''));
        g.toast(`${d.name}迎上来：「道友果然守信！入口就在这里，你我一道进去。」（走近入口${pressKey('interact', '点「谈」').trim()}）`, 'good');
      } else {
        // 真心相约：一同探宝——给一份实打实的机缘
        const got = this.loot(d);
        g.openDialog({ speaker: d.name, title: '同探', mood: 'mystic', text: `你与${d.name}在${inv.place}会合，二人一前一后破开了外头的禁制。${d.name}把守外头，你入内搜检——\n\n获得：${got.join('、')}\n\n${d.name}笑道：「说好平分，你先挑。往后有这等好事，我还找你！」\n（好感 +5，${d.name}与你同行十余日）`, options: [{ label: '多谢道友', act: () => null }] });
      }
      audio.sfx('chime');
    }
  }
  private loot(d: NpcData): string[] {
    const g = this.game, h = g.hero, out: string[] = [];
    const t = Math.max(1, Math.min(4, d.realm));
    const add = (id: string, n = 1) => { C.addItem(h, id, n); out.push(n > 1 ? `${itemDef(id).name}×${n}` : itemDef(id).name); };
    const ls = Math.round((60 + Math.random() * 80) * Math.pow(3, t)); C.addItem(h, 'mat_lingshi', ls); out.push(`灵石 ${ls}`);
    const sk = g.combat.randomScroll(Math.min(4, t + 1)); if (sk && Math.random() < 0.5) add(sk);
    const zt = g.zhenfa?.ruinScroll?.(); if (zt && Math.random() < 0.35) add(zt);
    if (Math.random() < 0.5) add('zf_zhui', 1 + Math.floor(Math.random() * 2));
    return out;
  }
  private tickScene(dt: number) {
    const g = this.game, sc = this.scene!, inv = sc.inv, d = this.npcs.byId.get(inv.npc);
    sc.t += dt;
    const a = d ? this.npcs.activeOf(d.id) : null;
    if (inv.trap && !sc.turned && sc.t > (inv.kind === 'help' ? 2.5 : 4)) {
      sc.turned = true;
      for (const e of sc.foes) { e.busy = false; e.aggro = true; }
      if (d && a) {
        if (d.bond === 'companion') { d.bond = undefined; d.bondUntil = undefined; }
        delete (d as any).waitAt;
        const e = this.npcs.toEnemy(a, true);
        if (e) { e.team = 'fr:ambush'; e.name = d.name; }
        d.grudge = Math.max(d.grudge ?? 0, 1); d.why = '设局害你';
        g.rel.setFavor(d, -60);
      }
      const saw = this.sees(inv);
      g.toast(saw ? `果然有诈！${d?.name ?? '那人'}一声冷笑，四面伏兵齐出——好在你早有防备！` : `「道友，对不住了——你的储物袋，我收下了！」${d?.name ?? '那人'}翻脸动手，四面伏兵齐出！`, 'warn');
      if (saw) g.combat.invulnT = Math.max(g.combat.invulnT, 1.2);
      g.renxin?.recordExp2?.('ruin_betray', saw ? 'see' : 'loss', saw ? '识破邀约之局' : '应约遭伏', `${d?.name ?? '旧识'}以「${inv.place}」为饵约你前往，${saw ? '你看破了措辞里的破绽，有备而来。' : '会合处埋着伏兵。'}谨记：交情再好，约在荒僻之地也要多留个心眼。`);
      g.news(`有人以同探机缘为名，在${inv.place}设伏截杀苏寒。`, 'personal');
    }
    const alive = sc.foes.filter((e) => !e.dead && g.combat.enemies.includes(e));
    if (alive.length === 0 && (sc.turned || !inv.trap) && sc.t > 1) {
      inv.done = true; this.scene = null;
      if (!inv.trap && d && d.alive) {
        g.rel.addFavor(d, 14);
        d.bond = d.bond ?? 'companion'; d.bondUntil = g.day + 15;
        const gift = this.loot(d);
        g.openDialog({ speaker: d.name, title: '解围', text: `${d.name}长出一口气，郑重一揖：「救命之恩，${d.name}没齿难忘！」从储物袋里摸出一包东西硬塞给你。\n\n获得：${gift.join('、')}\n（好感 +14，${d.name}与你同行半月）`, options: [{ label: '道友言重了', act: () => null }] });
        g.news(`苏寒赶到${inv.place}，替${d.name}解了围。`, 'personal');
      }
      return;
    }
    if (sc.t > 240) { inv.done = true; this.scene = null; }
  }
  /** 地图标记：已应的约 */
  marks(): { x: number; y: number; glyph: string; color: string; name: string }[] {
    return this.S.invites.filter((i) => i.accepted && !i.done && i.map === ACTIVE_MAP).map((i) => ({ x: i.x, y: i.y, glyph: '约', color: i.kind === 'help' ? '#ff9a70' : '#9ad0ff', name: `${this.npcs.byId.get(i.npc)?.name ?? ''}之约 · ${i.place}` }));
  }
  /** 知交（友人录里的一页） */
  beauties() { return BEAUTIES.filter((b) => this.game.ws.hearts[b.id]?.met); }
  realmOf(d: NpcData) { return realmName(d.realm, Math.min(d.stage, (REALMS[d.realm]?.stages.length ?? 1) - 1)); }
  home(d: NpcData) { return LOC_BY_ID.get(d.home)?.name ?? ''; }
}
