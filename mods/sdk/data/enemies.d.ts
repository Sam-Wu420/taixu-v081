import type { BeastLook } from '../gfx/beast';
import type { Fx, StatusSpec } from './arts';
export interface EnemyAtk {
    fx: Fx;
    color: string;
    range: number;
    power: number;
    cd: number;
    speed?: number;
    status?: StatusSpec;
    radius?: number;
    count?: number;
}
export interface EnemyDef {
    id: string;
    name: string;
    kind: 'beast' | 'ghost' | 'human' | 'insect';
    look?: BeastLook;
    robe?: string;
    minDanger: number;
    maxDanger: number;
    regions?: string[];
    zone?: 'cold' | 'arid' | 'sea' | 'forest' | 'demon' | 'grass';
    hp: number;
    atk: number;
    def: number;
    speed: number;
    melee?: {
        range: number;
        power: number;
        cd: number;
        status?: StatusSpec;
    };
    ranged?: EnemyAtk;
    evil?: boolean;
    pack?: [number, number];
    drops: {
        id: string;
        ch: number;
        n?: [number, number];
    }[];
    title?: string;
    flying?: boolean;
    aggro?: number;
    lv?: [number, number];
    /** flee=见人即逃（双瞳鼠、土甲龙、阴芝马）；shy=不主动伤人（炙角鹿）；call=示警召集同类（云翅鸟） */
    behave?: 'flee' | 'shy' | 'call';
    hide?: boolean;
    lair?: boolean;
    /** 第十九步：只在这些原设名地出没（landmarks.ts 的 id） */
    lm?: string[];
}
export declare const ENEMIES: Record<string, EnemyDef>;
export declare const ENEMY_LIST: EnemyDef[];
/** 妖兽等阶 ↔ 境界：1 炼气 · 2/3/4 筑基初中后 · 5/6/7 结丹 · 8/9/10 元婴 */
export declare function lvOf(realm: number, stage: number): number;
export declare function lvRealm(lv: number, lianqiStage?: number): {
    realm: number;
    stage: number;
};
/** 原设称谓：一级妖兽再分下 / 中 / 上 / 顶阶 */
export declare function lvName(lv: number, stage?: number): string;
/** 妖兽在某危险度出没的权重：等阶覆盖当前危险度 → 1；高一级（越阶） → 0.12；否则不出现 */
export declare function lvWeight(def: EnemyDef, band: number, allowUp?: boolean): number;
/** 妖王巢穴：固定位置（地图坐标，×WORLD_SCALE），被斩杀后三年方有新妖王占据 */
export interface LairDef {
    id: string;
    enemy: string;
    x: number;
    y: number;
    name: string;
    desc: string;
}
export declare const LAIRS: LairDef[];
/** 第三十一步：妖气等级 k（0‥8，离青霞谷越远越高）→ 妖兽境界。
 *  k0 一级下阶 · k1 一级中阶 · k2 一级上阶（偶见二级）· k3 一–三级 · k4 二–四级 · k5 三–五级 · k6 四–六级 · k7 五–七级 · k8 六–七级。
 *  野外最高七级；八级以上只作妖王坐镇巢穴。 */
export declare function bandRealm(k: number, rnd: () => number): {
    realm: number;
    stage: number;
};
/** 危险度 → 敌人境界（大境界 + 小境界） */
export declare function dangerRealm(d: number, rnd: () => number): {
    realm: number;
    stage: number;
};
