import { loadFont } from "@remotion/google-fonts/Inter";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ExtractedAllocation } from "@/ui/lib/entity-extraction";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { NARRATIVE_STYLES, type NarrativeRole } from "@/ui/lib/narration-planner";
import { DELAY, DURATION, EASING } from "@/ui/lib/timing";
import { ReactiveWords } from "@/ui/primitives/reactive-words";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type AllocationRingProps = {
  /** Beat sentence, shown as supporting text below the ring. */
  label: string;
  allocation: ExtractedAllocation;
  accentColor?: string;
  backgroundColor?: string;
  narrativeRole: NarrativeRole;
  /** On-screen duration of this beat — paces the label's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  label: "#a1a1aa",
  track: "rgba(255,255,255,0.08)",
  secondary: "#71717a",
  title: "#fafafa",
} as const;

export const AllocationRing: React.FC<AllocationRingProps> = ({
  label,
  allocation,
  accentColor = "#e8b86d",
  backgroundColor = "#080810",
  narrativeRole,
  durationInFrames = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const style = NARRATIVE_STYLES[narrativeRole];

  const labelProgress = interpolate(frame, [0, DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const drawDuration = DURATION.drawMax;
  const drawProgress = interpolate(frame, [0, drawDuration], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const filledLength = allocation.primary * drawProgress;

  // Held reveal: the percentage figure lands a beat after the ring finishes drawing.
  const figureProgress = spring({
    frame,
    fps,
    config: style.spring,
    delay: drawDuration + Math.round(DELAY.reveal * style.revealDelayMultiplier),
    durationInFrames: DURATION.normal,
  });

  const diameter = scaleFont(420, width);
  const strokeWidth = scaleFont(20, width);
  const radius = diameter / 2 - strokeWidth;
  const cx = diameter / 2;
  const cy = diameter / 2;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: scaleFont(28, width),
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        fontFamily,
      }}
    >
      <div style={{ position: "relative", width: diameter, height: diameter }}>
        <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
          <circle cx={cx} cy={cy} r={radius} stroke={COLORS.track} strokeWidth={strokeWidth} fill="none" />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={accentColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${filledLength} ${100 - filledLength}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 ${scaleFont(10, width)}px ${accentColor}66)` }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: figureProgress,
            transform: `translateY(${(1 - figureProgress) * 10}px)`,
          }}
        >
          <div
            style={{
              fontSize: scaleFont(72, width),
              fontWeight: 700,
              color: COLORS.title,
              letterSpacing: "-0.02em",
            }}
          >
            {Math.round(allocation.primary)}%
          </div>
          <div style={{ fontSize: scaleFont(28, width), color: COLORS.secondary, marginTop: scaleFont(4, width) }}>
            vs {Math.round(allocation.secondary)}%
          </div>
        </div>
      </div>
      <div
        style={{
          maxWidth: "84%",
          opacity: labelProgress,
          transform: `translateY(${(1 - labelProgress) * 14}px)`,
        }}
      >
        <ReactiveWords
          text={label}
          fontSize={scaleFont(36, width)}
          fontWeight={500}
          color={COLORS.label}
          activeColor="#fafafa"
          durationInFrames={Math.max(30, durationInFrames - 40)}
          lineHeight={1.35}
        />
      </div>
    </div>
  );
};
