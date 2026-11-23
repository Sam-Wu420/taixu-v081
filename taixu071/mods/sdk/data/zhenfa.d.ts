export type ZhenCat = '困' | '杀' | '守' | '辅' | '禁';
export interface ZhenDef {
    id: string;
    name: string;
    cat: ZhenCat;
    color: string;
    flags: number;
    realm: number;
    zd: number;
    cost: number;
    r: number;
    dur: number;
    days?: number;
    img: string;
    icon?: string;
    /** 阵图出处：start=入门即会；shop=坊市阵图；ruin=遗府 / 秘境 */
    src: 'start' | 'shop' | 'ruin';
    desc: string;
}
export declare const ZHEN: ZhenDef[];
export declare const ZHEN_BY_ID: Record<string, ZhenDef>;
/** 禁制（只出现在遗府、秘境、宗门；玩家不可布） */
export declare const JINZHI_IMG: {
    gujin: string;
    hushan: string;
};
/** 阵道境界 */
export declare const ZD_NAME: string[];
export declare const ZD_XP: number[];
export declare function zdLevel(xp: number): number;
/** v0.54.2：每座阵各自的精熟（布得越多、阵中困敌越多越熟）：威力、范围、时长、阵眼越来越强，圆满时省一面阵旗 */
export declare const ZM_NAME: string[];
export declare const ZM_XP: number[];
export declare function zmLevel(xp: number): number;
/** 精熟加成：威力 / 半径 / 时长 / 阵眼 / 灵石 */
export declare function zmBonus(lv: number): {
    pow: number;
    rad: number;
    dur: number;
    eye: number;
    cost: number;
};
export declare const ZM_EVO: string[];
/** 阵盘：品阶决定威力、范围、可同时主持的阵数 */
export interface PanDef {
    id: string;
    name: string;
    tier: number;
    power: number;
    rad: number;
    max: number;
}
export declare const PANS: PanDef[];
/** 五行与相生（破禁之局：木 → 火 → 土 → 金 → 水 → 木） */
export type Wx = 'mu' | 'huo' | 'tu' | 'jin' | 'shui';
export declare const WX: Wx[];
export declare const WX_NAME: Record<Wx, string>;
export declare const WX_COLOR: Record<Wx, string>;
export declare const wxNext: (w: Wx) => Wx;
