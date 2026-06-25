import type { Panel } from "../model/Panel.js";

export interface HiddenWorkspacesBarOptions {
  onRestore: (panelId: string) => void;
  onDiscard: (panelId: string) => void;
}

export class HiddenWorkspacesBar {
  readonly element: HTMLElement;
  private readonly list: HTMLDivElement;

  constructor(private readonly options: HiddenWorkspacesBarOptions) {
    this.element = document.createElement("footer");
    this.element.className = "tw-hidden-workspaces";
    this.element.dataset.visible = "false";
    Object.assign(this.element.style, {
      display: "none",
      flexShrink: "0",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
      borderTop: "1px solid #1e293b",
      padding: "8px 12px",
    });

    const label = document.createElement("span");
    label.textContent = "Hidden workspaces:";
    Object.assign(label.style, {
      fontSize: "12px",
      color: "#64748b",
      marginRight: "4px",
    });

    this.list = document.createElement("div");
    Object.assign(this.list.style, {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
    });

    this.element.append(label, this.list);
  }

  sync(hiddenPanels: Panel[]): void {
    this.list.replaceChildren();

    if (hiddenPanels.length === 0) {
      this.element.style.display = "none";
      this.element.dataset.visible = "false";
      return;
    }

    this.element.style.display = "flex";
    this.element.dataset.visible = "true";

    for (const panel of hiddenPanels) {
      this.list.append(this.createTab(panel));
    }
  }

  private createTab(panel: Panel): HTMLDivElement {
    const tab = document.createElement("div");
    Object.assign(tab.style, {
      display: "inline-flex",
      alignItems: "stretch",
      borderRadius: "6px",
      overflow: "hidden",
      border: "1px solid #334155",
    });

    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = panel.title;
    restore.title = `Restore ${panel.title}`;
    Object.assign(restore.style, {
      fontSize: "12px",
      padding: "4px 8px",
      color: "#e2e8f0",
      background: "#1e293b",
      border: "none",
      cursor: "pointer",
    });
    restore.addEventListener("mouseenter", () => {
      restore.style.background = "#334155";
    });
    restore.addEventListener("mouseleave", () => {
      restore.style.background = "#1e293b";
    });
    restore.addEventListener("click", () => {
      this.options.onRestore(panel.id);
    });

    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "×";
    discard.title = `Discard ${panel.title}`;
    Object.assign(discard.style, {
      fontSize: "12px",
      padding: "4px 8px",
      color: "#94a3b8",
      background: "#1e293b",
      border: "none",
      borderLeft: "1px solid #334155",
      cursor: "pointer",
    });
    discard.addEventListener("mouseenter", () => {
      discard.style.background = "#450a0a";
      discard.style.color = "#fca5a5";
    });
    discard.addEventListener("mouseleave", () => {
      discard.style.background = "#1e293b";
      discard.style.color = "#94a3b8";
    });
    discard.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.onDiscard(panel.id);
    });

    tab.append(restore, discard);
    return tab;
  }
}
