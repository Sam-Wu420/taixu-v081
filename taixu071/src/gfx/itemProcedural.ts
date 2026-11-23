// 物品图标：数据驱动的矢量原型；按物品语义（丹药功效/材料形态/心法古籍/法术玉简/阵图/信物等）与品阶生成高辨识度 SVG 图标。
// 运行时 SVG data URL 可在 UI 中直接使用，无外部请求。
import type { ItemDef, ItemIconShape } from '../data/items';
import { ARTS, SCHOOL_COLOR } from '../data/arts';
import { GONGFA } from '../data/skills';
import { ZHEN_BY_ID } from '../data/zhenfa';

type Shape = ItemIconShape;
const SHAPES = new Set<Shape>(['herb', 'flower', 'fruit', 'pill', 'bottle', 'ore', 'bead', 'talisman', 'scroll', 'misc']);
const cache = new Map<string, string>();
const modIcons = new Map<string, string>();
const MAX_CACHE = 1024;
export function registerModItemIcon(id: string, url: string) { modIcons.set(id, url); }
export function modItemIcon(id: string) { return modIcons.get(id); }

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function safeRgbHex(s: unknown): string | null {
  if (typeof s !== 'string' || !/^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(s)) return null;
  const rgb = s.split(',').map((x) => Math.max(0, Math.min(255, Number(x))));
  return '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function itemIconShape(d: ItemDef): Shape {
  if (SHAPES.has(d.visual?.shape)) return d.visual!.shape!;
  if (d.type === 'herb') return /花|莲|芝/.test(d.glyph) ? 'flower' : /果/.test(d.glyph) ? 'fruit' : /乳|酒/.test(d.glyph) ? 'bottle' : 'herb';
  if (d.type === 'pill') return /酒|乳|液|露/.test(d.glyph) ? 'bottle' : 'pill';
  if (d.type === 'material') return /丹|核|珠/.test(d.glyph) ? 'bead' : 'ore';
  if (d.type === 'talisman') return 'talisman';
  if (d.type === 'scroll') return 'scroll';
  return /瓶|酒|乳/.test(d.glyph) ? 'bottle' : 'misc';
}

const palettes: Record<Shape, string[]> = {
  herb: ['#68a674', '#79b27c', '#589d8a', '#89b36e'],
  flower: ['#ce7b9b', '#b27fc6', '#d8a662', '#8db0cf'],
  fruit: ['#d26e4e', '#a47fc0', '#cea24f', '#72ab7e'],
  pill: ['#d6a662', '#8fb483', '#b885b8', '#c06d58'],
  bottle: ['#7eb8a8', '#c6a774', '#8ea6c8', '#a584b8'],
  ore: ['#7ea8b6', '#b8946e', '#9c83b2', '#80a67c'],
  bead: ['#82bfa0', '#cf9262', '#9b88cc', '#77b0ca'],
  talisman: ['#ecd18d', '#dfc17a', '#ead099', '#ddc292'],
  scroll: ['#dac398', '#cbb28a', '#e2cfa8', '#ceb8a0'],
  misc: ['#bfa884', '#80ada0', '#ad9bb8', '#c89276'],
};

type Motif =
  | 'lingzhi' | 'ginseng' | 'bamboo' | 'lotus' | 'herb' | 'flower' | 'fruit'
  | 'gourd' | 'bottle' | 'pill_ring' | 'pill_crack' | 'pill_hp' | 'pill_mp'
  | 'pill_soul' | 'pill_life' | 'pill_beauty' | 'pill_butian' | 'pill_twin' | 'pill'
  | 'crystal' | 'ingot' | 'horn' | 'ore' | 'shard'
  | 'eye' | 'powder' | 'inkstone' | 'claw' | 'fin' | 'scale' | 'hide' | 'flesh'
  | 'feather' | 'wing' | 'flag' | 'awl' | 'wood_dark' | 'jade_disc'
  | 'core_fire' | 'core_ice' | 'core_thunder' | 'soul_bead' | 'blood_spirit' | 'yaodan' | 'bead'
  | 'tali_fire' | 'tali_thunder' | 'tali_wind' | 'tali_break' | 'tali_home' | 'talisman'
  | 'book_gongfa' | 'scroll_array' | 'scroll_skill' | 'scroll_gold' | 'scroll'
  | 'pan' | 'egg' | 'pet' | 'letter' | 'token' | 'fan' | 'hairpin' | 'sachet'
  | 'art_sword' | 'art_shield' | 'art_ring' | 'art_bell' | 'art_mirror' | 'art_banner' | 'art_flame' | 'art_boot' | 'art_ding'
  | 'misc';

function motifOf(d: ItemDef, shape: Shape): Motif {
  // 若外部数据或模组显式指定了 visual.shape，则严格尊重该原型
  if (d.visual?.shape && SHAPES.has(d.visual.shape)) return d.visual.shape;
  const id = d.id ?? '';
  const n = (d.name ?? '') + '|' + id;

  // 1. 功法 / 法术 / 阵图卷轴（先按语义分流为古籍、阵图、法术灵简）
  if (d.type === 'scroll' || d.scroll) {
    if (d.scroll?.gongfa) return 'book_gongfa';
    if (d.scroll?.zhen) return 'scroll_array';
    if (d.scroll?.skill) return 'scroll_skill';
    return (d.tier ?? 0) >= 3 ? 'scroll_gold' : 'scroll';
  }

  // 2. 丹药（按功效 + 形态细分）
  if (d.type === 'pill') {
    if (/酒|酿|醉/.test(n)) return 'gourd';
    if (shape === 'bottle' || /液|乳|露|水/.test(n)) return 'bottle';
    if (/butian|补天/.test(n)) return 'pill_butian';
    if (/dingyan|定颜/.test(n)) return 'pill_beauty';
    if (d.pill?.hp || /疗伤/.test(n)) return 'pill_hp';
    if (d.pill?.mp || /回气/.test(n)) return 'pill_mp';
    if (d.pill?.sense || /魂|魄/.test(n)) return 'pill_soul';
    if (d.pill?.life || /寿/.test(n)) return 'pill_life';
    if (/丸/.test(d.name ?? '')) return 'pill_twin';
    if (/zhuji|jiangchen|jiuqu|筑基|降尘|九曲|金丹|结婴/.test(n)) return 'pill_ring';
    return 'pill';
  }

  // 3. 灵药
  if (d.type === 'herb') {
    if (/灵芝|血芝|紫芝|芝/.test(n)) return 'lingzhi';
    if (/参|何首乌|黄精|根/.test(n)) return 'ginseng';
    if (/竹/.test(n)) return 'bamboo';
    if (/莲/.test(n)) return 'lotus';
    if (shape === 'bottle' || /乳|露|液/.test(n)) return 'bottle';
    if (shape === 'flower') return 'flower';
    if (shape === 'fruit') return 'fruit';
    return 'herb';
  }

  // 4. 符箓（含破禁符、回府符等标记为 material 的符纸；天雷子实为雷珠）
  if (id === 'tal_tianleizi') return 'core_thunder';
  if (d.type === 'talisman' || id === 'tal_pojin' || id === 'tal_huifu') {
    if (id === 'tal_pojin' || /破禁/.test(n)) return 'tali_break';
    if (id === 'tal_huifu' || /回府/.test(n)) return 'tali_home';
    if (/火|爆|炎|剑/.test(n)) return 'tali_fire';
    if (/雷|电|轰/.test(n)) return 'tali_thunder';
    if (/风|行|盾|甲|隐|疗|金刚|遁/.test(n)) return 'tali_wind';
    return 'talisman';
  }

  // 5. 杂物（信物 / 阵盘 / 妖卵 / 幼兽 / 赠礼）
  if (d.type === 'misc') {
    if (/^zf_pan/.test(id) || /阵盘/.test(n)) return 'pan';
    if (/^egg_/.test(id) && /卵/.test(n)) return 'egg';
    if (/^egg_/.test(id) || id === 'item_tihun' || /幼崽|幼兽/.test(n)) return 'pet';
    if (id === 'gift_fan' || /团扇/.test(n)) return 'fan';
    if (id === 'gift_hairpin' || /发簪/.test(n)) return 'hairpin';
    if (id === 'gift_sachet' || /香囊/.test(n)) return 'sachet';
    if (/letter|qinpu|qingxi|遗书|族谱|笔录|信/.test(n)) return 'letter';
    if (/tok_|shengxian|令/.test(n)) return 'token';
    if (id === 'item_nuanyang' || /宝玉/.test(n)) return 'jade_disc';
    if (id === 'item_bottle' || /残卷|瓶/.test(n)) return 'gourd';
    return 'misc';
  }

  // 6. 材料（逐类细分）
  if (/^mat_yaodan/.test(id)) return 'yaodan';
  if (/yuanhun|冤魂/.test(n)) return 'soul_bead';
  if (/xueyan|血焰/.test(n)) return 'blood_spirit';
  if (/mu$|eye|鼠目|妖眼|目|眼/.test(n)) return 'eye';
  if (/weilingfen|yingfen|磷粉|灵粉|粉/.test(n)) return 'powder';
  if (/mat_mo$|灵墨/.test(n)) return 'inkstone';
  if (/寒毒|毒|泉水|灵泉/.test(n)) return 'bottle';
  if (/gubaocan|残片/.test(n)) return 'shard';
  if (/zf_qi/.test(id) || /阵旗/.test(n) && !/木/.test(n)) return 'flag';
  if (/zf_zhui|破禁锥/.test(n)) return 'awl';
  if (/竹/.test(n)) return 'bamboo';
  if (/养魂木|阵旗木/.test(n)) return 'wood_dark';
  if (/骨翅|银翅|翅/.test(n)) return 'wing';
  if (/羽|翎/.test(n)) return 'feather';
  if (/爪/.test(n)) return 'claw';
  if (/鳍/.test(n)) return 'fin';
  if (/鳞/.test(n)) return 'scale';
  if (/皮/.test(n)) return 'hide';
  if (/血肉|肉/.test(n)) return 'flesh';
  if (/角/.test(n)) return 'horn';
  if (/玄玉|刻阵玉/.test(n)) return 'jade_disc';
  if (/灵石|晶|元气/.test(n)) return 'crystal';
  if (/铁|铜|银|钢|庚精|砂/.test(n)) return 'ingot';

  // 7. 法宝 SVG 回退（Node/SSR/无 DOM 时）
  if (d.type === 'artifact' && d.art) {
    switch (d.art.kind) {
      case 'sword': case 'needle': case 'arrow': return 'art_sword';
      case 'shield': case 'armor': return 'art_shield';
      case 'ring': return 'art_ring';
      case 'bell': return 'art_bell';
      case 'mirror': return 'art_mirror';
      case 'banner': case 'bind': return 'art_banner';
      case 'flame': return 'art_flame';
      case 'boots': case 'wings': case 'flight': return 'art_boot';
      case 'cauldron': case 'slam': return 'art_ding';
    }
  }

  if (shape === 'bottle') return 'bottle';
  if (shape === 'bead') {
    if (/火|炎|阳|炽|赤/.test(n)) return 'core_fire';
    if (/冰|寒|雪|霜/.test(n)) return 'core_ice';
    if (/雷|电|风/.test(n)) return 'core_thunder';
    return 'bead';
  }
  if (shape === 'ore') return 'ore';
  return 'misc';
}

/** 专属物品/语义色彩，确保同阶物品不撞色 */
function itemColor(d: ItemDef, shape: Shape, seed: number): string {
  if (typeof d.visual?.color === 'string' && /^#[0-9a-f]{6}$/i.test(d.visual.color)) {
    return d.visual.color.toLowerCase();
  }
  const id = d.id ?? '';
  const n = d.name ?? '';

  // 卷轴颜色由所属心法道统 / 阵法灵光 / 法术系别决定
  if (d.scroll?.gongfa) {
    const g = GONGFA[d.scroll.gongfa];
    if (g?.aux) return '#7b68b8';
    const daoMap: Record<string, string> = { zheng: '#569c92', mo: '#6d354e', fo: '#c99b44', yao: '#598d5c', zhong: '#9e8f75' };
    const base = daoMap[g?.dao ?? 'zhong'] ?? '#8a7e6c';
    const sub = ['#c8bfa8', '#a9c2b8', '#a0b4ce', '#c6a4d6', '#e0c078', '#b87664', '#7098a8'][seed % 7];
    return mixHex(base, sub, 0.24);
  }
  if (d.scroll?.zhen) {
    const z = ZHEN_BY_ID[d.scroll.zhen];
    const rc = safeRgbHex(z?.color);
    return rc ? mixHex(rc, '#ead9b7', 0.35) : '#c9b486';
  }
  if (d.scroll?.skill) {
    const a = ARTS[d.scroll.skill];
    const rc = safeRgbHex(a?.color) ?? (a ? SCHOOL_COLOR[a.school] : null);
    return rc ? mixHex(rc, '#eadcc2', 0.38) : '#d5be92';
  }

  // 丹药专属色彩（避免同阶丹药同色）
  const pillMap: Record<string, string> = {
    pill_juqi: '#84b47e', pill_huanglong: '#d6a44e', pill_jinsui: '#e0ba58',
    pill_zhuji: '#5cb09a', pill_juling: '#69a2cb', pill_jiangchen: '#d4864a',
    pill_biyan: '#3ea478', pill_ningyuan: '#8e74c0', pill_jiuqu: '#b876d4',
    pill_peiying: '#d8706c', pill_huiqi: '#5ea4d4', pill_liaoshang: '#d05b53',
    pill_dingyan: '#e089a4', pill_yanshou: '#66a97a', pill_yanghun: '#8d74c8',
    pill_butian: '#72b8d4', pill_yuanling: '#5eb890', pill_zifu: '#9c68c8',
    pill_wanshou: '#ca9e4a', pill_ningpo: '#566cb8',
  };
  if (pillMap[id]) return pillMap[id];

  // 妖丹 1-10 级渐变色彩
  const yaodanColors: Record<string, string> = {
    mat_yaodan1: '#9aa49e', mat_yaodan2: '#6fb498', mat_yaodan3: '#55a67a',
    mat_yaodan4: '#5c94cc', mat_yaodan5: '#4874b8', mat_yaodan6: '#946ac8',
    mat_yaodan7: '#b85aa4', mat_yaodan8: '#cc6848', mat_yaodan9: '#de9a38',
    mat_yaodan10: '#3c3448',
  };
  if (yaodanColors[id]) return yaodanColors[id];

  // 材料与杂物专属配色
  const exactMap: Record<string, string> = {
    mat_shuangtongmu: '#d8b44c', mat_qianmuyan: '#48b878',
    mat_yingfen: '#e05b42', mat_weilingfen: '#c2ad6c', zf_mat_mo: '#38343c',
    mat_zhijiao: '#d65e3e', mat_xijiao: '#58606c', mat_leijiao: '#7c78d8',
    mat_molinjiao: '#3c3e48', mat_qingfengjiao: '#5ca894',
    mat_yunchiyu: '#c6dce6', mat_xialing: '#df7aa0', mat_bingfengyu: '#7ec8eb',
    mat_yinchi: '#c6d4e0', mat_leipenggu: '#d9ccb2',
    mat_mojiaozhao: '#3c4048', mat_mojiaoqi: '#384c5c', mat_yinzhima: '#8e4052',
    mat_xuanjialin: '#4a4e5c', mat_heilin: '#3a5458', mat_chihuolin: '#d8563a',
    mat_bingjialin: '#cde8f6', mat_jinjiaolin: '#dfb44a', mat_dujiaolin: '#b83c54',
    mat_mangpi: '#4e765a', mat_tujiapi: '#aa8a54',
    mat_huochan: '#e0663c', mat_shisha: '#5c3c6c', item_yuanqi: '#70c4dc',
    mat_tiejing: '#6e7680', mat_chitong: '#c66844', mat_xuantie: '#464d56',
    mat_gengjing: '#e4c86c', mat_lingshi: '#88c6dc', mat_xuanyu: '#548e82',
    zf_mat_yu: '#6cb89c', mat_jinleizhu: '#cfa63c', mat_yanghunmu: '#6a5248',
    zf_mat_mu: '#ba9a5c', mat_gubaocan: '#a8844c', mat_yuanhun: '#7e8e88',
    mat_xueyan: '#b83242', mat_shuanggongdu: '#7ac6e8', mat_lingquan: '#68b8c8',
    zf_qi: '#d8caa4', zf_qi2: '#7a6ac8', zf_zhui: '#b4c4d4',
    tal_pojin: '#e0b864', tal_huifu: '#7ec2a6',
    zf_pan1: '#9c7850', zf_pan2: '#b68a4a', zf_pan3: '#d8e4df', zf_pan4: '#483c58',
    egg_yunchi: '#c6dce4', egg_huli: '#d8825a', egg_wolf: '#7c8a98',
    egg_jiao: '#486878', egg_shijin: '#c8a040', item_tihun: '#645282',
    item_moletter: '#dfd2b4', item_qinpu: '#b89e74', item_qingxi: '#688ea8',
    tok_danuoyi: '#a47e48', item_shengxian: '#5ea892', item_nuanyang: '#dc745a',
    item_bottle: '#483a30', gift_fan: '#e8d8be', gift_hairpin: '#60b496', gift_sachet: '#c85866',
  };
  if (exactMap[id]) return exactMap[id];

  // 兜底调色
  if (/火|炎|阳|赤|血/.test(n)) return '#d06248';
  if (/冰|寒|雪|霜/.test(n)) return '#7ab8dc';
  if (/雷|电/.test(n)) return '#7a84d6';
  const colors = palettes[shape];
  return colors[seed % colors.length];
}

/** 卷轴/心法上的小徽记 */
function scrollBadge(d: ItemDef): string {
  if (d.scroll?.gongfa) {
    const g = GONGFA[d.scroll.gongfa];
    if (g?.aux) return 'star';
    if (g?.sword) return 'sword';
    if ((g?.hp ?? 0) >= 0.3 || (g?.def ?? 0) >= 0.2) return 'shield';
    if (g?.school) {
      const top = Object.entries(g.school).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top === '火') return 'fire';
      if (top === '冰') return 'ice';
      if (top === '雷') return 'lightning';
      if (top === '剑') return 'sword';
      if (top === '木') return 'wood';
      if (top === '体') return 'body';
    }
    if (g?.dao === 'mo') return 'ghost';
    if (g?.dao === 'fo') return 'lotus';
    if (g?.dao === 'yao') return 'beast';
    return 'taichi';
  }
  if (d.scroll?.zhen) {
    const z = ZHEN_BY_ID[d.scroll.zhen];
    return z?.cat === '杀' ? 'sword' : z?.cat === '守' ? 'shield' : z?.cat === '辅' ? 'heal' : 'array';
  }
  if (d.scroll?.skill) {
    const a = ARTS[d.scroll.skill];
    if (!a) return 'star';
    if (a.cast === 'shield') return 'shield';
    if (a.cast === 'heal') return 'heal';
    if (a.cast === 'summon' || a.fx === 'dragon') return 'beast';
    switch (a.fx) {
      case 'fireball': case 'firesnake': case 'crow': case 'flame': case 'icefire': return 'fire';
      case 'icicle': case 'frost': case 'needle': return 'ice';
      case 'water': return 'water';
      case 'lightning': case 'goldthunder': return 'lightning';
      case 'wind': case 'tornado': return 'wind';
      case 'rock': case 'magnet': return 'earth';
      case 'vine': case 'leaf': return 'wood';
      case 'sword': case 'bigsword': return 'sword';
      case 'palm': case 'roar': return 'body';
      case 'blood': case 'ghost': return 'ghost';
      case 'mind': return 'mind';
      case 'array': return 'array';
      case 'talisman': return 'talisman';
      default: return 'star';
    }
  }
  return 'lines';
}

function badgeGlyph(kind: string, x: number, y: number, col: string): string {
  switch (kind) {
    case 'fire':
      return `<path d="M${x} ${y + 7}C${x - 5} ${y + 7} ${x - 6} ${y + 2} ${x - 3} ${y - 2}C${x - 1} ${y - 4} ${x} ${y - 7} ${x + 1} ${y - 8}C${x + 4} ${y - 4} ${x + 6} ${y} ${x + 4} ${y + 4}C${x + 4} ${y + 6} ${x + 2} ${y + 7} ${x} ${y + 7}Z" fill="${col}" stroke="none"/>`;
    case 'ice':
      return `<path d="M${x} ${y - 7}V${y + 7}M${x - 6} ${y - 3.5}L${x + 6} ${y + 3.5}M${x + 6} ${y - 3.5}L${x - 6} ${y + 3.5}" fill="none" stroke="${col}" stroke-width="1.8"/>`;
    case 'water':
      return `<path d="M${x} ${y - 7}C${x - 5} ${y - 1} ${x - 5} ${y + 6} ${x} ${y + 6}C${x + 5} ${y + 6} ${x + 5} ${y - 1} ${x} ${y - 7}Z" fill="${col}" stroke="none"/>`;
    case 'lightning':
      return `<path d="M${x + 2} ${y - 8}L${x - 4} ${y + 1}H${x}L${x - 2} ${y + 8}L${x + 5} ${y - 1}H${x + 1}Z" fill="${col}" stroke="none"/>`;
    case 'wind':
      return `<path d="M${x - 6} ${y - 3}Q${x} ${y - 7} ${x + 5} ${y - 3}M${x - 7} ${y + 1}Q${x} ${y - 2} ${x + 6} ${y + 1}M${x - 4} ${y + 5}Q${x + 1} ${y + 3} ${x + 5} ${y + 5}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
    case 'earth':
      return `<path d="M${x - 7} ${y + 6}L${x - 2} ${y - 2}L${x + 1} ${y + 1}L${x + 3} ${y - 6}L${x + 7} ${y + 6}Z" fill="${col}" stroke="none"/>`;
    case 'wood':
      return `<path d="M${x} ${y + 7}Q${x - 1} ${y} ${x + 2} ${y - 7}M${x} ${y + 1}Q${x - 6} ${y} ${x - 5} ${y - 4}Q${x - 1} ${y - 4} ${x} ${y}M${x + 1} ${y - 2}Q${x + 6} ${y - 5} ${x + 6} ${y - 1}Q${x + 3} ${y + 1} ${x + 1} ${y}" fill="${col}" stroke="${col}" stroke-width="0.7"/>`;
    case 'sword':
      return `<path d="M${x - 5} ${y + 6}L${x + 4} ${y - 5}L${x + 6} ${y - 6}L${x + 5} ${y - 3}L${x - 4} ${y + 7}Z" fill="${col}" stroke="none"/><path d="M${x - 6} ${y + 2}L${x - 1} ${y + 6}" stroke="${col}" stroke-width="1.6"/>`;
    case 'body':
      return `<rect x="${x - 5}" y="${y - 4}" width="10" height="8" rx="2.5" fill="${col}" stroke="none"/><path d="M${x - 3} ${y - 4}V${y + 1}M${x} ${y - 4}V${y + 1}M${x + 3} ${y - 4}V${y + 1}" stroke="#f6edd8" stroke-width="1"/>`;
    case 'ghost':
      return `<path d="M${x - 5} ${y + 6}L${x - 4} ${y - 1}Q${x} ${y - 8} ${x + 4} ${y - 1}L${x + 5} ${y + 6}L${x + 2} ${y + 4}L${x} ${y + 7}L${x - 2} ${y + 4}Z" fill="${col}" stroke="none"/><circle cx="${x - 2}" cy="${y}" r="1" fill="#fff"/><circle cx="${x + 2}" cy="${y}" r="1" fill="#fff"/>`;
    case 'mind':
      return `<path d="M${x - 7} ${y}Q${x} ${y - 6} ${x + 7} ${y}Q${x} ${y + 6} ${x - 7} ${y}Z" fill="none" stroke="${col}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="2.2" fill="${col}" stroke="none"/>`;
    case 'shield':
      return `<path d="M${x} ${y - 6}L${x + 6} ${y - 3}V${y + 2}Q${x + 5} ${y + 6} ${x} ${y + 8}Q${x - 5} ${y + 6} ${x - 6} ${y + 2}V${y - 3}Z" fill="none" stroke="${col}" stroke-width="1.6"/>`;
    case 'heal':
      return `<path d="M${x - 1.8} ${y - 6}H${x + 1.8}V${y - 1.8}H${x + 6}V${y + 1.8}H${x + 1.8}V${y + 6}H${x - 1.8}V${y + 1.8}H${x - 6}V${y - 1.8}H${x - 1.8}Z" fill="${col}" stroke="none"/>`;
    case 'beast':
      return `<path d="M${x - 5} ${y + 2}L${x - 6} ${y - 5}L${x - 2} ${y - 2}Q${x} ${y - 4} ${x + 2} ${y - 2}L${x + 6} ${y - 5}L${x + 5} ${y + 2}Q${x + 4} ${y + 6} ${x} ${y + 7}Q${x - 4} ${y + 6} ${x - 5} ${y + 2}Z" fill="${col}" stroke="none"/>`;
    case 'lotus':
      return `<path d="M${x} ${y - 6}Q${x - 3} ${y} ${x} ${y + 5}Q${x + 3} ${y} ${x} ${y - 6}Z M${x - 6} ${y - 2}Q${x - 3} ${y + 5} ${x} ${y + 5}Q${x - 2} ${y} ${x - 6} ${y - 2}Z M${x + 6} ${y - 2}Q${x + 3} ${y + 5} ${x} ${y + 5}Q${x + 2} ${y} ${x + 6} ${y - 2}Z" fill="${col}" stroke="none"/>`;
    case 'taichi':
      return `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${col}" stroke-width="1.4"/><path d="M${x} ${y - 6}A3 3 0 0 1 ${x} ${y}A3 3 0 0 0 ${x} ${y + 6}A6 6 0 0 1 ${x} ${y - 6}Z" fill="${col}" stroke="none"/><circle cx="${x}" cy="${y - 3}" r="1.1" fill="#f7eed8" stroke="none"/><circle cx="${x}" cy="${y + 3}" r="1.1" fill="${col}" stroke="none"/>`;
    case 'talisman':
      return `<rect x="${x - 3.5}" y="${y - 6}" width="7" height="12" fill="none" stroke="${col}" stroke-width="1.4"/><path d="M${x} ${y - 4}V${y + 4}M${x - 2} ${y - 1}H${x + 2}" stroke="${col}" stroke-width="1.2"/>`;
    case 'array':
      return `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${col}" stroke-width="1.3"/><path d="M${x} ${y - 5}L${x + 4.5} ${y + 3}H${x - 4.5}Z" fill="none" stroke="${col}" stroke-width="1.1"/>`;
    default:
      return `<path d="M${x} ${y - 7}L${x + 2} ${y - 2}L${x + 7} ${y}L${x + 2} ${y + 2}L${x} ${y + 7}L${x - 2} ${y + 2}L${x - 7} ${y}L${x - 2} ${y - 2}Z" fill="${col}" stroke="none"/>`;
  }
}

function geometry(motif: Motif, c: string, accent: string, tier: number, v: number, d: ItemDef): string {
  const dx = (v % 3) - 1;
  const id = d.id ?? '';
  switch (motif) {
    // —— 灵药
    case 'lingzhi':
      return `<path d="M31 53 Q30 40 32 30 M24 53 Q27 42 29 34" fill="none" stroke="#624634" stroke-width="3.2"/><path d="M13 28 Q14 16 32 16 Q50 16 51 28 Q42 32 32 30 Q22 32 13 28Z" fill="${c}"/><path d="M19 36 Q20 27 33 27 Q45 27 46 36 Q38 39 32 38 Q25 39 19 36Z" fill="${accent}" opacity="0.9"/><path d="M21 22 Q32 19 43 22" fill="none" stroke="#f8ecd2" stroke-width="1.3"/>`;
    case 'ginseng':
      if (id === 'herb_huangjing') {
        return `<path d="M16 40 Q22 33 30 37 Q38 41 48 35 Q45 45 36 45 Q26 47 16 40Z" fill="#d8b658"/><path d="M24 38 V23 M34 38 V17 M42 36 V26" fill="none" stroke="#588e46" stroke-width="2.2"/><ellipse cx="22" cy="24" rx="5" ry="2.4" fill="#6ca854"/><ellipse cx="36" cy="18" rx="6" ry="2.6" fill="#6ca854"/><circle cx="29" cy="28" r="2.2" fill="#f5d848"/><circle cx="38" cy="26" r="2.2" fill="#f5d848"/>`;
      }
      return `<path d="M27 17 H37 L38 30 L45 48 L39 51 L34 39 L30 52 L24 51 L26 37 L18 46 L16 42 L25 29Z" fill="${c}"/><path d="M32 17 Q27 11 22 14 M32 17 Q37 10 43 14 M32 17 V10" fill="none" stroke="#589a56" stroke-width="2"/><path d="M28 24 H36 M27 29 H36" fill="none" stroke="${accent}" stroke-width="1.1"/>`;
    case 'bamboo': {
      const bolt = id === 'mat_jinleizhu' || id === 'herb_tianleizhu' || /金雷|雷/.test(d.name ?? '') || tier >= 2;
      return `<path d="M28 53 V13 H36 V53Z" fill="${c}"/><path d="M27 24 H37 M27 37 H37" stroke="#eef3da" stroke-width="1.6"/><path d="M36 22 Q48 16 51 22 Q44 26 36 24 M28 32 Q16 28 13 33 Q20 37 28 34" fill="${id === 'mat_jinleizhu' ? '#c8a840' : '#6ab068'}"/><path d="M23 14 L18 22 L24 22 L20 31" fill="none" stroke="${id === 'mat_jinleizhu' ? '#ffe878' : '#9be8ff'}" stroke-width="1.8" opacity="${bolt ? 0.95 : 0}"/>`;
    }
    case 'lotus':
      return `<path d="M32 12 Q25 24 27 37 Q32 42 37 37 Q39 24 32 12Z" fill="${c}"/><path d="M26 36 Q16 25 14 19 Q23 21 28 32Z" fill="${c}"/><path d="M38 36 Q48 25 50 19 Q41 21 36 32Z" fill="${c}"/><path d="M18 42 Q26 49 32 49 Q38 49 46 42 Q39 40 32 42 Q25 40 18 42Z" fill="#639a76"/><circle cx="32" cy="29" r="3" fill="#fae29a"/>`;
    case 'herb':
      if (id === 'herb_jinxin') {
        return `<path d="M32 52 V24" stroke="#487c3e" stroke-width="2.4"/><path d="M32 44 Q16 40 15 24 Q28 24 32 39Z" fill="${c}"/><path d="M32 44 Q48 40 49 24 Q36 24 32 39Z" fill="${c}"/><path d="M22 30 Q26 32 31 37 M42 30 Q38 32 33 37" stroke="#ffd858" stroke-width="1.6" fill="none"/><circle cx="32" cy="20" r="4.5" fill="#ffe672"/><circle cx="32" cy="20" r="2" fill="#fffbe0" stroke="none"/>`;
      }
      if (id === 'herb_nichang') {
        return `<path d="M32 52 V22" stroke="#5a8c66" stroke-width="2"/><path d="M32 24 Q17 20 14 38 Q22 34 26 28 M32 24 Q47 20 50 38 Q42 34 38 28 M32 26 Q23 36 25 49 M32 26 Q41 36 39 49" fill="none" stroke="${c}" stroke-width="2.6"/><circle cx="32" cy="20" r="4" fill="#ffe29a"/>`;
      }
      if (id === 'herb_bingpo') {
        return `<path d="M32 51 L26 14 L32 20 L38 14 Z" fill="#b4ecff"/><path d="M29 51 L15 24 L25 32 Z M35 51 L49 24 L39 32 Z" fill="${c}"/><path d="M32 22 V47" stroke="#ffffff" stroke-width="1.2"/>`;
      }
      if (id === 'herb_xuejing') {
        return `<path d="M32 52 L25 22 L32 14 L39 22 Z" fill="${c}"/><path d="M28 50 L14 30 L26 37 Z M36 50 L50 30 L38 37 Z" fill="#9a1e2e"/><circle cx="32" cy="20" r="3.2" fill="#ff5858"/>`;
      }
      return `<path d="M32 52 Q${30 + dx} 36 35 14 M32 37 Q18 38 15 26 Q27 23 32 35 M34 29 Q42 19 51 22 Q50 33 34 34" fill="${c}"/><path d="M32 52 Q${30 + dx} 36 35 14 M20 28L31 36 M47 25L35 32" fill="none" stroke="#334f40"/>`;
    case 'flower':
      if (id === 'herb_zihou') {
        return `<path d="M32 53 Q30 40 32 30" stroke="#4c7a48" stroke-width="2.4"/><ellipse cx="22" cy="43" rx="7" ry="3" fill="#5e9a54" transform="rotate(-24 22 43)"/><ellipse cx="42" cy="43" rx="7" ry="3" fill="#5e9a54" transform="rotate(24 42 43)"/><ellipse cx="32" cy="18" rx="5" ry="9" fill="#d094f6"/><ellipse cx="21" cy="25" rx="7" ry="5" fill="${c}"/><ellipse cx="43" cy="25" rx="7" ry="5" fill="${c}"/><circle cx="32" cy="26" r="5" fill="#7036a4"/><circle cx="30" cy="25" r="1.1" fill="#ffe890" stroke="none"/><circle cx="34" cy="25" r="1.1" fill="#ffe890" stroke="none"/>`;
      }
      return `<path d="M32 53 Q30 42 32 33 M31 46 Q21 42 19 36 Q27 35 32 41 M33 46 Q41 41 44 36 Q37 35 32 40" fill="#82aa80"/><g fill="${c}"><ellipse cx="32" cy="20" rx="6" ry="12"/><ellipse cx="32" cy="20" rx="6" ry="12" transform="rotate(60 32 25)"/><ellipse cx="32" cy="20" rx="6" ry="12" transform="rotate(120 32 25)"/></g><circle cx="32" cy="25" r="4" fill="${accent}"/>`;
    case 'fruit':
      if (id === 'herb_huolong') {
        return `<ellipse cx="32" cy="35" rx="15" ry="17" fill="${c}"/><path d="M22 25 Q15 16 20 14 Q26 19 28 24 M42 25 Q49 16 44 14 Q38 19 36 24 M19 37 Q12 34 15 29 M45 37 Q52 34 49 29" fill="#88c248"/><path d="M25 34 Q32 30 39 34 M24 42 Q32 38 40 42" fill="none" stroke="#ffae48" stroke-width="1.3"/>`;
      }
      return `<path d="M32 22 Q18 14 16 32 Q15 48 30 51 Q45 53 48 36 Q49 21 36 22Z" fill="${c}"/><path d="M32 23 Q31 13 37 11 M33 21 Q42 13 47 17 Q43 23 33 23" fill="#83a880"/><path d="M22 31 Q22 25 28 25" fill="none" stroke="#fff2d8"/>`;

    // —— 丹药（功效 + 丹型各自鲜明）
    case 'gourd':
      return `<path d="M30 10 H34 V14 Q41 16 40 23 Q39 28 35 29 Q45 33 45 43 Q45 53 32 53 Q19 53 19 43 Q19 33 29 29 Q25 28 24 23 Q23 16 30 14Z" fill="${c}"/><path d="M26 29 H38" stroke="#b93e32" stroke-width="2.2"/><path d="M24 38 Q24 33 28 33" fill="none" stroke="#fff3d6" stroke-width="1.6"/>`;
    case 'bottle': {
      const frosty = id === 'mat_shuanggongdu';
      return `<path d="M27 12 H37 V21 Q46 25 46 43 Q46 51 38 52 H26 Q18 51 18 43 Q18 25 27 21Z" fill="${c}"/><path d="M27 12 H37 V18 H27Z" fill="${accent}"/><path d="M23 32 Q23 26 27 25 M23 37V43" fill="none" stroke="#f5f0db" stroke-width="2"/>${frosty ? `<path d="M26 36 L38 42 M38 36 L26 42 M32 33 V45" fill="none" stroke="#eefcff" stroke-width="1.4"/>` : `<path d="M23 41 Q28 38 32 41 Q36 44 41 41" fill="none" stroke="#e6fbff" stroke-width="1.5"/>`}`;
    }
    case 'pill_hp':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><path d="M21 30 Q22 20 32 19" fill="none" stroke="#ffe8e0" stroke-width="2"/><path d="M30 25 H34 V30 H39 V34 H34 V39 H30 V34 H25 V30 H30Z" fill="#e8f8dc" stroke="#3c6a38" stroke-width="1"/>`;
    case 'pill_mp':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><path d="M21 30 Q22 20 32 19" fill="none" stroke="#e4f6ff" stroke-width="2"/><path d="M32 25 Q39 26 38 33 Q36 39 29 38 Q24 36 26 30 Q28 27 32 29" fill="none" stroke="#f0fbff" stroke-width="2"/>`;
    case 'pill_soul':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><circle cx="32" cy="32" r="14" fill="none" stroke="#e6d6ff" stroke-width="1.1" stroke-dasharray="2 2"/><path d="M22 32 Q32 23 42 32 Q32 41 22 32Z" fill="#f5eaff" stroke="#4d3b72" stroke-width="1.1"/><circle cx="32" cy="32" r="${id === 'pill_ningpo' ? 3.8 : 2.6}" fill="#5b3fa2" stroke="none"/>${id === 'pill_ningpo' ? `<circle cx="32" cy="32" r="1.2" fill="#ffe8ff" stroke="none"/>` : ''}`;
    case 'pill_life':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><circle cx="32" cy="32" r="13" fill="none" stroke="${id === 'pill_wanshou' ? '#fff0b8' : '#d8f5d0'}" stroke-width="1.3"/><path d="M32 22 V42 M26 28 Q32 24 38 28 M24 34 Q32 30 40 34" fill="none" stroke="${id === 'pill_wanshou' ? '#fff0b8' : '#e6fce0'}" stroke-width="1.6"/>`;
    case 'pill_beauty':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><g fill="#ffeaf0" stroke="#9e4d68" stroke-width="0.9"><circle cx="32" cy="25" r="3.4"/><circle cx="38" cy="30" r="3.4"/><circle cx="36" cy="37" r="3.4"/><circle cx="28" cy="37" r="3.4"/><circle cx="26" cy="30" r="3.4"/></g><circle cx="32" cy="32" r="2.6" fill="#fae288" stroke="none"/>`;
    case 'pill_butian':
      return `<path d="M32 13 L46 21 L49 38 L37 50 L20 47 L15 31 L22 17Z" fill="${c}"/><path d="M20 28 L32 18 L43 27 L38 43 L23 41Z" fill="#e89cc4" opacity="0.55"/><path d="M26 24 L39 28 L34 40 L24 35Z" fill="#f5dc78" opacity="0.7"/><circle cx="32" cy="32" r="4" fill="#ffffff" stroke="none"/>`;
    case 'pill_twin':
      return `<circle cx="25" cy="36" r="12" fill="${c}"/><circle cx="39" cy="28" r="12" fill="${mixHex(c, '#fff2c8', 0.22)}"/><path d="M18 34 Q20 27 27 27 M32 26 Q34 19 41 19" fill="none" stroke="#fff7df" stroke-width="1.6"/>`;
    case 'pill_ring': {
      const tri = id === 'pill_jiangchen';
      const lotus = id === 'pill_jiuqu';
      return `<circle cx="32" cy="32" r="21" fill="none" stroke="#f0c868" stroke-width="1.7" stroke-dasharray="3 2"/><circle cx="32" cy="32" r="16.5" fill="${c}"/><path d="M21 31 Q22 20 33 19" fill="none" stroke="#fff6de" stroke-width="1.8"/>${lotus ? `<path d="M32 23 Q29 29 32 39 Q35 29 32 23Z M25 28 Q28 36 32 39 M39 28 Q36 36 32 39" fill="none" stroke="#ffeaa8" stroke-width="1.4"/>` : tri ? `<circle cx="32" cy="26" r="2.2" fill="#ffe6a0" stroke="none"/><circle cx="27" cy="35" r="2.2" fill="#ffe6a0" stroke="none"/><circle cx="37" cy="35" r="2.2" fill="#ffe6a0" stroke="none"/>` : `<path d="M25 32 Q32 25 39 32 Q32 39 25 32Z" fill="none" stroke="#f5e6b0" stroke-width="1.4"/>`}`;
    }
    case 'pill_crack':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><path d="M24 19 L30 29 L26 36 L34 45 M34 26 L41 22" fill="none" stroke="#3c2624" stroke-width="1.6"/><circle cx="39" cy="39" r="2.2" fill="#4f2b38"/>`;
    case 'pill': {
      const m = hash(id) % 3;
      const mark = id === 'pill_huanglong'
        ? `<path d="M24 35 Q28 24 34 28 Q39 32 35 38 Q30 40 28 35" fill="none" stroke="#fff2c0" stroke-width="1.8"/>`
        : id === 'pill_peiying'
          ? `<circle cx="32" cy="32" r="13.5" fill="none" stroke="#ffe2cc" stroke-width="1.1" stroke-dasharray="3 2"/><path d="M32 23 Q38 29 32 39 Q26 29 32 23Z" fill="#ffdcc8" stroke="none"/>`
          : m === 0
            ? `<path d="M24 33 Q32 26 40 33" fill="none" stroke="#f7ebd2" stroke-width="1.6"/><circle cx="32" cy="37" r="2.2" fill="#f7ebd2" stroke="none"/>`
            : m === 1
              ? `<circle cx="32" cy="32" r="8" fill="none" stroke="#f7ebd2" stroke-width="1.3"/>`
              : `<path d="M26 36 Q32 28 40 32 M25 40 Q33 36 39 37" fill="none" stroke="#f7ebd2"/>`;
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><path d="M20 32 Q21 19 33 18" fill="none" stroke="#f9eaca" stroke-width="2"/>${mark}`;
    }

    // —— 妖丹 / 珠核
    case 'yaodan': {
      const lv = Number((id.match(/(\d+)$/) ?? [])[1] ?? (tier + 1));
      const ring = lv >= 6 ? `<circle cx="32" cy="32" r="21" fill="none" stroke="${lv >= 9 ? '#f5cf60' : '#d6b0f0'}" stroke-width="1.4" stroke-dasharray="${lv >= 8 ? '5 2' : '2 3'}"/>` : '';
      const dots = Math.min(5, Math.max(1, Math.ceil(lv / 2)));
      let sym = '';
      if (lv <= 3) {
        sym = Array.from({ length: lv }, (_, i) => `<circle cx="${32 + (i - (lv - 1) / 2) * 7}" cy="34" r="2" fill="#f7f0d8" stroke="none"/>`).join('');
      } else if (lv <= 6) {
        sym = `<polygon points="${Array.from({ length: dots + 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / (dots + 2); return `${(32 + 7 * Math.cos(a)).toFixed(1)},${(32 + 7 * Math.sin(a)).toFixed(1)}`; }).join(' ')}" fill="none" stroke="#f7f0d8" stroke-width="1.4"/>`;
      } else {
        sym = `<circle cx="32" cy="32" r="8" fill="none" stroke="#ffe89c" stroke-width="1.3"/><path d="M32 21 V43 M21 32 H43" stroke="#ffe89c" stroke-width="1.1"/>`;
      }
      return `${ring}<circle cx="32" cy="32" r="16.5" fill="${c}"/><path d="M21 28 Q23 19 33 19" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.8"/>${sym}`;
    }
    case 'soul_bead':
      return `<circle cx="32" cy="32" r="17" fill="${c}"/><path d="M26 38 L27 28 Q32 20 37 28 L38 38 L34 35 L32 39 L30 35Z" fill="#d8ffe6" stroke="none"/><circle cx="30" cy="29" r="1.4" fill="#2c3e36" stroke="none"/><circle cx="34" cy="29" r="1.4" fill="#2c3e36" stroke="none"/>`;
    case 'blood_spirit':
      return `<path d="M32 11 L44 25 L41 47 L23 47 L20 25Z" fill="${c}"/><path d="M32 18 Q39 27 35 35 Q39 33 36 42 Q28 43 26 35 Q28 26 32 18Z" fill="#ff9678" stroke="none"/><circle cx="32" cy="35" r="3" fill="#ffe6b0" stroke="none"/>`;

    // —— 妖兽身体部位与特种材料
    case 'eye': {
      const twin = id === 'mat_shuangtongmu';
      return `<path d="M12 32 Q32 15 52 32 Q32 49 12 32Z" fill="#f6f2e2"/><circle cx="32" cy="32" r="10.5" fill="${c}"/>${twin ? `<ellipse cx="29" cy="32" rx="1.7" ry="5.5" fill="#201814" stroke="none"/><ellipse cx="35" cy="32" rx="1.7" ry="5.5" fill="#201814" stroke="none"/>` : `<ellipse cx="32" cy="32" rx="2.4" ry="7" fill="#18261a" stroke="none"/><circle cx="29" cy="28" r="1.6" fill="#ffffff" stroke="none"/>`}`;
    }
    case 'powder':
      return `<ellipse cx="32" cy="43" rx="19" ry="7" fill="#d8cdb6"/><path d="M17 42 Q25 27 32 31 Q39 27 47 42Z" fill="${c}"/><circle cx="25" cy="23" r="1.8" fill="${c}" stroke="none"/><circle cx="35" cy="18" r="2.2" fill="${c}" stroke="none"/><circle cx="42" cy="25" r="1.6" fill="${c}" stroke="none"/><circle cx="30" cy="25" r="1.3" fill="#fff2b0" stroke="none"/>`;
    case 'inkstone':
      return `<ellipse cx="32" cy="40" rx="19" ry="10" fill="${c}"/><ellipse cx="30" cy="39" rx="11" ry="5.5" fill="#1c1820"/><circle cx="38" cy="38" r="3" fill="#c83c2c" stroke="none"/><path d="M35 16 L46 21 L40 36 L29 31Z" fill="#2a242c"/>`;
    case 'claw':
      return `<path d="M15 44 L22 33 L32 38 L24 49Z" fill="${c}"/><path d="M22 33 Q24 19 35 12 Q30 24 31 37 M29 36 Q35 22 46 18 Q39 29 36 41 M33 41 Q41 31 51 30 Q43 38 38 46" fill="${c}"/>`;
    case 'fin':
      return `<path d="M16 47 Q18 22 48 16 Q44 33 46 47 Z" fill="${c}"/><path d="M16 47 L31 21 M18 47 L40 22 M21 47 L45 31 M25 47 L45 40" stroke="#a6c4d4" stroke-width="1.3"/>`;
    case 'scale':
      return `<path d="M18 19 Q32 13 46 19 L49 34 Q44 49 32 52 Q20 49 15 34Z" fill="${c}"/><path d="M22 25 Q32 21 42 25 M20 33 Q32 29 44 33 M23 41 Q32 38 41 41" fill="none" stroke="${mixHex(c, '#ffffff', 0.45)}" stroke-width="1.5"/><path d="M32 16 V48" fill="none" stroke="${mixHex(c, '#000000', 0.35)}" stroke-width="1.1"/>`;
    case 'hide':
      return `<path d="M16 20 Q22 15 32 18 Q42 15 48 20 L46 47 Q32 43 18 47Z" fill="${c}"/><path d="M23 26 L29 30 L24 35 M38 25 L34 31 L40 36 M27 40 Q32 36 37 40" fill="none" stroke="${mixHex(c, '#f4e6c0', 0.45)}" stroke-width="1.4"/>`;
    case 'flesh':
      return `<path d="M17 36 Q15 22 28 18 Q42 15 47 28 Q50 42 36 47 Q22 49 17 36Z" fill="${c}"/><path d="M22 30 Q30 26 39 31 M25 38 Q32 34 40 38" fill="none" stroke="#ffd4dc" stroke-width="1.6"/>`;
    case 'feather':
      return `<path d="M17 50 Q26 36 47 13" fill="none" stroke="#ece6d4" stroke-width="2.2"/><path d="M21 44 Q18 28 36 16 Q44 13 48 13 Q45 25 36 35 Q28 42 21 44Z" fill="${c}"/><path d="M25 37 L34 31 M29 31 L39 25 M34 25 L43 20" stroke="${id === 'mat_xialing' ? '#f8dc78' : '#ffffff'}" stroke-opacity="0.7" stroke-width="1.2"/>`;
    case 'wing':
      return `<path d="M14 45 Q15 21 48 15 Q42 26 49 30 Q36 33 43 39 Q29 40 34 47 Z" fill="${c}"/><path d="M14 45 Q24 27 46 17 M19 42 L41 29 M23 44 L36 38" fill="none" stroke="${id === 'mat_leipenggu' ? '#ffe068' : '#eef6ff'}" stroke-width="1.6"/>`;
    case 'horn': {
      const straight = id === 'mat_xijiao';
      const spiral = id === 'mat_leijiao';
      if (straight) return `<path d="M21 48 L35 13 L43 48 Z" fill="${c}"/><path d="M26 39 H38 M29 30 H37" stroke="#b8c0cc" stroke-width="1.3"/>`;
      return `<path d="M18 49 Q20 26 47 13 Q42 32 28 49Z" fill="${c}"/><path d="M24 41 L31 44 M29 33 L36 36 M35 25 L41 28" fill="none" stroke="${spiral ? '#d8e4ff' : accent}" stroke-width="1.5"/>`;
    }
    case 'crystal':
      return `<path d="M28 50 L24 23 L32 10 L40 23 L36 50Z" fill="${c}"/><path d="M16 48 L14 29 L21 20 L26 30 L24 49Z" fill="${c}" opacity="0.9"/><path d="M40 49 L38 30 L45 21 L50 31 L47 49Z" fill="${c}" opacity="0.88"/><path d="M32 10 V49 M24 23 L32 29 L40 23" fill="none" stroke="#eefaff" stroke-width="1.3"/>`;
    case 'ingot': {
      const goldSilk = id === 'mat_gengjing';
      return `<path d="M13 38 L21 21 H43 L51 38 L44 48 H20Z" fill="${c}"/><path d="M21 21 L25 33 H39 L43 21 M25 33 L20 48 M39 33 L44 48" fill="none" stroke="${accent}"/><path d="M23 25 H38" stroke="#fff4d8" stroke-width="1.5"/>${goldSilk ? `<path d="M19 31 L29 22 M28 38 L42 26 M35 44 L47 34" stroke="#fff9cc" stroke-width="1.5"/>` : ''}`;
    }
    case 'shard':
      return `<path d="M17 26 L31 14 L46 21 L40 31 L48 39 L34 50 L20 44 L24 34Z" fill="${c}"/><path d="M26 24 L37 26 M27 36 L38 41" stroke="#f6dfa0" stroke-width="1.4"/>`;
    case 'flag': {
      const hi = id === 'zf_qi2';
      return `<path d="M20 53 V11" stroke="${hi ? '#bce8d8' : '#7a5c3c'}" stroke-width="3"/><circle cx="20" cy="11" r="2.8" fill="${hi ? '#f2d068' : '#b89458'}"/><path d="M21 14 L49 23 L21 35Z" fill="${c}"/><path d="M27 21 L34 23 L27 27" fill="none" stroke="${hi ? '#ffe998' : '#6c5a3e'}" stroke-width="1.5"/>`;
    }
    case 'awl':
      return `<path d="M29 14 H35 V21 L38 24 L32 53 L26 24 L29 21Z" fill="${c}"/><path d="M32 23 V50" stroke="#ffffff" stroke-width="1.3"/><path d="M26 24 H38" stroke="#6a788a" stroke-width="1.5"/>`;
    case 'wood_dark':
      return `<path d="M24 51 L26 15 Q32 12 38 15 L40 51 Q32 54 24 51Z" fill="${c}"/><path d="M29 22 Q32 32 29 44 M35 20 Q33 34 36 46" fill="none" stroke="${id === 'mat_yanghunmu' ? '#9be0ff' : '#d8c494'}" stroke-width="1.3"/>`;
    case 'jade_disc':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><circle cx="32" cy="32" r="5.5" fill="#2c2824" fill-opacity="0.25"/><path d="M21 25 Q26 19 34 19" fill="none" stroke="#ffffff" stroke-opacity="0.65" stroke-width="1.8"/>`;

    // —— 符箓
    case 'tali_fire':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M32 20 Q39 28 33 36 Q38 33 36 42 Q30 45 27 38 Q26 31 32 20Z" fill="none" stroke="#b93628" stroke-width="2"/><circle cx="38" cy="44" r="2.2" fill="#b93628"/>`;
    case 'tali_thunder':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M36 20 L27 33 H34 L29 45" fill="none" stroke="#5c42a8" stroke-width="2.2"/><circle cx="38" cy="44" r="2.2" fill="#5c42a8"/>`;
    case 'tali_wind':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M25 27 Q32 21 39 27 Q32 33 25 38 Q33 42 39 39" fill="none" stroke="#2f7e60" stroke-width="2"/><circle cx="38" cy="44" r="2.2" fill="#2f7e60"/>`;
    case 'tali_break':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M26 22 L37 32 M38 22 L25 36 M28 39 H38" fill="none" stroke="#a63228" stroke-width="2.2"/>`;
    case 'tali_home':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M24 31 L32 23 L40 31 M27 30 V43 H37 V30" fill="none" stroke="#2d6c58" stroke-width="2"/>`;
    case 'talisman':
      return `<path d="M19 11 H44 L46 52 33 49 19 53Z" fill="${c}"/><path d="M24 16 H40 M25 47 H40 M31 20 V39 M25 26 H38 L34 31 39 36 M26 33 L23 39 M28 42 H39" fill="none" stroke="#aa4d3a" stroke-width="2"/><circle cx="39" cy="43" r="2" fill="#aa4d3a"/>`;

    // —— 功法 / 法术 / 阵图（三大视觉形态：线装古籍 vs 八角阵图卷 vs 法术灵简）
    case 'book_gongfa': {
      const badge = scrollBadge(d);
      const trim = tier >= 4 ? '#f2cc64' : tier >= 3 ? '#d8b058' : tier >= 2 ? '#9ab6cc' : '#8c7a62';
      const emblemCol = mixHex(c, '#fff6df', 0.72);
      return `<rect x="14" y="12" width="35" height="40" rx="2" fill="${c}"/><path d="M14 12 H21 V52 H14 Z" fill="${mixHex(c, '#1c1410', 0.42)}"/><path d="M17.5 18 H18.5 M17.5 27 H18.5 M17.5 36 H18.5 M17.5 45 H18.5" stroke="#efe4cc" stroke-width="1.5"/><path d="M43 12 H49 V18 M43 52 H49 V46" fill="none" stroke="${trim}" stroke-width="2.2"/><circle cx="35" cy="32" r="9.5" fill="none" stroke="${emblemCol}" stroke-width="1.2" opacity="0.72"/>${badgeGlyph(badge, 35, 32, emblemCol)}`;
    }
    case 'scroll_array': {
      const z = d.scroll?.zhen ? ZHEN_BY_ID[d.scroll.zhen] : null;
      const rawLine = safeRgbHex(z?.color) ?? accent;
      const lineCol = mixHex(rawLine, '#3a2212', 0.45);
      const flags = Math.max(3, Math.min(8, z?.flags ?? 4));
      const pts = Array.from({ length: flags }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / flags;
        return `<circle cx="${(32 + 10.5 * Math.cos(a)).toFixed(1)}" cy="${(32 + 10.5 * Math.sin(a)).toFixed(1)}" r="1.6" fill="${lineCol}" stroke="none"/>`;
      }).join('');
      return `<rect x="13" y="16" width="38" height="32" fill="${c}"/><rect x="10" y="13" width="5" height="38" rx="2" fill="${accent}"/><rect x="49" y="13" width="5" height="38" rx="2" fill="${accent}"/><circle cx="32" cy="32" r="10.5" fill="none" stroke="${lineCol}" stroke-width="1.7"/><path d="M32 23 L40 37 H24Z M24 27 H40 L32 41Z" fill="none" stroke="${lineCol}" stroke-width="1.3"/>${pts}`;
    }
    case 'scroll_skill': {
      const badge = scrollBadge(d);
      const knob = ['#7f7668', '#5b8a5b', '#4d82b0', '#8d5db8', '#d2a23c', '#c85040', '#e0b848'][tier];
      const inkCol = tier >= 3 ? '#3b2420' : '#43352b';
      const iconCol = mixHex(c, '#2d241c', 0.48);
      return `<path d="M17 15 Q14 15 14 19 V46 Q14 49 18 49 H46 V16Z" fill="${c}"/><path d="M17 15 H46 Q51 15 51 20 V46 Q51 50 47 50 Q43 50 43 46 V19 Q43 15 47 15 M14 46 Q14 41 19 41 H43" fill="none" stroke="${knob}" stroke-width="3"/><circle cx="29" cy="28" r="9.5" fill="#f8efe0" fill-opacity="0.72" stroke="${inkCol}" stroke-width="1"/>${badgeGlyph(badge, 29, 28, iconCol)}`;
    }
    case 'scroll_gold':
      return `<path d="M17 15 Q14 15 14 19 V46 Q14 49 18 49 H46 V16Z" fill="${c}"/><path d="M17 15 H46 Q51 15 51 20 V46 Q51 50 47 50 Q43 50 43 46 V19 Q43 15 47 15 M14 46 Q14 41 19 41 H43" fill="none" stroke="#d4a644" stroke-width="3"/><path d="M29 22 V35 M23 28 H35" fill="none" stroke="#a63628" stroke-width="1.8"/><circle cx="29" cy="28" r="5" fill="none" stroke="#a63628"/>`;
    case 'scroll':
      return `<path d="M17 15 Q14 15 14 19 V46 Q14 49 18 49 H46 V16Z" fill="${c}"/><path d="M17 15 H46 Q51 15 51 20 V46 Q51 50 47 50 Q43 50 43 46 V19 Q43 15 47 15 M14 46 Q14 41 19 41 H43" fill="none" stroke="${accent}" stroke-width="3"/><path d="M23 23 H38 M23 28 H37 M23 33 H34" fill="none" stroke="#876b52"/>`;

    // —— 杂物（阵盘 / 妖卵 / 灵宠 / 信物 / 赠礼）
    case 'pan': {
      const oct = id !== 'zf_pan1';
      const gems = id === 'zf_pan3' || id === 'zf_pan4';
      const base = oct
        ? `<polygon points="32,12 46,18 52,32 46,46 32,52 18,46 12,32 18,18" fill="${c}"/>`
        : `<circle cx="32" cy="32" r="19" fill="${c}"/>`;
      const inner = `<circle cx="32" cy="32" r="12" fill="none" stroke="${id === 'zf_pan4' ? '#c8a8ff' : '#4a3a28'}" stroke-width="1.3"/><path d="M32 20 V44 M20 32 H44" stroke="${id === 'zf_pan4' ? '#d8b468' : '#5e4b36'}" stroke-width="1.1"/>`;
      const gemNodes = gems
        ? `<circle cx="32" cy="17" r="2.2" fill="#68d0a8" stroke="none"/><circle cx="47" cy="32" r="2.2" fill="#e87058" stroke="none"/><circle cx="32" cy="47" r="2.2" fill="#689ee8" stroke="none"/><circle cx="17" cy="32" r="2.2" fill="#ecd068" stroke="none"/>`
        : `<path d="M32 26 L34 32 L32 38 L30 32Z" fill="#c83c32" stroke="none"/>`;
      return `${base}${inner}${gemNodes}<circle cx="32" cy="32" r="3" fill="${id === 'zf_pan4' ? '#c890ff' : '#e8d080'}"/>`;
    }
    case 'egg': {
      const pat = id === 'egg_jiao'
        ? `<path d="M23 28 Q28 24 33 28 Q38 24 41 28 M21 37 Q28 33 33 37 Q38 33 43 37" fill="none" stroke="#9ac0d8" stroke-width="1.5"/>`
        : id === 'egg_shijin'
          ? `<path d="M21 30 H43 M22 38 H42 M32 20 V48" fill="none" stroke="#f8e08a" stroke-width="1.4"/>`
          : `<path d="M23 27 Q32 22 41 27 M22 36 Q32 31 42 36" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.6"/>`;
      return `<path d="M32 13 Q45 20 45 36 Q45 50 32 51 Q19 50 19 36 Q19 20 32 13Z" fill="${c}"/>${pat}`;
    }
    case 'pet': {
      const fox = id === 'egg_huli';
      const cat = id === 'item_tihun';
      return `<path d="M18 37 L16 18 L26 24 Q32 21 38 24 L48 18 L46 37 Q44 49 32 51 Q20 49 18 37Z" fill="${c}"/><circle cx="26" cy="34" r="2.2" fill="${cat ? '#d888ff' : '#fff0b8'}" stroke="none"/><circle cx="38" cy="34" r="2.2" fill="${cat ? '#d888ff' : '#fff0b8'}" stroke="none"/><path d="M30 41 L32 43 L34 41" fill="none" stroke="#f6e6d0" stroke-width="1.4"/>${fox ? `<path d="M22 44 Q32 49 42 44" fill="none" stroke="#fff2e4" stroke-width="2"/>` : ''}`;
    }
    case 'letter':
      return `<rect x="16" y="19" width="32" height="26" rx="2" fill="${c}"/><path d="M16 21 L32 34 L48 21" fill="none" stroke="#6a543c" stroke-width="1.5"/><circle cx="32" cy="34" r="3.4" fill="${id === 'item_moletter' ? '#c63c32' : '#7a5c3c'}" stroke="none"/>`;
    case 'token':
      return `<path d="M23 13 H41 L46 21 V44 L40 52 H24 L18 44 V21Z" fill="${c}"/><circle cx="32" cy="18" r="2" fill="#2c241c" stroke="none"/><rect x="25" y="25" width="14" height="19" fill="none" stroke="${id === 'item_shengxian' ? '#e8fff4' : '#f2d692'}" stroke-width="1.5"/><path d="M29 31 H35 M32 28 V40" stroke="${id === 'item_shengxian' ? '#e8fff4' : '#f2d692'}" stroke-width="1.5"/>`;
    case 'fan':
      return `<circle cx="32" cy="28" r="16" fill="${c}"/><path d="M32 44 V54" stroke="#6a482c" stroke-width="3"/><path d="M24 24 H36 M25 29 H34 M27 34 H32" stroke="#5a4a3a" stroke-width="1.2"/>`;
    case 'hairpin':
      return `<path d="M17 48 L43 17" stroke="#5a4430" stroke-width="2.6"/><circle cx="44" cy="17" r="5" fill="${c}"/><path d="M44 22 V35" stroke="#d87082" stroke-width="1.6"/>`;
    case 'sachet':
      return `<path d="M26 20 H38 L44 37 Q44 49 32 50 Q20 49 20 37Z" fill="${c}"/><path d="M29 20 Q32 12 35 20 M32 50 V55" fill="none" stroke="#e4c268" stroke-width="1.8"/><circle cx="32" cy="36" r="4" fill="#fae2b4" stroke="none"/>`;

    // —— 法宝 SVG 回退
    case 'art_sword': return `<path d="M18 48 L42 18 L48 13 L45 22 L23 50Z" fill="${c}"/><path d="M18 41 L26 48" stroke="#c89e4c" stroke-width="2.4"/>`;
    case 'art_shield': return `<path d="M32 12 L48 18 V32 Q46 46 32 52 Q18 46 16 32 V18Z" fill="${c}"/><path d="M32 18 L42 22 V32 Q41 41 32 46 Q23 41 22 32 V22Z" fill="none" stroke="#f0dfb4" stroke-width="1.4"/>`;
    case 'art_ring': return `<circle cx="32" cy="32" r="16" fill="none" stroke="${c}" stroke-width="6"/><circle cx="32" cy="32" r="16" fill="none" stroke="#f7e8bd" stroke-width="1.2"/>`;
    case 'art_bell': return `<path d="M23 19 Q32 13 41 19 L45 43 H19Z" fill="${c}"/><circle cx="32" cy="46" r="3" fill="${accent}"/>`;
    case 'art_mirror': return `<circle cx="32" cy="28" r="14" fill="${c}"/><circle cx="32" cy="28" r="10" fill="#eef6ff" fill-opacity="0.65"/><path d="M32 42 V53" stroke="#6c5032" stroke-width="3"/>`;
    case 'art_banner': return `<path d="M21 53 V13" stroke="#5c422c" stroke-width="2.6"/><path d="M22 14 H44 L40 30 L45 41 H22Z" fill="${c}"/>`;
    case 'art_flame': return `<path d="M32 12 Q44 24 41 37 Q44 48 32 50 Q20 48 22 36 Q24 24 32 12Z" fill="${c}"/><path d="M32 24 Q37 33 32 44 Q27 33 32 24Z" fill="#ffe89c" stroke="none"/>`;
    case 'art_boot': return `<path d="M23 16 H36 V34 L47 39 V46 H22Z" fill="${c}"/>`;
    case 'art_ding': return `<path d="M21 21 H43 L46 39 Q32 47 18 39Z" fill="${c}"/><path d="M24 43 L22 51 M40 43 L42 51" stroke="#5a442e" stroke-width="2.4"/>`;

    // —— 通用矿石/灵珠/杂物
    case 'core_fire':
      return `<circle cx="32" cy="33" r="16" fill="${c}"/><path d="M32 11 Q42 22 38 32 Q44 26 44 35 Q43 46 32 48 Q21 46 21 34 Q24 25 28 29 Q27 19 32 11Z" fill="#ffae4c" opacity="0.72"/><circle cx="32" cy="34" r="7" fill="#ffe29c"/>`;
    case 'core_ice':
      return `<circle cx="32" cy="32" r="17" fill="${c}"/><path d="M32 18 V46 M20 25 L44 39 M44 25 L20 39" stroke="#eefcff" stroke-width="1.8"/><circle cx="32" cy="32" r="5" fill="#d9f7ff"/>`;
    case 'core_thunder':
      return `<circle cx="32" cy="32" r="17" fill="${c}"/><path d="M35 16 L25 32 H34 L28 48 L41 30 H32Z" fill="#e6f5ff" stroke="#5386c8" stroke-width="1.1"/>`;
    case 'ore':
      return `<path d="M14 42 L19 23 30 13 42 19 51 38 43 50 22 51Z" fill="${c}"/><path d="M19 23 L29 31 30 13 M29 31 L22 51 M29 31 L42 19 M29 31 L43 50 M29 31 L51 38" fill="none" stroke="${accent}"/><path d="M21 23L29 17" fill="none" stroke="#f8f1da"/>`;
    case 'bead':
      return `<circle cx="32" cy="32" r="18" fill="${c}"/><circle cx="32" cy="32" r="13" fill="none" stroke="${accent}"/><path d="M25 39 Q20 30 28 25 Q35 20 39 27 Q42 34 34 35 Q29 36 31 29" fill="none" stroke="#f7e8cf" stroke-width="2"/>`;
    case 'misc':
      return `<path d="M17 24 L32 15 47 24 45 46 32 52 19 46Z" fill="${c}"/><path d="M17 24 L32 32 47 24 M32 32 V51" fill="none" stroke="${accent}"/><circle cx="32" cy="27" r="3" fill="#eed9a9"/>`;
  }
}

export function proceduralItemIcon(d: ItemDef): string {
  const shape = itemIconShape(d), seed = hash(d.id);
  const motif = motifOf(d, shape);
  const color = itemColor(d, shape, seed);
  const tier = Number.isInteger(d.tier) ? Math.max(0, Math.min(6, d.tier)) : 0;
  const accent = ['#8e8472', '#648d6d', '#5d83a2', '#8e74a3', '#b28f4f', '#ac6052', '#c19d43'][tier];
  const v = seed % 5;
  const badge = motif === 'book_gongfa' || motif === 'scroll_skill' ? scrollBadge(d) : '';
  const spec = motif === 'scroll_array' ? (d.scroll?.zhen ?? '') : motif === 'yaodan' || motif === 'pill' || motif === 'pill_ring' || motif === 'pill_soul' || motif === 'pill_life' || motif === 'pan' || motif === 'egg' || motif === 'pet' || motif === 'flag' || motif === 'horn' || motif === 'bamboo' || motif === 'wood_dark' || motif === 'eye' || motif === 'bottle' || motif === 'ingot' || motif === 'feather' || motif === 'letter' || motif === 'token' ? d.id : '';
  const key = `${motif}|${color}|${accent}|${tier}|${v}|${badge}|${spec}`;
  const old = cache.get(key);
  if (old) return old;
  const ring = tier >= 3 ? `<circle cx="32" cy="32" r="29" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="1"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".34"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#g)"/>${ring}<g stroke="#514337" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${geometry(motif, color, accent, tier, v, d)}</g></svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, url);
  return url;
}
