// r14：界面层的兜底。React 里任何一个组件渲染时抛错、又没有错误边界，整棵界面树都会被卸掉——
// 玩家看到的就是一整屏黑（「进洞府全黑」就是对话框读了空节点）。这里把对话框层、洞府场景各自包一层：
// 出错时只丢掉这一层，调 onError 收拾状态（关掉对话框 / 退出洞府），下一次渲染照常，游戏画面和别的界面都还在。
import { Component, type ReactNode } from 'react';

export class LayerGuard extends Component<{ name: string; onError?: () => void; children?: ReactNode }, { bad: number }> {
  state = { bad: 0 };
  static getDerivedStateFromError() { return { bad: 1 }; }
  componentDidCatch(err: unknown) {
    console.error(`[taixu] 界面层「${this.props.name}」出错，已丢掉这一层继续`, err);
    try { this.props.onError?.(); } catch { /* 收拾不了也不能再抛 */ }
    // 下一帧恢复渲染：出错的状态多半已被 onError 清掉
    setTimeout(() => this.setState({ bad: 0 }), 0);
  }
  render() { return this.state.bad ? null : this.props.children; }
}
