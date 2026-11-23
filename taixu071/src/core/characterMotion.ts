// 将实际位移（包括边界夹取）同步给人物动画与布料风力；暂停帧不产生虚假速度。
export function syncCharacterMotion(st: { vx: number; vy: number; speed: number }, fromX: number, fromY: number, x: number, y: number, dt: number) {
  if (Number.isFinite(dt) && dt > 0 && [fromX, fromY, x, y].every(Number.isFinite)) {
    st.vx = (x - fromX) / dt;
    st.vy = (y - fromY) / dt;
    st.speed = Math.hypot(st.vx, st.vy);
  } else {
    st.vx = st.vy = st.speed = 0;
  }
}
