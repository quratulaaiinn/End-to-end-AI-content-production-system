import { loadFont } from "@remotion/google-fonts/Inter";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveIcon } from "@/ui/lib/icon-registry";
import { LightSweepText } from "@/ui/primitives/light-sweep-text";
import { MatrixDecode } from "@/ui/primitives/matrix-decode";
import { ReactiveWords } from "@/ui/primitives/reactive-words";
import { getSafeAreaPadding, scaleFont } from "@/ui/lib/layout";
import { DELAY, DURATION, EASING } from "@/ui/lib/timing";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export type TitleCardVariant = "plain" | "sweep" | "decode";

export type TitleCardProps = {
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  accentColor?: string;
  /** Text treatment for the headline — defaults to a plain spring-in heading. */
  variant?: TitleCardVariant;
  /** Icon-registry key (brand logo or topic icon) for the entity/topic this beat is actually about — resolved by the composition from the beat's own accents/domain. Renders as a calm, centered hero symbol above the title; omitted when the beat has no real entity signal, so plain connective sentences stay plain. */
  heroIcon?: string;
  /** On-screen duration of this beat — used to pace the "plain" variant's word-by-word reactive emphasis. */
  durationInFrames?: number;
};

const COLORS = {
  bg: "#080810",
  title: "#fafafa",
  subtitle: "#71717a",
  accent: "#e8b86d",
  glow: "rgba(232,184,109,0.22)",
} as const;

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  backgroundColor = COLORS.bg,
  accentColor = COLORS.accent,
  variant = "plain",
  heroIcon,
  durationInFrames = 90,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const safeArea = getSafeAreaPadding({ width, height });
  const barWidth = scaleFont(72, width);
  const HeroIcon = heroIcon ? resolveIcon(heroIcon) : null;

  const barDraw = interpolate(frame, [0, DURATION.fast], [0, 1], {
    easing: EASING.enter,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // The hero icon leads the reveal — it establishes what the beat is about a
  // beat before the title text confirms it, the same "setup lands, payoff
  // follows" anticipation used everywhere else in this project.
  const iconEnter = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 130, mass: 0.8 },
  });
  const titleEnter = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.85 },
    delay: DELAY.short,
  });
  const subtitleEnter = interpolate(
    frame,
    [DELAY.medium, DELAY.medium + DURATION.fast],
    [0, 1],
    {
      easing: EASING.enter,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        width,
        height,
        backgroundColor,
        paddingLeft: safeArea.paddingLeft,
        paddingRight: safeArea.paddingRight,
        paddingTop: safeArea.paddingTop,
        paddingBottom: safeArea.paddingBottom,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 90% 30% at 50% 0%, ${accentColor}14, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "52%",
          height: "52%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.glow} 0%, transparent 72%)`,
          filter: `blur(${scaleFont(48, width)}px)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, transparent 60%, ${accentColor}12 100%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: scaleFont(24, width),
          maxWidth: "88%",
          textAlign: "center",
          position: "relative",
        }}
      >
        {HeroIcon ? (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: iconEnter,
              transform: `scale(${0.82 + iconEnter * 0.18})`,
            }}
          >
            <div
              style={{
                position: "absolute",
                width: scaleFont(150, width),
                height: scaleFont(150, width),
                borderRadius: "50%",
                background: `radial-gradient(circle, ${accentColor}3d 0%, transparent 72%)`,
                pointerEvents: "none",
              }}
            />
            <HeroIcon size={scaleFont(76, width)} color={accentColor} />
          </div>
        ) : null}
        <div
          style={{
            width: barWidth * barDraw,
            height: scaleFont(4, width),
            borderRadius: 999,
            backgroundColor: accentColor,
            boxShadow: `0 0 ${scaleFont(20, width)}px ${accentColor}66`,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: scaleFont(16, width),
          }}
        >
          <h1
            style={{
              color: COLORS.title,
              fontSize: scaleFont(84, width),
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              opacity: Math.min(1, titleEnter),
              transform: `translateY(${(1 - titleEnter) * 28}px) scale(${0.94 + titleEnter * 0.06})`,
            }}
          >
            {variant === "sweep" ? (
              <LightSweepText
                text={title}
                fontSize={scaleFont(84, width)}
                fontWeight={700}
                fontFamily={fontFamily}
              />
            ) : variant === "decode" ? (
              <MatrixDecode
                text={title}
                fontSize={scaleFont(84, width)}
                fontWeight={700}
                fontFamily={fontFamily}
              />
            ) : (
              // "plain" only — sweep/decode already animate their own text
              // internally, layering word-reactive glow on top would compete.
              <ReactiveWords
                text={title}
                fontSize={scaleFont(84, width)}
                fontWeight={700}
                color="#d4d4d8"
                activeColor="#ffffff"
                startFrame={DELAY.short}
                durationInFrames={Math.max(30, durationInFrames - DELAY.short * 2)}
                lineHeight={1.05}
              />
            )}
          </h1>
          {subtitle ? (
            <p
              style={{
                color: COLORS.subtitle,
                fontSize: scaleFont(36, width),
                margin: 0,
                lineHeight: 1.35,
                fontWeight: 500,
                opacity: subtitleEnter,
                transform: `translateY(${(1 - subtitleEnter) * 16}px)`,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
