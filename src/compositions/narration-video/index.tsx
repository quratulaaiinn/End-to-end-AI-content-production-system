import type { ReactNode } from "react";
import { Fragment, useMemo } from "react";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { TransitionSeries } from "@remotion/transitions";
import {
  AbsoluteFill,
  Audio,
  type CalculateMetadataFunction,
  Composition,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { resolveHeroIcon } from "@/ui/lib/entity-extraction";
import {
  type Beat,
  type NarrativeRole,
  computeVideoSeed,
  isHighIntensity,
  planBeats,
  splitScriptAndDisclaimerDurations,
} from "@/ui/lib/narration-planner";
import { resolveTransitionTiming } from "@/ui/lib/transition-timing";
import { BeatFrame } from "@/ui/primitives/beat-frame";
import { ProgressBar } from "@/ui/primitives/progress-bar";
import { AllocationRing } from "@/ui/scenes/allocation-ring";
import { AnimatedTimeline } from "@/ui/scenes/animated-timeline";
import { AssetCard } from "@/ui/scenes/asset-card";
import { ComparisonSplit } from "@/ui/scenes/comparison-split";
import { DisclaimerCard } from "@/ui/scenes/disclaimer-card";
import { MetricTicker } from "@/ui/scenes/metric-ticker";
import { TitleCard } from "@/ui/scenes/title-card";
import { TrendChart } from "@/ui/scenes/trend-chart";
import { WarningBadge } from "@/ui/scenes/warning-badge";

const FPS = 30;
/** The default editorial fade duration between beats — most cuts use this unchanged. */
const TRANSITION_DURATION = 18;
/** Slightly longer, calmer fade into the disclaimer. */
const DISCLAIMER_TRANSITION_DURATION = 24;

export const narrationVideoSchema = z.object({
  script: z.string(),
  disclaimer: z.string(),
  audioUrl: z.string(),
  accentColor: z.string().default("#e8b86d"),
  backgroundColor: z.string().default("#080810"),
});

export type NarrationVideoProps = z.infer<typeof narrationVideoSchema>;

const calculateMetadata: CalculateMetadataFunction<NarrationVideoProps> = async ({
  props,
}) => {
  const seconds = await getAudioDurationInSeconds(props.audioUrl);
  const durationInFrames = Math.max(1, Math.ceil(seconds * FPS));
  return { durationInFrames };
};

function renderPrimaryScene(beat: Beat, accentColor: string): ReactNode {
  switch (beat.visualType) {
    case "statement":
      return (
        <TitleCard
          title={beat.text}
          variant={beat.variant}
          heroIcon={resolveHeroIcon(beat.accents, beat.domain)}
          accentColor={accentColor}
          backgroundColor="transparent"
          durationInFrames={beat.durationInFrames}
        />
      );
    case "trend":
      return (
        <TrendChart
          label={beat.text}
          points={beat.trend.points}
          changePercent={beat.trend.changePercent}
          direction={beat.trend.direction}
          backgroundColor="transparent"
          durationInFrames={beat.durationInFrames}
          glowIntensity={isHighIntensity(beat.text) ? "high" : "normal"}
        />
      );
    case "stat":
      return (
        <MetricTicker
          title={beat.text}
          metrics={[beat.metric]}
          accentColor={accentColor}
          backgroundColor="transparent"
          durationInFrames={beat.durationInFrames}
        />
      );
    case "allocation":
      return (
        <AllocationRing
          label={beat.text}
          allocation={beat.allocation}
          accentColor={accentColor}
          backgroundColor="transparent"
          narrativeRole={beat.narrativeRole}
          durationInFrames={beat.durationInFrames}
        />
      );
    case "comparison":
      return (
        <ComparisonSplit
          comparison={beat.comparison}
          accentColor={accentColor}
          backgroundColor="transparent"
          narrativeRole={beat.narrativeRole}
          durationInFrames={beat.durationInFrames}
        />
      );
    case "risk":
      return (
        <WarningBadge
          label={beat.text}
          severity={beat.severity}
          backgroundColor="transparent"
          narrativeRole={beat.narrativeRole}
          durationInFrames={beat.durationInFrames}
        />
      );
    case "timeline":
      return (
        <AnimatedTimeline
          label={beat.text}
          timeline={beat.timeline}
          accentColor={accentColor}
          backgroundColor="transparent"
          narrativeRole={beat.narrativeRole}
          durationInFrames={beat.durationInFrames}
        />
      );
    case "asset":
      return (
        <AssetCard
          asset={beat.asset}
          label={beat.text}
          size="primary"
          accentColor={accentColor}
          backgroundColor="transparent"
        />
      );
    default: {
      const _exhaustive: never = beat;
      throw new Error(`Unhandled visualType: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function renderBeat(
  beat: Beat,
  accentColor: string,
  backgroundColor: string,
  seed: string,
  seedVariant: 0 | 1,
  videoSeed: number,
): ReactNode {
  return (
    <BeatFrame
      accentColor={accentColor}
      backgroundColor={backgroundColor}
      narrativeRole={beat.narrativeRole}
      durationInFrames={beat.durationInFrames}
      seed={seed}
      seedVariant={seedVariant}
      domain={beat.domain}
      videoSeed={videoSeed}
    >
      {renderPrimaryScene(beat, accentColor)}
    </BeatFrame>
  );
}

type TransitionChoice = {
  presentation: ReturnType<typeof fade> | ReturnType<typeof slide>;
  timing: ReturnType<typeof resolveTransitionTiming>;
  durationInFrames: number;
};

/**
 * Default editorial fade for the large majority of cuts, with two narrow,
 * motivated exceptions keyed on the INCOMING beat's narrative role — not a
 * large transition-variety matrix. Hook/payoff beats deliberately get no
 * special transition on top of their own LightLeak (BeatFrame) — stacking a
 * special transition + a light-leak + a glow bias on one cut would be exactly
 * the layered chaos this project's motion philosophy rejects.
 *
 * `defaultDuration` is a small per-video nuance (18 vs 20 frames, from the
 * script's own seed) — still reads as the same invisible editorial fade,
 * just a hair different in pace from video to video.
 */
function resolveTransition(toRole: NarrativeRole, fps: number, defaultDuration: number): TransitionChoice {
  if (toRole === "disclaimer") {
    const timing = resolveTransitionTiming({
      durationInFrames: DISCLAIMER_TRANSITION_DURATION,
      variant: "editorial",
    });
    return { presentation: fade(), timing, durationInFrames: timing.getDurationInFrames({ fps }) };
  }
  if (toRole === "comparison") {
    const timing = resolveTransitionTiming({ durationInFrames: defaultDuration, variant: "editorial" });
    return {
      presentation: slide({ direction: "from-right" }),
      timing,
      durationInFrames: timing.getDurationInFrames({ fps }),
    };
  }
  const timing = resolveTransitionTiming({ durationInFrames: defaultDuration, variant: "editorial" });
  return { presentation: fade(), timing, durationInFrames: timing.getDurationInFrames({ fps }) };
}

type RenderSegment = { node: ReactNode; durationInFrames: number; narrativeRole: NarrativeRole };

export const NarrationVideo: React.FC<NarrationVideoProps> = ({
  script,
  disclaimer,
  audioUrl,
  accentColor,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  // Derived once from the script itself — the same script always looks the
  // same, but different scripts land on different (still on-brand) variants:
  // default transition pace, accent-slot layout, TitleCard's starting phase,
  // ambient drift "personality". Consistent style, varied template.
  const videoSeed = useMemo(() => computeVideoSeed(script), [script]);
  const seedVariant: 0 | 1 = videoSeed % 2 === 0 ? 0 : 1;
  const defaultTransitionDuration = TRANSITION_DURATION + (videoSeed % 3 === 0 ? 2 : 0);

  const { scriptDurationInFrames, disclaimerDurationInFrames } = useMemo(
    () =>
      splitScriptAndDisclaimerDurations({
        script,
        disclaimer,
        totalDurationInFrames: durationInFrames,
        fps,
      }),
    [script, disclaimer, durationInFrames, fps],
  );

  const beats = useMemo(
    () => planBeats({ narration: script, totalDurationInFrames: scriptDurationInFrames, fps }),
    [script, scriptDurationInFrames, fps],
  );

  const segments = useMemo<RenderSegment[]>(() => {
    const beatSegments: RenderSegment[] = beats.map((beat, index) => ({
      node: renderBeat(beat, accentColor, backgroundColor, `beat-${index}`, seedVariant, videoSeed),
      durationInFrames: beat.durationInFrames,
      narrativeRole: beat.narrativeRole,
    }));

    const disclaimerSegment: RenderSegment = {
      node: (
        <BeatFrame
          accentColor={accentColor}
          backgroundColor={backgroundColor}
          narrativeRole="disclaimer"
          intensity="muted"
          durationInFrames={disclaimerDurationInFrames}
          seed="disclaimer"
          seedVariant={seedVariant}
          domain="general"
          videoSeed={videoSeed}
        >
          <DisclaimerCard text={disclaimer} backgroundColor="transparent" accentColor={accentColor} />
        </BeatFrame>
      ),
      durationInFrames: disclaimerDurationInFrames,
      narrativeRole: "disclaimer",
    };

    return [...beatSegments, disclaimerSegment];
  }, [beats, disclaimer, disclaimerDurationInFrames, accentColor, backgroundColor, seedVariant, videoSeed]);

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <TransitionSeries>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const transition = isLast
            ? null
            : resolveTransition(segments[index + 1].narrativeRole, fps, defaultTransitionDuration);
          const seqDuration = isLast
            ? segment.durationInFrames
            : segment.durationInFrames + (transition?.durationInFrames ?? 0);

          return (
            <Fragment key={index}>
              <TransitionSeries.Sequence durationInFrames={seqDuration}>
                {segment.node}
              </TransitionSeries.Sequence>
              {transition ? (
                <TransitionSeries.Transition
                  presentation={transition.presentation}
                  timing={transition.timing}
                />
              ) : null}
            </Fragment>
          );
        })}
      </TransitionSeries>
      <Audio src={audioUrl} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120 }}>
        <ProgressBar
          progress={frame / durationInFrames}
          durationInFrames={1}
          delayInFrames={0}
          color={accentColor}
        />
      </div>
    </AbsoluteFill>
  );
};

export const NarrationVideoComposition: React.FC = () => (
  <Composition
    id="NarrationVideo"
    component={NarrationVideo}
    schema={narrationVideoSchema}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={150}
    calculateMetadata={calculateMetadata}
    defaultProps={{
      script:
        "Eighty-twenty rule for digital assets: core holdings vs high-risk bets. Most investors allocate 80 percent to low-risk assets like Bitcoin and Ethereum but that leaves room for explosive growth with high-risk bets. It's like having a stable job and a side hustle.",
      disclaimer:
        "And as always — this is for educational purposes only, not financial advice. Do your own research.",
      audioUrl: staticFile("sample-narration.wav"),
      accentColor: "#e8b86d",
      backgroundColor: "#080810",
    }}
  />
);
