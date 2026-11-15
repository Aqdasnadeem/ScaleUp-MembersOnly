import { Composition } from "remotion";
import ScaleUpWalkthrough from "./ScaleUpWalkthrough";

export const RemotionRoot = () => (
  <Composition
    id="ScaleUpWalkthrough"
    component={ScaleUpWalkthrough}
    durationInFrames={40 * 30}
    fps={30}
    width={1920}
    height={1080}
  />
);
