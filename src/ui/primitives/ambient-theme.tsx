import { noise3D } from "@remotion/noise";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { Domain } from "@/ui/lib/entity-extraction";
import { GridBackground } from "./grid-background";

export type AmbientThemeProps = {
  domain: Domain;
  accentColor: string;
  /** Unique per beat — same seed AmbientBackground/BeatFrame already use, so motif layout stays deterministic. */
  seed: string;
};

type MotifProps = { accentColor: string; seed: string };

/** The shared grid background + a strip of procedural candlestick silhouettes — crypto/stocks. */
const TradingGridMotif: React.FC<MotifProps> = ({ accentColor, seed }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const barCount = 12;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <GridBackground accentColor={accentColor} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: height * 0.16,
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {Array.from({ length: barCount }, (_, i) => {
          const n = noise3D(`${seed}-candle-${i}`, 0, 0, frame * 0.01);
          const barHeight = 8 + Math.abs(n) * (height * 0.11);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: barHeight,
                background: n >= 0 ? "#2dd4bf" : "#fb7185",
                opacity: 0.1,
                borderRadius: 2,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const NODE_COUNT = 7;

/** A handful of seeded nodes connected to their nearest neighbor — ai/technology. */
const NetworkMotif: React.FC<MotifProps> = ({ accentColor, seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
    x: random(`${seed}-node-x-${i}`) * width,
    y: random(`${seed}-node-y-${i}`) * height,
  }));

  const edges = nodes.map((node, i) => {
    let nearest = 0;
    let nearestDist = Infinity;
    nodes.forEach((other, j) => {
      if (i === j) return;
      const dist = (node.x - other.x) ** 2 + (node.y - other.y) ** 2;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = j;
      }
    });
    return [i, nearest] as const;
  });

  const pulse = 1.4 + Math.sin(frame / 40) * 0.6;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={accentColor}
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}
        {nodes.map((node, i) => (
          <circle key={i} cx={node.x} cy={node.y} r={pulse} fill={accentColor} opacity={0.12} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** 1-2 faint glass-outline widget shapes in the margins, no moving parts beyond the particle layer above it — business/economy. */
const DashboardMotif: React.FC<MotifProps> = ({ accentColor, seed }) => {
  const { width, height } = useVideoConfig();

  const widgets = [
    { xRatio: random(`${seed}-dash-x-0`) * 0.14 + 0.06, yRatio: random(`${seed}-dash-y-0`) * 0.14 + 0.08, w: 108, h: 68 },
    {
      xRatio: 0.82 - random(`${seed}-dash-x-1`) * 0.12,
      yRatio: 0.8 - random(`${seed}-dash-y-1`) * 0.12,
      w: 96,
      h: 58,
    },
  ];

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {widgets.map((widget, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: widget.xRatio * width,
            top: widget.yRatio * height,
            width: widget.w,
            height: widget.h,
            border: `1px solid ${accentColor}22`,
            borderRadius: 10,
            opacity: 0.5,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/**
 * The lowest-weight rung of the hierarchy — restrained, topic-matched
 * background texture that never brightens or pulses to compete with the
 * foreground. Renders underneath AmbientBackground's particle field
 * (untouched). The shared GridBackground gives finance/crypto/stocks/
 * technology/AI content a common structural depth cue; business/economy
 * keep their distinct dashboard-widget look instead. "general" still gets a
 * very restrained grid rather than nothing, since most beats land here.
 */
export const AmbientTheme: React.FC<AmbientThemeProps> = ({ domain, accentColor, seed }) => {
  switch (domain) {
    case "crypto":
    case "stocks":
      return <TradingGridMotif accentColor={accentColor} seed={seed} />;
    case "ai":
    case "technology":
      return (
        <>
          <GridBackground accentColor={accentColor} />
          <NetworkMotif accentColor={accentColor} seed={seed} />
        </>
      );
    case "business":
    case "economy":
      return <DashboardMotif accentColor={accentColor} seed={seed} />;
    case "general":
      return <GridBackground accentColor={accentColor} opacity={0.035} />;
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
};
