// 万物属性：给任何东西列一张属性表——主角、场上任何单位（含世界原有的、DrG 傀儡）、随行灵宠、世界里的有名人物，
// 以及数据表里的法术 / 法宝·物品 / 妖兽修士 / 功法 / 灵宠种类（模组加的也一样；认不出的数值和开关列进「其他字段」）。
// 表里每一项：{ k, label, hint, type: 'number'|'bool'|'select'|'color'|'text', min, max, step, unit, options, get(), set(v) }。
// 改动一律经 index.js 的 setField（进撤销栈、记原值、出场还原）。
import { fieldInfo } from './glossary.js';
import { STATUS, ELEMENT, ITEM_TYPE, ART_TIER, ITEM_TIER } from './catalog.js';

const TEAM = [['foe', '敌对'], ['dummy', '木桩'], ['ally', '友方']];
const CAST = ['bolt', 'fan', 'nova', 'burst', 'cone', 'beam', 'strike', 'chain', 'field', 'orbit', 'dash', 'blink', 'buff', 'shield', 'heal', 'summon', 'sense', 'custom'];
const CAST_NAME = { bolt: '弹道', fan: '扇形', nova: '自身爆发', burst: '落点爆发', cone: '锥形', beam: '光柱', strike: '天降', chain: '连锁', field: '区域', orbit: '环绕', dash: '冲刺', blink: '瞬移', buff: '增益', shield: '护盾', heal: '治疗', summon: '召唤', sense: '神识', custom: '自定义' };
/** 数据表里不往属性表里列的键（文字说明、外观、数组、关系） */
const SKIP = new Set(['id', 'desc', 'evo', 'glyph', 'lvCount', 'drops', 'regions', 'lm', 'names', 'prefer', 'look', 'robe', 'pack', 'lv', 'needs', 'egg', 'scroll', 'title', 'zone', 'behave', 'type', 'upgradable', 'stack', 'giftValue', 'skills', 'kit']);
/** 各表常用字段：没写的也列出来（改了就补上，出场删掉） */
const KNOWN = {
  arts: ['power', 'mp', 'hpCost', 'cd', 'range', 'radius', 'count', 'speed', 'pierce', 'homing', 'dur', 'vsEvil', 'status.k', 'status.dur', 'status.ch', 'cast', 'fx', 'school', 'tier', 'realm', 'color'],
  items: ['tier', 'price', 'art.power', 'art.mp', 'art.cd', 'art.pieces', 'art.sense', 'art.reqRealm', 'art.element', 'art.color', 'art.mapSpeed', 'art.def', 'art.absorb', 'art.hpCost', 'pill.exp', 'pill.hp', 'pill.mp', 'pill.life', 'pill.sense', 'tal.power'],
  enemies: ['hp', 'atk', 'def', 'speed', 'aggro', 'flying', 'evil', 'hide', 'melee.range', 'melee.power', 'melee.cd', 'ranged.power', 'ranged.cd', 'ranged.range', 'ranged.speed', 'minDanger', 'maxDanger'],
  gongfa: ['rate', 'maxRealm', 'atk', 'hp', 'def', 'mp', 'sword'],
  pets: ['dmg', 'cd', 'scout', 'hatch', 'flying', 'ranged'],
};
/** 只在父对象已存在时才列（物品没有 art 就不列法宝那一组） */
const NEED_PARENT = new Set(['art', 'pill', 'tal', 'melee', 'ranged']);
const GROUP_OF = { status: '附带异常', buff: '增益', summon: '召唤', art: '法宝', pill: '丹药', tal: '符箓', melee: '近战', ranged: '远攻' };
const TABLE_NAME = { arts: '法术', items: '法宝·物品', enemies: '妖兽·修士', gongfa: '功法', pets: '灵宠种类' };

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** 数值的拨动步长与范围（按当前值估） */
function numRange(path, v) {
  const last = path.split('.').pop();
  if (/^(ch)$/.test(last) || /Ch$/.test(last)) return { min: 0, max: 1, step: 0.01 };
  if (last === 'mp' || last === 'hpCost') return { min: 0, max: 5, step: 0.01 };
  if (last === 'tier') return { min: 0, max: 6, step: 1 };
  if (last === 'realm' || last === 'reqRealm' || last === 'maxRealm') return { min: 0, max: 9, step: 1 };
  if (/count|pieces|^n$|hatch|Danger/.test(last)) return { min: 0, max: 999, step: 1 };
  const a = Math.abs(+v || 0);
  return { min: 0, max: Math.max(10, a * 50, 1e4), step: a >= 100 ? Math.max(1, Math.round(a / 100)) : a >= 10 ? 1 : a >= 1 ? 0.05 : 0.01 };
}

export function createProps(X) {
  const { U } = X;
  const realmOpts = () => (U.REALMS ?? []).map((r, i) => [i, r.name]);
  const stageOpts = (r) => (U.REALMS?.[r]?.stages ?? []).map((s, i) => [i, typeof s === 'string' ? s : s?.name ?? String(i)]);
  const distinct = (list, f) => [...new Set(list.map(f).filter((v) => v !== undefined && v !== null && v !== ''))];

  // ---------------------------------------------------------------- 主角
  function hero() {
    const g = X.G(), h = g.hero, st = () => g.stats, O = X.S.heroOv;
    const ov = (k, label, hint, step) => ({ k, label, hint, type: 'number', min: 0, max: 1e9, step, get: () => st()[k === 'def' ? 'def' : k], set: (v) => { O[k] = Math.max(k === 'hp' || k === 'mp' ? 1 : 0, v); } });
    return {
      title: h.name ?? '苏寒', sub: `${X.realmName(h.realm, h.stage)} · 主角`, tone: '#7a5a2a', glyph: (h.name ?? '苏寒').slice(-1), portrait: X.heroPortrait(),
      live: [['hp', '气血', () => h.hp], ['mp', '法力', () => h.mp]],
      groups: [
        { name: '境界', fields: [
          { k: 'realm', label: '境界', type: 'select', options: realmOpts(), get: () => h.realm, set: (v) => X.edit('player', 'realm', +v), raw: true },
          { k: 'stage', label: '层次', type: 'select', options: stageOpts(h.realm), get: () => h.stage, set: (v) => X.edit('player', 'stage', +v), raw: true },
          { k: 'exp', label: '修为', hint: '当前境界里攒下的修为', type: 'number', min: 0, max: 1e12, step: 10, get: () => h.exp, set: (v) => { h.exp = Math.max(0, v); } },
        ] },
        { name: '气血 · 法力', fields: [
          { k: 'hpNow', label: '气血', hint: '眼下的气血', type: 'number', min: 1, max: 1e9, step: 1, get: () => Math.round(h.hp * st().hp), set: (v) => { h.hp = Math.max(0.001, Math.min(1, v / st().hp)); } },
          ov('hp', '气血上限', '试场专用加成：只在阵里有效', 10),
          { k: 'mpNow', label: '法力', hint: '眼下的法力', type: 'number', min: 0, max: 1e9, step: 1, get: () => Math.round(h.mp * st().mp), set: (v) => { h.mp = Math.max(0, Math.min(1, v / st().mp)); } },
          ov('mp', '法力上限', '试场专用加成：只在阵里有效', 10),
        ] },
        { name: '战力', fields: [
          ov('atk', '攻击', '法术、法宝的伤害都按它算', 1), ov('def', '防御', '受到的伤害按它减免', 1), ov('sense', '神识', '决定能放几件法宝、看得多远', 1),
          { k: 'move', label: '身法', hint: '走路、飞行速度的倍率：2 = 快一倍', type: 'number', min: 0.1, max: 10, step: 0.05, get: () => O.move ?? 1, set: (v) => { O.move = Math.max(0.1, v); } },
        ] },
        { name: '开关', fields: [
          ['god', '无敌', '不受任何伤害'], ['infMp', '法力不耗', '法力始终是满的'], ['nocd', '无冷却', '法术、法宝放完立刻能再放'],
          ['oneHit', '一击必杀', '打中敌对单位就倒'], ['fly', '能飞', '不论境界都能御空（按飞行键）'], ['stealth', '不被发现', '敌人察觉不到你，已追来的也会丢了你'],
          ['lock', '锁住气血', '气血始终是满的（挨打照样有受击）'],
        ].map(([k, label, hint]) => ({ k, label, hint, type: 'bool', get: () => !!X.S[k], set: (v) => X.setCtl(k, !!v) })) },
      ],
      acts: [['heal', '回满 · 清异常', 'jade']],
    };
  }

  // ---------------------------------------------------------------- 战斗单位（试场刷的、世界原有的、模组放的）
  function unit(id) {
    const o = X.S.objs.get(id); if (!o || !X.alive(o)) return null;
    const e = o.e, R = U.REALMS ?? [];
    const num = (k, label, hint, min, max, step) => ({ k, label, hint, type: 'number', min, max, step, get: () => e[k], set: (v) => X.edit(id, k, v), raw: true });
    const flag = (k, label, hint, on) => ({ k, label, hint, type: 'bool', get: () => (on ? !o[k] : !!o[k]), set: (v) => X.edit(id, k, on ? !v : !!v), raw: true });
    const groups = [
      { name: '立场 · 心智', fields: [
        { k: 'team', label: '立场', type: 'seg', options: TEAM, get: () => o.team, set: (v) => X.edit(id, 'team', v), raw: true },
        flag('noAI', 'AI', '关掉后原地不动、不出手', true), flag('frozen', '定身', '钉在原地，仍会出手'), flag('noP', '无视主角', '不把你当对手'),
        flag('follow', '随行', '跟在你身边（友方时）'), flag('corpse', '保留尸体', '倒下后尸身留在原地'),
      ] },
      { name: '境界', fields: [
        { k: 'realm', label: '境界', type: 'select', options: R.map((r, i) => [i, r.name]), get: () => e.realm, set: (v) => X.edit(id, 'realm', +v), raw: true },
        { k: 'stage', label: '层次', type: 'select', options: stageOpts(e.realm), get: () => e.stage, set: (v) => X.edit(id, 'stage', +v), raw: true },
      ] },
      { name: '数值', fields: [
        num('hp', '气血', '眼下的气血', 0, 1e12, Math.max(1, Math.round(e.maxHp / 200))), num('maxHp', '气血上限', '', 1, 1e12, Math.max(1, Math.round(e.maxHp / 200))),
        num('atk', '攻', '', 0, 1e9, Math.max(0.1, e.atk / 100)), num('dfn', '防', '', 0, 1e9, Math.max(0.1, e.dfn / 100)),
        num('speed', '移速', '每秒走多少像素', 0, 3000, 2),
        { k: 'scale', label: '体型', hint: '画出来的大小：1 = 原样（只改外观）', type: 'number', min: 0.2, max: 5, step: 0.02, get: () => o.scale ?? 1, set: (v) => X.edit(id, 'scale', v), raw: true },
      ] },
    ];
    // DrG 傀儡：框架提供的属性（韧性、耐力、气、战意……）
    const D = globalThis.DrGNext;
    if (typeof D?.inspect === 'function') {
      let list = null; try { list = D.inspect(e); } catch { list = null; }
      if (Array.isArray(list) && list.length) groups.push({ name: '傀儡', fields: list.filter((f) => f && f.key && typeof f.get === 'function').map((f) => ({
        k: 'drg.' + f.key, label: String(f.label ?? f.key), hint: f.hint ?? '', type: f.type === 'bool' ? 'bool' : f.type === 'select' ? 'select' : 'number',
        min: f.min ?? 0, max: f.max ?? 1e9, step: f.step ?? 1, options: Array.isArray(f.options) ? f.options.map((x) => (Array.isArray(x) ? x : typeof x === 'object' ? [x.value, x.label ?? x.value] : [x, x])) : undefined,
        get: () => { try { return f.get(); } catch { return undefined; } }, set: (v) => { if (typeof f.set === 'function') f.set(v); } })) });
    }
    const kind = o.def.kind === 'human' ? '修士' : '妖兽';
    return { title: o.def.name, sub: `${X.realmName(e.realm, e.stage)} · ${kind}${o.ext ? ' · 世界原有' : ''}${o.e.boss ? ' · 首领' : ''}`, tone: `rgb(${X.TEAM_COL[o.team]})`, glyph: o.def.name.slice(-1), thumb: { kind: 'enemy', id: o.def.id },
      unit: o, groups, acts: [['heal', '回满', 'jade'], ['here', '挪到身旁'], ['dup', '复制'], ['rm', '移除', 'bad'], ['def', '改这一种的数据']] };
  }

  // ---------------------------------------------------------------- 随行灵宠
  function pet() {
    const g = X.G(), ws = g.ws, p = ws.pets?.[ws.petActive ?? 0]; if (!p) return null;
    let k = {}; try { k = X.petKinds()[p.kind] ?? {}; } catch { /* */ }
    return { title: p.name, sub: `${k.name ?? p.kind} · ${p.lv} 级 · 随行灵宠`, tone: `rgb(${k.color ?? '200,160,90'})`, glyph: (p.name ?? '宠').slice(-1), thumb: { kind: 'pet', id: p.kind },
      groups: [{ name: '灵宠', fields: [
        { k: 'lv', label: '等级', hint: '1–10 级：越高越强', type: 'number', min: 1, max: 10, step: 1, get: () => p.lv, set: (v) => { p.lv = Math.max(1, Math.min(10, Math.round(v))); if (g.pets) g.pets.ent = null; } },
        { k: 'bond', label: '亲密', hint: '高了会叼东西回来送你', type: 'number', min: 0, max: 100, step: 1, get: () => p.bond ?? 0, set: (v) => { p.bond = Math.max(0, Math.min(100, Math.round(v))); } },
        { k: 'xp', label: '历练', hint: '攒够升一级', type: 'number', min: 0, max: 1e6, step: 1, get: () => p.xp ?? 0, set: (v) => { p.xp = Math.max(0, v); } },
        { k: 'name', label: '名字', type: 'text', get: () => p.name, set: (v) => { p.name = String(v).slice(0, 8) || p.name; } },
      ] }],
      acts: [['def', '改这一种的数据']], defLink: { table: 'pets', id: p.kind } };
  }

  // ---------------------------------------------------------------- 世界里的有名人物（不在战斗中的）
  function npc(nid) {
    const g = X.G(), d = g.npcs?.byId?.get(nid); if (!d) return null;
    return { title: d.name, sub: `${X.realmName(d.realm, d.stage)}${d.title ? ' · ' + d.title : ''}`, tone: '#7a4a2a', glyph: d.name.slice(-1), thumb: { kind: 'npc', id: nid, name: d.name },
      groups: [{ name: '人物', fields: [
        { k: 'realm', label: '境界', type: 'select', options: realmOpts(), get: () => d.realm, set: (v) => { d.realm = +v; d.stage = Math.min(d.stage, Math.max(0, (U.REALMS?.[+v]?.stages?.length ?? 1) - 1)); } },
        { k: 'stage', label: '层次', type: 'select', options: stageOpts(d.realm), get: () => d.stage, set: (v) => { d.stage = +v; } },
        { k: 'favor', label: '好感', hint: '对你的好感：越高越好说话', type: 'number', min: -100, max: 100, step: 1, get: () => d.favor ?? 0, set: (v) => { d.favor = Math.round(v); } },
        { k: 'age', label: '年纪', type: 'number', min: 1, max: 99999, step: 1, get: () => d.age, set: (v) => { d.age = Math.max(1, Math.round(v)); } },
        { k: 'life', label: '寿元', hint: '能活到几岁', type: 'number', min: 1, max: 99999, step: 1, get: () => d.life, set: (v) => { d.life = Math.max(1, Math.round(v)); } },
        { k: 'wealth', label: '身家', hint: '灵石', type: 'number', min: 0, max: 1e9, step: 10, get: () => d.wealth ?? 0, set: (v) => { d.wealth = Math.max(0, Math.round(v)); } },
      ] }],
      acts: [['call', '召来身旁', 'jade'], ['spar', '切磋一场'], ...(X.npcMine?.(nid) ? [['drop', '移出试场']] : [])] };
  }

  // ---------------------------------------------------------------- 数据表条目
  function dataSheet(table, id) {
    const ref = X.dataRef(table, id); if (!ref) return null;
    const list = table === 'arts' ? Object.values(U.ARTS) : table === 'items' ? Object.values(U.ITEMS) : table === 'enemies' ? Object.values(U.ENEMIES) : [];
    const seen = new Set(), groups = new Map();
    const add = (gname, f) => { if (!groups.has(gname)) groups.set(gname, []); groups.get(gname).push(f); };
    const field = (path) => {
      if (seen.has(path)) return; seen.add(path);
      const parts = path.split('.'), top = parts[0];
      if (parts.length > 1 && NEED_PARENT.has(top) && (ref[top] == null || typeof ref[top] !== 'object')) return;
      const v = getPath(ref, path), info = fieldInfo(table, path), last = parts[parts.length - 1];
      const gname = parts.length > 1 ? GROUP_OF[top] ?? top : info.known ? '常用' : '其他字段';
      const base = { k: path, label: info.label, hint: info.hint, orig: info.known ? '' : path, get: () => getPath(X.dataRef(table, id), path), set: (nv) => X.dataSet(table, id, path, nv) };
      let f = null;
      if (last === 'k' && top === 'status') f = { ...base, type: 'select', options: [['', '无'], ...Object.entries(STATUS)] };
      else if (last === 'element') f = { ...base, type: 'select', options: [['', '无'], ...Object.entries(ELEMENT)] };
      else if (path === 'cast') f = { ...base, type: 'select', options: CAST.map((c) => [c, CAST_NAME[c] ?? c]) };
      else if (path === 'fx' || path === 'school') f = { ...base, type: 'select', options: distinct(list, (x) => x[path]).map((c) => [c, c]) };
      else if (path === 'art.kind') f = { ...base, type: 'select', options: distinct(list, (x) => x.art?.kind).map((c) => [c, c]) };
      else if (path === 'tier' && table === 'arts') f = { ...base, type: 'select', options: ART_TIER.map((n, i) => [i, n]) };
      else if (path === 'tier' && table === 'items') f = { ...base, type: 'select', options: ITEM_TIER.map((n, i) => [i, n]) };
      else if (/color/i.test(last) && (typeof v === 'string' || v === undefined)) f = { ...base, type: 'color' };
      else if (typeof v === 'boolean' || ['pierce', 'homing', 'flying', 'evil', 'hide', 'lair', 'ranged', 'aux', 'stealth', 'decoy'].includes(last)) f = { ...base, type: 'bool' };
      else if (typeof v === 'number' || v === undefined) f = { ...base, type: 'number', ...numRange(path, v), blank: v === undefined };
      else if (path === 'name' && typeof v === 'string') f = { ...base, type: 'text' };
      if (f) add(gname, f);
    };
    field('name');
    for (const p of KNOWN[table] ?? []) field(p);
    // 认不出的：顶层与一层嵌套里的数值、开关（模组加的字段也在这里）
    for (const [k, v] of Object.entries(ref)) {
      if (SKIP.has(k) || k.startsWith('_')) continue;
      if (typeof v === 'number' || typeof v === 'boolean') field(k);
      else if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) if ((typeof v2 === 'number' || typeof v2 === 'boolean' || (k2 === 'k' && k === 'status')) && !SKIP.has(k2)) field(`${k}.${k2}`);
    }
    const name = ref.name ?? id;
    const sub = table === 'items' ? `${ITEM_TYPE[ref.type] ?? ref.type ?? ''} · ${ITEM_TIER[ref.tier] ?? ''}` : table === 'arts' ? `${ref.school ?? ''}系 · ${ART_TIER[ref.tier] ?? ''}` : TABLE_NAME[table];
    const kind = table === 'enemies' ? 'enemy' : table === 'pets' ? 'pet' : table === 'items' ? 'item' : table === 'arts' ? 'art' : '';
    const order = ['常用', ...Object.values(GROUP_OF), '其他字段'];
    return { title: name, sub: `${sub} · ${TABLE_NAME[table]}数据`, tone: '#4a5a6a', glyph: String(ref.glyph ?? name).slice(0, 1), thumb: kind ? { kind, id, name } : null, data: { table, id },
      note: table === 'enemies' ? '改的是这一种的底子：新刷出来的才按新数值。' : table === 'items' && ref.art ? '下次催动起生效。' : table === 'arts' ? '下次施放起生效。' : '',
      groups: [...groups].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([name2, fields]) => ({ name: name2, fields })), acts: [] };
  }

  function sheet(key) {
    if (!key) return null;
    if (key === 'player') return hero();
    if (key === 'pet') return pet();
    if (key.startsWith('npc:')) return npc(key.slice(4));
    if (key.startsWith('data:')) { const [, table, ...rest] = key.split(':'); return dataSheet(table, rest.join(':')); }
    return unit(key);
  }
  return { sheet };
}
