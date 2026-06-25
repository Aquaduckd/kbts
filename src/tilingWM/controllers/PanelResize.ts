import type { Rect } from "../geometry/Rect.js";
import type { LayoutNode } from "../model/LayoutNode.js";
import type { LayoutTree } from "../model/LayoutTree.js";
import { Panel } from "../model/Panel.js";
import { Split, clampRatio, type SplitDirection } from "../model/Split.js";
import type { FocusDirection } from "./FocusManager.js";

const RESIZE_STEP_PX = 20;

export function resizeFocusedPanel(
  tree: LayoutTree,
  panelId: string,
  direction: FocusDirection,
  bounds: Rect,
  gutterSize: number,
): LayoutTree | null {
  const target = findResizeTarget(tree, panelId, direction);
  if (!target) {
    return null;
  }

  const { split, focusedInFirst } = target;
  const expand = shouldExpandFocused(direction, focusedInFirst);
  const axisSize = Math.max(
    (split.direction === "horizontal"
      ? bounds.width
      : bounds.height) - gutterSize,
    1,
  );
  const deltaRatio = RESIZE_STEP_PX / axisSize;

  let ratio = split.ratio;
  if (focusedInFirst) {
    ratio = expand ? ratio + deltaRatio : ratio - deltaRatio;
  } else {
    ratio = expand ? ratio - deltaRatio : ratio + deltaRatio;
  }

  const minFirst = minChildSize(split.first, split.direction);
  const minSecond = minChildSize(split.second, split.direction);
  const minRatio = minFirst / axisSize;
  const maxRatio = 1 - minSecond / axisSize;

  const nextRatio = clampRatio(Math.min(maxRatio, Math.max(minRatio, ratio)));
  if (nextRatio === split.ratio) {
    return null;
  }

  return tree.setSplitRatio(split.id, nextRatio);
}

function findResizeTarget(
  tree: LayoutTree,
  panelId: string,
  direction: FocusDirection,
): { split: Split; focusedInFirst: boolean } | null {
  let currentId = panelId;

  while (true) {
    const location = tree.locate(currentId);
    if (!location?.parent) {
      return null;
    }

    const split = location.parent;
    if (splitMatchesDirection(split.direction, direction)) {
      return {
        split,
        focusedInFirst: containsPanel(split.first, panelId),
      };
    }

    currentId = split.id;
  }
}

function splitMatchesDirection(
  splitDirection: SplitDirection,
  direction: FocusDirection,
): boolean {
  return (
    (splitDirection === "horizontal" &&
      (direction === "left" || direction === "right")) ||
    (splitDirection === "vertical" &&
      (direction === "up" || direction === "down"))
  );
}

function shouldExpandFocused(
  direction: FocusDirection,
  focusedInFirst: boolean,
): boolean {
  if (focusedInFirst) {
    return direction === "right" || direction === "down";
  }

  return direction === "left" || direction === "up";
}

function containsPanel(node: LayoutNode, panelId: string): boolean {
  if (node instanceof Panel) {
    return node.id === panelId;
  }

  if (node instanceof Split) {
    return containsPanel(node.first, panelId) || containsPanel(node.second, panelId);
  }

  return false;
}

function minChildSize(node: LayoutNode, direction: SplitDirection): number {
  if (node instanceof Panel) {
    return direction === "horizontal" ? node.minWidth : node.minHeight;
  }

  if (node instanceof Split) {
    return direction === "horizontal" ? 120 : 80;
  }

  return direction === "horizontal" ? 120 : 80;
}
