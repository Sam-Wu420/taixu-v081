// v0.73：宗门制式服装体系（SECT_UNIFORM）
// 同一宗门统一领型 / 袖型 / 下裳 / 外罩 / 纹样 / 主副配色，按外门(0)・内门骨干(1)・长老掌门(2)三阶分化；
// 保留每个人物自身的性别、体型、肤色、发式、胡须、头型与五官参数；原著特写具名角色保留专属定妆。
import type { Look, Collar, OverKind, Pattern, SkirtKind } from './renwu/types';
import { MY_SECT_ID, X_BY_ID } from '../data/sects';
import { shade } from '../core/canvas';

export type UniformCut = 'daopao' | 'qingshan' | 'jinzhuang' | 'guangxiu' | 'mopao' | 'qingjia' | 'rushan' | 'jiasha';

export interface SectUniformSpec {
  id: string;
  cut: UniformCut;
  robe: string;
  inner: string;
  trim: string;
  belt: string;
  pants: string;
  boots: string;
  over?: OverKind;
  overColor?: string;
  pattern?: Pattern;
  cuff?: string;
  shawl?: string;
}

export interface CustomSectUniform {
  cut: UniformCut;
  robe: string;
  trim: string;
  over?: OverKind;
  pattern?: Pattern;
}

export const MY_SECT_UNIFORM_PRESETS: { id: string; name: string; cut: UniformCut; robe: string; trim: string; pattern: Pattern }[] = [
  { id: 'qingyun', name: '青冥云纹道袍', cut: 'daopao', robe: '#4876a8', trim: '#d8be7a', pattern: 'cloud' },
  { id: 'xuanjian', name: '玄锋剑宗劲装', cut: 'jinzhuang', robe: '#2f4560', trim: '#9fc5de', pattern: 'fret' },
  { id: 'qingxia', name: '翠微青衫法衣', cut: 'qingshan', robe: '#3f6a4c', trim: '#c9b478', pattern: 'bamboo' },
  { id: 'suxue', name: '素雪仙宗广袖', cut: 'guangxiu', robe: '#e4eaf0', trim: '#6f94b8', pattern: 'cloud' },
  { id: 'chiye', name: '赤焰血纹玄袍', cut: 'mopao', robe: '#2b181c', trim: '#b83c38', pattern: 'fret' },
  { id: 'jinjia', name: '镇岳玄铁轻甲', cut: 'qingjia', robe: '#4a4642', trim: '#c8a050', pattern: 'fret' },
];

const SPEC_MAP: Record<string, Partial<SectUniformSpec>> = {
  huangfeng: { cut: 'daopao', robe: '#c9a24a', inner: '#f8f2e4', trim: '#7a4d1a', over: 'banbi', overColor: '#a87d2c', pattern: 'cloud' },
  yanyue: { cut: 'guangxiu', robe: '#ece8f4', inner: '#ffffff', trim: '#9888b8', over: 'banbi', overColor: '#c9bddc', pattern: 'flower', shawl: '#e8dff4' },
  miaoyin: { cut: 'guangxiu', robe: '#e8dff2', inner: '#ffffff', trim: '#a662a4', over: 'beizi', overColor: '#b882bc', pattern: 'flower', shawl: '#f2e0f6' },
  lingshou: { cut: 'jinzhuang', robe: '#5c6e44', inner: '#e8e2cc', trim: '#9e7a3a', over: 'vest', overColor: '#485636', cuff: '#4a3a26', pattern: 'fret' },
  qingxu: { cut: 'daopao', robe: '#dce6ee', inner: '#ffffff', trim: '#4e7796', over: 'banbi', overColor: '#6d93b0', pattern: 'cloud' },
  taiyi: { cut: 'daopao', robe: '#e4e0d2', inner: '#fffdf7', trim: '#4b6c8e', over: 'banbi', overColor: '#587898', pattern: 'cloud' },
  huadao: { cut: 'qingshan', robe: '#4a5562', inner: '#eae6da', trim: '#9eb2c4', pattern: 'wave' },
  tianque: { cut: 'qingjia', robe: '#5c4b3a', inner: '#e2d8c8', trim: '#b88d48', over: 'armor', overColor: '#6a6660', cuff: '#3e3226', pattern: 'fret' },
  jujian: { cut: 'qingshan', robe: '#44586c', inner: '#eef0ec', trim: '#a8bac6', pattern: 'fret' },
  gujian: { cut: 'qingshan', robe: '#567890', inner: '#f2f4f0', trim: '#c8d6e0', pattern: 'cloud' },
  huayi: { cut: 'qingshan', robe: '#5c6888', inner: '#eeecf4', trim: '#b8aed0', pattern: 'cloud' },
  luoyun: { cut: 'daopao', robe: '#467a7a', inner: '#eef5f0', trim: '#b6cf9c', over: 'banbi', overColor: '#376262', pattern: 'cloud' },
  baiqiao: { cut: 'jinzhuang', robe: '#7a694e', inner: '#ede5d2', trim: '#b88e46', cuff: '#4a3a28', pattern: 'fret' },
  qianzhu: { cut: 'qingshan', robe: '#3a6a42', inner: '#ecf2e4', trim: '#8eb478', pattern: 'bamboo' },
  qixuan: { cut: 'jinzhuang', robe: '#4c5c4c', inner: '#e4e0d0', trim: '#2b362b', cuff: '#3a3026' },
  tianlan: { cut: 'rushan', robe: '#d8c890', inner: '#f8f2e2', trim: '#9a702e', over: 'vest', overColor: '#b0924a', pattern: 'fret' },
  guiling: { cut: 'mopao', robe: '#262830', inner: '#424852', trim: '#52aa7c', over: 'cape', overColor: '#1d2326', pattern: 'fret' },
  hehuan: { cut: 'guangxiu', robe: '#d898ae', inner: '#fff5f8', trim: '#8c2a4d', over: 'banbi', overColor: '#a63f66', pattern: 'flower', shawl: '#f2c8d8' },
  yuling: { cut: 'mopao', robe: '#382a46', inner: '#4a3a58', trim: '#b4483a', over: 'cape', overColor: '#2a1d32', pattern: 'fret' },
  qianhuan: { cut: 'mopao', robe: '#5a3a70', inner: '#e6ddf0', trim: '#a888d8', over: 'cape', overColor: '#3c244e', pattern: 'cloud' },
  tiansha: { cut: 'mopao', robe: '#281618', inner: '#3e2022', trim: '#a82a2a', over: 'cape', overColor: '#561416', pattern: 'fret' },
  yinluo: { cut: 'mopao', robe: '#222b26', inner: '#344038', trim: '#7f54a8', over: 'cape', overColor: '#1a201e', pattern: 'fret' },
  tianmo: { cut: 'mopao', robe: '#1e161a', inner: '#381e24', trim: '#982228', over: 'cape', overColor: '#5e1418', pattern: 'fret' },
  jiyin: { cut: 'mopao', robe: '#1d2734', inner: '#344252', trim: '#5694c2', over: 'cape', overColor: '#16202b', pattern: 'wave' },
  // 灵界 / 仙界及经典补充宗门
  tianxing: { cut: 'daopao', robe: '#365678', inner: '#eef4fa', trim: '#c8b468', over: 'banbi', overColor: '#28425e', pattern: 'cloud' },
  nixing: { cut: 'mopao', robe: '#2c2238', inner: '#423452', trim: '#9e58c8', over: 'cape', overColor: '#48245e', pattern: 'fret' },
  tianpeng: { cut: 'daopao', robe: '#4a5a70', inner: '#eef2f6', trim: '#c8aa64', over: 'banbi', overColor: '#3a4a60', pattern: 'cloud' },
  cangming: { cut: 'guangxiu', robe: '#d8e4ee', inner: '#ffffff', trim: '#4e7ca8', over: 'banbi', overColor: '#6c98c0', pattern: 'wave', shawl: '#deecf8' },
  tianling: { cut: 'daopao', robe: '#e8e4d4', inner: '#ffffff', trim: '#b89442', over: 'banbi', overColor: '#c8a656', pattern: 'cloud' },
  qinglian: { cut: 'guangxiu', robe: '#dfeee8', inner: '#ffffff', trim: '#4a907a', over: 'banbi', overColor: '#6eb29c', pattern: 'flower', shawl: '#d8f0e6' },
  beihan: { cut: 'guangxiu', robe: '#e6f0f8', inner: '#ffffff', trim: '#6ea2c8', over: 'cape', overColor: '#c6dced', pattern: 'wave' },
  xuanqing: { cut: 'daopao', robe: '#4c7066', inner: '#f4f2e8', trim: '#c8b272', over: 'banbi', overColor: '#3a5950', pattern: 'cloud' },
  jiuxiao: { cut: 'daopao', robe: '#f0ece0', inner: '#ffffff', trim: '#c89e48', over: 'banbi', overColor: '#d2ac5c', pattern: 'cloud' },
};

function cutDefaults(cut: UniformCut, sex: 'm' | 'f'): {
  collar: Collar; robeLen: Look['robeLen']; sleeve: Look['sleeve']; skirt: SkirtKind;
  over: OverKind; pattern: Pattern; sash: boolean; shawl: boolean;
} {
  switch (cut) {
    case 'jinzhuang': return { collar: 'cross', robeLen: 'mid', sleeve: 'cuffed', skirt: 'split', over: 'none', pattern: 'none', sash: false, shawl: false };
    case 'qingjia': return { collar: 'high', robeLen: 'mid', sleeve: 'cuffed', skirt: 'split', over: 'armor', pattern: 'fret', sash: false, shawl: false };
    case 'guangxiu': return { collar: 'cross', robeLen: 'long', sleeve: 'wide', skirt: sex === 'f' ? 'pleat' : 'robe', over: 'banbi', pattern: 'cloud', sash: true, shawl: sex === 'f' };
    case 'mopao': return { collar: 'high', robeLen: 'long', sleeve: 'wide', skirt: 'robe', over: 'cape', pattern: 'fret', sash: false, shawl: false };
    case 'rushan': return { collar: 'round', robeLen: 'long', sleeve: 'wide', skirt: 'robe', over: 'none', pattern: 'none', sash: false, shawl: false };
    case 'jiasha': return { collar: 'cross', robeLen: 'long', sleeve: 'wide', skirt: 'robe', over: 'kasaya', pattern: 'none', sash: false, shawl: false };
    case 'qingshan': return { collar: 'cross', robeLen: 'long', sleeve: 'wide', skirt: sex === 'f' ? 'pleat' : 'robe', over: 'none', pattern: 'cloud', sash: true, shawl: false };
    case 'daopao':
    default: return { collar: 'cross', robeLen: 'long', sleeve: 'wide', skirt: sex === 'f' ? 'pleat' : 'robe', over: 'banbi', pattern: 'cloud', sash: true, shawl: false };
  }
}

export function sectUniformSpec(sid: string, fallbackRobe?: string, custom?: CustomSectUniform): SectUniformSpec {
  if (sid === MY_SECT_ID && custom) {
    const robe = custom.robe || '#4876a8';
    const trim = custom.trim || shade(robe, -0.35);
    return {
      id: MY_SECT_ID,
      cut: custom.cut || 'daopao',
      robe,
      inner: '#f4f1e8',
      trim,
      belt: shade(trim, -0.3),
      pants: shade(robe, -0.35),
      boots: '#242220',
      over: custom.over,
      overColor: shade(robe, -0.14),
      pattern: custom.pattern ?? 'cloud',
      cuff: shade(trim, -0.25),
    };
  }
  const base = SPEC_MAP[sid];
  if (base) {
    const robe = base.robe ?? fallbackRobe ?? '#5a6e7e';
    const trim = base.trim ?? shade(robe, -0.32);
    return {
      id: sid,
      cut: base.cut ?? 'daopao',
      robe,
      inner: base.inner ?? '#f0ece0',
      trim,
      belt: base.belt ?? shade(trim, -0.35),
      pants: base.pants ?? shade(robe, -0.35),
      boots: base.boots ?? '#262422',
      over: base.over,
      overColor: base.overColor ?? shade(robe, -0.15),
      pattern: base.pattern ?? 'cloud',
      cuff: base.cuff ?? shade(trim, -0.2),
      shawl: base.shawl,
    };
  }
  // XSECTS 或动态宗门：依 `like` 继承或依 `robe` 自动派生成套制式
  const x = X_BY_ID[sid];
  if (x?.like && SPEC_MAP[x.like]) {
    const parent = sectUniformSpec(x.like, fallbackRobe);
    const robe = fallbackRobe ?? x.robe ?? parent.robe;
    return {
      ...parent,
      id: sid,
      robe,
      overColor: parent.over ? shade(robe, -0.14) : undefined,
      pants: shade(robe, -0.34),
    };
  }
  const robe = fallbackRobe ?? x?.robe ?? (sid === MY_SECT_ID ? '#4876a8' : '#5f7382');
  const demon = x?.dao === 'mo';
  const cut: UniformCut = x?.dao === 'mo' ? 'mopao' : (sid === 'fo' || /禅|佛|寺|雷音/.test(x?.name ?? '')) ? 'jiasha' : /剑|刀/.test(x?.name ?? '') ? 'qingshan' : 'daopao';
  const trim = demon ? '#9a3034' : shade(robe, 0.25);
  return {
    id: sid,
    cut,
    robe,
    inner: demon ? '#382a30' : '#f2eee2',
    trim,
    belt: shade(trim, -0.32),
    pants: shade(robe, -0.36),
    boots: '#242220',
    over: cut === 'mopao' ? 'cape' : cut === 'daopao' ? 'banbi' : undefined,
    overColor: shade(robe, -0.16),
    pattern: demon ? 'fret' : 'cloud',
    cuff: shade(trim, -0.22),
  };
}

/** 将宗门制式服制套用到 Look（rankTier: 0=外门战兵, 1=内门/核心骨干, 2=长老/掌门） */
export function applySectUniform(
  look: Look,
  sid: string,
  rankTier: 0 | 1 | 2 = 1,
  fallbackRobe?: string,
  custom?: CustomSectUniform,
): Look {
  const sp = sectUniformSpec(sid, fallbackRobe, custom);
  const d = cutDefaults(sp.cut, look.sex);
  const sleeve = rankTier === 0 && d.sleeve === 'wide' ? 'narrow' : rankTier === 2 ? 'wide' : d.sleeve;
  const over: OverKind = rankTier === 0 && (sp.over === 'cape' || d.over === 'cape')
    ? 'none'
    : (sp.over ?? d.over);
  const pattern: Pattern = rankTier === 0 ? 'none' : (sp.pattern ?? d.pattern);
  const trim = rankTier === 2 ? '#d4af5a' : sp.trim;
  return {
    ...look,
    robe: sp.robe,
    inner: sp.inner,
    trim,
    belt: sp.belt,
    pants: sp.pants,
    boots: sp.boots,
    collar: d.collar,
    robeLen: rankTier === 0 && sp.cut === 'jinzhuang' ? 'short' : d.robeLen,
    sleeve,
    skirt: d.skirt,
    skirtColor: sp.robe,
    waistline: 'waist',
    over,
    overColor: sp.overColor,
    pattern,
    cuff: sp.cuff,
    sash: rankTier >= 1 && d.sash ? sp.belt : undefined,
    shawl: rankTier >= 1 && (sp.shawl || d.shawl) ? (sp.shawl ?? '#e8e2f0') : undefined,
    idle: look.sex === 'f' ? 'clasp' : 'behind',
    waist: rankTier >= 1 ? 'jade' : 'pouch',
    hand: 'none',
    back: sp.cut === 'qingshan' && rankTier >= 1 ? 'sword' : 'none',
  };
}
