// 用用户配置的 our-codex-image MCP（在 ~/.claude.json 里另一个项目下配的 stdio 服务）生成贴图：起进程、发任务、等结果、打印保存路径。
// 用法：node tools/codex-image.mjs <输出目录> <任务.json>
//   任务.json 是数组，每项 { output_filename, prompt, aspect_ratio?, transparent_background?, animated? }。每张一到三分钟，服务端一张张排队画。
//   animated: true 用于「同一个东西的几个姿势」（一图多帧）：提示词里不要写几帧、几行几列，由它自己排，回来按实际的格子切。
// 生成后用 @napi-rs/canvas 压成 webp 再放进 src/assets（包体上限见记忆 source-package-size-limit）。
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [outDir, jobsFile] = process.argv.slice(2);
if (!outDir || !jobsFile) { console.error('用法：node tools/codex-image.mjs <输出目录> <任务.json>'); process.exit(1); }
const all = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
let cfg = null; for (const p of Object.values(all.projects ?? {})) if (p.mcpServers?.['our-codex-image']) cfg = p.mcpServers['our-codex-image'];
if (!cfg) { console.error('~/.claude.json 里没找到 our-codex-image'); process.exit(1); }
const child = spawn(cfg.command, cfg.args, { env: { ...process.env, ...cfg.env }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', id = 0; const waits = new Map();
child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); waits.get(m.id)?.(m); waits.delete(m.id); } });
const rpc = (method, params) => new Promise((res) => { const i = ++id; waits.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
const call = async (name, args) => JSON.parse((await rpc('tools/call', { name, arguments: args })).result.content[0].text);
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'taixu-tools', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const ids = [];
// 服务端要求 output_filename 不带扩展名（带了会直接拒绝）；提交被拒要报出来，不能当成功
for (const j of JSON.parse(fs.readFileSync(jobsFile, 'utf8'))) {
  const r = await call('generate_image', { ...j, output_filename: String(j.output_filename).replace(/.(png|webp|jpe?g)$/i, ''), output_dir: path.resolve(outDir) });
  if (!r.task_id) { console.error('提交失败', j.output_filename, r.error ?? JSON.stringify(r)); continue; }
  console.log('已提交', j.output_filename, r.task_id); ids.push(r.task_id);
}
if (!ids.length) { console.error('一张都没提交上'); child.kill(); process.exit(1); }
for (let k = 0; k < 75; k++) {   // 服务端一次只画一张，十来张要半个多钟头
  const r = await call('wait_all_tasks', { task_ids: ids, timeout_seconds: 60 });
  if (r.all_finished) { for (const t of r.tasks) console.log(t.status, t.saved_path ?? t.error ?? ''); break; }
  console.log('等待中……', (r.pending_task_ids ?? []).length, '张未完成');
}
child.kill();
