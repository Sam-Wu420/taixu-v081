import './env.ts';
import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';
const { Terrain } = await import('../src/world/terrain.ts');
const { HdScene } = await import('../src/hd2d/scene.ts');
const { Batch: Current } = await import('../src/gl/batch.ts');
const { Batch: Before } = await import('../docs/b-hd2d-acceptance/ground-batch-before.ts');
const terrain = new Terrain(); terrain.build();
const x = 251520, y = 137300, W = 1230, H = 864, zoom = .6, height = terrain.surfaceHeight(x, y), distance = 20000 / Math.SQRT2;
const camera = new OrthographicCamera(-W / 2 / zoom, W / 2 / zoom, H / 2 / zoom, -H / 2 / zoom, 1, 40000);
camera.position.set(x, height + distance, y + distance); camera.lookAt(x, height, y); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
const hd = Object.create(HdScene.prototype);
Object.assign(hd, { W, H, zoom, yaw: 0, pitch: 45, tx: x, ty: y, cam: camera, ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), projected: new Vector3(),
  heightAt: (a, b) => terrain.surfaceHeight(a, b) });
hd.computeAff();
function run(Class, radius) {
  const batch = new Class(), samples = []; let vertices = 0;
  for (let i = 0; i < 28; i++) {
    batch.reset(x, y, zoom, W, H, null); batch.hd = hd;
    const start = performance.now(); batch.groundQuad(-1, x, y, radius, .105, 1, 1, 1, 1, 0, 1, [0, 0, 1, 1]);
    const elapsed = performance.now() - start; if (i >= 8) samples.push(elapsed); vertices = batch.n;
  }
  samples.sort((a, b) => a - b);
  return { vertices, p50: +samples[10].toFixed(3), p95: +samples[19].toFixed(3), mean: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3) };
}
for (const radius of [100, 830, 8000]) console.log(JSON.stringify({ radius, before: run(Before, radius), after: run(Current, radius) }));
