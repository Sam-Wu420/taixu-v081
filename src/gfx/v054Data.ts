// v0.54 秘境画材（外部 AI 绘制；tools/v054convert.ts 生成，勿手改）
import b0 from '../assets/v054/floor_cave.webp?inline';
import b1 from '../assets/v054/wall_cave.webp?inline';
import b2 from '../assets/v054/rock_cave.webp?inline';
import b3 from '../assets/v054/floor_tomb.webp?inline';
import b4 from '../assets/v054/wall_tomb.webp?inline';
import b5 from '../assets/v054/rock_tomb.webp?inline';
import b6 from '../assets/v054/floor_ice.webp?inline';
import b7 from '../assets/v054/wall_ice.webp?inline';
import b8 from '../assets/v054/rock_ice.webp?inline';
import b9 from '../assets/v054/floor_fire.webp?inline';
import b10 from '../assets/v054/wall_fire.webp?inline';
import b11 from '../assets/v054/rock_fire.webp?inline';
import b12 from '../assets/v054/floor_forest.webp?inline';
import b13 from '../assets/v054/wall_forest.webp?inline';
import b14 from '../assets/v054/rock_forest.webp?inline';
import b15 from '../assets/v054/floor_desert.webp?inline';
import b16 from '../assets/v054/wall_desert.webp?inline';
import b17 from '../assets/v054/rock_desert.webp?inline';
import b18 from '../assets/v054/floor_sea.webp?inline';
import b19 from '../assets/v054/wall_sea.webp?inline';
import b20 from '../assets/v054/rock_sea.webp?inline';
import b21 from '../assets/v054/floor_palace.webp?inline';
import b22 from '../assets/v054/wall_palace.webp?inline';
import b23 from '../assets/v054/rock_palace.webp?inline';
import b24 from '../assets/v054/floor_blood.webp?inline';
import b25 from '../assets/v054/wall_blood.webp?inline';
import b26 from '../assets/v054/rock_blood.webp?inline';
import b27 from '../assets/v054/liquid_water.webp?inline';
import b28 from '../assets/v054/liquid_lava.webp?inline';
import b29 from '../assets/v054/liquid_abyss.webp?inline';
import b30 from '../assets/v054/liquid_icelake.webp?inline';
import b31 from '../assets/v054/liquid_blood.webp?inline';
import b32 from '../assets/v054/prop_blood_altar.webp?inline';
import b33 from '../assets/v054/prop_blood_banner.webp?inline';
import b34 from '../assets/v054/prop_blood_spikes.webp?inline';
import b35 from '../assets/v054/prop_cave_bed.webp?inline';
import b36 from '../assets/v054/prop_cave_furnace.webp?inline';
import b37 from '../assets/v054/prop_cave_pillar.webp?inline';
import b38 from '../assets/v054/prop_desert_beast.webp?inline';
import b39 from '../assets/v054/prop_desert_column.webp?inline';
import b40 from '../assets/v054/prop_desert_urn.webp?inline';
import b41 from '../assets/v054/prop_fire_altar.webp?inline';
import b42 from '../assets/v054/prop_fire_pillar.webp?inline';
import b43 from '../assets/v054/prop_fire_vent.webp?inline';
import b44 from '../assets/v054/prop_forest_bones.webp?inline';
import b45 from '../assets/v054/prop_forest_roots.webp?inline';
import b46 from '../assets/v054/prop_forest_shrine.webp?inline';
import b47 from '../assets/v054/prop_ice_crystal.webp?inline';
import b48 from '../assets/v054/prop_ice_frozen.webp?inline';
import b49 from '../assets/v054/prop_ice_pillar.webp?inline';
import b50 from '../assets/v054/prop_palace_censer.webp?inline';
import b51 from '../assets/v054/prop_palace_column.webp?inline';
import b52 from '../assets/v054/prop_palace_throne.webp?inline';
import b53 from '../assets/v054/prop_sea_clam.webp?inline';
import b54 from '../assets/v054/prop_sea_coral.webp?inline';
import b55 from '../assets/v054/prop_sea_wreck.webp?inline';
import b56 from '../assets/v054/prop_tomb_coffin.webp?inline';
import b57 from '../assets/v054/prop_tomb_guardian.webp?inline';
import b58 from '../assets/v054/prop_tomb_lamp.webp?inline';
import b59 from '../assets/v054/chest_1.webp?inline';
import b60 from '../assets/v054/chest_2.webp?inline';
import b61 from '../assets/v054/chest_3.webp?inline';
import b62 from '../assets/v054/chest_open.webp?inline';
import b63 from '../assets/v054/herb_1.webp?inline';
import b64 from '../assets/v054/herb_2.webp?inline';
import b65 from '../assets/v054/herb_3.webp?inline';
import b66 from '../assets/v054/gate_exit.webp?inline';
import b67 from '../assets/v054/gate_down.webp?inline';
import b68 from '../assets/v054/entrance_small.webp?inline';
import b69 from '../assets/v054/entrance_mid.webp?inline';
import b70 from '../assets/v054/entrance_big.webp?inline';

export const V054_SRC: Record<string, string> = {
  floor_cave: b0,
  wall_cave: b1,
  rock_cave: b2,
  floor_tomb: b3,
  wall_tomb: b4,
  rock_tomb: b5,
  floor_ice: b6,
  wall_ice: b7,
  rock_ice: b8,
  floor_fire: b9,
  wall_fire: b10,
  rock_fire: b11,
  floor_forest: b12,
  wall_forest: b13,
  rock_forest: b14,
  floor_desert: b15,
  wall_desert: b16,
  rock_desert: b17,
  floor_sea: b18,
  wall_sea: b19,
  rock_sea: b20,
  floor_palace: b21,
  wall_palace: b22,
  rock_palace: b23,
  floor_blood: b24,
  wall_blood: b25,
  rock_blood: b26,
  liquid_water: b27,
  liquid_lava: b28,
  liquid_abyss: b29,
  liquid_icelake: b30,
  liquid_blood: b31,
  prop_blood_altar: b32,
  prop_blood_banner: b33,
  prop_blood_spikes: b34,
  prop_cave_bed: b35,
  prop_cave_furnace: b36,
  prop_cave_pillar: b37,
  prop_desert_beast: b38,
  prop_desert_column: b39,
  prop_desert_urn: b40,
  prop_fire_altar: b41,
  prop_fire_pillar: b42,
  prop_fire_vent: b43,
  prop_forest_bones: b44,
  prop_forest_roots: b45,
  prop_forest_shrine: b46,
  prop_ice_crystal: b47,
  prop_ice_frozen: b48,
  prop_ice_pillar: b49,
  prop_palace_censer: b50,
  prop_palace_column: b51,
  prop_palace_throne: b52,
  prop_sea_clam: b53,
  prop_sea_coral: b54,
  prop_sea_wreck: b55,
  prop_tomb_coffin: b56,
  prop_tomb_guardian: b57,
  prop_tomb_lamp: b58,
  chest_1: b59,
  chest_2: b60,
  chest_3: b61,
  chest_open: b62,
  herb_1: b63,
  herb_2: b64,
  herb_3: b65,
  gate_exit: b66,
  gate_down: b67,
  entrance_small: b68,
  entrance_mid: b69,
  entrance_big: b70,
};

/** 尺寸；精灵另有 ws（存图倍率的倒数，乘上即世界尺寸）与落地点 ax/ay（宽高比例） */
export const V054_META: Record<string, { w: number; h: number; ax?: number; ay?: number; ws?: number }> = {"floor_cave":{"w":512,"h":512},"wall_cave":{"w":512,"h":192},"rock_cave":{"w":256,"h":256},"floor_tomb":{"w":512,"h":512},"wall_tomb":{"w":512,"h":192},"rock_tomb":{"w":256,"h":256},"floor_ice":{"w":512,"h":512},"wall_ice":{"w":512,"h":192},"rock_ice":{"w":256,"h":256},"floor_fire":{"w":512,"h":512},"wall_fire":{"w":512,"h":192},"rock_fire":{"w":256,"h":256},"floor_forest":{"w":512,"h":512},"wall_forest":{"w":512,"h":192},"rock_forest":{"w":256,"h":256},"floor_desert":{"w":512,"h":512},"wall_desert":{"w":512,"h":192},"rock_desert":{"w":256,"h":256},"floor_sea":{"w":512,"h":512},"wall_sea":{"w":512,"h":192},"rock_sea":{"w":256,"h":256},"floor_palace":{"w":512,"h":512},"wall_palace":{"w":512,"h":192},"rock_palace":{"w":256,"h":256},"floor_blood":{"w":512,"h":512},"wall_blood":{"w":512,"h":192},"rock_blood":{"w":256,"h":256},"liquid_water":{"w":256,"h":256},"liquid_lava":{"w":256,"h":256},"liquid_abyss":{"w":256,"h":256},"liquid_icelake":{"w":256,"h":256},"liquid_blood":{"w":256,"h":256},"prop_blood_altar":{"w":324,"h":177,"ws":0.6667,"ax":0.496,"ay":0.983},"prop_blood_banner":{"w":283,"h":360,"ws":0.6667,"ax":0.666,"ay":0.992},"prop_blood_spikes":{"w":216,"h":203,"ws":0.6667,"ax":0.542,"ay":0.99},"prop_cave_bed":{"w":270,"h":199,"ws":0.6667,"ax":0.822,"ay":0.985},"prop_cave_furnace":{"w":164,"h":180,"ws":0.6667,"ax":0.482,"ay":0.989},"prop_cave_pillar":{"w":128,"h":360,"ws":0.6667,"ax":0.427,"ay":0.992},"prop_desert_beast":{"w":270,"h":225,"ws":0.6667,"ax":0.211,"ay":0.987},"prop_desert_column":{"w":262,"h":270,"ws":0.6667,"ax":0.421,"ay":0.978},"prop_desert_urn":{"w":180,"h":80,"ws":0.6667,"ax":0.445,"ay":0.938},"prop_fire_altar":{"w":284,"h":216,"ws":0.6667,"ax":0.491,"ay":0.986},"prop_fire_pillar":{"w":202,"h":360,"ws":0.6667,"ax":0.414,"ay":0.992},"prop_fire_vent":{"w":216,"h":119,"ws":0.6667,"ax":0.487,"ay":0.983},"prop_forest_bones":{"w":270,"h":154,"ws":0.6667,"ax":0.447,"ay":0.981},"prop_forest_roots":{"w":360,"h":230,"ws":0.6667,"ax":0.615,"ay":0.987},"prop_forest_shrine":{"w":231,"h":234,"ws":0.6667,"ax":0.15,"ay":0.987},"prop_ice_crystal":{"w":180,"h":107,"ws":0.6667,"ax":0.423,"ay":0.981},"prop_ice_frozen":{"w":268,"h":234,"ws":0.6667,"ax":0.555,"ay":0.97},"prop_ice_pillar":{"w":311,"h":360,"ws":0.6667,"ax":0.499,"ay":0.992},"prop_palace_censer":{"w":201,"h":234,"ws":0.6667,"ax":0.547,"ay":0.987},"prop_palace_column":{"w":134,"h":450,"ws":0.6667,"ax":0.492,"ay":0.996},"prop_palace_throne":{"w":270,"h":211,"ws":0.6667,"ax":0.499,"ay":0.991},"prop_sea_clam":{"w":270,"h":174,"ws":0.6667,"ax":0.531,"ay":0.983},"prop_sea_coral":{"w":427,"h":360,"ws":0.6667,"ax":0.499,"ay":0.992},"prop_sea_wreck":{"w":450,"h":187,"ws":0.6667,"ax":0.517,"ay":0.984},"prop_tomb_coffin":{"w":288,"h":180,"ws":0.6667,"ax":0.739,"ay":0.983},"prop_tomb_guardian":{"w":103,"h":270,"ws":0.6667,"ax":0.48,"ay":0.989},"prop_tomb_lamp":{"w":80,"h":216,"ws":0.6667,"ax":0.425,"ay":0.991},"chest_1":{"w":108,"h":65,"ws":0.6667,"ax":0.752,"ay":0.969},"chest_2":{"w":126,"h":72,"ws":0.6667,"ax":0.64,"ay":0.972},"chest_3":{"w":144,"h":103,"ws":0.6667,"ax":0.741,"ay":0.981},"chest_open":{"w":126,"h":100,"ws":0.6667,"ax":0.496,"ay":0.98},"herb_1":{"w":81,"h":110,"ws":0.6667,"ax":0.479,"ay":0.982},"herb_2":{"w":81,"h":99,"ws":0.6667,"ax":0.434,"ay":0.98},"herb_3":{"w":81,"h":77,"ws":0.6667,"ax":0.453,"ay":0.961},"gate_exit":{"w":384,"h":384},"gate_down":{"w":384,"h":384},"entrance_small":{"w":450,"h":415,"ws":0.6667,"ax":0.446,"ay":0.99},"entrance_mid":{"w":720,"h":472,"ws":0.6667,"ax":0.687,"ay":0.989},"entrance_big":{"w":1080,"h":760,"ws":0.6667,"ax":0.56,"ay":0.993}};

export const V054_GLOW = new Set(["gate_exit","gate_down"]);
