import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CryptoAsset } from "@/ui/lib/entity-extraction";
import { resolveIcon } from "@/ui/lib/icon-registry";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { DELAY, DURATION } from "@/ui/lib/timing";
import { FloatingIcon } from "@/ui/primitives/floating-icon";
import { GlassPanel } from "@/ui/primitives/glass-panel";

export type AssetCardProps = {
  asset: CryptoAsset;
  /** Narration text — shown only when size="primary". */
  label?: string;
  size?: "primary" | "accent";
  accentColor?: string;
  backgroundColor?: string;
  /** Accent mode only — absolute px position within the containing frame. */
  x?: number;
  y?: number;
  delayInFrames?: number;
};

const COLORS = {
  bg: "#080810",
  label: "#a1a1aa",
  title: "#fafafa",
} as const;

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  label,
  size = "primary",
  accentColor = "#e8b86d",
  backgroundColor = COLORS.bg,
  x = 0,
  y = 0,
  delayInFrames = 0,
}) => {
  const Icon = resolveIcon(asset.iconSlug);
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const cardProgress = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.85 },
    delay: DELAY.short,
    durationInFrames: DURATION.normal,
  });
  // Held reveal: the symbol lands a beat after the card/icon are already on screen.
  const symbolProgress = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 130, mass: 0.8 },
    delay: DELAY.short + DELAY.reveal,
    durationInFrames: DURATION.normal,
  });

  if (size === "accent") {
    return (
      <FloatingIcon
        icon={Icon}
        label={asset.symbol}
        size={36}
        color={accentColor}
        delayInFrames={delayInFrames}
        x={x}
        y={y}
      />
    );
  }

  const safeArea = getSafeAreaPadding({ width, height });

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
      }}
    >
      <div
        style={{
          opacity: cardProgress,
          transform: `translateY(${(1 - cardProgress) * 24}px) scale(${0.94 + cardProgress * 0.06})`,
        }}
      >
        <GlassPanel accentColor={accentColor} padding={48} borderRadius={32}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: scaleFont(20, width),
              maxWidth: scaleFont(640, width),
            }}
          >
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div
                style={{
                  position: "absolute",
                  width: scaleFont(160, width),
                  height: scaleFont(160, width),
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${accentColor}3d 0%, transparent 72%)`,
                  opacity: 0.75 + Math.sin(frame / 26) * 0.25,
                  pointerEvents: "none",
                }}
              />
              <Icon size={scaleFont(96, width)} color={accentColor} />
            </div>
            <div
              style={{
                fontSize: scaleFont(56, width),
                fontWeight: 700,
                color: COLORS.title,
                letterSpacing: "-0.02em",
                opacity: symbolProgress,
                transform: `translateY(${(1 - symbolProgress) * 10}px)`,
              }}
            >
              {asset.symbol}
            </div>
            {label ? (
              <div
                style={{
                  fontSize: scaleFont(32, width),
                  color: COLORS.label,
                  textAlign: "center",
                  lineHeight: 1.35,
                }}
              >
                {label}
              </div>
            ) : null}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
