// r11-lock 血条打击感的试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=hpbar
// 场子同 try=lock&at=boss（首领条 + 锁定目标大条），就绪后 window.__hp 上挂几个按钮式的函数（截图、肉眼看用）：
//   __hp.hit(who, frac, kind)   who = 'lock' | 'boss' | 'me'；kind = 'normal' | 'fire' | 'ice' | 'poison' | 'thunder'（挂上对应的状态再扣血）
//   __hp.dot(who, secs)         挂上燃烧，持续小口掉血（滴血）
//   __hp.heal(who, frac)        回血（灵气光点流进右端、玉色波纹）
//   __hp.poise()                近战架势的罡气条碎开（琉璃）
//   __hp.mp(frac)               法力掉一截（蓝色轻量版）
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import { tryLock } from './try-lock';
import { hpfx } from '../src/ui/hpfx';

type W = Window & { __lockReady?: boolean; __lock?: { game: Game; foe: Enemy; boss: Enemy | null }; __hp?: Record<string, unknown> };
const ST: Record<string, string> = { fire: 'burn', ice: 'freeze', poison: 'poison', thunder: 'shock' };

export function tryHpbar(g: Game, params: URLSearchParams) {
  const p = new URLSearchParams(params); p.set('at', 'boss');
  tryLock(g, p);
  const t = window.setInterval(() => {
    const w = window as W; if (!w.__lockReady || !w.__lock) return; clearInterval(t);
    const { foe, boss } = w.__lock, c = g.combat;
    foe.hp = foe.maxHp * 0.9; if (boss) boss.hp = boss.maxHp * 0.9; g.hero.hp = 0.9;
    const who = (k: string) => (k === 'boss' ? boss : k === 'me' ? null : foe);
    const stOf = (k: string) => { const e = who(k); return e ? e.st : c.pst; };
    w.__hp = {
      hit(k: string, frac: number, kind = 'normal') {
        const st = stOf(k) as Record<string, unknown>; for (const s of Object.values(ST)) delete st[s];
        if (ST[kind]) st[ST[kind]] = { t: 3, dps: 0 };
        const e = who(k); if (e) e.hp = Math.max(1, e.hp - e.maxHp * frac); else { g.hero.hp = Math.max(0.01, g.hero.hp - frac); g.updateUI(true); }
      },
      dot(k: string, secs = 3) {
        const st = stOf(k) as Record<string, unknown>; st.burn = { t: secs, dps: 0 };
        const e = who(k), end = performance.now() + secs * 1000;
        const i = window.setInterval(() => { if (performance.now() > end) { clearInterval(i); return; } if (e) e.hp = Math.max(1, e.hp - e.maxHp * 0.006); else { g.hero.hp -= 0.006; g.updateUI(true); } }, 90);
      },
      heal(k: string, frac: number) { const e = who(k); if (e) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * frac); else { g.hero.hp = Math.min(1, g.hero.hp + frac); g.updateUI(true); } },
      mp(frac: number) { g.hero.mp = Math.max(0, g.hero.mp - frac); g.updateUI(true); },
      async poise() { const B = g.combat.brawl; if (!B.stance) B.toggleStance(); await new Promise((r) => setTimeout(r, 400)); const el = document.querySelector('.bx-track') ?? document.querySelector('.lk-pbar'); if (el) hpfx.shatter(el); return !!el; },
      count: () => hpfx.count,
    };
  }, 200);
}
