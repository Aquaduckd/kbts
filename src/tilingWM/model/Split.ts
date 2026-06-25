import { LayoutNode } from "./LayoutNode.js";

export type SplitDirection = "horizontal" | "vertical";

export class Split extends LayoutNode {
  constructor(
    id: string,
    readonly direction: SplitDirection,
    readonly ratio: number,
    readonly first: LayoutNode,
    readonly second: LayoutNode,
  ) {
    super(id);
  }

  withRatio(ratio: number): Split {
    return new Split(
      this.id,
      this.direction,
      clampRatio(ratio),
      this.first,
      this.second,
    );
  }

  withChild(
    which: "first" | "second",
    child: LayoutNode,
  ): Split {
    return which === "first"
      ? new Split(this.id, this.direction, this.ratio, child, this.second)
      : new Split(this.id, this.direction, this.ratio, this.first, child);
  }
}

export function clampRatio(ratio: number): number {
  return Math.min(0.95, Math.max(0.05, ratio));
}
