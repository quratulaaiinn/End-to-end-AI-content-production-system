import { loadFont } from "@remotion/google-fonts/Inter";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { formatCompactNumber } from "@/ui/lib/chart-utils";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { DELAY, DURATION, EASING, STAGGER } from "@/ui/lib/timing";
import { ReactiveWords } from "@/ui/primitives/reactive-words";

const { fontFamily } = loadFont("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
});

export type MetricTickerItem = {
  label: string;
  value: number;
  suffix?: string;
  delta?: string;
};

export type MetricTickerProps = {
  metrics: MetricTickerItem[];
  title?: string;
  backgroundColor?: string;
  accentColor?: string;
  /** On-screen duration of this beat — paces the title's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  bg: "#080810",
  title: "#e4e4e7",
  label: "#a1a1aa",
  card: "rgba(12,16,28,0.82)",
  border: "rgba(161,161,170,0.18)",
  delta: "#2dd4bf",
  accent: "#e8b86d",
} as const;

export const MetricTicker: React.FC<MetricTickerProps> = ({
  metrics,
  title,
  backgroundColor = COLORS.bg,
  accentColor = COLORS.accent,
  durationInFrames = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const isPortrait = height > width;
  const columns = isPortrait ? 1 : Math.min(metrics.length, 3);
  const titleProgress = title
    ? interpolate(frame, [0, DURATION.fast], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.enter,
      })
    : 0;

  return (
    <div
      style={{
        width,
        height,
        background: backgroundColor,
        backgroundImage: `radial-gradient(circle at 80% 20%, ${accentColor}14, transparent 42%)`,
        color: COLORS.title,
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        paddingTop: safeArea.paddingTop,
        paddingBottom: safeArea.paddingBottom,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        gap: scaleFont(36, width),
        justifyContent: "center",
      }}
    >
      {title ? (
        <h2
          style={{
            margin: 0,
            fontSize: scaleFont(52, width),
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            opacity: titleProgress,
            transform: `translateY(${(1 - titleProgress) * 16}px)`,
          }}
        >
          <ReactiveWords
            text={title}
            fontSize={scaleFont(52, width)}
            fontWeight={700}
            color="#d4d4d8"
            activeColor="#ffffff"
            durationInFrames={Math.max(30, durationInFrames - 40)}
            lineHeight={1.05}
          />
        </h2>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isPortrait ? "1fr" : `repeat(${columns}, 1fr)`,
          gap: scaleFont(20, width),
        }}
      >
        {metrics.slice(0, 3).map((metric, index) => {
          const delay = STAGGER.normal + index * STAGGER.normal;
          const progress = spring({
            frame: frame - delay,
            fps,
            config: { damping: 16, stiffness: 110, mass: 0.9 },
            durationInFrames: DURATION.normal,
          });
          const glow = interpolate(progress, [0.6, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // Held reveal: the number lands a beat after the card/label are already on screen.
          const valueProgress = spring({
            frame: frame - delay - DELAY.reveal,
            fps,
            config: { damping: 16, stiffness: 130, mass: 0.8 },
            durationInFrames: DURATION.normal,
          });

          return (
            <div
              key={metric.label}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: scaleFont(20, width),
                padding: scaleFont(24, width),
                background: COLORS.card,
                opacity: progress,
                transform: `translateY(${(1 - progress) * 20}px)`,
                boxShadow:
                  glow > 0
                    ? `0 0 ${Math.round(24 * glow)}px ${accentColor}33, inset 0 1px 0 rgba(255,255,255,0.04)`
                    : undefined,
              }}
            >
              <div
                style={{
                  color: COLORS.label,
                  fontSize: scaleFont(24, width),
                  fontWeight: 600,
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  color: accentColor,
                  fontSize: scaleFont(48, width),
                  fontWeight: 700,
                  marginTop: scaleFont(12, width),
                  letterSpacing: "-0.02em",
                  opacity: valueProgress,
                  transform: `translateY(${(1 - valueProgress) * 10}px)`,
                }}
              >
                {formatCompactNumber(Math.round(metric.value * valueProgress))}
                {metric.suffix ?? ""}
              </div>
              {metric.delta ? (
                <div
                  style={{
                    color: COLORS.delta,
                    fontSize: scaleFont(22, width),
                    marginTop: scaleFont(8, width),
                    fontWeight: 600,
                    opacity: valueProgress,
                  }}
                >
                  {metric.delta}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
