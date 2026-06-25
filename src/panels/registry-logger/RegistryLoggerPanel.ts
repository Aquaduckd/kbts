import {
  ContentInstance,
  ContentType,
  formatStatePoolLogEvent,
  type StatePool,
  type StatePoolLogEvent,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

const MAX_VISIBLE_LINES = 500;

class RegistryLoggerContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private logEl: HTMLDivElement | null = null;
  private lineCount = 0;

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "h-full w-full flex flex-col bg-slate-950 text-slate-100 min-h-0";

    const header = document.createElement("div");
    header.className =
      "shrink-0 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3";

    const titles = document.createElement("div");

    const hint = document.createElement("p");
    hint.className = "text-xs text-slate-500";

    hint.textContent =
      "Pool events and which panels react to each one.";

    titles.append(hint);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className =
      "shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => this.clearLog());

    header.append(titles, clear);

    this.logEl = document.createElement("div");
    this.logEl.className =
      "flex-1 min-h-0 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed";

    this.root.append(header, this.logEl);
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }
  }

  deactivate(): void {
    this.root?.remove();
  }

  exposeState(pool: StatePool, _panel: Panel): () => void {
    this.clearLog();
    return pool.subscribeLog((event) => this.appendLine(event));
  }

  destroy(): void {
    this.deactivate();
    this.root = null;
    this.logEl = null;
    this.lineCount = 0;
  }

  private appendLine(event: StatePoolLogEvent): void {
    if (!this.logEl) {
      return;
    }

    const line = document.createElement("div");
    line.className = this.lineClassName(event.type);
    line.textContent = formatStatePoolLogEvent(event);
    this.logEl.append(line);
    this.lineCount += 1;

    if (this.lineCount > MAX_VISIBLE_LINES) {
      this.logEl.firstChild?.remove();
      this.lineCount -= 1;
    }

    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private lineClassName(type: StatePoolLogEvent["type"]): string {
    switch (type) {
      case "declare":
        return "text-slate-400";
      case "provide":
        return "text-emerald-300";
      case "withdraw":
        return "text-amber-300/80";
      case "change":
        return "text-sky-300";
      case "react":
        return "text-violet-300/90 pl-4";
      case "watch":
        return "text-indigo-300";
      case "unwatch":
        return "text-indigo-400/60";
    }
  }

  private clearLog(): void {
    this.logEl?.replaceChildren();
    this.lineCount = 0;
  }
}

export class RegistryLoggerContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new RegistryLoggerContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Pool Log";
  }
}
