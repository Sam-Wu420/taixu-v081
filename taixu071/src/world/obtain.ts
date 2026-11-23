// 第四十步：“拿得到”——原著独门之物的获取途径
//
// · 器物自带的神通：得到法宝 / 灵宠后自然参悟（碧竹飞云剑→伏魔金雷、金雷竹→雷芒、归墟鼎、玄霜冰焰、云雷双翼、五子同心魔、阴都尸火、元磁神山、蚀金蛊、啸魂兽）
// · 天雷竹：原著苏寒以清音门“名义上的客卿长老”为条件，替清音门剿灭一伙海盗（其中藏着玄阴岛的暗桩），从紫萝仙子处换来带根的一截天雷竹，
//   再以问道残卷墨露催熟成万年金雷竹——天雷竹每滴墨露长一百年，长到万年自成金雷竹，旁边又生出一根新枝（cultivation.useBottle）
import type { Game } from './game';
import type { DNode } from './modal';
import { Enemy } from './combat';
import * as C from './cultivation';
import { itemDef } from '../data/items';
import { ART_LIST } from '../data/arts';
import { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H } from '../data/world';
import { cultivator, newTeam } from './melee';

/** 持有即悟的神通：[物品, 功法, 参悟时的话] */
export const BOUND_ARTS: [string, string, string][] = [
  ['art_qingzhu', 'bixie', '碧竹飞云剑中蕴藏的伏魔金雷与你心神相通——你学会了《伏魔金雷》。'],
  ['mat_jinleizhu', 'jinlei', '金雷竹上金色电弧跳动，你以神识牵引，竟引出一道雷芒——你学会了《金雷竹·雷芒》。'],
  ['art_xutian', 'xutianding', '归墟鼎认主，鼎口吞吐之间你已明白它的用法——你学会了《归墟鼎》。'],
  ['art_qianlan', 'qianlan', '你将玄霜冰焰收入体内温养，冰焰渐渐听从驱使——你学会了《玄霜冰焰》。'],
  ['art_fenglei', 'fengleichi', '云雷双翼在背后展开，雷光与风声随心而动——你学会了《云雷双翼》。'],
  ['art_wuzi', 'wuzi', '五子同心魔中的五道魔念与你神识相连——你学会了《五子同心魔》。'],
  ['art_tiandu', 'tiandushihuo', '阴都尸火在掌心跳动，阴冷而驯服——你学会了《阴都尸火》。'],
  ['art_yuanci', 'yuanci', '炼化元磁神山之时，你从山中五色元磁里参悟出一道神光——你学会了《两极磁光》。'],
  ['item_tihun', 'tihun', '啸魂幼兽在你掌心蹭了蹭，从此唤之即来——你学会了《啸魂兽》。'],
];
const PET_ARTS: [string, string, string][] = [
  ['shijin', 'shijin', '蚀金蛊群已能听你号令，铺天盖地而出——你学会了《蚀金蛊群》。'],
];

export function learnArt(g: Game, id: string): boolean {
  const h = g.hero;
  if (h.arts.some((a) => a.id === id) || !ART_LIST.some((s) => s.id === id)) return false;
  h.arts.push({ id, xp: 0 });
  const k = h.hotbar.findIndex((x) => x === null);
  if (k >= 0) h.hotbar[k] = id;
  return true;
}

interface ZlState { st: 'hunt' | 'report' | 'done'; x?: number; y?: number; n?: number; k?: number }

export class Obtain {
  game: Game;
  private t = 0;
  /** 本次运行里已刷出的海盗（不存档；读档后靠近时重新出现） */
  private pirates: Enemy[] = [];
  constructor(g: Game) { this.game = g; }
  private zl(): ZlState | undefined { return (this.game.ws.flags as any).zl; }

  tick(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 1;
    const g = this.game, h = g.hero;
    for (const [item, art, msg] of BOUND_ARTS) if (C.bagCount(h, item) > 0 && learnArt(g, art)) { g.toast(msg, 'good'); g.news(`苏寒参悟${itemDef(item).name}，得一门神通。`, 'personal'); }
    if (h.qzGeng && C.bagCount(h, 'art_qingzhu') > 0 && learnArt(g, 'dageng')) g.toast('七十二口碧竹飞云剑熔入庚精，青霄剑诀上记载的大庚剑阵终于可以布下了——你学会了《大庚剑阵》。', 'good');
    for (const [kind, art, msg] of PET_ARTS) if (g.ws.pets?.some((p) => p.kind === kind) && learnArt(g, art)) g.toast(msg, 'good');
    this.pirateTick();
  }

  // ------------------------------------------------------------ 清音门 · 客卿之约
  /** 城镇面板上的入口 */
  facility(locId: string): { name: string; desc: string } | null {
    if (locId !== 'miaoyin') return null;
    const s = this.zl();
    if (s?.st === 'done') return { name: '客卿长老', desc: '你是清音门名义上的客卿长老' };
    if (s?.st === 'hunt') return { name: '客卿之约', desc: `剿灭海盗（${s.k ?? 0}/${s.n ?? 5}）——地图上标「盗」` };
    if (s?.st === 'report') return { name: '客卿之约', desc: '海盗已灭，回禀紫萝' };
    return { name: '客卿之约', desc: '清音门正在物色一位结丹客卿' };
  }
  node(): DNode {
    const g = this.game, h = g.hero, s = this.zl(), f = g.ws.flags as any;
    const sp = '紫萝', title = '清音门门主';
    if (s?.st === 'done') return { speaker: sp, title, text: '紫萝浅浅一笑：「客卿长老大驾光临，清音门蓬荜生辉。坊市里若有金雷竹上架，掌柜自会给道友让一成。」', options: [{ label: '告辞', act: () => null }] };
    if (s?.st === 'hunt') return { speaker: sp, title, text: `「那伙海盗就盘踞在${this.dirTo(s.x!, s.y!)}的荒岛上，为首的结丹修士手段阴毒。」紫萝顿了顿，「我总觉得他们背后另有其人……道友千万小心。」\n\n（已斩 ${s.k ?? 0}/${s.n ?? 5} 人）`, options: [{ label: '这就动身', act: () => null }] };
    if (s?.st === 'report') {
      return { speaker: sp, title, mood: 'mystic', text: '紫萝听你说完，沉默片刻：「果然是玄阴岛……多谢道友。」\n\n她从袖中取出一只玉匣，匣中躺着一截青翠的竹子，带着细细的根须，竹节上隐有电光游走。\n\n「这是本门镇派的天雷竹，一分为二后的一截。说好的——道友做本门名义上的客卿长老，此物便归道友了。」', options: [{ label: '郑重收下', tone: 'gold', act: () => {
        f.zl = { st: 'done' } as ZlState;
        C.addItem(h, 'herb_tianleizhu', 1);
        const hs = g.ws.hearts?.ziling; if (hs) hs.favor = Math.min(100, hs.favor + 10);
        g.ws.rep = Math.min(100, g.ws.rep + 3);
        g.news('苏寒受聘为清音门客卿长老。', 'personal');
        return { speaker: sp, title, text: '获得：天雷竹\n\n（天雷竹是灵木，可入药炼丹。真正能炼碧竹飞云剑的金雷竹，人界只有清音门的坊市每月出一根，价比连城——你如今是清音门客卿长老，掌柜会给你让一成。）', options: [{ label: '好', act: () => null }] };
      } }, { label: '稍后再说', act: () => null }] };
    }
    if (h.realm < 3) return { speaker: sp, title, text: '紫萝打量了你一眼，客气而疏离：「本门要请的是结丹期的客卿长老。道友根基不错，等结了丹再来吧。」\n\n（需结丹期）', options: [{ label: '告辞', act: () => null }] };
    return { speaker: sp, title, text: '紫萝屏退左右，开门见山：「清音门势单力薄，近来常有宵小上门。本门想请一位结丹期的道友，做个名义上的客卿长老——不必坐镇，只需挂个名头。」\n\n「另外，有一伙海盗劫了本门三条商船。道友若肯先替本门走一趟，事成之后，本门以一截天雷竹相酬。」\n\n天雷竹——人界三大神木之一。你心中一动。', options: [
      { label: '应下：「海盗交给我。」', tone: 'gold', act: () => { this.startHunt(); const z = this.zl(); return z ? { speaker: sp, title, text: `「海盗在${this.dirTo(z.x!, z.y!)}的一座荒岛上。」紫萝递来一枚玉简，「这是海图。道友多加小心。」\n\n（地图上已标出「盗」字）`, options: [{ label: '动身', act: () => null }] } : { speaker: sp, title, text: '紫萝蹙眉：「探子还没回来……道友过些日子再来吧。」', options: [{ label: '好', act: () => null }] }; } },
      { label: '容我想想', act: () => null },
    ] };
  }
  private dirTo(x: number, y: number) {
    const p = this.game.player, a = Math.atan2(y - p.y, x - p.x);
    return ['东', '东南', '南', '西南', '西', '西北', '北', '东北'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] + '方';
  }
  private startHunt() {
    const g = this.game, T = g.terrain, L = LOC_BY_ID.get('miaoyin');
    if (!L || L.map !== ACTIVE_MAP) return;
    const cx = L.x * WORLD_SCALE, cy = L.y * WORLD_SCALE;
    for (let i = 0; i < 80; i++) {
      const an = Math.random() * Math.PI * 2, d = 3500 + Math.random() * 4500;
      const x = cx + Math.cos(an) * d, y = cy + Math.sin(an) * d * 0.8;
      if (x < 800 || y < 800 || x > WORLD_W - 800 || y > WORLD_H - 800 || !T.isLand(x, y) || T.walkFactor(x, y) < 0.3 || T.inLocZone(x, y, 500)) continue;
      (g.ws.flags as any).zl = { st: 'hunt', x, y, n: 5, k: 0 } as ZlState;
      return;
    }
  }
  private pirateTick() {
    const g = this.game, s = this.zl(); if (!s || s.st !== 'hunt' || ACTIVE_MAP !== 'renjie') return;
    this.pirates = this.pirates.filter((e) => !e.dead && !e.gone && g.combat.enemies.includes(e));
    const p = g.player, d = Math.hypot(s.x! - p.x, s.y! - p.y);
    const left = (s.n ?? 5) - (s.k ?? 0);
    if (!this.pirates.length && d < 1800 && left > 0) {
      const team = newTeam('zl:pirate');
      for (let i = 0; i < left; i++) {
        const lead = i === 0 && (s.k ?? 0) === 0;
        const an = (i / left) * Math.PI * 2, R = lead ? 0 : 160 + Math.random() * 120;
        const e = cultivator(s.x! + Math.cos(an) * R, s.y! + Math.sin(an) * R * 0.75, lead ? 3 : Math.random() < 0.4 ? 3 : 2, lead ? 2 : Math.random() < 0.5 ? 2 : 1, lead ? 'jiyin' : 'jiexiu', lead ? '海盗头子（玄阴岛暗桩）' : '海盗');
        e.tag = 'zl:pirate'; e.team = team; e.aggro = true; e.hx = s.x!; e.hy = s.y!;
        if (lead) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 1.6); }
        g.combat.enemies.push(e); this.pirates.push(e);
      }
      g.toast('荒岛上的海盗发现了你——为首那人周身阴气缭绕，竟是玄阴岛的功法！', 'warn');
    }
  }
  onKill(e: Enemy) {
    if (e.tag !== 'zl:pirate') return;
    const g = this.game, s = this.zl(); if (!s || s.st !== 'hunt') return;
    s.k = (s.k ?? 0) + 1;
    if (s.k >= (s.n ?? 5)) { s.st = 'report'; g.toast('海盗尽数伏诛。回清音门向紫萝复命吧。', 'good'); }
  }
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const s = this.zl();
    if (s?.st === 'hunt' && ACTIVE_MAP === 'renjie') return [{ x: s.x!, y: s.y!, glyph: '盗', color: '#e07a5a', ring: 900, name: '清音门委托：剿灭海盗' }];
    return [];
  }
}
