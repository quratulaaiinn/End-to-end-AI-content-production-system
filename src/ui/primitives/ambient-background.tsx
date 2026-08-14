import { Circle } from "@remotion/shapes";
import { noise3D } from "@remotion/noise";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraStyle } from "@/ui/lib/beat-choreography";
import { getSafeAreaPadding } from "@/ui/lib/layout";
import { AMBIENT, LONG_BEAT } from "@/ui/lib/timing";

export type AmbientBackgroundProps = {
  accentColor: string;
  /** Unique per beat (e.g. `beat-${index}`) so particle layout/noise phase differs beat-to-beat but stays deterministic. */
  seed: string;
  durationInFrames: number;
  particleCount?: number;
  kenBurnsMaxScale?: number;
  /** Per-video variation (from the script's own seed) — a gentle nudge to drift speed, not a different look. */
  noiseSpeedMultiplier?: number;
  /** Per-video camera personality (push-in vs. pull-back, subtle rotation on/off) — derived once from the script's seed, not a per-beat random wobble. Omitted = today's push-in-only, no-rotation behavior. */
  cameraStyle?: CameraStyle;
};

type Particle = { key: number; x: number; y: number; opacity: number; radius: number; depth: number };

/**
 * Persistent particle drift + slow Ken Burns zoom — the layer that keeps every
 * beat visibly alive even mid-sentence. Particles are seeded via remotion's own
 * random() (NOT Math.random(), which breaks reproducibility since Remotion
 * renders frames in parallel across multiple Chrome instances) and biased
 * toward the safe-area margins rather than uniformly full-bleed, so they read
 * as an ambient frame around the content instead of competing with it.
 *
 * Two depth layers (near/far) give a felt sense of parallax rather than a
 * flat particle field. Beats longer than LONG_BEAT.thresholdInFrames get an
 * additional slow "breathing" pulse layered on top of the base zoom, so a
 * long hold keeps evolving instead of creeping at one constant rate.
 */
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  accentColor,
  seed,
  durationInFrames,
  particleCount = AMBIENT.particleCountFull,
  kenBurnsMaxScale = AMBIENT.kenBurnsMaxScaleFull,
  noiseSpeedMultiplier = 1,
  cameraStyle,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const span = Math.max(1, durationInFrames);
  const noiseSpeed = AMBIENT.noiseSpeed * noiseSpeedMultiplier;

  // "pull" reverses the zoom direction (starts zoomed in, eases back to 1)
  // instead of always pushing in — one more axis of per-video variation.
  const [zoomStart, zoomEnd] =
    cameraStyle?.direction === "pull" ? [kenBurnsMaxScale, 1] : [1, kenBurnsMaxScale];
  const baseZoom = interpolate(frame, [0, span], [zoomStart, zoomEnd], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isLongBeat = durationInFrames > LONG_BEAT.thresholdInFrames;
  const breathe = isLongBeat
    ? Math.sin((frame / LONG_BEAT.breathePeriodInFrames) * 2 * Math.PI) * LONG_BEAT.breatheAmplitude
    : 0;
  const zoom = baseZoom + breathe;
  const panX = interpolate(frame, [0, span], [0, -12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // A fraction-of-a-degree rotation, only for videos whose camera style opts
  // in — subtle sense of depth, never distracting.
  const rotateDeg = cameraStyle?.rotate
    ? noise3D(`${seed}-camera-rotate`, 0, 0, frame * noiseSpeed * 0.5) * 0.4
    : 0;

  const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
    const inMargin = random(`${seed}-margin-${i}`) < 0.7;
    const onVerticalEdge = random(`${seed}-edge-${i}`) < 0.5;
    const nearStart = random(`${seed}-band-${i}`) < 0.5;
    // Near layer (depth 1) drifts/parallaxes more and sits slightly larger/brighter;
    // far layer (depth ~0.4) is subtler — the contrast is what reads as depth.
    const depth = random(`${seed}-depth-${i}`) < 0.5 ? 1 : 0.4;

    let x: number;
    let y: number;
    if (inMargin && onVerticalEdge) {
      x = nearStart
        ? random(`${seed}-x-${i}`) * safeArea.paddingLeft
        : width - random(`${seed}-x-${i}`) * safeArea.paddingRight;
      y = random(`${seed}-y-${i}`) * height;
    } else if (inMargin) {
      x = random(`${seed}-x-${i}`) * width;
      y = nearStart
        ? random(`${seed}-y-${i}`) * safeArea.paddingTop
        : height - random(`${seed}-y-${i}`) * safeArea.paddingBottom;
    } else {
      x = random(`${seed}-x-${i}`) * width;
      y = random(`${seed}-y-${i}`) * height;
    }

    const driftAmount = 10 + depth * 14;
    const driftX = noise3D(`${seed}-nx-${i}`, 0, 0, frame * noiseSpeed) * driftAmount;
    const driftY = noise3D(`${seed}-ny-${i}`, 0, 0, frame * noiseSpeed) * driftAmount;
    // The far layer also pans slightly slower than the near layer (parallax),
    // relative to the same base panX driving the whole frame.
    const parallaxX = panX * (depth - 1) * 0.6;
    const opacityRange: [number, number] = depth === 1 ? [0.08, 0.24] : [0.04, 0.14];
    const opacity = interpolate(
      noise3D(`${seed}-no-${i}`, 0, 0, frame * noiseSpeed),
      [-1, 1],
      opacityRange,
    );
    const radius = (depth === 1 ? 1.8 : 1.1) + random(`${seed}-r-${i}`) * 1.6;

    return { key: i, x: x + driftX + parallaxX, y: y + driftY, opacity, radius, depth };
  });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${zoom}) translateX(${panX}px) rotate(${rotateDeg}deg)`,
        transformOrigin: "center center",
        pointerEvents: "none",
      }}
    >
      {particles.map((p) => (
        <Circle
          key={p.key}
          radius={p.radius}
          fill={accentColor}
          style={{ position: "absolute", left: p.x - p.radius, top: p.y - p.radius, opacity: p.opacity }}
        />
      ))}
    </AbsoluteFill>
  );
};
