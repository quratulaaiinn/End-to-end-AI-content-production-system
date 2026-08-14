import { loadFont } from "@remotion/google-fonts/Inter";
import { TriangleAlert } from "lucide-react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { NARRATIVE_STYLES, type NarrativeRole } from "@/ui/lib/narration-planner";
import { DELAY, DURATION, EASING } from "@/ui/lib/timing";
import { ReactiveWords } from "@/ui/primitives/reactive-words";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type WarningBadgeProps = {
  label: string;
  severity?: "caution" | "warning";
  backgroundColor?: string;
  narrativeRole: NarrativeRole;
  /** On-screen duration of this beat — paces the label's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  caution: "#f59e0b",
  warning: "#fb7185",
  label: "#e4e4e7",
} as const;

/**
 * Always a full primary scene, never an accent — risk beats are narratively
 * significant, and a corner icon would undersell them. Secondary risk
 * signals in non-risk-primary beats surface via BeatFrame's normal accent
 * layer instead.
 */
export const WarningBadge: React.FC<WarningBadgeProps> = ({
  label,
  severity = "caution",
  backgroundColor = "#080810",
  narrativeRole,
  durationInFrames = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const style = NARRATIVE_STYLES[narrativeRole];
  const tint = severity === "warning" ? COLORS.warning : COLORS.caution;

  const iconProgress = spring({
    frame,
    fps,
    config: style.spring,
    delay: DELAY.short,
    durationInFrames: DURATION.normal,
  });
  const labelProgress = interpolate(frame, [DELAY.medium, DELAY.medium + DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Continuous pulse — its own "never static" motion source, independent of AmbientBackground.
  const pulse = 1 + Math.sin(frame / 20) * 0.05;
  const glowPulse = 0.5 + Math.sin(frame / 20) * 0.2;

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: scaleFont(28, width),
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "58%",
          height: "58%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${tint}33 0%, transparent 70%)`,
          opacity: glowPulse,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          opacity: iconProgress,
          transform: `scale(${(0.9 + iconProgress * 0.1) * pulse})`,
        }}
      >
        <TriangleAlert size={scaleFont(140, width)} color={tint} strokeWidth={1.75} />
      </div>
      <div
        style={{
          position: "relative",
          maxWidth: "82%",
          opacity: labelProgress,
          transform: `translateY(${(1 - labelProgress) * 14}px)`,
        }}
      >
        <ReactiveWords
          text={label}
          fontSize={scaleFont(40, width)}
          fontWeight={600}
          color={COLORS.label}
          activeColor="#ffffff"
          durationInFrames={Math.max(30, durationInFrames - 40)}
          lineHeight={1.35}
        />
      </div>
    </div>
  );
};
