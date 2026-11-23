import { useEffect, useRef, useState } from 'react';
import { Game, createGame } from '../world/game';
import { audio } from '../world/audio';
import { TitleScreen } from './Title';
import { Intro } from './Intro';
import { GameView } from './GameView';
import { ACTIVE_MAP, MAP_NAME, LOC_BY_ID, LOCATIONS } from '../data/world';
import { LANDMARKS } from '../data/landmarks';
import { modHost } from '../mod/host';
import { unzipSave } from '../world/savezip';
import { loadBld2 } from '../gfx/bldTex2';

// 第十六步：换图 = 重新载入。载入后据此自动读档 / 开新局
let bootResume: string | null = null, bootNew = false;
try { bootResume = sessionStorage.getItem('fanren.resume'); sessionStorage.removeItem('fanren.resume'); bootNew = sessionStorage.getItem('fanren.new') === '1'; sessionStorage.removeItem('fanren.new'); } catch { /* */ }

type Screen = 'title' | 'intro' | 'loading' | 'game';

// 后台预先生成世界（标题画面出现后即开始，进入游戏时通常已就绪）
let gamePromise: Promise<Game> | null = null;
let progressState = { p: 0, msg: bootResume !== null ? `虚空挪移，${MAP_NAME[ACTIVE_MAP]}的山川渐渐显现…` : '研墨铺纸…' };
const progressListeners = new Set<() => void>();
function ensureGame() {
  if (!gamePromise) {
    // v0.55：先加载外挂模组（它们注册的法术、物品、妖兽要在建世界、读档之前就位）
    gamePromise = modHost.loadEnabled().catch((e) => console.warn('模组加载出错', e)).then(() => createGame((p, msg) => {
      progressState = { p, msg };
      progressListeners.forEach((f) => f());
    })).then((g) => { progressState = { p: 1, msg: '画卷已成' }; progressListeners.forEach((f) => f()); modHost.attach(g); return g; });
  }
  return gamePromise;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState(progressState);
  const [worldReady, setWorldReady] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const mode = useRef<'new' | 'continue'>('new');

  useEffect(() => {
    const f = () => setProgress(progressState);
    progressListeners.add(f);
    // 让标题动画先跑起来，再在后台生成世界与预载建筑画材
    const t = setTimeout(() => { ensureGame(); void loadBld2(); }, bootResume !== null || bootNew ? 0 : 900);
    if (bootResume !== null) { mode.current = 'continue'; enterGame(bootResume || undefined); }
    else if (bootNew) { mode.current = 'new'; setScreen('intro'); }
    // 调试 / 自动化测试：?auto=new 直接进入新游戏
    if (bootResume === null && new URLSearchParams(location.search).get('auto') === 'new') { mode.current = 'new'; enterGame(); }
    return () => { progressListeners.delete(f); clearTimeout(t); };
  }, []);

  useEffect(() => { audio.setMode(screen === 'game' ? 'world' : 'title'); }, [screen]);
  useEffect(() => {
    if (!worldReady) { setOverlayGone(false); return; }
    const t = setTimeout(() => setOverlayGone(true), 420);
    return () => clearTimeout(t);
  }, [worldReady]);

  const enterGame = async (key?: string) => {
    setWorldReady(false);
    setOverlayGone(false);
    setScreen('loading');
    const bldReady = Promise.race([loadBld2(), new Promise<void>((r) => setTimeout(r, 2500))]);
    const [g] = await Promise.all([ensureGame(), bldReady]);
    if (mode.current === 'continue') { if (!g.load(key) && bootResume !== null) g.reset(); }
    else { g.reset(); }
    modHost.attach(g); modHost.start();
    (window as any).__game = g; (window as any).__modHost = modHost; (window as any).__fanrenLoc = (id: string) => LOC_BY_ID.get(id); (window as any).__fanrenLocs = () => LOCATIONS;
    (window as any).__unzipSave = unzipSave;   // 调试用：控制台里读压缩存档
    (window as any).__fanrenLM = () => LANDMARKS.filter((L) => L.scenic);
    setGame(g);
    setScreen('game');
  };

  const onNew = () => {
    audio.unlock(); audio.sfx('open');
    // 新的一局总是从人界南荒青霞谷开始：若当前载入的是别的地图，先切回人界
    if (ACTIVE_MAP !== 'renjie') { try { localStorage.setItem('fanren.map', 'renjie'); sessionStorage.setItem('fanren.new', '1'); location.reload(); return; } catch { /* */ } }
    mode.current = 'new';
    
    setScreen('intro');
  };
  const onContinue = () => {
    audio.unlock(); audio.sfx('open');
    mode.current = 'continue';
    enterGame();
  };

  if (screen === 'title') return <TitleScreen onNew={onNew} onContinue={onContinue} hasSave={Game.hasSave()} />;
  if (screen === 'intro') return <Intro onDone={() => enterGame()} />;
  // v0.52.9：回标题必须把游戏状态彻底归零——v0.52.8 之前只切界面，
  // 若此刻正停在洞府里（inCave=true），下次「继续游戏」仍会把洞府场景盖在世界上，
  // 一动就是一个黑屏，看着像游戏坏了。这里连同淡出遮罩、顿帧、相机一起清干净。
  const onExit = () => {
    try {
      game?.leaveCave?.();
      game?.closeModal?.(true);
      if (game) {
        game.paused = false; game.uiHold = false; game.combat.fade = 0; game.hitStop = 0; game.slowT = 0;
        game.destination = null;
        game.renderer?.resetStill();
      }
    } catch { /* 退出路上出岔子也不能卡在标题 */ }
    setWorldReady(false); setOverlayGone(false);
    setGame(null); setScreen('title');
  };
  const showLoadingOverlay = screen === 'loading' || !game || !overlayGone;
  return (
    <>
      {screen === 'game' && game && <GameView game={game} onExit={onExit} onReady={() => setWorldReady(true)} />}
      {showLoadingOverlay && (
        <div className={'loading' + (worldReady && screen === 'game' ? ' done' : '')}>
          <div className="loading-ink" />
          <div className="loading-text">{screen === 'game' && !worldReady ? '笔落山川成…' : progress.msg}</div>
          <div className="loading-bar"><div style={{ width: `${Math.round(progress.p * 100)}%` }} /></div>
        </div>
      )}
    </>
  );
}
