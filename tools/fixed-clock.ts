// 测试用：把 performance.now / Date.now 换成假时钟，每读一次走 STEP 毫秒。
// 游戏里有几处按真实时间分帧做的活（众生的日结算 NpcDayScheduler.pump 每帧只做 2 毫秒、离屏地形分片等），
// 一帧做完多少取决于机器快慢，同一个随机种子连跑两次结果也不同。导入本模块后，每帧做的量只取决于读了几次时钟，可重复。
const STEP = 0.05;
let perf = 0, wall = Date.UTC(2026, 0, 1);
const fake = () => (perf += STEP);
Object.defineProperty(performance, 'now', { value: fake, configurable: true, writable: true });
Date.now = () => (wall += STEP);
export const fixedClock = { get perf() { return perf; } };
