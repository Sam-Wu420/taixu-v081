// 品牌：打包时用环境变量 VITE_BRAND 选择。默认「太虚问道录 · 人界篇」；VITE_BRAND=taixu 为魔搭创空间版「太虚问道录 · 寰宇篇」。
const taixu = ((import.meta as any).env?.VITE_BRAND as string | undefined) === 'taixu';
export const BRAND = taixu
  ? { id: 'taixu-hy', name: '太虚问道录', sub: '寰宇篇', tip: '一介凡人 · 逆天修仙 · 万里人界 · 任尔纵横' }
  : { id: 'taixu', name: '太虚问道录', sub: '人界篇', tip: '' };
