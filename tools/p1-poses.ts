// 撼山客第一阶段（照参考视频）的关键帧姿势一览：tools/p1-poses.html?a=p1Cross&t=0,0.06,0.42,0.5[&yaw=1.57][&s=2.4]
// 不带参数：每个 p1 动作的每个关键帧排成一张（侧面朝右），对照视频摆姿势用。多重肢体 / 拖影帧照常画（在关键帧刚切过去那一刻）
import { CharState, drawCharacter, keyTime, type Action } from '../src/gfx/character';
import { HANSHAN_LOOK } from '../src/world/hanshan';

const q = new URLSearchParams(location.search);
const ACTS = (q.get('a') ?? 'p1Cross,p1Armor,p1Duanmai,p1Elbow,p1Kao,p1Dash,p1Jab,p1Upper,p1HighKick,p1SideKick,p1Sweep,p1JumpKick,p1Knee,p1Crouch,p1FlyKick').split(',') as Action[];
const yaw = Number(q.get('yaw') ?? Math.PI / 2), S = Number(q.get('s') ?? 2.2), CW = 230 * S / 2.2, CH = 270 * S / 2.2;
const rows: { a: Action; ts: number[] }[] = ACTS.map((a) => {
  if (q.get('t')) return { a, ts: q.get('t')!.split(',').map(Number) };
  const ts: number[] = []; for (let i = 0; i < 12; i++) { const t = keyTime(a, i); if (i > 0 && t === 0) break; ts.push(t + (i ? 0.012 : 0)); }
  return { a, ts };
});
const cols = Math.max(...rows.map((r) => r.ts.length));
const cv = document.getElementById('cv') as HTMLCanvasElement;
cv.width = cols * CW + 120; cv.height = rows.length * CH;
const g = cv.getContext('2d')!;
g.font = '13px system-ui';
rows.forEach((r, ri) => {
  g.fillStyle = '#2a241c'; g.fillText(r.a, 4, ri * CH + 16);
  r.ts.forEach((t, ci) => {
    const st = new CharState(0, 0); st.yaw = st.targetYaw = yaw; st.t = 1; st.seed = 0;
    st.setAction(r.a); st.from = null; st.blend = 1; st.actionT = t;
    const x = 120 + ci * CW + CW / 2, y = ri * CH + CH - 22;
    g.save(); g.translate(x, y); g.scale(S / 2.2 * 2.2 / 1.6, S / 2.2 * 2.2 / 1.6);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.moveTo(-80, 0); g.lineTo(80, 0); g.stroke();
    drawCharacter(g, HANSHAN_LOOK, st, 1.06, 1 / 60, { physicsDt: 0 });
    g.restore();
    g.fillStyle = '#5a4a30'; g.fillText(t.toFixed(3), x - 20, ri * CH + CH - 4);
  });
});
(window as unknown as { __posesReady: boolean }).__posesReady = true;
