import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const map of ['renjie','lingjie','xianjie']) {
  const result=spawnSync(process.execPath,['--import','tsx','tools/test-travel-recovery.ts'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,FANREN_MAP:map}});
  assert.equal(result.status,0,`${map}: ${result.stderr}`);assert.match(result.stdout,/portal recovery/);
  console.log(`source ${map}: checkpoint, portal costs and both target maps passed`);
}
console.log('travel maps: all six simulated source/target data handoffs passed; these do not imply actual portal routes');
