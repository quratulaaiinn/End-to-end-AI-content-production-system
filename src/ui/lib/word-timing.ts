export type WordWindow = { word: string; start: number; end: number };

/**
 * Proportional per-word frame windows, weighted by character length (+ a
 * constant floor so short words like "a"/"is" still get a readable window) —
 * the same "estimate proportionally, no real timestamps" philosophy already
 * used for beat-level duration allocation, just at word granularity. Shared
 * by ReactiveWords (rendering) and the beat-choreography focus timeline (so a
 * context object's focus lands on the exact frame its name is "spoken").
 */
export function computeWordWindows(
  text: string,
  startFrame: number,
  durationInFrames: number,
): WordWindow[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((word) => word.length + 3);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

  let cursor = startFrame;
  return words.map((word, index) => {
    const span = (weights[index] / totalWeight) * durationInFrames;
    const start = cursor;
    cursor += span;
    return { word, start, end: cursor };
  });
}
