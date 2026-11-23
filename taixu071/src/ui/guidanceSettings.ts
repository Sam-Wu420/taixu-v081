export const GUIDANCE_SETTINGS_KEY='fanren.guidance.ui.v1';
export const GUIDANCE_CATEGORIES=['全部','机缘','灵物','妖兽','修士'] as const;
export type GuidanceCategory=typeof GUIDANCE_CATEGORIES[number];
export type GuidanceSettings={showAll:boolean;collapsed:boolean;category:GuidanceCategory};
/** UI preference only: safe defaults if storage is unavailable or malformed. */
export function loadGuidanceSettings(touch:boolean,storage?:Pick<Storage,'getItem'>):GuidanceSettings {
  const defaults:GuidanceSettings={showAll:!touch,collapsed:false,category:'全部'};
  try {
    const s=storage??globalThis.localStorage,raw=s.getItem(GUIDANCE_SETTINGS_KEY);if(!raw)return defaults;
    const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return defaults;
    const v=value as Record<string,unknown>;
    return {showAll:typeof v.showAll==='boolean'?v.showAll:defaults.showAll,collapsed:typeof v.collapsed==='boolean'?v.collapsed:defaults.collapsed,category:typeof v.category==='string'&&(GUIDANCE_CATEGORIES as readonly string[]).includes(v.category)?v.category as GuidanceCategory:defaults.category};
  }catch{return defaults;}
}
export function saveGuidanceSettings(value:GuidanceSettings,storage?:Pick<Storage,'setItem'>):void {
  try{(storage??globalThis.localStorage).setItem(GUIDANCE_SETTINGS_KEY,JSON.stringify(value));}catch{/* Private mode or blocked storage: keep the current session usable. */}
}
