import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  'src/hd2d/buildings.ts',
  'src/hd2d/staticAtlas.ts',
  'src/gfx/character-cache.ts',
  'src/gfx/character-worker-protocol.ts',
  'src/gfx/character-worker-paint.ts',
  'src/gfx/character-paint.worker.ts',
  'src/gfx/character-worker-frames.ts',
  'src/gfx/bitmap-frame.ts',
  'mods/shahe/arena-floor-cache.ts',
  'src/gl/vfxsprites.ts',
  'src/world/spatial.ts',
  'src/world/surface.ts',
  'src/world/npc-day.ts',
  'src/world/terrain-bake-data.ts',
  'src/world/terrain-bake-protocol.ts',
  'src/world/terrain-baker.ts',
  'src/world/terrain-chunk-jobs.ts',
  'src/world/terrain-chunk-plan.ts',
  'src/world/terrain.worker.ts',
].map(file => resolve(root, file));

const host = {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => root,
  getNewLine: () => ts.sys.newLine,
};
const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([config.error], host));
  process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = { ...parsed.options, strict: true, noImplicitAny: true, noEmit: true };
const program = ts.createProgram(entries, options);
const diagnostics = [
  ...parsed.errors,
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
];
for (const name of entries) {
  const file = program.getSourceFile(name);
  if (file) diagnostics.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
}
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  process.exitCode = 1;
} else {
  console.log(`B 版新增运行模块严格类型检查通过（${entries.length} 个文件）`);
}
