// 收官 H1（甲）：操作说明——修仙指南「操作」页、设置「操作说明」共用。键位一律从 core/keymap 取（keyLabel(bindOf(id))），
// 改了键这里跟着变，不再写死（原来写死的「H 友人录」「I 衣橱」都过时了：H 是友人录，衣橱是逗号键，遁空是句号键）。
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';

type Row = [ids: string[], text: string];
const K = (id: string) => keyLabel(bindOf(id));
// 第五轮：做成函数，渲染时现取（「架势中」那行原来写死 Shift、空格，改了键就对不上）
const groups = (): { t: string; rows: Row[] }[] => [
  { t: '走动', rows: [[['up', 'left', 'down', 'right'], '移动（点地面也能前往）'], [['run'], '走 / 跑（御剑时遁光加速）'], [['fly'], '御剑 / 落地'], [['ascend', 'descend'], '飞行时升 / 降'], [['dunkong'], '遁空（祭着遁空梭）']] },
  { t: '海上', rows: [[['boat'], '祭出 / 收起灵舟（船上方向键驾船，御剑键收舟起飞）'], [['ascend', 'descend'], '水里按住：上浮 / 下潜（下潜进万丈海渊）']] },   // 收官 B4：灵舟、下潜上浮
  { t: '斗法', rows: [[['slot1', 'slot5'], '技能栏 1–5'], [['slot6', 'slot7'], '技能栏 6 / 7（鼠标左 / 右键）'], [['slot8', 'slot9'], '技能栏 8 / 9'], [['dodge'], '闪避（无敌帧）'], [['lock'], '锁定 / 换目标（敌对的先、近的先；鼠标指着谁先锁谁）'], [['brawl'], '近战架势（鼠标中键同效）'], [['sense'], '神识外放'], [['conceal'], '敛息']] },
  { t: '架势中', rows: [[[], `左键轻击连段 · 右键崩山（轻点出手，对手朝鼠标所指之处飞；按住定向：时间放慢、箭头和落点圈跟着鼠标，松开出手）· 出手时按住 ${ascendLabel()} 上挑、${K('descend')} 下砸 · ${K('run')} 欺身 · ${K('dodge')} 缩地追击（上挑起来的人是瞬移到他头顶往下砸；被打飞时是脱困；御剑时没人可追就是上升）`]] },
  { t: '交互', rows: [[['interact'], '交谈 / 奇遇 / 机缘'], [['gather'], '采集'], [['town'], '进城 / 入宗门'], [['sit'], '打坐'], [['lover'], '和同行伴侣说话'], [['pets'], '灵宠'], [['recall'], '回洞府']] },
  { t: '面板', rows: [[['char'], '角色 / 冲关'], [['bag'], '储物袋'], [['skills'], '法术书'], [['alchemy'], '丹房 / 器炉'], [['seclude'], '闭关'], [['zhenfa'], '阵法盘'], [['wardrobe'], '换装'], [['map'], '世界地图'], [['hearts'], '友人录'], [['relations'], '人脉录'], [['chronicle'], '大事记'], [['war'], '战报 / 传书'], [['help'], '修仙指南'], [['zoomIn', 'zoomOut'], '缩放（也可滚轮）']] },
];

/** 一行一行的键位表（电脑） */
export function KeysHelp() {
  return (
    <div className="keys-help">
      {groups().map((g) => (
        <div key={g.t} className="kh-group">
          <div className="kh-t">{g.t}</div>
          <div className="kh-rows">
            {g.rows.map(([ids, text], i) => (
              <span key={i} className="kh-row">{ids.length === 2 && (ids[0] === 'slot1') ? <><kbd>{K(ids[0])}</kbd>–<kbd>{K(ids[1])}</kbd></> : ids.map((id) => <kbd key={id}>{K(id)}</kbd>)}<em>{text}</em></span>
            ))}
          </div>
        </div>
      ))}
      <div className="kh-foot">点敌人锁定，再点一次取消；锁定时脚下一圈环、头顶箭头（红敌对 · 金中立 · 青友方），屏幕上方是它的大血条。<br />固定键：<kbd>Esc</kbd> 取消锁定 / 关闭 / 设置　<kbd>F3</kbd> 性能　·　对话里按数字选选项、空格跳过打字。键位在「设置 → 改键」里改；数字 7–0 和 F2 / F4 / F6–F10 留给模组。</div>
    </div>
  );
}
/** 手机上的说法 */
export function TouchHelp() {
  return (
    <div className="keys-help touch">
      <div className="kh-group"><div className="kh-t">走动</div><div className="kh-rows"><span className="kh-row"><em>左下摇杆走动，推到底就是疾行；点地面自动前往；「剑」御剑，飞行时右侧上下钮升降；水里同一对钮是「浮」「潜」；灵舟在储物袋或快捷栏里「祭出」</em></span></div></div>
      <div className="kh-group"><div className="kh-t">斗法</div><div className="kh-rows"><span className="kh-row"><em>右下法诀盘点一下施法，自动锁最近的敌人；点敌人或按「锁」锁定（脚下一圈环、头顶箭头、上方大血条）：再点那位取消，再按「锁」换下一个，长按「锁」取消；「闪」闪避；快捷栏旁「架」进近战架势，换成轻击、崩山、欺身、追击（被打飞时是脱困）四个大钮；轻点「崩」把锁定的人推开，长按「崩」变成小摇杆定方向（时间放慢），按着时点旁边的「升」「降」选上挑 / 下砸，松手出手</em></span></div></div>
      <div className="kh-group"><div className="kh-t">交互</div><div className="kh-rows"><span className="kh-row"><em>点人走过去说话；点摊主头顶的招牌开摊位；走近灵物浮出「采集」，走近城镇浮出「进入」；「谈」交谈 / 查看 / 进门</em></span></div></div>
      <div className="kh-group"><div className="kh-t">面板</div><div className="kh-rows"><span className="kh-row"><em>「≡」菜单里是角色、储物袋、法术书、丹器、闭关、衣橱、地图、友人录、人脉、机缘、玉符、云存档、设置；储物袋里长按拖动格子</em></span></div></div>
      <div className="kh-foot">双指捏合缩放　·　点小地图开世界地图　·　接了蓝牙键盘，电脑那套键位一样管用（设置里能改键）</div>
    </div>
  );
}
