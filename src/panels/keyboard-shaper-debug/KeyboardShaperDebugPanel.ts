import {
  ContentInstance,
  ContentType,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

const KEYBOARD_SHAPER_TYPE = "keyboard-shaper";
const KEYBOARD_SUMMARY_KEY = "summary";

/** Shape published at keyboard-shaper.summary — keep in sync with the shaper. */
interface KeyboardShaperSummary {
  rows: number;
  cols: number;
  gridLabel: string;
  keyCount: number;
  flow: string;
  keyOverrideCount: number;
  lineOverrideCount: number;
}

class KeyboardShaperDebugContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private content: HTMLDivElement | null = null;
  private statePool: StatePool | null = null;

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "h-full w-full overflow-auto bg-slate-950 text-slate-100 p-4";

    const hint = document.createElement("p");
    hint.className = "text-xs text-slate-500";
    hint.textContent =
      "Reads keyboard-shaper.summary from the shared state pool.";

    this.content = document.createElement("div");
    this.content.className = "mt-4 space-y-4";

    this.root.append(hint, this.content);
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.render();
  }

  deactivate(): void {
    this.root?.remove();
  }

  exposeState(pool: StatePool, panel: Panel): () => void {
    this.statePool = pool;
    const render = () => this.render();
    render();
    return pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: KEYBOARD_SHAPER_TYPE,
        key: KEYBOARD_SUMMARY_KEY,
      },
      render,
    );
  }

  destroy(): void {
    this.deactivate();
    this.root = null;
    this.content = null;
    this.statePool = null;
  }

  private render(): void {
    if (!this.content) {
      return;
    }

    this.content.replaceChildren();

    const summary = this.readSummary();
    if (!summary) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-slate-500";
      empty.textContent = "No keyboard shaper summary is available.";
      this.content.append(empty);
      return;
    }

    this.content.append(this.createStatsCard(summary));
  }

  private readSummary(): KeyboardShaperSummary | null {
    if (!this.statePool) {
      return null;
    }

    return (
      this.statePool.get<KeyboardShaperSummary>(
        KEYBOARD_SHAPER_TYPE,
        KEYBOARD_SUMMARY_KEY,
      ) ?? null
    );
  }

  private createStatsCard(stats: KeyboardShaperSummary): HTMLElement {
    const card = document.createElement("section");
    card.className =
      "rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3";

    const title = document.createElement("h3");
    title.className =
      "text-xs font-medium uppercase tracking-wide text-slate-400";
    title.textContent = "Keyboard shaper";

    const grid = document.createElement("dl");
    grid.className = "grid grid-cols-2 gap-x-4 gap-y-2 text-sm";

    this.appendStat(grid, "Grid", stats.gridLabel);
    this.appendStat(grid, "Keys", String(stats.keyCount));
    this.appendStat(grid, "Rows", String(stats.rows));
    this.appendStat(grid, "Cols", String(stats.cols));
    this.appendStat(grid, "Flow", stats.flow);
    this.appendStat(grid, "Key overrides", String(stats.keyOverrideCount));
    this.appendStat(
      grid,
      stats.flow === "horizontal" ? "Row overrides" : "Column overrides",
      String(stats.lineOverrideCount),
    );

    card.append(title, grid);
    return card;
  }

  private appendStat(
    grid: HTMLDListElement,
    label: string,
    value: string,
  ): void {
    const dt = document.createElement("dt");
    dt.className = "text-slate-500";
    dt.textContent = label;

    const dd = document.createElement("dd");
    dd.className = "font-medium text-slate-100";
    dd.textContent = value;

    grid.append(dt, dd);
  }
}

export class KeyboardShaperDebugContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new KeyboardShaperDebugContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Keyboard Shaper Debug";
  }
}
