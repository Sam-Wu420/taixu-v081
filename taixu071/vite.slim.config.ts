// 瘦身构建：图片/音效不再 base64 内联进 JS，而是输出成独立文件（HTTP 缓存 + 按需加载）
import base from './vite.config';
import path from 'path';
import { writeFileSync } from 'fs';
const map: string[] = [];
function inlineLater() {
  return {
    name: 'inline-later', enforce: 'pre' as const,
    async resolveId(this: any, src: string, imp?: string) {
      if (!src.endsWith('?inline') || !imp) return null;
      // 去掉 ?inline，交给 Vite 当普通静态资源处理 → 输出 assets/xxx.webp，返回 URL
      const r = await this.resolve(src.slice(0, -7), imp, { skipSelf: true });
      return r;
    },
    load(id: string) { if (!id.startsWith('\0inl:')) return null; map.push(id.slice(5)); return `export default "__INL${map.length - 1}__";`; },
    closeBundle() { writeFileSync(path.resolve('dist/.inl.json'), JSON.stringify(map)); },
  };
}
const b: any = (base as any).build;
export default {
  ...base,
  plugins: [inlineLater(), ...((base as any).plugins ?? [])],
  build: { ...b, reportCompressedSize: false, assetsInlineLimit: () => false, minify: 'esbuild' },
};
