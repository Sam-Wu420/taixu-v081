// 兼容既有 v0.53 画材调用：原版阵法、化形与破禁盘均按需程序生成。
// 秘境画材当前无纹理实现，返回 null 让既有世界绘制代码回退，不隐式加载旧图片。
import { formationEffectImage, formationEffectMeta } from './formationEffects';
import { formationImage, isFormationImage } from './formationProcedural';
import { spiritImage, spiritMeta } from './spiritProcedural';
import { V053_META } from './v053Data';
export function v53(k:string):HTMLCanvasElement|null {
 if(spiritMeta(k))return spiritImage(k);
 if(isFormationImage(k))return formationImage(k);
 if(formationEffectMeta(k))return formationEffectImage(k);
 return null;
}
/** 预热由调用方指定的程序画材；空列表无工作。 */
export function warm53(keys:string[]){for(const k of keys)v53(k)}
/** 图片 URL 路径不再使用；图标由独立程序图标接口提供。 */
export function url53(_k:string):undefined{return undefined}
export function meta53(k:string):{w:number;h:number;ax?:number;ay?:number;ws?:number}|undefined {return spiritMeta(k)??formationEffectMeta(k)??V053_META[k]}
export function loaded53(){return true}
