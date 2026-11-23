// 近战的「特殊招式」挂载点（兵器接进近战这一步留的口子；撼山客的二十五招从这里挂进来）。
//
// 一招 = 一份 SpecialMove：名字、谁能用、耗灵力和冷却、AI 选它的权重，加一段自己推进的状态机（begin → 每帧 tick → end）。
// 招式期间它可以接管出招者和目标的位置、播任意动作，调框架的击飞 / 上挑 / 砸下 / 顿帧 / 镜头 / 伤害（MoveCtx 上的方法，
// 伤害一律走 combat.hitEnemy / hitPlayer / npcHit，照常触发模组的 damage 钩子）。
//
// 注册：在任意文件里 import { registerMove } from './brawlmoves' 调一次（模块加载时即可）：
//   registerMove({
//     id: 'yicunbeng', name: '一寸崩', glyph: '崩', desc: '贴身停半拍，一拳……', realm: 3, mp: 0.08, cd: 6,
//     who: 'both', ai: { weight: 1, max: 160 },
//     begin(c) { if (!c.target) return false; c.act(null, 'smash'); c.data.hit = false; },
//     tick(c, dt) { if (c.t > 0.18 && !c.data.hit) { c.data.hit = true; c.hit(c.target, 2.2, 'yicun'); c.freeze(0.12); c.launch(c.target, c.dirX, c.dirY, 1800, 300); c.cam(1); } return c.t < 0.5; },
//   });
// 注册以后：
//   · 主角：ARTS 里多一门 'bxm_<id>'（cast 'melee'，学会了就能放进技能栏），按下即 BrawlSys.startMove；学会用 learnMove(hero, id)。
//   · 敌人 / NPC：会近战的（brawlfoe）挑招时按 ai.weight 用近战自己的随机序列挑它（没注册招式时一个随机数都不多取）；
//     can(B, user) 返回 false 的不挑。
// 招式进行中：主角不能走动（holdsPlayer）、动作由 c.act 定；敌人跳过寻常 AI（skipAI）。被打飞、沉水、死了会自动收场（调 end）。
import type { Enemy } from './combat';
import type { BrawlSys } from './brawl';
import type { Action } from '../gfx/character';
import { ARTS, type ArtSkill } from '../data/arts';
import type { Hero } from './cultivation';

/** 招式进行中拿到的上下文：出招者 user（null = 主角）、对手 target（主角出招时是敌人；敌人出招时 null = 主角）、已过了多久、自己的状态 */
export interface MoveCtx {
  readonly B: BrawlSys;
  readonly def: SpecialMove;
  readonly user: Enemy | null;
  /** 对手：敌人，或 'p'（主角）；主角出招找不到人时为 null */
  readonly target: Enemy | 'p' | null;
  /** 起手那一刻从出招者指向对手的方向（找不到人就是面朝） */
  readonly dirX: number; readonly dirY: number;
  /** 这一招已经走了多久（秒，按世界时间） */
  t: number;
  /** 招式自己的状态（随便放） */
  data: Record<string, unknown>;
  /** 伤害：k 是攻力倍数，kind 记在 B.log 里（主角打人走 hitEnemy，敌人打主角走 hitPlayer，敌人打敌人走 npcHit） */
  hit(who: Enemy | 'p' | null, k: number, kind: string): boolean;
  /** 击飞（平地上飞 D 远，竖直初速 vz）/ 上挑（riseK 乘框架的上挑高度）/ 往下砸（敌人：流星直坠） */
  launch(who: Enemy | 'p' | null, ux: number, uy: number, D: number, vz: number): boolean;
  up(who: Enemy | 'p' | null, riseK?: number): boolean;
  slam(who: Enemy | null): boolean;
  /** 接管位置：把人放到 (x, y)（z 是离地高度，不给就不动高度） */
  place(who: Enemy | 'p' | null, x: number, y: number, z?: number): void;
  /** 播动作（who = null 是出招者自己） */
  act(who: Enemy | 'p' | null, a: Action): void;
  /** 单位级顿帧（出招者和对手一起）、镜头猛推、震屏 */
  freeze(t: number): void;
  cam(k: number): void;
  shake(k: number): void;
  /** 发一个画面事件（brawlgl 认的那些：bxhit、launch、slam、crater、bxquake……） */
  fx(ev: Record<string, unknown>): void;
}

export interface SpecialMove {
  id: string; name: string;
  /** 技能栏上的图标字（默认取名字头一个字）、说明、颜色（'r,g,b'） */
  glyph?: string; desc?: string; color?: string;
  /** 主角要什么境界才使得出；耗灵力（占上限）；冷却（秒） */
  realm?: number; mp?: number; cd: number;
  /** 谁能用：主角、NPC、都能（默认都能） */
  who?: 'player' | 'npc' | 'both';
  /** 再细一点的条件（比如只有某个 NPC、某种兵器） */
  can?(B: BrawlSys, user: Enemy | null): boolean;
  /** 起手要对手在多远以内（默认 600）；AI 选它的权重和距离窗口 */
  range?: number;
  ai?: { weight: number; min?: number; max?: number };
  /** 起手：返回 false 就作罢（不扣灵力、不进冷却） */
  begin?(c: MoveCtx): boolean | void;
  /** 每帧推进：返回 true = 还在进行，false = 收场 */
  tick(c: MoveCtx, dt: number): boolean;
  /** 收场（正常结束或被打断都调）；interrupted = 被打断 */
  end?(c: MoveCtx, interrupted: boolean): void;
}

/** 已注册的招式 */
export const MOVES = new Map<string, SpecialMove>();
/** 技能栏 / 法术书里的 id */
export const moveArtId = (id: string) => 'bxm_' + id;

/** 注册一招（同 id 再注册就覆盖）。返回技能栏用的 id */
export function registerMove(m: SpecialMove): string {
  MOVES.set(m.id, m);
  const art: ArtSkill = {
    id: moveArtId(m.id), name: m.name, school: '体', tier: 2, realm: m.realm ?? 1, cast: 'melee', fx: 'palm',
    mp: m.mp ?? 0, cd: m.cd, power: 1, range: m.range ?? 600, color: m.color ?? '255,200,140',
    desc: m.desc ?? m.name, evo: ['', '', ''],
  } as ArtSkill;
  (ARTS as Record<string, ArtSkill>)[art.id] = art;
  return art.id;
}
/** 卸下一招（模组热卸载、测试收尾） */
export function unregisterMove(id: string) { MOVES.delete(id); delete (ARTS as Record<string, ArtSkill>)[moveArtId(id)]; }
/** 技能栏 id → 招式（不是特殊招式返回 undefined） */
export function moveOfArt(artId: string): SpecialMove | undefined { return artId.startsWith('bxm_') ? MOVES.get(artId.slice(4)) : undefined; }
/** 主角学会一招（放进法术书，之后可以拖进技能栏） */
export function learnMove(h: Hero, id: string): boolean {
  if (!MOVES.has(id)) return false;
  const a = moveArtId(id);
  if (!h.arts.some((x) => x.id === a)) h.arts.push({ id: a, xp: 0 });
  return true;
}
