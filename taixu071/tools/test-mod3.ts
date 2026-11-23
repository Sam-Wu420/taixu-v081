// v0.56 验收：模组接口 v3——新地点、城镇事务、有名有姓的 NPC、交谈选项、事件、任务、界面、帧动画、表现
// 用法：npx tsx tools/test-mod3.ts
import './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__FANREN_NORELOAD = true;
const { ModHost } = await import('../src/mod/host');
const HK = await import('../src/mod/hooks');
const { LOC_BY_ID, LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { BEAST_SPR, beastSpriteTop } = await import('../src/gfx/beastTex');
const { RECIPES } = await import('../src/data/recipes');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');

let fails = 0, n = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const mk = (id: string, code: string, extra: any = {}, files: Record<string, string> = {}) => ({ format: 'fanren-mod@1', manifest: { id, name: id, version: '1.0.0', author: 't', desc: '', api: 3, ...extra }, main: 'index.js', files: { 'index.js': code, ...files } });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

// 新地点放在梁国某城旁边（地图坐标）
const base = LOC_BY_ID.get('jiayuan') ?? LOCATIONS.find((l) => l.type === 'city')!;
const TX = Math.round(base.x + 35), TY = Math.round(base.y + 10), SX = Math.round(base.x - 30), SY = Math.round(base.y + 30);
const CODE = `export default function (api) {
  api.content.items([{ id: 'xian_ling', name: '仙灵草', type: 'herb', tier: 2, price: 120, desc: '试', glyph: '草', stack: true }]);
  api.content.locations([
    { id: 'xian_town', name: '仙踪镇', type: 'town', map: 'tiannan', x: ${TX}, y: ${TY}, desc: '模组小镇。' },
    { id: 'xian_cave', name: '幽谷', type: 'secret', map: 'tiannan', x: ${SX}, y: ${SY}, desc: '谷中雾气弥漫。' },
  ]);
  api.content.townAction({ id: 'tea', seal: '茶', name: '茶馆', desc: '喝茶听书', where: ['xian_town', 'city'], act: (g, loc) => ({ speaker: '茶博士', text: '客官来了，这里是' + loc.name, options: [{ label: '好', act: () => { api.store.set('tea', 1); } }] }) });
  api.content.townAction({ id: 'dig', seal: '掘', name: '挖掘', desc: '在谷底挖一挖', where: ['xian_cave'], act: (g) => { g.giveItem('xian_ling', 2); } });
  api.content.npcs([{ id: 'xian_laodao', name: '云老道', sex: 'm', home: 'xian_town', realm: 1, stage: 1, title: '游方道人', role: 'elder', pers: 'kind', favor: 55, look: { robe: '#5a3a8a' }, greet: ['无量天尊。'], apprentice: true,
    talk: (g, npc) => ({ speaker: npc.name, text: '贫道等你多时了。', options: [{ label: '前辈有何指教？', next: { speaker: npc.name, text: '帮我寻两株仙灵草。', options: [{ label: '好', act: () => { g.quest.set('herb', { title: '寻仙灵草', text: '幽谷', have: 0, need: 2, x: ${SX * 300}, y: ${SY * 300} }); } }] } }] }) }]);
  api.content.talkOption({ id: 'ask', label: '打听仙踪镇', who: ['xian_laodao', 'lifeiyu'], act: (g, npc) => ({ speaker: npc.name, text: '仙踪镇在东边。', options: [{ label: '多谢' }] }) });
  api.content.talkOption({ id: 'never', label: '不该出现', when: () => false, act: () => {} });
  api.ui.button({ id: 'b', glyph: '仙', label: '仙踪', onClick: (g) => g.openPanel('p'), badge: () => 2 });
  api.ui.panel('p', { title: '仙踪录', render: (g) => [{ type: 'text', text: '第 ' + Math.floor(g.day) + ' 日' }, { type: 'bar', value: 3, max: 10 }, { type: 'button', label: '记一笔', onClick: () => api.store.set('clicked', (api.store.get('clicked') || 0) + 1) }] });
  api.ui.hotkey('7', (g) => api.store.set('hk', 1));
  api.gfx.sprite('e:wolf', { frames: { idle: ['a.png', 'a.png'], walk: ['a.png'] }, height: 90, motion: 'walk' });
  api.gfx.sprite('n:xian_laodao', { frames: { idle: ['a.png'] }, height: 110 });
  const log = []; api.store.set('ev', log);
  for (const ev of ['realm', 'enter', 'talk', 'spar', 'use', 'craft', 'down']) api.on(ev, (g, e) => { const l = api.store.get('ev'); l.push(ev); api.store.set('ev', l); });
  api.on('draw', (g, d) => { d.circle(g.hero.x, g.hero.y, 30, 'rgba(255,0,0,0.5)'); d.text('仙', g.hero.x, g.hero.y - 150); d.image('a.png', g.hero.x, g.hero.y, 10, 10); });
}`;

console.log('一、加载（建世界之前）');
const host = new ModHost();
const st = await host.load(mk('xian', CODE, {}, { 'a.png': PNG, 's.wav': WAV }) as any);
ok(st.state === 'loaded', `加载（${st.error ?? '无错'}：地点 ${st.added.locations}、人物 ${st.added.npcs}）`);
ok(LOC_BY_ID.get('xian_town')?.map === 'renjie' && LOCATIONS.some((l) => l.id === 'xian_cave'), '地点进了地点表（当前地图）');
ok(BEAST_SPR['e:wolf']?.anim?.idle?.length === 2 && beastSpriteTop('e:wolf', false) === 90, '给原版妖兽换图：帧动画登记、头顶高度按新图算');
const bad = async (code: string, re: RegExp, label: string) => { const s = await new ModHost().load(mk('xbad' + n, `export default function (api) { ${code} }`) as any); ok(s.state === 'error' && re.test(s.error ?? ''), `${label}（${s.error}）`); };
await bad(`api.content.locations([{ id: 'xbad${n}_l', name: 'x', type: 'town', map: 'tiannan', x: 5000, y: 10, desc: '' }])`, /出了地图/, '坐标出界被拒');
await bad(`api.content.npcs([{ id: 'xbad${n}_n', name: 'x', sex: 'm', home: 'nowhere', realm: 1, stage: 0 }])`, /住处/, '住处不存在被拒');
await bad(`api.ui.hotkey('m', () => {})`, /占用/, '游戏占用的键被拒');
await bad(`api.gfx.sprite('e:nope', { frames: { idle: ['x'] }, height: 50 })`, /没有敌人/, '换图目标不存在被拒');
await bad(`api.on('nope', () => {})`, /没有 nope 事件/, '不存在的事件被拒');

console.log('二、进游戏');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset();
host.attach(g); host.start();
(g as any).paused = false; g.modal = null;
const town = LOC_BY_ID.get('xian_town')!, cave = LOC_BY_ID.get('xian_cave')!;
ok((terrain as any).locZones.some((z: any) => z.id === 'xian_town'), '地形给新地点留出了地盘（不长树、有房子）');
ok(g.towns.canEnter(town) && g.towns.canEnter(cave), '新城镇、秘地都能「进入」');
g.teleport(town.x * WORLD_SCALE + 50, town.y * WORLD_SCALE + 50);
ok(g.nearbyLocation()?.id === 'xian_town', '走到跟前：显示为附近地点');
g.towns.open(town);
ok(g.modal?.kind === 'town', '进城：开城镇面板（坊市客栈照常有）');
const facs = HK.modx!.townFacs(town);
ok(facs.some((f) => f.name === '茶馆') && !facs.some((f) => f.name === '挖掘'), '城镇面板里有模组的「茶馆」，别处的事务不混进来');
ok(HK.modx!.townFacs(LOC_BY_ID.get('jiayuan') ?? base).some((f) => f.name === '茶馆'), 'where 写类型 city：所有城池都有');
facs.find((f) => f.name === '茶馆')!.act();
ok((g.modal as any)?.node?.speaker === '茶博士', '点茶馆：模组对话');
g.modal = null;
g.towns.open(cave);
const cn = (g.modal as any)?.node;
ok(cn?.speaker === '幽谷' && cn.options.some((o: any) => o.label === '挖掘'), '进秘地：一段对话，选项是模组给此地的事务');
cn.options.find((o: any) => o.label === '挖掘').act();
ok(g.hero.bag.some((b) => b.id === 'xian_ling' && b.n >= 2), '在秘地挖到仙灵草');
g.modal = null;

console.log('三、NPC');
const d = g.npcs.byId.get('xian_laodao')!;
ok(!!d && d.home === 'xian_town' && d.mod === 'xian' && d.favor === 55, '模组 NPC 进了众生名册，住在仙踪镇');
ok(g.npcs.look(d).robe === '#5a3a8a', '外貌覆盖生效');
g.teleport(d.x, d.y + 40);
for (let i = 0; i < 20; i++) { g.modal = null; g.update(1 / 30); }
const a = g.npcs.activeOf('xian_laodao') ?? g.npcs.summon('xian_laodao')!;
g.npcs.interact(a);
const t1 = (g.modal as any)?.node;
ok(t1?.text === '贫道等你多时了。' && t1.options.some((o: any) => o.label === '其他事'), '交谈：先说模组的开场，后面接「其他事」');
const t2 = t1.options[0].act();
t2.options[0].act();
ok(HK.modx!.quests().some((q) => q.title === '寻仙灵草' && q.need === 2), '对话里接下任务，任务栏有了');
ok(g.mapMarks().some((m) => m.name.startsWith('寻仙灵草')), '地图上标出任务目标');
const main = t1.options.find((o: any) => o.label === '其他事').act();
ok(main.text === '无量天尊。' && main.options.some((o: any) => o.label === '打听仙踪镇') && !main.options.some((o: any) => o.label === '不该出现'), '寻常交谈：招呼语、模组交谈选项（when 筛掉的不显示）');
g.hero.realm = 2; g.hero.stage = 0;
const rel = g.rel.talkOpts(a, '', () => main);
ok(rel.some((o) => o.label === '收其为徒'), 'apprentice：境界低于主角、好感够，可以收徒');
const ld = g.npcs.byId.get('lifeiyu');
if (ld) { const la = g.npcs.summon('lifeiyu')!; const mn = g.npcs.mainNode(la); ok(mn.options.some((o) => o.label === '打听仙踪镇'), '原著人物也能加交谈选项（who 指定）'); g.npcs.dismiss('lifeiyu'); }
g.modal = null;

console.log('四、事件与动作');
const F = (host as any).face(host.mods[0]);
ok(F.addFavor('xian_laodao', 99) === 85, '加好感（单次至多 30）');
ok(F.spar('xian_laodao') && g.combat.enemies.some((e) => e.npcId === 'xian_laodao' && e.spar), '发起切磋');
const se = g.combat.enemies.find((e) => e.npcId === 'xian_laodao')!;
g.combat.onSparEnd!(se, true);
g.hero.stage = 1; g.update(1 / 30);
g.usePill('pill_juqi');
g.brew(RECIPES[0]);
(g as any).onPlayerDown?.();
g.modal = null;
const ev = (g.ws as any).mods.xian.ev as string[];
for (const k of ['enter', 'talk', 'spar', 'realm', 'use', 'craft', 'down']) ok(ev.includes(k), `事件 ${k} 触发`);
g.hero.hp = 0.3; F.heal(0.5); ok(g.hero.hp === 0.8, '回血');
ok(F.addExp(10) === 10, '加修为');
ok(!F.teleport(-5, -5), '传送到地图外：拒绝');
F.fx('strike', g.player.x, g.player.y, { fx: 'lightning', color: '170,190,255' }); ok(g.combat.vfx.some((v: any) => v.kind === 'strike' && v.fx === 'lightning'), '放特效');
F.flash('255,0,0', 0.5); ok(g.modFlash.a === 0.5 && g.modFlash.c[0] === 1, '全屏闪光');
F.shake(0.4); ok(g.trauma >= 0.4, '震屏');
F.sound('s.wav'); ok(true, '播放音效（Node 里无声，不报错）');
let threw = false; try { F.sound('nope.mp3'); } catch { threw = true; } ok(threw, '不在包里的声音：报错');

console.log('五、界面');
const btn = HK.modx!.buttons().find((b) => b.glyph === '仙');
ok(!!btn && btn.badge === 2, '右下角按钮（带角标）');
btn!.go();
ok(g.modal?.kind === 'mod', '按钮打开模组面板');
const pn = HK.modx!.panel('xian', 'p')!;
ok(pn.title === '仙踪录' && (pn.nodes as any[]).length === 3, '面板内容由模组给出');
(pn.nodes as any[])[2].onClick();
ok((g.ws as any).mods.xian.clicked === 1, '面板按钮生效');
g.modal = null;
ok(HK.modx!.key('7') && (g.ws as any).mods.xian.hk === 1, '快捷键');
const list: any[] = []; HK.modx!.collect(list);
ok(list.length === 3 && HK.modx!.animating, '世界层绘制：三笔各自排进遮挡顺序');

console.log('六、存档、卸载');
g.save(1);
const g2 = new Game(terrain); g2.load('fanren_save_1');
const h2 = new ModHost(); (h2 as any).mods = host.mods; h2.attach(g2); h2.start();
ok(g2.npcs.byId.get('xian_laodao')?.favor === g.npcs.byId.get('xian_laodao')?.favor && g.npcs.byId.get('xian_laodao')!.favor >= 85, `读档：模组 NPC 的好感还在（${g2.npcs.byId.get('xian_laodao')?.favor}）`);
ok(HK.modx!.quests().some((q) => q.title === '寻仙灵草'), '读档：任务还在');
const h3 = new ModHost(); const g3 = new Game(terrain); g3.load('fanren_save_1'); h3.attach(g3); h3.start();
ok(!g3.npcs.byId.get('xian_laodao'), '模组没加载：它的 NPC 从名册撤下，游戏照常');

console.log(fails ? `${n - fails}/${n} 通过，${fails} 项失败` : `${n}/${n} 通过`);
process.exit(fails ? 1 : 0);
