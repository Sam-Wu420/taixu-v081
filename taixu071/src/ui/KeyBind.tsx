import { useEffect, useState } from 'react';
import { KEY_ACTIONS, bindOf, isCustom, keyLabel, resetBinds, setBind } from '../core/keymap';
import { audio } from '../world/audio';

/**
 * v0.52.2：自定义按键面板。
 * 点一行 → 「请按键」→ 按下键盘任意键或鼠标左/中/右键即完成绑定；Esc 取消。
 * 新键若已被别的动作占用，两者自动对调，不会出现无键可用的动作。
 */
export function KeyBindPanel({ onClose }: { onClose: () => void }) {
  const [wait, setWait] = useState('');
  const [, force] = useState(0);
  const [msg, setMsg] = useState('点右侧键位，再按下想用的键或鼠标键。技能栏九格也可改键（默认 1–5、鼠标左右键、X、V）；Esc、F1、F3 固定不改。');
  const re = () => force((x) => x + 1);

  useEffect(() => {
    if (!wait) return;
    const finish = (key: string) => {
      const swapped = setBind(wait, key);
      const name = KEY_ACTIONS.find((a) => a.id === wait)?.name ?? '';
      setMsg(swapped
        ? `「${name}」改为 ${keyLabel(key)}；原占此键的「${KEY_ACTIONS.find((a) => a.id === swapped)?.name}」与之对调。`
        : `「${name}」改为 ${keyLabel(key)}。`);
      setWait('');
      audio.sfx('click');
      re();
    };
    const kd = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setWait(''); setMsg('已取消改键。'); return; }
      const k = e.key.toLowerCase();
      if (k === 'f3') return;   // F3 留给性能面板
      finish(k);
    };
    const md = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      finish('mouse' + e.button);
    };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('mousedown', md, true);
    return () => { window.removeEventListener('keydown', kd, true); window.removeEventListener('mousedown', md, true); };
  }, [wait]);

  // 按住时吞掉滚轮，免得改键时页面乱滚
  useEffect(() => {
    if (!wait) return;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', stop, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', stop, { capture: true } as EventListenerOptions);
  }, [wait]);

  const groups = Array.from(new Set(KEY_ACTIONS.map((a) => a.group)));
  // 左列走位/战斗/交互，右列界面与鼠标——两列高度相近，也符合「左手操作、右手界面」的直觉
  const LEFT = ['移动', '战斗', '交互'];
  const cols: string[][] = [groups.filter((g) => LEFT.includes(g)), groups.filter((g) => !LEFT.includes(g))];
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel settings kb-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">自定义按键</div><button className="close-btn" onClick={onClose}>×</button></div>
        <p className="kb-msg">{msg}</p>
        <div className="kb-list">
          {cols.map((groupsInCol, ci) => (
            <div key={ci} className="kb-col">
              {groupsInCol.map((g) => (
                <div key={g} className="kb-group">
                  <div className="kb-group-title">{g}</div>
                  {KEY_ACTIONS.filter((a) => a.group === g).map((a) => (
                    <div key={a.id} className={'kb-row' + (wait === a.id ? ' waiting' : '')}>
                      <span className="kb-name">{a.name}</span>
                      <button
                        className={'kb-key' + (wait === a.id ? ' on' : '')}
                        onClick={() => { audio.sfx('click'); setWait(a.id); setMsg('请按下新的键……（Esc 取消）'); }}
                      >{wait === a.id ? '请按键…' : keyLabel(bindOf(a.id))}</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="kb-foot">
          <span className="hint">{isCustom() ? '已自定义（存在本机，换台机器要重设）' : '当前为默认键位'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ink-btn ghost" onClick={() => { audio.sfx('click'); resetBinds(); re(); setMsg('已恢复默认键位。'); }}>恢复默认</button>
            <button className="ink-btn" onClick={onClose}>完成</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 设置页里的「当前键位」速览（跟着自定义实时变） */
export function keyHint(): string {
  return `移动 ${keyLabel(bindOf('up'))}${keyLabel(bindOf('left'))}${keyLabel(bindOf('down'))}${keyLabel(bindOf('right'))}　·　${keyLabel(bindOf('dodge'))} 闪避　·　${keyLabel(bindOf('gather'))} 采集　·　${keyLabel(bindOf('sit'))} 打坐`;
}
