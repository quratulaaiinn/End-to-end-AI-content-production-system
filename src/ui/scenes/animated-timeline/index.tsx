import { loadFont } from "@remotion/google-fonts/Inter";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ExtractedTimeline } from "@/ui/lib/entity-extraction";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { NARRATIVE_STYLES, type NarrativeRole } from "@/ui/lib/narration-planner";
import { DELAY, DURATION, EASING } from "@/ui/lib/timing";
import { ReactiveWords } from "@/ui/primitives/reactive-words";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type TimelineMarker = { label: string; isEmphasized?: boolean };

export type AnimatedTimelineProps = {
  /** Beat sentence, shown as supporting text above the bar. */
  label: string;
  timeline: ExtractedTimeline;
  markers?: TimelineMarker[];
  progressFraction?: number;
  accentColor?: string;
  backgroundColor?: string;
  narrativeRole: NarrativeRole;
  /** On-screen duration of this beat — paces the label's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  label: "#a1a1aa",
  track: "rgba(255,255,255,0.1)",
  dot: "#71717a",
} as const;

function defaultMarkers(timeline: ExtractedTimeline): TimelineMarker[] {
  return [
    { label: "Now" },
    { label: "Ahead" },
    { label: timeline.emphasizedLabel ?? timeline.phrase, isEmphasized: true },
  ];
}

export const AnimatedTimeline: React.FC<AnimatedTimelineProps> = ({
  label,
  timeline,
  markers,
  progressFraction = 0.66,
  accentColor = "#e8b86d",
  backgroundColor = "#080810",
  narrativeRole,
  durationInFrames = 120,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const style = NARRATIVE_STYLES[narrativeRole];
  const resolvedMarkers = markers ?? defaultMarkers(timeline);

  const labelProgress = interpolate(frame, [0, DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const barDuration = DURATION.drawMax;
  const barProgress = interpolate(
    frame,
    [DELAY.short, DELAY.short + barDuration],
    [0, progressFraction],
    { easing: EASING.enter, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Held reveal: the emphasized marker's callout lands a beat after the bar finishes.
  const calloutProgress = spring({
    frame,
    fps,
    config: style.spring,
    delay: DELAY.short + barDuration + Math.round(DELAY.reveal * style.revealDelayMultiplier),
    durationInFrames: DURATION.normal,
  });

  const trackWidth = scaleFont(760, width);

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
        gap: scaleFont(48, width),
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
      }}
    >
      <div
        style={{
          maxWidth: "84%",
          opacity: labelProgress,
          transform: `translateY(${(1 - labelProgress) * 14}px)`,
        }}
      >
        <ReactiveWords
          text={label}
          fontSize={scaleFont(38, width)}
          fontWeight={500}
          color={COLORS.label}
          activeColor="#fafafa"
          durationInFrames={Math.max(30, durationInFrames - 40)}
          lineHeight={1.35}
        />
      </div>
      <div style={{ width: trackWidth, position: "relative" }}>
        <div style={{ height: 4, width: "100%", background: COLORS.track, borderRadius: 999 }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 4,
            width: `${barProgress * 100}%`,
            background: accentColor,
            borderRadius: 999,
            boxShadow: `0 0 ${scaleFont(16, width)}px ${accentColor}66`,
          }}
        />
        {resolvedMarkers.map((marker, index) => {
          // A single marker (or the first of several) lands at position 0,
          // which collapses [max(0, position-0.05), position] to [0, 0] —
          // interpolate() requires a strictly increasing range, so the ramp
          // window is clamped to stay just below its own right edge instead.
          const markerPosition = resolvedMarkers.length > 1 ? index / (resolvedMarkers.length - 1) : 0;
          const dotProgress = interpolate(
            barProgress,
            [Math.min(Math.max(0, markerPosition - 0.05), markerPosition - 0.0001), markerPosition],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <div
              key={marker.label}
              style={{
                position: "absolute",
                top: "50%",
                left: `${markerPosition * 100}%`,
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: marker.isEmphasized ? scaleFont(18, width) : scaleFont(12, width),
                  height: marker.isEmphasized ? scaleFont(18, width) : scaleFont(12, width),
                  borderRadius: "50%",
                  background: marker.isEmphasized ? accentColor : COLORS.dot,
                  opacity: Math.max(dotProgress, 0.35),
                  boxShadow: marker.isEmphasized ? `0 0 ${scaleFont(14, width)}px ${accentColor}88` : undefined,
                }}
              />
              <div
                style={{
                  fontSize: scaleFont(marker.isEmphasized ? 30 : 24, width),
                  fontWeight: marker.isEmphasized ? 700 : 500,
                  color: marker.isEmphasized ? accentColor : COLORS.label,
                  whiteSpace: "nowrap",
                  marginTop: scaleFont(20, width),
                  opacity: marker.isEmphasized ? calloutProgress : 1,
                  transform: marker.isEmphasized ? `translateY(${(1 - calloutProgress) * 8}px)` : undefined,
                }}
              >
                {marker.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
