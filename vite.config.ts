import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 让打包结果可直接双击 index.html（file://）运行：
// 输出单个 IIFE 脚本，并把 <script type="module"> 改为普通 defer 脚本
function fileProtocolCompat(): Plugin {
  return {
    name: 'file-protocol-compat',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<script type="module"/g, '<script defer')
        .replace(/ crossorigin/g, '');
    },
  };
}

// 字体包同时给了 woff2 和 woff 两份（各约 10MB）；Electron / 现代浏览器只会用 woff2，woff 只是白占包体。
// 构建时把 @fontsource 的 CSS 里 woff 那一项去掉，woff 文件就不会被打进产物。
function woff2Only(): Plugin {
  return {
    name: 'woff2-only',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.split('?')[0].endsWith('.css')) return null;
      return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
    },
  };
}

export default defineConfig({
  plugins: [woff2Only(), react(), fileProtocolCompat()],
  base: './',
  // 依赖预构建缓存放在各自目录下：几个工作副本的 node_modules 是联接到同一处的，默认的 node_modules/.vite 会被几台开发服务器互相覆盖，
  // 页面里就出现两份 React（Invalid hook call），整个界面起不来
  cacheDir: '.vite-cache',
  build: {
    target: 'es2019',
    modulePreload: false,
    assetsInlineLimit: 64 * 1024 * 1024,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
