import type { LayoutTree } from "../model/LayoutTree.js";
import { Panel } from "../model/Panel.js";
import { Split, clampRatio, type SplitDirection } from "../model/Split.js";
import type { Rect } from "../geometry/Rect.js";

interface DragSession {
  splitId: string;
  direction: SplitDirection;
  startRatio: number;
  startPointer: number;
  axisSize: number;
  minFirst: number;
  minSecond: number;
}

export class DragController {
  private session: DragSession | null = null;

  startDrag(
    tree: LayoutTree,
    splitId: string,
    bounds: Rect,
    clientX: number,
    clientY: number,
    gutterSize: number,
  ): void {
    const split = tree.findNode(splitId);
    if (!(split instanceof Split)) {
      return;
    }

    const axisSize =
      split.direction === "horizontal"
        ? bounds.width - gutterSize
        : bounds.height - gutterSize;

    this.session = {
      splitId,
      direction: split.direction,
      startRatio: split.ratio,
      startPointer: split.direction === "horizontal" ? clientX : clientY,
      axisSize: Math.max(axisSize, 1),
      minFirst: this.minChildSize(split.first, split.direction),
      minSecond: this.minChildSize(split.second, split.direction),
    };
  }

  drag(clientX: number, clientY: number): number | null {
    if (!this.session) {
      return null;
    }

    const pointer =
      this.session.direction === "horizontal" ? clientX : clientY;
    const deltaRatio = (pointer - this.session.startPointer) / this.session.axisSize;
    const minRatio = this.session.minFirst / this.session.axisSize;
    const maxRatio = 1 - this.session.minSecond / this.session.axisSize;

    return clampRatio(
      Math.min(maxRatio, Math.max(minRatio, this.session.startRatio + deltaRatio)),
    );
  }

  endDrag(): void {
    this.session = null;
  }

  private minChildSize(
    node: LayoutTree["root"],
    direction: SplitDirection,
  ): number {
    if (node instanceof Panel) {
      return direction === "horizontal" ? node.minWidth : node.minHeight;
    }

    return direction === "horizontal" ? 120 : 80;
  }
}
