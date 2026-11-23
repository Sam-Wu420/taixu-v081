import { ACTIVE_MAP } from '../data/world';
import { planRise, planHit, knollCut, planWeight, onPlanStair, planReach, resolvePlan, planDeck, planDeckBox, type GrandSectPlan } from '../data/sectPlan';
export interface SurfaceRoad { x1: number; y1: number; x2: number; y2: number; width: number }
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** massif：P10 占山的大宗门——这处地点整出的是一整座山（多层台地、石阶），见 data/sectPlan.ts；flat：P10 成片街坊的城——平原上也整平（城墙、街面要平） */
export interface SurfaceSite { id: string; x: number; y: number; radius: number; kind: string; massif?: GrandSectPlan | null; flat?: boolean }
export interface SurfaceSource {
  elevationAt(x: number, y: number): number;
  /**
   * 图外的交界地带：返回这一点在「交界坐标系」里的 y 和渐变系数 k（0 = 还在图内，1 = 完全按交界坐标算）。
   * 地表的细碎起伏是按坐标取的噪声，两张图在交界处必须取同一个坐标，高度才对得上。不给这个函数就都按本图坐标算。
   */
  gapFrame?(x: number, y: number): { x: number; y: number; k: number } | null;
  roads: readonly SurfaceRoad[];
  sites: readonly SurfaceSite[];
  /** 陆地值（> 0.5 是陆地，和 Terrain.isLand 同一个数）。给了的话平台的护坡不往水面上垫（见 applyPlatforms） */
  landAt?(x: number, y: number): number;
}

const HEIGHT_SCALE = 600;
/**
 * 真实高山：2026-11-13 起是默认的画法（用户定的）。网址带 ?mtn=0 退回平缓地形（记在 localStorage taixu.flat=1），?mtn=1 再打开。
 * 山的位置仍由原版的宏观高程网格决定，所以山还在原来的地方；只是把高度曲线拉开，并叠加山脊和冲沟。
 * （样板阶段用过的 taixu.mountains 这个键不再看：那时为了对比测试写进去的「0」不该把默认值压掉。）
 */
export const MOUNTAINS = (() => {
  // 无头脚本在导入本模块之前设 globalThis.__TAIXU_MOUNTAINS = false 可以退回平缓地形
  const forced = (globalThis as { __TAIXU_MOUNTAINS?: boolean }).__TAIXU_MOUNTAINS;
  if (typeof forced === 'boolean') return forced;
  try {
    if (typeof location !== 'undefined' && typeof localStorage !== 'undefined') {
      const q = new URLSearchParams(location.search).get('mtn');
      if (q === '0') localStorage.setItem('taixu.flat', '1'); else if (q !== null) localStorage.removeItem('taixu.flat');
    }
    return !(typeof localStorage !== 'undefined' && localStorage.getItem('taixu.flat') === '1');
  } catch { return true; }
})();
/** 地面可能达到的最高处（世界单位），反投影和裁剪面用 */
export const SURFACE_MAX_HEIGHT = MOUNTAINS ? 11500 : 2048;
/** 高山模式下山道更陡（石阶），平地模式保持原值 */
const ROAD_GRADE = MOUNTAINS ? 0.5 : 0.16;
/**
 * 步行限坡。平地模式沿用 0.4；高山模式放宽到 0.8（约 39 度）：缓坡和一般山坡都能爬（越陡越慢，见 Terrain.walkFactor），
 * 只有峭壁挡路。山道（道路的路基）不受限坡约束——那是凿出来的石阶。
 */
const SLOPE_LIMIT = MOUNTAINS ? 0.8 : 0.4;
/** 路基半宽的下限：高山模式下至少 100，保证路中线两侧各有一排地形网格顶点落在整平的路基里 */
const ROAD_BED = MOUNTAINS ? 100 : 0;
/** 非宗门地点（村镇、洞府、巢穴）在高山模式下也整平出一小块台地，免得房子挂在坡上 */
const SITE_EDGE = 520;
/**
 * 高山模式：平台外再往外这么远的路口也按平台高度钉住，路面出了平台还平一小段再起坡——
 * 平台的过渡带不再压在路面上（见 rawHeight），路面在平台边上必须和平台一样高，不留台阶
 */
const PIN_REACH = MOUNTAINS ? 200 : 0;
/**
 * 第五轮地形线：两处平台之间的山道最陡多少。两处地点各按各的地面取平，台面高差几千、两块台面之间的路只有一两千步时，
 * 路面就是一道峭壁（坡度 3）。现在按路网上的距离把平台高度往一块儿挪（relaxPlatforms），让两台之间的路不陡过这个数；
 * 挪开的高差由平台四周的护坡（BANK）收掉。
 */
const PLATFORM_GRADE = 0.7;
/** 第六轮返工：路面掺别的路掺得太多、交叉口前略陡的个别地方（世界坐标），见 Surface.patchFall */
const ROAD_PATCHES: Partial<Record<string, [number, number][]>> = { tiannan: [[509120, 321400]] };
const ROAD_PATCH_R = 450;
/** 分岔路口两边连着高低悬殊的地点、按山道坡度推不平时，那一片路口之间的路最陡放到多少（原来是取平均，摊出来的坡度不受控） */
const ROAD_STEEP = 0.75;
/**
 * 平台四周的护坡：平台面和原地形高差大时（台子挪过高度、或坐在山尖 / 坡腰上），台沿外的地面不陡过这个坡度——
 * 台子悬在山尖上时垫出一圈土坡，切进山腰时削出一圈退台坡，不再是台沿外一道几千高的峭壁（「斜插」「悬空」）。
 * 取步行限坡，护坡上走得动。
 */
const BANK = 0.8;
/** 护坡只管台沿一带的高差（BANK·s0 收得下台沿附近原地形和台面的高差）；再往外按这个陡得多的坡放开，不去削远处的山头 */
const BANK_OUT = 2.5;
/** 不靠路相连的两处平台，台沿相距这么近以内也要护坡对得上（见 relaxPlatforms） */
const PROX_GAP = 6000;
/** 原地面低于这个高度按水底算（海、湖），护坡不往上垫 */
const SEA_FLOOR = 20;
const bankLimit = (s: number, s0: number) => s <= s0 ? BANK * s : BANK * s0 + BANK_OUT * (s - s0);
/** 护坡和原地形接上的那道折线按这么宽抹圆（不留一条硬棱） */
const BANK_ROUND = 160;
/** 平滑取小 / 取大（多项式 smooth min），k 是抹圆的宽度 */
const smin = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 值噪声，0..1 */
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** 山脊噪声，0..1：每一层取 1-|n| 的平方得到尖脊，上一层越高下一层权重越大，山脊上细节多、谷底平缓 */
function ridged(x: number, y: number): number {
  let sum = 0, amp = 0.5, freq = 1, weight = 1, norm = 0;
  for (let o = 0; o < 5; o++) {
    let n = 1 - Math.abs(vnoise(x * freq + o * 17.13, y * freq - o * 9.31) * 2 - 1);
    n *= n * weight; weight = Math.max(0, Math.min(1, n * 2));
    sum += n * amp; norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}
/** 山体的大轮廓：宏观高程 e → 高度。平原基本不变，山区按幂次拉高（e=0.6 约 2500，e=0.8 约 4400，e=1.2 约 9300） */
function massHeight(e: number): number {
  if (!MOUNTAINS) return e * HEIGHT_SCALE;
  const m = Math.max(0, e - 0.14) / 1.06;
  return e * HEIGHT_SCALE + 8600 * Math.pow(m, 1.55);
}
/** 完整高度：大轮廓 + 域扭曲后的山脊噪声（只在山区起作用） */
function shapedHeight(e: number, x: number, y: number): number {
  if (!MOUNTAINS) return e * HEIGHT_SCALE;
  const mask = smooth((e - 0.2) / 0.45);
  if (mask <= 0) return massHeight(e);
  const m = Math.max(0, e - 0.14) / 1.06;
  const wx = x + 900 * (vnoise(x / 2600 + 3.1, y / 2600 - 7.7) - 0.5), wy = y + 900 * (vnoise(x / 2600 - 11.3, y / 2600 + 5.9) - 0.5);
  // 大山脊（波长约 3 千）定走向，小一号的山脊（波长约 9 百）刻出冲沟；越高的山体起伏越大
  const big = (ridged(wx / 3200, wy / 3200) - 0.42) * 2400 * (0.45 + m);
  const gully = (ridged(wx / 900 + 31.7, wy / 900 - 12.9) - 0.4) * 520 * (0.4 + m);
  return massHeight(e) + (big + gully) * mask;
}
const CELL = 3000;
const PLATFORM_EDGE = 1600;
const ROAD_EDGE = 350;
const SAMPLE_STEP = 60;
const MESH_STEP = 64;
const PLATFORM_GRID_MARGIN = Math.SQRT2 * MESH_STEP;
// 高山模式下视野里常有两三百个地块（每块 289 个顶点），3 万多格的缓存会互相冲掉、每帧重算高度；放大到 26 万格。
// P10 收尾：占山宗门镜头 0.13 时一屏四百多块地面、五千来棵树逐帧问脚下高度，26 万格的直接映射缓存仍互相冲掉，再放大到 100 万格（12MB）
const VERTEX_CACHE_SIZE = MOUNTAINS ? 1048576 : 32768;
const NONE: readonly never[] = Object.freeze([]) as readonly never[];
const FORCED_HEIGHT: Record<string, number> = { qixuan: 360, huangfeng: 420 };
/** reach：护坡最远伸到台沿外多远（索引范围要包住它）；natural：整平之前原地的高度（取平用的那个数），挪高度时作参照 */
interface Platform extends SurfaceSite { height: number; edge: number; reach: number; s0: number; natural: number }
/** 占山的宗门：plan 是规划（相对地点中心），base 是基准面（山门广场）的海拔 */
interface Massif { plan: GrandSectPlan; x: number; y: number; base: number }
/**
 * 山门广场（基准面）定在多高：取所在山体的大轮廓高度；在高山里时至少 3600——整座宗门都在云层（3300）之上，
 * 站在山上时云海铺在山脚下，不会把下面几层台地盖住。平原上的宗门就按原地高度（以后铺开时再定怎么堆山）。
 */
/**
 * 宗门的基准面（山门广场）定在多高：跟着原地形走，不硬抬。
 *   本来在山里的：取所在山体的大轮廓高度（不含山脊细节）；
 *   平地上的：取山门一带原地面的平均高度（再自己堆一座小山上去）。
 */
const baseOfMassif = (plan: GrandSectPlan, e: number, natural: (lx: number, ly: number) => number) => {
  if (plan.mountain) return massHeight(e);
  let h = 0; const g = plan.gate;
  for (const [dx, dy] of [[0, 0], [600, 0], [-600, 0], [0, 600], [0, -600]]) h += natural(g.x + dx, g.y + dy) / 5;
  return h;
};
interface Road extends SurfaceRoad { h1: number; h2: number }
/** pin：钉住的高度（平台、山门、平原村镇里的路口），NaN = 没钉 */
/**
 * ground：这一点原来的地面高度（路要尽量贴着它）；owner：钉住这一点的平台（组的代表），挪平台高度时跟着变；
 * fixed：钉死、不随平台挪的高度（占山宗门的山门、平原上没整平台的地点），NaN = 不是这种；plain：落在没整平台的地点里
 */
interface RoadNode { x: number; y: number; ground: number; height: number; minimum: number; pin: number; owner: Platform | null; fixed: number; plain: boolean; edges: RoadEdge[]; links: RoadEdge[]; adj: RoadEdge[] }
type RoadEdge = { node: RoadNode; e: { length: number; grade: number } };

/** 世界高度由宏观高程、宗门平台和道路共同决定。 */
export class TerrainSurface {
  private platforms = new Map<number, Platform[]>();
  private massifs = new Map<number, Massif[]>();
  /** 悬在半空能走的面（铁索桥、悬空峰顶）：世界坐标外接框与所属的山。heightAt 先查这里，地形网格不查（terrainHeightAt） */
  private decks: { x0: number; y0: number; x1: number; y1: number; m: Massif }[] = [];
  private deckX0 = Infinity; private deckX1 = -Infinity; private deckY0 = Infinity; private deckY1 = -Infinity;
  /** 各座占山宗门的基准面海拔（按地点 id），布局与测试用 */
  readonly massifBase = new Map<string, number>();
  private roads = new Map<number, Road[]>();
  private source: SurfaceSource;
  private vertexX = new Int32Array(VERTEX_CACHE_SIZE).fill(-2147483648);
  private vertexY = new Int32Array(VERTEX_CACHE_SIZE);
  private vertexHeights = new Float32Array(VERTEX_CACHE_SIZE);

  constructor(source: SurfaceSource) {
    this.source = source;
    const platformIds = new Set<string>(), allPlatforms: Platform[] = [];
    for (const site of source.sites) {
      if (site.massif) {
        // 占山的宗门：不整单块平台，整一座山（台地、陡坎、石阶都在 applyMassifs 里）
        const base = baseOfMassif(site.massif, source.elevationAt(site.x, site.y), (lx, ly) => this.shaped(site.x + lx, site.y + ly));
        // 落在山脚的石阶端点：按那里原来的地面高度定（不含道路，路口本来就在地界外）
        const plan = resolvePlan(site.massif, (lx, ly) => this.shaped(site.x + lx, site.y + ly), base);
        const m: Massif = { plan, x: site.x, y: site.y, base };
        this.massifBase.set(site.id, m.base);
        // 索引范围：地界加过渡带，再把伸出去的登天长阶、歇脚台包进来
        const R = planReach(plan, PLATFORM_GRID_MARGIN);
        let xa = R.cx - R.rx, ya = R.cy - R.ry, xb = R.cx + R.rx, yb = R.cy + R.ry;
        for (const s of plan.stairs) { xa = Math.min(xa, s.x1 - 400, s.x2 - 400); xb = Math.max(xb, s.x1 + 400, s.x2 + 400); ya = Math.min(ya, s.y1 - 400, s.y2 - 400); yb = Math.max(yb, s.y1 + 400, s.y2 + 400); }
        this.index(this.massifs, m, site.x + xa, site.y + ya, site.x + xb, site.y + yb);
        const box = planDeckBox(plan);
        if (box) {
          const d = { x0: site.x + box.x0, y0: site.y + box.y0, x1: site.x + box.x1, y1: site.y + box.y1, m };
          this.decks.push(d);
          this.deckX0 = Math.min(this.deckX0, d.x0); this.deckX1 = Math.max(this.deckX1, d.x1); this.deckY0 = Math.min(this.deckY0, d.y0); this.deckY1 = Math.max(this.deckY1, d.y1);
        }
        continue;
      }
      const sect = site.kind === 'sect';
      if (!sect && !MOUNTAINS && !site.flat) continue;
      let height: number, edge = PLATFORM_EDGE;
      if (sect) {
        // 宗门平台停在所在山体的真实海拔上（取大轮廓高度，不含山脊细节）
        height = Math.max(massHeight(source.elevationAt(site.x, site.y)), FORCED_HEIGHT[site.id] ?? 180);
      } else {
        // 其他地点：就地取平——中心和四周几个点的平均高度，台地小、过渡短；平原上的地点本来就平，不必处理
        if (source.elevationAt(site.x, site.y) < 0.2 && !site.flat) continue;
        const r = site.radius * 0.6;
        height = 0;
        for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) height += shapedHeight(source.elevationAt(site.x + dx, site.y + dy), site.x + dx, site.y + dy) / 5;
        edge = site.flat ? PLATFORM_EDGE : SITE_EDGE;
      }
      const platform: Platform = { ...site, height, edge, reach: 0, s0: 0, natural: height };
      platformIds.add(site.id);
      allPlatforms.push(platform);
    }
    const rootOf = new Map<Platform, Platform>();
    if (MOUNTAINS) {
      /*
       * 高山模式：两处地点的平台挨在一起（台面几乎相接）却各按各的地面取平、高低差几百上千时，两块台面之间是一道峭壁，
       * 连着两处的路只能从崖上直上直下。挨着的平台并成一组、取同一个高度：宗门的优先（有定死的高度），其次成片的城，再其次地界大的。
       */
      const rank = (p: Platform) => (p.kind === 'sect' ? 2e9 : 0) + (p.flat ? 1e9 : 0) + p.radius;
      const group = new Map<Platform, Platform>();
      const find = (p: Platform): Platform => { let r = p; while (group.get(r) && group.get(r) !== r) r = group.get(r)!; return r; };
      for (let i = 0; i < allPlatforms.length; i++) for (let j = i + 1; j < allPlatforms.length; j++) {
        const a = allPlatforms[i], b = allPlatforms[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + 2 * PLATFORM_GRID_MARGIN + 2 * PIN_REACH) continue;
        const ra = find(a), rb = find(b);
        if (ra === rb) continue;
        if (rank(ra) >= rank(rb)) group.set(rb, ra); else group.set(ra, rb);
      }
      for (const p of allPlatforms) { const r = find(p); rootOf.set(p, r); p.height = r.height; }
    }
    // 先只按「平台本身 + 台外 PIN_REACH」索引，用来认路口归哪处平台；平台高度挪定、护坡多宽算出来以后再建正式索引
    const pinIndex = new Map<number, Platform[]>();
    for (const p of allPlatforms) { const e = p.radius + PLATFORM_GRID_MARGIN + PIN_REACH; this.index(pinIndex, p, p.x - e, p.y - e, p.x + e, p.y + e); }
    // 高山模式下没整平台的地点（平原上的村镇等）也按地面高度钉住路口，见下面「一段一段的山道各定坡度」
    const plainSites = new Map<number, SurfaceSite[]>();
    if (MOUNTAINS) for (const site of source.sites) {
      if (site.massif || platformIds.has(site.id)) continue;
      this.index(plainSites, site, site.x - site.radius, site.y - site.radius, site.x + site.radius, site.y + site.radius);
    }
    const nodes = new Map<string, RoadNode>();
    const getNode = (x: number, y: number): RoadNode => {
      const id = `${x},${y}`;
      let node = nodes.get(id);
      if (!node) {
        let owner: Platform | null = null, fixed = NaN, plain = false;
        // 平台外的那一小段（PIN_REACH）只在挨着一处平台时才钉：两处平台挨得很近时不把两头钉成相邻的两个高度
        const reach = this.nearby(pinIndex, x, y).filter(site => Math.hypot(x - site.x, y - site.y) <= site.radius + PLATFORM_GRID_MARGIN + PIN_REACH);
        for (const site of reach) {
          const d = Math.hypot(x - site.x, y - site.y);
          if (d <= site.radius + PLATFORM_GRID_MARGIN || reach.length === 1) owner = rootOf.get(site) ?? site;
        }
        // 路口落在占山宗门的地界里（只有山门那一处）：这一点的高度定死，路从这里往外按坡度降下去
        for (const m of this.nearby(this.massifs, x, y)) if (planWeight(m.plan, x - m.x, y - m.y) >= 1) { fixed = m.base + planRise(m.plan, x - m.x, y - m.y); owner = null; }
        // 高山模式：路口落在没整平台的地点里（平原上的村镇），按那里的地面高度钉住——不让远处山顶上的地点把路整段托在半空
        if (!owner && fixed !== fixed) for (const site of this.nearby(plainSites, x, y)) if (Math.hypot(x - site.x, y - site.y) <= site.radius) plain = true;
        node = { x, y, ground: 0, height: 0, minimum: -Infinity, pin: NaN, owner, fixed, plain, edges: [], links: [], adj: [] };
        nodes.set(id, node);
      }
      return node;
    };
    const grade = ROAD_GRADE;
    const linkedRoads = source.roads.map(road => {
      const a = getNode(road.x1, road.y1), b = getNode(road.x2, road.y2);
      const e = { length: Math.hypot(road.x2 - road.x1, road.y2 - road.y1), grade };
      a.edges.push({ node: b, e });
      b.edges.push({ node: a, e });
      return { road, a, b };
    });
    if (MOUNTAINS) {
      /*
       * 两条路交叉、或擦着走过（路基挨上）却不在同一个路口：路网里它们不相连，各按各的坡度定高度，交叉处一高一低差上千，
       * 路面在那里是一道坎（石林古阵一带坡度 3.28）。离得这么近的两个路口之间补一条「看不见的连线」，
       * 定高度时当成路（不进路网、不改路线，也不算进「两头钉住的一段路」）。
       */
      const LINK = 2 * ROAD_BED + 60, grid = new Map<number, RoadNode[]>();
      const cellKey = (x: number, y: number) => (Math.floor(x / LINK) + 32768) * 65536 + Math.floor(y / LINK) + 32768;
      for (const n of nodes.values()) { const k = cellKey(n.x, n.y); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(n); }
      const linked = (a: RoadNode, b: RoadNode) => a.edges.some(ed => ed.node === b || ed.node.edges.some(f => f.node === b));
      for (const a of nodes.values()) {
        const cx = Math.floor(a.x / LINK), cy = Math.floor(a.y / LINK);
        for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) for (const b of grid.get((i + 32768) * 65536 + j + 32768) ?? NONE) {
          if (b === a || b.x < a.x || (b.x === a.x && b.y <= a.y)) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d > LINK || linked(a, b)) continue;
          const e = { length: Math.max(1, d), grade };
          a.links.push({ node: b, e }); b.links.push({ node: a, e });
        }
      }
      for (const n of nodes.values()) n.adj = n.links.length ? [...n.edges, ...n.links] : n.edges;
      this.relaxPlatforms(allPlatforms, rootOf, nodes);
      for (const p of allPlatforms) p.reach = this.bankReach(p);
    }
    for (const p of allPlatforms) {
      const extent = p.radius + PLATFORM_GRID_MARGIN + Math.max(p.edge, p.reach);
      this.index(this.platforms, p, p.x - extent, p.y - extent, p.x + extent, p.y + extent);
    }
    // 平台高度定了，路口的地面高度和钉住的高度现在才算得出来
    for (const node of nodes.values()) {
      node.ground = this.baseHeight(node.x, node.y);
      const pin = node.owner ? node.owner.height : node.fixed === node.fixed ? node.fixed : node.plain ? node.ground : NaN;
      node.pin = pin; node.minimum = pin === pin ? pin : -Infinity;
    }
    if (MOUNTAINS) {
      /*
       * 一段一段的山道各定坡度。两头都钉住高度的一段路（从一处地点到下一处地点、中间不分岔）：两头高差太大、
       * 按 ROAD_GRADE 走不到时，这一段整段放陡到刚好够（石阶），坡度均匀。
       * 以前只有「最低高度」往外推：山顶上的地点把路整段托在半空（比地面高出几千），到了山脚另一处地点的平台边上
       * 一下子跌下去，路面成了几千高的峭壁（坡度 13）。
       */
      const pinned = (n: RoadNode) => n.minimum > -Infinity;
      for (const p of nodes.values()) {
        if (!pinned(p)) continue;
        for (const first of p.edges) {
          const path = [first.e];
          let prev = p, cur = first.node, length = first.e.length;
          while (!pinned(cur) && cur.edges.length === 2) {
            const next = cur.edges[0].node === prev ? cur.edges[1] : cur.edges[0];
            prev = cur; cur = next.node; path.push(next.e); length += next.e.length;
            if (cur === p) break;
          }
          if (cur === p || !pinned(cur) || !length) continue;
          const need = Math.abs(cur.minimum - p.minimum) / length * 1.0001;
          if (need > grade) for (const e of path) e.grade = Math.max(e.grade, need);
        }
      }
    }
    const all = [...nodes.values()];
    if (!MOUNTAINS) for (const n of all) n.adj = n.edges;
    const solve = () => {
      for (const node of all) node.minimum = node.pin === node.pin ? node.pin : -Infinity;
      // 平台上的节点保留平台高度，最低高度沿道路逐段递减，避免限坡时反向压低平台。
      const lowerQueue = all.filter(node => node.minimum > -Infinity);
      for (let i = 0; i < lowerQueue.length; i++) {
        const node = lowerQueue[i];
        for (const edge of node.adj) {
          const minimum = node.minimum - edge.e.length * edge.e.grade;
          if (edge.node.minimum < minimum) { edge.node.minimum = minimum; lowerQueue.push(edge.node); }
        }
      }
      const queue = [...all];
      // 高山模式：钉住的路口从钉住的高度起推、也不被邻居往下压（以前从「地面和钉住高度取高」起推，平台比原地面低时，
      // 台边第一段路按原地面推出去，最后把路口放回平台高度，台边那几段就陡过了本段坡度——苍岳山脉深处 1.3）
      for (const node of queue) node.height = MOUNTAINS && node.pin === node.pin ? node.pin : Math.max(node.ground, node.minimum);
      for (let i = 0; i < queue.length; i++) {
        const node = queue[i];
        for (const edge of node.adj) {
          const limit = node.height + edge.e.length * edge.e.grade;
          if (edge.node.height > limit && !(MOUNTAINS && edge.node.pin === edge.node.pin)) { edge.node.height = limit; queue.push(edge.node); }
        }
      }
      if (MOUNTAINS) for (const n of all) if (n.pin === n.pin) n.height = n.pin;
    };
    /** 推完以后仍陡过本段坡度的地方（钉住的路口放回原高度后，两边连着高低悬殊的地点），往外扩几个路口 */
    const conflicts = (hops = 8) => {
      const region = new Set<RoadNode>();
      for (const n of all) for (const ed of n.adj) {
        if (Math.abs(n.height - ed.node.height) <= ed.e.length * ed.e.grade * 1.01 + 1) continue;
        if (n.pin !== n.pin) region.add(n);
        if (ed.node.pin !== ed.node.pin) region.add(ed.node);
      }
      for (let hop = 0; hop < hops; hop++) for (const n of [...region]) for (const ed of n.adj) if (ed.node.pin !== ed.node.pin) region.add(ed.node);
      return region;
    };
    solve();
    if (MOUNTAINS) {
      /*
       * 剩下的矛盾：分岔路口两边连着高低悬殊的地点时，上面两遍推完仍有相邻两个路口高差远超坡度（一段路上的峭壁）。
       * 先把矛盾那一片的路放陡到 ROAD_STEEP 再推一遍（两头的平台高度已经按路网距离挪过，通常就够了）；
       * 还剩的，矛盾处往外几个路口一起按相邻路口的距离加权取平均（反复几百遍），把峭壁摊成一段陡坡。
       */
      // 矛盾往往是隔着几十个路口的两处钉住的高度推出来的：一圈不够就扩大范围再来
      let region = conflicts();
      for (const hops of [8, 40, 160]) {
        if (!region.size) break;
        for (const n of conflicts(hops)) for (const ed of n.adj) ed.e.grade = Math.max(ed.e.grade, ROAD_STEEP);
        solve();
        region = conflicts();
      }
      const list = [...region];
      for (let it = 0; it < 400; it++) for (const n of list) {
        let s = 0, w = 0;
        for (const ed of n.adj) { const k = 1 / Math.max(1, ed.e.length); s += ed.node.height * k; w += k; }
        if (w) n.height = s / w;
      }
    }
    for (const { road, a, b } of linkedRoads) {
      const item: Road = { ...road, h1: a.height, h2: b.height };
      const pad = Math.max(road.width / 2, ROAD_BED) + ROAD_EDGE;
      this.index(this.roads, item, Math.min(road.x1, road.x2) - pad, Math.min(road.y1, road.y2) - pad, Math.max(road.x1, road.x2) + pad, Math.max(road.y1, road.y2) + pad);
    }
  }

  // 格子键用数（不再每次问高度都拼三个字符串：飞越时每帧几万次）
  private index<T>(map: Map<number, T[]>, item: T, x1: number, y1: number, x2: number, y2: number) {
    for (let y = Math.floor(y1 / CELL); y <= Math.floor(y2 / CELL); y++) for (let x = Math.floor(x1 / CELL); x <= Math.floor(x2 / CELL); x++) {
      const key = (x + 32768) * 65536 + y + 32768;
      let bucket = map.get(key);
      if (!bucket) map.set(key, bucket = []);
      bucket.push(item);
    }
  }

  private nearby<T>(map: Map<number, T[]>, x: number, y: number): readonly T[] {
    return map.get((Math.floor(x / CELL) + 32768) * 65536 + Math.floor(y / CELL) + 32768) ?? NONE;
  }

  /**
   * 第五轮地形线：按路网距离挪平台高度。两处平台之间（顺着路走）相距 d，台面高差就不该超过 PLATFORM_GRADE·d，
   * 否则两台之间的路只能是一道峭壁（以前最陡 3.14，路钻进崖壁）。只挪村镇、洞府、巢穴、秘境这类小地点的平台（挨着的几块并成一组，挪组的代表）；
   * 宗门、成片的城、占山宗门的山门、平原上没整平台的地点不动。两处都能挪时各挪一半，一处不能挪就由另一处全挪。
   * 挪开的高差由平台四周的护坡收掉（bankReach、applyPlatforms）。全程按坐标和路网算，不取随机数。
   */
  private relaxPlatforms(all: Platform[], rootOf: Map<Platform, Platform>, nodes: Map<string, RoadNode>) {
    const roots = [...new Set(all.map(p => rootOf.get(p) ?? p))], order = new Map(roots.map((p, i) => [p, i]));
    const movable = (p: Platform) => p.kind !== 'sect' && !p.flat;
    // 钉死的路口（不随平台挪）：占山宗门的山门按规划；平原上没整平台的地点按原地形估（本来就平，和最终的地面高度差不多）
    const fixedH = (n: RoadNode) => n.fixed === n.fixed ? n.fixed : n.plain ? this.shaped(n.x, n.y) : NaN;
    const byOwner = new Map<Platform, RoadNode[]>();
    for (const n of nodes.values()) if (n.owner) { let l = byOwner.get(n.owner); if (!l) byOwner.set(n.owner, l = []); l.push(n); }
    type Pair = { a: Platform; b: Platform | null; hb: number; d: number; g: number };
    const pairs: Pair[] = [];
    // 两台高差最多几千，按 PLATFORM_GRADE 摊开也就一万出头：沿路网走这么远就够了
    const CUT = 14000;
    const dist = new Map<RoadNode, number>();
    const heapD: number[] = [], heapN: RoadNode[] = [];
    const push = (d: number, n: RoadNode) => {
      let i = heapD.length; heapD.push(d); heapN.push(n);
      while (i > 0) { const p = (i - 1) >> 1; if (heapD[p] <= d) break; heapD[i] = heapD[p]; heapN[i] = heapN[p]; i = p; }
      heapD[i] = d; heapN[i] = n;
    };
    const pop = (): [number, RoadNode] => {
      const d0 = heapD[0], n0 = heapN[0], d = heapD.pop()!, n = heapN.pop()!, len = heapD.length;
      if (len) {
        let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= len) break; if (c + 1 < len && heapD[c + 1] < heapD[c]) c++; if (heapD[c] >= d) break; heapD[i] = heapD[c]; heapN[i] = heapN[c]; i = c; }
        heapD[i] = d; heapN[i] = n;
      }
      return [d0, n0];
    };
    for (const root of roots) {
      const src = byOwner.get(root);
      if (!src || !movable(root)) continue;
      dist.clear();
      const toPlat = new Map<Platform, number>(), toFixed = new Map<RoadNode, number>();
      for (const n of src) { dist.set(n, 0); push(0, n); }
      while (heapD.length) {
        const [d, n] = pop();
        if (d > (dist.get(n) ?? Infinity)) continue;
        for (const ed of n.adj) {
          const m = ed.node, nd = d + ed.e.length;
          if (nd > CUT || nd >= (dist.get(m) ?? Infinity)) continue;
          dist.set(m, nd);
          // 走到别处钉住的路口：记下距离，不再往前（再往前的由那一处自己去管）
          if (m.owner && m.owner !== root) { if (nd < (toPlat.get(m.owner) ?? Infinity)) toPlat.set(m.owner, nd); continue; }
          if (!m.owner && fixedH(m) === fixedH(m)) { if (nd < (toFixed.get(m) ?? Infinity)) toFixed.set(m, nd); continue; }
          push(nd, m);
        }
      }
      for (const [b, d] of toPlat) if (!movable(b) || order.get(b)! > order.get(root)!) pairs.push({ a: root, b: movable(b) ? b : null, hb: b.height, d, g: PLATFORM_GRADE });
      for (const [m, d] of toFixed) pairs.push({ a: root, b: null, hb: fixedH(m), d, g: PLATFORM_GRADE });
    }
    /*
     * 不靠路相连、却挨得近的两处平台（台沿相距 gap）：两边的护坡各按 BANK 往外收，台面高差超过 BANK·gap 就对不上，
     * 两台之间剩一道崖（星落坑南和丁家东坳台面差五千、台沿只隔两千六）。这样的两处也按直线距离挪近。
     */
    for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
      const a = roots[i], b = roots[j];
      if (!movable(a) && !movable(b)) continue;
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius - 2 * PLATFORM_GRID_MARGIN;
      if (gap > PROX_GAP || gap <= 0) continue;
      if (movable(a)) pairs.push({ a, b: movable(b) ? b : null, hb: b.height, d: gap, g: BANK });
      else pairs.push({ a: b, b: null, hb: a.height, d: gap, g: BANK });
    }
    for (let it = 0; it < 400; it++) {
      let worst = 0;
      for (const p of pairs) {
        const hb = p.b ? p.b.height : p.hb, ex = Math.abs(p.a.height - hb) - p.g * p.d;
        if (ex <= 0.5) continue;
        worst = Math.max(worst, ex);
        const s = Math.sign(hb - p.a.height);
        if (p.b) { p.a.height += s * ex / 2; p.b.height -= s * ex / 2; } else p.a.height += s * ex;
      }
      if (worst < 1) break;
    }
    for (const p of all) p.height = (rootOf.get(p) ?? p).height;
  }

  /**
   * 护坡多大：s0 = 台沿外 600 以内原地形和台面的最大高差 ÷ BANK（这一段按 BANK 收）；再往外按 BANK_OUT 放开。
   * reach = 护坡还在起作用的最远处（一圈一圈往外量），索引范围要包住它，否则护坡在索引边上断成一道坎。
   */
  private bankReach(p: Platform): number {
    const core = p.radius + PLATFORM_GRID_MARGIN, STEP = 150;
    const ring = (s: number, f: (dev: number) => boolean) => {
      const n = Math.min(64, Math.max(16, Math.round((core + s) / 250)));
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI * 2;
        if (f(Math.abs(this.shaped(p.x + Math.cos(a) * (core + s), p.y + Math.sin(a) * (core + s)) - p.height))) return true;
      }
      return false;
    };
    let s0 = 0;
    for (const d of [64, 200, 400, 600]) ring(d, dev => { s0 = Math.max(s0, dev / BANK); return false; });
    p.s0 = s0;
    let reach = 0;
    for (let s = STEP; s <= s0 + 4000; s += STEP) if (ring(s, dev => dev > bankLimit(s - STEP, s0))) reach = s;
    return reach ? reach + 2 * STEP : 0;
  }

  /** 这一点的自然高度（未整平）。图外的交界地带按交界坐标取噪声，靠近图边的一段在两种取法之间渐变 */
  private shaped(x: number, y: number): number {
    const e = this.source.elevationAt(x, y), gap = this.source.gapFrame?.(x, y);
    if (!gap || gap.k <= 0) return shapedHeight(e, x, y);
    const far = shapedHeight(e, gap.x, gap.y);
    return gap.k >= 1 ? far : shapedHeight(e, x, y) + (far - shapedHeight(e, x, y)) * gap.k;
  }
  private baseHeight(x: number, y: number): number {
    return this.applyPlatforms(this.shaped(x, y), x, y);
  }

  /** coreOnly：只压平台本身（权重为 1 的那一圈），不管过渡带；massif：顺带套占山宗门 */
  private applyPlatforms(initial: number, x: number, y: number, coreOnly = false, massif = true, road = 0): number {
    let height = initial;
    const near = this.nearby(this.platforms, x, y);
    for (const site of near) {
      const d = Math.hypot(x - site.x, y - site.y), s = d - site.radius - PLATFORM_GRID_MARGIN;
      const weight = 1 - smooth(s / site.edge);
      if (coreOnly && weight < 1) continue;
      // 高山模式：台外过渡带不往水面上垫（同护坡，见下）；台面本身照旧整平
      const lift = MOUNTAINS && weight < 1 && site.height > height && this.source.landAt ? smooth((this.source.landAt(x, y) - 0.5) / 0.12) : 1;
      height += (site.height - height) * weight * lift;
    }
    if (!coreOnly && MOUNTAINS) {
      /*
       * 护坡：台沿外的地面不陡过 BANK（台高出四周时是一圈土坡，低于四周时是一圈削出来的退台坡）。
       * 几处平台的护坡叠在一起时不能一处接一处地夹（谁最后夹谁说了算：山腰上的村子被三千外山脚下另一处的护坡削出一道崖）：
       * 取所有护坡下限里最高的 lo、上限里最低的 hi，夹进 [lo, hi]（和先后无关）；两处台面高差太大、护坡对不上（lo > hi）时取两者中间，
       * 陡的那段落在两台中间，不贴着哪一处的台沿。
       */
      let lo = -Infinity, hi = Infinity, any = false;
      for (const site of near) {
        const s = Math.hypot(x - site.x, y - site.y) - site.radius - PLATFORM_GRID_MARGIN;
        if (!(s > 0 && s < site.reach)) continue;
        const lim = bankLimit(s, site.s0);
        lo = Math.max(lo, site.height - lim); hi = Math.min(hi, site.height + lim); any = true;
      }
      if (any) {
        const h0 = height;
        if (lo > hi) height = (lo + hi) / 2;
        else {
          const k = Math.min(BANK_ROUND, (hi - lo) / 2);
          height = k < 1 ? Math.max(lo, Math.min(hi, height)) : smax(smin(height, hi, k), lo, k);
        }
        // 只往上垫陆地，不垫海底、湖底：海岛、海边的平台四周是水，垫起来的海床会从水面下冒出来（水和岸对不上）。
        // 离岸线越近垫得越少（按陆地值和原高度渐变，处处连续），岸线保持原样，台子临海那一面是天然的海崖
        if (height > h0) {
          const land = this.source.landAt ? smooth((this.source.landAt(x, y) - 0.5) / 0.12) : 1;
          height = h0 + (height - h0) * land * smooth((h0 - SEA_FLOOR) / 200);
        }
      }
    }
    return massif && this.massifs.size ? this.applyMassifs(height, x, y, road) : height;
  }

  /**
   * 占山的宗门：地界里整个换成规划的山体（台地平、台沿陡、石阶是直坡），过渡带里渐变回原地形。
   * road：这一点压在路基上的程度（0..1，高山模式才给）。地界外的过渡带里路面优先：路的高度本来就是按「含宗门山坡的地面」定的，
   * 再把山坡叠一遍，绕着山脚走的路就被抬起一截、忽高忽低（藏剑门山脚 1.56）。地界里头（权重 1）、石阶上照旧按规划。
   */
  private applyMassifs(height: number, x: number, y: number, road = 0): number {
    for (const m of this.nearby(this.massifs, x, y)) {
      const lx = x - m.x, ly = y - m.y, w = planWeight(m.plan, lx, ly);
      if (w <= 0) continue;
      let h = m.base + planRise(m.plan, lx, ly);
      // 平地上堆的小山：山坡（不在台面、石阶上）不挖到原地面以下，不会挖出比四周低的坑（山里的宗门整座山按规划，不取原地形的乱峰）；
      // 原地形比台面高出许多（坡地、岛上的山）时，台地切进去的切口按削坡收（knollCut），不留一堵几百高的竖墙
      if (!m.plan.mountain && !planHit.exact && h < height) h = Math.max(h, Math.min(height, m.base + knollCut(planHit.nearRise, planHit.near)));
      height += (h - height) * (road > 0 && w < 1 ? w * (1 - road) : w);
    }
    return height;
  }

  /** 这一点是否在某座占山宗门的地界里；在的话给出那座宗门的规划、本地坐标和基准面 */
  massifAt(x: number, y: number): { plan: GrandSectPlan; lx: number; ly: number; base: number; weight: number } | null {
    for (const m of this.nearby(this.massifs, x, y)) {
      const lx = x - m.x, ly = y - m.y, w = planWeight(m.plan, lx, ly);
      if (w > 0) return { plan: m.plan, lx, ly, base: m.base, weight: w };
    }
    return null;
  }

  /** 脚下的高度：在铁索桥、悬空峰顶上是桥面 / 峰顶，其余是地面（人物、走路、点地面都用这个） */
  heightAt(x: number, y: number): number {
    // 收官 P8（丁）：走进屋里（world/indoor.ts）时脚下是屋里的地坪（铺面石台、殿基），门口一段缓坡；不在屋里返回 NaN
    if (this.floorAt) { const f = this.floorAt(x, y); if (f === f) return f; }
    if (x >= this.deckX0 && x <= this.deckX1 && y >= this.deckY0 && y <= this.deckY1) {
      const h = this.deckAt(x, y);
      if (h === h && this.onDeck(h)) return h;
    }
    return this.terrainHeightAt(x, y);
  }
  /**
   * 主角眼下的绝对高度（上一帧的脚下高度加离地高度），由游戏每帧设；NaN 表示不管（测试、别处直接问高度）。
   * 桥面、悬空峰顶只有「人在桥面高度附近」才算脚下：贴地从桥下穿过、或高高飞过桥上空，都按桥下的地面算，不会被抬到桥面上。
   */
  deckRef = NaN;
  /** 收官 P8（丁）：室内地坪（由 world/indoor.ts 接上）。地形网格（terrainHeightAt）不受它影响 */
  floorAt: ((x: number, y: number) => number) | null = null;
  private onDeck(h: number) { const r = this.deckRef; return r !== r || (r > h - 160 && r < h + 240); }
  /** 桥面 / 峰顶的高度（不在上面返回 NaN） */
  deckAt(x: number, y: number): number {
    for (const d of this.decks) {
      if (x < d.x0 || x > d.x1 || y < d.y0 || y > d.y1) continue;
      const r = planDeck(d.m.plan, x - d.m.x, y - d.m.y);
      if (r === r) return d.m.base + r;
    }
    return NaN;
  }
  /** 地形本身的高度（地形网格用：桥下仍是山谷，不跟着桥面抬起来） */
  terrainHeightAt(x: number, y: number): number {
    const ix = Math.floor(x / MESH_STEP), iy = Math.floor(y / MESH_STEP);
    const u = x / MESH_STEP - ix, v = y / MESH_STEP - iy;
    const a = this.vertexHeight(ix, iy);
    if (u === 0 && v === 0) return a;
    const b = this.vertexHeight(ix + 1, iy), c = this.vertexHeight(ix, iy + 1);
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    const d = this.vertexHeight(ix + 1, iy + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  private vertexHeight(x: number, y: number): number {
    const slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & (VERTEX_CACHE_SIZE - 1);
    if (this.vertexX[slot] === x && this.vertexY[slot] === y) return this.vertexHeights[slot];
    const height = Math.fround(this.rawHeight(x * MESH_STEP, y * MESH_STEP));
    this.vertexX[slot] = x; this.vertexY[slot] = y; this.vertexHeights[slot] = height;
    return height;
  }

  private rawHeight(x: number, y: number): number {
    /*
     * 高山模式：平台的过渡带先套在原地形上，再铺路，最后只把平台本身压平。以前路铺好后整个过渡带再压上去，
     * 路面在过渡带里被往平台高度拉：路和平台高差大时（平台在山腰、路从谷底来），路面在过渡带里是几千高的峭壁。
     * 现在路面就是路自己的高度；平台边上的路口按平台高度钉住（PIN_REACH），路面和平台在台边接平。
     */
    const base = MOUNTAINS ? this.applyPlatforms(this.shaped(x, y), x, y, false, false) : this.shaped(x, y);
    let weightedHeight = 0, totalWeight = 0, strongest = 0;
    const fall = this.patchFall(x, y);   // 第六轮返工：个别交叉口另一条路掺得更少（见 ROAD_PATCHES）
    for (const road of this.nearby(this.roads, x, y)) {
      const dx = road.x2 - road.x1, dy = road.y2 - road.y1;
      const t = Math.max(0, Math.min(1, ((x - road.x1) * dx + (y - road.y1) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(x - road.x1 - dx * t, y - road.y1 - dy * t);
      const weight = 1 - smooth((d - Math.max(road.width / 2, ROAD_BED)) / ROAD_EDGE);
      // 几条路挨着时路面取谁的高度：按路基权重的四次方、再按离中线的距离衰减着平均——重合、并行的路（相隔几十步）照旧对半掺，
      // 交叉口和路基外的过渡带里掺得很少。以前按权重本身平均，三百步外另一条高低不同的路也掺进来三四成，沿路走时掺的多少一变，
      // 路面就陡起来（毒蛟潭北 1.58）
      const w2 = weight * weight, share = MOUNTAINS ? w2 * w2 / (1 + (d / fall) ** 2) : weight;
      weightedHeight += (road.h1 + (road.h2 - road.h1) * t) * share;
      totalWeight += share;
      strongest = Math.max(strongest, weight);
    }
    const height = totalWeight ? base + (weightedHeight / totalWeight - base) * strongest : base;
    return this.applyPlatforms(height, x, y, MOUNTAINS, true, MOUNTAINS ? strongest : 0);
  }

  /**
   * 第六轮返工：几条路挨着时，路面掺别的路的高度按离中线的距离衰减（d / 120）。个别交叉口（一条 0.75 的坡路斜穿一条平路）
   * 掺得多了，坡路在交叉口前那一两段被另一条路往上带，陡到 1.02–1.04（毒蛟潭北，check-steep-roads 量的）。
   * 只在这几处方圆 ROAD_PATCH_R 里衰减得快一倍（再往外 300 步渐回原样），不动全局的参数
   */
  private patchFall(x: number, y: number): number {
    const P = ROAD_PATCHES[ACTIVE_MAP]; if (!P) return 120;
    let k = 0;
    for (const [px, py] of P) { const d = Math.hypot(x - px, y - py); if (d < ROAD_PATCH_R + 300) k = Math.max(k, 1 - smooth((d - ROAD_PATCH_R) / 300)); }
    return 120 - 60 * k;
  }
  /** 是否在山道的路基上（离某条路的中线不超过路基半宽）。高山模式下路上始终能走 */
  onRoadBed(x: number, y: number): boolean {
    if (this.massifs.size) for (const m of this.nearby(this.massifs, x, y)) {
      const lx = x - m.x, ly = y - m.y, p = m.plan;
      // 宗门的石阶始终可走；山体里头（山门附近除外）外面的道路不算路基——台沿的陡坎只能走石阶或御剑
      if (onPlanStair(p, lx, ly)) return true;
      if (Math.hypot((lx - p.cx) / p.rx, (ly - p.cy) / p.ry) < 1 && Math.hypot(lx - p.gate.x, ly - p.gate.y) > 700) return false;
    }
    for (const road of this.nearby(this.roads, x, y)) {
      const dx = road.x2 - road.x1, dy = road.y2 - road.y1;
      const t = Math.max(0, Math.min(1, ((x - road.x1) * dx + (y - road.y1) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x - road.x1 - dx * t, y - road.y1 - dy * t) <= Math.max(road.width / 2, ROAD_BED) + 20) return true;
    }
    return false;
  }

  sample(x: number, y: number): { height: number; slope: number; walkable: boolean } {
    // 桥面、悬空峰顶上：站得住（桥只有一两步宽，按 ±60 取坡度会取到桥外的山谷）
    if (x >= this.deckX0 && x <= this.deckX1 && y >= this.deckY0 && y <= this.deckY1) {
      const d = this.deckAt(x, y);
      if (d === d && this.onDeck(d)) return { height: d, slope: 0, walkable: true };
    }
    // 室内地坪（殿前月台、台阶、铺面石台）：站得住。坡度也不能把它算进去——按 ±60 取会把月台那一道台沿当成陡坡，
    // 台沿边上、台阶上的落脚点就成了「站不住」（test-sect-walk 栖云宗）
    const fa = this.floorAt;
    if (fa) { const f = fa(x, y); if (f === f) return { height: f, slope: 0, walkable: true }; }
    this.floorAt = null;
    try {
      const height = this.heightAt(x, y), h = SAMPLE_STEP;
      const dx = (this.heightAt(x + h, y) - this.heightAt(x - h, y)) / (2 * h);
      const dy = (this.heightAt(x, y + h) - this.heightAt(x, y - h)) / (2 * h);
      const slope = Math.hypot(dx, dy);
      return { height, slope, walkable: slope <= SLOPE_LIMIT || (MOUNTAINS && this.onRoadBed(x, y)) };
    } finally { this.floorAt = fa; }
  }

  canTraverse(ax: number, ay: number, bx: number, by: number): boolean {
    const distance = Math.hypot(bx - ax, by - ay);
    if (!distance) return true;
    const steps = Math.ceil(distance / SAMPLE_STEP), step = distance / steps;
    let previous = this.heightAt(ax, ay), px = ax, py = ay;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, height = this.heightAt(x, y);
      // 太陡的一步：只有两头都在山道上才放行（石阶）
      if (Math.abs(height - previous) / step > SLOPE_LIMIT && !(MOUNTAINS && this.onRoadBed(px, py) && this.onRoadBed(x, y))) return false;
      previous = height; px = x; py = y;
    }
    return true;
  }
}
