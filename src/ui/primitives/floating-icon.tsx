import type { ComponentType } from "react";
import { useCurrentFrame } from "remotion";
import { enterProgress } from "@/ui/lib/timing";

export type FloatingIconProps = {
  icon: ComponentType<{ size?: number | string; color?: string }>;
  /** When set, renders as a small labeled glass chip (icon + text) instead of a bare icon — the default treatment, so a viewer can identify the topic even muted. */
  label?: string;
  size?: number;
  color?: string;
  delayInFrames?: number;
  /** Absolute px position within the containing frame. */
  x: number;
  y: number;
  /** When set (0-1), replaces the delay-based one-shot entrance with a continuous lifecycle weight — driven by beat-choreography's focus timeline instead of a fixed fade-in. */
  weight?: number;
  /** Upward drift while exiting (beat-choreography's "Exiting" state) — 0 the rest of the lifecycle. */
  driftY?: number;
};

/**
 * Small icon (optionally labeled). Enters, holds still, exits — deliberately
 * no continuous bob/rotate while holding; a stable object reads as more
 * premium than one that's constantly wobbling, and it keeps a single held
 * object from visually competing with the text around it.
 */
export const FloatingIcon: React.FC<FloatingIconProps> = ({
  icon: Icon,
  label,
  size = 40,
  color = "#e8b86d",
  delayInFrames = 0,
  x,
  y,
  weight,
  driftY = 0,
}) => {
  const frame = useCurrentFrame();
  const entrance = weight ?? enterProgress(frame, delayInFrames, 16);
  const settleY = -(1 - entrance) * 14 + driftY;

  if (label) {
    return (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity: entrance,
          transform: `translate(-50%, -50%) translateY(${settleY}px) scale(${0.85 + entrance * 0.15})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: size * 0.2,
            padding: `${size * 0.22}px ${size * 0.34}px ${size * 0.22}px ${size * 0.22}px`,
            borderRadius: 999,
            background: "rgba(12,16,28,0.72)",
            border: "1px solid rgba(161,161,170,0.22)",
            boxShadow: `0 0 ${size * 0.5}px ${color}33`,
            whiteSpace: "nowrap",
          }}
        >
          <Icon size={size * 0.5} color={color} />
          <span style={{ fontSize: size * 0.42, color: "#e4e4e7", fontWeight: 600 }}>{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: entrance,
        transform: `translate(-50%, -50%) translateY(${settleY}px) scale(${0.85 + entrance * 0.15})`,
      }}
    >
      <Icon size={size} color={color} />
    </div>
  );
};
