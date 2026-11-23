// 接 vf1：流星坠下去、穿过界壁（符文涟漪），镜头拉回巡航的远近
thaw();
const V = g.xukong.fall;
await until(() => V.log.includes('crossed'), 3000);
await sleep(260);
freeze();
return { log: V.log.join(','), camK: g.xukong.fight.camK };
