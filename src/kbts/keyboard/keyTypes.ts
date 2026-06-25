export type KeyFinger = "pinky" | "ring" | "middle" | "index" | "thumb";
export type KeyHand = "left" | "right";

export interface KeyOverride {
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
  finger?: KeyFinger;
  hand?: KeyHand;
}
