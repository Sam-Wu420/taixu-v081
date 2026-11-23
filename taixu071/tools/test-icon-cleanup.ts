import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
const root=resolve('.'),temp=mkdtempSync(join(tmpdir(),'taixu-icon-clean-'));
try {
  const incoming=join(temp,'incoming');mkdirSync(incoming);mkdirSync(join(temp,'src/gfx'),{recursive:true});
  const run=(...args:string[])=>spawnSync(process.execPath,[join(root,'node_modules/tsx/dist/cli.mjs'),join(root,'tools/propconvert.ts'),incoming,...args],{cwd:temp,encoding:'utf8'});
  // Default no longer even requires an old icon directory, and does not recreate legacy images or the index.
  const plain=run();assert.equal(plain.status,0,plain.stderr);assert.equal(existsSync(join(temp,'src/assets/icons')),false);assert.equal(existsSync(join(temp,'src/gfx/iconData.ts')),false);
  // The historic import remains available deliberately, in the isolated fixture only.
  mkdirSync(join(incoming,'icon'));const c=createCanvas(16,16),g=c.getContext('2d');g.fillStyle='red';g.fillRect(2,2,12,12);writeFileSync(join(incoming,'icon/example.png'),c.toBuffer('image/png'));
  const legacy=run('--legacy-icons');assert.equal(legacy.status,0,legacy.stderr);assert.ok(existsSync(join(temp,'src/assets/icons/example.webp')));assert.ok(existsSync(join(temp,'src/gfx/iconData.ts')));
  // VFX conversion must never overwrite the live procedural skill module.
  mkdirSync(join(incoming,'vfx'));mkdirSync(join(incoming,'skill'));
  writeFileSync(join(incoming,'skill/example.png'),c.toBuffer('image/png'));
  const live=join(temp,'src/gfx/skillIconData.ts');writeFileSync(live,'procedural sentinel');
  const vfx=(...args:string[])=>spawnSync(process.execPath,[join(root,'node_modules/tsx/dist/cli.mjs'),join(root,'tools/vfxconvert.ts'),incoming,...args],{cwd:temp,encoding:'utf8'});
  const defaultVfx=vfx();assert.equal(defaultVfx.status,0,defaultVfx.stderr);assert.equal(existsSync(join(temp,'src/assets/skills')),false);
  assert.equal(readFileSync(live,'utf8'),'procedural sentinel');
  const oldVfx=vfx('--legacy-icons');assert.equal(oldVfx.status,0,oldVfx.stderr);assert.ok(existsSync(join(temp,'src/assets/skills/example.webp')));
  assert.ok(existsSync(join(temp,'src/gfx/legacySkillIconData.ts')));assert.equal(readFileSync(live,'utf8'),'procedural sentinel');
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('legacy item image cleanup: default converter skips images; explicit historic import works in isolated fixture');
