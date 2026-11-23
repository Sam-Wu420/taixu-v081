// 收官 P8（丁）：走进屋里时，这一栋的屋顶和墙在原地抖动溶解（world/indoor.ts 定哪一栋、溶到几成；hd2d/indoorGl.ts 每帧填参数）。
// 建筑网格是一整块城合并的（buildings.ts 按 2400 见方分块），没法按栋换材质：所以在建筑的片元着色器里按世界坐标判断——
// 落在这栋楼的 A 盒里、高过室内地坪的，按溶解程度用屏幕格点哈希丢掉（抖动溶解，没有半透明排序的问题）；
// B 盒（门前凉棚、灯笼、幌子）里高过「地坪 + strip」的也丢，门口的货筐、台阶留着。
// 只在主角附近那几块（buildings.ts 的 cutMat，本来就带镂空的 discard）里生效，远处的不镂空材质不受影响。
import { Vector4 } from 'three';

/**
 * uRoomA / uRoomB / uRoomD = 世界坐标的盒子 (x0, z0, x1, z1)；uRoomC = (A 盒的地坪 y, B 盒的起削高度 y, 溶解程度 0..1, D 盒的起削高度 y)。
 * 第六轮返工：D 盒＝门朝北的铺子镜头那一侧的后宅小屋（人在前店里，它挡住屋里南沿十几个单位），一并溶掉；不用时盒子是空的
 */
export function makeRoomFadeUniforms() {
  return { uRoomA: { value: new Vector4(0, 0, 0, 0) }, uRoomB: { value: new Vector4(0, 0, 0, 0) }, uRoomC: { value: new Vector4(0, 0, 0, 0) }, uRoomD: { value: new Vector4(0, 0, 0, 0) } };
}
export type RoomFadeUniforms = ReturnType<typeof makeRoomFadeUniforms>;

/** 片元着色器片段：要有 varying vWP（世界坐标）。roomOut() 放在 cutOut() 的开头 */
export const ROOM_FADE_FS = `
uniform vec4 uRoomA; uniform vec4 uRoomB; uniform vec4 uRoomC; uniform vec4 uRoomD;
void roomOut(){
  if (uRoomC.z <= 0.0) return;
  vec3 p = vWP;
  bool a = p.x > uRoomA.x && p.x < uRoomA.z && p.z > uRoomA.y && p.z < uRoomA.w && p.y > uRoomC.x;
  bool b = p.x > uRoomB.x && p.x < uRoomB.z && p.z > uRoomB.y && p.z < uRoomB.w && p.y > uRoomC.y;
  bool d = p.x > uRoomD.x && p.x < uRoomD.z && p.z > uRoomD.y && p.z < uRoomD.w && p.y > uRoomC.w;
  if (!(a || b || d)) return;
  float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (n < uRoomC.z) discard;
}`;
