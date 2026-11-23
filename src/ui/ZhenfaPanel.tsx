// v0.53：阵法盘（按 6）——阵道境界、阵盘与阵旗、可布之阵、正在主持的阵
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import { ZHEN, ZHEN_BY_ID, ZD_NAME, ZD_XP, ZhenDef, ZM_NAME, ZM_XP, ZM_EVO, zmBonus } from '../data/zhenfa';
import { REALMS } from '../data/realms';
import { ACTIVE_MAP } from '../data/world';
import * as C from '../world/cultivation';
import { SKILL_ICON } from '../gfx/skillIconData';
import { itemDef } from '../data/items';
import { ItemGlyph } from './ItemIcon';
import { audio } from '../world/audio';
import { bindOf, keyLabel } from '../core/keymap';
import { LqPanel } from './kit/LqPanel';   // 收官 H1：统一外壳

const CAT_COLOR: Record<string, string> = { 困: '#4aa8a0', 杀: '#c0503a', 守: '#4a80c0', 辅: '#5aa060', 禁: '#8a60c0' };

export function ZhenfaPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  useEffect(() => { const t = setInterval(re, 500); return () => clearInterval(t); }, []);
  const Z = game.zhenfa, h = game.hero, lv = Z.lv, xp = Z.st.xp;
  const [sel, setSel] = useState<string>(ZHEN.find((z) => Z.knows(z.id))?.id ?? 'kun');
  const z = ZHEN_BY_ID[sel];
  const pan = Z.pan();
  const nextXp = ZD_XP[lv + 1];
  const active = Z.list.filter((i) => i.owner === 'p' && !i.dead && i.map === ACTIVE_MAP);
  const assign = (id: string) => {
    const key = 'zf:' + id;
    if (h.hotbar.includes(key)) { h.hotbar[h.hotbar.indexOf(key)] = null; }
    else { const k = h.hotbar.findIndex((x) => !x); h.hotbar[k >= 0 ? k : 8] = key; game.toast(`${ZHEN_BY_ID[id].name}已放入快捷栏 ${(k >= 0 ? k : 8) + 1}：战斗中一键布阵。`, 'good'); }
    audio.sfx('click'); re();
  };
  const ico = (d: ZhenDef) => SKILL_ICON['zf:' + d.id];
  const why = z ? Z.why(z) : null;
  return (
    <LqPanel title="阵法盘" sub={<>阵道「<b>{ZD_NAME[lv]}</b>」{nextXp !== undefined ? ` · ${xp}/${nextXp}` : ' · 已臻化境'} · {pan ? pan.name : '无阵盘'} · 阵旗 {C.bagCount(h, 'zf_qi')}{C.bagCount(h, 'zf_qi2') ? ` + 上品 ${C.bagCount(h, 'zf_qi2')}` : ''} · 灵石 {C.bagCount(h, 'mat_lingshi')}</>} onClose={onClose} wide cls="cult-panel zf-panel" bare>
        <div className="cult-body">
          <div className="zd-bar"><i style={{ width: `${nextXp !== undefined ? Math.min(100, (xp - ZD_XP[lv]) / (nextXp - ZD_XP[lv]) * 100) : 100}%` }} /></div>
          <div className="bag-wrap">
            <div className="skill-list">
              {ZHEN.map((d) => {
                const known = Z.knows(d.id);
                return (
                  <button key={d.id} className={'skill-row' + (sel === d.id ? ' on' : '') + (known ? '' : ' locked')} onClick={() => { setSel(d.id); audio.sfx('click'); }}>
                    {ico(d) ? <img className="sk-glyph art-ico sk-ico" src={ico(d)} alt="" draggable={false} /> : <span className="sk-glyph" style={{ background: `rgb(${d.color})` }}>阵</span>}
                    <span className="sk-name">{d.name}<small style={{ color: CAT_COLOR[d.cat] }}>{d.cat}阵</small></span>
                    <span className={'sk-prof ' + (known ? 'p' + Math.max(1, Z.mastLv(d.id)) : 'p0')}>{known ? ZM_NAME[Z.mastLv(d.id)] + (Z.why(d) ? '' : ' · 可布') : '未得阵图'}</span>
                    {h.hotbar.includes('zf:' + d.id) && <span className="sk-slot">{h.hotbar.indexOf('zf:' + d.id) + 1}</span>}
                  </button>
                );
              })}
              <div className="hint" style={{ marginTop: 8 }}>阵图：坊市符箓斋 / 坊市可购寻常阵图；敛息、五雷、地火、两仪只在古修遗府深处。阵旗、阵盘可在丹器炉里炼制。</div>
            </div>
            <div className="bag-detail">
              {z && <>
                {(() => { const ml = Z.mastLv(z.id), mx = Z.mastXp(z.id), nx = ZM_XP[ml + 1], mb = zmBonus(ml); return <>
                <div className="bd-name"><i className="zf-dot big" style={{ background: `rgb(${z.color})` }} />{z.name}<small>　{z.cat}阵 · 阵旗 {Z.flagsOf(z)} 面 · 灵石 {Z.costOf(z)}</small></div>
                <div className="bd-type">需{REALMS[z.realm].name}期 · 阵道「{ZD_NAME[z.zd]}」 · 半径约 {Math.round(z.r * Z.radMul() * mb.rad / 30)} 丈 · {z.days ? `维持 ${Math.round(z.days * mb.dur)} 日` : `维持约 ${Math.round(z.dur * mb.dur)} 息`} · 威力 ×{(Z.powerMul() * mb.pow).toFixed(2)}</div>
                {Z.knows(z.id) && <div className="bd-type">精熟「<b>{ZM_NAME[ml]}</b>」{nx !== undefined ? ` · ${mx}/${nx}（布阵、阵中困敌都长精熟）· 下一境：${ZM_EVO[ml + 1]}` : ' · 已臻圆满'}</div>}
                <div className="bd-desc">{z.desc}</div>
                </>; })()}
                {Z.knows(z.id)
                  ? <div className="zf-acts">
                      <button className="ink-btn jade" disabled={!!why} onClick={() => { if (game.zhenfa.deploy(z.id)) onClose(); else re(); }}>就地布阵</button>
                      <button className="ink-btn" onClick={() => assign(z.id)}>{h.hotbar.includes('zf:' + z.id) ? '移出快捷栏' : '放入快捷栏'}</button>
                      {why && <div className="hint warn">{why}</div>}
                    </div>
                  : <div className="hint">尚未参透此阵阵图。{itemDef('zt_' + z.id).name !== 'zt_' + z.id ? `（${itemDef('zt_' + z.id).name}${z.src === 'ruin' ? '：只在遗府、秘境出现' : '：坊市有售'}）` : ''}</div>}
              </>}
              <div className="zf-sub">正在主持（{active.length}/{Z.maxActive()}）</div>
              {active.length === 0 && <div className="hint">眼下没有主持中的阵法。</div>}
              {active.map((i, k) => (
                <div key={k} className="zf-inst">
                  <b><i className="zf-dot" style={{ background: `rgb(${i.def.color})` }} />{i.def.name}</b>
                  <span>阵眼 {Math.round(i.eye.hp / i.eye.max * 100)}% · {i.untilDay !== undefined ? `${Math.max(0, Math.ceil(i.untilDay - game.day))} 日` : `${Math.max(0, Math.round(i.left))} 息`} · 距此 {Math.round(Math.hypot(i.x - game.player.x, i.y - game.player.y) / 30)} 丈</span>
                  <button className="mini" onClick={() => { game.zhenfa.dismiss(i); re(); }}>收阵</button>
                </div>
              ))}
              <div className="zf-sub">器物</div>
              <div className="zf-items">
                {['zf_pan1', 'zf_pan2', 'zf_pan3', 'zf_pan4', 'zf_qi', 'zf_qi2', 'zf_zhui'].filter((id) => C.bagCount(h, id) > 0).map((id) => (
                  <span key={id} className="zf-item" title={itemDef(id).desc}><ItemGlyph id={id} className="zf-ig" />{itemDef(id).name}×{C.bagCount(h, id)}</span>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                阵法以你所站之处为中心布下（元婴出窍时布在肉身旁，护住肉身）。阵眼是嵌灵石的石座：困在阵里的修士会去轰它，阵眼一碎阵即破、阵旗折损一半。走到自己的阵眼旁按 {keyLabel(bindOf('interact'))} 可续阵、收阵。
                魔道阵修也会布阵困你——找到阵眼走过去破开；阵道「初窥门径」以上、元婴出窍、明清灵目都能一眼看穿阵眼。遗府禁制可用「破禁之局」按五行相生逐一点破。
              </div>
            </div>
          </div>
        </div>
    </LqPanel>
  );
}
