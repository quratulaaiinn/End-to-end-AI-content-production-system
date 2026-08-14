import { AbsoluteFill, useVideoConfig } from "remotion";

export type GridBackgroundProps = {
  accentColor: string;
  /** 0-1 — restrained by default; this is background depth, never the focal layer. */
  opacity?: number;
  /** px spacing at 1080p reference width — wide and sparse reads as structure, not a dense checkerboard. */
  spacing?: number;
};

/**
 * A faint horizontal+vertical line grid — dashboard/graph-paper structure
 * sitting behind everything else. Deliberately static (no per-frame motion):
 * it reads as a distant, stationary backdrop, while AmbientBackground's
 * moving particles/Ken Burns zoom above it is what actually supplies the
 * felt depth (implicit parallax between a still layer and a moving one).
 */
export const GridBackground: React.FC<GridBackgroundProps> = ({ accentColor, opacity = 0.05, spacing = 72 }) => {
  const { width, height } = useVideoConfig();
  const verticalCount = Math.ceil(width / spacing);
  const horizontalCount = Math.ceil(height / spacing);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: verticalCount + 1 }, (_, i) => (
          <line
            key={`v-${i}`}
            x1={i * spacing}
            y1={0}
            x2={i * spacing}
            y2={height}
            stroke={accentColor}
            strokeOpacity={opacity}
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: horizontalCount + 1 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * spacing}
            x2={width}
            y2={i * spacing}
            stroke={accentColor}
            strokeOpacity={opacity}
            strokeWidth={1}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
