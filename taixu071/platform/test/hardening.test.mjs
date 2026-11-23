import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../lib/db.mjs';

const dir = mkdtempSync(join(tmpdir(), 'db-harden-'));
try {
  // 1. 正常写入与备份生成
  const db1 = openDb(dir);
  db1.data.users.alice = { created: 1 };
  db1.save();
  db1.flushNow();
  assert.equal(JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8')).users.alice.created, 1);

  db1.data.users.bob = { created: 2 };
  db1.save();
  db1.flushNow();
  assert.ok(existsSync(join(dir, 'db.json.bak')), '第二次写入应保留 db.json.bak');
  assert.equal(JSON.parse(readFileSync(join(dir, 'db.json.bak'), 'utf8')).users.alice.created, 1);

  // 2. 主库损坏时从备份自动恢复
  writeFileSync(join(dir, 'db.json'), '{broken-json', 'utf8');
  const db2 = openDb(dir);
  assert.equal(db2.data.users.alice.created, 1, '主库损坏应从 db.json.bak 恢复');

  // 3. 主库与备份均损坏时隔离坏档而非崩溃
  writeFileSync(join(dir, 'db.json'), '{broken-main', 'utf8');
  writeFileSync(join(dir, 'db.json.bak'), '{broken-bak', 'utf8');
  const db3 = openDb(dir);
  assert.deepEqual(db3.data.users, {});
  assert.deepEqual(db3.data.tokens, {});
  assert.deepEqual(db3.data.mods, {});
  const files = readdirSync(dir);
  assert.ok(files.some((f) => f.startsWith('db.json.corrupt.')), '损坏主库应被重命名隔离');

  // 4. 未改动时 flushNow 不做无谓重写
  const before = existsSync(join(dir, 'db.json'));
  db3.flushNow();
  assert.equal(existsSync(join(dir, 'db.json')), before);

  console.log('PLATFORM DB HARDENING TESTS PASSED');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
