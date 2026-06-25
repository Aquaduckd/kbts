import { createId } from "./id.js";
import { LayoutNode } from "./LayoutNode.js";
import { Panel } from "./Panel.js";
import { Split, type SplitDirection } from "./Split.js";

export interface NodeLocation {
  node: LayoutNode;
  parent: Split | null;
  childKey: "root" | "first" | "second";
}

export class LayoutTree {
  constructor(
    public root: LayoutNode,
    public focusedPanelId: string | null = null,
  ) {
    const firstPanel = this.findFirstPanel(root);
    if (firstPanel && !focusedPanelId) {
      this.focusedPanelId = firstPanel.id;
    }
  }

  static withPanel(contentType: string, title?: string): LayoutTree {
    const panel = new Panel(
      createId("panel"),
      title ?? contentType,
      contentType,
    );
    return new LayoutTree(panel, panel.id);
  }

  getPanels(): Panel[] {
    const panels: Panel[] = [];
    this.walk(this.root, (node) => {
      if (node instanceof Panel) {
        panels.push(node);
      }
    });
    return panels;
  }

  findPanel(panelId: string): Panel | null {
    const node = this.findNode(panelId);
    return node instanceof Panel ? node : null;
  }

  findNode(nodeId: string): LayoutNode | null {
    return this.locate(nodeId)?.node ?? null;
  }

  locate(nodeId: string): NodeLocation | null {
    const walk = (
      node: LayoutNode,
      parent: Split | null,
      childKey: "root" | "first" | "second",
    ): NodeLocation | null => {
      if (node.id === nodeId) {
        return { node, parent, childKey };
      }

      if (node instanceof Split) {
        return (
          walk(node.first, node, "first") ?? walk(node.second, node, "second")
        );
      }

      return null;
    };

    return walk(this.root, null, "root");
  }

  focusPanel(panelId: string): LayoutTree {
    if (!(this.findPanel(panelId) instanceof Panel)) {
      return this;
    }

    return new LayoutTree(this.root, panelId);
  }

  splitPanel(
    panelId: string,
    direction: SplitDirection,
    contentType: string,
    title?: string,
  ): LayoutTree {
    const location = this.locate(panelId);
    if (!location || !(location.node instanceof Panel)) {
      return this;
    }

    const newPanel = new Panel(
      createId("panel"),
      title ?? contentType,
      contentType,
    );
    const split = new Split(
      createId("split"),
      direction,
      0.5,
      location.node,
      newPanel,
    );
    const root = this.replaceNode(this.root, panelId, split);

    return new LayoutTree(root, newPanel.id);
  }

  attachPanel(
    panel: Panel,
    targetPanelId: string,
    direction: SplitDirection,
  ): LayoutTree {
    const location = this.locate(targetPanelId);
    if (!location || !(location.node instanceof Panel)) {
      return this;
    }

    const split = new Split(
      createId("split"),
      direction,
      0.5,
      location.node,
      panel,
    );
    const root = this.replaceNode(this.root, targetPanelId, split);

    return new LayoutTree(root, panel.id);
  }

  swapPanel(slotPanelId: string, panel: Panel): LayoutTree {
    const location = this.locate(slotPanelId);
    if (!location || !(location.node instanceof Panel)) {
      return this;
    }

    const root = this.replaceNode(this.root, slotPanelId, panel);
    return new LayoutTree(root, panel.id);
  }

  closePanel(panelId: string): LayoutTree {
    const location = this.locate(panelId);
    if (!location || !(location.node instanceof Panel)) {
      return this;
    }

    if (!location.parent) {
      return this;
    }

    const sibling =
      location.childKey === "first"
        ? location.parent.second
        : location.parent.first;
    const root = this.replaceNode(this.root, location.parent.id, sibling);

    const panels = new LayoutTree(root).getPanels();
    const nextFocus =
      this.focusedPanelId === panelId
        ? (panels[0]?.id ?? null)
        : this.focusedPanelId;

    return new LayoutTree(root, nextFocus);
  }

  setSplitRatio(splitId: string, ratio: number): LayoutTree {
    const location = this.locate(splitId);
    if (!location || !(location.node instanceof Split)) {
      return this;
    }

    const updated = location.node.withRatio(ratio);
    const root = this.replaceNode(this.root, splitId, updated);
    return new LayoutTree(root, this.focusedPanelId);
  }

  setPanelContent(
    panelId: string,
    contentType: string,
    title?: string,
  ): LayoutTree {
    const panel = this.findPanel(panelId);
    if (!panel) {
      return this;
    }

    const updated = panel.withContentType(contentType, title);
    const root = this.replaceNode(this.root, panelId, updated);
    return new LayoutTree(root, this.focusedPanelId);
  }

  private replaceNode(
    node: LayoutNode,
    targetId: string,
    replacement: LayoutNode,
  ): LayoutNode {
    if (node.id === targetId) {
      return replacement;
    }

    if (node instanceof Split) {
      const first =
        node.first.id === targetId
          ? replacement
          : this.replaceNode(node.first, targetId, replacement);
      const second =
        node.second.id === targetId
          ? replacement
          : this.replaceNode(node.second, targetId, replacement);

      if (first === node.first && second === node.second) {
        return node;
      }

      return new Split(node.id, node.direction, node.ratio, first, second);
    }

    return node;
  }

  private findFirstPanel(node: LayoutNode): Panel | null {
    if (node instanceof Panel) {
      return node;
    }

    if (node instanceof Split) {
      return this.findFirstPanel(node.first) ?? this.findFirstPanel(node.second);
    }

    return null;
  }

  private walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
    visit(node);

    if (node instanceof Split) {
      this.walk(node.first, visit);
      this.walk(node.second, visit);
    }
  }
}
