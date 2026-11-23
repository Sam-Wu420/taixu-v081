import { defineConfig, mergeConfig } from 'vite';
import { realpathSync } from 'node:fs';
import base from '../vite.config';

export default mergeConfig(base, defineConfig({
  cacheDir: 'tools/out/vite-perf',
  server: { hmr: false, watch: null, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
}));
