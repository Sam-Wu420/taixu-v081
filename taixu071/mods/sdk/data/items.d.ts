export type ItemType = 'herb' | 'pill' | 'material' | 'artifact' | 'talisman' | 'scroll' | 'misc';
export type ArtKind = 'sword' | 'needle' | 'ring' | 'mirror' | 'slam' | 'arrow' | 'bell' | 'bind' | 'flame' | 'banner' | 'cauldron' | 'shield' | 'armor' | 'wings' | 'flight' | 'boots';
export interface ArtSpec {
    kind: ArtKind;
    reqRealm: number;
    sense: number;
    pieces: number;
    power: number;
    mp: number;
    cd: number;
    element?: 'fire' | 'ice' | 'thunder' | 'gold' | 'wood' | 'water' | 'earth' | 'yin' | 'blood';
    mapSpeed?: number;
    def?: number;
    absorb?: number;
    hpCost?: number;
    color: string;
    upgradable?: boolean;
}
export interface PillEffect {
    exp?: number;
    expPct?: number;
    hp?: number;
    mp?: number;
    life?: number;
    sense?: number;
    root?: number;
    favor?: number;
}
export interface TalSpec {
    kind: 'fire' | 'thunder' | 'ice' | 'shield' | 'escape' | 'revive' | 'fubao' | 'bomb';
    power: number;
    color: string;
}
export interface ItemDef {
    id: string;
    name: string;
    type: ItemType;
    tier: number;
    price: number;
    desc: string;
    glyph: string;
    pill?: PillEffect;
    art?: ArtSpec;
    tal?: TalSpec;
    scroll?: {
        gongfa?: string;
        skill?: string;
        zhen?: string;
    };
    herbBase?: number;
    giftValue?: number;
    stack?: boolean;
}
export declare const TIER_COLORS: string[];
export declare const TIER_NAMES: string[];
/** 一门法术的卷轴（v0.55：模组新加的法术也走这里） */
export declare function scrollItemOf(a: import('./arts').ArtSkill): ItemDef;
export declare const ITEMS: Record<string, ItemDef>;
export declare const ITEM_LIST: ItemDef[];
export declare function itemDef(id: string): ItemDef;
/**
 * v0.52.2：灵药的「药龄溢价」。
 * 原版只给到 ×3（且 200 年封顶），一瓶墨露催熟百年几乎卖不出价钱，问道残卷成了摆设。
 * 现在按「药龄 / 该药天然年份」的幂次计价：年份越久越金贵，且涨得比线性快，催熟才有厚利。
 *   · 百年黄精 ≈ 二十倍基价，千年黄精 ≈ 二百倍；天雷竹这类千年级灵木溢价更缓（herbBase 大）
 * 注意：坊市买价也乘这个系数，免得「买进—原样卖出」套利。
 */
export declare function herbAgeMul(it: ItemDef, age?: number): number;
/** 灵药在通常行情下的估值（未计产地与信义折扣） */
export declare function herbValue(it: ItemDef, age?: number): number;
