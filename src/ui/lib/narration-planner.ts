import type { SpringConfig } from "remotion";
import { type FocusStage, planFocusTimeline } from "./beat-choreography";
import type { ChartPoint } from "./chart-utils";
import {
  type AccentEntity,
  type CryptoAsset,
  type Domain,
  type ExtractedAllocation,
  type ExtractedComparison,
  type ExtractedTimeline,
  type VisualType,
  COMPARISON_PATTERN,
  EVIDENCE_MARKERS,
  EXAMPLE_MARKERS,
  OPPORTUNITY_WORDS,
  RISK_WORDS,
  classifyDomain,
  extractAccents,
  extractAllocation,
  extractAssets,
  extractComparison,
  extractPercent,
  extractTimeline,
  findPercentMatchIndex,
  scaleFor,
} from "./entity-extraction";
import { springBouncy, springSmooth, springSnappy } from "./springs";
import { DEFAULT_FPS, DISCLAIMER, secondsToFrames } from "./timing";

export type BeatVariant = "plain" | "sweep" | "decode";

export type ExtractedMetric = {
  label: string;
  value: number;
  suffix?: string;
};

export type ExtractedTrend = {
  points: [ChartPoint, ChartPoint];
  changePercent: number;
  direction: "up" | "down";
};

export type NarrativeRole =
  | "hook"
  | "evidence"
  | "explanation"
  | "comparison"
  | "example"
  | "payoff"
  | "warning"
  | "conclusion"
  | "disclaimer";

type BeatBase = {
  text: string;
  durationInFrames: number;
  startFrame: number;
  /** Positional — index 0 — decoupled from visualType; the hook is also classified into whichever visual its content calls for. */
  isHook: boolean;
  /** Entities detected in this beat's text that didn't win "primary visual" status — surfaced as small floating accents, capped at ACCENTS.maxPerBeat. */
  accents: AccentEntity[];
  narrativeRole: NarrativeRole;
  /** How many consecutive beats immediately before this one share the same visualType — drives layout alternation (e.g. TitleCard's center/edge). */
  repeatIndex: number;
  /** What topic this beat is actually about — selects a restrained, topic-matched ambient background motif. Orthogonal to visualType/narrativeRole. */
  domain: Domain;
  /** Which subject (a context object, or the primary scene) holds full visual weight at each point in the beat — see beat-choreography.ts. Single-stage (primary only, full duration) for short/simple beats. */
  focusTimeline: FocusStage[];
};

export type Beat =
  | (BeatBase & { visualType: "statement"; variant: BeatVariant })
  | (BeatBase & { visualType: "trend"; trend: ExtractedTrend })
  | (BeatBase & { visualType: "stat"; metric: ExtractedMetric })
  | (BeatBase & { visualType: "allocation"; allocation: ExtractedAllocation })
  | (BeatBase & { visualType: "comparison"; comparison: ExtractedComparison })
  | (BeatBase & { visualType: "risk"; severity: "caution" | "warning" })
  | (BeatBase & { visualType: "timeline"; timeline: ExtractedTimeline })
  | (BeatBase & { visualType: "asset"; asset: CryptoAsset });

export type BeatClassification =
  | { visualType: "statement"; variant: BeatVariant }
  | { visualType: "trend"; trend: ExtractedTrend }
  | { visualType: "stat"; metric: ExtractedMetric }
  | { visualType: "allocation"; allocation: ExtractedAllocation }
  | { visualType: "comparison"; comparison: ExtractedComparison }
  | { visualType: "risk"; severity: "caution" | "warning" }
  | { visualType: "timeline"; timeline: ExtractedTimeline }
  | { visualType: "asset"; asset: CryptoAsset };

/** A beat shorter than this reads as too quick to register as its own idea, and gets merged into a neighbor. */
export const MIN_BEAT_WORDS = 7;
/** A beat longer than this feels stale held on one visual, and gets split at its nearest natural pause. */
export const MAX_BEAT_WORDS = 16;

const DECIMAL_PLACEHOLDER = "@@DEC@@";

function protectDecimals(text: string): string {
  return text.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_PLACEHOLDER}`);
}

function restoreDecimals(text: string): string {
  return text.split(DECIMAL_PLACEHOLDER).join(".");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CONJUNCTION_PATTERN = /\s(but|so|while|because|although|however|yet|which)\s/gi;

/**
 * Try exactly one split at the sentence's nearest natural pause, trying
 * progressively less ideal break points:
 *   1. em/en dash, colon, semicolon
 *   2. the comma closest to the midpoint
 *   3. a coordinating conjunction ("but", "while", "because", ...) closest to the midpoint
 *   4. a hard fallback — split the word list at its midpoint
 * Tier 4 means this always returns two pieces for anything with >= 4 words
 * (the only caller only invokes it past MAX_BEAT_WORDS, which guarantees that).
 */
function splitOnce(sentence: string): string[] {
  const strongBreak = sentence.match(/\s[—–]\s|[:;]\s/);
  if (strongBreak?.index !== undefined) {
    const cut = strongBreak.index + strongBreak[0].length;
    const left = sentence.slice(0, cut).trim();
    const right = sentence.slice(cut).trim();
    if (left && right) return [left, right];
  }

  const midpoint = sentence.length / 2;

  const commaPositions: number[] = [];
  for (let i = 0; i < sentence.length; i++) {
    if (sentence[i] === ",") commaPositions.push(i);
  }
  if (commaPositions.length > 0) {
    const nearest = commaPositions.reduce((best, pos) =>
      Math.abs(pos - midpoint) < Math.abs(best - midpoint) ? pos : best,
    );
    const cut = nearest + 1;
    const left = sentence.slice(0, cut).trim();
    const right = sentence.slice(cut).trim();
    if (left && right) return [left, right];
  }

  const conjunctionMatches = [...sentence.matchAll(CONJUNCTION_PATTERN)];
  if (conjunctionMatches.length > 0) {
    const nearest = conjunctionMatches.reduce((best, match) => {
      const matchMid = (match.index ?? 0) + match[0].length / 2;
      const bestMid = (best.index ?? 0) + best[0].length / 2;
      return Math.abs(matchMid - midpoint) < Math.abs(bestMid - midpoint) ? match : best;
    });
    // Cut right after the leading space, so the conjunction itself leads the second half.
    const cut = (nearest.index ?? 0) + 1;
    const left = sentence.slice(0, cut).trim();
    const right = sentence.slice(cut).trim();
    if (left && right) return [left, right];
  }

  // Hard fallback: no punctuation or conjunction to anchor on — split the
  // word list at its midpoint rather than holding one long beat indefinitely.
  const words = sentence.split(" ");
  if (words.length >= 4) {
    const half = Math.ceil(words.length / 2);
    const left = words.slice(0, half).join(" ").trim();
    const right = words.slice(half).join(" ").trim();
    if (left && right) return [left, right];
  }

  return [sentence];
}

/**
 * Split a sentence at its natural pauses, recursively, until every resulting
 * piece is at or under MAX_BEAT_WORDS. A single dash/colon split can still
 * leave one half well over the limit (e.g. a long clause before the dash,
 * a short one after) — without recursing, that half would hold as one
 * static beat for the rest of its (long) allotted duration. Guaranteed to
 * terminate: splitOnce always shrinks any piece with >= 4 words, and
 * pieces under 4 words are always under MAX_BEAT_WORDS.
 */
function splitAtNaturalPause(sentence: string): string[] {
  if (wordCount(sentence) <= MAX_BEAT_WORDS) return [sentence];
  const pieces = splitOnce(sentence);
  if (pieces.length === 1) return pieces;
  return pieces.flatMap((piece) => splitAtNaturalPause(piece));
}

/** Sentence-split the narration, then split any overlong sentence at its natural pause. */
export function segmentClauses(narration: string): string[] {
  const normalized = protectDecimals(narration.trim().replace(/\s+/g, " "));
  const rawSentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const sentence of rawSentences) {
    if (wordCount(sentence) > MAX_BEAT_WORDS) {
      clauses.push(...splitAtNaturalPause(sentence));
    } else {
      clauses.push(sentence);
    }
  }
  return clauses.map(restoreDecimals);
}

/** Fold short connected clauses into a neighbor so they don't become throwaway half-second cuts. The hook (first clause) is exempt. */
export function mergeShortClauses(clauses: string[]): string[] {
  if (clauses.length === 0) return [];
  const [hook, ...rest] = clauses;
  const merged: string[] = [];
  let buffer = "";

  for (const clause of rest) {
    if (!buffer) {
      buffer = clause;
      continue;
    }
    const combinedWords = wordCount(buffer) + wordCount(clause);
    if (wordCount(buffer) < MIN_BEAT_WORDS && combinedWords <= MAX_BEAT_WORDS) {
      buffer = `${buffer} ${clause}`;
    } else {
      merged.push(buffer);
      buffer = clause;
    }
  }
  if (buffer) merged.push(buffer);

  return [hook, ...merged];
}

/** Turn narration into idea-sized editorial beats — not one-per-sentence. */
export function splitIntoBeats(narration: string): string[] {
  return mergeShortClauses(segmentClauses(narration));
}

/**
 * Deterministic small int derived from the script text — the same script
 * always produces the same seed, but different scripts land on different
 * values. Drives a bounded set of pre-approved stylistic variants (default
 * transition duration, accent slot layout, TitleCard's center/edge starting
 * phase, ambient "personality") so different videos don't all look
 * structurally identical, without introducing true randomness anywhere.
 */
export function computeVideoSeed(script: string): number {
  let hash = 0;
  for (let i = 0; i < script.length; i++) {
    hash = (hash * 33 + script.charCodeAt(i)) % 9973;
  }
  return hash;
}

/** Give each beat a share of the total duration proportional to its word count, with a floor and exact-sum reconciliation. */
export function allocateBeatDurations(
  beats: string[],
  totalDurationInFrames: number,
  minDurationInFrames: number = secondsToFrames(1.3),
): number[] {
  if (beats.length === 0) return [];

  const wordCounts = beats.map((beat) => Math.max(1, wordCount(beat)));
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const raw = wordCounts.map((count) => (count / totalWords) * totalDurationInFrames);
  const withFloor = raw.map((value) => Math.max(value, minDurationInFrames));

  const floorSum = withFloor.reduce((sum, value) => sum + value, 0);
  const scale = floorSum > totalDurationInFrames ? totalDurationInFrames / floorSum : 1;
  const scaled = withFloor.map((value) => value * scale);

  const rounded = scaled.map((value) => Math.max(1, Math.round(value)));
  const remainder = totalDurationInFrames - rounded.reduce((sum, value) => sum + value, 0);
  rounded[rounded.length - 1] = Math.max(1, rounded[rounded.length - 1] + remainder);

  return rounded;
}

/** How much of the total narration+disclaimer runtime the disclaimer gets — floor-protected so rounding never squeezes it unreadably short; script absorbs the remainder. */
export function splitScriptAndDisclaimerDurations({
  script,
  disclaimer,
  totalDurationInFrames,
  fps = DEFAULT_FPS,
  minDisclaimerDurationInSeconds = DISCLAIMER.minDurationInSeconds,
}: {
  script: string;
  disclaimer: string;
  totalDurationInFrames: number;
  fps?: number;
  minDisclaimerDurationInSeconds?: number;
}): { scriptDurationInFrames: number; disclaimerDurationInFrames: number } {
  const totalWords = Math.max(1, wordCount(script) + wordCount(disclaimer));
  const proportional = Math.round((wordCount(disclaimer) / totalWords) * totalDurationInFrames);
  const floor = secondsToFrames(minDisclaimerDurationInSeconds, fps);
  const disclaimerDurationInFrames = Math.min(
    Math.max(proportional, floor),
    Math.max(1, totalDurationInFrames - secondsToFrames(1.3, fps)), // script keeps >=1 beat's worth
  );
  return {
    scriptDurationInFrames: Math.max(1, totalDurationInFrames - disclaimerDurationInFrames),
    disclaimerDurationInFrames,
  };
}

const LABEL_STOPWORDS = new Set([
  "a", "an", "the", "is", "was", "were", "to", "at", "of", "for",
  "hit", "hits", "reached", "reaching", "crossed", "crossing",
  "just", "now", "it", "its", "up", "down", "by",
]);

function deriveLabel(text: string, matchIndex: number): string | undefined {
  const before = text.slice(0, matchIndex).trim();
  const words = before.split(/\s+/).filter(Boolean);
  const picked: string[] = [];
  for (let i = words.length - 1; i >= 0 && picked.length < 2; i--) {
    const word = words[i].replace(/[^a-zA-Z]/g, "");
    if (!word || LABEL_STOPWORDS.has(word.toLowerCase())) continue;
    picked.unshift(word);
  }
  return picked.length > 0 ? picked.join(" ") : undefined;
}

/** Find a single $/%/x claim in a sentence — first match wins ($ > % > x). Percent handles both digit ("12%") and word ("eighty percent") forms via entity-extraction's shared extractor. */
export function extractMetric(text: string): ExtractedMetric | null {
  const currency = text.match(/\$(\d[\d,]*(?:\.\d+)?)\s?(million|billion|thousand|[kKmMbB])?\b/);
  if (currency) {
    const value = parseFloat(currency[1].replace(/,/g, "")) * scaleFor(currency[2]);
    return { label: deriveLabel(text, currency.index ?? 0) ?? "Price", value };
  }

  const percentValue = extractPercent(text);
  if (percentValue !== null) {
    const matchIndex = findPercentMatchIndex(text) ?? 0;
    return { label: deriveLabel(text, matchIndex) ?? "Change", value: percentValue, suffix: "%" };
  }

  const multiplier = text.match(/\b(\d+(?:\.\d+)?)\s?[xX]\b/);
  if (multiplier) {
    const value = parseFloat(multiplier[1]);
    return { label: deriveLabel(text, multiplier.index ?? 0) ?? "Multiple", value, suffix: "x" };
  }

  return null;
}

const TREND_PATTERN =
  /from\s+\$?(\d[\d,]*(?:\.\d+)?)\s?(%|million|billion|thousand|[kKmMbB])?.{0,40}?\bto\s+\$?(\d[\d,]*(?:\.\d+)?)\s?(%|million|billion|thousand|[kKmMbB])?/i;

/** Find two connected numbers describing a move ("up from $40,000 to $65,000") and turn them into two chart points + % change. */
export function extractTrend(text: string): ExtractedTrend | null {
  const match = text.match(TREND_PATTERN);
  if (!match) return null;

  const startValue = parseFloat(match[1].replace(/,/g, "")) * scaleFor(match[2]);
  const endValue = parseFloat(match[3].replace(/,/g, "")) * scaleFor(match[4]);
  if (startValue === 0) return null;

  const changePercent = ((endValue - startValue) / startValue) * 100;
  const direction: "up" | "down" = endValue >= startValue ? "up" : "down";

  return {
    points: [
      { x: 0, y: startValue },
      { x: 1, y: endValue },
    ],
    changePercent,
    direction,
  };
}

const HIGH_INTENSITY_WORDS = [
  "breaking", "alert", "warning", "crash", "crashed", "crashing",
  "plunge", "plunged", "plunging", "panic", "collapse", "collapsed",
  "shock", "shocked", "shocking", "unprecedented",
];
const MEDIUM_INTENSITY_WORDS = [
  "record", "historic", "biggest", "massive", "milestone",
  "first-ever", "all-time", "remarkable", "unheard-of",
];

function buildWordListPattern(words: string[]): RegExp {
  return new RegExp(`\\b(${words.join("|")})\\b`, "i");
}

const HIGH_INTENSITY = buildWordListPattern(HIGH_INTENSITY_WORDS);
const MEDIUM_INTENSITY = buildWordListPattern(MEDIUM_INTENSITY_WORDS);

/** Whether a beat's wording matches the same dramatic-language list that drives the "decode" text-treatment — used by TrendChart to decide its glow intensity. */
export function isHighIntensity(text: string): boolean {
  return HIGH_INTENSITY.test(text);
}

/** Text treatment by emotional register, never by rotation. */
function classifyVariant(text: string, isHook: boolean): BeatVariant {
  if (HIGH_INTENSITY.test(text)) return "decode";
  if (isHook) return "sweep";
  if (MEDIUM_INTENSITY.test(text)) return "sweep";
  return "plain";
}

/** Primary-visual precedence: allocation > trend > comparison > risk > timeline > stat > asset > statement. */
export function classifyVisualType(text: string, isHook: boolean): BeatClassification {
  const allocation = extractAllocation(text);
  if (allocation) return { visualType: "allocation", allocation };

  const trend = extractTrend(text);
  if (trend) return { visualType: "trend", trend };

  const comparison = extractComparison(text);
  if (comparison) return { visualType: "comparison", comparison };

  if (RISK_WORDS.test(text)) {
    const severity: "caution" | "warning" = HIGH_INTENSITY.test(text) ? "warning" : "caution";
    return { visualType: "risk", severity };
  }

  const timeline = extractTimeline(text);
  if (timeline) return { visualType: "timeline", timeline };

  const metric = extractMetric(text);
  if (metric) return { visualType: "stat", metric };

  const assets = extractAssets(text);
  if (assets.length > 0) return { visualType: "asset", asset: assets[0] };

  return { visualType: "statement", variant: classifyVariant(text, isHook) };
}

/** Positional roles win outright, then marker-word roles in a fixed precedence, then a safe neutral fallback. Never called for the disclaimer beat, which is assigned "disclaimer" directly. */
export function classifyNarrativeRole(text: string, index: number, totalBeats: number): NarrativeRole {
  if (index === 0) return "hook";
  if (RISK_WORDS.test(text)) return "warning";
  if (COMPARISON_PATTERN.test(text)) return "comparison";
  if (EXAMPLE_MARKERS.test(text)) return "example";
  if (EVIDENCE_MARKERS.test(text)) return "evidence";
  if (OPPORTUNITY_WORDS.test(text)) return "payoff";
  if (index === totalBeats - 1) return "conclusion";
  return "explanation";
}

export type NarrativeStyle = {
  spring: SpringConfig;
  useLightLeak: boolean;
  glowBias: "normal" | "high";
  revealDelayMultiplier: number;
};

/** Editing language per narrative role — consulted by BeatFrame and every new scene component. Only hook/payoff ever trigger a light-leak, keeping it a genuine accent, not wallpaper. */
export const NARRATIVE_STYLES: Record<NarrativeRole, NarrativeStyle> = {
  hook: { spring: springBouncy, useLightLeak: true, glowBias: "high", revealDelayMultiplier: 0.8 },
  payoff: { spring: springBouncy, useLightLeak: true, glowBias: "high", revealDelayMultiplier: 0.8 },
  evidence: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1.2 },
  conclusion: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1.2 },
  explanation: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1 },
  comparison: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1.1 },
  warning: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1 },
  example: { spring: springSnappy, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 0.9 },
  // unused — DisclaimerCard skips held-reveal entirely, and BeatFrame's own intensity="muted" independently suppresses light-leak/accents.
  disclaimer: { spring: springSmooth, useLightLeak: false, glowBias: "normal", revealDelayMultiplier: 1 },
};

export function planBeats({
  narration,
  totalDurationInFrames,
  fps = DEFAULT_FPS,
  minBeatDurationInSeconds = 1.3,
}: {
  narration: string;
  totalDurationInFrames: number;
  fps?: number;
  minBeatDurationInSeconds?: number;
}): Beat[] {
  const texts = splitIntoBeats(narration);
  const minDurationInFrames = secondsToFrames(minBeatDurationInSeconds, fps);
  const durations = allocateBeatDurations(texts, totalDurationInFrames, minDurationInFrames);

  let cursor = 0;
  let previousVisualType: VisualType | null = null;
  let repeatIndex = 0;

  return texts.map((text, index) => {
    const durationInFrames = durations[index];
    const startFrame = cursor;
    cursor += durationInFrames;

    const isHook = index === 0;
    const classification = classifyVisualType(text, isHook);
    const narrativeRole = classifyNarrativeRole(text, index, texts.length);
    const accents = extractAccents(text, classification.visualType);
    const domain = classifyDomain(text);
    const focusTimeline = planFocusTimeline(text, accents, durationInFrames);

    repeatIndex = classification.visualType === previousVisualType ? repeatIndex + 1 : 0;
    previousVisualType = classification.visualType;

    const base = {
      text,
      durationInFrames,
      startFrame,
      isHook,
      accents,
      narrativeRole,
      repeatIndex,
      domain,
      focusTimeline,
    };

    switch (classification.visualType) {
      case "allocation":
        return { ...base, visualType: "allocation", allocation: classification.allocation };
      case "trend":
        return { ...base, visualType: "trend", trend: classification.trend };
      case "comparison":
        return { ...base, visualType: "comparison", comparison: classification.comparison };
      case "risk":
        return { ...base, visualType: "risk", severity: classification.severity };
      case "timeline":
        return { ...base, visualType: "timeline", timeline: classification.timeline };
      case "stat":
        return { ...base, visualType: "stat", metric: classification.metric };
      case "asset":
        return { ...base, visualType: "asset", asset: classification.asset };
      case "statement":
        return { ...base, visualType: "statement", variant: classification.variant };
      default: {
        const _exhaustive: never = classification;
        throw new Error(`Unhandled visualType: ${JSON.stringify(_exhaustive)}`);
      }
    }
  });
}
