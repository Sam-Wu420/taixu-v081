// 极简 JSON 文件库：整库常驻内存，改动后合并写盘（先写临时文件并保留备份，断电或异常也不会写坏）
import { readFileSync, writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

function loadSafeJson(file, bak) {
  for (const candidate of [file, bak]) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (candidate === bak) console.warn('[db] 主库损坏，已从备份恢复：', bak);
        return parsed;
      }
    } catch (err) {
      console.error('[db] 读取数据文件失败：', candidate, err?.message || err);
    }
  }
  if (existsSync(file)) {
    const corruptPath = `${file}.corrupt.${Date.now()}`;
    try {
      renameSync(file, corruptPath);
      console.error('[db] 主库与备份均不可解析，已隔离坏档至：', corruptPath);
    } catch (err) {
      console.error('[db] 隔离损坏文件失败：', err?.message || err);
    }
  }
  return {};
}

export function openDb(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'db.json');
  const bak = file + '.bak';
  const data = loadSafeJson(file, bak);
  if (!data.users || typeof data.users !== 'object' || Array.isArray(data.users)) data.users = {};
  if (!data.tokens || typeof data.tokens !== 'object' || Array.isArray(data.tokens)) data.tokens = {};
  if (!data.mods || typeof data.mods !== 'object' || Array.isArray(data.mods)) data.mods = {};

  let timer = null;
  let dirty = false;
  let flushing = false;
  let lastError = null;

  const flush = () => {
    timer = null;
    if (flushing) {
      dirty = true;
      return;
    }
    flushing = true;
    const tmp = file + '.tmp';
    try {
      const payload = JSON.stringify(data);
      writeFileSync(tmp, payload, 'utf8');
      if (existsSync(file)) {
        try { copyFileSync(file, bak); } catch (err) {
          console.warn('[db] 写入备份失败：', err?.message || err);
        }
      }
      renameSync(tmp, file);
      dirty = false;
      lastError = null;
    } catch (err) {
      lastError = err;
      dirty = true;
      console.error('[db] 写盘失败：', err?.message || err);
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
    } finally {
      flushing = false;
      if (dirty && !lastError && !timer) {
        timer = setTimeout(flush, 50);
      }
    }
  };

  return {
    data,
    get lastError() { return lastError; },
    /** 标记已改动：50ms 内的改动合并成一次写盘 */
    save() {
      dirty = true;
      if (!timer) timer = setTimeout(flush, 50);
    },
    flushNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (dirty) flush();
    },
  };
}
