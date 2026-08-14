import { Easing, interpolate } from "remotion";

export const DEFAULT_FPS = 30;

/** Crisp UI entrance curve from Remotion timing best practices */
export const EASING_ENTER = Easing.bezier(0.16, 1, 0.3, 1);

/** Exit curve — accelerates away (Easing.in) */
export const EASING_EXIT = Easing.in(Easing.cubic);

export function secondsToFrames(seconds: number, fps = DEFAULT_FPS): number {
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps = DEFAULT_FPS): number {
  return frames / fps;
}

export function staggerDelay(
  index: number,
  staggerInFrames: number,
  baseDelayInFrames = 0,
): number {
  return baseDelayInFrames + index * staggerInFrames;
}

/** Normalized 0→1 enter progress with default ease-out curve */
export function enterProgress(
  frame: number,
  delayInFrames: number,
  durationInFrames: number,
  easing = EASING_ENTER,
): number {
  return interpolate(
    frame,
    [delayInFrames, delayInFrames + durationInFrames],
    [0, 1],
    {
      easing,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

/** Normalized 0→1 exit progress with default ease-in curve */
export function exitProgress(
  frame: number,
  delayInFrames: number,
  durationInFrames: number,
  easing = EASING_EXIT,
): number {
  return interpolate(
    frame,
    [delayInFrames, delayInFrames + durationInFrames],
    [0, 1],
    {
      easing,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

export const DURATION = {
  fast: 18,
  normal: 28,
  /** Min/max frames for an SVG draw-on (line/ring/timeline-bar) — promoted from TrendChart's former local constants. */
  drawMin: 20,
  drawMax: 45,
} as const;

export const DELAY = {
  short: 6,
  medium: 14,
  /** Pause between a beat's setup (label/line) and its number landing — the held-reveal beat. */
  reveal: 12,
  /** Frames to hold after a draw-on finishes before the payoff figure starts its own reveal — promoted from TrendChart's former local REVEAL_TAIL. */
  revealTail: 12,
  /** First accent icon begins entering, after primary content is established. */
  accentStart: 24,
} as const;

export const STAGGER = {
  normal: 8,
  /** Stagger between successive accent icons in BeatFrame's accent layer. */
  accent: 10,
} as const;

export const EASING = {
  enter: EASING_ENTER,
  exit: EASING_EXIT,
} as const;

/** AmbientBackground's particle field + slow Ken Burns zoom. */
export const AMBIENT = {
  particleCountFull: 14,
  particleCountMuted: 6,
  noiseSpeed: 0.006,
  kenBurnsMaxScaleFull: 1.15,
  kenBurnsMaxScaleMuted: 1.06,
} as const;

/** BeatFrame's optional <LightLeak> overlay — hook/payoff beats only. */
export const LIGHT_LEAK = {
  durationInFrames: 36,
} as const;

/** Floor-protected minimum duration for the disclaimer beat. */
export const DISCLAIMER = {
  minDurationInSeconds: 2.5,
} as const;

/** Cap on secondary entity accents per beat — richness, not clutter. */
export const ACCENTS = {
  maxPerBeat: 3,
} as const;

/**
 * Beats longer than this get extra internal visual evolution (accents spread
 * across the full duration instead of bunched near the start, a breathing
 * Ken Burns pulse, a single midpoint light sweep) so a long hold — whichever
 * beat ends up long, for whatever reason — never reads as static.
 */
export const LONG_BEAT = {
  thresholdInFrames: 150,
  breathePeriodInFrames: 100,
  breatheAmplitude: 0.035,
  sweepAtFraction: 0.5,
  sweepDurationInFrames: 30,
} as const;

/**
 * Per-beat focus timeline (beat-choreography.ts): exactly one subject — a
 * context object, or the primary scene — is on screen at a time. A context
 * object's stage is anchored to the exact frame its trigger word is spoken
 * (never earlier) and fully exits before the next one's word arrives — no
 * parking, no held-over objects. Richness comes from sequencing, not more
 * simultaneous objects, so ACCENTS.maxPerBeat deliberately stays at 3.
 */
export const CHOREOGRAPHY = {
  /** Below this total beat duration, choreography is skipped — single primary-only stage, today's simple behavior. */
  minBeatFrames: 90,
  /** A context object's focus window is capped here even if there's a big gap until the next mentioned word. */
  stageMaxFrames: 60,
  /** Floor reserved for the primary scene's own stage at the end, trimming the last context stage if needed. */
  minVisibleFrames: 20,
  /** Entering: weight ramps 0 -> focusedWeight. */
  enterFrames: 8,
  /** Exiting: weight ramps focusedWeight -> 0 while drifting upward, then fully unmounts — never parked. */
  exitFrames: 12,
  focusedWeight: 1,
  /** The primary scene's own weight before its stage — present, not yet dominant. */
  primaryRecededWeight: 0.45,
  /** How far a context object drifts upward while exiting, at 1080p reference scale. */
  exitDriftPx: 26,
} as const;
