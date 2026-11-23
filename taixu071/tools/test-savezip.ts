// v0.71 存档压缩冒烟：npx tsx tools/test-savezip.ts
//   只为 savezip.ts 这一对函数；与存档整体的联调在 tools/test-sectpanel.tsx 第九节。
const { zipSave, unzipSave } = await import('../src/world/savezip');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

console.log('一、往返一致');
{
  const cases = [
    '', 'a', '{}', '{"a":1}', '中文与标点：，。！？「」',
    'emoji 🐉🗡 与组合字 驫',
    JSON.stringify({ name: '玄天派', dao: 'zheng', ds: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `弟子${i}`, root: i % 5 })) }),
    'x'.repeat(5000),
  ];
  let bad = 0;
  for (const c of cases) { const z = zipSave(c); if (unzipSave(z) !== c) { bad++; console.log('   ✗ 不一致：', JSON.stringify(c.slice(0, 20))); } }
  ok(bad === 0, `${cases.length} 组样本解压后与原串逐字相同`);
}

console.log('二、向后兼容：没前缀的旧明文档原样返回');
{
  const legacy = '{"v":3,"time":1,"hero":{"name":"旧档"}}';
  ok(unzipSave(legacy) === legacy, '明文 JSON 直接透传');
  ok(unzipSave('') === '', '空串透传');
}

console.log('三、压缩率（模拟 4000 名 NPC 的存档）');
{
  const npcs = Array.from({ length: 4000 }, (_, i) => ({
    id: `npc_${i}`, name: `路人${i}`, sect: i % 7 ? 'qingxu' : 'taiyi', realm: i % 6, stage: i % 4,
    x: (i * 37) % 3000, y: (i * 91) % 3000, home: 'pingyang', alive: true, favor: 0, grudge: 0, met: false,
  }));
  const save = JSON.stringify({ v: 3, time: 1, hero: { name: '测试' }, npcs, world: { rep: 0, sect: {} } });
  const z = zipSave(save);
  const ratio = z.length / save.length;
  ok(unzipSave(z) === save, `大档往返一致（明文 ${save.length} 字符）`);
  ok(ratio < 0.5, `压缩到原体积 ${(ratio * 100).toFixed(1)}%（要求 < 50%）`);
  ok(z.startsWith('z1:'), '压缩串带 z1: 前缀');
  ok(!z.includes('路人'), '压缩后不含原文（确实是压缩而非穿透）');
}

console.log('四、边界：长重复串 / 单字节高位字符');
{
  const s = 'abcdefghij'.repeat(20000);          // 远超 64KB 匹配窗口
  ok(unzipSave(zipSave(s)) === s, `200k 长串往返一致（${s.length} 字符）`);
  const hi = Array.from({ length: 2000 }, (_, i) => String.fromCharCode(0x4e00 + (i % 300))).join('');
  ok(unzipSave(zipSave(hi)) === hi, '多字节汉字（UTF-8 三字节）往返一致');
}

console.log('五、自动存档 fast 快速压缩往返一致');
{
  const s = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: `n${i}`, sect: i % 5, hp: 100, name: `太虚弟子${i % 23}` })));
  const zFast = zipSave(s, true);
  ok(zFast.startsWith('z1:'), 'fast 模式压缩串带 z1: 前缀');
  ok(unzipSave(zFast) === s, 'fast 模式解压后与原串逐字相同');
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
