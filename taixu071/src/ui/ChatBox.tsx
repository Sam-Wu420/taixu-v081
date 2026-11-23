// 太虚问道录 · 当面交谈：对话框下方的输入框与往来记录（只在创空间版有后端时出现）
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import type { ChatTarget, ChatTurn } from '../world/npcchat';
import { audio } from '../world/audio';

const TONE_CLS: Record<string, string> = { kind: 'warm', flirt: 'warm', polite: '', cold: 'cold', rude: 'bad', insult: 'bad', threat: 'bad' };

export function ChatBox({ game, target, compact }: { game: Game; target: ChatTarget; compact?: boolean }) {
  const [log, setLog] = useState<ChatTurn[]>(() => game.chat.history(target).slice(-8));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState<{ i: number; n: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const name = game.chat.nameOf(target);
  useEffect(() => { boxRef.current?.scrollTo(0, 1e6); }, [log, typed, busy]);
  // 台词逐字显出
  useEffect(() => {
    if (!typed) return;
    const full = log[typed.i]?.t ?? '';
    if (typed.n >= full.length) { setTyped(null); return; }
    const id = setTimeout(() => setTyped({ i: typed.i, n: typed.n + 2 }), 28);
    return () => clearTimeout(id);
  }, [typed, log]);

  const send = async (s?: string) => {
    const msg = (s ?? text).trim();
    if (!msg || busy) return;
    setText(''); setBusy(true); audio.sfx('click');
    setLog((l) => [...l, { w: 'p', t: msg }]);
    let res;
    try { res = await game.chat.send(target, msg); }
    catch (e) { console.warn('[交谈] 出错', e); res = { ok: false, say: '……', tone: 'polite', delta: 0 }; }
    setBusy(false);
    setLog((l) => { const nl = [...l, { w: 'n' as const, t: res.say, act: res.act, tone: res.tone }]; setTyped({ i: nl.length - 1, n: 0 }); return nl.slice(-12); });
    if (res.end) setTimeout(() => game.closeModal(), 2600);
  };
  const chips = target.kind === 'keeper' ? ['掌柜，这货怎么卖？', '能不能便宜些？', '我常来，给个熟客价吧'] : ['道友近来可好？', '向你打听件事', '有什么需要我帮忙的吗？'];

  return (
    <div className={'chat-box' + (compact ? ' compact' : '')} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="chat-log" ref={boxRef}>
        {!log.length && <div className="chat-hint">可以直接与{name}说话——{name}会以自己的身份与性情作答，也记得你们说过的话。</div>}
        {log.map((m, i) => (
          <div key={i} className={'chat-line ' + (m.w === 'p' ? 'me' : 'npc ' + (TONE_CLS[m.tone ?? ''] ?? ''))}>
            <b>{m.w === 'p' ? '你' : name}</b>
            {m.act && m.w === 'n' && <i>（{m.act.replace(/^[（(]|[）)]$/g, '')}）</i>}
            <span>{typed && typed.i === i ? m.t.slice(0, typed.n) : m.t}</span>
          </div>
        ))}
        {busy && <div className="chat-line npc wait"><b>{name}</b><span>……</span></div>}
      </div>
      <div className="chat-input">
        <input value={text} maxLength={120} placeholder={`对${name}说……（回车发送）`} disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
        <button className="ink-btn" disabled={busy || !text.trim()} onClick={() => send()}>说</button>
      </div>
      {!compact && <div className="chat-chips">{chips.map((c) => <button key={c} disabled={busy} onClick={() => send(c)}>{c}</button>)}</div>}
    </div>
  );
}
