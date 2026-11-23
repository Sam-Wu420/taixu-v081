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

// @fontsource 的 CJK 字体同时提供 woff2 与 woff 两种格式，而打包会把两者都内联进产物。
// 本项目要求 WebGL2，目标浏览器全部支持 woff2（Chrome 36+ / Safari 10+ / Edge 15+），
// woff 回退永远不会被用到，却让交付物凭空大了一倍（实测 11.4 MB）。
// 在 CSS 进入打包前删掉 woff 回退项，字体文件因此不再被引用，也不会被产出。
function woff2OnlyCjkFonts(): Plugin {
  const WOFF_FALLBACK = /,\s*url\(\s*(?:'[^']*\.woff'|"[^"]*\.woff"|[^)]*?\.woff)\s*\)\s*format\(\s*(?:'woff'|"woff")\s*\)/g;
  return {
    name: 'woff2-only-cjk-fonts',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !/\.css(\?|$)/.test(id)) return null;
      const out = code.replace(WOFF_FALLBACK, '');
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), woff2OnlyCjkFonts(), fileProtocolCompat()],
  base: './',
  build: {
    target: 'es2019',
    modulePreload: false,
    assetsInlineLimit: 64 * 1024 * 1024,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
