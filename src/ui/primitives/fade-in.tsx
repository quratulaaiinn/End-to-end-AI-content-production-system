import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { MotionWrapper } from "@/ui/lib/motion-wrapper";
import { enterProgress } from "@/ui/lib/timing";

export type FadeInProps = {
  children: ReactNode;
  durationInFrames?: number;
  delayInFrames?: number;
};

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  durationInFrames = 30,
  delayInFrames = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = enterProgress(frame, delayInFrames, durationInFrames);

  return <MotionWrapper style={{ opacity }}>{children}</MotionWrapper>;
};
