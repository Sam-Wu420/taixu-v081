// 参数白话词表（拷自万宝阁 wanbao/glossary.js，另补了试场「万物属性」要用的数据字段词）。
// 任何模组的参数 / 数据字段，名字对得上常见写法，就翻成中文、补一句小白也看得懂的说明。只改显示，不改键名和取值。

// ---- 英文 → 中文（先整词组，再单词）
const PHRASES = {
  'show fps': '显示帧率', 'fps counter': '帧率显示', 'frame rate': '帧率', 'debug mode': '调试模式', 'dev mode': '开发者模式',
  'auto save': '自动存档', 'autosave': '自动存档', 'master volume': '总音量', 'music volume': '音乐音量', 'sfx volume': '音效音量',
  'sound volume': '音效音量', 'voice volume': '语音音量', 'spawn rate': '刷出几率', 'spawn chance': '刷出几率', 'drop rate': '掉落几率',
  'drop chance': '掉落几率', 'exp rate': '修为倍率', 'xp rate': '修为倍率', 'exp mult': '修为倍率', 'game speed': '游戏速度',
  'move speed': '移动速度', 'walk speed': '走路速度', 'run speed': '跑步速度', 'attack speed': '出手速度', 'hot key': '快捷键',
  'hotkey': '快捷键', 'key bind': '按键', 'keybind': '按键', 'hit box': '判定框', 'hitbox': '判定框', 'hit boxes': '判定框',
  'damage numbers': '伤害数字', 'health bar': '血条', 'hp bar': '血条', 'mini map': '小地图', 'minimap': '小地图',
  'night mode': '夜间模式', 'dark mode': '深色模式', 'screen shake': '震屏', 'camera shake': '震屏', 'slow motion': '慢动作',
  'max enemies': '敌人上限', 'max count': '数量上限', 'view distance': '视野距离', 'render distance': '绘制距离',
  'ai level': 'AI 强度', 'god mode': '无敌', 'one hit': '一击必杀', 'no cooldown': '无冷却', 'infinite mana': '法力无限',
  'friendly fire': '误伤友军', 'skip intro': '跳过开场', 'skip dialog': '跳过对话', 'skip dialogue': '跳过对话',
};
const WORDS = {
  enable: '启用', enabled: '启用', disable: '停用', disabled: '停用', use: '使用', allow: '允许', toggle: '开关', on: '开', off: '关',
  show: '显示', display: '显示', hide: '隐藏', draw: '绘制', render: '绘制', visible: '可见',
  volume: '音量', vol: '音量', music: '音乐', bgm: '背景音乐', sound: '音效', sounds: '音效', sfx: '音效', audio: '声音', voice: '语音', mute: '静音',
  debug: '调试', log: '日志', logs: '日志', logging: '日志', verbose: '详细', trace: '追踪', dev: '开发者', test: '测试',
  speed: '速度', fast: '快速', slow: '慢速', scale: '缩放', size: '大小', zoom: '缩放', width: '宽度', height: '高度',
  opacity: '不透明度', alpha: '不透明度', transparency: '透明度', color: '颜色', colour: '颜色', brightness: '亮度', contrast: '对比度',
  difficulty: '难度', damage: '伤害', dmg: '伤害', health: '气血', hp: '气血', life: '寿元', mana: '法力', mp: '法力',
  exp: '修为', xp: '修为', experience: '修为', drop: '掉落', drops: '掉落', loot: '掉落', reward: '奖励', rewards: '奖励',
  rate: '比率', ratio: '比例', chance: '几率', prob: '几率', probability: '几率', percent: '百分比', pct: '百分比',
  spawn: '刷出', spawns: '刷出', enemy: '敌人', enemies: '敌人', monster: '妖兽', monsters: '妖兽', mob: '怪', mobs: '怪', boss: '头领',
  npc: 'NPC', npcs: 'NPC', player: '主角', hero: '主角', ally: '盟友', allies: '盟友', pet: '灵宠', pets: '灵宠',
  max: '最大', maximum: '最大', min: '最小', minimum: '最小', count: '数量', num: '数量', number: '数量', amount: '数量', limit: '上限', cap: '上限',
  interval: '间隔', delay: '延迟', cooldown: '冷却', cd: '冷却', duration: '持续时间', time: '时间', timer: '计时', timeout: '超时',
  range: '范围', radius: '半径', distance: '距离', dist: '距离', area: '范围',
  auto: '自动', manual: '手动', key: '按键', keys: '按键', language: '语言', lang: '语言', mode: '模式', style: '样式', theme: '主题',
  quality: '画质', fps: '帧率', shadow: '阴影', shadows: '阴影', particle: '粒子', particles: '粒子', effect: '特效', effects: '特效', fx: '特效',
  ui: '界面', hud: '界面信息', font: '字体', text: '文字', label: '标签', labels: '标签', name: '名字', names: '名字', icon: '图标', icons: '图标',
  notification: '提示', notifications: '提示', notify: '提示', toast: '提示', popup: '弹窗', tip: '提示', tips: '提示', hint: '提示', hints: '提示',
  camera: '镜头', shake: '震屏', flash: '闪光', blur: '模糊', glow: '发光', outline: '描边',
  multiplier: '倍率', mult: '倍率', factor: '倍率', bonus: '加成', boost: '加成', threshold: '阈值', level: '等级', lv: '等级', tier: '品阶',
  friendly: '友方', hostile: '敌对', item: '物品', items: '物品', price: '价格', cost: '花费', gold: '灵石', money: '灵石', coin: '灵石', coins: '灵石',
  day: '天', days: '天', night: '夜晚', weather: '天气', wild: '野外', town: '城镇', city: '城池', map: '地图', world: '世界',
  skip: '跳过', confirm: '确认', warning: '警告', warnings: '警告', experimental: '实验性', performance: '性能', perf: '性能', cache: '缓存',
  save: '存档', load: '读取', reset: '重置', default: '默认', custom: '自定义', random: '随机', seed: '种子', extra: '额外', all: '全部',
  attack: '攻击', atk: '攻击', defense: '防御', def: '防御', crit: '暴击', critical: '暴击', heal: '治疗', regen: '回复', armor: '护甲',
  stamina: '耐力', ai: 'AI', aggro: '仇恨', aggressive: '好斗', combo: '连招', skill: '招式', skills: '招式', spell: '法术', spells: '法术',
  dialog: '对话', dialogue: '对话', talk: '交谈', quest: '任务', quests: '任务', story: '剧情', intro: '开场', tutorial: '教程',
  tick: '刷新', ticks: '刷新', speedup: '加速', step: '步长', steps: '步数', frame: '帧', frames: '帧', fov: '视野', view: '视野', vision: '视野',
  global: '全局', local: '本地', online: '联网', update: '更新', updates: '更新', check: '检查', backup: '备份', sync: '同步',
  multi: '多重', double: '双倍', triple: '三倍', infinite: '无限', unlimited: '无限', instant: '立即', always: '总是', never: '从不',
};
// 选项值
const OPTS = {
  on: '开', off: '关', yes: '是', no: '否', true: '是', false: '否', auto: '自动', none: '无', all: '全部', default: '默认', custom: '自定义',
  low: '低', lowest: '最低', medium: '中', mid: '中', normal: '普通', high: '高', highest: '最高', ultra: '极高', max: '最高', min: '最低',
  easy: '简单', hard: '困难', expert: '专家', insane: '地狱', fast: '快', slow: '慢', small: '小', large: '大', big: '大', tiny: '很小', huge: '很大',
  left: '左', right: '右', top: '上', bottom: '下', center: '中间', centre: '中间', always: '总是', never: '从不', sometimes: '偶尔',
  en: '英文', zh: '中文', 'zh-cn': '简体中文', 'zh-tw': '繁體中文', ja: '日文', ko: '韩文', light: '浅色', dark: '深色',
};

// ---- 小白说明：按概念配一句话（模组自己写了说明的，排在模组的说明后面）
const EXPLAIN = [
  [/倍率|倍数|multiplier|\bmult\b|factor/i, '1 = 原样；2 = 翻倍；0.5 = 减半'],
  [/千分之|‰|per ?mille/i, '千分之 N：每 1000 次里大约发生 N 次（填 10 就是 1%）'],
  [/万分之/, '万分之 N：每 10000 次里大约发生 N 次'],
  [/阈值|threshold/i, '数值到了这条线才会触发'],
  [/冷却|cooldown|\bcd\b/i, '用过一次之后，要等多久才能再用'],
  [/调试|debug|日志|\blogs?\b|logging|verbose|trace/i, '给作者排查问题用的，平时不用开；开了可能会多出一些文字或变卡'],
  [/帧率|\bfps\b/i, '每秒画面刷新几次：越高越流畅，也越吃电脑'],
  [/不透明|透明|opacity|alpha|transparen/i, '0 = 完全看不见，1 = 完全不透明'],
  [/半径|radius/i, '以中心算起多远之内（单位一般是像素，主角大约 100 像素高）'],
  [/范围|距离|range|distance|\bdist\b/i, '多远之内起作用（单位一般是像素，主角大约 100 像素高）'],
  [/间隔|interval/i, '每隔多久做一次：数字越小越频繁'],
  [/毫秒|\bms\b|_ms$|Ms$/, '1000 毫秒 = 1 秒'],
  [/难度|difficulty/i, '越高敌人越难打'],
  [/缓存|cache/i, '用内存换速度：卡的话开着更顺，内存小的电脑可以关'],
  [/实验|experimental|\bbeta\b/i, '还在试验的功能，可能不稳定，出问题就关掉'],
  [/音量|volume|\bvol\b/i, '0 是静音，越大越响'],
  [/种子|seed/i, '同一个种子每次随机出的结果都一样；想要不一样就换个数'],
  [/上限|\bmax\b|maximum|\blimit\b|\bcap\b/i, '最多到这么多，超过的不算或不出现'],
  [/下限|\bmin\b|minimum/i, '最少这么多'],
  [/几率|概率|chance|\bprob/i, '发生的可能性有多大'],
  [/\brate\b|比率/i, '数值越大，发生得越多越快'],
  [/缩放|scale|zoom/i, '1 = 原大小；大于 1 放大，小于 1 缩小'],
  [/震屏|shake/i, '受击或大招时画面晃动；容易晕的可以关'],
  [/慢动作|slow ?mo/i, '关键时刻画面放慢一下'],
  [/联网|online|update|sync|同步/i, '会连网络'],
];

const CJK = /[㐀-鿿]/;
/** camelCase / snake_case / kebab-case / 空格 → 小写词 */
const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_\-./:]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);

const UNIT_WORDS = new Set(['ms', 'millis', 'sec', 'secs', 'seconds', 's', 'px', 'pct', 'percent']);
function translate(text) {
  let w = words(text); if (w.length > 1 && UNIT_WORDS.has(w[w.length - 1])) w = w.slice(0, -1);   // 单位后缀另外显示
  if (!w.length) return null;
  const out = []; let known = 0, total = 0;
  for (let i = 0; i < w.length;) {
    if (/^\d+$/.test(w[i])) { out.push(w[i]); i++; continue; }
    let hit = null;
    for (let n = Math.min(3, w.length - i); n >= 1 && !hit; n--) {
      const ph = w.slice(i, i + n).join(' ');
      if (n > 1 && PHRASES[ph]) hit = [PHRASES[ph], n];
      else if (n > 1 && PHRASES[w.slice(i, i + n).join('')]) hit = [PHRASES[w.slice(i, i + n).join('')], n];
      else if (n === 1 && (PHRASES[ph] ?? WORDS[ph])) hit = [PHRASES[ph] ?? WORDS[ph], 1];
    }
    total++;
    if (hit) { known++; out.push(hit[0]); i += hit[1]; } else { out.push(w[i]); i++; }
  }
  if (!known || known / total < 0.6) return null;   // 大半不认识，就别乱翻了
  // 「最大 X」「最小 X」→「X 上限」「X 下限」，读起来更像中文
  let r = out.join(' ');
  r = r.replace(/^最大 (.+)$/, '$1上限').replace(/^最小 (.+)$/, '$1下限').replace(/^(启用|显示|隐藏|允许|使用|跳过) /, '$1');
  return r.replace(/ (?=[㐀-鿿])|(?<=[㐀-鿿]) /g, '');
}

/** 键名或标签的后缀 → 单位 */
function unitOf(s) {
  const k = String(s.key ?? '');
  if (/(ms|Ms|MS|millis)$/.test(k) || /毫秒/.test(s.label)) return '毫秒';
  if (/(Sec|Secs|Seconds|_s|_sec)$/.test(k) || /（秒）|\(秒\)|秒数/.test(s.label)) return '秒';
  if (/(Px|_px)$/.test(k) || /像素/.test(s.label)) return '像素';
  if (/(Pct|Percent|_pct)$/i.test(k) || /[%％]|百分/.test(s.label)) return '%';
  if (/千分/.test(s.label)) return '‰';
  return '';
}

/**
 * 把一个参数定义变成好懂的样子
 * @returns {{ label: string, orig: string|null, hint: string, explain: string, unit: string, opt: (v: string) => string }}
 */
export function explainSetting(s) {
  const label = String(s.label ?? s.key ?? '');
  let shown = label, orig = null;
  if (!CJK.test(label)) {
    const t = translate(label) ?? translate(s.key ?? '');
    if (t && t !== label) { shown = t; orig = label; }
  }
  const hay = `${label} ${s.key ?? ''} ${words(s.key ?? '').join(' ')}`;
  const ex = [];
  for (const [re, txt] of EXPLAIN) if (re.test(hay) && !ex.includes(txt)) ex.push(txt);
  // 一个参数只讲它最主要的意思：调试开关就只说调试；倍率就不再讲范围、距离、缩放的单位
  const has = (k) => ex.some((t) => t.startsWith(k));
  if (has('给作者排查')) ex.splice(0, ex.length, ex.find((t) => t.startsWith('给作者排查')));
  else if (has('1 = 原样；2')) for (let i = ex.length - 1; i >= 0; i--) if (/^(以中心|多远之内|1 = 原大小)/.test(ex[i])) ex.splice(i, 1);
  ex.length = Math.min(ex.length, 2);
  // 0–1 之间的几率，给出百分比换算
  if (s.type === 'number' && typeof s.max === 'number' && s.max <= 1 && !/千分|万分|‰/.test(hay) && /几率|概率|chance|prob/i.test(hay)) { ex.unshift('0–1 之间：0.1 就是 10%'); ex.length = Math.min(ex.length, 2); }
  if (s.type === 'bool' && !ex.length && /启用|enable|开启|use/i.test(hay)) ex.push('打勾就开，不打勾就关');
  const hintRaw = typeof s.hint === 'string' ? s.hint : '';
  return {
    label: shown, orig,
    hint: hintRaw,
    explain: ex.filter((t) => !hintRaw.includes(t.slice(0, 6))).join('；'),
    unit: unitOf(s),
    opt: (v) => { const x = String(v), lo = x.toLowerCase(); if (CJK.test(x)) return x; return OPTS[lo] ?? translate(x) ?? x; },
  };
}


// ---------------------------------------------------------------- 试场：数据表字段（法术、法宝、物品、妖兽、功法、灵宠）
// 键：'表.路径'（优先）或 '路径'。值：[中文名, 白话说明]
const FIELDS = {
  // 法术 ARTS
  'arts.power': ['威力', '伤害 = 攻击 × 威力；1 就是一倍攻击'], 'arts.mp': ['法力', '每次施放耗掉法力上限的几成：0.1 = 一成'],
  'arts.hpCost': ['耗血', '每次施放耗掉气血上限的几成'], 'arts.cd': ['冷却', '放完一次要等几秒才能再放'],
  'arts.range': ['射程', '能打多远（像素；主角约 100 像素高）'], 'arts.radius': ['范围', '爆开 / 光柱 / 区域的半径（像素）；扇形、锥形里是张开的角度'],
  'arts.count': ['发数', '一次放出几发'], 'arts.speed': ['弹速', '弹道每秒飞多少像素'], 'arts.pierce': ['穿透', '打中一个之后继续往前飞'],
  'arts.homing': ['追踪', '弹道会拐弯追着敌人'], 'arts.dur': ['持续', '区域、增益、护盾、召唤能维持几秒'],
  'arts.tier': ['品阶', '0 凡 · 1 黄 · 2 玄 · 3 地 · 4 天'], 'arts.realm': ['修习境界', '要到这一境界才能修习（1 = 炼气）'],
  'arts.vsEvil': ['克邪倍率', '打魔物、鬼物时伤害再乘这个数'], 'arts.status.k': ['附带异常', '打中后可能让对方陷入的状态'],
  'arts.status.dur': ['异常时长', '异常持续几秒'], 'arts.status.ch': ['异常几率', '0–1：0.5 就是五成'],
  'arts.buff.atk': ['增攻', '增益期间攻击提高几成'], 'arts.buff.def': ['增防', '增益期间防御提高几成'], 'arts.buff.speed': ['增速', '增益期间身法提高几成'],
  'arts.buff.regen': ['回复', '增益期间每秒回复'], 'arts.buff.reflect': ['反震', '把受到的伤害反弹几成'], 'arts.buff.stealth': ['隐身', '增益期间敌人察觉不到你'],
  'arts.summon.n': ['召唤数', '一次召出几只'], 'arts.cast': ['出手方式', '弹道、扇形、落点、光柱……'], 'arts.fx': ['特效', '用哪一种现成特效'],
  'arts.school': ['流派', '火冰雷风土木剑……'], 'arts.color': ['颜色', '特效的颜色'],
  // 法宝 ITEMS.art
  'items.art.power': ['威力', '伤害 = 灵力 × 威力'], 'items.art.mp': ['法力', '每次催动耗费的法力'], 'items.art.cd': ['冷却', '催动一次后要等几秒'],
  'items.art.pieces': ['件数', '成套法宝（飞剑、飞针）最多能放出几件'], 'items.art.sense': ['神识要求', '每件占用多少神识：神识不够放不出全套'],
  'items.art.reqRealm': ['境界要求', '低一个大境界只能勉强驱使、威力减半'], 'items.art.element': ['五行', '决定附带的异常（火灼、冰冻、雷麻……）'],
  'items.art.color': ['颜色', '法宝光华的颜色'], 'items.art.mapSpeed': ['遁速', '大地图上飞行速度倍率：2 = 快一倍'],
  'items.art.def': ['护体', '护甲 / 盾提高的防御（0.3 = 三成）'], 'items.art.absorb': ['护盾吸收', '护盾能挡下最大法力的几成'],
  'items.art.hpCost': ['耗血', '魔器每次催动耗掉气血的几成'], 'items.art.kind': ['种类', '飞剑、飞针、护盾、遁具……'],
  'items.tier': ['品阶', '0 凡品 · 1 下品 · 2 中品 · 3 上品 · 4 极品 · 5 古宝 · 6 通天'], 'items.price': ['价格', '坊市里的灵石价'],
  'items.pill.exp': ['加修为', '服下增加的修为'], 'items.pill.expPct': ['加修为（比例）', '按当前境界所需修为的几成增加'], 'items.pill.hp': ['回气血', '回复气血上限的几成'],
  'items.pill.mp': ['回法力', '回复法力上限的几成'], 'items.pill.life': ['加寿元', '增加几年寿元'], 'items.pill.sense': ['加神识', '永久增加的神识'],
  'items.tal.power': ['威力', '符箓的威力倍率'], 'items.herbBase': ['基准年份', '灵药天然长成的年份'],
  // 妖兽 / 修士 ENEMIES（倍率：1 = 同境界标准）
  'enemies.hp': ['气血倍率', '1 = 同境界标准；新刷出的才按新数值'], 'enemies.atk': ['攻击倍率', '1 = 同境界标准'], 'enemies.def': ['防御倍率', '1 = 同境界标准'],
  'enemies.speed': ['移速', '每秒走多少像素'], 'enemies.aggro': ['察觉距离', '离多近会发现你（像素）'], 'enemies.flying': ['能飞', '飞在空中'],
  'enemies.evil': ['魔物', '被辟邪类法术克制'], 'enemies.hide': ['擅隐匿', '神识要贴近才看得到'], 'enemies.lair': ['妖王', '只在巢穴出现'],
  'enemies.melee.range': ['近战距离', '扑咬够得着多远'], 'enemies.melee.power': ['近战威力', '近战一下打几倍攻击'], 'enemies.melee.cd': ['近战冷却', '两次扑咬间隔几秒'],
  'enemies.ranged.power': ['远攻威力', '远程一下打几倍攻击'], 'enemies.ranged.cd': ['远攻冷却', '两次远攻间隔几秒'], 'enemies.ranged.range': ['远攻射程', '多远开始远攻'],
  'enemies.ranged.speed': ['弹速', '远攻弹道的速度'], 'enemies.minDanger': ['最低险度', '险度不到这个数的地方不刷'], 'enemies.maxDanger': ['最高险度', '险度超过这个数的地方不刷'],
  // 功法 / 灵宠
  'gongfa.rate': ['修炼倍率', '1 = 原速；1.3 = 快三成'], 'gongfa.maxRealm': ['可修到', '超出这个大境界效果减半'], 'gongfa.atk': ['加攻', '攻击加几成'], 'gongfa.hp': ['加气血', '气血加几成'],
  'gongfa.def': ['加防', '防御加几成'], 'gongfa.mp': ['加法力', '法力加几成'], 'gongfa.sword': ['剑修加成', '飞剑伤害加几成'],
  'pets.dmg': ['出手威力', '灵宠一击打几倍攻击'], 'pets.cd': ['出手间隔', '两次出手隔几秒'], 'pets.scout': ['寻宝本领', '越大越能替你找到远处的机缘'], 'pets.hatch': ['孵化天数', '灵卵几天破壳'],
  // 通用
  name: ['名字', ''], realm: ['境界', '1 = 炼气'], stage: ['层次', '同一境界里的第几层'], tier: ['品阶', '数字越大越珍贵'],
};
/** 字段的中文名与说明：表名 + 路径（如 'items', 'art.power'） */
export function fieldInfo(table, path) {
  const hit = FIELDS[`${table}.${path}`] ?? FIELDS[path];
  if (hit) return { label: hit[0], hint: hit[1], known: true };
  const last = String(path).split('.').pop();
  const ex = explainSetting({ key: last, label: last, type: 'number' });
  return { label: ex.label === last ? path : ex.label, hint: ex.explain, orig: path, known: false };
}
