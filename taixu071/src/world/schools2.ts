// v0.60「功法满天下」：十五座新宗门的斗法流派——门人、追杀者、战场上的敌将都按本门功法出手。
// 结构与 schools.ts 的 SCHOOLS 完全一致（[最低境界, 招式]，首招为招牌，结丹起出大招），由 schools.ts 并入。
import type { FoeSkill, SkKind, El } from './foeskills';
import type { StatusSpec } from '../data/arts';
import type { School } from './schools';

const S = (o: Partial<FoeSkill> & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 7, tele: 0.8, pow: 1.8, range: 520, ...o } as FoeSkill);
const ST: Record<string, StatusSpec> = {
  burn: { k: 'burn', dur: 3, ch: 0.5 }, slow: { k: 'slow', dur: 2.5, ch: 0.6 }, freeze: { k: 'freeze', dur: 1.2, ch: 0.5 }, shock: { k: 'shock', dur: 0.8, ch: 0.45 },
  poison: { k: 'poison', dur: 5, ch: 0.7 }, root: { k: 'root', dur: 1.5, ch: 0.85 }, stun: { k: 'stun', dur: 0.7, ch: 0.5 }, break: { k: 'break', dur: 4, ch: 0.5 }, knock: { k: 'knock', dur: 0.3, ch: 0.8 },
};

export const XSCHOOLS: Record<string, School> = {
  haoran: { name: '浩然阁', el: 'gold', kit: [
    [1, S({ id: 'hr_bi', name: '春秋笔', k: 'beam', len: 600, w: 50, tele: 0.6, dur: 0.3, pow: 2.2, range: 580, min: 90, cd: 6, status: ST.break }, 'gold')],
    [1, S({ id: 'hr_zi', name: '一字千钧', k: 'salvo', n: 1, waves: 3, spread: 0.1, tele: 0.3, pow: 1.0, range: 580, min: 110, cd: 6, status: ST.stun }, 'gold')],
    [2, S({ id: 'hr_ge', name: '正气歌', k: 'nova', r: 220, tele: 0.8, pow: 2.0, range: 210, cd: 9, status: ST.stun }, 'gold')],
    [2, S({ id: 'hr_qi', name: '浩然正气', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 18 }, 'gold')],
    [3, S({ id: 'hr_ult', name: '天地有正气', k: 'rain', n: 11, r: 100, tele: 1.2, pow: 2.3, range: 700, cd: 18, ult: true, status: ST.stun }, 'gold')],
  ] },
  taizhen: { name: '太真门', el: 'thunder', kit: [
    [1, S({ id: 'tz_lei', name: '五雷正法', k: 'circle', r: 110, tele: 0.8, pow: 2.0, range: 580, cd: 7, status: ST.shock }, 'thunder')],
    [1, S({ id: 'tz_jian', name: '两仪剑气', k: 'salvo', n: 2, waves: 3, spread: 0.2, tele: 0.35, pow: 0.9, range: 580, min: 110, cd: 6 }, 'sword')],
    [2, S({ id: 'tz_guard', name: '太清神光', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 17 }, 'gold')],
    [2, S({ id: 'tz_net', name: '雷网', k: 'circle', r: 140, tele: 0.85, pow: 1.4, range: 560, cd: 10, status: ST.root, pool: 2.5 }, 'thunder')],
    [3, S({ id: 'tz_ult', name: '太真五雷轰顶', k: 'rain', n: 12, r: 100, tele: 1.2, pow: 2.3, range: 700, cd: 18, ult: true, status: ST.shock }, 'thunder')],
  ] },
  tianxingzong: { name: '天星宗', el: 'earth', kit: [
    [1, S({ id: 'tx_star', name: '落星术', k: 'rain', n: 4, r: 85, tele: 0.95, pow: 1.7, range: 580, cd: 8, status: ST.stun }, 'gold')],
    [1, S({ id: 'tx_lock', name: '锁灵阵', k: 'circle', r: 150, tele: 0.8, pow: 1.1, range: 580, cd: 10, status: ST.root, pool: 3 }, 'earth')],
    [1, S({ id: 'tx_flag', name: '阵旗飞刺', k: 'salvo', n: 3, waves: 2, spread: 0.3, tele: 0.35, pow: 0.8, range: 560, min: 110, cd: 6 }, 'metal')],
    [2, S({ id: 'tx_wuxing', name: '颠倒五行阵', k: 'circle', r: 170, tele: 0.9, pow: 1.3, range: 560, cd: 12, status: ST.slow, pool: 4 }, 'earth')],
    [3, S({ id: 'tx_ult', name: '周天星斗大阵', k: 'nova', r: 420, tele: 1.5, pow: 3.0, range: 420, cd: 18, ult: true, status: ST.slow }, 'gold')],
  ] },
  tianfu: { name: '天符门', el: 'fire', kit: [
    [1, S({ id: 'tf_fire', name: '火符连珠', k: 'salvo', n: 1, waves: 5, spread: 0.12, tele: 0.3, pow: 0.85, range: 580, min: 120, cd: 6, status: ST.burn }, 'fire')],
    [1, S({ id: 'tf_ice', name: '冰爆符', k: 'circle', r: 115, tele: 0.8, pow: 1.8, range: 580, cd: 8, status: ST.freeze }, 'ice')],
    [1, S({ id: 'tf_lei', name: '天雷符', k: 'circle', r: 105, tele: 0.8, pow: 2.0, range: 580, cd: 8, status: ST.shock }, 'thunder')],
    [2, S({ id: 'tf_jia', name: '金甲符', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 17 }, 'gold')],
    [2, S({ id: 'tf_wan', name: '万符朝宗', k: 'ring', n: 16, waves: 2, tele: 0.55, pow: 0.8, range: 540, cd: 9, status: ST.burn }, 'fire')],
    [3, S({ id: 'tf_ult', name: '符海焚天', k: 'rain', n: 12, r: 95, tele: 1.2, pow: 2.2, range: 700, cd: 18, ult: true, status: ST.burn, pool: 2.5 }, 'fire')],
  ] },
  moyan: { name: '魔焰门', evil: true, el: 'fire', kit: [
    [1, S({ id: 'my2_fire', name: '青阳魔火', k: 'salvo', n: 3, waves: 2, spread: 0.35, tele: 0.35, pow: 0.9, range: 580, min: 110, cd: 6, status: ST.burn }, 'fire')],
    [1, S({ id: 'my2_orb', name: '幽火珠', k: 'circle', r: 110, tele: 0.8, pow: 1.8, range: 580, cd: 8, status: ST.burn, pool: 3 }, 'fire')],
    [2, S({ id: 'my2_hand', name: '炎魔手', k: 'cone', r: 300, spread: 0.6, tele: 0.75, pow: 2.2, range: 290, cd: 8, status: ST.burn, pool: 3 }, 'fire')],
    [2, S({ id: 'my2_blink', name: '魔影闪', k: 'blink', tele: 0.25, pow: 1.6, range: 620, min: 150, cd: 7 }, 'blood')],
    [3, S({ id: 'my2_ult', name: '魔焰焚天', k: 'nova', r: 420, tele: 1.5, pow: 3.2, range: 420, cd: 18, ult: true, status: ST.burn, pool: 3 }, 'fire')],
  ] },
  xuesha: { name: '血煞教', evil: true, el: 'blood', kit: [
    [1, S({ id: 'xs_dao', name: '血煞刀罡', k: 'salvo', n: 3, waves: 2, spread: 0.4, tele: 0.35, pow: 0.9, range: 580, min: 110, cd: 6, status: ST.break }, 'blood')],
    [1, S({ id: 'xs_boom', name: '血爆', k: 'circle', r: 120, tele: 0.8, pow: 2.0, range: 580, cd: 8, status: ST.break }, 'blood')],
    [1, S({ id: 'xs_rush', name: '燃血突进', k: 'charge', len: 480, w: 80, tele: 0.5, pow: 2.0, range: 460, min: 100, cd: 6 }, 'blood')],
    [2, S({ id: 'xs_beam', name: '血煞神光', k: 'beam', len: 660, w: 60, tele: 0.75, dur: 0.45, pow: 2.4, range: 640, min: 100, cd: 9, status: ST.break }, 'blood')],
    [3, S({ id: 'xs_ult', name: '血河大法', k: 'rain', n: 12, r: 105, tele: 1.2, pow: 2.3, range: 700, cd: 18, ult: true, status: ST.break, pool: 3 }, 'blood')],
  ] },
  wanfa: { name: '万法门', el: 'water', kit: [
    [1, S({ id: 'wf_tide', name: '碧海潮生', k: 'cone', r: 320, spread: 0.7, tele: 0.75, pow: 2.0, range: 310, cd: 7, status: ST.knock }, 'water')],
    [1, S({ id: 'wf_five', name: '五行连弹', k: 'salvo', n: 5, waves: 1, spread: 0.7, tele: 0.4, pow: 0.85, range: 580, min: 110, cd: 6, status: ST.burn }, 'fire')],
    [1, S({ id: 'wf_ice', name: '玄冰封', k: 'circle', r: 110, tele: 0.85, pow: 1.8, range: 580, cd: 9, status: ST.freeze }, 'ice')],
    [2, S({ id: 'wf_lei', name: '引雷术', k: 'circle', r: 105, tele: 0.8, pow: 2.0, range: 580, cd: 8, status: ST.shock }, 'thunder')],
    [2, S({ id: 'wf_guard', name: '五行轮转', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 17 }, 'gold')],
    [3, S({ id: 'wf_ult', name: '万法归一', k: 'beam', len: 820, w: 130, tele: 1.15, dur: 0.6, pow: 3.2, range: 780, min: 120, cd: 16, ult: true, status: ST.stun }, 'gold')],
  ] },
  liulian: { name: '六合殿', el: 'metal', kit: [
    [1, S({ id: 'll_nu', name: '六连弩', k: 'salvo', n: 6, waves: 1, spread: 0.5, tele: 0.4, pow: 0.75, range: 620, min: 120, cd: 6, status: ST.break }, 'metal')],
    [1, S({ id: 'll_suo', name: '缚妖索', k: 'circle', r: 110, tele: 0.75, pow: 1.1, range: 580, cd: 9, status: ST.root }, 'earth')],
    [1, S({ id: 'll_beast', name: '驱使海蛟', k: 'summon', n: 1, minion: 'seaserpent', tele: 0.8, range: 900, cd: 30, once: true }, 'water')],
    [2, S({ id: 'll_kui', name: '猎妖傀儡', k: 'summon', n: 2, minion: 'shikui', tele: 0.9, range: 900, cd: 40, once: true, hpBelow: 0.75 }, 'earth')],
    [3, S({ id: 'll_ult', name: '猎妖箭雨', k: 'rain', n: 12, r: 90, tele: 1.15, pow: 2.2, range: 700, cd: 17, ult: true, status: ST.break }, 'metal')],
  ] },
  leiyin: { name: '雷音宗', el: 'gold', kit: [
    [1, S({ id: 'ly_quan', name: '罗汉神拳', k: 'cone', r: 180, spread: 0.7, tele: 0.4, pow: 1.6, range: 170, cd: 4, waves: 2, status: ST.knock }, 'phys')],
    [1, S({ id: 'ly_rush', name: '金刚伏魔', k: 'charge', len: 460, w: 80, tele: 0.55, pow: 2.0, range: 440, min: 100, cd: 6, status: ST.stun }, 'gold')],
    [2, S({ id: 'ly_hou', name: '雷音狮子吼', k: 'roar', r: 240, tele: 0.7, pow: 1.2, range: 240, cd: 12, status: ST.stun }, 'gold')],
    [2, S({ id: 'ly_guard', name: '金刚不坏', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 16 }, 'gold')],
    [3, S({ id: 'ly_ult', name: '雷音普照', k: 'nova', r: 420, tele: 1.5, pow: 3.1, range: 420, cd: 18, ult: true, status: ST.stun }, 'thunder')],
  ] },
  tianshi: { name: '天师府', el: 'thunder', kit: [
    [1, S({ id: 'ts_fu', name: '天师雷符', k: 'circle', r: 105, tele: 0.8, pow: 2.0, range: 580, cd: 7, status: ST.shock }, 'thunder')],
    [1, S({ id: 'ts_jian', name: '桃木飞剑', k: 'salvo', n: 3, waves: 2, spread: 0.3, tele: 0.35, pow: 0.9, range: 580, min: 120, cd: 6 }, 'sword')],
    [1, S({ id: 'ts_zhen', name: '镇妖符', k: 'circle', r: 120, tele: 0.8, pow: 1.8, range: 580, cd: 9, status: ST.stun }, 'gold')],
    [2, S({ id: 'ts_beam', name: '掌教雷印', k: 'beam', len: 660, w: 60, tele: 0.75, dur: 0.45, pow: 2.4, range: 640, min: 100, cd: 9, status: ST.shock }, 'thunder')],
    [3, S({ id: 'ts_ult', name: '敕令·万雷', k: 'rain', n: 12, r: 100, tele: 1.2, pow: 2.3, range: 700, cd: 18, ult: true, status: ST.shock }, 'thunder')],
  ] },
  motuo: { name: '魔陀山', evil: true, el: 'ghost', kit: [
    [1, S({ id: 'mt_palm', name: '魔陀大手印', k: 'circle', r: 140, tele: 0.85, pow: 2.1, range: 580, cd: 7, status: ST.knock }, 'ghost')],
    [1, S({ id: 'mt_song', name: '天魔音', k: 'ring', n: 14, waves: 2, tele: 0.6, pow: 0.75, range: 520, cd: 8, status: ST.stun }, 'ghost')],
    [2, S({ id: 'mt_guard', name: '魔煞战甲', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 16 }, 'blood')],
    [2, S({ id: 'mt_blink', name: '魔影闪', k: 'blink', tele: 0.25, pow: 1.6, range: 620, min: 150, cd: 7 }, 'ghost')],
    [3, S({ id: 'mt_ult', name: '魔陀灭世', k: 'nova', r: 420, tele: 1.5, pow: 3.2, range: 420, cd: 18, ult: true, status: ST.break }, 'blood')],
  ] },
  dusheng: { name: '毒圣门', evil: true, el: 'poison', kit: [
    [1, S({ id: 'ds_zhen', name: '腐骨毒针', k: 'salvo', n: 7, waves: 1, spread: 0.9, tele: 0.45, pow: 0.6, range: 560, min: 100, cd: 6, status: ST.poison }, 'poison')],
    [1, S({ id: 'ds_zhang', name: '万毒掌', k: 'cone', r: 280, spread: 0.65, tele: 0.7, pow: 2.0, range: 270, cd: 7, status: ST.poison, pool: 3 }, 'poison')],
    [1, S({ id: 'ds_mist', name: '碧鳞毒瘴', k: 'circle', r: 140, tele: 0.85, pow: 1.3, range: 560, cd: 9, status: ST.poison, pool: 4 }, 'poison')],
    [2, S({ id: 'ds_bug', name: '驱使五毒', k: 'summon', n: 2, minion: 'centipede', tele: 0.8, range: 900, cd: 34, once: true, hpBelow: 0.8 }, 'poison')],
    [3, S({ id: 'ds_ult', name: '万毒蚀天', k: 'rain', n: 12, r: 105, tele: 1.2, pow: 2.2, range: 700, cd: 17, ult: true, status: ST.poison, pool: 4 }, 'poison')],
  ] },
  xiaoji: { name: '寒极宫', el: 'ice', kit: [
    [1, S({ id: 'xj_jian', name: '寒玉剑诀', k: 'salvo', n: 5, waves: 1, spread: 0.6, tele: 0.4, pow: 0.85, range: 600, min: 110, cd: 6, status: ST.slow }, 'ice')],
    [1, S({ id: 'xj_yan', name: '极寒冰焰', k: 'beam', len: 640, w: 54, tele: 0.75, dur: 0.45, pow: 2.3, range: 620, min: 100, cd: 9, status: ST.freeze }, 'ice')],
    [1, S({ id: 'xj_seal', name: '玄冰封印', k: 'circle', r: 120, tele: 0.85, pow: 1.9, range: 580, cd: 9, status: ST.freeze }, 'ice')],
    [2, S({ id: 'xj_guard', name: '寒冰盾', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 16 }, 'ice')],
    [3, S({ id: 'xj_ult', name: '冰封千里', k: 'nova', r: 430, tele: 1.5, pow: 3.1, range: 430, cd: 18, ult: true, status: ST.freeze }, 'ice')],
  ] },
  wanyao: { name: '万妖谷', el: 'phys', kit: [
    [1, S({ id: 'wy_leap', name: '妖化扑杀', k: 'leap', r: 110, tele: 0.75, pow: 2.0, range: 440, min: 110, cd: 6 }, 'phys')],
    [1, S({ id: 'wy_claw', name: '兽王爪', k: 'cone', r: 180, spread: 0.8, tele: 0.45, pow: 1.7, range: 170, cd: 5, status: ST.break }, 'phys')],
    [1, S({ id: 'wy_beast', name: '驱兽', k: 'summon', n: 2, minion: 'wolf', tele: 0.8, range: 900, cd: 28, once: true }, 'phys')],
    [2, S({ id: 'wy_roar', name: '妖啸', k: 'roar', r: 230, tele: 0.7, pow: 1.0, range: 230, cd: 13, status: ST.stun }, 'wind')],
    [2, S({ id: 'wy_rush', name: '万兽奔腾', k: 'charge', len: 640, w: 110, tele: 0.7, pow: 2.3, range: 600, min: 120, cd: 8, status: ST.knock }, 'earth')],
    [3, S({ id: 'wy_ult', name: '万妖朝圣', k: 'rain', n: 11, r: 105, tele: 1.2, pow: 2.2, range: 700, cd: 18, ult: true, status: ST.knock }, 'earth')],
  ] },
  jiuxian: { name: '九霄宫', el: 'sword', kit: [
    [1, S({ id: 'jx2_wu', name: '九仙剑舞', k: 'ring', n: 12, waves: 2, tele: 0.55, pow: 0.8, range: 500, cd: 8 }, 'sword')],
    [1, S({ id: 'jx2_xiu', name: '流云飞袖', k: 'cone', r: 260, spread: 0.75, tele: 0.6, pow: 1.7, range: 250, cd: 6, status: ST.knock }, 'wind')],
    [1, S({ id: 'jx2_blink', name: '幻月身法', k: 'blink', tele: 0.2, pow: 1.4, range: 600, min: 150, cd: 7 }, 'ice')],
    [2, S({ id: 'jx2_rain', name: '玉女剑雨', k: 'rain', n: 6, r: 80, tele: 1.0, pow: 1.6, range: 560, cd: 10 }, 'sword')],
    [3, S({ id: 'jx2_ult', name: '九天玄女剑', k: 'beam', len: 800, w: 120, tele: 1.15, dur: 0.6, pow: 3.1, range: 760, min: 120, cd: 16, ult: true, status: ST.break }, 'sword')],
  ] },
  // 灵界 · 天渊圣域 / 蛮荒古境 / 无尽雷海
  taichu_sg: { name: '太初圣宫', el: 'sword', kit: [
    [1, S({ id: 'tc_jian', name: '太初剑芒', k: 'beam', len: 680, w: 58, tele: 0.55, dur: 0.35, pow: 2.3, range: 660, min: 100, cd: 6, status: ST.break }, 'sword')],
    [1, S({ id: 'tc_salvo', name: '御虚剑气', k: 'salvo', n: 5, waves: 2, spread: 0.45, tele: 0.35, pow: 0.9, range: 620, min: 110, cd: 6 }, 'sword')],
    [2, S({ id: 'tc_guard', name: '太初剑罡', k: 'guard', dur: 5, tele: 0.3, range: 720, cd: 16 }, 'gold')],
    [3, S({ id: 'tc_ult', name: '万古青冥剑阵', k: 'rain', n: 14, r: 105, tele: 1.25, pow: 2.5, range: 760, cd: 18, ult: true, status: ST.break }, 'sword')],
  ] },
  yaohuang_dian: { name: '妖皇殿', el: 'fire', kit: [
    [1, S({ id: 'yh_yan', name: '真灵妖焰', k: 'salvo', n: 4, waves: 2, spread: 0.4, tele: 0.35, pow: 0.95, range: 600, min: 110, cd: 6, status: ST.burn }, 'fire')],
    [1, S({ id: 'yh_claw', name: '圣兽撕天爪', k: 'cone', r: 280, spread: 0.75, tele: 0.55, pow: 2.1, range: 260, cd: 6, status: ST.break }, 'fire')],
    [2, S({ id: 'yh_roar', name: '万妖皇吼', k: 'roar', r: 260, tele: 0.7, pow: 1.4, range: 260, cd: 12, status: ST.stun }, 'wind')],
    [3, S({ id: 'yh_ult', name: '妖皇真火焚穹', k: 'nova', r: 440, tele: 1.45, pow: 3.3, range: 440, cd: 18, ult: true, status: ST.burn, pool: 3 }, 'fire')],
  ] },
  qingming_gz: { name: '青冥鬼宗', evil: true, el: 'ghost', kit: [
    [1, S({ id: 'qm_huo', name: '青冥鬼火', k: 'salvo', n: 4, waves: 2, spread: 0.45, tele: 0.35, pow: 0.85, range: 600, min: 110, cd: 6, status: ST.burn }, 'ghost')],
    [1, S({ id: 'qm_soul', name: '幽冥摄魂', k: 'circle', r: 125, tele: 0.8, pow: 1.9, range: 580, cd: 8, status: ST.stun }, 'ghost')],
    [2, S({ id: 'qm_blink', name: '鬼影挪移', k: 'blink', tele: 0.25, pow: 1.7, range: 640, min: 150, cd: 7 }, 'ghost')],
    [3, S({ id: 'qm_ult', name: '百鬼冥狱', k: 'rain', n: 13, r: 100, tele: 1.2, pow: 2.4, range: 740, cd: 18, ult: true, status: ST.stun }, 'ghost')],
  ] },
  leiyin_gs: { name: '雷音古刹', el: 'gold', kit: [
    [1, S({ id: 'lg_zhang', name: '大日如来掌', k: 'circle', r: 140, tele: 0.8, pow: 2.1, range: 600, cd: 7, status: ST.stun }, 'gold')],
    [1, S({ id: 'lg_fan', name: '梵音镇魔', k: 'ring', n: 14, waves: 2, tele: 0.55, pow: 0.85, range: 520, cd: 8, status: ST.stun }, 'gold')],
    [2, S({ id: 'lg_body', name: '丈六金身', k: 'guard', dur: 5.5, tele: 0.3, range: 720, cd: 16 }, 'gold')],
    [3, S({ id: 'lg_ult', name: '降魔雷音普度', k: 'nova', r: 440, tele: 1.45, pow: 3.2, range: 440, cd: 18, ult: true, status: ST.stun }, 'thunder')],
  ] },
  tiangong_lg: { name: '天工灵阁', el: 'metal', kit: [
    [1, S({ id: 'tg_nu', name: '破界神弩', k: 'salvo', n: 6, waves: 2, spread: 0.45, tele: 0.35, pow: 0.8, range: 640, min: 120, cd: 6, status: ST.break }, 'metal')],
    [1, S({ id: 'tg_lei', name: '聚灵雷珠', k: 'circle', r: 120, tele: 0.8, pow: 2.0, range: 600, cd: 8, status: ST.shock }, 'thunder')],
    [2, S({ id: 'tg_kui', name: '战傀护阵', k: 'summon', n: 2, minion: 'shikui', tele: 0.85, range: 900, cd: 36, once: true, hpBelow: 0.8 }, 'metal')],
    [3, S({ id: 'tg_ult', name: '天工万刃机关雨', k: 'rain', n: 14, r: 95, tele: 1.2, pow: 2.4, range: 740, cd: 17, ult: true, status: ST.break }, 'metal')],
  ] },
  jiaochi_zu: { name: '角蚩王庭', evil: true, el: 'earth', kit: [
    [1, S({ id: 'jc_smash', name: '蛮荒撼地', k: 'leap', r: 160, tele: 0.85, pow: 2.4, range: 480, min: 100, cd: 6, status: ST.knock }, 'earth')],
    [1, S({ id: 'jc_sweep', name: '角蚩战斧', k: 'cone', r: 270, spread: 0.85, tele: 0.5, pow: 2.0, range: 260, cd: 5, status: ST.break }, 'blood')],
    [2, S({ id: 'jc_guard', name: '蛮神战体', k: 'guard', dur: 5, tele: 0.3, range: 720, cd: 16 }, 'earth')],
    [3, S({ id: 'jc_ult', name: '荒古崩山击', k: 'nova', r: 420, tele: 1.4, pow: 3.3, range: 420, cd: 18, ult: true, status: ST.stun }, 'earth')],
  ] },
  yeying_zu: { name: '夜影暗殿', evil: true, el: 'blood', kit: [
    [1, S({ id: 'yy3_blade', name: '暗影刺杀', k: 'blink', tele: 0.22, pow: 1.8, range: 640, min: 150, cd: 6 }, 'blood')],
    [1, S({ id: 'yy3_dart', name: '影毒飞星', k: 'salvo', n: 7, waves: 1, spread: 0.75, tele: 0.35, pow: 0.75, range: 580, min: 110, cd: 5, status: ST.poison }, 'poison')],
    [2, S({ id: 'yy3_mist', name: '蚀影毒阵', k: 'circle', r: 150, tele: 0.8, pow: 1.4, range: 580, cd: 10, status: ST.poison, pool: 3.5 }, 'poison')],
    [3, S({ id: 'yy3_ult', name: '无夜血幕', k: 'rain', n: 12, r: 95, tele: 1.15, pow: 2.3, range: 720, cd: 17, ult: true, status: ST.break }, 'blood')],
  ] },
  lingmu_zu: { name: '灵木圣林', el: 'poison', kit: [
    [1, S({ id: 'lm_vine', name: '万年古藤', k: 'circle', r: 135, tele: 0.8, pow: 1.4, range: 600, cd: 8, status: ST.root, pool: 3 }, 'poison')],
    [1, S({ id: 'lm_leaf', name: '青木飞叶', k: 'salvo', n: 5, waves: 2, spread: 0.45, tele: 0.35, pow: 0.85, range: 600, min: 110, cd: 6, status: ST.poison }, 'poison')],
    [2, S({ id: 'lm_heal', name: '圣木长生诀', k: 'heal', tele: 0.45, range: 2000, cd: 34, hpBelow: 0.6 }, 'poison')],
    [3, S({ id: 'lm_ult', name: '万林缠界大阵', k: 'rain', n: 13, r: 105, tele: 1.2, pow: 2.3, range: 720, cd: 18, ult: true, status: ST.root, pool: 3 }, 'poison')],
  ] },
  guanghan_sy: { name: '广寒仙殿', el: 'ice', kit: [
    [1, S({ id: 'gh_bing', name: '太阴冰魄刃', k: 'salvo', n: 4, waves: 2, spread: 0.4, tele: 0.35, pow: 0.9, range: 620, min: 110, cd: 6, status: ST.slow }, 'ice')],
    [1, S({ id: 'gh_beam', name: '极寒太阴光', k: 'beam', len: 680, w: 60, tele: 0.7, dur: 0.45, pow: 2.4, range: 660, min: 100, cd: 8, status: ST.freeze }, 'ice')],
    [2, S({ id: 'gh_guard', name: '玄冰护壁', k: 'guard', dur: 5, tele: 0.3, range: 720, cd: 16 }, 'ice')],
    [3, S({ id: 'gh_ult', name: '广寒万里冰封', k: 'nova', r: 440, tele: 1.45, pow: 3.2, range: 440, cd: 18, ult: true, status: ST.freeze }, 'ice')],
  ] },
  leihai_dian: { name: '紫霄雷殿', el: 'thunder', kit: [
    [1, S({ id: 'lh_lei', name: '紫霄引雷', k: 'circle', r: 120, tele: 0.75, pow: 2.1, range: 620, cd: 7, status: ST.shock }, 'thunder')],
    [1, S({ id: 'lh_arc', name: '雷海电弧', k: 'ring', n: 14, waves: 2, tele: 0.55, pow: 0.85, range: 540, cd: 8, status: ST.shock }, 'thunder')],
    [2, S({ id: 'lh_beam', name: '神霄天雷柱', k: 'beam', len: 700, w: 66, tele: 0.75, dur: 0.45, pow: 2.5, range: 680, min: 100, cd: 9, status: ST.shock }, 'thunder')],
    [3, S({ id: 'lh_ult', name: '九霄灭世雷狱', k: 'rain', n: 14, r: 105, tele: 1.2, pow: 2.5, range: 760, cd: 17, ult: true, status: ST.shock }, 'thunder')],
  ] },
  // 仙界 · 北寒 / 金源 / 灰界
  guanghan_xg: { name: '广寒仙阁', el: 'ice', kit: [
    [1, S({ id: 'ghx_jian', name: '清寒仙剑', k: 'salvo', n: 5, waves: 2, spread: 0.4, tele: 0.35, pow: 0.95, range: 640, min: 110, cd: 6, status: ST.slow }, 'ice')],
    [1, S({ id: 'ghx_seal', name: '仙霜禁封', k: 'circle', r: 130, tele: 0.8, pow: 2.1, range: 620, cd: 8, status: ST.freeze }, 'ice')],
    [2, S({ id: 'ghx_blink', name: '踏雪飞仙步', k: 'blink', tele: 0.2, pow: 1.6, range: 660, min: 150, cd: 7 }, 'ice')],
    [3, S({ id: 'ghx_ult', name: '仙域永冻天劫', k: 'nova', r: 460, tele: 1.4, pow: 3.4, range: 460, cd: 18, ult: true, status: ST.freeze }, 'ice')],
  ] },
  beihan_sanxiu: { name: '北寒仙盟', el: 'water', kit: [
    [1, S({ id: 'bh_tide', name: '玄溟仙潮', k: 'cone', r: 320, spread: 0.75, tele: 0.65, pow: 2.1, range: 310, cd: 6, status: ST.knock }, 'water')],
    [1, S({ id: 'bh_arrow', name: '寒晶仙箭', k: 'salvo', n: 4, waves: 2, spread: 0.38, tele: 0.35, pow: 0.9, range: 620, min: 110, cd: 6, status: ST.slow }, 'ice')],
    [2, S({ id: 'bh_guard', name: '玄晶仙盾', k: 'guard', dur: 5, tele: 0.3, range: 720, cd: 16 }, 'water')],
    [3, S({ id: 'bh_ult', name: '冰海倒悬', k: 'rain', n: 13, r: 105, tele: 1.2, pow: 2.4, range: 740, cd: 17, ult: true, status: ST.slow }, 'water')],
  ] },
  yuhuang_xg: { name: '玉皇仙宫', el: 'gold', kit: [
    [1, S({ id: 'yhx_chi', name: '玉皇金敕', k: 'beam', len: 740, w: 72, tele: 0.65, dur: 0.45, pow: 2.5, range: 700, min: 100, cd: 7, status: ST.stun }, 'gold')],
    [1, S({ id: 'yhx_ring', name: '皇道仙环', k: 'ring', n: 16, waves: 2, tele: 0.5, pow: 0.9, range: 560, cd: 8, status: ST.stun }, 'gold')],
    [2, S({ id: 'yhx_guard', name: '凌霄天幕', k: 'guard', dur: 6, tele: 0.3, range: 750, cd: 16 }, 'gold')],
    [3, S({ id: 'yhx_ult', name: '玉皇镇世金光', k: 'nova', r: 480, tele: 1.45, pow: 3.5, range: 480, cd: 18, ult: true, status: ST.stun }, 'gold')],
  ] },
  taiyi_jt: { name: '太乙剑庭', el: 'sword', kit: [
    [1, S({ id: 'tyj_jian', name: '太乙破法剑', k: 'beam', len: 760, w: 60, tele: 0.55, dur: 0.35, pow: 2.6, range: 720, min: 100, cd: 6, status: ST.break }, 'sword')],
    [1, S({ id: 'tyj_salvo', name: '混元剑雨', k: 'salvo', n: 6, waves: 2, spread: 0.45, tele: 0.35, pow: 0.95, range: 660, min: 120, cd: 6, status: ST.break }, 'sword')],
    [2, S({ id: 'tyj_blink', name: '化虹剑遁', k: 'blink', tele: 0.2, pow: 1.9, range: 680, min: 150, cd: 7 }, 'sword')],
    [3, S({ id: 'tyj_ult', name: '太乙斩仙剑阵', k: 'rain', n: 16, r: 105, tele: 1.2, pow: 2.6, range: 780, cd: 17, ult: true, status: ST.break }, 'sword')],
  ] },
  lunhui_gd: { name: '轮回古殿', el: 'ghost', kit: [
    [1, S({ id: 'lh2_pan', name: '六道轮盘', k: 'ring', n: 16, waves: 2, tele: 0.55, pow: 0.9, range: 560, cd: 8, status: ST.slow }, 'ghost')],
    [1, S({ id: 'lh2_time', name: '岁月定魂', k: 'circle', r: 145, tele: 0.8, pow: 2.0, range: 640, cd: 9, status: ST.stun }, 'ghost')],
    [2, S({ id: 'lh2_heal', name: '轮回逆生', k: 'heal', tele: 0.45, range: 2000, cd: 36, hpBelow: 0.55 }, 'ghost')],
    [3, S({ id: 'lh2_ult', name: '六道往生劫', k: 'nova', r: 450, tele: 1.45, pow: 3.3, range: 450, cd: 18, ult: true, status: ST.stun }, 'ghost')],
  ] },
  huijie_sl: { name: '蚀道神宗', evil: true, el: 'blood', kit: [
    [1, S({ id: 'hj_tide', name: '灰煞潮汐', k: 'cone', r: 340, spread: 0.8, tele: 0.65, pow: 2.2, range: 320, cd: 6, status: ST.break, pool: 3 }, 'blood')],
    [1, S({ id: 'hj_beam', name: '蚀仙魔光', k: 'beam', len: 740, w: 68, tele: 0.7, dur: 0.45, pow: 2.6, range: 700, min: 100, cd: 8, status: ST.break }, 'blood')],
    [2, S({ id: 'hj_blink', name: '虚空裂隙遁', k: 'blink', tele: 0.22, pow: 1.9, range: 680, min: 150, cd: 7 }, 'blood')],
    [3, S({ id: 'hj_ult', name: '灰界湮灭潮', k: 'rain', n: 15, r: 110, tele: 1.25, pow: 2.6, range: 780, cd: 17, ult: true, status: ST.break, pool: 3 }, 'blood')],
  ] },
};
