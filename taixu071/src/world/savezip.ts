// 存档压缩：localStorage 同源只有约 5MB，而活世界存档单份能长到 1MB+，
// 四格 + 碑林很快顶满（玩家看到的是「本地存档失败」）。
// 存进 localStorage 前用 LZSS 压缩：JSON 的键名、NPC 字段大量重复，实测能压到 1/3 ~ 1/4。
//
// · 纯同步（save()/load() 都是同步接口，CompressionStream 那种异步的用不上），无第三方依赖。
// · 格式：'z1:' + 位流（先 32 位原始字节数，再令牌流：0+8位字面量 / 1+16位距离+8位长度）。
// · 读档时 unzipSave() 对没有前缀的旧明文档原样返回——老档透明兼容，读到一次重新存档就换成压缩格式。
// · 万民卷宗上传前的 gzip（cloud.ts）与本压缩互不冲突：先解出明文 JSON 再走云端压缩。

const MAGIC = 'z1:';

class BitWriter {
  private buf = 0; private cnt = 0;
  private out: Uint8Array;
  private len = 0;
  constructor(cap = 4096) { this.out = new Uint8Array(cap); }
  private pushByte(b: number) {
    if (this.len === this.out.length) {
      const next = new Uint8Array(this.out.length * 2);
      next.set(this.out);
      this.out = next;
    }
    this.out[this.len++] = b;
  }
  bit(b: number) { this.buf = (this.buf << 1) | b; if (++this.cnt === 8) { this.pushByte(this.buf); this.buf = 0; this.cnt = 0; } }
  bits(v: number, n: number) {
    let rem = n;
    while (rem > 0) {
      const take = Math.min(rem, 8 - this.cnt);
      const shift = rem - take;
      const mask = (1 << take) - 1;
      this.buf = (this.buf << take) | ((v >>> shift) & mask);
      this.cnt += take;
      rem -= take;
      if (this.cnt === 8) { this.pushByte(this.buf); this.buf = 0; this.cnt = 0; }
    }
  }
  /** 结尾不足 8 位补 0 凑整字节（解压端靠原始长度知道何时停，不依赖填充） */
  flush() { if (this.cnt > 0) { this.pushByte((this.buf << (8 - this.cnt)) & 0xff); this.buf = 0; this.cnt = 0; } }
  bytes(): Uint8Array { return this.out.subarray(0, this.len); }
}

class BitReader {
  private buf = 0; private cnt = 0; private pos = 0;
  constructor(private src: Uint8Array) {}
  bit(): number {
    if (this.cnt === 0) {
      if (this.pos >= this.src.length) throw new Error('truncated compressed save');
      this.buf = this.src[this.pos++]; this.cnt = 8;
    }
    this.cnt--; return (this.buf >> this.cnt) & 1;
  }
  bits(n: number): number { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.bit(); return v; }
}

const ENC = new TextEncoder(), DEC = new TextDecoder();
const MAX_SAVE_BYTES = 64 * 1024 * 1024;
/** 3 字节序列的哈希表 + 链（指向各自前一次出现），匹配窗口 64KB，链深 32 —— 对 MB 级 JSON 足够快 */
const TABLE = 1 << 15, MAX_CHAIN = 32, MAX_LEN = 258, WINDOW = 65536;

let _headPool: Int32Array | null = null;
let _prevPool: Int32Array | null = null;

export function zipSave(s: string, fast = false): string {
  const bytes = ENC.encode(s);
  const n = bytes.length;
  if (n > MAX_SAVE_BYTES) throw new Error('save exceeds 64 MiB');
  const w = new BitWriter(Math.max(4096, (n >>> 1) + 64));
  w.bits(n, 32);
  const head = (_headPool && _headPool.length === TABLE ? _headPool : (_headPool = new Int32Array(TABLE)));
  head.fill(-1);
  const prev = (_prevPool && _prevPool.length >= n ? _prevPool : (_prevPool = new Int32Array(Math.max(n, 65536))));
  const hashOf = (i: number) => (((bytes[i] << 10) ^ (bytes[i + 1] << 5) ^ bytes[i + 2]) & (TABLE - 1));
  const insert = (i: number) => { if (i + 2 < n) { const h = hashOf(i); prev[i] = head[h]; head[h] = i; } };
  const maxChain = fast ? 4 : MAX_CHAIN;
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestOff = 0;
    if (i + 2 < n) {
      let cand = head[hashOf(i)];
      const limit = i - WINDOW;
      let chain = 0;
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      while (cand >= 0 && cand > limit && chain++ < maxChain) {
        if (bytes[cand] === b0 && bytes[cand + 1] === b1 && bytes[cand + 2] === b2
          && (bestLen < 3 || (i + bestLen < n && bytes[cand + bestLen] === bytes[i + bestLen]))) {
          let l = 3;
          const maxL = Math.min(MAX_LEN, n - i);
          while (l < maxL && bytes[cand + l] === bytes[i + l]) l++;
          if (l > bestLen) { bestLen = l; bestOff = i - cand; if (l >= (fast ? 48 : MAX_LEN)) break; }
        }
        cand = prev[cand];
      }
    }
    if (bestLen >= 3) {
      w.bit(1); w.bits(bestOff - 1, 16); w.bits(bestLen - 3, 8);
      const end = i + bestLen;
      if (fast && bestLen > 12) {
        insert(i);
        i = end;
      } else {
        while (i < end) insert(i++);
      }
    } else {
      w.bit(0); w.bits(bytes[i], 8);
      insert(i++);
    }
  }
  w.flush();
  const out = w.bytes();
  // 每个字节存成一个字符（码点 0-255，localStorage 按字符计配额，1 字节 = 1 字符）
  let bin = '';
  for (let k = 0; k < out.length; k += 0x8000) bin += String.fromCharCode(...out.subarray(k, Math.min(out.length, k + 0x8000)));
  return MAGIC + bin;
}

const WORKER_SRC = `
const ENC = new TextEncoder();
const TABLE = ${TABLE}, MAX_LEN = ${MAX_LEN}, WINDOW = ${WINDOW};
self.onmessage = (ev) => {
  const { id, s } = ev.data;
  try {
    const bytes = ENC.encode(s), n = bytes.length;
    let out = new Uint8Array(Math.max(4096, (n >>> 1) + 64)), len = 0, buf = 0, cnt = 0;
    const push = (b) => { if (len === out.length) { const nxt = new Uint8Array(out.length * 2); nxt.set(out); out = nxt; } out[len++] = b; };
    const bits = (v, nb) => {
      let rem = nb;
      while (rem > 0) {
        const take = Math.min(rem, 8 - cnt), mask = (1 << take) - 1;
        buf = (buf << take) | ((v >>> (rem - take)) & mask);
        cnt += take; rem -= take;
        if (cnt === 8) { push(buf); buf = 0; cnt = 0; }
      }
    };
    bits(n, 32);
    const head = new Int32Array(TABLE).fill(-1);
    const prev = new Int32Array(n);
    const hashOf = (i) => (((bytes[i] << 10) ^ (bytes[i + 1] << 5) ^ bytes[i + 2]) & (TABLE - 1));
    const insert = (i) => { if (i + 2 < n) { const h = hashOf(i); prev[i] = head[h]; head[h] = i; } };
    let i = 0;
    while (i < n) {
      let bestLen = 0, bestOff = 0;
      if (i + 2 < n) {
        let cand = head[hashOf(i)]; const limit = i - WINDOW; let chain = 0;
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        while (cand >= 0 && cand > limit && chain++ < 4) {
          if (bytes[cand] === b0 && bytes[cand + 1] === b1 && bytes[cand + 2] === b2
            && (bestLen < 3 || (i + bestLen < n && bytes[cand + bestLen] === bytes[i + bestLen]))) {
            let l = 3; const maxL = Math.min(MAX_LEN, n - i);
            while (l < maxL && bytes[cand + l] === bytes[i + l]) l++;
            if (l > bestLen) { bestLen = l; bestOff = i - cand; if (l >= 48) break; }
          }
          cand = prev[cand];
        }
      }
      if (bestLen >= 3) {
        bits(1, 1); bits(bestOff - 1, 16); bits(bestLen - 3, 8);
        const end = i + bestLen;
        if (bestLen > 12) { insert(i); i = end; } else { while (i < end) insert(i++); }
      } else {
        bits(0, 1); bits(bytes[i], 8); insert(i++);
      }
    }
    if (cnt > 0) push((buf << (8 - cnt)) & 0xff);
    let bin = '';
    for (let k = 0; k < len; k += 0x8000) bin += String.fromCharCode(...out.subarray(k, Math.min(len, k + 0x8000)));
    self.postMessage({ id, ok: true, out: '${MAGIC}' + bin });
  } catch (e) {
    self.postMessage({ id, ok: false });
  }
};`;

let _zipWorker: Worker | null | undefined;
let _zipSeq = 0;
const _zipCbs = new Map<number, (z: string | null) => void>();

export function zipSaveAsync(s: string, cb: (zipped: string | null) => void): boolean {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  if (_zipWorker === undefined) {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      _zipWorker = new Worker(url);
      URL.revokeObjectURL(url);
      _zipWorker.onmessage = (ev: MessageEvent) => {
        const { id, ok, out } = ev.data || {};
        const fn = _zipCbs.get(id);
        _zipCbs.delete(id);
        fn?.(ok ? out : null);
      };
      _zipWorker.onerror = () => {
        for (const fn of _zipCbs.values()) fn(null);
        _zipCbs.clear();
        _zipWorker = null;
      };
    } catch {
      _zipWorker = null;
    }
  }
  if (!_zipWorker) return false;
  const id = ++_zipSeq;
  _zipCbs.set(id, cb);
  _zipWorker.postMessage({ id, s });
  return true;
}

export function unzipSave(v: string): string {
  if (!v.startsWith(MAGIC)) return v;                    // 旧明文档：原样返回
  const src = new Uint8Array(v.length - MAGIC.length);
  for (let i = 0; i < src.length; i++) src[i] = v.charCodeAt(i + MAGIC.length) & 0xff;
  const r = new BitReader(src);
  const total = r.bits(32) >>> 0;
  // 防止损坏或恶意存档的长度头触发巨额分配。此上限远大于常见本地存档。
  if (total > MAX_SAVE_BYTES) throw new Error('compressed save exceeds 64 MiB');
  const out = new Uint8Array(total);
  let p = 0;
  while (p < total) {
    if (r.bit() === 0) out[p++] = r.bits(8);
    else {
      const off = r.bits(16) + 1, len = r.bits(8) + 3;
      if (off > p || len > total - p) throw new Error('invalid compressed save reference');
      let from = p - off;
      for (let k = 0; k < len && p < total; k++, from++, p++) out[p] = out[from];
    }
  }
  return DEC.decode(out);
}
