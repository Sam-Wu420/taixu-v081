// r14-toast：「讯」角标 + 手机上的单行消息 + 消息记录。
// 用户反馈手机上方正中的宽条消息挡战场：手机上消息改到左上人物牌下面，窄的单行、字小一号、一次一条、约 3 秒；
// 闲讯（神识中的旁人事件、传闻、寻常拾取）按设置只记进这里的角标，点「讯」展开最近 40 条。电脑上消息仍在顶上正中，只多了这个角标。
// 分级与去向见 world/toastPolicy.ts；动效只动 transform / opacity。
import { useEffect, useState } from 'react';
import type { Game, Toast } from '../world/game';
import { audio } from '../world/audio';

const LV_TAG: Record<string, string> = { urgent: '急', high: '', low: '闻' };

export function ToastStrip({ game, toasts, touch }: { game: Game; toasts: Toast[]; touch: boolean }) {
  const [open, setOpen] = useState(false);
  // 开着记录时来的新消息也算看过
  useEffect(() => { if (open) game.readToastLog(); }, [open, toasts, game]);
  const log = game.toastLog, unread = game.toastUnread;
  const cur = touch ? toasts.filter((t) => t.kind !== 'region').slice(-1)[0] : undefined;
  if (!log.length && !cur) return null;
  const toggle = () => { audio.sfx('click'); setOpen((o) => !o); };
  const kindCls = (k?: string) => (k === 'warn' ? ' warn' : k === 'good' ? ' good' : '');
  return (
    <div className={'msg-strip' + (touch ? ' touch' : '') + (open ? ' open' : '')}>
      <button className={'msg-badge' + (unread ? ' has' : '')} onClick={toggle} title={unread ? `消息记录（${unread} 条没看）` : '消息记录'}>
        讯{unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}
      </button>
      {cur && !open && (
        <div key={cur.id} className={'msg-line' + kindCls(cur.kind) + (cur.lv === 'urgent' ? ' urgent' : '')} onClick={toggle}>{cur.text}</div>
      )}
      {open && (
        <div className="msg-log" onClick={(e) => e.stopPropagation()}>
          <div className="msg-log-head"><span>消息记录</span><small>设置 → 消息提示 可调弹出多少</small><button className="msg-log-x" onClick={toggle}>×</button></div>
          <div className="msg-log-list">
            {log.length ? [...log].reverse().map((e) => (
              <div key={e.id} className={'msg-log-item' + kindCls(e.kind) + (e.lv === 'urgent' ? ' urgent' : '') + (e.shown ? '' : ' quiet')}>
                {LV_TAG[e.lv] ? <b>{LV_TAG[e.lv]}</b> : null}{e.text}
              </div>
            )) : <div className="msg-log-item quiet">还没有消息。</div>}
          </div>
        </div>
      )}
    </div>
  );
}
