// 透视相机下的投影一致性：HdScene.projectPoint 对照 three 的相机矩阵；Batch.pt 的立板内偏移对照立板着色器的摆法；
// 屏幕 → 地面 → 屏幕的往返误差；局部缩放对照差分。
import assert from 'node:assert/strict';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { Batch } from '../src/gl/batch';
import { HdScene, HD_FOV } from '../src/hd2d/scene';

const W = 1600, H = 900, pitch = 45 * Math.PI / 180, boost = 1 / Math.cos(pitch);
let cases = 0, worstProject = 0, worstRound = 0, worstScale = 0, worstBillboard = 0;
for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) for (const zoom of [0.22, 0.6, 1, 1.6]) for (const base of [200, 420, 900]) {
  const tx = 251000, ty = 139000;
  // 高度保持在反投影的搜索范围（-32 ~ 2048）之内
  const heightAt = (x: number, y: number) => base + (x - tx) * 0.02 - (y - ty) * 0.012 + 30 * Math.sin((x - tx) / 400);
  const camera = new PerspectiveCamera(HD_FOV, W / H, 10, 60000);
  const D = (H / 2 / zoom) / Math.tan(HD_FOV * Math.PI / 360), up = { x: Math.sin(yaw), y: -Math.cos(yaw) }, ground = heightAt(tx, ty);
  camera.near = Math.max(4, D * 0.15); camera.far = D * 5 + 6000;
  camera.position.set(tx - up.x * Math.cos(pitch) * D, ground + Math.sin(pitch) * D, ty - up.y * Math.cos(pitch) * D);
  camera.up.set(0, 1, 0); camera.lookAt(tx, ground, ty);
  const hd = Object.create(HdScene.prototype) as InstanceType<typeof HdScene>;
  Object.assign(hd, { W, H, zoom, yaw, pitch: 45, tx, ty, cam: camera, camD: D, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(), heightAt });
  (hd as unknown as { computeAff(): void }).computeAff();
  assert.equal(hd.persp, true);
  const screen = (x: number, h: number, y: number) => { const q = new Vector3(x, h, y).project(camera); return { x: (q.x + 1) * W / 2, y: (1 - q.y) * H / 2, depth: q.z }; };
  const right = { x: Math.cos(yaw), y: Math.sin(yaw) };
  for (const [ox, oy] of [[0, 0], [600, -300], [-900, 500], [300, 800], [-200, -700]]) {
    const x = tx + ox / zoom, y = ty + oy / zoom, h = heightAt(x, y);
    // 1) 点投影对照 three
    hd.projectPoint(x, h + 120, y);
    const want = screen(x, h + 120, y);
    worstProject = Math.max(worstProject, Math.hypot(hd.sx - want.x, hd.sy - want.y), Math.abs(hd.sd - want.depth) * 1000);
    // 2) 局部缩放对照差分：沿屏幕右方挪 1 个世界单位，屏幕上挪 ss 个像素
    const g0 = hd.ground(x, y), s0 = g0.s;
    const a = screen(x, h, y), b = screen(x + right.x * 10, h, y + right.y * 10);
    worstScale = Math.max(worstScale, Math.abs(Math.hypot(b.x - a.x, b.y - a.y) / 10 - s0) / s0);
    // 3) 屏幕 → 地面 → 屏幕
    if (g0.x > 0 && g0.x < W && g0.y > 0 && g0.y < H) {
      const w = hd.unproject(g0.x, g0.y), back = hd.ground(w.x, w.y);
      worstRound = Math.max(worstRound, Math.hypot(back.x - g0.x, back.y - g0.y));
    }
    // 4) Batch.pt 的立板内偏移 = 立板着色器的摆法：脚底 + 右方·dx + 竖直·(-dy·boost)
    const B = new Batch(); B.reset(tx, ty, zoom, W, H, null); B.hd = hd;
    B.billboard = { x, y, offsetY: -40 };
    B.pt(x + 35, y - 60);
    const wantB = screen(x + right.x * 35, h - (-60 - 40) * boost, y + right.y * 35);
    worstBillboard = Math.max(worstBillboard, Math.hypot(B.ox - wantB.x, B.oy - wantB.y), Math.abs(B.od - wantB.depth) * 1000);
    assert.ok(B.os > 0);
    cases++;
  }
  // 近大远小：画面下方（近）比上方（远）大
  const near = hd.ground(hd.unproject(W / 2, H - 40).x, hd.unproject(W / 2, H - 40).y).s, far = hd.ground(hd.unproject(W / 2, 40).x, hd.unproject(W / 2, 40).y).s;
  assert.ok(near > far * 1.2, `近处 ${near} 应明显大于远处 ${far}`);
}
assert.ok(worstProject < 0.02, `点投影误差 ${worstProject}`);
assert.ok(worstScale < 0.01, `局部缩放误差 ${worstScale}`);
assert.ok(worstRound < 0.05, `往返误差 ${worstRound}`);
assert.ok(worstBillboard < 0.02, `立板偏移误差 ${worstBillboard}`);
console.log(`PASS 透视相机投影：${cases} 组 yaw/zoom/地形；点投影 ${worstProject.toFixed(4)} px，局部缩放 ${(worstScale * 100).toFixed(3)}%，往返 ${worstRound.toFixed(4)} px，立板偏移 ${worstBillboard.toFixed(4)} px`);
