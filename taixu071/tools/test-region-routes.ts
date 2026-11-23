import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const maps=['renjie','lingjie','xianjie'];
function run(map:string,incoming:any[]=[]){const x=spawnSync(process.execPath,['--import','tsx','tools/test-region-geometry.ts'],{cwd:process.cwd(),encoding:'utf8',input:JSON.stringify(incoming),env:{...process.env,FANREN_MAP:map},timeout:60000});assert.equal(x.status,0,`${map}: ${x.stderr}`);return JSON.parse(x.stdout.trim())}
const records=maps.map(m=>run(m));const exits=records.flatMap(x=>x.generated);assert.equal(exits.length,0);
for(const map of maps){const inc=exits.filter(x=>x.map===map);const r=run(map,inc);console.log(`${map}: portals & terrain verified (${r.incoming} edge arrivals, ${r.fallback} distant land fallbacks)`)}
console.log('region routes: actual edge pairs, stale conditions, portal locations and terrain landings passed');
