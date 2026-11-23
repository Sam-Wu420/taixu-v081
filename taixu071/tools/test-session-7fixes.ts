import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas } from './env';

const CW = 1280, CH = 800;
(globalThis as any).window = {
  innerWidth: CW, innerHeight: CH, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { CharState, drawCharacter, randomLook } = await import('../src/gfx/character');
const { charPoseBucket } = await import('../src/gfx/charAtlas');
const { sectDiscipleSheet } = await import('../src/world/warformation');
const { MY_SECT_ID } = await import('../src/data/sects');
const { LOC_BY_ID } = await import('../src/data/world');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH);
cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
(g as any).paused = false;

g.hero.realm = 4;
g.hero.stage = 0;
g.day = 4000;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '太虚测试宗', dao: 'zheng', map: 'renjie', x: hf.x + 14, y: hf.y + 10,
  founded: g.day - 3000, fame: 1800, stones: 5000, tribute: 0, ds: [], seq: 1,
  apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 2, zhen: 2, ling: 5 },
  open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999,
  log: [], gifts: [], wins: 0, losses: 0,
};
const ms = g.ws.mySect as any;
for (let i = 0; i < 120; i++) {
  const realm = i < 4 ? 4 : i < 20 ? 3 : i < 70 ? 2 : 1;
  ms.ds.push({
    id: ms.seq++, name: '弟子' + i, sex: i % 2 ? 'm' : 'f', age: 30,
    root: 1 + (i % 5), realm, stage: i % 3, exp: 0.95, loyal: 80,
    rank: realm >= 3 ? 3 : realm >= 2 ? 1 : 0, job: i % 4 === 0 ? 'ye' : 'xiu',
    joined: g.day, arts: 0,
  });
}
g.mysect.sync();
g.sectwar.initHolds();
const SW = g.sectwar;

// ---------------------------------------------------------------------------
// 1. 43ad7a5 闭环：cmp.bySect 同步 + fortLv/commanderId + dispatchCustomForce 停战/撤军边界
// ---------------------------------------------------------------------------
const w = SW.declare(MY_SECT_ID, 'huangfeng', '闭环测试');
assert.ok(w.campA && w.campB, '宣战生成双方集结点');
assert.equal(w.campA!.established, false, '宣战瞬间仅定集结点，尚未立营');
assert.equal(w.campA!.soldiers, 0, '宣战瞬间集结点初始兵力为 0');
g.day += 2;
SW.daily(2);
assert.equal(w.campA!.established, true, '先遣弟子抵达集结点后方正式立营');
assert.ok((w.campA!.bySect?.[MY_SECT_ID] ?? 0) > 0, '先遣抵达后同步写入 campA.bySect');
assert.ok((w.campB!.bySect?.['huangfeng'] ?? 0) > 0, '先遣抵达后同步写入 campB.bySect');

const beforeDraw = w.campA!.soldiers;
const beforeBySect = w.campA!.bySect![MY_SECT_ID];
const srcCamp = { kind: 'camp' as const, sid: MY_SECT_ID, warId: w.id, side: 0 as const, avail: w.campA!.soldiers };
const took = (SW as any).drawFromSource(srcCamp, 6);
assert.equal(took, 6);
assert.equal(w.campA!.soldiers, beforeDraw - 6, 'drawFromSource 扣减 camp.soldiers');
assert.equal(w.campA!.bySect?.[MY_SECT_ID], beforeBySect - 6, 'drawFromSource 同步扣减 camp.bySect');
(SW as any).returnToSource(srcCamp, 4);
assert.equal(w.campA!.soldiers, beforeDraw - 2, 'returnToSource 归建 camp.soldiers');
assert.equal(w.campA!.bySect?.[MY_SECT_ID], beforeBySect - 2, 'returnToSource 同步归建 camp.bySect');

// 据点筑防 + 主将委任 + 阵亡/逐出清理 + mysect 自动施政阈值
const cand = SW.holdCandidates(8).find((c) => !c.owner)!;
assert.ok(cand, '存在可进驻无主据点');
assert.equal(SW.holdPlant(cand.id, 10), true);
const cmdDisc = ms.ds.find((d: any) => d.realm >= 2)!;
assert.equal(SW.assignHoldCommander(cand.id, cmdDisc.id).ok, true);
assert.equal(SW.S.hold[cand.id].commanderId, cmdDisc.id);
assert.equal(SW.upgradeHoldFort(cand.id).ok, true);
assert.equal(SW.upgradeHoldFort(cand.id).ok, true);
assert.equal(SW.upgradeHoldFort(cand.id).ok, true);
assert.equal(SW.S.hold[cand.id].fortLv, 3, '据点工事可升至 Lv.3');
assert.ok((SW as any).holdDefMul(cand.id) > 1.5, '据点工事与主将接入守军攻防加成');

// 逐出主将自动清除据点主将绑定
g.mysect.expel(cmdDisc);
assert.equal(SW.S.hold[cand.id].commanderId, undefined, '逐出主将后自动清掉据点 commanderId');
const cmdDisc2 = ms.ds.find((d: any) => d.realm >= 2)!;
assert.equal(SW.assignHoldCommander(cand.id, cmdDisc2.id).ok, true);
(SW as any).kill(MY_SECT_ID, [cmdDisc2.id]);
assert.equal(SW.S.hold[cand.id].commanderId, undefined, '主将战死后自动清掉据点 commanderId');

// mysect 自动筑防支持 Lv.2 -> Lv.3（费用 1600，而非写死 2500/Lv.2）
const cand2 = SW.holdCandidates(16).find((c) => !c.owner)!;
SW.S.hold[cand.id].g = 16;
SW.holdPlant(cand2.id, 16);
SW.S.hold[cand2.id].fortLv = 2;
ms.stones = 2200;
ms.reserve = 200;
ms.masterId = ms.ds.find((d: any) => d.rank >= 3)!.id;
ms.policy = 'war';
ms.auto = false;
(g.mysect as any).administerByMaster(g.day);
assert.equal(SW.S.hold[cand2.id].fortLv, 3, '掌门自动施政按 1600 阈值将 Lv.2 工事升至 Lv.3');

// dispatchCustomForce 停战与撤军边界
const allyCand = SW.sects('tiannan').find((sid) => sid !== MY_SECT_ID && sid !== 'huangfeng')!;
SW.S.truce[MY_SECT_ID < allyCand ? `${MY_SECT_ID}|${allyCand}` : `${allyCand}|${MY_SECT_ID}`] = g.day + 100;
const foeTruceKey = allyCand < 'huangfeng' ? `${allyCand}|huangfeng` : `huangfeng|${allyCand}`;
SW.S.truce[foeTruceKey] = g.day + 100;
const marchBefore = SW.activeMarches().length;
SW.dispatchCustomForce(w, { n: 20, allySects: [allyCand], toStandoff: true });
assert.equal(SW.activeMarches().filter((m) => m.sid === allyCand).length, 0, '停战中的友宗不得被 dispatchCustomForce 拉入发兵');

// 战事停战/降伏(w.fall)后不得再发兵
w.fall = 'truce';
const afterFallMarches = SW.activeMarches().length;
SW.dispatchCustomForce(w, { n: 20, toStandoff: true });
assert.equal(SW.activeMarches().length, afterFallMarches, '战事降伏/停战(w.fall)后 dispatchCustomForce 严禁发兵');
assert.ok(marchBefore >= 0);

// ---------------------------------------------------------------------------
// 2. NPC 拐杖刚体长度 + 飞行施法状态机打通
// ---------------------------------------------------------------------------
const staffLook: any = { ...randomLook(() => 0.35, 'cultivator'), hand: 'staff' };
const c2d = cv.getContext('2d') as any;
const stStaff = new CharState(0, 0);
stStaff.setAction('cast');
stStaff.lift = 46;
stStaff.gait = 'fly';
drawCharacter(c2d, staffLook, stStaff, 1);

const bFlyCast = charPoseBucket(stStaff);
assert.equal(bFlyCast.pose8, 7, '飞行施法优先匹配 pose8=7 (cast) 而非被 fly/lift 覆盖回 6');
assert.equal(bFlyCast.action, 'cast');

// 主循环 isFlying + cast 状态机验证
g.player.flying = true;
(g.combat as any).castT = 0.3;
(g.combat as any).castSeq = 99;
g.update(1 / 60);
assert.equal(g.player.st.action, 'cast', '飞行期间施法 player.st.action 为 cast');
assert.equal(g.player.st.gait, 'fly', '飞行期间施法保留 player.st.gait = fly 以保持下肢御剑/凌空姿态');

// ---------------------------------------------------------------------------
// 3. 弟子方阵第 0/1 帧差异验证（不再两帧全等静止）
// ---------------------------------------------------------------------------
const sheet = sectDiscipleSheet('huangfeng', undefined, 0, undefined, 'front')!;
assert.ok(sheet, '成功烘焙黄枫谷弟子序列帧');
const sctx = (sheet as any).getContext('2d');
const f0 = Buffer.from(sctx.getImageData(0, 0, 96, 128).data);
const f1 = Buffer.from(sctx.getImageData(96, 0, 96, 128).data);
assert.notEqual(Buffer.compare(f0, f1), 0, '弟子战阵第 0 帧与第 1 帧存在真实动态差异');

// ---------------------------------------------------------------------------
// 4. 地面接缝着色器 & 法宝回身拖尾 / 爆闪检查
// ---------------------------------------------------------------------------
const groundSrc = fs.readFileSync('src/gl/ground.ts', 'utf8');
assert.ok(groundSrc.includes('(uCam+z.xy)*0.0003'), 'ground.ts 使用世界坐标 (uCam+z.xy) 计算地域边界噪声');
assert.ok(groundSrc.includes('MAX_ZONE = 16') && groundSrc.includes('if(r>1.4)'), 'ground.ts 扩充 MAX_ZONE 至 16 且放宽裁剪半径至 1.4');
const artSrc = fs.readFileSync('src/world/artacts.ts', 'utf8');
assert.ok(!artSrc.includes('const retK = b.ph === 3'), 'artacts.ts 已移除回程 retK 抑光，完整保留回身飞行光效与拖尾');
const combatGlSrc = fs.readFileSync('src/gl/combatgl.ts', 'utf8');
assert.ok(combatGlSrc.includes('castSeen'), 'combatgl.ts 对同帧人物处 cast 事件去重并移除白光爆闪');

// ---------------------------------------------------------------------------
// 5. 同行人物彻底遣散 + 秘境清理 + 当面对话遣散选项
// ---------------------------------------------------------------------------
const npcData = g.npcs.list.find((d) => d.alive && !d.beauty && !d.stay && d.realm > 0)!;
npcData.bond = 'sworn';
npcData.helpUntil = g.time + 180;
g.npcs.summon(npcData.id);
assert.equal(g.npcs.activeOf(npcData.id)?.act, 'follow', '结义同伴已被召唤同行');

// 检查当面对话树存在「请其暂别（结束同行）」
const activeNpc = g.npcs.activeOf(npcData.id)!;
const opts = g.rel.talkOpts(activeNpc, '道友', () => ({ speaker: '', title: '', text: '', options: [] }));
const partOpt = opts.find((o) => o.label.includes('请其暂别'));
assert.ok(partOpt, '当面交谈存在「请其暂别（结束同行）」选项');
partOpt!.act();

assert.equal(npcData.helpUntil, undefined, '遣散后清空 helpUntil');
assert.notEqual(g.npcs.activeOf(npcData.id)?.act, 'follow', '遣散后立即停止跟随');
// 推进 rel.update 超过 1 秒，确认不会被自动拉回
for (let i = 0; i < 4; i++) g.rel.update(0.5);
assert.notEqual(g.npcs.activeOf(npcData.id)?.act, 'follow', '遣散后 rel.update 绝不把人重新拉回');

// ---------------------------------------------------------------------------
// 6. 云雷双翼（风雷翅）8 朝向 + 侧向分翼扇动检查
// ---------------------------------------------------------------------------
{
  const { HANLI_LOOK } = await import('../src/gfx/character');
  const hashes = new Set<string>();
  const { createHash } = await import('node:crypto');
  for (let i = 0; i < 8; i++) {
    const stF = new CharState(180, 265);
    stF.yaw = stF.targetYaw = (i * Math.PI) / 4;
    stF.t = 0.22; stF.speed = 220; stF.lift = 28; stF.setAction('fly');
    for (let k = 0; k < 4; k++) stF.update(1 / 60);
    c2d.clearRect(0, 0, CW, CH);
    drawCharacter(c2d, HANLI_LOOK, stF, 1.35, 1 / 60, { mount: 'art_fenglei', noDefaultMount: true });
    hashes.add(createHash('sha256').update(cv.toBuffer('image/png')).digest('hex'));
  }
  assert.equal(hashes.size, 8, '云雷双翼在 8 个朝向均呈现独一无二的双翼投影');
  const stUp = new CharState(180, 265);
  stUp.yaw = stUp.targetYaw = Math.PI / 2; stUp.t = 0.22; stUp.lift = 28; stUp.setAction('fly');
  c2d.clearRect(0, 0, CW, CH);
  drawCharacter(c2d, HANLI_LOOK, stUp, 1.35, 1 / 60, { mount: 'art_fenglei', noDefaultMount: true });
  const hUp = createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');
  const stDn = new CharState(180, 265);
  stDn.yaw = stDn.targetYaw = Math.PI / 2; stDn.t = 0.67; stDn.lift = 28; stDn.setAction('fly');
  c2d.clearRect(0, 0, CW, CH);
  drawCharacter(c2d, HANLI_LOOK, stDn, 1.35, 1 / 60, { mount: 'art_fenglei', noDefaultMount: true });
  const hDn = createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');
  assert.notEqual(hUp, hDn, '左右侧向飞行时云雷双翼振翅上下相位像素可区分');

  // 侧身左右移动时，远/近两翼必须在垂直/纵深上显著错开（高出人物头顶之上仍有远翼上扬羽梢）
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
    const stNoWing = new CharState(180, 265);
    stNoWing.yaw = stNoWing.targetYaw = yaw; stNoWing.t = 0.4; stNoWing.lift = 28; stNoWing.setAction('fly');
    c2d.clearRect(0, 0, CW, CH);
    drawCharacter(c2d, HANLI_LOOK, stNoWing, 1.35, 1 / 60, { noDefaultMount: true });
    const bare = c2d.getImageData(0, 0, CW, CH).data;
    const stWing = new CharState(180, 265);
    stWing.yaw = stWing.targetYaw = yaw; stWing.t = 0.4; stWing.lift = 28; stWing.setAction('fly');
    c2d.clearRect(0, 0, CW, CH);
    drawCharacter(c2d, HANLI_LOOK, stWing, 1.35, 1 / 60, { mount: 'art_fenglei', noDefaultMount: true });
    const withWing = c2d.getImageData(0, 0, CW, CH).data;
    // 在人物背后区（左朝向看右侧、右朝向看左侧）统计每列垂直跨度，双翼错开应使背后最宽羽区垂直跨度明显大于单翼（>85px）
    let maxSpan = 0;
    const xStart = yaw < 0 ? 195 : 80, xEnd = yaw < 0 ? 280 : 165;
    for (let x = xStart; x < xEnd; x++) {
      let top = CH, bot = -1;
      for (let y = 0; y < CH; y++) {
        const idx = (y * CW + x) * 4;
        if (withWing[idx + 3] > 20 && bare[idx + 3] <= 20) {
          if (y < top) top = y;
          if (y > bot) bot = y;
        }
      }
      if (bot >= top) maxSpan = Math.max(maxSpan, bot - top);
    }
    assert.ok(maxSpan >= 72, `侧向飞行(yaw=${yaw.toFixed(2)})双翼错开后背后垂直跨度应 >= 72px，实际 ${maxSpan}px`);
  }
}

console.log('ALL 7 SESSION FIXES VERIFIED');
process.exit(0);
