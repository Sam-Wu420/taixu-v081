/** 位图可同时由人物缓存和静态图集持有，最后一个持有方负责释放。 */
export class BitmapFrame {
  private references = 1;
  constructor(readonly image: ImageBitmap) {}
  get width(): number { return this.image.width; }
  get height(): number { return this.image.height; }
  retain(): void { this.references++; }
  release(): void { if (--this.references === 0) this.image.close(); }
}
