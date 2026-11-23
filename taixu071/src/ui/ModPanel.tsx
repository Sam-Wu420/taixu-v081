// v0.55：模组管理——已安装（启用 / 停用 / 卸载 / 导入 .fmod）、模组平台（浏览 / 搜索 / 安装 / 更新）
// 模组在游戏启动时加载：启用、停用、安装之后点「重新载入」生效。
import { useEffect, useRef, useState } from 'react';
import type { ModBundle } from '../mod/types';
import { modStore } from '../mod/store';
import { modClient, type StoreMod } from '../mod/client';
import { modHost, loadSettings, saveSettings } from '../mod/host';
import { audio } from '../world/audio';

type Tab = 'local' | 'store';

export function ModPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('local');
  const [local, setLocal] = useState<ModBundle[]>([]);
  const [en, setEn] = useState<Record<string, boolean>>(modStore.enabled());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [base, setBase] = useState(modStore.storeUrl());
  const [baseIn, setBaseIn] = useState(modStore.storeUrl());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'downloads' | 'new' | 'rating'>('downloads');
  const [list, setList] = useState<StoreMod[] | null>(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => modStore.list().then((l) => setLocal(l.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'zh'))));
  useEffect(() => { refresh(); }, []);
  const click = () => audio.sfx('click');
  const say = (s: string) => { setMsg(s); click(); };

  const load = async (b = base, qq = q, so = sort) => {
    if (!b) { setList(null); return; }
    setBusy('list');
    try { const r = await modClient.list(b, qq, so); setList(r.mods); setMsg(''); }
    catch (e) { setList([]); setMsg(`连不上模组平台：${(e as Error).message}`); }
    setBusy('');
  };
  useEffect(() => { if (tab === 'store') load(); }, [tab]);

  const toggle = (id: string) => {
    const b = local.find((x) => x.manifest.id === id);
    if (!en[id] && b?.manifest.unsafe && modStore.unsafeOk()[id] !== b.manifest.version) {
      if (!window.confirm(`「${b.manifest.name}」v${b.manifest.version} 要求【高级权限】。\n\n它能直接改动游戏的一切（包括你的存档），不受模组接口的保护；游戏更新后也最容易出问题。\n\n只在你信得过作者「${b.manifest.author || '佚名'}」时才启用。确定启用吗？`)) return;
      modStore.setUnsafeOk(id, b.manifest.version);
    }
    if (en[id] && b?.manifest.unsafe) modStore.setUnsafeOk(id, null);
    const e = { ...en, [id]: !en[id] }; setEn(e); modStore.setEnabled(e); setDirty(true); click();
  };
  const remove = async (b: ModBundle) => { await modStore.remove(b.manifest.id); const e = { ...en }; delete e[b.manifest.id]; setEn(e); setDirty(true); await refresh(); say(`已卸载「${b.manifest.name}」。`); };
  const install = async (m: StoreMod) => {
    setBusy(m.id);
    try { await modClient.install(base, m.id); setEn(modStore.enabled()); await refresh(); setDirty(true); say(m.unsafe && !modStore.enabled()[m.id] ? `「${m.name}」v${m.version} 已装好。它要求高级权限，请在「已安装」里点「启用」并确认。` : `「${m.name}」v${m.version} 已装好并启用，重新载入后生效。`); }
    catch (e) { say(`安装失败：${(e as Error).message}`); }
    setBusy('');
  };
  const importFile = async (f: File) => {
    try { const b = await modClient.importText(await f.text()); setEn(modStore.enabled()); await refresh(); setDirty(true); say(b.manifest.unsafe && !modStore.enabled()[b.manifest.id] ? `导入「${b.manifest.name}」v${b.manifest.version}。它要求高级权限，请点「启用」并确认。` : `导入「${b.manifest.name}」v${b.manifest.version}，重新载入后生效。`); }
    catch (e) { say(`导入失败：${(e as Error).message}`); }
  };
  const st = (id: string) => modHost.status.find((s) => s.id === id);
  const localVer = (id: string) => local.find((b) => b.manifest.id === id)?.manifest.version;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel cult-panel wide mod-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">模　组</div><div className="panel-sub">已安装 {local.length} · 启用 {local.filter((b) => en[b.manifest.id]).length} · 本次已加载 {modHost.mods.length}</div><button className="close-btn" onClick={onClose}>×</button></div>
        <div className="cult-body">
          <div className="tabs">
            <button className={tab === 'local' ? 'on' : ''} onClick={() => { setTab('local'); click(); }}>已安装</button>
            <button className={tab === 'store' ? 'on' : ''} onClick={() => { setTab('store'); click(); }}>模组平台</button>
            <span style={{ flex: 1 }} />
            <button onClick={() => fileRef.current?.click()}>导入模组文件…</button>
            <input ref={fileRef} type="file" accept=".fmod,application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </div>
          {msg && <div className="fr-msg">{msg}</div>}
          {dirty && <div className="mod-reload">模组有变动，<button className="ink-btn jade" onClick={() => location.reload()}>重新载入</button>后生效。</div>}

          {tab === 'local' && <div className="mod-list">
            {local.length === 0 && <div className="hint">还没装模组。去「模组平台」逛逛，或者导入别人发给你的 .fmod 文件。</div>}
            {local.map((b) => { const m = b.manifest, s = st(m.id), icon = m.icon ? b.files[m.icon] : undefined; return (
              <div key={m.id} className={'mod-row' + (en[m.id] ? ' on' : '')}>
                {icon ? <img className="mod-ico" src={icon} alt="" /> : <span className="mod-ico glyph">{m.name[0]}</span>}
                <div className="mod-main">
                  <b>{m.name}{m.unsafe && <span className="mod-unsafe" title="能改游戏的一切，不受模组接口保护">高级权限</span>}</b><small>v{m.version} · {m.author || '佚名'} · {m.id}</small>
                  <span>{m.desc}</span>
                  {s && <em className={s.state === 'loaded' ? 'ok' : s.state === 'disabled' ? '' : 'bad'}>
                    {s.state === 'loaded' ? `已加载：法术 ${s.added.arts} · 物品 ${s.added.items} · 敌人 ${s.added.enemies}${s.added.recipes ? ` · 丹方 ${s.added.recipes}` : ''}${s.added.locations ? ` · 地点 ${s.added.locations}` : ''}${s.added.npcs ? ` · 人物 ${s.added.npcs}` : ''}${s.patched ? ` · 改动原有内容 ${s.patched} 处` : ''}${s.errors ? ` · 运行出错 ${s.errors} 次` : ''}` : s.state === 'disabled' ? '未启用' : `没能加载：${s.error}`}
                  </em>}
                  <ModSettings id={m.id} />
                  {s?.warnings.length ? <em className="bad" title={s.warnings.join('\n')}>{s.warnings.length} 处与别的模组冲突：{s.warnings[0]}{s.warnings.length > 1 ? ' …' : ''}</em> : null}
                </div>
                <div className="mod-acts">
                  <button className={'ink-btn' + (en[m.id] ? ' jade' : '')} onClick={() => toggle(m.id)}>{en[m.id] ? '已启用' : '已停用'}</button>
                  <button className="ink-btn ghost" onClick={() => remove(b)}>卸载</button>
                </div>
              </div>); })}
            <div className="hint" style={{ marginTop: 10 }}>模组是别人写的代码，只在游戏里运行，碰不到你电脑上的文件；但它能改你的存档，只装信得过的。</div>
          </div>}

          {tab === 'store' && <div className="mod-list">
            <div className="mod-bar">
              <input className="mod-in" placeholder="模组平台地址，如 https://mods.example.com" value={baseIn} onChange={(e) => setBaseIn(e.target.value)} />
              <button className="ink-btn" onClick={() => { const u = baseIn.trim().replace(/\/+$/, ''); modStore.setStoreUrl(u); setBase(u); load(u); }}>连接</button>
            </div>
            {base && <div className="mod-bar">
              <input className="mod-in" placeholder="搜索模组名、作者、简介" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); e.stopPropagation(); }} />
              <select value={sort} onChange={(e) => { const s = e.target.value as typeof sort; setSort(s); load(base, q, s); }}>
                <option value="downloads">下载最多</option><option value="new">最新</option><option value="rating">评分最高</option>
              </select>
              <button className="ink-btn" onClick={() => load()}>搜索</button>
            </div>}
            {busy === 'list' && <div className="hint">正在连接模组平台…</div>}
            {!base && <div className="hint">填上模组平台的地址并连接，就能浏览、一键安装别人做的模组。</div>}
            {list && list.length === 0 && busy !== 'list' && <div className="hint">没有找到模组。</div>}
            {list?.map((m) => { const lv = localVer(m.id), up = modClient.outdated(lv, m.version); return (
              <div key={m.id} className="mod-row">
                {m.icon ? <img className="mod-ico" src={modClient.iconUrl(base, m.id)} alt="" /> : <span className="mod-ico glyph">{m.name[0]}</span>}
                <div className="mod-main">
                  <b>{m.name}{m.unsafe && <span className="mod-unsafe" title="能改游戏的一切，不受模组接口保护">高级权限</span>}</b><small>v{m.version} · {m.author} · 下载 {m.downloads}{m.ratings ? ` · ★${m.rating.toFixed(1)}（${m.ratings}）` : ''}{m.tags.length ? ' · ' + m.tags.join(' / ') : ''}</small>
                  <span>{m.desc}</span>
                </div>
                <div className="mod-acts">
                  <button className="ink-btn jade" disabled={!!busy || (!!lv && !up)} onClick={() => install(m)}>{busy === m.id ? '安装中…' : lv ? (up ? `更新到 v${m.version}` : '已安装') : '安装'}</button>
                </div>
              </div>); })}
          </div>}
        </div>
      </div>
    </div>
  );
}

/** v0.57：模组的设置项（模组用 api.ui.settings 声明；值存在本机） */
function ModSettings({ id }: { id: string }) {
  const defs = modHost.settingDefs(id);
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, unknown>>(() => loadSettings(id));
  if (!defs.length) return null;
  const set = (k: string, v: unknown) => { const o = { ...vals, [k]: v }; setVals(o); saveSettings(id, o); };
  return (
    <div>
      <button className="ink-btn ghost" style={{ marginTop: 4 }} onClick={() => setOpen(!open)}>{open ? '收起设置' : `设置（${defs.length}）`}</button>
      {open && <div className="mod-set">
        {defs.map((d) => { const v = vals[d.key] ?? d.default; return [
          <label key={d.key + 'l'} title={d.hint}>{d.label}</label>,
          d.type === 'bool' ? <input key={d.key} type="checkbox" checked={!!v} onChange={(e) => set(d.key, e.target.checked)} />
            : d.type === 'number' ? <input key={d.key} type="number" value={Number(v)} min={d.min} max={d.max} step={d.step ?? 1} onChange={(e) => set(d.key, Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, +e.target.value)))} />
            : d.type === 'select' ? <select key={d.key} value={String(v)} onChange={(e) => set(d.key, e.target.value)}>{(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : <input key={d.key} type="text" value={String(v)} maxLength={200} onChange={(e) => set(d.key, e.target.value)} />,
        ]; })}
        <small style={{ gridColumn: '1 / -1', opacity: 0.7 }}>改动立即保存；有的设置要重新载入才生效。</small>
      </div>}
    </div>
  );
}
