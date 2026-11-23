// 模组包校验（与云端平台 platform/lib/validate.mjs 规则一致，改一处要两处同改）
import { MOD_FORMAT, MOD_FORMATS, MOD_API, type ModBundle } from './types';

export const MOD_ID_RE = /^[a-z][a-z0-9]{2,23}$/;
export const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
/** 单个模组包上限（字节，按 JSON 文本计） */
export const MOD_MAX_BYTES = 20 * 1024 * 1024;

export function cmpVersion(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** 返回错误说明；null = 合格 */
export function validateBundle(b: unknown): string | null {
  if (!b || typeof b !== 'object') return '不是模组包';
  const B = b as ModBundle;
  if (!MOD_FORMATS.includes(B.format)) return `格式不对（要 ${MOD_FORMAT}）`;
  const m = B.manifest;
  if (!m || typeof m !== 'object') return '缺少清单 manifest';
  if (typeof m.id !== 'string' || !MOD_ID_RE.test(m.id)) return '模组 id 只能用小写字母和数字，3–24 位，字母开头';
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40) return '模组名称 1–40 字';
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) return '版本号要写成 x.y.z';
  if (typeof m.author !== 'string' || m.author.length > 40) return '作者名最多 40 字';
  if (typeof m.desc !== 'string' || m.desc.length > 2000) return '简介最多 2000 字';
  if (m.api !== undefined && (typeof m.api !== 'number' || m.api > MOD_API)) return `需要模组接口 v${m.api}，本游戏只到 v${MOD_API}，请更新游戏`;
  if (m.deps !== undefined && (!Array.isArray(m.deps) || m.deps.some((d) => typeof d !== 'string' || !MOD_ID_RE.test(d)))) return '依赖 deps 写法不对';
  if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.length > 8 || m.tags.some((t) => typeof t !== 'string' || t.length > 12))) return '标签最多 8 个、每个 12 字以内';
  if (m.unsafe !== undefined && typeof m.unsafe !== 'boolean') return 'unsafe 只能写 true 或 false';
  if (m.games !== undefined && (!m.games || typeof m.games !== 'object' || Array.isArray(m.games) || Object.keys(m.games).length > 8 || Object.entries(m.games).some(([k, v]) => !/^[a-z][a-z0-9-]{1,23}$/.test(k) || typeof v !== 'string' || v.length > 24))) return '适配版本 games 写法不对（例：{"taixu": ">=0.8"}）';
  if (!B.files || typeof B.files !== 'object') return '缺少文件 files';
  if (typeof B.main !== 'string' || typeof B.files[B.main] !== 'string') return '入口文件 main 不在 files 里';
  for (const [k, v] of Object.entries(B.files)) {
    if (!/^[\w\-./]{1,80}$/.test(k) || k.includes('..')) return `文件名不合规：${k}`;
    if (typeof v !== 'string') return `文件内容必须是文本：${k}`;
  }
  if (m.icon !== undefined && (typeof m.icon !== 'string' || !/^data:image\/(png|webp|jpeg|gif);base64,/.test(B.files[m.icon] ?? ''))) return '图标要是 files 里的 png / webp / jpeg 图片';
  return null;
}
