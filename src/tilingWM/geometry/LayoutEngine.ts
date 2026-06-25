import { LayoutMap } from "./LayoutMap.js";
import { Rect } from "./Rect.js";
import type { LayoutNode } from "../model/LayoutNode.js";
import { Panel } from "../model/Panel.js";
import { Split } from "../model/Split.js";

export interface LayoutEngineOptions {
  gutterSize?: number;
}

export class LayoutEngine {
  readonly gutterSize: number;

  constructor(options: LayoutEngineOptions = {}) {
    this.gutterSize = options.gutterSize ?? 6;
  }

  compute(root: LayoutNode, bounds: Rect): LayoutMap {
    const map = new LayoutMap();
    this.layoutNode(root, bounds, map);
    return map;
  }

  private layoutNode(node: LayoutNode, bounds: Rect, map: LayoutMap): void {
    if (node instanceof Panel) {
      map.panels.set(node.id, bounds);
      return;
    }

    if (node instanceof Split) {
      const parts =
        node.direction === "horizontal"
          ? bounds.splitHorizontal(node.ratio, this.gutterSize)
          : bounds.splitVertical(node.ratio, this.gutterSize);

      map.gutters.set(node.id, parts.gutter);
      this.layoutNode(node.first, parts.first, map);
      this.layoutNode(node.second, parts.second, map);
    }
  }
}
