import assert from 'node:assert/strict';
import { REALMS, levelOf, fromLevel, realmName, expNeed } from '../src/data/realms';
let level=0;
for(let r=0;r<REALMS.length;r++)for(let st=0;st<REALMS[r].stages.length;st++){
 assert.equal(levelOf(r,st),level);assert.deepEqual(fromLevel(level),[r,st]);
 assert.equal(realmName(r,st),REALMS[r].name+(r?REALMS[r].stages[st]:''));assert.ok(Number.isFinite(expNeed(r,st)));level++;
}
assert.equal(level,47);assert.equal(levelOf(99,0),44);assert.equal(levelOf(99,99),46);assert.deepEqual(fromLevel(999),[12,2]);
assert.equal(realmName(99,0),'???');assert.deepEqual(fromLevel(NaN),[0,0]);assert.equal(levelOf(NaN,0),0);
// 验证索引算法能按表动态扩展。
const mock={...REALMS[12],id:13,name:'测试境界',stages:['前','中','后'],expDays:[1,2,3]};
REALMS.push(mock);try{
 for(let st=0;st<3;st++){assert.equal(levelOf(13,st),47+st);assert.deepEqual(fromLevel(47+st),[13,st]);assert.equal(realmName(13,st),'测试境界'+mock.stages[st])}
 assert.deepEqual(fromLevel(999),[13,2]);
}finally{REALMS.pop()}
console.log('realm indexing: 47 three-world levels round trip, bounds, malformed input and table extension passed');
