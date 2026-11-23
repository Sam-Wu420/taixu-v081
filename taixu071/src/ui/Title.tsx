import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../core/brand';
import { ModPanel } from './ModPanel';
import { modHost } from '../mod/host';
import { audio } from '../world/audio';
import { SettingsPanel } from './Panels';
import { DAO_TIERS, DaoTier } from '../world/worldstate';
import { DaoxinSys, DAO_KEY } from '../world/daoxin';
// 标题背景图：单文件构建内联成 data URL，瘦身构建输出成 assets/*.webp（?inline 由各自的 vite 插件处理）
import titleBgUrl from '../assets/title.webp?inline';

// 飘落的花瓣/竹叶（Canvas）
function Petals() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d')!;
    let W = 0, H = 0, raf = 0, last = performance.now();
    const resize = () => { const d = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const N = Math.min(46, Math.round(W / 34));
    const ps = Array.from({ length: N }, () => spawn(true));
    function spawn(init: boolean) {
      const leaf = Math.random() < 0.35;
      return {
        x: Math.random() * W * 1.2 - W * 0.1, y: init ? Math.random() * H : -20 - Math.random() * 60,
        vx: 14 + Math.random() * 26, vy: 22 + Math.random() * 30, r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 2.4,
        s: (leaf ? 9 : 5) + Math.random() * 6, leaf, ph: Math.random() * 10, a: 0.55 + Math.random() * 0.4,
      };
    }
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      g.clearRect(0, 0, W, H);
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
          const rg = g.createRadialGradient(0, 0, 0, 0, 0, p.s);
          rg.addColorStop(0, 'rgba(255,236,236,1)'); rg.addColorStop(1, 'rgba(232,160,170,0.85)');
          g.fillStyle = rg;
          g.beginPath(); g.moveTo(0, -p.s); g.bezierCurveTo(p.s, -p.s * 0.6, p.s * 0.8, p.s * 0.6, 0, p.s); g.bezierCurveTo(-p.s * 0.8, p.s * 0.6, -p.s, -p.s * 0.6, 0, -p.s); g.fill();
        }
        g.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="petals" style={{ width: '100%', height: '100%' }} />;
}

export function TitleScreen({ onNew, onContinue, hasSave }: { onNew: () => void; onContinue: () => void; hasSave: boolean }) {
  const [panel, setPanel] = useState<'' | 'settings' | 'about' | 'confirm' | 'dao' | 'steles' | 'mods'>('');
  const click = () => { audio.unlock(); audio.sfx('click'); };
  // 第五十一步「天道」：开局立道心（难度分层），并显示前世之碑
  const readTier = (): DaoTier => { try { return (localStorage.getItem(DAO_KEY) as DaoTier) || 'fanren'; } catch { return 'fanren'; } };
  const [cur, setCur] = useState<DaoTier>(readTier());
  // 标题背景：图片版（src/assets/title.webp）/ 程序化 SVG 版，右下角一键切换并记住选择。
  // 图片加载失败时自动回退到程序化版，避免开屏一片黑。
  const [bgArt, setBgArt] = useState<boolean>(() => {
    try { return localStorage.getItem('fanren.titlebg') !== 'code'; } catch { return true; }
  });
  const [artOk, setArtOk] = useState(true);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setArtOk(true);
    im.onerror = () => setArtOk(false);
    im.src = titleBgUrl;
  }, []);
  const showArt = bgArt && artOk;
  const toggleBg = () => {
    audio.sfx('click');
    setBgArt((v) => {
      const n = !v;
      try { localStorage.setItem('fanren.titlebg', n ? 'art' : 'code'); } catch { /* */ }
      return n;
    });
  };
  const steles = DaoxinSys.readAll();
  const choose = (t: DaoTier) => {
    try { localStorage.setItem(DAO_KEY, t); } catch { /* */ }
    setCur(t); setPanel(''); audio.sfx('chime'); onNew();
  };
  return (
    <div className="title-screen" onPointerDown={() => audio.unlock()}>
      <div className="title-bg" aria-hidden="true" style={showArt ? { backgroundImage: `url(${titleBgUrl})` } : undefined}>
        {!showArt && (
        <svg className="title-landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          <defs><linearGradient id="title-sky" x2="0" y2="1"><stop stopColor="#778b81"/><stop offset=".55" stopColor="#bdc2ab"/><stop offset="1" stopColor="#59685e"/></linearGradient><radialGradient id="title-sun"><stop stopColor="#f2e7bf" stopOpacity=".9"/><stop offset="1" stopColor="#f2e7bf" stopOpacity="0"/></radialGradient></defs>
          <rect width="1600" height="900" fill="url(#title-sky)"/><circle cx="1140" cy="245" r="190" fill="url(#title-sun)"/>
          <path fill="#a8b2a4" d="M0 565L140 380 245 460 410 240 565 445 720 290 870 470 1020 310 1170 480 1330 280 1600 530V900H0Z"/>
          <path fill="#7a9085" d="M0 640L160 465 300 570 450 370 590 555 780 400 950 600 1145 395 1300 570 1450 420 1600 585V900H0Z"/>
          <path fill="#526c61" d="M0 745L190 560 370 700 520 520 710 730 900 505 1090 700 1270 555 1450 710 1600 590V900H0Z"/>
          <path fill="#354c43" d="M0 810Q180 700 340 800T710 780T1090 805T1600 770V900H0Z"/>
          <path fill="none" stroke="#d2d8c7" strokeOpacity=".45" strokeWidth="4" d="M0 655Q300 620 560 660T1100 640T1600 660M0 740Q300 705 610 740T1200 730T1600 750"/>
        </svg>
        )}
      </div>
      <div className="mist-layer mist-b" />
      <div className="title-mist" />
      <div className="mist-layer mist-a" />
      <Petals />
      <div className="title-content">
        <div className="title-logo">
          <h1>{BRAND.name}</h1>
          <div className="title-sub">
            <span className="line" />
            <span className="seal">{BRAND.sub}</span>
            <span className="line" />
          </div>
          <div className="title-tip">一介凡人 · 逆天修仙 · 万里人界 · 任尔纵横</div>
        </div>
        <div className="title-menu">
          <button className="menu-btn" onClick={() => { click(); setPanel('dao'); }}>踏入仙途</button>
          <button className="menu-btn" disabled={!hasSave} onClick={() => { click(); onContinue(); }}>继续仙途</button>
          {steles.length > 0 && (
            <button className="menu-btn" onClick={() => { click(); setPanel('steles'); }}>碑　　林<small style={{ marginLeft: 8, fontSize: 12, color: '#c9a24a' }}>{steles.length}</small></button>
          )}
          <button className="menu-btn" onClick={() => { click(); setPanel('mods'); }}>模　　组{modHost.mods.length ? <small style={{ marginLeft: 8, fontSize: 12, color: '#c9a24a' }}>{modHost.mods.length}</small> : null}</button>
          <button className="menu-btn" onClick={() => { click(); setPanel('settings'); }}>设　　置</button>
          <button className="menu-btn" onClick={() => { click(); setPanel('about'); }}>关　　于</button>
        </div>
      </div>
      <div className="title-footer">{BRAND.id === 'taixu'
        ? '太虚问道录 · 寰宇篇 · v0.71：问道残卷观招偷学 · 元婴肉身被毁元婴遁出再战 · 修士残血亡命遁逃 · 灵草只看数量 · 人界众生皆可当面交谈'
        : '原创水墨修仙 · v0.71：问道残卷观招偷学 · 元婴肉身被毁元婴遁出再战 · 修士残血亡命遁逃 · 灵草只看数量 · 模组接口五代'}</div>

      {panel === 'mods' && <ModPanel onClose={() => setPanel('')} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel('')} />}
      {panel === 'confirm' && (
        <div className="modal-mask" onClick={() => setPanel('')}>
          <div className="scroll-panel settings" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head"><div className="panel-title">重入仙途</div></div>
            <p style={{ lineHeight: 1.9, fontSize: 15 }}>已有一份修行记录。重新开始将<b style={{ color: 'var(--vermilion)' }}>覆盖原有存档</b>，确定要从头来过吗？</p>
            <div className="loc-actions">
              <button className="ink-btn ghost" onClick={() => setPanel('')}>再想想</button>
              <button className="ink-btn" onClick={() => { setPanel(''); onNew(); }}>从头开始</button>
            </div>
          </div>
        </div>
      )}
      {panel === 'dao' && (
        <div className="modal-mask" onClick={() => setPanel('')}>
          <div className="scroll-panel settings" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head"><div className="panel-title">立道心</div><button className="close-btn" onClick={() => setPanel('')}>×</button></div>
            <p style={{ lineHeight: 1.9, fontSize: 14.5 }}>入道之前，先问自己一句：<b>这一世，你要走哪条路？</b><br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>道心只可上调，不可下调——进了游戏也能砥砺，但回不了头。</span></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
              {DAO_TIERS.map((t) => (
                <button key={t.id} onClick={() => { click(); choose(t.id); }}
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                    background: cur === t.id ? 'rgba(201,162,74,0.14)' : 'rgba(90,72,48,0.06)',
                    border: `1px solid ${cur === t.id ? 'rgba(201,162,74,0.55)' : 'rgba(120,100,70,0.22)'}`, borderRadius: 4 }}>
                  <span style={{ flex: '0 0 auto', width: 30, height: 30, lineHeight: '30px', textAlign: 'center', fontFamily: '"Ma Shan Zheng","STKaiti",serif', fontSize: 19, color: t.id === 'tiandao' ? '#b8443a' : t.id === 'fanren' ? '#c9a24a' : '#5f8a6a', border: '1px solid rgba(120,100,70,0.35)', borderRadius: 3 }}>{t.seal}</span>
                  <span style={{ flex: 1 }}>
                    <b style={{ fontSize: 15.5, letterSpacing: '.08em' }}>{t.name}<small style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 12.5 }}>　{t.short}</small></b>
                    <i style={{ display: 'block', fontStyle: 'normal', fontSize: 12.6, lineHeight: 1.75, color: 'var(--ink-soft)', marginTop: 3 }}>{t.desc}</i>
                    {t.warn && <u style={{ display: 'block', textDecoration: 'none', fontSize: 12, color: '#b8443a', marginTop: 3 }}>⚠ {t.warn}</u>}
                  </span>
                </button>
              ))}
            </div>
            {steles.length > 0 && (
              <p style={{ lineHeight: 1.85, fontSize: 12.8, color: 'var(--ink-soft)', borderTop: '1px dashed rgba(120,100,70,0.3)', paddingTop: 8 }}>
                江湖上有 <b style={{ color: '#b8c8e8' }}>{steles.length}</b> 座旧碑。最近的一座立在{steles[0].place}：{steles[0].name}，{steles[0].realm}，{steles[0].year}年殁于{steles[0].killer}之手。<br />
                {steles[0].legacy.stones > 0 || steles[0].legacy.items.length > 0 ? <>他的储物袋（灵石 {steles[0].legacy.stones}、{steles[0].legacy.items.length} 件物事）还在{steles[0].killer}手里——新一世里，碑与人都真在。</> : null}
              </p>
            )}
            {hasSave && <p style={{ fontSize: 12.5, color: 'var(--vermilion)' }}>已有一份修行记录。踏入仙途将覆盖原有存档。</p>}
          </div>
        </div>
      )}
      {panel === 'steles' && (
        <div className="modal-mask" onClick={() => setPanel('')}>
          <div className="scroll-panel settings" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head"><div className="panel-title">前世碑林</div><button className="close-btn" onClick={() => setPanel('')}>×</button></div>
            <p style={{ lineHeight: 1.9, fontSize: 14 }}>
              此间共 <b style={{ color: '#b8c8e8' }}>{steles.length}</b> 座旧碑。天道档没有备份，你倒下的地方就是最后一页。
              <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: 12.2, marginTop: 3 }}>碑在，凶手还在，储物袋也还在他手里。下一世去寻，或让风把名字磨平。</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflow: 'auto', paddingRight: 4, marginTop: 8 }}>
              {steles.map((st) => {
                const tierName = DAO_TIERS.find((t) => t.id === st.tier)?.name ?? st.tier;
                return (
                  <div key={st.id} style={{ border: '1px solid rgba(120,100,70,.22)', background: 'rgba(90,72,48,.05)', borderRadius: 4, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <b style={{ fontSize: 15, letterSpacing: '.08em' }}>{st.name}之碑</b>
                      <span style={{ fontSize: 11, color: st.tier === 'tiandao' ? '#b8443a' : st.tier === 'fanren' ? '#8c7438' : '#5f8a6a' }}>{tierName}道心 · 享年 {st.age}</span>
                    </div>
                    <div style={{ fontSize: 11.8, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.75 }}>
                      {st.realm} · {st.year}年殁于{st.killer}之手，碑立{st.place}。
                      {st.bio.slice(0, 2).map((b, i) => <span key={i} style={{ display: 'block' }}>· {b}</span>)}
                      {st.notes.slice(0, 2).map((n, i) => <i key={i} style={{ display: 'block', fontStyle: 'normal', color: '#8c7438' }}>随笔：{n}</i>)}
                      <span style={{ display: 'block', marginTop: 4, color: st.taken ? '#5f8a6a' : '#a35b4f' }}>
                        遗物：灵石 {st.legacy.stones}、{st.legacy.items.length} 件物事 · {st.taken ? '已被取回' : '仍在凶手处'}
                      </span>
                      {(st.offered || st.avenged) && (
                        <span style={{ display: 'block', marginTop: 2, color: st.avenged ? '#5f8a6a' : '#8c7438' }}>
                          {st.offered ? '碑前三炷香已燃 · 前世残念已承' : '香炉冷着，无人来祭'}{st.avenged ? ' · 前世之仇已报' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 10, borderTop: '1px dashed rgba(120,100,70,.3)', paddingTop: 8 }}>
              碑文与遗物来自本机存档。天道档封死了备份后门——想留档，下世别把道心砥砺到天道。
            </p>
          </div>
        </div>
      )}
      {panel === 'about' && (
        <div className="modal-mask" onClick={() => setPanel('')}>
          <div className="scroll-panel settings" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head"><div className="panel-title">关于</div><button className="close-btn" onClick={() => setPanel('')}>×</button></div>
            <div style={{ lineHeight: 1.9, fontSize: 14, maxHeight: '60vh', overflow: 'auto' }}>
              <p>你将扮演<b>苏寒</b>，从南荒梁国的一个山村少年起步，在完整的人界——<b>南荒、沧溟海、中州、天穹草原、极西之地</b>——自由闯荡。</p>
              <p>没有固定剧情。机缘、仇敌、知交与同道，全凭你自己的选择与随机际遇。</p>
              <p style={{ color: 'var(--ink-soft)' }}>当前为 <b>v0.71 · 问道残卷</b> 版本：开局溪谷里捡到一卷无字残卷——与人斗法时，对方施展的功法会一点点印进卷中，看得够多、挨得够多、躲得够多便能学会（法术书「问道残卷」页）；各派修士招式大扩充，元婴修士各有两门天阶神通、血过半燃魂再战，肉身被毁元婴遁出再战（你也一样）；结丹元婴大幅加强，修士残血亡命遁逃；灵草只看数量不计年份；金雷竹只在清音门出售；冲击化神最多一成；开宗立派后连灭两派会招来天下共讨；开宗立派、灭宗大战、灵力护盾、境界差距与追杀规矩、突破天象；水墨人界三图、活世界众生、骗局与人心、道心三档、死亡即碑；模组接口五代。</p>
              <p style={{ color: 'var(--ink-soft)', fontSize: 12 }}>本作为原创水墨修仙游戏，人物、地名与世界观均为原创。</p>
            </div>
          </div>
        </div>
      )}
      {/* 右下角：一键切换标题背景（图片 / 程序化绘制） */}
      <button className="title-bg-toggle" onClick={toggleBg} title="切换标题背景：图片 / 程序化绘制">
        {showArt ? '背景 · 图片' : '背景 · 程序化'}
      </button>
    </div>
  );
}
