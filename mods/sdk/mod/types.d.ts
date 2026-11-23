import type { ArtSkill, StatusSpec } from '../data/arts';
import type { ItemDef } from '../data/items';
import type { EnemyDef } from '../data/enemies';
/** 丹方 / 器方（kind: 'forge' 是炼器） */
export interface Recipe {
    id: string;
    name: string;
    out: string;
    outN: number;
    /** minAge：灵草最低药龄（年） */
    inputs: {
        id: string;
        n: number;
        minAge?: number;
    }[];
    /** 基础成功率 0–1 */
    base: number;
    days: number;
    reqRealm: number;
    desc: string;
    kind?: 'pill' | 'forge';
}
/** 敌人招式类型：salvo 连射 · ring 环形弹幕 · circle 落点圆圈 · rain 落雨 · cone 扇形 · charge 冲撞 · leap 扑击 · nova 自爆圈 · beam 光柱 · summon 召唤 · guard 护体 · blink 闪身 · heal 回血 · roar 震吼 */
export type FoeSkillKind = 'salvo' | 'ring' | 'circle' | 'rain' | 'cone' | 'charge' | 'leap' | 'nova' | 'beam' | 'summon' | 'guard' | 'blink' | 'heal' | 'roar'
  | 'brawl';   // B 版 E2 起：欺身连击（扑上来贴身连打，罡气打空了轰飞；range = 多远以内会扑，pow = 伤害倍率）
export type FoeElement = 'phys' | 'fire' | 'ice' | 'water' | 'thunder' | 'poison' | 'blood' | 'ghost' | 'wind' | 'earth' | 'sword' | 'gold' | 'metal';
/** 敌人招式。地上先出预警，tele 秒后生效（至少 0.3 秒）；pow 是攻击倍率（最高 6） */
export interface ModFoeSkill {
    id: string;
    name: string;
    k: FoeSkillKind;
    el: FoeElement;
    cd: number;
    tele: number;
    pow: number;
    range: number;
    /** 最近施放距离 */ min?: number;
    /** 半径（cone 是长度） / 弹数 / 长度 / 宽度 / 扇面半角（弧度） / 持续 / 波数 */
    r?: number;
    n?: number;
    len?: number;
    w?: number;
    spread?: number;
    dur?: number;
    waves?: number;
    status?: StatusSpec;
    /** 落地后留下持续伤害区域的秒数（毒池、火海） */ pool?: number;
    /** 大招：血量低于 hpBelow（0–1）才会放；once 只放一次 */ ult?: boolean;
    hpBelow?: number;
    once?: boolean;
    /** summon 召唤的敌人 id */ minion?: string;
}
/** v2：可新增敌人的额外字段 */
export type ModEnemyDef = EnemyDef & {
    skills?: ModFoeSkill[];
    skillsReplace?: boolean;
};
export declare const MOD_FORMAT = "taixu-mod@1";
/** 游戏提供的模组接口版本（模组清单里 api 字段写自己需要的最低版本） */
export declare const MOD_API = 5;
export interface ModManifest {
    /** 小写字母与数字，3–24 位，全网唯一（云端平台按它认主人） */
    id: string;
    name: string;
    /** x.y.z */
    version: string;
    author: string;
    desc: string;
    /** 需要的模组接口版本（缺省 1） */
    api?: number;
    /** 图标：files 里的文件名 */
    icon?: string;
    /** 依赖的其他模组 id（先加载它们） */
    deps?: string[];
    tags?: string[];
    /** 高级权限：拿到游戏内部的全部对象（api.unsafe）。玩家启用时会看到醒目警告；游戏更新后这类模组最容易坏 */
    unsafe?: boolean;
}
export interface ModBundle {
    format: typeof MOD_FORMAT;
    manifest: ModManifest;
    /** 入口文件名（files 里的键） */
    main: string;
    /** 文件：代码为纯文本，图片 / 声音为 data: 网址 */
    files: Record<string, string>;
}
/** 游戏里能看到、能摆弄的东西（只读快照 + 少量动作；不直接暴露内部对象） */
export interface ModGame {
    /** 游戏日（从开局算起） */
    readonly day: number;
    /** 主角（只读快照；改用下面的 set* / add* 动作） */
    readonly hero: ModHero;
    bagCount(id: string): number;
    giveItem(id: string, n?: number): void;
    takeItem(id: string, n?: number): boolean;
    /** 学会一门法术（含本模组的） */
    learnArt(id: string): boolean;
    knowsArt(id: string): boolean;
    /** 在主角身边放一只敌人（dx,dy 为相对位置；realm 缺省按其等阶） */
    spawnEnemy(id: string, dx?: number, dy?: number, realm?: number): void;
    toast(text: string, tone?: 'info' | 'good' | 'warn'): void;
    news(text: string): void;
    /** 弹一段底部对话。选项可以接下一段（next，或 act 返回一段对话），就成了多层对话树 */
    dialog(d: ModDialog): void;
    /** v3：开一个商店（物品要存在；price 缺省按物品价格） */
    openShop(s: {
        title: string;
        desc?: string;
        items: {
            id: string;
            price?: number;
            n?: number;
        }[];
        sellRate?: number;
        noSell?: boolean;
    }): void;
    /** 当前时辰：0–1（0 子夜、0.5 正午）；night 0–1 越大越黑 */
    readonly time: {
        readonly phase: number;
        readonly night: number;
    };
    /** 主角附近的地点（走到城镇 / 地点跟前时有值） */
    readonly nearLocation: ModLocInfo | null;
    /** 查地点（当前地图与其他地图都能查到；x/y 为世界像素，跨图地点也给出其所在地图） */
    location(id: string): ModLocInfo | null;
    /** 查人（原设人物、知交、模组 NPC、路人都行）；不存在返回 null */
    npc(id: string): ModNpcInfo | null;
    /** 改好感（每次 -30 ~ +30，总范围 -100 ~ 100）；返回新好感，人不存在返回 null */
    addFavor(npcId: string, n: number): number | null;
    /** 与某人切磋（不在身边会先现身到主角旁）；结果见 spar 事件 */
    spar(npcId: string): boolean;
    /** 让某人与主角同行 / 分开 */
    follow(npcId: string, on: boolean): boolean;
    /** 加修为（单次至多当前境界所需的 3 倍）；返回实际加的量 */
    addExp(n: number): number;
    /** 回复气血 / 法力（0–1 比例） */
    heal(hp: number, mp?: number): void;
    /** 传送到本图某点（世界像素）；水里 / 山里等走不到的地方返回 false */
    teleport(x: number, y: number): boolean;
    /** v4：歇息若干日（1–30）：时光流逝（众生照常过日子），气血法力回满 */
    rest(days: number): void;
    /** v4：打听消息——弹出游戏的「酒楼」对话（近处秘境的线索、坊间传闻、说书人的消息）；locId 缺省取主角附近的地点 */
    tavern(locId?: string): void;
    /** 在地图和屏幕边缘给出指引（再调一次换目标；name 为空则清除） */
    guide(x: number, y: number, name: string): void;
    /** 本模组的任务（显示在左侧任务栏、地图上标「任」） */
    quest: {
        set(id: string, q: ModQuest): void;
        remove(id: string): void;
        get(id: string): ModQuest | null;
    };
    /** 在某点放一个法术特效（fx 用法术特效名：flame lightning frost sword……） */
    fx(kind: 'ring' | 'strike' | 'pillar' | 'flash' | 'aura' | 'beam', x: number, y: number, o?: {
        r?: number;
        dur?: number;
        color?: string;
        fx?: string;
        x2?: number;
        y2?: number;
    }): void;
    /** 飘字 */
    floatText(x: number, y: number, text: string, color?: string, big?: boolean): void;
    /** 震屏（0–1） */
    shake(n: number): void;
    /** 全屏闪光（color 'r,g,b'，a 0–1） */
    flash(color: string, a?: number): void;
    /** 慢动作（秒，至多 0.6） */
    slowmo(sec: number): void;
    /** 播放音效（api.file 得到的 mp3 / ogg / wav；x,y 给了就有远近和左右声道） */
    sound(file: string, o?: {
        vol?: number;
        rate?: number;
        x?: number;
        y?: number;
    }): void;
    /** 换背景音乐（循环播放；传 null 恢复游戏原来的配乐） */
    music(file: string | null, vol?: number): void;
    /** 打开本模组用 api.ui.panel 注册的面板 */
    openPanel(id: string): void;
    /** 设境界（0 凡人 … 5 化神；小层 0–3），修为清零 */
    setRealm(realm: number, stage?: number): void;
    /** 设当前修为（不超过本层所需） */
    setExp(n: number): void;
    /** 加寿元（年，可为负） */
    addLife(years: number): void;
    /** 换灵根 / 主修功法（id 见数据表 roots / gongfa） */
    setRoot(id: string): void;
    setGongfa(id: string): void;
    /** 得到 / 失去天赋（id 见数据表 talents） */
    addTalent(id: string): boolean;
    removeTalent(id: string): boolean;
    /** 忘掉一门法术 */
    forgetArt(id: string): boolean;
    /** 声望（-100 ~ 100） */
    setRep(n: number): void;
    /** 主角附近的敌人（缺省 1200 像素内）；ref 是这只敌人的编号 */
    enemies(radius?: number): ModEnemyInfo[];
    /** 打一只敌人（走正常的伤害结算：防御、境界压制、死亡掉落都照常）；status 附带原版异常状态 */
    damage(ref: number, amount: number, o?: {
        status?: {
            k: string;
            dur: number;
            ch: number;
        };
    }): boolean;
    /** 打主角（amount 是原始伤害，走防御与境界结算） */
    hurtHero(amount: number, realm?: number): void;
    /** 挂模组定义的状态（api.content.status）；target 是敌人 ref 或 'hero' */
    addStatus(target: number | 'hero', id: string, dur: number): boolean;
    hasStatus(target: number | 'hero', id: string): boolean;
    /** 天气（clear rain storm snow fog sand；null 恢复自然变化） */
    setWeather(kind: string | null): void;
    /** 去另一张图（tiannan luanxing dajin），落在 locId 处（缺省该图第一座城池）：会存档并重新载入 */
    travel(map: string, locId?: string): boolean;
    /** 主线：当前章节与目标（南荒以外为 null） */
    readonly story: {
        chapter: string;
        title: string;
        text: string;
    } | null;
}
/** v5：主角快照 */
export interface ModHero {
    readonly name: string;
    readonly realm: number;
    readonly stage: number;
    readonly hp: number;
    readonly mp: number;
    readonly x: number;
    readonly y: number;
    readonly map: string;
    /** 修为 / 本层所需 */ readonly exp: number;
    readonly need: number;
    /** 年龄 / 寿元上限（年） */ readonly age: number;
    readonly life: number;
    readonly root: string;
    readonly gongfa: string;
    readonly talents: string[];
    readonly rep: number;
    readonly lingshi: number;
    readonly kills: number;
    readonly arts: {
        id: string;
        xp: number;
    }[];
    readonly bag: {
        id: string;
        n: number;
        age?: number;
    }[];
}
export interface ModEnemyInfo {
    ref: number;
    id: string;
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    realm: number;
    npcId?: string;
}
/** v5：前置钩子——事情发生之前交给模组：改 ctx 里的值，或写 ctx.cancel = true 取消 */
export interface ModHooks {
    /** 伤害（to: enemy 敌人挨打 / player 主角挨打）；amount 可改 */
    damage: {
        to: 'enemy' | 'player';
        enemyId: string | null;
        npcId: string | null;
        ref: number | null;
        amount: number;
        skill: string | null;
    };
    /** 得修为；amount 可改 */
    exp: {
        amount: number;
        source: 'insight' | 'med' | 'pill';
    };
    /** 冲关（小瓶颈 / 大境界）；chance 成功率可改；cancel 时 reason 是给玩家看的话 */
    breakthrough: {
        realm: number;
        stage: number;
        major: boolean;
        chance: number;
        pills: number;
        reason?: string;
    };
    /** 用物品（服丹、用模组物品）之前；cancel 不让用 */
    useItem: {
        id: string;
    };
    /** 开商店之前：货架可改（增删、改价、改数量） */
    shop: {
        title: string;
        loc: string | null;
        stock: {
            id: string;
            price: number;
            n: number;
        }[];
    };
    /** 野外刷怪：可换成别的敌人、改境界、不让刷 */
    spawn: {
        enemyId: string;
        realm: number;
        stage: number;
        x: number;
        y: number;
    };
    /** 敌人死后掉落：drops 可改 */
    loot: {
        enemyId: string;
        npcId: string | null;
        drops: {
            id: string;
            n: number;
        }[];
    };
    /** 原版对话弹出前：text 可改；add 加选项、hide 藏掉某个选项 */
    dialog: {
        speaker: string;
        title?: string;
        text: string;
        options: {
            label: string;
        }[];
        add(o: ModDialogOption): void;
        hide(label: string): void;
    };
    /** 配乐场景（day night town sect sea demon cold desert combat boss pursuit cultivate）：写 file 换成自己的曲子 */
    music: {
        state: string;
        file?: string | null;
        vol?: number;
    };
    /** 原版音效：写 file 换掉，mute 静音 */
    sfx: {
        name: string;
        file?: string | null;
        mute?: boolean;
    };
    /** 进入地点之前 */
    enter: {
        loc: ModLocInfo;
    };
    /** 与人交谈之前 */
    talk: {
        npc: ModNpcInfo;
    };
}
/** v5：模组定义的状态（中毒、护体、印记……） */
export interface ModStatusDef {
    id: string;
    name: string;
    /** 飘字颜色 */ color?: string;
    /** 每帧（target：敌人 ref 或 'hero'；left 剩余秒数） */
    tick?: (g: ModGame, target: number | 'hero', dt: number, left: number) => void;
    onApply?: (g: ModGame, target: number | 'hero') => void;
    onExpire?: (g: ModGame, target: number | 'hero') => void;
}
/** v5：模组设置项（显示在模组面板里，玩家可改） */
export interface ModSetting {
    key: string;
    label: string;
    type: 'bool' | 'number' | 'select' | 'text';
    default: boolean | number | string;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
    hint?: string;
}
export interface ModLocInfo {
    id: string;
    name: string;
    type: string;
    map: string;
    x: number;
    y: number;
    danger: number;
}
export interface ModNpcInfo {
    id: string;
    name: string;
    sex: 'm' | 'f';
    realm: number;
    stage: number;
    favor: number;
    alive: boolean;
    faction: string;
    home: string;
    title?: string;
    met: boolean;
    /** 与主角的关系：companion 同行 · sworn 结拜 · master 师父 · disciple 弟子 …… */
    bond?: string;
    /** 在当前地图上的位置（世界像素；不在本图为 null） */
    x: number | null;
    y: number | null;
}
export interface ModQuest {
    title: string;
    text?: string;
    have?: number;
    need?: number;
    /** 目标位置（世界像素，本图） */
    x?: number;
    y?: number;
    done?: boolean;
}
/** v3：新地点 */
export interface ModLocation {
    id: string;
    name: string;
    /** city 城池 · town 城镇 · isle 海岛（这三种有坊市客栈等）· danger 险地 · secret 秘地 · inn 路边小站（v4：一间屋几张茶桌；这三种进去后是对话，内容由 api.content.townAction 提供） */
    type: 'city' | 'town' | 'isle' | 'danger' | 'secret' | 'inn';
    /** v4：类型显示名（地点卡上，如「茶寮」，≤ 4 字）、地图印章字（一个字） */
    label?: string;
    seal?: string;
    /** v4：inn 的样式：tea 茶寮（两张茶桌）· post 驿站（多一座马棚） */
    look?: 'tea' | 'post';
    map: 'tiannan' | 'luanxing' | 'dajin';
    /** 地图坐标（不是像素）：南荒 0–1000 × 0–700，沧溟海 0–800 × 0–840，中州 0–1200 × 0–880 */
    x: number;
    y: number;
    desc: string;
    /** 危险度 0–5（影响附近妖兽强弱） */
    danger?: number;
    /** 大小（1 为常规） */
    scale?: number;
    /** 大地方：地图上一开始就标出来 */
    major?: boolean;
}
/** v3：城镇 / 地点里的一项事务（进城后的按钮；险地秘地里的选项） */
export interface ModTownAction {
    id: string;
    /** 印章字（一个字） */
    seal: string;
    name: string;
    desc: string;
    /** 在哪些地点出现：地点 id 列表、地点类型列表，或 'all'（缺省 all，只限城池城镇海岛） */
    where?: string[] | 'all';
    act: (g: ModGame, loc: ModLocInfo) => ModDialog | void;
}
/** v3：与人交谈时多出的选项 */
export interface ModTalkOption {
    id: string;
    label: string;
    hint?: string;
    tone?: 'gold' | 'jade' | 'bad' | 'love';
    /** 对谁出现：NPC id 列表；缺省对所有人 */
    who?: string[];
    /** 进一步筛选（返回 false 不显示） */
    when?: (npc: ModNpcInfo, g: ModGame) => boolean;
    act: (g: ModGame, npc: ModNpcInfo) => ModDialog | void;
}
/** v3：有名有姓的 NPC（住在某地，按时间修炼、能交谈切磋结交） */
export interface ModNpcDef {
    id: string;
    name: string;
    sex: 'm' | 'f';
    /** 住处：地点 id（原版或本模组的） */
    home: string;
    realm: number;
    stage: number;
    title?: string;
    /** 门派 / 身份：sect 宗门 · rogue 散修 · demon 魔道 · mortal 凡人 · merchant 行商 */
    faction?: 'sect' | 'rogue' | 'demon' | 'mortal' | 'merchant';
    /** 性情：righteous 正直 · greedy 贪婪 · cautious 谨慎 · arrogant 傲慢 · kind 温和 · ruthless 狠辣 · aloof 孤高 */
    pers?: 'righteous' | 'greedy' | 'cautious' | 'arrogant' | 'kind' | 'ruthless' | 'aloof';
    /** 身形：cultivator 修士 · scholar 书生 · farmer 农夫 · merchant 商人 · female 女子 · elder 老者 · guard 护卫 · monk 僧人 */
    role?: 'cultivator' | 'scholar' | 'farmer' | 'merchant' | 'female' | 'elder' | 'guard' | 'monk';
    /** 外貌细节（覆盖随机生成的）：robe 袍色 hair 发色 hairStyle beard …… 字段见 SDK 的 Look */
    look?: Record<string, unknown>;
    age?: number;
    favor?: number;
    /** 打招呼的话（随机挑一句） */
    greet?: string[];
    /** 交谈时先弹这段（返回 null 走寻常交谈）；寻常交谈的选项会接在后面「其他事」里 */
    talk?: (g: ModGame, npc: ModNpcInfo) => ModDialog | null | void;
    /** 能否被收为弟子（境界低于主角、好感够时出现「收其为徒」） */
    apprentice?: boolean;
    /** 不在原地待着，会四处走动 */
    wander?: boolean;
}
/** v3：图像帧动画（给妖兽、NPC、主角换成图片） */
export interface ModSprite {
    /** 各动作的帧（api.file 用的文件名）；idle 必填 */
    frames: {
        idle: string[];
        walk?: string[];
        attack?: string[];
        hit?: string[];
    };
    /** 每秒帧数（缺省 8） */
    fps?: number;
    /** 画面在世界中的高度（像素；主角约 108） */
    height: number;
    /** 原画朝向：1 头朝右，-1 头朝左（缺省 1） */
    facing?: 1 | -1;
    /** 游戏另加的动态：walk 走兽起伏 · stand 直立 · fly 振翅 · float 飘浮 · slither 蛇行 · swim 水族（缺省 stand） */
    motion?: 'walk' | 'stand' | 'fly' | 'float' | 'slither' | 'swim';
    glow?: string;
}
/** v3：模组面板的内容（声明式，游戏负责画） */
export type ModUiNode = {
    type: 'text';
    text: string;
    color?: string;
    size?: 'small' | 'normal' | 'big';
    bold?: boolean;
} | {
    type: 'button';
    label: string;
    onClick: () => void;
    tone?: 'gold' | 'jade' | 'bad';
    disabled?: boolean;
} | {
    type: 'image';
    src: string;
    w?: number;
    h?: number;
} | {
    type: 'bar';
    value: number;
    max: number;
    label?: string;
    color?: string;
} | {
    type: 'item';
    id: string;
    n?: number;
} | {
    type: 'row' | 'col';
    children: ModUiNode[];
} | {
    type: 'divider';
};
/** v3：世界层绘制（坐标是世界像素） */
export interface ModDraw {
    image(file: string, x: number, y: number, w: number, h: number, o?: {
        alpha?: number;
        rot?: number;
        flip?: boolean;
    }): void;
    circle(x: number, y: number, r: number, color: string, o?: {
        fill?: boolean;
        width?: number;
        alpha?: number;
    }): void;
    rect(x: number, y: number, w: number, h: number, color: string, o?: {
        fill?: boolean;
        width?: number;
        alpha?: number;
    }): void;
    line(x1: number, y1: number, x2: number, y2: number, color: string, width?: number, alpha?: number): void;
    text(text: string, x: number, y: number, o?: {
        color?: string;
        size?: number;
        align?: 'left' | 'center' | 'right';
        alpha?: number;
    }): void;
}
/** 一段对话 */
export interface ModDialog {
    speaker: string;
    /** 称谓、境界，显示在名字旁 */
    title?: string;
    text: string;
    /** 立绘：api.file('xx.png') 得到的图片 */
    portrait?: string;
    mood?: 'love' | 'danger' | 'mystic' | 'normal';
    /** 最多 8 个 */
    options: ModDialogOption[];
}
export interface ModDialogOption {
    label: string;
    /** 选项下方的小字说明 */
    hint?: string;
    tone?: 'gold' | 'jade' | 'bad' | 'love';
    disabled?: boolean;
    /** 选中后接着说的下一段 */
    next?: ModDialog;
    /** 选中时执行；返回一段对话就接着说，否则关闭（有 next 时以 act 的返回为先） */
    act?: () => ModDialog | boolean | void;
}
export interface ModEvents {
    start: (g: ModGame) => void;
    tick: (g: ModGame, dt: number) => void;
    day: (g: ModGame, days: number) => void;
    kill: (g: ModGame, e: {
        id: string;
        name: string;
        realm: number;
        x: number;
        y: number;
    }) => void;
    /** v3：境界变化（大境界或小层） */
    realm: (g: ModGame, e: {
        realm: number;
        stage: number;
        major: boolean;
    }) => void;
    /** v3：进入城镇 / 地点 */
    enter: (g: ModGame, loc: ModLocInfo) => void;
    /** v3：开口与人交谈 */
    talk: (g: ModGame, npc: ModNpcInfo) => void;
    /** v3：切磋结束 */
    spar: (g: ModGame, e: {
        npc: ModNpcInfo | null;
        won: boolean;
    }) => void;
    /** v3：服丹、研读玉简等用掉物品 */
    use: (g: ModGame, e: {
        id: string;
    }) => void;
    /** v3：炼丹 / 炼器出炉 */
    craft: (g: ModGame, e: {
        recipe: string;
        ok: boolean;
    }) => void;
    /** v3：主角被打倒 */
    down: (g: ModGame) => void;
    /** v3：每帧画在世界里（只做绘制，别改数据） */
    draw: (g: ModGame, d: ModDraw) => void;
}
export interface ModAPI {
    readonly id: string;
    readonly version: string;
    readonly gameVersion: string;
    readonly apiVersion: number;
    log(...a: unknown[]): void;
    content: {
        arts(defs: ArtSkill[]): void;
        items(defs: ItemDef[]): void;
        /** 新敌人；可带 skills（专属招式），skillsReplace=true 时只用这些招式 */
        enemies(defs: ModEnemyDef[]): void;
        /** v2：新丹方 / 器方（kind: 'forge' 为炼器）。用到的物品要先注册 */
        recipes(defs: Recipe[]): void;
        /** v2：给任何敌人（含原版）定招式；replace=true 替换游戏自动配的招式，否则追加 */
        enemySkills(enemyId: string, skills: ModFoeSkill[], opt?: {
            replace?: boolean;
        }): void;
        /** v2：给任何敌人（含原版）追加掉落 */
        addDrops(enemyId: string, drops: EnemyDef['drops']): void;
        /** v2：往某宗门藏经阁加功法卷轴（宗门 id 如 huangfeng、yanyue） */
        sectLibrary(sectId: string, itemIds: string[]): void;
        /** v2：修改原版（或别的模组的）内容：只改给出的字段，id 不能改。两个模组改同一字段时后加载的生效，并在模组面板里提示冲突 */
        /** v3：新地点（城镇、海岛、险地、秘地） */
        locations(defs: ModLocation[]): void;
        /** v3：城镇 / 地点里的事务按钮 */
        townAction(def: ModTownAction): void;
        /** v3：与人交谈时多出的选项（对原版人物也有效） */
        talkOption(def: ModTalkOption): void;
        /** v3：有名有姓的 NPC */
        npcs(defs: ModNpcDef[]): void;
        /** v5：物品的用法（原版物品也行）：在储物袋里点「使用」时调用；ctx.consume = false 则不消耗 */
        itemUse(itemId: string, fn: (g: ModGame, ctx: {
            id: string;
            consume: boolean;
        }) => string | void): void;
        /** v5：法术施放 / 命中时（原版法术也行）。cast: 'custom' 的法术只扣法力记冷却，效果全靠 onCast */
        artCast(artId: string, fn: (g: ModGame, at: {
            x: number;
            y: number;
            tx: number;
            ty: number;
            target: number | null;
        }) => void): void;
        artHit(artId: string, fn: (g: ModGame, hit: {
            ref: number;
            id: string;
            amount: number;
        }) => void): void;
        /** v5：新状态 */
        status(def: ModStatusDef): void;
        patch: {
            art(id: string, fields: Partial<ArtSkill>): void;
            item(id: string, fields: Partial<ItemDef>): void;
            enemy(id: string, fields: Partial<EnemyDef>): void;
            recipe(id: string, fields: Partial<Recipe>): void;
        };
    };
    /** 附带文件（图片得到 data: 网址；代码 / 文本得到原文） */
    file(name: string): string | undefined;
    /** 给法术 / 物品配图标（files 里的图片名） */
    icon(contentId: string, fileName: string): void;
    on<K extends keyof ModEvents>(ev: K, cb: ModEvents[K]): void;
    /** v5：游戏的全部数据表——一套方法读、改、加、删（表名见 tables()；境界、灵根、天赋、功法、宗门、知交、阵法、秘境、灵宠、节奏……） */
    data: {
        tables(): {
            name: string;
            desc: string;
            count: number;
            add: boolean;
            remove: boolean | 'list';
        }[];
        /** 整张表的拷贝；给 key 只取一条 */
        get(table: string, key?: string | number): any;
        /** 改一条的字段（deep: true 时对象字段逐层合并，否则整字段替换）；id 不能改 */
        patch(table: string, key: string | number, fields: Record<string, unknown>, opt?: {
            deep?: boolean;
        }): void;
        /** 新增一条（主键须带「模组 id_」前缀；按下标的表追加在末尾） */
        add(table: string, entry: Record<string, unknown> | string, key?: string): void;
        /** 删除一条（法术、物品、敌人只是不再出现在刷怪、坊市、掉落里，按 id 仍查得到，存档不会坏） */
        remove(table: string, key: string | number): void;
    };
    /** v5：前置钩子——见 ModHooks */
    hook<K extends keyof ModHooks>(name: K, fn: (g: ModGame, ctx: ModHooks[K] & {
        cancel?: boolean;
    }) => void): void;
    /** v5：本模组的设置（玩家在模组面板里改的值） */
    settings: {
        get<T = unknown>(key: string): T;
        set(key: string, v: unknown): void;
    };
    /** v4：读世界（setup 里也能用）：所有地点（三张图），只读 */
    world: {
        locations(): {
            id: string;
            name: string;
            type: string;
            map: string;
            x: number;
            y: number;
            major: boolean;
            minor: boolean;
            danger: number;
        }[];
    };
    /** v3：界面 */
    ui: {
        /** 右下角加一个圆按钮（glyph 一个字，label 两字） */
        button(def: {
            id: string;
            glyph: string;
            label: string;
            onClick: (g: ModGame) => void;
            badge?: (g: ModGame) => number;
        }): void;
        /** 注册一个面板：render 每次刷新时调用，返回要显示的内容 */
        panel(id: string, def: {
            title: string;
            sub?: string;
            render: (g: ModGame) => ModUiNode[];
        }): void;
        /** 快捷键（单个字母或数字；被游戏占用的键会报错） */
        hotkey(key: string, cb: (g: ModGame) => void): void;
        /** v5：屏幕上常驻的小块（pos：top-left top-right bottom-left top center） */
        hud(id: string, def: {
            pos?: 'top-left' | 'top-right' | 'bottom-left' | 'top' | 'center';
            render: (g: ModGame) => ModUiNode[];
        }): void;
        /** v5：在原版面板里加一段（char 角色 · bag 储物袋 · alchemy 丹器 · seclude 闭关 · town 城镇） */
        extend(panel: 'char' | 'bag' | 'alchemy' | 'seclude' | 'town', def: {
            title: string;
            render: (g: ModGame) => ModUiNode[];
        }): void;
        /** v5：用本模组的面板替换原版面板（同上几个，外加 skills map friends zhenfa wardrobe） */
        replace(panel: string, modPanelId: string): void;
        /** v5：设置项（显示在模组面板里） */
        settings(defs: ModSetting[]): void;
    };
    /** v3：画面 */
    gfx: {
        /** 给敌人（'e:敌人id'）、NPC（'n:NPC id'）或主角（'player'）换成图片帧动画；原版的也行 */
        sprite(target: string, def: ModSprite): void;
    };
    /** 本模组的存档数据（随存档走，读档后可用） */
    store: {
        get<T = unknown>(k: string): T | undefined;
        set(k: string, v: unknown): void;
    };
    /** 高级权限（manifest.unsafe = true 且玩家确认过才有）：游戏内部对象，没有任何保护，也不保证跨版本兼容 */
    unsafe?: ModUnsafe;
}
/** 高级权限：直接拿游戏内部。字段的含义以游戏源码为准，随版本变化 */
export interface ModUnsafe {
    /** 当前的 Game 对象（进游戏前是 null） */
    game(): any;
    /** 内容表：ARTS ART_LIST ITEMS ITEM_LIST ENEMIES ENEMY_LIST RECIPES SECT_LIB LOCATIONS 等（同一份对象，改了立即生效） */
    data: Record<string, any>;
    /** 每帧在世界层绘制之后调用（ctx 已是世界坐标）——想画什么画什么 */
    onDraw(cb: (ctx: CanvasRenderingContext2D, g: any) => void): void;
}
export type { ArtSkill, ItemDef, EnemyDef };
