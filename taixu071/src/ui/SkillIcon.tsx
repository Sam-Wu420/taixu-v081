// 法术与阵法图标组件：模组显式注册的图标优先，加载失败时自动回退至程序图标或文字徽记。
import { useEffect, useState, type CSSProperties } from 'react';
import { skillFallbackIconURL, skillIconURL } from '../gfx/skillIconData';

export function SkillIcon({
  id,
  className,
  imgClassName,
  style,
  imgStyle,
  fallbackText,
}: {
  id: string;
  className: string;
  imgClassName?: string;
  style?: CSSProperties;
  imgStyle?: CSSProperties;
  fallbackText: string;
}) {
  const u = skillIconURL(id), fb = skillFallbackIconURL(id);
  const [phase, setPhase] = useState<'primary' | 'fallback' | 'text'>('primary');
  useEffect(() => { setPhase('primary'); }, [id, u]);
  const src = phase === 'primary' ? u : phase === 'fallback' ? fb : undefined;
  if (src) {
    return (
      <img
        className={imgClassName ?? `${className} art-ico sk-ico`}
        src={src}
        alt=""
        draggable={false}
        style={imgStyle}
        onError={() => setPhase((cur) => (cur === 'primary' && fb && fb !== u ? 'fallback' : 'text'))}
      />
    );
  }
  return <span className={className} style={style}>{fallbackText}</span>;
}
