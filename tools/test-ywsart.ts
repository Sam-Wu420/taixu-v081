// r16 夜无赦画面线的轻量测试：npx tsx tools/test-ywsart.ts
// 招式姿态表（world/yewushe-anim.ts）每招每个形态从头放到尾都是有限数、帧都在帧表里、放完 done、出手时刻在招内；
// 不取 Math.random；帧表里的每一帧都有贴图（src/assets/yewushe → gfx/ywsTexData.ts）；规格书的招式 id 一览和代码一一对应。
import fs from 'node:fs';
const A = await import('../src/world/yewushe-anim');
let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const FR = new Set(A.YWS_FRAMES);
let nan = 0, badFrame = 0, notDone = 0, badHit = 0, n = 0;
const R = Math.random; let calls = 0; Math.random = () => { calls++; return R(); };
for (const id of A.YWS_MOVE_IDS) for (const f of A.YWS_MOVES[id].forms) {
  n++;
  const L = A.ywsMoveLen(id, f);
  for (let t = 0; t <= L; t += 7) {
    const p = A.poseAt(id, f, t, { dist: 480 });
    if (![p.dx, p.dy, p.lift, p.sx, p.sy, p.rot, p.H, p.ax, p.alpha, p.glow].every(Number.isFinite)) nan++;
    if (!FR.has(p.frame)) { badFrame++; console.log('  帧不在表里', id, f, p.frame); }
  }
  if (!A.poseAt(id, f, L + 1).done || A.poseAt(id, f, Math.max(0, L - 1)).done) notDone++;
  for (const h of A.ywsHits(id, f)) if (h < 0 || h >= L) badHit++;
  for (const g of A.ghostTrail(id, f, L * 0.5)) if (!Number.isFinite(g.alpha + g.dx)) nan++;
}
for (const f of ['human', 'half', 'demon'] as const) for (const p of [A.idlePose(f, 1234), A.walkPose(f, 777), A.hurtPose(f, 120), A.downPose(f)]) { if (!FR.has(p.frame)) badFrame++; if (!Number.isFinite(p.H + p.sx + p.lift)) nan++; }
Math.random = R;
ok(n >= 60 && nan === 0, `${A.YWS_MOVE_IDS.length} 招、${n} 个「招 × 形态」从头放到尾都是有限数`);
ok(badFrame === 0, '每一刻的帧名都在 YWS_FRAMES 里（没画的姿势按借帧规则落到画了的帧上）');
ok(notDone === 0, '放到总长才 done，差一毫秒还没完');
ok(badHit === 0, '出手时刻都在招内');
ok(calls === 0, `姿态表不取 Math.random（取了 ${calls} 次）`);
ok(A.YWS_MOVE_IDS.every((id) => A.ywsHits(id, A.YWS_MOVES[id].forms[0]).length > 0 || ['duohun', 'pingzhang'].includes(id)), '除了自强化（堕魂诀、魔障屏障），每招至少一下出手');
ok(A.ywsHasForm('shixian', 'demon') && !A.ywsHasForm('shixian', 'human') && A.ywsHasForm('moyi', 'demon') && !A.ywsHasForm('moyi', 'half'), '两个觉醒大招只有魔躯能放');
// 变身：天魔降身后半段已经是魔躯的帧和身高
const tm = A.poseAt('tianmo', 'half', A.ywsMoveLen('tianmo', 'half') - 10);
ok(tm.frame.startsWith('yws_m_') && tm.H > A.YWS_FORM_H.half * 1.5, '天魔降身收尾已经是魔躯（帧和身高）');
// 钻地：末劫陷阱中段看不见、在地下，追到目标身上
const xj = A.poseAt('xianjing', 'human', 1000, { dist: 500 });
ok(xj.alpha === 0 && Math.abs(xj.dx - 500) < 1, '末劫陷阱：钻进地里看不见，旋涡追到目标身上');

// 贴图：帧表里的每一帧都有图
const src = fs.readFileSync(new URL('../src/gfx/ywsTexData.ts', import.meta.url), 'utf8');
const have = new Set([...src.matchAll(/^\s+(yws_\w+): t\d+,$/gm)].map((m) => m[1]));
const miss = A.YWS_FRAMES.filter((k) => !have.has(k));
ok(miss.length === 0, `帧表里每一帧都有贴图（${A.YWS_FRAMES.length} 帧${miss.length ? '，缺 ' + miss.join(' ') : ''}）`);
ok(A.YWS_FX_FRAMES.every((k) => have.has(k)), '特效贴图（飞镰、魔臂、巨爪、鬼脸）都有');
let bytes = 0; for (const f of fs.readdirSync(new URL('../src/assets/yewushe/', import.meta.url))) if (f.endsWith('.webp')) bytes += fs.statSync(new URL('../src/assets/yewushe/' + f, import.meta.url)).size;
ok(bytes <= 6 * 1024 * 1024, `贴图合计 ${(bytes / 1024 / 1024).toFixed(2)} MB，不超过 6 MB`);

// 规格书：招式 id 一览和代码对得上
const doc = fs.readFileSync(new URL('../docs/夜无赦-参考视频动作分解.md', import.meta.url), 'utf8');
const lost = A.YWS_MOVE_IDS.filter((id) => !new RegExp(`\\b${id}\\b`).test(doc));
ok(lost.length === 0, `规格书的招式 id 一览列了全部 ${A.YWS_MOVE_IDS.length} 个 id${lost.length ? '，缺 ' + lost.join(' ') : ''}`);

if (fails) { console.error(`\nFAILED: ${fails}`); process.exit(1); }
console.log('\n== 夜无赦画面线：全部通过 ==');
