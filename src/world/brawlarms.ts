// 兵器拿在手里还是收着（兵器接进近战）：主角、战斗里的人形敌人 / 同阵修士。
//   · 主角：进架势、出了一招兵器招式（不在架势里也算，过三息收回背上）就拿在手里；打坐、倒下时收着。
//   · 人形敌人：头一回看见时按外观哈希配兵器（world/arms.ts 的 foeWeapon，不取随机数）；进入战斗（追着人打）或被你锁定时拿出来，脱战收回去。
// 拿出、收回都从上一帧的姿势过渡过去（和换动作同一套淡入），不会一下子变。
import type { Enemy } from './combat';
import type { BrawlSys } from './brawl';
import type { CharState } from '../gfx/character';
import type { WeaponKind } from '../data/weapons';
import { foeWeapon, lookWithWeapon } from './arms';

/** 一个人此刻手里（外观上）是什么兵器 */
export function foeKind(e: Enemy): WeaponKind { const w = e.look?.weapon; return w && w.kind !== 'fist' ? w.kind : 'fist'; }

const seen = new WeakSet<Enemy>();
let scanT = 0;

/** 拿出 / 收回：从上一帧的姿势淡过去（CharState.setAction 换动作也是这么做的） */
export function setArmed(st: CharState, want: boolean) {
  if (st.armed === want) return;
  st.armed = want; st.from = st.last ? { ...st.last } : null; st.blend = 0;
}

/** 给一个敌人配上兵器（只配一次） */
export function armFoe(e: Enemy) {
  if (seen.has(e)) return;
  seen.add(e);
  if (!e.look || e.look.weapon) return;
  const w = foeWeapon(e);
  if (!w) return;
  const nl = lookWithWeapon(e.look, w);
  if (nl.back === 'sword') nl.back = 'none';   // 背上原来那口装饰剑让给兵器
  e.look = nl;
}

/** 每帧（brawl.update 开头）：主角每帧，身边的人每 0.1 息一次 */
export function armsTick(B: BrawlSys, dt: number) {
  const g = B.g, p = g.player;
  B.armHold = Math.max(0, B.armHold - dt);
  if (p?.st) setArmed(p.st, B.wk !== 'fist' && (B.stance || B.armHold > 0) && !p.sitting && !g.hero.dead);
  scanT -= dt; if (scanT > 0) return; scanT = 0.1;
  const c = B.combat;
  const one = (e: Enemy) => {
    if (!e.cs || !e.look) return;
    if (!seen.has(e)) armFoe(e);
    if (e.look.weapon && e.look.weapon.kind !== 'fist') setArmed(e.cs, !e.dead && (e.aggro || c.lock === e));
  };
  for (const e of c.enemies) one(e);
  for (const e of c.allies) one(e);
}
