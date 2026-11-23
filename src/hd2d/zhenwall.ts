// P2：阵法 / 结界的光墙——原先阵法只在地上画一个圈，罩子（玄武、两仪）是平铺在地面上的一张图。
// 立体画面里改成沿阵界立起一圈半透明的光墙：底边最亮、往上渐隐，墙面上一行行篆文缓缓上流，受击 / 将破时闪烁。
// 叠加混合、不写深度、不投影（挂在建筑的「发光体」那一组里，阴影那一遍一起藏起来）。
import { CylinderGeometry, Mesh, ShaderMaterial, AdditiveBlending, DoubleSide, Group, Vector4, Vector3, type Texture } from 'three';

export interface ZhenWall { key: string; x: number; y: number; ground: number; r: number; h: number; color: readonly [number, number, number]; alpha: number; dome: boolean }

const VS = `
varying vec2 vUv; varying float vY;
void main(){ vUv = uv; vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// uP = (时间, 整体透明度, 绕一圈有几列字, 是否罩子)；墙底最亮，往上渐隐；字列随时间上流
const FS = `
uniform sampler2D uGlyph; uniform vec4 uP; uniform vec3 uColor; varying vec2 vUv; varying float vY;
void main(){
  float fade = pow(1.0 - vY, 1.6) * (0.35 + 0.65 * smoothstep(0.0, 0.04, vY));
  float edge = exp(-vY * 22.0) * 1.4;                          // 落地那一道亮边
  float cols = uP.z, rows = 4.0;
  vec2 g = vec2(vUv.x * cols, vY * rows - uP.x * 0.18);
  vec2 cell = fract(g), id = floor(g);
  float idx = mod(id.x * 7.0 + id.y * 13.0, 64.0);
  float glyph = texture2D(uGlyph, (vec2(mod(idx, 8.0), floor(idx / 8.0)) + clamp(cell, 0.06, 0.94)) / 8.0).r;
  float band = 0.55 + 0.45 * sin(vUv.x * 6.2831853 * 3.0 - uP.x * 1.3);   // 沿墙流转的明暗
  float a = (fade * (0.18 + 0.12 * band) + edge + glyph * fade * 0.5) * uP.y;
  gl_FragColor = vec4(uColor * a, 1.0);   // 叠加混合按 (源透明度, 1) 加上去，透明度给 1、颜色里已乘好
}`;

export class ZhenWalls {
  readonly group = new Group();
  private items: { mesh: Mesh; mat: ShaderMaterial; key: string; used: boolean }[] = [];
  private geo = new CylinderGeometry(1, 1, 1, 64, 1, true);
  constructor(private glyphs: Texture | null) { this.geo.translate(0, 0.5, 0); }

  /** 每帧：按当前的阵法列表摆墙（多的藏起来，少了现建） */
  sync(walls: readonly ZhenWall[], time: number): void {
    for (const it of this.items) it.used = false;
    for (const w of walls) {
      let it = this.items.find((x) => x.key === w.key) ?? this.items.find((x) => !x.used && !x.mesh.visible);
      if (!it) {
        const mat = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
          uniforms: { uGlyph: { value: this.glyphs }, uP: { value: new Vector4() }, uColor: { value: new Vector3(1, 1, 1) } } });
        const mesh = new Mesh(this.geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
        this.group.add(mesh);
        it = { mesh, mat, key: w.key, used: false }; this.items.push(it);
      }
      it.key = w.key; it.used = true; it.mesh.visible = true;
      it.mesh.position.set(w.x, w.ground - 4, w.y); it.mesh.scale.set(w.r, w.h, w.r);
      (it.mat.uniforms.uP.value as Vector4).set(time, w.alpha, Math.max(12, Math.round(w.r / 46)), w.dome ? 1 : 0);
      (it.mat.uniforms.uColor.value as Vector3).set(w.color[0], w.color[1], w.color[2]);
    }
    for (const it of this.items) if (!it.used) it.mesh.visible = false;
  }

  dispose(): void { for (const it of this.items) it.mat.dispose(); this.geo.dispose(); }
}
