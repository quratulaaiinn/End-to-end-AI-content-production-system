import type { ReactNode } from "react";
import { LightLeak } from "@remotion/light-leaks";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { type CameraStyle, getCameraStyle } from "@/ui/lib/beat-choreography";
import type { Domain } from "@/ui/lib/entity-extraction";
import { NARRATIVE_STYLES, type NarrativeRole } from "@/ui/lib/narration-planner";
import { AMBIENT, LIGHT_LEAK, LONG_BEAT } from "@/ui/lib/timing";
import { AmbientBackground } from "./ambient-background";
import { AmbientTheme } from "./ambient-theme";

export type BeatFrameProps = {
  children: ReactNode;
  /** "muted" = the disclaimer beat — dampens ambient motion, never light-leaks, regardless of narrativeRole. */
  intensity?: "full" | "muted";
  accentColor: string;
  backgroundColor: string;
  narrativeRole: NarrativeRole;
  durationInFrames: number;
  /** Unique per beat (e.g. `beat-${index}`) — passed through to AmbientBackground/AmbientTheme/LightLeak for deterministic-but-varied motion. */
  seed: string;
  /** Per-video variation (from the script's own seed): 0 or 1, nudges ambient drift speed. */
  seedVariant?: 0 | 1;
  /** What topic this beat is about — selects AmbientTheme's restrained background motif. */
  domain: Domain;
  /** The script's own deterministic seed — derives this video's camera personality (push/pull/rotate). */
  videoSeed: number;
};

/** Deterministic string→small-int hash — LightLeak's seed prop wants a number, BeatFrame's own seed is a string. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
  }
  return hash;
}

/**
 * The layering wrapper every beat mounts: solid background → AmbientTheme
 * (restrained, topic-matched texture) → AmbientBackground (always running —
 * this is what makes "never static" true even mid-sentence) → a subtle
 * vignette → optional LightLeak (hook/payoff only) → the beat's one primary
 * scene, full strength throughout.
 */
export const BeatFrame: React.FC<BeatFrameProps> = ({
  children,
  intensity = "full",
  accentColor,
  backgroundColor,
  narrativeRole,
  durationInFrames,
  seed,
  seedVariant = 0,
  domain,
  videoSeed,
}) => {
  const frame = useCurrentFrame();
  const isMuted = intensity === "muted";
  const style = NARRATIVE_STYLES[narrativeRole];
  const showLightLeak = !isMuted && style.useLightLeak;
  const cameraStyle: CameraStyle = getCameraStyle(videoSeed);

  const isLongBeat = durationInFrames > LONG_BEAT.thresholdInFrames;
  const sweepCenterFrame = durationInFrames * LONG_BEAT.sweepAtFraction;
  const sweepProgress =
    isLongBeat && !isMuted
      ? interpolate(
          frame,
          [
            sweepCenterFrame - LONG_BEAT.sweepDurationInFrames,
            sweepCenterFrame,
            sweepCenterFrame + LONG_BEAT.sweepDurationInFrames,
          ],
          [-25, 50, 125],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : null;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {!isMuted ? <AmbientTheme domain={domain} accentColor={accentColor} seed={seed} /> : null}
      <AmbientBackground
        accentColor={accentColor}
        seed={seed}
        durationInFrames={durationInFrames}
        particleCount={isMuted ? AMBIENT.particleCountMuted : AMBIENT.particleCountFull}
        kenBurnsMaxScale={isMuted ? AMBIENT.kenBurnsMaxScaleMuted : AMBIENT.kenBurnsMaxScaleFull}
        noiseSpeedMultiplier={0.85 + seedVariant * 0.3}
        cameraStyle={isMuted ? undefined : cameraStyle}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 78% 68% at 50% 48%, transparent 55%, rgba(0,0,0,0.32) 100%)",
          pointerEvents: "none",
        }}
      />
      {sweepProgress !== null ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `linear-gradient(105deg, transparent ${sweepProgress - 22}%, ${accentColor}12 ${sweepProgress}%, transparent ${sweepProgress + 22}%)`,
          }}
        />
      ) : null}
      {showLightLeak ? (
        <LightLeak
          durationInFrames={Math.min(LIGHT_LEAK.durationInFrames, durationInFrames)}
          seed={hashSeed(seed)}
          style={{ position: "absolute", inset: 0 }}
        />
      ) : null}
      {children}
    </AbsoluteFill>
  );
};
