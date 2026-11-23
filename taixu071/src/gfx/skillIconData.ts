// 法术与阵法 UI 图标：受控几何按数据生成。模组显式注册图标仍优先。
import { ARTS } from '../data/arts';
import { ZHEN_BY_ID } from '../data/zhenfa';
import type { ArtSkill } from '../data/arts';

/** 只存模组显式指定的图标；原版不再依赖外部图像。 */
export const SKILL_ICON:Record<string,string>=Object.create(null);
type Shape='fire'|'ice'|'water'|'lightning'|'wind'|'earth'|'wood'|'sword'|'body'|'ghost'|'mind'|'array'|'talisman'|'star'|'beast'|'shield'|'heal';
const cache=new Map<string,string>();
const MAX_CACHE=512;
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0}
function safeColor(s:unknown){
 if(typeof s!=='string'||!/^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(s))return '#abc5b9';
 const rgb=s.split(',').map(x=>Math.max(0,Math.min(255,Number(x))));return '#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** 优先按施法作用区分，其次按特效分类；未知/模组扩展保持安全默认造型。 */
export function skillIconShape(a:Pick<ArtSkill,'fx'|'cast'>):Shape {
 if(a.cast==='shield')return 'shield';if(a.cast==='heal')return 'heal';if(a.cast==='summon')return 'beast';
 switch(a.fx){
 case 'fireball':case 'firesnake':case 'crow':case 'flame':case 'icefire':return 'fire';
 case 'icicle':case 'frost':case 'needle':return 'ice';case 'water':return 'water';
 case 'lightning':case 'goldthunder':return 'lightning';case 'wind':case 'tornado':return 'wind';
 case 'rock':case 'magnet':return 'earth';case 'vine':case 'leaf':return 'wood';
 case 'sword':case 'bigsword':return 'sword';case 'palm':case 'roar':return 'body';
 case 'blood':case 'ghost':return 'ghost';case 'mind':return 'mind';case 'array':return 'array';case 'talisman':return 'talisman';
 case 'dragon':return 'beast';default:return 'star';
 }
}
function shapeSvg(shape:Shape,c:string):string{
 switch(shape){
 case 'fire':return `<path d="M32 52C20 52 16 43 20 34C22 29 24 26 25 20C31 24 30 29 31 30C35 25 36 18 36 11C45 22 48 29 46 37C50 46 44 52 32 52Z" fill="${c}"/><path d="M32 47C26 47 25 43 28 38L33 29L37 39C40 43 38 47 32 47Z" fill="#f5dfa8"/>`;
 case 'ice':return `<path d="M32 10L38 27L48 17L44 32L53 38L39 39L32 54L25 39L11 38L20 32L16 17L26 27Z" fill="${c}"/><path d="M32 14V49M20 22L44 42M44 22L20 42" fill="none" stroke="#eff7ed"/>`;
 case 'water':return `<path d="M32 11C27 19 18 30 18 38A14 14 0 0 0 46 38C46 30 37 19 32 11Z" fill="${c}"/><path d="M23 39Q24 45 31 47M21 34Q32 29 43 34" fill="none" stroke="#edf7ed" stroke-width="2"/>`;
 case 'lightning':return `<path d="M36 9L20 34H29L25 54L45 27H35L42 9Z" fill="${c}"/><path d="M34 15L25 29H31" fill="none" stroke="#fff6d2" stroke-width="2"/>`;
 case 'wind':return `<path d="M12 24Q23 13 36 19Q43 23 38 27Q35 29 32 26M11 34Q28 26 45 31Q54 35 46 40Q41 43 39 39M16 44Q27 40 33 43" fill="none" stroke="${c}" stroke-width="4"/>`;
 case 'earth':return `<path d="M10 46L21 29L27 34L36 14L54 46Z" fill="${c}"/><path d="M13 47H52M22 31L27 40L36 19L40 29" fill="none" stroke="#f4e6c9" stroke-width="1.5"/>`;
 case 'wood':return `<path d="M32 52Q29 36 34 15M32 38Q20 38 17 27Q27 24 32 35M34 29Q40 19 49 22Q49 32 34 34" fill="${c}"/><path d="M32 52Q29 36 34 15M21 28L31 36M45 25L35 31" fill="none" stroke="#e1eed5"/>`;
 case 'sword':return `<path d="M20 47L39 19L47 12L45 23L25 50Z" fill="${c}"/><path d="M20 40L29 47M18 49L22 53M26 41L42 18" fill="none" stroke="#f2eddb" stroke-width="2"/>`;
 case 'body':return `<path d="M18 36L16 27Q16 24 19 24Q21 24 21 27L21 20Q21 17 24 17Q27 17 27 20L27 18Q27 15 30 15Q33 15 33 18L33 20Q34 17 37 18Q40 19 39 23L39 31L43 28Q48 25 49 29Q49 31 46 34L40 43L38 50H24L23 43Z" fill="${c}"/>`;
 case 'ghost':return `<path d="M17 48L19 29Q21 14 32 14Q43 14 45 29L47 48L39 44L33 51L26 44Z" fill="${c}"/><path d="M24 30L28 31M36 31L40 30M27 38Q32 35 37 38" fill="none" stroke="#f6eadf" stroke-width="2"/>`;
 case 'mind':return `<path d="M11 32Q32 13 53 32Q32 51 11 32Z" fill="${c}"/><circle cx="32" cy="32" r="9" fill="#f1e6cf"/><circle cx="32" cy="32" r="4" fill="#594f5a"/>`;
 case 'array':return `<circle cx="32" cy="32" r="20" fill="none" stroke="${c}" stroke-width="3"/><circle cx="32" cy="32" r="13" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M32 13L48 40H16Z M16 24H48L32 51Z" fill="none" stroke="${c}" stroke-width="1.5"/><circle cx="32" cy="32" r="3" fill="#f4e7bb"/>`;
 case 'talisman':return `<path d="M20 10H44L46 53L33 50L18 53Z" fill="${c}"/><path d="M25 17H39M32 20V40M25 26H39L34 32L39 38M24 43H40" fill="none" stroke="#a54e41" stroke-width="2"/>`;
 case 'beast':return `<path d="M18 35L17 21L25 25Q32 20 39 25L47 21L46 35Q44 46 32 51Q20 46 18 35Z" fill="${c}"/><path d="M23 34L28 35M36 35L41 34M27 41Q32 44 37 41" fill="none" stroke="#f1e9d7" stroke-width="2"/>`;
 case 'shield':return `<path d="M32 11L48 17V30Q47 44 32 53Q17 44 16 30V17Z" fill="${c}"/><path d="M32 17L42 21V30Q41 40 32 46Q23 40 22 30V21Z" fill="none" stroke="#f4e9c9" stroke-width="2"/>`;
 case 'heal':return `<path d="M27 15H37V26H48V37H37V49H27V37H16V26H27Z" fill="${c}"/><path d="M32 20V44M21 32H43" fill="none" stroke="#eff4d9" stroke-width="2"/>`;
 default:return `<path d="M32 11L36 25L50 19L41 31L54 36L39 38L40 52L32 42L24 52L25 38L10 36L23 31L14 19L28 25Z" fill="${c}"/>`;
 }
}
function makeIcon(shape:Shape,color:string,tier:number,seed:number,flags=0):string{
 const level=Number.isInteger(tier)?Math.max(0,Math.min(4,tier)):0, decoration=seed%4;
 const key=`${shape}|${color}|${level}|${decoration}|${flags}`;const hit=cache.get(key);if(hit)return hit;
 let markings='';for(let i=0;i<level;i++)markings+=`<circle cx="${25+i*5}" cy="57" r="1.2" fill="#e6d29b"/>`;
 if(flags){const n=Math.max(2,Math.min(8,flags));for(let i=0;i<n;i++){const a=i*Math.PI*2/n;markings+=`<circle cx="${(32+25*Math.cos(a)).toFixed(1)}" cy="${(32+25*Math.sin(a)).toFixed(1)}" r="1.3" fill="${color}"/>`}}
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#303b3a"/><circle cx="32" cy="32" r="27" fill="#263431" stroke="${color}" stroke-width="1.5"/><circle cx="32" cy="32" r="23" fill="${color}" fill-opacity=".16"/><g stroke="#45463c" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${shapeSvg(shape,color)}</g><path d="M${15+decoration} 16L${19+decoration} 12" stroke="#eee1b9" stroke-width="1"/>${markings}</svg>`;
 const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value!);cache.set(key,url);return url;
}
/** 程序生成的法术/阵法图标回退（忽略 SKILL_ICON 模组覆写）；无效/未知 id 返回 undefined。 */
export function skillFallbackIconURL(id:string):string|undefined{
 if(typeof id!=='string'||!id)return undefined;
 if(id.startsWith('zf:')){const zid=id.slice(3);if(!Object.prototype.hasOwnProperty.call(ZHEN_BY_ID,zid))return undefined;const z=ZHEN_BY_ID[zid];if(!z)return undefined;return makeIcon('array',safeColor(z.color),2,hash(id),Number.isFinite(z.flags)?Math.floor(z.flags):0)}
 if(!Object.prototype.hasOwnProperty.call(ARTS,id))return undefined;const a=ARTS[id];if(!a)return undefined;return makeIcon(skillIconShape(a),safeColor(a.color),a.tier,hash(id));
}
/** 查询时读取数据，模组新增或修改法术后无需重建映射；无效/未知 id 返回 undefined。 */
export function skillIconURL(id:string):string|undefined{
 if(typeof id!=='string'||!id)return undefined;
 if(Object.prototype.hasOwnProperty.call(SKILL_ICON,id)&&SKILL_ICON[id])return SKILL_ICON[id];
 return skillFallbackIconURL(id);
}
