import { loadFont } from "@remotion/google-fonts/Inter";
import { TrendingDown, TrendingUp } from "lucide-react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LineChartDraw } from "@/ui/primitives/line-chart-draw";
import { ReactiveWords } from "@/ui/primitives/reactive-words";
import type { ChartPoint } from "@/ui/lib/chart-utils";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { DELAY, DURATION, EASING } from "@/ui/lib/timing";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type TrendChartProps = {
  /** The narration sentence — shown as supporting text above the chart. */
  label: string;
  points: ChartPoint[];
  changePercent: number;
  direction: "up" | "down";
  backgroundColor?: string;
  /** On-screen duration of this beat, used to fit the line draw + held reveal inside it. */
  durationInFrames?: number;
  /** "high" for HIGH_INTENSITY-flagged trend beats (e.g. "explosive growth") — adds a glow + thicker stroke to the drawn line. */
  glowIntensity?: "normal" | "high";
};

const COLORS = {
  bg: "#080810",
  label: "#a1a1aa",
  up: "#2dd4bf",
  down: "#fb7185",
} as const;

function computeLineDrawDuration(totalDurationInFrames: number): number {
  const available = totalDurationInFrames - DELAY.reveal - DELAY.revealTail;
  return Math.max(DURATION.drawMin, Math.min(DURATION.drawMax, available));
}

export const TrendChart: React.FC<TrendChartProps> = ({
  label,
  points,
  changePercent,
  direction,
  backgroundColor = COLORS.bg,
  durationInFrames = 90,
  glowIntensity = "normal",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const accentColor = direction === "up" ? COLORS.up : COLORS.down;

  const labelProgress = interpolate(frame, [0, DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineDrawDuration = computeLineDrawDuration(durationInFrames);

  // Held reveal: the change figure only stamps in once the line has finished drawing.
  const changeProgress = spring({
    frame: frame - lineDrawDuration - DELAY.reveal,
    fps,
    config: { damping: 16, stiffness: 130, mass: 0.8 },
    durationInFrames: DURATION.normal,
  });

  const changeText = `${changePercent > 0 ? "+" : ""}${Math.round(changePercent)}%`;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        paddingTop: safeArea.paddingTop,
        paddingBottom: safeArea.paddingBottom,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: scaleFont(28, width),
        fontFamily,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 90% 30% at 50% 0%, ${accentColor}14, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: "84%",
          opacity: labelProgress,
          transform: `translateY(${(1 - labelProgress) * 14}px)`,
        }}
      >
        <ReactiveWords
          text={label}
          fontSize={scaleFont(40, width)}
          fontWeight={500}
          color={COLORS.label}
          activeColor="#fafafa"
          durationInFrames={Math.max(30, durationInFrames - 40)}
          lineHeight={1.35}
        />
      </div>
      <div
        style={{
          position: "relative",
          opacity: labelProgress,
          filter:
            glowIntensity === "high"
              ? `drop-shadow(0 0 ${scaleFont(14, width)}px ${accentColor}99)`
              : undefined,
        }}
      >
        <LineChartDraw
          points={points}
          width={Math.round(width * 0.8)}
          height={Math.round(width * 0.42)}
          color={accentColor}
          strokeWidth={glowIntensity === "high" ? 6 : 4}
          durationInFrames={lineDrawDuration}
        />
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: scaleFont(12, width),
          opacity: changeProgress,
          transform: `translateY(${(1 - changeProgress) * 12}px)`,
        }}
      >
        {direction === "up" ? (
          <TrendingUp size={scaleFont(52, width)} color={accentColor} />
        ) : (
          <TrendingDown size={scaleFont(52, width)} color={accentColor} />
        )}
        <div
          style={{
            fontSize: scaleFont(64, width),
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: accentColor,
          }}
        >
          {changeText}
        </div>
      </div>
    </div>
  );
};
