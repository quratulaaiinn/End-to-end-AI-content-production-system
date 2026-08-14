import { interpolate, useCurrentFrame } from "remotion";
import { computeWordWindows } from "@/ui/lib/word-timing";

export type ReactiveWordsProps = {
  text: string;
  fontSize: number;
  fontWeight?: number;
  /** Baseline (non-active) word color. */
  color?: string;
  /** Color the currently "spoken" word eases toward. */
  activeColor?: string;
  /** Frame at which word-by-word emphasis begins — words before this stay at rest. */
  startFrame?: number;
  /** Total span the words are "spoken" over. Proportional per-word timing is estimated from this — if real word-level timestamps are ever available upstream, this component is the one place to swap the estimation for them. */
  durationInFrames: number;
  textAlign?: "center" | "left";
  lineHeight?: number;
};

// A small, extensible set of financially-loaded terms that read as slightly
// more emphatic than an ordinary word when they happen to be the active one —
// not a separate visual language, just a stronger dose of the same effect.
const EMPHASIS_WORDS =
  /^(bitcoin|ethereum|solana|ripple|xrp|cardano|dogecoin|tether|usdt|bnb|binance|risk|risky|profit|profits|growth|million|billion|percent|etf|etfs|crash|surge|portfolio|bull|bullish|bear|bearish|inflation|recession|rate|rates)$/i;

function stripPunctuation(word: string): string {
  return word.replace(/[^a-zA-Z0-9%]/g, "");
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const TRANSITION_FRAMES = 6;

/**
 * Word-by-word reactive text — the currently "spoken" word softly brightens,
 * scales up a touch, and gains weight, while the previous word eases back to
 * rest. Deliberately NOT karaoke: no hard color-block cut, no bounce — every
 * property (brightness, scale, weight) ramps continuously via interpolate(),
 * so it reads as a gentle guide for the eye, not a lyrics display.
 */
export const ReactiveWords: React.FC<ReactiveWordsProps> = ({
  text,
  fontSize,
  fontWeight = 500,
  color = "#a1a1aa",
  activeColor = "#fafafa",
  startFrame = 0,
  durationInFrames,
  textAlign = "center",
  lineHeight = 1.35,
}) => {
  const frame = useCurrentFrame();
  const windows = computeWordWindows(text, startFrame, durationInFrames);

  const baseRgb = hexToRgb(color);
  const activeRgb = hexToRgb(activeColor);

  return (
    <span style={{ display: "block", textAlign, lineHeight }}>
      {windows.map(({ word, start, end }, index) => {
        const activeProgress = interpolate(
          frame,
          [start - TRANSITION_FRAMES, start, end, end + TRANSITION_FRAMES],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const isEmphasis = EMPHASIS_WORDS.test(stripPunctuation(word));
        const boost = isEmphasis ? 1.4 : 1;

        const r = Math.round(interpolate(activeProgress, [0, 1], [baseRgb[0], activeRgb[0]]));
        const g = Math.round(interpolate(activeProgress, [0, 1], [baseRgb[1], activeRgb[1]]));
        const b = Math.round(interpolate(activeProgress, [0, 1], [baseRgb[2], activeRgb[2]]));
        const scale = 1 + activeProgress * 0.09 * boost;
        const brightness = 1 + activeProgress * 0.3 * boost;
        const weight = activeProgress > 0.5 ? Math.min(700, fontWeight + 150) : fontWeight;
        const glow =
          activeProgress > 0.05
            ? `drop-shadow(0 0 ${Math.round(6 * activeProgress * boost)}px ${activeColor}66)`
            : undefined;
        // Thin animated underline draws in under the active word and eases
        // back out with it — a quieter, non-karaoke reveal cue layered on
        // top of the glow/scale/weight ramp, not a replacement for them.
        const underlineWidth = interpolate(activeProgress, [0, 0.4, 1], [0, 1, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <span
            key={index}
            style={{
              position: "relative",
              display: "inline-block",
              fontSize,
              fontWeight: weight,
              color: `rgb(${r}, ${g}, ${b})`,
              filter: glow ? `brightness(${brightness}) ${glow}` : `brightness(${brightness})`,
              transform: `scale(${scale})`,
              transformOrigin: "center bottom",
              marginRight: "0.28em",
            }}
          >
            {word}
            {activeProgress > 0.02 ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: -fontSize * 0.08,
                  height: 2,
                  width: `${underlineWidth * 100}%`,
                  background: activeColor,
                  opacity: activeProgress * 0.55,
                  borderRadius: 1,
                }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
};
