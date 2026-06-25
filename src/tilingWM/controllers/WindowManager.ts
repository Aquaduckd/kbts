import { ContentHost } from "../content/ContentHost.js";
import { ContentRegistry } from "../content/ContentRegistry.js";
import { StatePool } from "../state/StatePool.js";
import { DragController } from "./DragController.js";
import { FocusManager, type FocusDirection } from "./FocusManager.js";
import { ShortcutController } from "./ShortcutController.js";
import { resizeFocusedPanel } from "./PanelResize.js";
import { LayoutEngine } from "../geometry/LayoutEngine.js";
import { Rect } from "../geometry/Rect.js";
import { LayoutTree } from "../model/LayoutTree.js";
import { PanelRegistry } from "../model/PanelRegistry.js";
import { Panel } from "../model/Panel.js";
import { createId } from "../model/id.js";
import type { SplitDirection } from "../model/Split.js";
import { WorkspaceView, type WorkspaceViewOptions } from "../view/WorkspaceView.js";
import {
  PanelTypePicker,
  type PanelTypePickerLayout,
} from "../view/PanelTypePicker.js";
import { HiddenWorkspacesBar } from "../view/HiddenWorkspacesBar.js";
import type { ShortcutAction } from "../shortcuts/ShortcutConfig.js";

export type { PanelTypeOption, PanelTypePickerLayout } from "../view/PanelTypePicker.js";

export interface WindowManagerOptions {
  initialContentType?: string;
  initialTitle?: string;
  newPanelContentType?: string;
  panelPickerLayout?: PanelTypePickerLayout;
  layout?: LayoutEngine;
  view?: WorkspaceViewOptions;
  registry?: ContentRegistry;
  statePool?: StatePool;
  onPanelTitleClick?: (panelId: string) => void;
}

export type LayoutChangeListener = (tree: LayoutTree) => void;

export class WindowManager {
  readonly registry: ContentRegistry;
  readonly statePool: StatePool;
  readonly panelRegistry: PanelRegistry;
  readonly view: WorkspaceView;
  readonly element: HTMLDivElement;

  private tree: LayoutTree;
  private readonly engine: LayoutEngine;
  private readonly contentHost: ContentHost;
  private readonly workspaceContainer: HTMLDivElement;
  private readonly hiddenBar: HiddenWorkspacesBar;
  private readonly focusManager = new FocusManager();
  private readonly dragController = new DragController();
  private readonly newPanelContentType: string;
  private readonly listeners = new Set<LayoutChangeListener>();
  private resizeObserver: ResizeObserver | null = null;
  private typePicker: PanelTypePicker | null = null;
  private shortcutController: ShortcutController | null = null;

  constructor(container: HTMLElement, options: WindowManagerOptions = {}) {
    const newPanelType = options.newPanelContentType ?? "blank";
    this.newPanelContentType = newPanelType;
    this.engine = options.layout ?? new LayoutEngine();
    this.registry = options.registry ?? new ContentRegistry();
    this.statePool = options.statePool ?? new StatePool();
    this.panelRegistry = new PanelRegistry();
    this.contentHost = new ContentHost(this.registry, this.statePool);

    this.element = document.createElement("div");
    this.element.className = "tw-window-manager";
    Object.assign(this.element.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    this.workspaceContainer = document.createElement("div");
    Object.assign(this.workspaceContainer.style, {
      flex: "1",
      minHeight: "0",
      position: "relative",
    });

    this.hiddenBar = new HiddenWorkspacesBar({
      onRestore: (panelId) => this.restoreHiddenPanel(panelId),
      onDiscard: (panelId) => this.discardPanel(panelId),
    });

    if (
      options.panelPickerLayout &&
      (options.panelPickerLayout.root.length > 0 ||
        options.panelPickerLayout.folders.length > 0)
    ) {
      this.typePicker = new PanelTypePicker({
        layout: options.panelPickerLayout,
        onSelect: (panelId, type, label) => {
          this.setPanelContent(panelId, type, label);
        },
      });
    }

    this.view = new WorkspaceView({
      ...options.view,
      panel: {
        ...options.view?.panel,
        onClose: (panelId) => this.closePanel(panelId),
        onSplit: (panelId, direction) =>
          this.splitPanel(
            panelId,
            direction,
            newPanelType,
            this.registry.getDefaultTitle(newPanelType),
          ),
        onFocus: (panelId) => this.focusPanel(panelId),
        onTitleClick: (panelId) => this.handlePanelTitleClick(panelId, options),
      },
      gutter: {
        ...options.view?.gutter,
        onDragStart: (splitId, clientX, clientY) => {
          const bounds = this.getWorkspaceBounds();
          const gutterRect = this.engine
            .compute(this.tree.root, bounds)
            .getGutterRect(splitId);
          if (gutterRect) {
            this.dragController.startDrag(
              this.tree,
              splitId,
              bounds,
              clientX,
              clientY,
              this.engine.gutterSize,
            );
          }
        },
        onDragMove: (_splitId, clientX, clientY) => {
          const ratio = this.dragController.drag(clientX, clientY);
          if (ratio !== null) {
            this.tree = this.tree.setSplitRatio(_splitId, ratio);
            this.render();
          }
        },
        onDragEnd: () => {
          this.dragController.endDrag();
          this.emitChange();
        },
      },
    });

    this.tree = LayoutTree.withPanel(
      options.initialContentType ?? "blank",
      options.initialTitle,
    );

    for (const panel of this.tree.getPanels()) {
      this.panelRegistry.register(panel);
    }

    container.append(this.element);
    this.element.append(this.workspaceContainer, this.hiddenBar.element);
    this.view.mount(this.workspaceContainer);
    this.render();
    this.bindResize(this.workspaceContainer);

    this.shortcutController = new ShortcutController({
      onAction: (action) => this.handleShortcut(action),
      isEnabled: () => !this.typePicker?.isOpen(),
    });
  }

  onLayoutChange(listener: LayoutChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLayoutTree(): LayoutTree {
    return this.tree;
  }

  getHiddenPanels() {
    return this.panelRegistry.getHiddenPanels();
  }

  private destroyPanelRecord(panelId: string): void {
    this.contentHost.destroyPanel(panelId);
    this.panelRegistry.discard(panelId);
  }

  private restoreHiddenPanel(hiddenPanelId: string): void {
    const slotId = this.tree.focusedPanelId;
    if (!slotId) {
      return;
    }

    this.restorePanel(hiddenPanelId, slotId);
  }

  splitPanel(
    panelId: string,
    direction: SplitDirection,
    contentType = "blank",
    title?: string,
  ): void {
    this.tree = this.tree.splitPanel(
      panelId,
      direction,
      contentType,
      title ?? this.registry.getDefaultTitle(contentType),
    );

    const newPanel = this.tree.findPanel(this.tree.focusedPanelId ?? "");
    if (newPanel) {
      this.panelRegistry.register(newPanel);
    }

    this.render();
    this.emitChange();
  }

  setPanelContent(
    panelId: string,
    contentType: string,
    title?: string,
  ): void {
    const current = this.tree.findPanel(panelId);
    if (!current) {
      return;
    }

    const resolvedTitle =
      title ?? this.registry.getDefaultTitle(contentType);

    if (
      current.contentType === contentType &&
      current.title === resolvedTitle
    ) {
      return;
    }

    this.destroyPanelRecord(panelId);

    const nextPanel = new Panel(
      createId("panel"),
      resolvedTitle,
      contentType,
    );
    this.tree = this.tree.swapPanel(panelId, nextPanel);
    this.panelRegistry.register(nextPanel);

    this.render();
    this.emitChange();
  }

  closePanel(panelId: string): void {
    const panel = this.tree.findPanel(panelId);
    if (!panel) {
      return;
    }

    if (this.tree.getPanels().length <= 1) {
      this.destroyPanelRecord(panelId);

      const blankPanel = new Panel(
        createId("panel"),
        this.registry.getDefaultTitle(this.newPanelContentType),
        this.newPanelContentType,
      );
      this.tree = this.tree.swapPanel(panelId, blankPanel);
      this.panelRegistry.register(blankPanel);
      this.render();
      this.emitChange();
      return;
    }

    this.tree = this.tree.closePanel(panelId);
    this.destroyPanelRecord(panelId);

    this.render();
    this.emitChange();
  }

  restorePanel(hiddenPanelId: string, slotPanelId: string): void {
    const record = this.panelRegistry.get(hiddenPanelId);
    if (!record?.hidden) {
      return;
    }

    if (!this.tree.findPanel(slotPanelId)) {
      return;
    }

    if (slotPanelId !== hiddenPanelId) {
      this.destroyPanelRecord(slotPanelId);
    }

    this.panelRegistry.show(hiddenPanelId);
    this.tree = this.tree.swapPanel(slotPanelId, record.panel);
    this.render();
    this.emitChange();
  }

  discardPanel(panelId: string): void {
    if (!this.panelRegistry.isHidden(panelId)) {
      return;
    }

    this.contentHost.destroyPanel(panelId);
    this.panelRegistry.discard(panelId);
    this.hiddenBar.sync(this.getHiddenPanels());
    this.emitChange();
  }

  focusPanel(panelId: string): void {
    this.tree = this.focusManager.focusPanel(this.tree, panelId);
    this.render();
    this.emitChange();
  }

  setSplitRatio(splitId: string, ratio: number): void {
    this.tree = this.tree.setSplitRatio(splitId, ratio);
    this.render();
    this.emitChange();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.shortcutController?.destroy();
    this.typePicker?.destroy();

    for (const panel of this.panelRegistry.getVisiblePanels()) {
      this.contentHost.destroyPanel(panel.id);
    }

    for (const panel of this.panelRegistry.getHiddenPanels()) {
      this.contentHost.destroyPanel(panel.id);
    }

    this.view.element.remove();
    this.element.remove();
    this.listeners.clear();
  }

  private handlePanelTitleClick(
    panelId: string,
    options: WindowManagerOptions,
  ): void {
    if (options.onPanelTitleClick) {
      options.onPanelTitleClick(panelId);
      return;
    }

    this.openPanelPicker(panelId);
  }

  private openPanelPicker(panelId?: string): void {
    const targetId = panelId ?? this.tree.focusedPanelId;
    if (!targetId || !this.typePicker) {
      return;
    }

    this.typePicker.open(targetId);
  }

  private focusNeighbor(direction: FocusDirection): void {
    const layout = this.engine.compute(this.tree.root, this.getWorkspaceBounds());
    this.tree = this.focusManager.focusNeighbor(this.tree, layout, direction);
    this.render();
    this.emitChange();
  }

  private resizeFocusedPanel(direction: FocusDirection): void {
    const panelId = this.tree.focusedPanelId;
    if (!panelId) {
      return;
    }

    const next = resizeFocusedPanel(
      this.tree,
      panelId,
      direction,
      this.getWorkspaceBounds(),
      this.engine.gutterSize,
    );

    if (!next) {
      return;
    }

    this.tree = next;
    this.render();
    this.emitChange();
  }

  private handleShortcut(action: ShortcutAction): void {
    switch (action) {
      case "focusLeft":
        this.focusNeighbor("left");
        break;
      case "focusRight":
        this.focusNeighbor("right");
        break;
      case "focusUp":
        this.focusNeighbor("up");
        break;
      case "focusDown":
        this.focusNeighbor("down");
        break;
      case "resizeLeft":
        this.resizeFocusedPanel("left");
        break;
      case "resizeRight":
        this.resizeFocusedPanel("right");
        break;
      case "resizeUp":
        this.resizeFocusedPanel("up");
        break;
      case "resizeDown":
        this.resizeFocusedPanel("down");
        break;
      case "splitHorizontal": {
        const panelId = this.tree.focusedPanelId;
        if (!panelId) {
          return;
        }
        this.splitPanel(
          panelId,
          "horizontal",
          this.newPanelContentType,
          this.registry.getDefaultTitle(this.newPanelContentType),
        );
        break;
      }
      case "splitVertical": {
        const panelId = this.tree.focusedPanelId;
        if (!panelId) {
          return;
        }
        this.splitPanel(
          panelId,
          "vertical",
          this.newPanelContentType,
          this.registry.getDefaultTitle(this.newPanelContentType),
        );
        break;
      }
      case "openPanelPicker":
        this.openPanelPicker();
        break;
      case "closePanel": {
        const panelId = this.tree.focusedPanelId;
        if (!panelId) {
          return;
        }
        this.closePanel(panelId);
        break;
      }
    }
  }

  private bindResize(container: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(container);
  }

  private render(): void {
    const bounds = this.getWorkspaceBounds();
    const layout = this.engine.compute(this.tree.root, bounds);

    this.view.sync(this.tree, layout);

    this.contentHost.sync(
      this.tree.getPanels(),
      (panelId) => this.view.getContentSlot(panelId),
      this.tree.focusedPanelId,
    );

    for (const panel of this.tree.getPanels()) {
      const rect = layout.getPanelRect(panel.id);
      if (rect) {
        this.contentHost.notifyResize(panel.id, rect.width, rect.height);
      }
    }

    this.hiddenBar.sync(this.getHiddenPanels());
  }

  private getWorkspaceBounds(): Rect {
    return Rect.fromElement(this.view.element);
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener(this.tree);
    }
  }
}
