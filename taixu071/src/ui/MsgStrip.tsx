// 左上「讯」：消息角标 + 下拉消息记录。参照新版界面移植（PC 与移动端共用一套）。
// PC：只显示角标，弹出的消息仍走屏幕中下方 toast 列表；
// 移动端：额外把最新一条消息挂在角标右侧，省得弹窗挡住视野。
import { useEffect, useState } from 'react';
import { audio } from '../world/audio';
import type { Game, Toast } from '../world/game';

const LV_TAG: Record<string, string> = { urgent: '急', high: '', low: '闻' };

export function MsgStrip({ game, toasts, touch }: { game: Game; toasts: Toast[]; touch: boolean }) {
  const [open, setOpen] = useState(false);
  // 展开即把记录标为已读（角标数字清零）
  useEffect(() => { if (open) game.readToastLog(); }, [open, toasts, game]);
  const log = game.toastLog;
  const unread = game.toastUnread;
  const line = toasts.filter((t) => t.kind !== 'region').slice(-1)[0];
  if (!log.length && !line) return null;
  const toggle = () => { audio.sfx('click'); setOpen((v) => !v); };
  const kc = (k?: Toast['kind']) => (k === 'warn' ? ' warn' : k === 'good' ? ' good' : '');
  return (
    <div className={'msg-strip' + (touch ? ' touch' : '') + (open ? ' open' : '')}>
      <button
        className={'msg-badge' + (unread ? ' has' : '')}
        onClick={toggle}
        title={unread ? `消息记录（${unread} 条没看）` : '消息记录'}
      >
        讯{unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}
      </button>
      {line && !open && (
        <div className={'msg-line' + kc(line.kind) + (line.lv === 'urgent' ? ' urgent' : '')} onClick={toggle}>{line.text}</div>
      )}
      {open && (
        <div className="msg-log" onClick={(e) => e.stopPropagation()}>
          <div className="msg-log-head">
            <span>消息记录</span>
            <small>设置 → 消息提示 可调弹出多少</small>
            <button className="msg-log-x" onClick={toggle}>×</button>
          </div>
          <div className="msg-log-list">
            {log.length ? [...log].reverse().map((c) => (
              <div
                key={c.id}
                className={'msg-log-item' + kc(c.kind) + (c.lv === 'urgent' ? ' urgent' : '') + (c.shown ? '' : ' quiet')}
              >
                {LV_TAG[c.lv] ? <b>{LV_TAG[c.lv]}</b> : null}{c.text}
              </div>
            )) : <div className="msg-log-item quiet">还没有消息。</div>}
          </div>
        </div>
      )}
    </div>
  );
}
