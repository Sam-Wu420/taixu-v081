// r14-toast：消息提示分级与去向（纯函数，不碰界面；tools/test-toast.ts 直接测）
//
// 用户反馈：手机上方正中老弹宽条消息（「神识中：…」事件、江湖传闻），挡战场。改成三级：
//   · urgent 紧要：追杀、生命危险、冲你来的敌人（kind 为 'warn' 的提示默认都算）——任何档位、打斗中都照弹；
//   · high   重要：你自己操作的回应、引导下一步、境界突破、任务进展、获得重要物品、模组发的提示——「全部 / 只显示重要的」两档照弹，打斗中也弹；
//   · low    闲讯：神识中看到的旁人事件、江湖传闻、路过的小事、捡到寻常物品——只记进「讯」角标的消息记录；
//            「全部显示」档才弹，而且打斗中（锁定着目标、近战架势、刚出手 / 挨打）先压着，打完再补（压太久的不补，只记录）。
// 设置项「消息提示」：全部显示 / 只显示重要的（手机默认）/ 安静（只弹紧要的），存在本机 localStorage 'taixu.toastMode'。

export type ToastLv = 'urgent' | 'high' | 'low';
export type ToastMode = 'all' | 'important' | 'quiet';
export type ToastKind = 'info' | 'warn' | 'region' | 'good';
/** toast 的第三个参数（引擎内部用；模组接口 toast(text, tone) 不变） */
export interface ToastOpt { lv?: ToastLv; mod?: boolean }

export const TOAST_MODE_KEY = 'taixu.toastMode';
export const TOAST_MODES: { id: ToastMode; name: string; desc: string }[] = [
  { id: 'all', name: '全部显示', desc: '所有消息都弹出；打斗中闲讯暂缓' },
  { id: 'important', name: '只显示重要的', desc: '追杀、危险、突破、引导、要紧物品照弹；神识中的旁人事件、传闻只记进「讯」' },
  { id: 'quiet', name: '安静', desc: '只弹追杀、危险这类紧要的；其余都记进「讯」' },
];

/** 旁人的事、风闻：以这些开头且话里不涉及「你」的，算闲讯 */
const AMBIENT = /^(神识中[：:]|江湖传闻|【传闻】|传闻[：:]|得到一则传闻|远处|街上|风里)/;

/** 恩怨重做：旁人的事、风闻（不涉及「你」）——收进江湖传音 */
export function isAmbient(text: string) { return AMBIENT.test(text) && !text.includes('你'); }

/** 判级。explicit 优先；模组的提示至少是重要；旁人事件 / 传闻是闲讯（话里冲着「你」来的除外）；警示是紧要；其余重要 */
export function toastLevel(text: string, kind: ToastKind = 'info', opt?: ToastOpt): ToastLv {
  if (opt?.lv) return opt.lv;
  if (opt?.mod) return kind === 'warn' ? 'urgent' : 'high';
  if (AMBIENT.test(text) && !text.includes('你')) return 'low';
  return kind === 'warn' ? 'urgent' : 'high';
}

/** 去向：show 弹出、defer 先压着（打完再看）、log 只记进「讯」 */
export function toastRoute(lv: ToastLv, mode: ToastMode, fighting: boolean): 'show' | 'defer' | 'log' {
  if (lv === 'urgent') return 'show';
  if (lv === 'high') return mode === 'quiet' ? 'log' : 'show';
  if (mode !== 'all') return 'log';
  return fighting ? 'defer' : 'show';
}

/** 停留时长（毫秒）。手机：3 秒左右，紧要的多半秒，排着队时再短些；电脑照旧（4.2 秒，排队时 3 秒） */
export function toastMs(lv: ToastLv, touch: boolean, queued: boolean): number {
  if (!touch) return queued ? 3000 : 4200;
  if (lv === 'urgent') return queued ? 3000 : 3600;
  return queued ? 2400 : 3000;
}

/** 手机上排队最多几条（多的只记进「讯」，不再叠「还有 N 条」）；电脑照旧 12 */
export const toastQueueCap = (touch: boolean) => (touch ? 2 : 12);
/** 打斗中压着的闲讯，打完后多久以内的还补弹（秒）；更早的只记录 */
export const TOAST_DEFER_MAX_AGE = 20;

export function isToastMode(v: unknown): v is ToastMode { return v === 'all' || v === 'important' || v === 'quiet'; }
/** 读设置：没存过就按设备给默认（手机「只显示重要的」、电脑「全部显示」） */
export function toastMode(touch: boolean): ToastMode {
  try { const v = localStorage.getItem(TOAST_MODE_KEY); if (isToastMode(v)) return v; } catch { /* 隐私窗口 / 无头 */ }
  return touch ? 'important' : 'all';
}
export function setToastMode(m: ToastMode): void { try { localStorage.setItem(TOAST_MODE_KEY, m); } catch { /* */ } }
