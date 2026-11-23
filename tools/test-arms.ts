// 近战兵器线：人物手里的兵器、新动作的轻量测试：npx tsx tools/test-arms.ts
// 每种兵器的每个新动作从头到尾画一遍不抛错；刃轨迹函数（bladeAt）返回有限数值、出手时段里刃真的扫过一段、刃尖不出人物立板的包围盒；
// 收着 / 拿着两种状态都画得出；老的动作名一个没少（只增不改）。
import { createCanvas } from './env';
const C = await import('../src/gfx/character');
const { WEAPONS } = await import('../src/data/weapons');
const { charBox } = await import('../src/hd2d/boxes');
let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const fin = (p: { x: number; y: number; z: number }) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

const OLD = ['idle', 'walk', 'run', 'fly', 'sit', 'cast', 'hit', 'dodge', 'gather', 'punch', 'smash', 'rush', 'tumble', 'grab', 'feint', 'swim'];
ok(OLD.every((a) => (C.ACTION_NAMES as Record<string, string>)[a]), '老的动作一个没少（只增不改）');
const NEW = Object.keys(C.ACTION_DUR) as (keyof typeof C.ACTION_DUR)[];
ok(NEW.length === 24 && NEW.every((a) => C.ACTION_NAMES[a] && C.isWeaponAction(a) && C.ACTION_HIT[a][1] < C.ACTION_DUR[a]), `二十四个兵器动作（r16 加魂镰五个）都有中文名、时长、出手时段（${NEW.length}）`);
const kinds = ['sword', 'heavy', 'spear', 'scythe'] as const;
ok(kinds.every((k) => C.WEAPON_MOVES[k].light.length === { sword: 5, heavy: 3, spear: 4, scythe: 3 }[k]) && C.WEAPON_MOVES.spear.heavy.length === 2 && C.WEAPON_MOVES.fist.rush === 'rush', '连段：剑五下、重兵三下、枪四下；枪的重击有挑和扫；空手用原来的拳脚');

const cv: any = createCanvas(600, 600); const g = cv.getContext('2d');
const box = charBox(1);   // [左, 右, 上, 下]（scale = 1）
let drawErr = 0, nonFinite = 0, outBox = 0, still = 0;
for (const k of kinds) for (const tier of [0, 3, 6]) {
  const look = { ...C.HANLI_LOOK, weapon: { kind: k, tier } } as any;
  for (const a of [...C.WEAPON_MOVES[k].light, ...C.WEAPON_MOVES[k].heavy, C.WEAPON_MOVES[k].rush]) {
    const st = new C.CharState(300, 450); st.armed = true; st.setAction(a); st.blend = 1;
    const dur = C.ACTION_DUR[a as keyof typeof C.ACTION_DUR];
    try { for (let t = 0; t <= dur + 0.05; t += 1 / 30) { st.update(1 / 30); g.clearRect(0, 0, 600, 600); C.drawCharacter(g, look, st, 1, 1 / 30); } } catch (e) { drawErr++; console.log('  画', k, a, e); }
    let p0: any = null, sweep = 0;
    for (let i = 0; i <= 20; i++) {
      const b = C.bladeAt(look, a, i / 20);
      if (!b || !fin(b.grip) || !fin(b.tip) || !fin(b.base) || !fin(b.dir) || !b.held) { nonFinite++; continue; }
      for (const yaw of [0, 1.6, 3.1]) { const s = C.charToScreen({ x: 0, y: 0, yaw, lift: 0 }, look, 1, b.tip); if (s.x < box[0] || s.x > box[1] || s.y < box[2] || s.y > box[3]) outBox++; }
      if (p0) sweep += Math.hypot(b.tip.x - p0.x, b.tip.y - p0.y, b.tip.z - p0.z);
      p0 = b.tip;
    }
    if (sweep < 8) { still++; console.log('  刃几乎没动', k, a, sweep.toFixed(1)); }
  }
}
ok(drawErr === 0, '四种兵器（含魂镰） × 三个品阶 × 每个新动作：从头画到尾不抛错');
ok(nonFinite === 0, 'bladeAt：每个动作 0–1 的进度都返回有限数值、兵器在手里');
ok(outBox === 0, `刃尖不出人物立板的包围盒（正面、侧面、背面）${outBox ? '：出界 ' + outBox : ''}`);
ok(still === 0, '每个动作刃都扫过一段（判定、刀光有东西可取）');

// 收着 / 拿着、站走跑坐飞
let err2 = 0, held = 0, sheathed = 0;
for (const k of kinds) {
  const look = { ...C.HANLI_LOOK, weapon: { kind: k, tier: 4 } } as any;
  for (const a of ['idle', 'walk', 'run', 'sit', 'fly', 'cast', 'punch'] as const) for (const armed of [false, true]) {
    const st = new C.CharState(300, 450); st.armed = armed; st.setAction(a);
    try { for (let i = 0; i < 10; i++) { st.update(1 / 30); C.drawCharacter(g, look, st, 1, 1 / 30, a === 'fly' ? { mount: undefined } : {}); } } catch (e) { err2++; console.log('  画', k, a, armed, e); }
    const b = C.bladeAt(look, a, 0.3, { armed });
    if (b?.held) held++; else sheathed++;
    if (b) for (const p of [b.tip, b.grip]) { const s = C.charToScreen({ x: 0, y: 0, yaw: 0, lift: 0 }, look, 1, p); if (s.y < box[2] || s.y > box[3] || s.x < box[0] || s.x > box[1]) err2++; }
  }
  const bi = C.bladeAt(look, 'idle', 0, { armed: true }), bs = C.bladeAt(look, 'idle', 0, { armed: false });
  ok(bi?.held && bs && !bs.held, `${WEAPONS[k].name}：架势里拿在手里，收着时背在背后`);
  ok(!C.bladeAt(look, 'sit', 0.5, { armed: true })!.held && !C.bladeAt(look, 'fly', 0.5, { armed: true })!.held, `${WEAPONS[k].name}：打坐、御剑时一律收着`);
}
ok(err2 === 0, '站、走、跑、坐、飞、施法、出拳，收着 / 拿着都画得出、不出包围盒');
void held; void sheathed;
// 长枪比人高；握着时在立板里
const sp = C.bladeAt({ ...C.HANLI_LOOK, weapon: { kind: 'spear', tier: 2 } } as any, 'idle', 0, { armed: true })!;
ok(sp.tip.y > 100, `持枪而立：枪尖高过头顶（离地 ${sp.tip.y.toFixed(0)}）`);
// 没有兵器：bladeAt 给 null；空手的动作照旧画
ok(C.bladeAt(C.HANLI_LOOK, 'swordL1', 0.5) === null, '外观上没兵器：bladeAt 返回 null');
const map = C.charToMap({ x: 100, y: 200, yaw: 0, lift: 0 }, C.HANLI_LOOK, 1, { x: 0, y: 10, z: 20 });
ok(Math.abs(map.x - 100) < 1e-6 && map.y > 200 && map.h > 0, 'charToMap：人物朝向正前方的点落在地图上前方');

// ---------------------------------------------------------------- r16 魂镰（夜无赦掉的新兵器种类）
{
  const W = await import('../src/data/weapons');
  const GR = await import('../src/data/gear');
  const { ITEMS } = await import('../src/data/items');
  const WP = await import('../src/gfx/weapon');
  ok(W.WEAPON_KINDS.includes('scythe') && W.WEAPONS.scythe.hands === 2 && W.WEAPONS.scythe.length > 95 && W.WEAPONS.scythe.forms[0] === 'lian', '魂镰：双手、比人长、形制 lian');
  const S = GR.SCYTHE_ITEMS;
  ok(S.length === 7 && S.every((d, t) => d.id === `wpn_scythe_${t}` && ITEMS[d.id] === d && d.gear?.slot === 'weapon' && d.gear.weapon === 'scythe' && (d.gear.base.melee ?? 0) > 0 && d.name === W.WEAPON_TIERS.scythe[t].name), '七阶 wpn_scythe_0..6 都登记了、槽位 weapon、以近战伤害为主');
  ok(S[6].name === '噬魂本命魂镰' && S[6].desc.includes('夜无赦') && (S[6].gear!.base.melee ?? 0) > (S[5].gear!.base.melee ?? 0), '最高阶是夜无赦的本命魂镰，比第六阶强');
  ok(GR.WEAPON_ITEMS.length === 21 && GR.WEAPON_ITEMS.every((d) => d.gear?.weapon !== 'scythe'), '老的兵器表还是 21 件（魂镰不进铺子按下标挑的那张表）');
  let sc = 0; for (let i = 0; i < 3000; i++) { const d = GR.weaponDrop(i * 13 + 1, i % 7, 1); if (d?.id.startsWith('wpn_scythe')) sc++; }
  ok(sc === 0, '随机兵器掉落从不出魂镰（只有夜无赦会掉）');
  ok(Object.values(W.MELEE_ART_VIEW.scythe).every((v) => v.name && v.glyph && v.desc), '技能栏四式在拿魂镰时有自己的名字（魂镰三式、回旋魂镰、空斩、缩地·勾魂）');
  const sp = WP.weaponSpan('lian');
  ok(sp.uTip > sp.uBlade && sp.uBlade > 0 && sp.uMin < 0 && sp.uOff < 0, '魂镰沿轴的刃位、杆尾、副手握点');
  const look = { ...C.HANLI_LOOK, weapon: { kind: 'scythe', tier: 6 } } as any;
  const b = C.bladeAt(look, 'idle', 0, { armed: true });
  ok(!!b?.held && b.tip.y > 95, `持镰而立：镰刃高过头顶（离地 ${b?.tip.y.toFixed(0)}）`);
  const P = WP.weaponPaint({ kind: 'scythe', tier: 6 });
  ok(!!P && P.form === 'lian' && P.glow >= 0.75, '本命魂镰有流光');
  // 图标：和人物手里同一套画法，画在小画布上（无头环境用 env 的画布）
  let iconErr = 0; for (let t = 0; t <= 6; t++) { try { WP.weaponIconURL({ kind: 'scythe', tier: t }, 64, (w, h) => createCanvas(w, h) as any); } catch (e) { iconErr++; console.log('  图标', t, e); } }
  ok(iconErr === 0, '七阶魂镰的图标都画得出');
}

if (fails) { console.error(`\nFAILED: ${fails}`); process.exit(1); }
console.log('\n== 兵器画法与动作：全部通过 ==');
