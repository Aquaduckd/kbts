import type { LayoutMap } from "../geometry/LayoutMap.js";
import type { Rect } from "../geometry/Rect.js";
import type { LayoutTree } from "../model/LayoutTree.js";

export type FocusDirection = "left" | "right" | "up" | "down";

export class FocusManager {
  focusPanel(tree: LayoutTree, panelId: string): LayoutTree {
    return tree.focusPanel(panelId);
  }

  focusNeighbor(
    tree: LayoutTree,
    layout: LayoutMap,
    direction: FocusDirection,
  ): LayoutTree {
    if (!tree.focusedPanelId) {
      return tree;
    }

    const origin = layout.getPanelRect(tree.focusedPanelId);
    if (!origin) {
      return tree;
    }

    const originCenter = {
      x: origin.x + origin.width / 2,
      y: origin.y + origin.height / 2,
    };

    let best: { id: string; distance: number } | null = null;

    for (const panel of tree.getPanels()) {
      if (panel.id === tree.focusedPanelId) {
        continue;
      }

      const rect = layout.getPanelRect(panel.id);
      if (!rect) {
        continue;
      }

      const center = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };

      const dx = center.x - originCenter.x;
      const dy = center.y - originCenter.y;

      const matches =
        (direction === "left" &&
          dx < 0 &&
          overlapsVertically(origin, rect)) ||
        (direction === "right" &&
          dx > 0 &&
          overlapsVertically(origin, rect)) ||
        (direction === "up" &&
          dy < 0 &&
          overlapsHorizontally(origin, rect)) ||
        (direction === "down" &&
          dy > 0 &&
          overlapsHorizontally(origin, rect));

      if (!matches) {
        continue;
      }

      const distance = primaryDistance(origin, rect, direction);
      if (!best || distance < best.distance) {
        best = { id: panel.id, distance };
      }
    }

    return best ? tree.focusPanel(best.id) : tree;
  }
}

function overlapsVertically(a: Rect, b: Rect): boolean {
  return Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

function overlapsHorizontally(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
}

function primaryDistance(
  origin: Rect,
  candidate: Rect,
  direction: FocusDirection,
): number {
  switch (direction) {
    case "left":
      return origin.x - (candidate.x + candidate.width);
    case "right":
      return candidate.x - (origin.x + origin.width);
    case "up":
      return origin.y - (candidate.y + candidate.height);
    case "down":
      return candidate.y - (origin.y + origin.height);
  }
}
