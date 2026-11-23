// 云存档面板：万民卷宗 —— 只增不删的公共卷宗
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import { audio } from '../world/audio';
import { realmName } from '../data/realms';
import { cloudSave, cloudList, cloudRead, mineVersions, type CloudEntry } from '../world/cloud';
import { unzipSave } from '../world/savezip';
import { importRawSave, importErrorText } from '../world/saveImport';

const VERSION_TXT = 'v0.57 · 模组接口五代';   // 卷宗里每一页的版本标注：跟着当前版本走，别再停在旧档

function fmtTime(t: number) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CloudPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [list, setList] = useState<CloudEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const mine = mineVersions();

  const refresh = async (query = q) => {
    setBusy('正在翻阅卷宗…');
    try {
      const r = await cloudList(0, 200, query);
      setList(r.items); setTotal(r.whole);
    } catch (e: any) {
      setMsg({ t: `翻不开：${e.message}`, bad: true });
    } finally { setBusy(''); }
  };
  useEffect(() => { refresh(''); /* eslint-disable-next-line */ }, []);

  const doSave = async () => {
    // 天道档：本世只有一条命，卷宗里也不许留第二份（否则死亡即碑形同虚设）
    if (!game.daoxin.backupAllowed()) { setMsg({ t: game.daoxin.backupRefusal('存'), bad: true }); return; }
    if (!game.save(0)) { setMsg({ t: game.saveFailText(), bad: true }); return; }
    // 卷宗里存明文 JSON（服务端自己再 gzip）：先解压，取回来再压回本地存档格式
    const raw = unzipSave(localStorage.getItem('fanren_save_auto') ?? '');
    if (!raw) { setMsg({ t: '没有读到本局存档。', bad: true }); return; }
    setBusy('正在誊抄…');
    try {
      const r = await cloudSave({
        time: Date.now(), payload: raw, hero: game.hero, day: game.day,
        region: game.ui?.region ?? '', play: String(Math.floor(game.day / 360) + 1) + '年',
        game: VERSION_TXT, note: note.trim(),
      });
      setNote(''); audio.sfx('chime');
      await refresh();
      setMsg({ t: `已誊进卷宗第 ${r.no} 份。这一页永远留在那里，谁都撕不掉。` });
    } catch (e: any) { setMsg({ t: `没存上：${e.message}`, bad: true }); }
    finally { setBusy(''); }
  };

  const doLoad = async (en: CloudEntry) => {
    // 天道档也不许取回旧页：那等于把已经走完的路重走一遍，还顺手把道心降了档
    if (!game.daoxin.backupAllowed()) { setMsg({ t: game.daoxin.backupRefusal('取'), bad: true }); return; }
    if (!confirm(`取回 ${en.date} ${en.name} · ${en.realm} 的这一页？\n（成功后覆盖本机存档三并读取；请先备份。卷宗里那份不会动）`)) return;
    setBusy('正在取回…');
    try {
      const s = await cloudRead(en.id);
      const result = importRawSave(s.raw, 'fanren_save_3', localStorage, key => game.load(key));
      if (result === 'ok') { audio.sfx('chime'); game.toast('已从卷宗取回。', 'good'); onClose(); }
      else setMsg({ t: importErrorText(result), bad: true });
    } catch (e: any) { setMsg({ t: `取不回：${e.message}`, bad: true }); }
    finally { setBusy(''); }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel cult-panel wide cloud-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div className="panel-title">万民卷宗</div>
          <div className="panel-sub">只增不删 · 谁都能存 · 存进去就归人界所有</div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="cult-body">
          <div className="cloud-hero">
            <div className="ch-l">
              <div className="ch-t">把这一世，记进人界</div>
              <p className="ch-d">{game.daoxin.backupAllowed()
                ? <>不必留名，也不必注册。按下按钮，此刻的苏寒便被誊进公共卷宗——<b>只增，不删，不改</b>。日后翻到可以取回；但谁也没法把它抹掉，包括写下它的人。</>
                : <>你立的是<b>天道</b>道心。这一世只有一条命，卷宗里也不许留第二份——你陨落之处会立起一座碑，刻着你的生平，那才是你的存档。<br />（道心只可上调；想留备份，下一世别把它砥砺到天道。）</>}</p>
            </div>
            <div className="ch-r">
              <div className="ch-realm">{realmName(game.hero.realm, game.hero.stage)}</div>
              <div className="ch-meta">第 {Math.floor(game.day / 360) + 1} 年 · {game.ui?.region ?? ''} · {Math.floor(game.hero.age)} 岁</div>
              <input className="ch-note" value={note} maxLength={24} placeholder="留一句话（可不填）" onChange={(e) => setNote(e.target.value)} disabled={!game.daoxin.backupAllowed()} />
              <button className="ink-btn jade big" disabled={!!busy || !game.daoxin.backupAllowed()} onClick={doSave}>{busy || (game.daoxin.backupAllowed() ? '存入卷宗' : '天道档 · 不留备份')}</button>
            </div>
          </div>

          {msg && <div className={'cloud-msg' + (msg.bad ? ' bad' : '')}>{msg.t}</div>}

          <div className="sec-title">卷宗名册<small>{busy ? busy : `人间共 ${total} 页 · 此处列 ${list.length}`}</small>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <input className="ch-note" style={{ width: 130 }} value={q} placeholder="查人名/境界"
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') refresh(q); }} />
              <button className="ink-btn small ghost" onClick={() => refresh(q)}>查阅</button>
            </span>
          </div>
          <div className="cloud-list">
            {!list.length && !busy && <div className="hint" style={{ padding: '10px 4px' }}>卷宗还是空的。做第一个写下名字的人。</div>}
            {list.map((en, i) => (
              <div key={en.id} className="cloud-row">
                <div className={'cr-no' + (mine.includes(en.id) ? ' mine' : '')}>{mine.includes(en.id) ? '我' : list.length - i}</div>
                <div className="cr-main">
                  <div className="cr-n">{en.name}<span className="cr-realm">{en.realm}</span>
                    {en.note && <span className="cr-note">「{en.note}」</span>}
                  </div>
                  <div className="cr-s">{fmtTime(en.time) || en.date} · 第{en.year || '-'}年 · {en.region || '——'} · {en.game || ''}</div>
                </div>
                <button className="ink-btn small" onClick={() => doLoad(en)}>取回</button>
              </div>
            ))}
          </div>

          <div className="hint" style={{ marginTop: 10 }}>
            卷宗由本站自己保管，不经过任何第三方平台，也不用填任何账号或令牌。
            每一页落盘即永久留存，服务端没有删除接口。
          </div>
        </div>
      </div>
    </div>
  );
}
