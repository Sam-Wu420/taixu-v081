// 收官 H4（甲）：标题页换成新画风——玩家的第一眼。
//   画面：远山云海（far）→ 两层飘动的云带 → 御剑的人影 → 近景松崖（near）→ 花瓣与鹤群（Canvas），按层视差（鼠标 / 自动漂移）；
//         外圈一道鎏金细框和四角角花，像一幅装进漆框的画。
//   题字：《太虚问道录》五个字依次落墨，朱印「人界篇」随后盖下；菜单是一块块乌木漆牌，主按钮朱漆，依次浮现，悬停墨迹晕开。
//   动效只动 transform / opacity（见记忆 css-filter-animation-jank）；样式在 title.css。
// 模组契约（破了就坏）：菜单保留 `.title-menu > button.menu-btn`；文字为「继续仙途」的按钮、以「模组」开头的按钮都在
//   （shahe 在「继续仙途」后插「天工试场」，wanbao 用「万宝阁」顶替「模组」）；模组插进来的按钮也是 .menu-btn，样式自动跟上。
//   子弹窗的遮罩 / 外壳照挂旧类名 .modal-mask / .scroll-panel（清界等皮肤认它们）。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BRAND } from '../core/brand';
import { ModPanel } from './ModPanel';
import { modHost } from '../mod/host';
import { audio } from '../world/audio';
import { SettingsPanel } from './Panels';
import { CloudPanel } from './CloudPanel';
import { DAO_TIERS, type DaoTier } from '../world/worldstate';
import { DaoxinSys, DAO_KEY } from '../world/daoxin';
import { LacquerModal } from './kit';
import farUrl from '../assets/title/far.webp';
import nearUrl from '../assets/title/near.webp';
import heroUrl from '../assets/title/hero.webp';
import cornerUrl from '../assets/wanbao/corner.webp';
import { preloadUiArt } from './kit/preload';   // 第五轮
import './title.css';

// ---------------------------------------------------------------- 花瓣、竹叶与鹤群（Canvas）
// 鹤群：每隔二三十息从一侧飞过一行（V 字），翅膀上下扇；不用贴图，几笔线画出来
function Petals() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d');
    if (!g) return;
    let W = 0, H = 0, raf = 0, last = performance.now();
    const resize = () => { const d = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const N = Math.min(40, Math.round(W / 38));
    function spawn(init: boolean) {
      const leaf = Math.random() < 0.35;
      return {
        x: Math.random() * W * 1.2 - W * 0.1, y: init ? Math.random() * H : -20 - Math.random() * 60,
        vx: 14 + Math.random() * 26, vy: 20 + Math.random() * 28, r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 2.4,
        s: (leaf ? 8 : 4.5) + Math.random() * 5, leaf, ph: Math.random() * 10, a: 0.5 + Math.random() * 0.4,
      };
    }
    const ps = Array.from({ length: N }, () => spawn(true));
    type Crane = { x: number; y: number; vx: number; s: number; ph: number };
    let flock: Crane[] = [], nextFlock = 3.5;
    const newFlock = () => {
      const dir = Math.random() < 0.5 ? 1 : -1, n = 4 + Math.floor(Math.random() * 4), y0 = H * (0.1 + Math.random() * 0.22), s = Math.max(0.7, Math.min(1.3, W / 1400));
      flock = Array.from({ length: n }, (_, i) => ({ x: (dir > 0 ? -60 : W + 60) - dir * (i * 26 + Math.random() * 10) * s, y: y0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 11 * s + i * 6 * s, vx: dir * (46 + Math.random() * 6) * s, s: s * (0.85 + Math.random() * 0.3), ph: Math.random() * 6 }));
    };
    const crane = (c: Crane, t: number) => {
      const flap = Math.sin(t * 5.2 + c.ph), k = c.s, f = c.vx > 0 ? 1 : -1;
      g.save(); g.translate(c.x, c.y); g.scale(f * k, k);
      g.strokeStyle = 'rgba(40,36,30,0.78)'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();                       // 身子
      g.beginPath(); g.moveTo(9, 0); g.lineTo(13, -1.5); g.stroke();                    // 颈
      g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(-4, -10 * flap, -12, -8 * flap - 2); g.stroke();   // 翅
      g.beginPath(); g.moveTo(1, 0); g.quadraticCurveTo(-1, -12 * flap, -8, -11 * flap - 3); g.stroke();
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(-15, 1.5); g.stroke();                   // 腿
      g.fillStyle = 'rgba(176,40,30,0.85)'; g.fillRect(12, -3, 2, 2);                    // 丹顶
      g.restore();
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
      g.clearRect(0, 0, W, H);
      nextFlock -= dt;
      if (nextFlock <= 0 && !flock.length) { newFlock(); nextFlock = 22 + Math.random() * 14; }
      for (const c of flock) { c.x += c.vx * dt; c.y += Math.sin(t * 0.7 + c.ph) * 4 * dt; crane(c, t); }
      if (flock.length && flock.every((c) => c.x < -120 || c.x > W + 120)) flock = [];
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.ph += dt; p.x += (p.vx + Math.sin(p.ph * 1.3) * 18) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.y > H + 30 || p.x > W + 40) ps[i] = spawn(false);
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, 0.55 + 0.45 * Math.sin(p.ph * 2.2));
        g.globalAlpha = p.a;
        if (p.leaf) {
          g.fillStyle = 'rgba(70,98,72,0.85)';
          g.beginPath(); g.moveTo(-p.s, 0); g.quadraticCurveTo(0, -p.s * 0.35, p.s, 0); g.quadraticCurveTo(0, p.s * 0.35, -p.s, 0); g.fill();
        } else {
          g.fillStyle = 'rgba(240,186,190,0.92)';
          g.beginPath(); g.moveTo(0, -p.s); g.bezierCurveTo(p.s, -p.s * 0.6, p.s * 0.8, p.s * 0.6, 0, p.s); g.bezierCurveTo(-p.s * 0.8, p.s * 0.6, -p.s, -p.s * 0.6, 0, -p.s); g.fill();
        }
        g.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="petals" />;
}

// ---------------------------------------------------------------- 画面各层（视差）
/** 鼠标在画面上的位置（-1..1）写进根节点的 --mx / --my，各层按自己的深度挪一点；每帧至多写一次 */
function useParallax(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    let raf = 0, mx = 0, my = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;   // 触屏不跟手指晃（点按钮时画面乱动很晕），靠各层自己的慢漂
      mx = (e.clientX / window.innerWidth) * 2 - 1; my = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty('--mx', mx.toFixed(3)); el.style.setProperty('--my', my.toFixed(3)); });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [root]);
}

export function TitleScenery() {
  return (
    <div className="tt-scene" aria-hidden>
      <div className="tt-layer tt-far"><img src={farUrl} alt="" draggable={false} /></div>
      <div className="tt-layer tt-cloud c1"><i /><i /><i /></div>
      <div className="tt-layer tt-hero"><div className="tt-hero-fly"><img src={heroUrl} alt="" draggable={false} /></div></div>
      <div className="tt-layer tt-cloud c2"><i /><i /><i /></div>
      <div className="tt-layer tt-near"><img src={nearUrl} alt="" draggable={false} /></div>
      <Petals />
      <div className="tt-vignette" />
    </div>
  );
}

/** 外圈的鎏金细框和四角角花 */
function TitleFrame() {
  return (
    <div className="tt-frame" aria-hidden>
      {['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'tt-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}
    </div>
  );
}

// ---------------------------------------------------------------- 子弹窗
/** 立道心：三张道心牌，点一张即立下并开局 */
export function DaoPick({ cur, hasSave, steles, onPick, onClose }: { cur: DaoTier; hasSave: boolean; steles: ReturnType<typeof DaoxinSys.readAll>; onPick: (t: DaoTier) => void; onClose: () => void }) {
  return (
    <LacquerModal title="立道心" onClose={onClose} maskClass="modal-mask" className="scroll-panel settings tt-dao" width={980} height={720}>
      <div className="tt-modal-body lq-scroll">
        <p className="tt-lead">入道之前，先问自己一句：<b>这一世，你要走哪条路？</b><small>道心只可上调，不可下调——进了游戏也能砥砺，但回不了头。</small></p>
        <div className="tt-dao-cards">
          {DAO_TIERS.map((t, i) => (
            <button key={t.id} className={'tt-dao-card d-' + t.id + (cur === t.id ? ' on' : '')} style={{ ['--i' as string]: i } as CSSProperties} onClick={() => onPick(t.id)}>
              <span className="tt-dao-seal">{t.seal}</span>
              <b className="tt-dao-name">{t.name}</b>
              <span className="tt-dao-short">{t.short}</span>
              <span className="tt-dao-desc">{t.desc}</span>
              {t.warn && <span className="tt-dao-warn">{t.warn}</span>}
              {cur === t.id && <span className="tt-dao-last">上次所立</span>}
              <span className="tt-dao-go">立此道心</span>
            </button>
          ))}
        </div>
        {steles.length > 0 && (
          <p className="tt-note">
            江湖上有 <b>{steles.length}</b> 座旧碑。最近的一座立在{steles[0].place}：{steles[0].name}，{steles[0].realm}，{steles[0].year}年殁于{steles[0].killer}之手。
            {steles[0].legacy.stones > 0 || steles[0].legacy.items.length > 0 ? <>他的储物袋（灵石 {steles[0].legacy.stones}、{steles[0].legacy.items.length} 件物事）还在{steles[0].killer}手里——新一世里，碑与人都真在。</> : null}
          </p>
        )}
        {hasSave && <p className="tt-warn">已有一份修行记录。踏入仙途将覆盖原有的自动存档。</p>}
      </div>
    </LacquerModal>
  );
}

/** 前世碑林：每座碑一块石碑卡 */
export function Steles({ steles, onClose }: { steles: ReturnType<typeof DaoxinSys.readAll>; onClose: () => void }) {
  return (
    <LacquerModal title="前世碑林" onClose={onClose} maskClass="modal-mask" className="scroll-panel settings tt-steles" width={860} height={760}>
      <div className="tt-modal-body lq-scroll">
        <p className="tt-lead">此间共 <b>{steles.length}</b> 座旧碑。天道档没有备份，你倒下的地方就是最后一页。<small>碑在，凶手还在，储物袋也还在他手里。下一世去寻，或让风把名字磨平。</small></p>
        <div className="tt-stele-list">
          {steles.map((st, i) => {
            const tierName = DAO_TIERS.find((t) => t.id === st.tier)?.name ?? st.tier;
            return (
              <div key={st.id} className={'tt-stele d-' + st.tier} style={{ ['--i' as string]: Math.min(i, 8) } as CSSProperties}>
                <div className="tt-stele-head"><b>{st.name}之碑</b><span>{tierName}道心 · 享年 {st.age}</span></div>
                <div className="tt-stele-body">
                  <p>{st.realm} · {st.year}年殁于{st.killer}之手，碑立{st.place}。</p>
                  {st.bio.slice(0, 2).map((b, k) => <p key={k}>· {b}</p>)}
                  {st.notes.slice(0, 2).map((n, k) => <p key={'n' + k} className="note">随笔：{n}</p>)}
                  <p className={st.taken ? 'ok' : 'bad'}>遗物：灵石 {st.legacy.stones}、{st.legacy.items.length} 件物事 · {st.taken ? '已被取回' : '仍在凶手处'}</p>
                  {(st.offered || st.avenged) && <p className={st.avenged ? 'ok' : 'note'}>{st.offered ? '碑前三炷香已燃 · 前世残念已承' : '香炉冷着，无人来祭'}{st.avenged ? ' · 前世之仇已报' : ''}</p>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="tt-note">碑文与遗物来自本机存档。天道档封死了备份后门——想留档，下世别把道心砥砺到天道。</p>
      </div>
    </LacquerModal>
  );
}

export function About({ onClose }: { onClose: () => void }) {
  const Sec = ({ t, children }: { t: string; children: ReactNode }) => <section className="tt-about-sec"><h4>{t}</h4>{children}</section>;
  return (
    <LacquerModal title="关于" onClose={onClose} maskClass="modal-mask" className="scroll-panel settings tt-about" width={760} height={720}>
      <div className="tt-modal-body lq-scroll">
        <Sec t="你是谁">
          <p>你将扮演<b>苏寒</b>，从南荒梁国的一个山村少年起步，在完整的人界——<b>南荒、沧溟海、中州、天穹草原、极西之地</b>——自由闯荡。</p>
          <p>没有固定剧情。机缘、仇敌、知交与同道，全凭你自己的选择与随机际遇。</p>
        </Sec>
        <Sec t="这一版">
          <p><b>v0.8.1 · 世界首领与恩怨</b>：并入 B 线最新——噬魂魔尊·夜无赦周期降临南荒（三形态、二十五招，打败可学他的招、得魂镰）；恩怨重做三批（先手与热度、搜捕与目击、宗门调停、六种化解与生死斗、NPC 执法与追捕、找上门的人、固定搭档、夺宝局）；人脉录改成关系树卷轴。模组：万宝阁标出每个模组适配哪些版本；新旧两种模组包格式都能装。</p>
          <p><b>v0.8 · 斗法争锋</b>：敌方修士人人带储物袋、御使法器、撑灵气护罩，驾遁光追杀、残血亡命遁逃，斩杀后储物袋尽数掉落；成丹率按丹方上调。此外——开局溪谷里捡到一卷无字残卷——与人斗法时，对方施展的功法会一点点印进卷中，看得够多、挨得够多、躲得够多便能学会（法术书「问道残卷」页）；各派修士招式大扩充，元婴修士各有两门天阶神通、血过半燃魂再战，肉身被毁元婴遁出再战；灵草只看数量不计年份；金雷竹只在清音门出售；开宗立派后连灭两派会招来天下共讨；水墨人界三图、活世界众生、骗局与人心、道心三档、死亡即碑；模组接口五代。</p>
          <p>第一次进游戏会有一节「入门一课」带你走一遍；随时可跳过，在设置里能重看。</p>
        </Sec>
        <Sec t="声明">
          <p className="dim">本作为原创水墨修仙游戏，人物、地名与世界观均为原创。</p>
        </Sec>
      </div>
    </LacquerModal>
  );
}

export function QQ({ onClose }: { onClose: () => void }) {
  return (
    <LacquerModal title="玩家交流群" compact onClose={onClose} maskClass="modal-mask" className="scroll-panel settings qq-panel tt-qq" width={420} height={560}>
      <div className="tt-modal-body tt-qq-body">
        <img className="qq-code" src="./art/qq-qun.webp" alt={`${BRAND.name}玩家交流群 群号 1130830973`} />
        <p className="qq-tip">扫码入群 · 群号 <b>1130830973</b></p>
        <p className="qq-tip dim">bug、建议、催更都往群里丢；群里也会先发新版本。</p>
      </div>
    </LacquerModal>
  );
}

// ---------------------------------------------------------------- 标题页
type TitlePanel = '' | 'settings' | 'about' | 'dao' | 'steles' | 'qq' | 'mods' | 'cloud';
const TITLE_CHARS = ['太', '虚', '问', '道', '录'];

export function TitleScreen({ onNew, onContinue, onLoadKey, hasSave }: { onNew: () => void; onContinue: () => void; onLoadKey?: (key: string) => void; hasSave: boolean }) {
  const [panel, setPanel] = useState<TitlePanel>('');
  // 入场动画只放一次：之后模组插进来的按钮（天工试场、万宝阁）直接出现，不再等一轮依次浮现
  const [entering, setEntering] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  useParallax(root);
  useEffect(() => { const t = window.setTimeout(() => setEntering(false), 3200); return () => window.clearTimeout(t); }, []);
  useEffect(() => { const t = window.setTimeout(preloadUiArt, 2400); return () => window.clearTimeout(t); }, []);   // 第五轮：标题页闲着，把面板的底图、匾额、角花先拿下来
  const click = () => { audio.unlock(); audio.sfx('click'); };
  // 第五十一步「天道」：开局立道心（难度分层），并显示前世之碑
  const readTier = (): DaoTier => { try { return (localStorage.getItem(DAO_KEY) as DaoTier) || 'taixu'; } catch { return 'taixu'; } };
  const [cur, setCur] = useState<DaoTier>(readTier());
  const steles = DaoxinSys.readAll();
  const choose = (t: DaoTier) => {
    try { localStorage.setItem(DAO_KEY, t); } catch { /* */ }
    setCur(t); setPanel(''); audio.sfx('chime'); onNew();
  };
  const open = (p: TitlePanel) => () => { click(); setPanel(p); };
  return (
    <div ref={root} className={'title-screen' + (entering ? ' entering' : '')} onPointerDown={() => audio.unlock()}>
      <TitleScenery />
      <TitleFrame />
      <div className="title-content">
        <div className="title-logo">
          <i className="tt-ink-splash" />
          <h1 aria-label={BRAND.name}>{TITLE_CHARS.map((c, i) => <span key={i} className="tt-ch" style={{ ['--i' as string]: i } as CSSProperties}>{c}</span>)}</h1>
          <div className="title-sub">
            <span className="line" />
            <span className="seal">{BRAND.sub}</span>
            <span className="line r" />
          </div>
          <div className="title-tip">一介凡人 · 逆天修仙 · 万里人界 · 任尔纵横</div>
        </div>
        <nav className="title-menu">
          <button className="menu-btn primary" onClick={open('dao')}>踏入仙途</button>
          <button className="menu-btn" disabled={!hasSave} onClick={() => { click(); onContinue(); }}>继续仙途</button>
          {steles.length > 0 && <button className="menu-btn" onClick={open('steles')}>碑　　林<small>{steles.length}</small></button>}
          <button className="menu-btn" onClick={open('mods')}>模　　组{modHost.mods.length ? <small>{modHost.mods.length}</small> : null}</button>
          {onLoadKey && <button className="menu-btn" onClick={open('cloud')}>万民卷宗</button>}
          <button className="menu-btn" onClick={open('settings')}>设　　置</button>
          <button className="menu-btn" onClick={open('about')}>关　　于</button>
        </nav>
      </div>
      <div className="title-bottom">
        <button className="title-qq" data-qq="1130830973" onClick={open('qq')} title="点击查看群二维码">
          <span className="qq-label">玩家交流群</span>
          <span className="qq-num">1130830973</span>
          <span className="qq-scan">扫码</span>
        </button>
        <div className="title-footer">原创水墨修仙 · 太虚问道录 · v0.8.1</div>
      </div>

      {panel === 'mods' && <ModPanel onClose={() => setPanel('')} />}
      {panel === 'qq' && <QQ onClose={() => setPanel('')} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel('')} />}
      {panel === 'dao' && <DaoPick cur={cur} hasSave={hasSave} steles={steles} onPick={(t) => { click(); choose(t); }} onClose={() => setPanel('')} />}
      {panel === 'steles' && <Steles steles={steles} onClose={() => setPanel('')} />}
      {panel === 'about' && <About onClose={() => setPanel('')} />}
      {panel === 'cloud' && onLoadKey && <CloudPanel onClose={() => setPanel('')} onLoaded={(k) => { setPanel(''); onLoadKey(k); }} />}
      <TitleBtnDemo />
    </div>
  );
}

/** 截图 / 自检用：网址带 ?titledemo=mods 时假装装了两个模组，在菜单里插「天工试场」「万宝阁」（和 shahe / wanbao 插的 DOM 一样），看样式跟不跟得上 */
function TitleBtnDemo() {
  useEffect(() => {
    let on = false; try { on = new URLSearchParams(location.search).get('titledemo') === 'mods'; } catch { /* */ }
    if (!on) return;
    const menu = document.querySelector('.title-menu'); if (!menu) return;
    const btns = [...menu.querySelectorAll('button.menu-btn')] as HTMLButtonElement[];
    const cont = btns.find((b) => b.textContent!.replace(/[\s　]/g, '').startsWith('继续仙途'));
    const mod = btns.find((b) => b.textContent!.replace(/[\s　\d]/g, '').startsWith('模组'));
    const a = document.createElement('button'); a.className = 'menu-btn sh-title-btn'; a.textContent = '天工试场'; cont?.after(a);
    const b = document.createElement('button'); b.className = 'menu-btn wb-title-btn'; b.innerHTML = '万 宝 阁<small style="margin-left:8px;font-size:12px;color:#c9a24a">6</small>'; if (mod) { mod.style.display = 'none'; mod.after(b); }
    return () => { a.remove(); b.remove(); if (mod) mod.style.display = ''; };
  }, []);
  return null;
}
