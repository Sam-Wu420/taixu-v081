// 结伴（第一步）：同行者的法力、指令，和给队伍框的快照。
//
// 同行者原来只有气血（Active.hp，0..1）和「重伤调息」（downT）；这里给他们加上法力：出手一次耗一截，平时慢慢回，
// 法力见底就只能干看着回气。指令（点队伍框的卡片下）：
//   跟随＝默认（跟在身后，就近出手）；等候＝原地不动（同友人录里的「原地等候」）；
//   集火＝打你锁定的那个；各自为战＝不跟紧你，挑离自己最近的打；撤退＝退到你身后远处、不出手，敌人也不再盯着他打。
import type { Game } from './game';
import type { Active, NpcData } from './npc';
import { npcPortrait } from '../data/portraits';
import { realmName } from '../data/realms';
import { sectTitle } from './roster';

// 恩怨重做 · 第二批的战术指令（world/enyuan.ts 管站位和挑目标）：掩护＝挡在你和来敌之间、打冲你来的；包抄＝绕到锁定目标背后打（伤害高些）；
//   护着我撤＝站在追兵来的方向断后、只打贴近你的；别杀他＝下令时锁定的那个人留活口（只剩他时气血见底就停手）
export type PartyOrder = 'follow' | 'wait' | 'focus' | 'free' | 'retreat' | 'cover' | 'flank' | 'escort' | 'spare';
export const ORDER_NAME: Record<PartyOrder, string> = { follow: '跟随', wait: '等候', focus: '集火', free: '各自为战', retreat: '撤退', cover: '掩护', flank: '包抄', escort: '护着我撤', spare: '别杀他' };
/** 出手一次耗多少法力、每秒回多少（斗法中 / 平时） */
export const ALLY_MP = { cast: 0.09, regenFight: 0.012, regen: 0.05 } as const;

export interface PartyMember {
  id: string; name: string; title: string; realm: string; portrait?: string;
  hp: number; mp: number;
  /** 重伤调息还剩几秒（0＝能打） */
  down: number;
  order: PartyOrder;
  /** 元婴出窍中 */
  ying: boolean;
  /** 离你多远（丈）、在画面外时朝哪个方向（弧度，屏幕坐标，0＝向右） */
  dist: number; off: boolean; ang: number;
  /** 作风（第二、三步） */
  style?: string;
  /** 恩怨重做：有人盯上了他（小血印 0–3） */
  feud?: number;
  /** 第三批：是你的固定搭档 / 能设成搭档（伴侣、义兄弟、师徒） */
  dazi?: boolean; canDazi?: boolean;
}

export const orderOf = (d: NpcData): PartyOrder => ((d as unknown as { order?: PartyOrder }).order ?? ((d as unknown as { waitAt?: unknown }).waitAt ? 'wait' : 'follow'));

export class PartySys {
  constructor(private readonly game: Game) {}

  /** 下令 */
  order(id: string, o: PartyOrder): void {
    const g = this.game, a = g.npcs.followers().find((x) => x.d.id === id);
    if (!a) return;
    const d = a.d as NpcData & { order?: PartyOrder };
    g.friends.setWait(d, o === 'wait');
    d.order = o === 'follow' ? undefined : o;
    g.enyuan?.onOrder(d, o);
    const L = g.combat.lock && !g.combat.lock.dead ? g.combat.lock : null;
    const say: Record<PartyOrder, string> = { follow: '跟上了！', wait: '我在此候着。', focus: L ? `先拿${L.name}开刀！` : '你指哪，我打哪。', free: '各凭本事！', retreat: '我先退开。', cover: '我替你挡着！', flank: L ? `我绕到${L.name}背后去！` : '我去抄他后路！', escort: '你先走，我断后！', spare: L ? `好，留${L.name}一条命。` : '知道了，手下留情。' };
    a.bubble = { text: say[o], t: 1.8 };
  }
  orderAll(o: PartyOrder): void { for (const a of this.game.npcs.followers()) this.order(a.d.id, o); }

  /** 同行者的法力（没有就当满） */
  mp(a: Active): number { const A = a as Active & { mp?: number }; return A.mp ??= 1; }
  /** 出手前：法力够不够，够就扣掉 */
  spend(a: Active): boolean { const A = a as Active & { mp?: number }; const m = this.mp(a); if (m < ALLY_MP.cast) return false; A.mp = m - ALLY_MP.cast; return true; }
  /** 每帧回法力（npc.ts 跟随那一段调） */
  regen(a: Active, dt: number): void { const A = a as Active & { mp?: number }; A.mp = Math.min(1, this.mp(a) + dt * (this.game.combat.inCombat ? ALLY_MP.regenFight : ALLY_MP.regen)); }

  /** 给队伍框的快照（Game.updateUI 里取） */
  snapshot(): PartyMember[] {
    const g = this.game, p = g.player, hd = g.renderer?.hd;
    const W = (typeof window !== 'undefined' && window.innerWidth) || 1280, H = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const out: PartyMember[] = [];
    for (const a of g.npcs.followers()) {
      const d = a.d, st = a.st;
      let sx: number, sy: number;
      if (hd) { const s = hd.ground(st.x, st.y); sx = s.x; sy = s.y; } else { const z = g.cam.zoom; sx = W / 2 + (st.x - g.cam.x) * z; sy = H / 2 + (st.y - g.cam.y) * z; }
      const off = !(sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30);
      const ps = hd ? hd.ground(p.x, p.y) : { x: W / 2, y: H / 2 };
      out.push({
        id: d.id, name: d.name, title: d.beauty ? '伴侣' : d.sect ? sectTitle(d.sect) : d.faction === 'rogue' ? '散修' : d.title ?? '',
        realm: realmName(d.realm, d.stage), portrait: npcPortrait(d),
        hp: Math.max(0, Math.min(1, a.hp)), mp: this.mp(a),
        down: Math.max(0, (a as Active & { downT?: number }).downT ?? 0), order: orderOf(d), ying: !!g.shen?.isYing(a),
        dist: Math.round(Math.hypot(st.x - p.x, st.y - p.y) / 30), off, ang: Math.atan2(sy - ps.y, sx - ps.x),
        style: (d as NpcData & { pstyle?: string }).pstyle,
        feud: g.rel?.feud.mateMarks(d.id) ?? 0,
        dazi: !!d.dazi, canDazi: !d.dazi && !!g.dazi?.tie(d),
      });
    }
    return out;
  }
}
