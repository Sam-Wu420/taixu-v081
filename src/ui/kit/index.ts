// 界面底座（收官 H0）：新画风的共用组件。宣纸或乌木漆底、鎏金双线框、四角角花、匾额题字、朱漆主按钮、墨痕页签、印章；动效只动 transform 和 opacity。
// 样式在 kit.css，设计 token 在 src/styles.css 开头（--lq-*）。类名一律 lq- 前缀。
export { LacquerModal, useLqClose, LQ_OUT_MS, holdLqEsc } from './LacquerModal';
export { Plaque, InkTabs, Btn, btnCls, ItemCell, TierPill, Stone, StoneGem, InkToast, useInkToast, Stamp, PopNumber, ScaleBar, SecTitle } from './parts';
export type { InkTab, BtnKind, ItemCellProps } from './parts';
export { Tooltip, Popover, FloatCard, placeNear, placeBeside } from './float';
export { TIER_INK, TIER_LIT, TIER_MID, TIER_NAMES, tierColor, tierName, fmtStone, fmtNum } from './tier';
export { useTouch, useHudScale, getHudScale, setHudScale, HUD_SCALE_MIN, HUD_SCALE_MAX, hudScaleRange, effHudScale } from './hooks';
