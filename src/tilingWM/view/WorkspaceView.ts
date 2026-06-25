import type { LayoutMap } from "../geometry/LayoutMap.js";
import type { LayoutTree } from "../model/LayoutTree.js";
import { Split } from "../model/Split.js";
import { GutterView, type GutterViewOptions } from "./GutterView.js";
import { PanelShell, type PanelShellOptions } from "./PanelShell.js";

export interface WorkspaceViewOptions {
  className?: string;
  panel?: PanelShellOptions;
  gutter?: GutterViewOptions;
}

export class WorkspaceView {
  readonly element: HTMLDivElement;
  private readonly panelShells = new Map<string, PanelShell>();
  private readonly gutterViews = new Map<string, GutterView>();
  private readonly panelOptions: PanelShellOptions;
  private readonly gutterOptions: GutterViewOptions;

  constructor(options: WorkspaceViewOptions = {}) {
    this.panelOptions = options.panel ?? {};
    this.gutterOptions = options.gutter ?? {};

    this.element = document.createElement("div");
    this.element.className = options.className ?? "tw-workspace";
    this.element.style.position = "relative";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    this.element.style.overflow = "hidden";
  }

  mount(container: HTMLElement): void {
    container.append(this.element);
  }

  sync(tree: LayoutTree, layout: LayoutMap): void {
    this.syncPanels(tree, layout);
    this.syncGutters(tree, layout);
  }

  getContentSlot(panelId: string): HTMLElement | null {
    return this.panelShells.get(panelId)?.contentSlot ?? null;
  }

  private syncPanels(tree: LayoutTree, layout: LayoutMap): void {
    const panels = tree.getPanels();
    const nextIds = new Set(panels.map((panel) => panel.id));

    for (const panelId of [...this.panelShells.keys()]) {
      if (!nextIds.has(panelId)) {
        this.panelShells.get(panelId)?.element.remove();
        this.panelShells.delete(panelId);
      }
    }

    for (const panel of panels) {
      let shell = this.panelShells.get(panel.id);
      if (!shell) {
        shell = new PanelShell(panel.id, this.panelOptions);
        this.panelShells.set(panel.id, shell);
        this.element.append(shell.element);
      }

      shell.setTitle(panel.title);
      shell.setActive(panel.id === tree.focusedPanelId);

      const rect = layout.getPanelRect(panel.id);
      if (rect) {
        shell.applyRect(rect);
      }
    }
  }

  private syncGutters(tree: LayoutTree, layout: LayoutMap): void {
    const splits = this.collectSplits(tree.root);
    const nextIds = new Set(splits.map((split) => split.id));

    for (const splitId of [...this.gutterViews.keys()]) {
      if (!nextIds.has(splitId)) {
        this.gutterViews.get(splitId)?.element.remove();
        this.gutterViews.delete(splitId);
      }
    }

    for (const split of splits) {
      let gutter = this.gutterViews.get(split.id);
      if (!gutter) {
        gutter = new GutterView(split.id, split.direction, this.gutterOptions);
        this.gutterViews.set(split.id, gutter);
        this.element.append(gutter.element);
      }

      const rect = layout.getGutterRect(split.id);
      if (rect) {
        gutter.applyRect(rect);
      }
    }
  }

  private collectSplits(node: LayoutTree["root"]): Split[] {
    const splits: Split[] = [];

    const walk = (current: LayoutTree["root"]) => {
      if (current instanceof Split) {
        splits.push(current);
        walk(current.first);
        walk(current.second);
      }
    };

    walk(node);
    return splits;
  }
}
