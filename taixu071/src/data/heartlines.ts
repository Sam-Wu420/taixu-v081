// 第十八步：红颜的日常 —— 传音符、约会、同行闲话、吃醋、求援

export type DateScene = 'moon' | 'sea' | 'snow' | 'flowers' | 'rain' | 'town' | 'tea' | 'peak';
export const DATE_NAME: Record<DateScene, string> = { moon: '月下', sea: '观海', snow: '踏雪', flowers: '赏花', rain: '听雨', town: '逛集', tea: '煮茶', peak: '登高' };
export const DATE_TEXT: Record<DateScene, string> = {
  moon: '夜色如水，一轮明月悬在山巅。你们并肩坐在青石上，谁也没有先开口。远处虫鸣细细，风里有草木的清香。',
  sea: '海风猎猎，浪头一层层卷上礁石，碎成雪白的沫。她把被风吹乱的鬓发拢到耳后，望着天水相接的地方出神。',
  snow: '大雪封山，天地一片素白。你们一前一后踩着积雪，身后两行脚印，很快又被新雪盖住。',
  flowers: '山坡上开满了不知名的野花，蝴蝶在花间起落。她弯腰折了一枝，回头看你。',
  rain: '细雨如丝，你们躲进路旁的亭子。雨打在瓦上，叮叮咚咚，像有人在檐下弹琴。',
  town: '集市上人声鼎沸，糖人、面具、胭脂水粉，凡俗的热闹扑面而来。她走得很慢，每个摊子都要看一看。',
  tea: '你们寻了处清静的崖边，以灵泉煮茶。水汽袅袅，茶香氤氲，她低头吹着杯中的浮沫。',
  peak: '你们一路御风登上绝顶。云海在脚下翻涌，群山如墨，天地辽阔得让人想放声长啸。',
};
/** 约会的三种应对：0 深情 1 逗趣 2 静默相伴 */
export const DATE_CHOICES = ['（轻声说出心里话）', '（逗她开心）', '（什么也不说，只是陪着她）'];

export interface HeartLines {
  letters: string[];          // 闲话传音
  bubbles: string[];          // 同行闲话（头顶气泡）
  prefer: number;             // 约会时最喜欢哪种应对（0/1/2）
  date: Partial<Record<DateScene, string>>;   // 约会时她的反应
  jealous: string;            // 吃醋
  sos: string;                // 求援传音
  saved: string;              // 获救后
  dual: string;               // 双修后
  keep: [string, string, string];   // 赠信物（40/60/80）
}

/** v0.70：原著红颜移除，各人口吻随之清空（模组可在此表里自行添加） */
export const HEART_LINES: Record<string, HeartLines> = {};

export const CONTEXT_BUBBLES: { when: string; lines: string[] }[] = [
  { when: 'rain', lines: ['下雨了……靠近些。', '雨声真好听。', '你的衣服湿了。'] },
  { when: 'snow', lines: ['好大的雪。', '冷不冷？', '雪地里留下的脚印，只有我们两个。'] },
  { when: 'night', lines: ['夜深了。', '今晚的星星真亮。', '天黑了，别走太远。'] },
  { when: 'sea', lines: ['海风好大。', '这片海，一直延伸到哪里呢？'] },
  { when: 'hurt', lines: ['你流血了！', '先停下，我替你疗伤。', '别逞强。'] },
  { when: 'fight', lines: ['我来帮你！', '小心身后！', '这些家伙交给我。'] },
  { when: 'fly', lines: ['飞慢一点……', '从上面看，山河真美。'] },
];
export const FESTIVALS: { m: number; d: number; name: string; text: string }[] = [
  { m: 1, d: 15, name: '元宵', text: '凡间正闹元宵，满城花灯如昼。她提着一盏兔子灯，在灯影里回头看你，眉眼都被映成了暖色。' },
  { m: 7, d: 7, name: '七夕', text: '七夕夜，银河横贯天际。传说今夜牛郎织女相会。她指着天上那两颗星，问你：「你说，他们一年只见一次，会不会很苦？」' },
  { m: 8, d: 15, name: '中秋', text: '中秋月圆。你们在山间寻了块平石，摆上几块月饼、一壶灵酒。她举杯邀月，月光落进杯里，晃成一片碎银。' },
];
