import type { ComponentType } from "react";
import { loadFont } from "@remotion/google-fonts/Inter";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ExtractedComparison } from "@/ui/lib/entity-extraction";
import { resolveIcon } from "@/ui/lib/icon-registry";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { NARRATIVE_STYLES, type NarrativeRole } from "@/ui/lib/narration-planner";
import { DELAY, DURATION, EASING, STAGGER } from "@/ui/lib/timing";
import { ReactiveWords } from "@/ui/primitives/reactive-words";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type ComparisonSplitProps = {
  comparison: ExtractedComparison;
  accentColor?: string;
  backgroundColor?: string;
  narrativeRole: NarrativeRole;
  /** On-screen duration of this beat — paces each side's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  label: "#e4e4e7",
  divider: "rgba(161,161,170,0.28)",
} as const;

export const ComparisonSplit: React.FC<ComparisonSplitProps> = ({
  comparison,
  accentColor = "#e8b86d",
  backgroundColor = "#080810",
  narrativeRole,
  durationInFrames = 130,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const style = NARRATIVE_STYLES[narrativeRole];

  // The divider is a mechanical draw-on (interpolate); the two sides pop in
  // with the narrative role's own spring config for a more organic feel.
  const dividerProgress = interpolate(frame, [DELAY.short, DELAY.short + DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const leftProgress = spring({
    frame,
    fps,
    config: style.spring,
    delay: DELAY.medium,
    durationInFrames: DURATION.normal,
  });
  const rightProgress = spring({
    frame,
    fps,
    config: style.spring,
    delay: DELAY.medium + STAGGER.normal,
    durationInFrames: DURATION.normal,
  });

  const LeftIcon = resolveIcon(comparison.leftIcon);
  const RightIcon = resolveIcon(comparison.rightIcon);

  const sideDuration = Math.max(30, durationInFrames - DELAY.medium - STAGGER.normal - 20);

  const renderSide = (
    text: string,
    Icon: ComponentType<{ size?: number | string; color?: string }>,
    progress: number,
  ) => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: scaleFont(20, width),
        padding: scaleFont(24, width),
        opacity: progress,
        transform: `translateY(${(1 - progress) * 20}px)`,
      }}
    >
      <Icon size={scaleFont(64, width)} color={accentColor} />
      <ReactiveWords
        text={text}
        fontSize={scaleFont(34, width)}
        fontWeight={600}
        color={COLORS.label}
        activeColor="#ffffff"
        durationInFrames={sideDuration}
        lineHeight={1.3}
      />
    </div>
  );

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        fontFamily,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        paddingTop: safeArea.paddingTop,
        paddingBottom: safeArea.paddingBottom,
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
      }}
    >
      {renderSide(comparison.left, LeftIcon, leftProgress)}
      <div
        style={{
          width: 2,
          alignSelf: "center",
          height: `${dividerProgress * 60}%`,
          background: `linear-gradient(180deg, transparent, ${COLORS.divider}, transparent)`,
        }}
      />
      {renderSide(comparison.right, RightIcon, rightProgress)}
    </div>
  );
};
