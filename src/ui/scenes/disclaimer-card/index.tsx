import { loadFont } from "@remotion/google-fonts/Inter";
import { fitTextOnNLines } from "@remotion/layout-utils";
import { GraduationCap } from "lucide-react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { DURATION, EASING } from "@/ui/lib/timing";
import { GlassPanel } from "@/ui/primitives/glass-panel";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "600"],
  subsets: ["latin"],
});

export type DisclaimerCardProps = {
  text: string;
  backgroundColor?: string;
  mutedColor?: string;
  accentColor?: string;
  badgeLabel?: string;
};

const COLORS = {
  muted: "#a1a1aa",
  badge: "#71717a",
} as const;

const FONT_WEIGHT = 500;

/**
 * Always the final beat — deliberately the quietest scene in the video, but
 * composed with the same design language as everything before it (centered
 * safe-area layout, a thin accent bar echoing TitleCard's motif, a single
 * calm settle-in) rather than reading as an afterthought. No spring, no
 * stagger, no held-reveal, no light-leak — mounted by the composition inside
 * BeatFrame(intensity="muted"), which independently suppresses accents and
 * dampens ambient motion. De-emphasis enforced at two levels, not left to
 * this scene alone.
 */
export const DisclaimerCard: React.FC<DisclaimerCardProps> = ({
  text,
  backgroundColor = "#080810",
  mutedColor = COLORS.muted,
  accentColor = "#e8b86d",
  badgeLabel = "Educational Content",
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });

  // One slow, calm settle — no bounce, no stagger. Longer than the standard
  // DURATION.fast so it reads as deliberate, not a quick flash.
  const progress = interpolate(frame, [0, DURATION.normal], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const maxBoxWidth = width - safeArea.paddingLeft - safeArea.paddingRight - scaleFont(140, width);
  const { fontSize, lines } = fitTextOnNLines({
    text,
    maxLines: 3,
    maxBoxWidth,
    fontFamily,
    fontWeight: FONT_WEIGHT,
    maxFontSize: scaleFont(38, width),
  });

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        fontFamily,
      }}
    >
      <div
        style={{
          opacity: progress,
          transform: `scale(${0.96 + progress * 0.04}) translateY(${(1 - progress) * 14}px)`,
        }}
      >
        <GlassPanel
          intensity="muted"
          accentColor={accentColor}
          padding={40}
          borderRadius={28}
          style={{
            border: `1px solid ${accentColor}55`,
            boxShadow: `0 0 ${scaleFont(28, width)}px ${accentColor}40, 0 0 1px ${accentColor}88, inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: scaleFont(20, width),
              maxWidth: scaleFont(720, width),
            }}
          >
            <div
              style={{
                width: scaleFont(48, width),
                height: scaleFont(3, width),
                borderRadius: 999,
                backgroundColor: `${accentColor}99`,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: scaleFont(10, width) }}>
              <GraduationCap size={scaleFont(24, width)} color={COLORS.badge} />
              <span
                style={{
                  fontSize: scaleFont(21, width),
                  color: COLORS.badge,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {badgeLabel}
              </span>
            </div>
            <div style={{ textAlign: "center" }}>
              {lines.map((line, index) => (
                <p
                  key={index}
                  style={{
                    fontSize,
                    fontWeight: FONT_WEIGHT,
                    color: mutedColor,
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
