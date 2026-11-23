// v0.53：本命神通的授予与「观兽悟形」
// - 结丹：金丹成，灵力可离体凝形——自然生出「化形·青龙」；其余六形要靠斩妖观形参悟
// - 观兽悟形：斩杀名字里带「虎豹狼狮」的妖兽悟白虎、「龟蟹鳄甲蛇」悟玄武……妖兽境界越高、越是妖王，悟得越多；
//   什么也不像的妖兽，六形各分一点（杀得多了总能悟出来）。筑基时悟得的也作数，结丹那天一并开窍
// - 元婴：元婴成，自然生出「元婴出窍」；并会「元婴瞬移」（若尚未从拍卖会求得）
import type { Game } from './game';
import type { Enemy } from './combat';
import { ARTS } from '../data/arts';
import { FORMS, FORM_IDS, FormId } from './huaxing';
import { isBoss } from './foeskills';
import { warm53 } from '../gfx/v053Tex';
import { audio } from './audio';

/** 每一形参悟所需 */
export const INS_NEED = 36;

export class ShentongSys {
  private chkT = 0;
  constructor(public game: Game) {}
  private get st() { const h = this.game.hero; return (h.hx ??= { ins: {} }); }
  has(id: string) { return this.game.hero.arts.some((a) => a.id === id); }
  /** 习得一门神通：入法术书，快捷栏有空就放上 */
  learn(id: string, line: string) {
    const g = this.game, h = g.hero, s = ARTS[id];
    if (!s || this.has(id)) return false;
    h.arts.push({ id, xp: 0 });
    const slot = h.hotbar.findIndex((x) => !x);
    if (slot >= 0) h.hotbar[slot] = id;
    g.toast(`${line}${slot >= 0 ? `（已放入快捷栏 ${slot + 1}）` : '（按 K 打开法术书放入快捷栏）'}`, 'good');
    audio.sfx('chime');
    g.updateUI(true);
    return true;
  }
  /** 每秒对一次账：境界到了就授予（也兼容旧存档、调试改境界） */
  update(dt: number) {
    this.chkT -= dt; if (this.chkT > 0) return; this.chkT = 1;
    const g = this.game, h = g.hero;
    if (h.dead) return;
    if (h.realm >= 3) {
      if (!this.has('hx_long')) {
        this.learn('hx_long', '金丹已成，丹田灵力可离体凝形——悟得本命神通「灵力化形·青龙」！斩杀妖兽、观其形神，还能参悟其余六形。');
        g.news('苏寒结丹之后，悟出灵力化形之术，可化青龙御敌。', 'personal');
        warm53(['hx_long_idle', 'hx_long_attack', 'hx_gather', 'hx_dissolve', 'hx_trail']);
      }
      for (const f of FORM_IDS) if (f !== 'long' && !this.has('hx_' + f) && (this.st.ins[f] ?? 0) >= INS_NEED) this.unlock(f);
    }
    if (h.realm >= 4) {
      if (!this.has('yuanying')) {
        this.learn('yuanying', '元婴已成——悟得本命神通「元婴出窍」：元婴离体，肉身坐镇，遁速倍增、法术更凌厉。');
        g.news('苏寒结婴，元婴可离体出窍。', 'personal');
      }
      if (!this.has('yingshun')) this.learn('yingshun', '元婴初成，挪移虚空已是本能——习得「元婴瞬移」。出窍时瞬移更远、冷却减半。');
    }
  }
  private unlock(f: FormId) {
    const F = FORMS[f];
    if (this.learn('hx_' + f, `观兽悟形：你从斩杀的妖兽身上悟透了${F.name}的形神——习得「灵力化形·${F.name}」（${F.blurb}）！`)) {
      this.game.news(`苏寒观兽悟形，灵力可化${F.name}。`, 'personal');
      warm53([`hx_${f}_idle`, `hx_${f}_attack`]);
    }
  }
  /** 斩妖：按妖兽的名字与境界参悟 */
  onKill(e: Enemy) {
    const h = this.game.hero;
    if (h.realm < 2 || e.def.kind === 'human' || e.def.kind === 'ghost' || e.spar || e.minion) return;
    const pts = (1 + e.realm * 1.5) * (isBoss(e) ? 3 : 1);
    const name = (e.name || '') + e.def.name;
    const S = this.st;
    let hit = false;
    for (const f of FORM_IDS) {
      if (f === 'long') continue;
      if (FORMS[f].kin.test(name)) { S.ins[f] = Math.min(INS_NEED, (S.ins[f] ?? 0) + pts); hit = true; }
    }
    if (!hit) for (const f of FORM_IDS) if (f !== 'long') S.ins[f] = Math.min(INS_NEED, (S.ins[f] ?? 0) + pts * 0.12);
    if (hit && h.realm >= 3 && !S.seen) { S.seen = true; this.game.hint('wuxing', '提示：斩杀妖兽时会「观兽悟形」——法术书里选中任一「化形」神通，可看到七形的参悟进度。'); }
  }
  /** 七形参悟进度（法术书用） */
  progress(): { id: FormId; name: string; blurb: string; have: boolean; p: number }[] {
    const S = this.st;
    return FORM_IDS.map((f) => ({ id: f, name: FORMS[f].name, blurb: FORMS[f].blurb, have: this.has('hx_' + f), p: f === 'long' ? 1 : Math.min(1, (S.ins[f] ?? 0) / INS_NEED) }));
  }
}
