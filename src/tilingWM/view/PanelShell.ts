import type { Rect } from "../geometry/Rect.js";
import type { SplitDirection } from "../model/Split.js";

export interface PanelShellOptions {
  className?: string;
  activeClassName?: string;
  onClose?: (panelId: string) => void;
  onSplit?: (panelId: string, direction: SplitDirection) => void;
  onFocus?: (panelId: string) => void;
  onTitleClick?: (panelId: string) => void;
}

export class PanelShell {
  readonly element: HTMLDivElement;
  readonly contentSlot: HTMLDivElement;

  constructor(
    readonly panelId: string,
    private options: PanelShellOptions = {},
  ) {
    this.element = document.createElement("div");
    this.element.dataset.panelId = panelId;
    this.element.className = options.className ?? "tw-panel";
    this.element.style.position = "absolute";
    this.element.style.boxSizing = "border-box";
    this.element.style.display = "flex";
    this.element.style.flexDirection = "column";
    this.element.style.overflow = "hidden";

    const titleBar = document.createElement("div");
    titleBar.className = "tw-panel-titlebar";
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.style.gap = "8px";
    titleBar.style.padding = "4px 8px";
    titleBar.style.flexShrink = "0";
    titleBar.style.cursor = "default";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "tw-panel-title";
    title.dataset.role = "title";
    title.title = "Choose panel type";
    title.style.flex = "1";
    title.style.fontSize = "12px";
    title.style.fontWeight = "600";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";
    title.style.textAlign = "left";
    title.style.background = "transparent";
    title.style.border = "none";
    title.style.color = "inherit";
    title.style.cursor = "pointer";
    title.style.padding = "0";
    title.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onTitleClick?.(panelId);
    });

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "4px";

    controls.append(
      this.createButton("H", "Split horizontally", () =>
        options.onSplit?.(panelId, "horizontal"),
      ),
      this.createButton("V", "Split vertically", () =>
        options.onSplit?.(panelId, "vertical"),
      ),
      this.createButton("×", "Close panel", () => options.onClose?.(panelId)),
    );

    titleBar.append(title, controls);

    this.contentSlot = document.createElement("div");
    this.contentSlot.className = "tw-panel-content";
    this.contentSlot.style.flex = "1";
    this.contentSlot.style.minHeight = "0";
    this.contentSlot.style.overflow = "auto";

    this.element.append(titleBar, this.contentSlot);

    this.element.addEventListener("pointerdown", () => {
      options.onFocus?.(panelId);
    });
  }

  setTitle(text: string): void {
    const title = this.element.querySelector("[data-role='title']");
    if (title) {
      title.textContent = text;
    }
  }

  setActive(active: boolean): void {
    if (this.options.activeClassName) {
      this.element.classList.toggle(this.options.activeClassName, active);
    }

    this.element.style.outline = active ? "2px solid #6366f1" : "1px solid #334155";
    this.element.style.outlineOffset = active ? "-2px" : "-1px";
  }

  applyRect(rect: Rect): void {
    this.element.style.left = `${rect.x}px`;
    this.element.style.top = `${rect.y}px`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.height = `${rect.height}px`;
  }

  private createButton(
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.textContent = label;
    button.style.fontSize = "11px";
    button.style.padding = "2px 6px";
    button.style.cursor = "pointer";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }
}
