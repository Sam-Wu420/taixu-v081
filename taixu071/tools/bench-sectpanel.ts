// 宗门面板"点了半天才反应"的定位：把面板一次渲染、以及每个动作的耗时量出来
// 用法：npx tsx tools/bench-sectpanel.ts
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
await import('./env');
const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { SectPanel } = await import('../src/ui/SectPanel');
const { LOC_BY_ID } = await import('../src/data/world');
const { REALMS } = await import('../src/data/realms');
const C = await import('../src/world/cultivation');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const hf = LOC_BY_ID.get('huangfeng')!;
g.hero.realm = 4; g.hero.stage = 0;
C.addItem(g.hero, 'mat_lingshi', 500000);
const mkDisc = (i: number) => ({
  id: i + 1, name: '弟子' + i, sex: (i % 2 ? 'm' : 'f') as 'm' | 'f', age: 20 + (i % 60),
  root: 1 + (i % 5), realm: i % 5 === 0 ? 4 : i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
  stage: i % 4, exp: (i % 10) / 10, loyal: 30 + (i % 60), rank: i % 4, job: (['xiu', 'ye', 'shou', 'li'] as const)[i % 4],
  joined: 0, arts: i % 7,
});
(g.ws as any).mySect = {
  name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: 0,
  fame: 700, stones: 5e6, tribute: 1200, ds: Array.from({ length: 200 }, (_, i) => mkDisc(i)), seq: 300, apps: [], lib: [], gf: g.hero.gongfa,
  halls: { lib: 3, dan: 3, zhen: 3, ling: 3 }, open: true, minRoot: 2, auto: false,
  lastM: Math.floor(g.day / 30), lastTeach: -999, log: Array.from({ length: 60 }, (_, i) => ({ d: i * 30, t: '第 ' + i + ' 条宗门杂事' })), gifts: [{ id: 'pill_juqi', n: 3 }], wins: 2, losses: 1,
};
(g.ws.mySect as any).apps = Array.from({ length: 12 }, (_, i) => ({ name: '求仙者' + i, sex: 'm', age: 18, root: 1 + (i % 5), realm: i % 3, stage: 0, until: g.day + 60, note: '山下凡人子弟' }));
g.mysect.sync(); g.mysect.daily(0);

const ms = (f: () => void, n = 1) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t0) / 1e6 / n; };
type Nav = 'overview' | 'roster' | 'jobs' | 'apps' | 'library' | 'build' | 'vault' | 'guard' | 'war' | 'rules' | 'arts' | 'log';
const render = (nav: Nav) => renderToString(React.createElement(SectPanel, { game: g, onClose() {}, initial: nav }));
render('overview'); render('roster');

console.log(`门人 ${g.ws.mySect!.ds.length} 人 · 求拜 ${g.ws.mySect!.apps.length} 人 · 大事记 ${g.ws.mySect!.log.length} 条\n`);
console.log('一次 React 渲染（ms）：');
for (const nav of ['overview', 'roster', 'jobs', 'apps', 'vault'] as Nav[]) console.log(`  ${nav.padEnd(9)} ${ms(() => render(nav), 5).toFixed(2)}`);

console.log('\n单次动作（ms）：');
const S = g.mysect, d = g.ws.mySect!.ds[3];
const acts: [string, () => void][] = [
  ['指点', () => { d.t = undefined; S.guide(d); }],
  ['赐丹', () => { d.exp = 0; S.grantPill(d); }],
  ['助其冲关', () => { d.realm = 1; d.stage = REALMS[1].stages.length - 1; d.exp = 1; S.breakthrough(d); }],
  ['开坛讲法', () => { g.ws.mySect!.lastTeach = -999; S.teach(); }],
  ['汲取气运', () => { g.ws.mySect!.qi = S.qiCap(); S.claimQi(); }],
  ['收取供奉', () => { g.ws.mySect!.tribute = 500; S.collect(); }],
  ['拨灵石', () => S.deposit(1000)],
  ['支取灵石', () => S.withdraw(1000)],
  ['扩建殿宇', () => { g.ws.mySect!.halls.lib = 1; S.buildHall('lib'); }],
  ['大阵充能', () => { g.ws.mySect!.zhenE = 0; S.chargeZhen(); }],
  ['尽数收下', () => { g.ws.mySect!.apps = Array.from({ length: 12 }, (_, i) => ({ name: 'x' + i, sex: 'm', age: 18, root: 4, realm: 1, stage: 0, until: g.day + 60, note: '' })); S.takeAll('root3'); }],
  ['换抽成档', () => S.cycleCut()],
  ['updateUI(true)', () => g.updateUI(true)],
  ['mysect.daily(0)', () => S.daily(0)],
];
for (const [n, f] of acts) { f(); console.log(`  ${n.padEnd(14)} ${ms(f, 5).toFixed(3)}`); }

console.log('\n一次 updateUI 之后 HUD 的订阅者数量：', (g as any).uiListeners?.size ?? '(未暴露)');
