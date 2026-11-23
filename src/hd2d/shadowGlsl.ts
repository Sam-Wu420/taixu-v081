// 阴影取样的着色器片段：地形、地贴、立板、建筑共用。
// uShadowParams = (浓度, 深度偏移, 1/阴影图边长, 立板受影比例)；uShadowTint 是影子里的颜色倍率（偏冷）。
export const SHADOW_FS = `
uniform sampler2D uShadowMap; uniform vec4 uShadowParams; uniform vec3 uShadowTint;
float shadowAt(vec3 sc){
  if (uShadowParams.x <= 0.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 0.0;
  float t = uShadowParams.z * 1.25, z = sc.z - uShadowParams.y;
  float s = step(texture2D(uShadowMap, sc.xy).r, z) * 2.0;
  s += step(texture2D(uShadowMap, sc.xy + vec2(-t, -t)).r, z); s += step(texture2D(uShadowMap, sc.xy + vec2(t, -t)).r, z);
  s += step(texture2D(uShadowMap, sc.xy + vec2(-t, t)).r, z); s += step(texture2D(uShadowMap, sc.xy + vec2(t, t)).r, z);
  // 阴影图边缘淡出，免得影子在视野边上被一刀切掉
  vec2 edge = min(sc.xy, 1.0 - sc.xy);
  return s / 6.0 * smoothstep(0.0, 0.04, min(edge.x, edge.y));
}
vec3 shadowMul(float s){ return mix(vec3(1.0), uShadowTint, s * uShadowParams.x); }`;
