type G = CanvasRenderingContext2D;
type RGB = [number, number, number];
export type BeastBody = 'wolf' | 'fox' | 'boar' | 'tiger' | 'bear' | 'ape' | 'snake' | 'jiao' | 'centipede' | 'spider' | 'scorpion' | 'eagle' | 'bat' | 'ghost' | 'turtle' | 'rat' | 'deer' | 'ox' | 'croc' | 'horse' | 'pangolin' | 'fish' | 'carp' | 'shark' | 'urchin' | 'jelly' | 'toad' | 'ant' | 'mantis' | 'corpse' | 'yaksha' | 'demon';
export interface BeastLook {
    body: BeastBody;
    color: RGB;
    belly?: RGB;
    accent?: RGB;
    eye?: string;
    size: number;
    horn?: boolean;
    mane?: boolean;
    spikes?: boolean;
    stripes?: boolean;
    tails?: number;
    heads?: number;
    glow?: string;
    eye3?: boolean;
    bull?: boolean;
    crest?: RGB;
    tail?: 'fan' | 'streamer' | 'fish';
    claws?: number;
    wings?: number;
    face?: 'baby';
    eyes?: number;
}
export interface BeastAnim {
    move: number;
    phase: number;
    atk: number;
    hit: number;
    t: number;
    flying?: boolean;
}
export declare function drawBeast(g: G, L: BeastLook, x: number, y: number, facing: number, A: BeastAnim, scale?: number): void;
export {};
