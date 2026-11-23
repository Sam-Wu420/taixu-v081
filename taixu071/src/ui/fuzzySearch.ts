// 通用中文/多字段模糊搜索与相关性评分：
// 支持简繁混输、空格分词、隔字跳序（如「青蜂剑」→「青竹蜂云剑」「黄谷」→「黄枫谷」）、
// 颠倒字序（如「基筑丹」→「筑基丹」）、单字容错（如「青竹峰云剑」→「青竹蜂云剑」「筑基丸」→「筑基丹」）
// 以及类型/说明等次要字段加权匹配。

const T2S: Record<string, string> = {
  靈: '灵', 劍: '剑', 門: '门', 寶: '宝', 藥: '药', 陣: '阵', 階: '阶', 萬: '万', 雲: '云', 蒼: '苍',
  華: '华', 淵: '渊', 澤: '泽', 龍: '龙', 鳳: '凤', 鶴: '鹤', 獸: '兽', 邊: '边', 無: '无', 亂: '乱',
  黃: '黄', 紅: '红', 聖: '圣', 師: '师', 淨: '净', 滅: '灭', 斬: '斩', 殺: '杀', 護: '护', 戰: '战',
  鬥: '斗', 勝: '胜', 敗: '败', 隱: '隐', 萃: '萃', 鍛: '锻', 鑄: '铸', 畫: '画', 書: '书', 簡: '简',
  骨: '骨', 鱗: '鳞', 膽: '胆', 內: '内', 極: '极', 絕: '绝', 殘: '残', 雙: '双', 單: '单', 歸: '归',
  飛: '飞', 昇: '升', 築: '筑', 煉: '炼', 結: '结', 嬰: '婴', 氣: '气', 陰: '阴', 陽: '阳', 風: '风',
  電: '电', 霧: '雾', 葉: '叶', 蓮: '莲', 蘭: '兰', 鐵: '铁', 銀: '银', 礦: '矿', 島: '岛', 灣: '湾',
  溪: '溪', 國: '国', 鎮: '镇', 閣: '阁', 樓: '楼', 嶺: '岭', 爐: '炉', 鏡: '镜', 鐘: '钟', 傘: '伞',
  輪: '轮', 環: '环', 鐲: '镯', 珮: '佩', 帶: '带', 訣: '诀', 經: '经', 圖: '图', 錄: '录', 識: '识',
  虛: '虚', 龜: '龟', 鯤: '鲲', 鵬: '鹏', 蛟: '蛟', 妖: '妖', 魔: '魔', 鬼: '鬼', 屍: '尸', 魂: '魂',
  魄: '魄', 血: '血', 髓: '髓', 晶: '晶', 符: '符', 丹: '丹', 鼎: '鼎', 印: '印', 旗: '旗', 袍: '袍',
  靴: '靴', 冠: '冠', 甲: '甲',
};

const STRIP_PUNCT_RE = /[\s·・•\-_—–.,，。、：:；;「」『』【】（）()《》<>？?！!'"`~～/\\]+/g;

export function normalizeFuzzyText(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) return '';
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    out += T2S[ch] ?? ch;
  }
  return out;
}

export interface FuzzyQuery {
  raw: string;
  compact: string;
  tokens: string[];
}

export function prepareFuzzyQuery(raw: string): FuzzyQuery | null {
  const norm = normalizeFuzzyText(raw);
  if (!norm) return null;
  const tokens = norm
    .split(/[\s·・•\-_—–.,，。、：:；;「」『』【】（）()《》<>？?！!'"`~～/\\]+/)
    .filter(Boolean);
  const compact = norm.replace(STRIP_PUNCT_RE, '');
  if (!compact) return null;
  return { raw: norm, compact, tokens: tokens.length ? tokens : [compact] };
}

function subseqMatchScore(q: string, t: string): number {
  let qi = 0;
  let last = -2;
  let consecutive = 0;
  let totalGap = 0;
  let first = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (first < 0) first = ti;
      if (last >= 0) {
        if (ti === last + 1) consecutive++;
        else totalGap += ti - last - 1;
      }
      last = ti;
      qi++;
    }
  }
  if (qi < q.length) return 0;
  const score = 490 + consecutive * 36 - totalGap * 8 - Math.max(0, first) * 3 - Math.max(0, t.length - q.length) * 2;
  return Math.max(220, Math.min(650, score));
}

function bagOverlapCount(q: string, t: string): number {
  if (!q || !t) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let matched = 0;
  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    const left = counts.get(ch) ?? 0;
    if (left > 0) {
      matched++;
      counts.set(ch, left - 1);
    }
  }
  return matched;
}

/** 计算单个主名称/标签字段与查询的模糊匹配得分（0 表示不匹配） */
export function fuzzyScorePrimary(query: FuzzyQuery, rawTarget: string | undefined | null): number {
  if (!rawTarget) return 0;
  const t = normalizeFuzzyText(rawTarget).replace(STRIP_PUNCT_RE, '');
  if (!t) return 0;
  const q = query.compact;

  if (t === q) return 1000;
  if (t.startsWith(q)) return Math.max(820, 900 - (t.length - q.length) * 3);

  const subIdx = t.indexOf(q);
  if (subIdx >= 0) {
    return Math.max(660, 760 - subIdx * 4 - (t.length - q.length) * 2);
  }

  // 多词分段同时命中（例如「青霞 谷」或「灵石 矿」）
  if (query.tokens.length > 1) {
    let allTokensHit = true;
    let tokSum = 0;
    for (const tok of query.tokens) {
      const idx = t.indexOf(tok);
      if (idx < 0) {
        allTokensHit = false;
        break;
      }
      tokSum += idx;
    }
    if (allTokensHit) {
      return Math.max(580, 680 - tokSum * 2 - (t.length - q.length));
    }
  }

  // 隔字跳序匹配（例如「青蜂剑」→「青竹蜂云剑」、「黄谷」→「黄枫谷」、「筑丹」→「筑基丹」）
  const seq = subseqMatchScore(q, t);
  if (seq > 0) return seq;

  // 2 字及以上：全部字无序命中（例如「基筑丹」→「筑基丹」、「谷枫」→「黄枫谷」）
  if (q.length >= 2) {
    const overlap = bagOverlapCount(q, t);
    if (overlap === q.length) {
      return Math.max(180, 320 - Math.max(0, t.length - q.length) * 5);
    }
    // 3 字及以上允许 1 字误差/同音错别字（例如「筑基丸」→「筑基丹」、「青竹峰云剑」→「青竹蜂云剑」）
    if (q.length >= 3 && overlap >= q.length - 1 && t.length <= q.length + 3) {
      return Math.max(110, 175 + overlap * 16 - Math.abs(t.length - q.length) * 12);
    }
    // 4 字及以上且存在更长名称时，允许顺序匹配漏/错 1 字
    if (q.length >= 4) {
      // 检查去掉任意 1 个字符后能否有序子序列命中
      for (let skip = 0; skip < q.length; skip++) {
        const sub = q.slice(0, skip) + q.slice(skip + 1);
        const s2 = subseqMatchScore(sub, t);
        if (s2 > 0) return Math.max(120, Math.round(s2 * 0.45));
      }
    }
  }

  return 0;
}

/** 计算长描述/类型说明字段的模糊得分（避免长文跨句误中，支持分词和短字段跳序） */
export function fuzzyScoreSecondary(query: FuzzyQuery, rawTarget: string | undefined | null): number {
  if (!rawTarget) return 0;
  const t = normalizeFuzzyText(rawTarget).replace(STRIP_PUNCT_RE, '');
  if (!t) return 0;
  const q = query.compact;

  const subIdx = t.indexOf(q);
  if (subIdx >= 0) {
    return Math.max(120, 320 - Math.min(180, subIdx * 2));
  }
  if (query.tokens.length > 1 && query.tokens.every((tok) => t.includes(tok))) {
    return 180;
  }
  if (t.length <= 12) {
    const seq = subseqMatchScore(q, t);
    if (seq > 0) return Math.round(seq * 0.45);
  }
  return 0;
}

export interface FuzzyField {
  text: string | undefined | null;
  weight?: number;
  kind?: 'primary' | 'secondary';
}

/** 取多字段加权最高匹配分；无匹配返回 0 */
export function fuzzyScoreFields(query: FuzzyQuery | null, fields: FuzzyField[]): number {
  if (!query) return 1;
  let best = 0;
  for (const f of fields) {
    if (!f.text) continue;
    const raw = f.kind === 'secondary'
      ? fuzzyScoreSecondary(query, f.text)
      : fuzzyScorePrimary(query, f.text);
    if (raw <= 0) continue;
    const weighted = raw * (f.weight ?? 1);
    if (weighted > best) best = weighted;
  }
  return best;
}
