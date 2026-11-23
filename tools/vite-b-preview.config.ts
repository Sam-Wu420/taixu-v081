import base from '../vite.config';

// 与瘦身构建一样保留资源 URL；public 由预览服务器直接读取，避免复制一份。
const externalAssets = {
  name: 'b-preview-external-assets',
  enforce: 'pre' as const,
  async resolveId(this: any, source: string, importer?: string) {
    if (!source.endsWith('?inline') || !importer) return null;
    return this.resolve(source.slice(0, -7), importer, { skipSelf: true });
  },
};

export default {
  ...base,
  plugins: [externalAssets, ...(base.plugins ?? [])],
  build: { ...base.build, copyPublicDir: false, reportCompressedSize: false, assetsInlineLimit: 0, minify: 'esbuild' },
};
