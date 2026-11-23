import './env';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {v53,url53} from '../src/gfx/v053Tex';
import {SPIRIT_KEYS} from '../src/gfx/spiritProcedural';
assert.equal(existsSync('src/assets/v053'),false,'old v053 asset directory must not return');
function walk(p:string):string[]{return readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(join(p,d.name)): /\.(ts|tsx|js|css)$/.test(d.name)?[join(p,d.name)]:[])}
for(const file of walk('src')){const text=readFileSync(file,'utf8');assert(!/assets\/v053\//.test(text),file+' must not import the removed asset files');}
for(const k of SPIRIT_KEYS)assert.ok(v53(k),k);
for(const k of ['zf_kun','zf_flag_jin','zf_dome','ui_board','ui_node_jin'])assert.ok(v53(k),k);
assert.equal(url53('zf_kun'),undefined);
console.log('v053 asset cleanup: no runtime image references; spirit, formation, effects and puzzle procedural entry points remain available');
