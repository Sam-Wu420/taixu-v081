export type School = '火' | '冰' | '雷' | '风' | '土' | '木' | '剑' | '体' | '御' | '魔' | '识' | '阵' | '身' | '符' | '神';
export declare const SCHOOL_NAME: Record<School, string>;
export declare const SCHOOL_COLOR: Record<School, string>;
export type StatusKind = 'burn' | 'freeze' | 'shock' | 'poison' | 'root' | 'knock' | 'break' | 'slow' | 'stun';
export declare const STATUS_NAME: Record<StatusKind, string>;
export declare const STATUS_COLOR: Record<StatusKind, string>;
export type Cast = 'custom' | 'bolt' | 'fan' | 'nova' | 'burst' | 'cone' | 'beam' | 'strike' | 'chain' | 'field' | 'orbit' | 'dash' | 'blink' | 'buff' | 'shield' | 'heal' | 'summon' | 'sense';
export type Fx = 'fireball' | 'firesnake' | 'crow' | 'flame' | 'icefire' | 'icicle' | 'frost' | 'needle' | 'water' | 'lightning' | 'goldthunder' | 'wind' | 'tornado' | 'rock' | 'vine' | 'leaf' | 'sword' | 'bigsword' | 'palm' | 'roar' | 'blood' | 'ghost' | 'mind' | 'array' | 'talisman' | 'gold' | 'star' | 'magnet' | 'dragon' | 'none';
export interface StatusSpec {
    k: StatusKind;
    dur: number;
    ch: number;
}
export interface ArtSkill {
    id: string;
    name: string;
    school: School;
    tier: 0 | 1 | 2 | 3 | 4;
    realm: number;
    cast: Cast;
    fx: Fx;
    mp: number;
    hpCost?: number;
    cd: number;
    power: number;
    range: number;
    radius?: number;
    count?: number;
    speed?: number;
    pierce?: boolean;
    homing?: boolean;
    dur?: number;
    status?: StatusSpec;
    buff?: {
        atk?: number;
        def?: number;
        speed?: number;
        regen?: number;
        stealth?: boolean;
        reflect?: number;
        decoy?: boolean;
    };
    summon?: {
        kind: 'bugs' | 'puppet' | 'fox' | 'tihun' | 'demon' | 'quhun';
        n: number;
    };
    needs?: string;
    vsEvil?: number;
    color: string;
    desc: string;
    evo: [string, string, string];
    lvCount?: [number, number, number, number];
}
export declare const TIER_NAME: string[];
export declare const TIER_COLOR: string[];
export declare const PROF_NAME: string[];
export declare const PROF_DMG: number[];
export declare const PROF_RAD: number[];
export declare const PROF_CH: number[];
export declare const PROF_CD: number[];
/** 各熟练度所需施展次数（随品阶增加） */
export declare function profNeed(tier: number): number[];
export declare const SHENTONG: ArtSkill[];
export declare const ARTS: Record<string, ArtSkill>;
export declare const ART_LIST: ArtSkill[];
export declare function artById(id: string): ArtSkill | undefined;
/** 开局所学 */
export declare const START_ARTS: string[];
export declare const START_HOTBAR: (string | null)[];
/** 熟练度等级 */
export declare function profLevel(tier: number, xp: number): 0 | 1 | 2 | 3;
