import { interpolate } from "remotion";
import {
  type AccentEntity,
  OPPORTUNITY_WORDS,
  RISK_WORDS,
  TOPIC_ICON_KEYWORDS,
} from "./entity-extraction";
import { CHOREOGRAPHY } from "./timing";
import { computeWordWindows } from "./word-timing";

// The focus timeline — the core of "hierarchy, not layers." Exactly one
// subject (a context object, or the primary scene) is ever "in focus" at a
// time; everything else recedes rather than disappearing. A pure function of
// data planBeats() already has (text, accents, durationInFrames) — no new
// network/AI calls, no mutable state, computed once per beat.
export type FocusSubject = { type: "primary" } | { type: "context"; accentIndex: number };
export type FocusStage = { subject: FocusSubject; startFrame: number; endFrame: number };

export type ObjectState = "hidden" | "entering" | "focused" | "exiting";

function tokenizeWithOffsets(text: string): { word: string; charIndex: number }[] {
  const tokens: { word: string; charIndex: number }[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ word: match[0], charIndex: match.index });
  }
  return tokens;
}

function findWordIndexForChar(tokens: { charIndex: number }[], charIndex: number): number {
  let best = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].charIndex <= charIndex) best = i;
    else break;
  }
  return best;
}

/** Where an accent's trigger word first appears in the beat's own text — reused so a focus swap lands exactly when that word is "spoken" by ReactiveWords. */
function findAccentCharIndex(text: string, accent: AccentEntity): number | undefined {
  switch (accent.kind) {
    case "asset": {
      if (!accent.asset) return undefined;
      const pattern = new RegExp(`\\b(${accent.asset.id}|${accent.asset.symbol})\\b`, "i");
      return pattern.exec(text)?.index;
    }
    case "risk":
      return RISK_WORDS.exec(text)?.index;
    case "opportunity":
      return OPPORTUNITY_WORDS.exec(text)?.index;
    case "topic": {
      const entry = TOPIC_ICON_KEYWORDS.find((e) => e.icon === accent.icon);
      return entry?.pattern.exec(text)?.index;
    }
    default:
      return undefined;
  }
}

const SINGLE_STAGE_PRIMARY = (durationInFrames: number): FocusStage[] => [
  { subject: { type: "primary" }, startFrame: 0, endFrame: durationInFrames },
];

/**
 * Anchors each context stage to the actual frame its trigger word is
 * "spoken" (via the same computeWordWindows data ReactiveWords renders
 * from) — the object appears exactly when the word is heard, never before.
 * A stage's duration fills the gap until the NEXT accent's own word (capped
 * at stageMaxFrames), so stages never overlap: one object is ever on screen
 * at a time, and it's always gone before the next one's word arrives. Always
 * ends in a final `{type: "primary"}` stage for whatever duration remains —
 * the primary scene's own existing held-reveal becomes the payoff. Short
 * beats or beats with <=1 accent collapse to a single primary-only stage,
 * identical to today's behavior — richness only where a beat supports it.
 */
export function planFocusTimeline(
  text: string,
  accents: AccentEntity[],
  durationInFrames: number,
): FocusStage[] {
  if (accents.length <= 1 || durationInFrames < CHOREOGRAPHY.minBeatFrames) {
    return SINGLE_STAGE_PRIMARY(durationInFrames);
  }

  const wordWindows = computeWordWindows(text, 0, durationInFrames);
  const tokens = tokenizeWithOffsets(text);

  const ordered = accents
    .map((accent, accentIndex) => {
      const charIndex = findAccentCharIndex(text, accent);
      const wordIndex =
        charIndex !== undefined ? findWordIndexForChar(tokens, charIndex) : accentIndex;
      const frame = wordWindows[Math.min(wordIndex, wordWindows.length - 1)]?.start ?? 0;
      return { accentIndex, frame };
    })
    .sort((a, b) => a.frame - b.frame);

  const stages: FocusStage[] = [];
  let cursor = 0;
  for (let i = 0; i < ordered.length; i++) {
    const anchorFrame = ordered[i].frame;
    const nextAnchorFrame = i + 1 < ordered.length ? ordered[i + 1].frame : durationInFrames;
    // Never before its own word, and never before the previous object has
    // fully exited — one focused thing on screen at a time.
    const startFrame = Math.max(anchorFrame, cursor);
    if (startFrame >= durationInFrames - 1) break;
    const stageFrames = Math.min(CHOREOGRAPHY.stageMaxFrames, Math.max(1, nextAnchorFrame - startFrame));
    const endFrame = Math.min(durationInFrames, startFrame + stageFrames);
    stages.push({ subject: { type: "context", accentIndex: ordered[i].accentIndex }, startFrame, endFrame });
    cursor = endFrame;
  }

  if (stages.length === 0) {
    return SINGLE_STAGE_PRIMARY(durationInFrames);
  }

  // Guarantee the primary scene at least a sliver at the end for its own
  // reveal, trimming the last context stage if its word landed very late.
  const last = stages[stages.length - 1];
  if (durationInFrames - last.endFrame < CHOREOGRAPHY.minVisibleFrames) {
    last.endFrame = Math.max(last.startFrame + 1, durationInFrames - CHOREOGRAPHY.minVisibleFrames);
  }

  stages.push({ subject: { type: "primary" }, startFrame: last.endFrame, endFrame: durationInFrames });
  return stages;
}

// Rendering the timeline — continuous weight, not binary visibility. Every
// context object moves through Hidden -> Entering -> Focused -> Exiting ->
// Hidden, fully gone by the time its stage ends. Never parked, never held
// over — only one object is ever on screen at a time.
export type ObjectFocusState = { state: ObjectState; weight: number };

const HIDDEN: ObjectFocusState = { state: "hidden", weight: 0 };

/** Per-frame lifecycle state + weight for one context object (an accent). Objects that didn't win a stage (trimmed by planFocusTimeline) stay Hidden for the whole beat. */
export function getObjectState(
  frame: number,
  accentIndex: number,
  stages: FocusStage[],
): ObjectFocusState {
  const own = stages.find(
    (s): s is FocusStage & { subject: { type: "context"; accentIndex: number } } =>
      s.subject.type === "context" && s.subject.accentIndex === accentIndex,
  );
  if (!own) return HIDDEN;
  if (frame < own.startFrame || frame >= own.endFrame) return HIDDEN;

  const { enterFrames, exitFrames, focusedWeight } = CHOREOGRAPHY;
  const enterEnd = own.startFrame + enterFrames;
  const exitStart = own.endFrame - exitFrames;

  // Two independent 2-point ramps combined with min(), rather than one
  // 4-point interpolate — Remotion's interpolate() requires strictly
  // increasing breakpoints, which a single array can't guarantee once a
  // stage is shorter than enterFrames+exitFrames (two trigger words spoken
  // close together). min() of an enter-ramp and an exit-ramp degrades
  // gracefully to a brief, smaller peak instead of ever going out of order.
  const enterWeight = interpolate(frame, [own.startFrame, enterEnd], [0, focusedWeight], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitWeight = interpolate(frame, [exitStart, own.endFrame], [focusedWeight, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const weight = Math.min(enterWeight, exitWeight);

  let state: ObjectState;
  if (frame < enterEnd) state = "entering";
  else if (frame < exitStart) state = "focused";
  else state = "exiting";

  return { state, weight };
}

/** The primary scene's own weight: full strength only during its stage, a receded-but-present weight beforehand (ramping up shortly before its stage begins) so it never fully disappears while a context object has the floor. */
export function getPrimaryWeight(frame: number, stages: FocusStage[]): number {
  if (stages.length === 1) return CHOREOGRAPHY.focusedWeight;
  const primaryStage = stages[stages.length - 1];
  const rampStart = Math.max(0, primaryStage.startFrame - CHOREOGRAPHY.exitFrames * 2);
  return interpolate(
    frame,
    [0, rampStart, primaryStage.startFrame],
    [CHOREOGRAPHY.primaryRecededWeight, CHOREOGRAPHY.primaryRecededWeight, CHOREOGRAPHY.focusedWeight],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

// Per-video variation — deterministic lookups keyed on the script's own
// computeVideoSeed(), same mechanism already driving transition duration/
// accent-slot preset/TitleCard layout phase. No new randomness source.
export type CameraStyle = { direction: "push" | "pull"; rotate: boolean };

export function getCameraStyle(videoSeed: number): CameraStyle {
  return { direction: videoSeed % 2 === 0 ? "push" : "pull", rotate: videoSeed % 3 !== 0 };
}

export type EntranceDirection = "left" | "right" | "bottom";

export function getEntranceDirection(videoSeed: number): EntranceDirection {
  const directions: EntranceDirection[] = ["left", "right", "bottom"];
  return directions[videoSeed % directions.length];
}
