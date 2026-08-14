import type { CSSProperties, ReactNode } from "react";
import { useVideoConfig } from "remotion";
import { scaleFont } from "@/ui/lib/layout";

export type GlassPanelProps = {
  children: ReactNode;
  accentColor?: string;
  /** px at 1080p reference — scaled via scaleFont. */
  padding?: number;
  borderRadius?: number;
  /** "muted" = lower opacity/blur/glow — used by DisclaimerCard. */
  intensity?: "normal" | "muted";
  style?: CSSProperties;
};

const SURFACE = "rgba(12,16,28,0.82)";
const SURFACE_MUTED = "rgba(12,16,28,0.6)";
const BORDER = "1px solid rgba(161,161,170,0.18)";

/**
 * Reusable frosted-glass container. Bounded size only — never mount full-bleed
 * or behind AmbientBackground's animating particles (backdrop-filter blur is
 * GPU-costly per Remotion's own performance guidance).
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  accentColor = "#e8b86d",
  padding = 28,
  borderRadius = 24,
  intensity = "normal",
  style,
}) => {
  const { width } = useVideoConfig();
  const isMuted = intensity === "muted";
  const blurPx = isMuted ? 12 : 20;

  return (
    <div
      style={{
        background: isMuted ? SURFACE_MUTED : SURFACE,
        backdropFilter: `blur(${blurPx}px)`,
        WebkitBackdropFilter: `blur(${blurPx}px)`,
        border: BORDER,
        borderRadius: scaleFont(borderRadius, width),
        padding: scaleFont(padding, width),
        boxShadow: isMuted
          ? `0 0 ${scaleFont(20, width)}px ${accentColor}22`
          : `0 0 ${scaleFont(32, width)}px ${accentColor}33, inset 0 1px 0 rgba(255,255,255,0.04)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
