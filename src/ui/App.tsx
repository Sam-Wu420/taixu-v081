import { useEffect, useRef, useState } from 'react';
import { Game, createGame } from '../world/game';
import { audio } from '../world/audio';
import { TitleScreen } from './Title';
import { Intro } from './Intro';
import { GameView } from './GameView';
import { ACTIVE_MAP, MAP_NAME, LOC_BY_ID, LOCATIONS } from '../data/world';
import { LANDMARKS } from '../data/landmarks';
import { modHost } from '../mod/host';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { isTouch } from '../core/touch';
import { GLStage } from '../gl/stage';
import ldFarUrl from '../assets/loading/far.webp';
import ldCloudUrl from '../assets/loading/cloud.webp';
import ldHeroUrl from '../assets/loading/hero.webp';
import cornerUrl from '../assets/wanbao/corner.webp';
import './title.css';

/** 加载画面下面的修行小贴士（键位从 keymap 取，手机一套说法）。收官 H4；r10 扩充了几条天地间的规矩，并且每隔几秒换一条 */
function loadingTips(): [string, string][] {
  const K = (id: string) => id === 'ascend' ? ascendLabel() : keyLabel(bindOf(id)), T = isTouch();
  const lore: [string, string][] = [
    ['洞府', '神识里寻到「灵脉」，便能在那里开辟洞府。'],
    ['道心', '开局所立的道心定下难度。天道档没有备份，倒下的地方就是最后一页。'],
    ['碑林', '前世倒下处会立一座碑——杀你的人还带着你的储物袋，这一世也真在。'],
    ['传闻', '江湖消息会说谎：听来的传闻未必是真，亲眼去看才算数。'],
    ['卷宗', '「万民卷宗」能把一世修行存到云上，换一台机器也接得上。'],
    ['入门', '第一次进游戏有「入门一课」带你走一遍，设置里随时能重看。'],
  ];
  const tips: [string, string][] = T ? [
    ['走动', '左下摇杆推一推就走，推到底是疾行。'],
    ['交谈', '走近一个人，点他，或点右侧的「谈」。'],
    ['施法', '右下法诀盘点一下就施放，自动锁定最近的敌人；点敌人或按『锁』锁定，再按换下一个，长按取消。'],
    ['近战', '点「架」进入近战架势：轻、崩、欺、追四个大按钮；长按「崩」拖动定方向。手里有兵器就用兵器。'],
    ['打坐', '「≡ 菜单」里的「坐」：打坐回气，修为也在涨。'],
    ['下一步', '左侧任务列最上面那条「下一步」，告诉你眼下该做什么。'],
  ] : [
    ['走动', `${K('up')}${K('left')}${K('down')}${K('right')} 走动，${K('run')} 疾行，滚轮拉近拉远镜头。`],
    ['交谈', `走到人跟前按 ${K('interact')} 交谈，按 ${K('gather')} 采集灵物。`],
    ['施法', `${K('slot1')}–${K('slot5')} 和鼠标左右键施法，${K('lock')} 换目标。`],
    ['近战', `按 ${K('brawl')}（或鼠标中键）进入近战架势：左键连拳、右键崩山（按住定方向，加 ${K('ascend')} 上挑）、${K('run')} 欺身。手里有兵器就用兵器。`],
    ['御剑', `${K('fly')} 御剑，按住 ${K('ascend')} / ${K('descend')} 升降。`],
    ['下一步', '左侧任务列最上面那条「下一步」，告诉你眼下该做什么。'],
  ];
  // 洗一遍牌：操作和规矩交错着来
  const all = [...tips, ...lore];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/**
 * 加载画面（r10 重做）：「御剑穿云」——宣纸远山缓缓后退，两层水墨云带一远一近从右往左掠过，苏寒御剑悬在中间轻轻起伏、风线擦身而过；
 * 下面一块漆框纸牌：真实的阶段文字、进度条（灵气一路走过去，头上一点亮）、每隔几秒换一条的修行小贴士。
 * 动效全是 CSS 的 transform / opacity（合成线程上跑，主线程忙着建世界时照样在动）；贴图是用户的 MCP 生成的（src/assets/loading/）。
 * out = 正在淡出（游戏画面已经在底下画好了）。模组契约：根节点类名 .loading 不变。
 */
export function Loading({ msg, p, out = false }: { msg: string; p: number; out?: boolean }) {
  const [tips] = useState(loadingTips);
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK((x) => x + 1), 6500); return () => clearInterval(t); }, []);
  const tip = tips[k % tips.length];
  const v = Math.max(0.02, Math.min(1, p));
  return (
    <div className={'loading' + (out ? ' out' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-valuetext={msg}>
      <div className="ld-scene" aria-hidden>
        <div className="ld-pan ld-far"><img src={ldFarUrl} alt="" draggable={false} /><img className="flip" src={ldFarUrl} alt="" draggable={false} /></div>
        <div className="ld-pan ld-cloud c-back"><img src={ldCloudUrl} alt="" draggable={false} /><img className="flip" src={ldCloudUrl} alt="" draggable={false} /></div>
        <div className="ld-flight">
          <div className="ld-wind">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>
          <div className="ld-hero"><i className="ld-trail" /><img src={ldHeroUrl} alt="" draggable={false} /></div>
        </div>
        <div className="ld-pan ld-cloud c-front"><img src={ldCloudUrl} alt="" draggable={false} /><img className="flip" src={ldCloudUrl} alt="" draggable={false} /></div>
        <div className="ld-veil" />
      </div>
      <div className="tt-frame ld-frame">{['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'tt-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}</div>
      <div className="loading-card">
        <div className="loading-text"><span className="loading-seal">道</span><span key={msg} className="ld-msg">{msg}</span></div>
        <div className="loading-bar"><i style={{ transform: `scaleX(${v.toFixed(3)})` }} /><b className="ld-head" style={{ transform: `translateX(${(v * 100).toFixed(1)}%)` }}><em /></b></div>
        <div key={k} className="loading-tip"><b>{tip[0]}</b>{tip[1]}</div>
      </div>
    </div>
  );
}
/** 加载画面的三张贴图先拿下来（标题页上调用：点进游戏那一下，画面立刻是完整的） */
export function preloadLoadingArt() {
  if (typeof Image === 'undefined') return;
  for (const u of [ldFarUrl, ldCloudUrl, ldHeroUrl]) { const im = new Image(); im.decoding = 'async'; im.src = u; void im.decode?.().catch(() => { /* */ }); keepArt.push(im); }
}
const keepArt: HTMLImageElement[] = [];
/** 等加载画面真正画上屏幕（两次 requestAnimationFrame），再接着干重活；页面在后台时 rAF 不走，最多等 150 毫秒 */
const nextPaint = () => new Promise<void>((res) => { let done = false; const ok = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(() => requestAnimationFrame(ok)); setTimeout(ok, 150); });
const mark = (n: string) => { try { performance.mark('ld:' + n); } catch { /* */ } };

// 第十六步：换图 = 重新载入。载入后据此自动读档 / 开新局
let bootResume: string | null = null, bootNew = false;
try { bootResume = sessionStorage.getItem('taixu.resume'); sessionStorage.removeItem('taixu.resume'); bootNew = sessionStorage.getItem('taixu.new') === '1'; sessionStorage.removeItem('taixu.new'); } catch { /* */ }

type Screen = 'title' | 'intro' | 'loading' | 'game';
const AUTO_NEW = (() => { try { return new URLSearchParams(location.search).get('auto') === 'new'; } catch { return false; } })();
const SHOT_LOADING = (() => { try { return new URLSearchParams(location.search).get('shot') === 'loading'; } catch { return false; } })();

// 后台预先生成世界（标题画面出现后即开始，进入游戏时通常已就绪）
// r10：进度分段（都是真实阶段）：模组 + 建世界 0–0.62 ┊ 着色器后台编译 0.62–0.86（按编好几个算；和建世界同时开编，多半已经编完）┊ 读档 / 开局 0.86–0.9 ┊ 游戏画面头几帧 0.9–1
let gamePromise: Promise<Game> | null = null;
let progressState = { p: 0, msg: bootResume !== null ? `虚空挪移，${MAP_NAME[ACTIVE_MAP]}的山川渐渐显现…` : '研墨铺纸…' };
const progressListeners = new Set<() => void>();
function setLoad(p: number, msg: string) {
  const np = Math.max(progressState.p, p);   // 进度只进不退（回标题重进时由 resetLoad 归位）
  if (np - progressState.p < 0.004 && msg === progressState.msg) return;
  progressState = { p: np, msg };
  progressListeners.forEach((f) => f());
}
function resetLoad(msg: string) { progressState = { p: 0, msg }; progressListeners.forEach((f) => f()); }
const SHADER_MSG = '凝练灵脉…';
function ensureGame() {
  if (!gamePromise) {
    // v0.55：先加载外挂模组（它们注册的法术、物品、妖兽要在建世界、读档之前就位）
    gamePromise = modHost.loadEnabled((name, i, n) => setLoad(0.02 * (i / n), `唤醒随身法宝：${name}（${i + 1}/${n}）…`)).catch((e) => console.warn('模组加载出错', e))
      .then(() => createGame((p, msg) => setLoad(0.02 + p * 0.6, msg)))
      .then((g) => { modHost.attach(g); return g; });
    // r10：同时在后台把着色器一个个发出去编（显卡进程里编、不占主线程，和建世界叠着做；标题页上就开始，点进来时多半已经编好）
    void GLStage.prepare().catch(() => { /* */ });
  }
  return gamePromise;
}

/** 订阅进度的加载画面（只有它跟着进度重画，标题页不跟着重画） */
function LoadingLive({ out }: { out?: boolean }) {
  const [s, set] = useState(progressState);
  useEffect(() => { const f = () => set(progressState); progressListeners.add(f); f(); return () => { progressListeners.delete(f); }; }, []);
  return <Loading msg={s.msg} p={s.p} out={out} />;
}

/** r10：游戏画面头几帧要编立体场景的着色器、建分块地面、立板图集：加载画面盖在上面，连续这么多帧顺了才淡出 */
const WARM_FRAMES = 8, WARM_MIN_MS = 600, WARM_MAX_MS = 15000, SEA_MAX_MS = 45000, FADE_MS = 700;

export function App() {
  // r10：换图重载、?auto=new（天工试场「新局直接入阵」也走这条）一上来就是加载画面，不先闪一下标题页
  const [screen, setScreen] = useState<Screen>(() => (bootResume !== null || AUTO_NEW ? 'loading' : 'title'));
  const [game, setGame] = useState<Game | null>(null);
  // r10：veil = 游戏已经挂上、加载画面还盖着（等头几帧顺了）；fading = 正在淡出
  const [veil, setVeil] = useState(false);
  const [fading, setFading] = useState(false);
  const mode = useRef<'new' | 'continue'>('new');

  useEffect(() => {
    // 让标题动画先跑起来，再在后台生成世界
    const t = setTimeout(() => ensureGame(), bootResume !== null || bootNew ? 0 : 900);
    const t2 = setTimeout(preloadLoadingArt, bootResume !== null || bootNew ? 0 : 400);
    if (bootResume !== null) { mode.current = 'continue'; enterGame(bootResume || undefined); }
    else if (bootNew) { mode.current = 'new'; setScreen('intro'); }
    // 调试 / 自动化测试：?auto=new 直接进入新游戏
    if (bootResume === null && AUTO_NEW) { mode.current = 'new'; enterGame(); }
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  useEffect(() => { audio.setMode(screen === 'game' ? 'world' : 'title'); }, [screen]);

  // r10：游戏挂上以后盯着帧：至少 WARM_MIN_MS，且连续 WARM_FRAMES 帧间隔都在 70 毫秒以内（首帧编着色器、建地面那几下卡顿都过去了），再淡出加载画面
  useEffect(() => {
    if (screen !== 'game' || !game || !veil || fading) return;
    let raf = 0, good = 0, last = 0; const t0 = performance.now(), f0 = game.frameNo;
    const tick = (t: number) => {
      const dt = last ? t - last : 0; last = t;
      // 存档就停在绝域里：海面那份后期着色器还在后台编，多盖一会儿（最多 SEA_MAX_MS），省得海色在眼前突然冒出来
      const sea = !!game.renderer?.stage?.busy;
      if (game.frameNo > f0 + 1 && dt > 0 && dt < 70 && !sea) good++; else if (dt >= 70 || sea) good = 0;
      setLoad(0.9 + 0.1 * Math.min(1, good / WARM_FRAMES), sea ? '海天渐显…' : '云开雾散…');
      if ((good >= WARM_FRAMES && t - t0 >= WARM_MIN_MS) || t - t0 > (sea ? SEA_MAX_MS : WARM_MAX_MS)) { mark('ready'); setFading(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, game, veil, fading]);
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => { mark('gone'); setVeil(false); setFading(false); }, FADE_MS);
    return () => clearTimeout(t);
  }, [fading]);

  const enterGame = async (key?: string) => {
    mark('enter');
    setVeil(false); setFading(false);
    setScreen('loading');
    // r10：先让加载画面真正画上屏幕、合成层上的动画转起来，再干重活（以前这一步和读档、建渲染器挤在同一个任务里，加载画面根本没机会画出来）
    await nextPaint(); mark('painted');
    const g = await ensureGame(); mark('world');
    // 着色器：后台并行编译，按编好几个推进度；不支持并行编译的浏览器直接往下走（进游戏时同步编）
    setLoad(0.62, SHADER_MSG);
    await GLStage.prepare((d, n) => setLoad(0.62 + 0.24 * (n ? d / n : 1), SHADER_MSG)); mark('shader');
    setLoad(0.86, mode.current === 'continue' ? '寻回旧日足迹…' : '唤醒众生…');
    await nextPaint();
    if (mode.current === 'continue') { if (!g.load(key) && bootResume !== null) g.reset(); }
    else {
      g.reset();
      // 收官 I：全新开局自动开始「入门一课」。?auto=new（自动化、试玩入口、shahe「新局直接入阵」）不弹，除非带 &tutorial=1；
      // 装了自带引导的清界模组时由 tutorial 自己让位
      const q = new URLSearchParams(location.search);
      if (q.get('auto') !== 'new' || q.get('tutorial') === '1') g.tutorial.begin();
    }
    // ?auto=new 用过一次就从网址上去掉：不然之后点「重新载入」（模组面板、万宝阁）会直接再开一局新游戏
    try { const u = new URL(location.href); if (u.searchParams.has('auto')) { u.searchParams.delete('auto'); history.replaceState(history.state, '', u.toString()); } } catch { /* */ }
    // r10：撼山客的落脚点（只看地形，按图缓存；以前是小地图头一回画的时候现算，一秒多）放在加载画面里算掉
    try { g.hanshan.stops(); } catch { /* */ }
    mark('state');
    g.tutorial.modIds = () => modHost.mods.map((m) => m.b.manifest.id);   // 收官 I：装了清界（自带引导）就让位
    modHost.attach(g); modHost.start();
    (window as any).__game = g; (window as any).__modHost = modHost; (window as any).__taixuLoc = (id: string) => LOC_BY_ID.get(id); (window as any).__taixuLocs = () => LOCATIONS;
    (window as any).__taixuLM = () => LANDMARKS.filter((L) => L.scenic);
    setLoad(0.9, '云开雾散…');
    await nextPaint();
    setVeil(true);
    setGame(g);
    setScreen('game');
    mark('mount');
  };

  const onNew = () => {
    audio.unlock(); audio.sfx('open');
    // 新的一局总是从南荒青霞谷开始：若当前载入的是别的地图，先切回南荒
    if (ACTIVE_MAP !== 'tiannan') { try { localStorage.setItem('taixu.map', 'tiannan'); sessionStorage.setItem('taixu.new', '1'); location.reload(); return; } catch { /* */ } }
    mode.current = 'new';

    setScreen('intro');
  };
  const onContinue = () => {
    audio.unlock(); audio.sfx('open');
    mode.current = 'continue';
    enterGame();
  };

  // 收官 H4：标题页的「万民卷宗」取回一页后直接读它
  const onLoadKey = (key: string) => { audio.unlock(); audio.sfx('open'); mode.current = 'continue'; enterGame(key); };
  if (SHOT_LOADING) return <Loading msg="凝练灵脉…" p={0.72} />;   // 截图用：加载画面一闪而过，?shot=loading 让它停住
  if (screen === 'title') return <TitleScreen onNew={onNew} onContinue={onContinue} onLoadKey={onLoadKey} hasSave={Game.hasSave()} />;
  if (screen === 'intro') return <Intro onDone={() => enterGame()} />;
  // r10：加载画面和游戏画面放在同一层的两格里（第一格游戏、第二格加载画面）——游戏挂上以后加载画面还盖在上面、
  // 是同一个组件实例（小贴士、动画不重来），头几帧顺了再淡出
  if (screen === 'loading' || !game) return <>{null}<LoadingLive /></>;
  // v0.52.9：回标题必须把游戏状态彻底归零——v0.52.8 之前只切界面，
  // 若此刻正停在洞府里（inCave=true），下次「继续游戏」仍会把洞府场景盖在世界上，
  // 一动就是一个黑屏，看着像游戏坏了。这里连同淡出遮罩、顿帧、相机一起清干净。
  const onExit = () => {
    try {
      game.leaveCave?.();
      game.closeModal?.(true);
      game.paused = false; game.combat.fade = 0; game.hitStop = 0; game.slowT = 0;
      game.destination = null;
      game.renderer?.resetStill();
    } catch { /* 退出路上出岔子也不能卡在标题 */ }
    setGame(null); setScreen('title'); setVeil(false); setFading(false); resetLoad('研墨铺纸…');
  };
  return <><GameView game={game} onExit={onExit} />{veil && <LoadingLive out={fading} />}</>;
}
