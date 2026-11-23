export interface ArenaFloorImage {
  readonly canvas: HTMLCanvasElement;
  readonly left: number;
  readonly top: number;
  width: number;
  height: number;
  version: number;
}

export class ArenaFloorCache {
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d')!;
  private resolution = 0;
  private revision = -1;
  private readonly left: number;
  private readonly top: number;
  private readonly width: number;
  private readonly height: number;
  private readonly image: ArenaFloorImage;

  constructor(radius: number, private readonly paint: (context: CanvasRenderingContext2D) => void) {
    this.left = this.top = -radius - 1;
    this.width = radius * 2 + 42;
    this.height = radius * 2 + 232;
    this.image = { canvas: this.canvas, left: this.left, top: this.top, width: 0, height: 0, version: 0 };
  }

  prepare(context: CanvasRenderingContext2D, revision: number): ArenaFloorImage {
    const transform = context.getTransform();
    const resolution = Math.ceil(Math.hypot(transform.a, transform.b) * 4) / 4;
    if (resolution !== this.resolution || revision !== this.revision) {
      this.canvas.width = Math.ceil(this.width * resolution);
      this.canvas.height = Math.ceil(this.height * resolution);
      this.context.setTransform(resolution, 0, 0, resolution, -this.left * resolution, -this.top * resolution);
      this.paint(this.context);
      this.resolution = resolution;
      this.revision = revision;
      this.image.width = this.canvas.width / resolution;
      this.image.height = this.canvas.height / resolution;
      this.image.version++;
    }
    return this.image;
  }

  draw(context: CanvasRenderingContext2D, x: number, y: number, revision: number): void {
    const image = this.prepare(context, revision);
    context.drawImage(image.canvas, x + image.left, y + image.top, image.width, image.height);
  }
}
