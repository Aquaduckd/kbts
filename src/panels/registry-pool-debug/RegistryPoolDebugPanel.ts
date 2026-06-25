import {
  ContentInstance,
  ContentType,
  formatWatchTarget,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

function previewValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return String(value);
    }

    return json.length > 96 ? `${json.slice(0, 93)}…` : json;
  } catch {
    return String(value);
  }
}

class RegistryPoolDebugContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private content: HTMLDivElement | null = null;
  private statePool: StatePool | null = null;

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "h-full w-full overflow-auto bg-slate-950 text-slate-100 p-4 font-mono text-xs";

    const hint = document.createElement("p");
    hint.className = "text-xs text-slate-500 font-sans";
    hint.textContent =
      "Declared catalogs, live providers, and targeted state watches.";

    this.content = document.createElement("div");
    this.content.className = "mt-4 space-y-6";

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
    return pool.watchPanel(panel, { kind: "pool" }, render);
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

    if (!this.statePool) {
      const empty = document.createElement("p");
      empty.className = "text-slate-500 font-sans";
      empty.textContent = "State pool not connected.";
      this.content.append(empty);
      return;
    }

    this.content.append(
      this.createCatalogSection(),
      this.createProvidersSection(),
      this.createWatchesSection(),
    );
  }

  private createCatalogSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "space-y-3";

    const title = document.createElement("h3");
    title.className =
      "text-[11px] font-semibold uppercase tracking-wide text-slate-400 font-sans";
    title.textContent = "Declared catalogs";

    section.append(title);

    const catalog = this.statePool!.listCatalog();
    if (catalog.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-slate-500 font-sans";
      empty.textContent = "No panel types declare shared state.";
      section.append(empty);
      return section;
    }

    for (const entry of catalog) {
      section.append(this.createCatalogCard(entry.contentType, entry.states));
    }

    return section;
  }

  private createCatalogCard(
    contentType: string,
    states: ReadonlyArray<{ key: string; label?: string }>,
  ): HTMLElement {
    const card = document.createElement("article");
    card.className =
      "rounded border border-slate-800 bg-slate-900/50 p-3 space-y-2";

    const header = document.createElement("div");
    header.className = "font-sans text-sm text-slate-200";
    header.textContent = contentType;

    const summary = document.createElement("div");
    summary.className = "text-slate-500";
    summary.textContent = `${states.length} key${states.length === 1 ? "" : "s"} declared`;

    const list = document.createElement("ul");
    list.className = "space-y-1 pl-3";

    for (const state of states) {
      const item = document.createElement("li");
      item.className = "text-slate-300";
      item.textContent = state.label
        ? `${state.key} — ${state.label}`
        : state.key;
      list.append(item);
    }

    card.append(header, summary, list);
    return card;
  }

  private createProvidersSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "space-y-3";

    const title = document.createElement("h3");
    title.className =
      "text-[11px] font-semibold uppercase tracking-wide text-slate-400 font-sans";
    title.textContent = "Active providers";

    section.append(title);

    const providers = this.statePool!.listProviders();
    if (providers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-slate-500 font-sans";
      empty.textContent = "No panels are currently exposing state.";
      section.append(empty);
      return section;
    }

    for (const provider of providers) {
      section.append(this.createProviderCard(provider));
    }

    return section;
  }

  private createProviderCard(provider: {
    contentType: string;
    keys: readonly string[];
  }): HTMLElement {
    const card = document.createElement("article");
    card.className =
      "rounded border border-emerald-900/60 bg-emerald-950/20 p-3 space-y-2";

    const header = document.createElement("div");
    header.className = "font-sans text-sm text-emerald-100";
    header.textContent = provider.contentType;

    const list = document.createElement("ul");
    list.className = "space-y-2 pl-3";

    for (const key of provider.keys) {
      const item = document.createElement("li");
      item.className = "space-y-0.5";

      const keyLine = document.createElement("div");
      keyLine.className = "text-emerald-300";
      keyLine.textContent = key;

      const valueLine = document.createElement("div");
      valueLine.className = "text-slate-400 break-all";
      valueLine.textContent = previewValue(
        this.statePool!.get(provider.contentType, key),
      );

      item.append(keyLine, valueLine);
      list.append(item);
    }

    card.append(header, list);
    return card;
  }

  private createWatchesSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "space-y-3";

    const title = document.createElement("h3");
    title.className =
      "text-[11px] font-semibold uppercase tracking-wide text-slate-400 font-sans";
    title.textContent = "Active watches";

    section.append(title);

    const watches = this.statePool!.listWatches();
    if (watches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-slate-500 font-sans";
      empty.textContent = "No active state watches.";
      section.append(empty);
      return section;
    }

    for (const group of this.groupWatchesByListener(watches)) {
      section.append(this.createListenerWatchCard(group));
    }

    return section;
  }

  private groupWatchesByListener(
    watches: Array<{
      listenerContentType: string;
      target: { kind: "pool" } | { kind: "state"; contentType: string; key: string };
    }>,
  ): Array<{
    listenerContentType: string;
    watches: Array<{
      target: { kind: "pool" } | { kind: "state"; contentType: string; key: string };
    }>;
  }> {
    const groups = new Map<
      string,
      {
        listenerContentType: string;
        watches: Array<{
          target: { kind: "pool" } | { kind: "state"; contentType: string; key: string };
        }>;
      }
    >();

    for (const watch of watches) {
      let group = groups.get(watch.listenerContentType);
      if (!group) {
        group = {
          listenerContentType: watch.listenerContentType,
          watches: [],
        };
        groups.set(watch.listenerContentType, group);
      }

      group.watches.push({ target: watch.target });
    }

    return [...groups.values()].sort((a, b) =>
      a.listenerContentType.localeCompare(b.listenerContentType),
    );
  }

  private createListenerWatchCard(group: {
    listenerContentType: string;
    watches: Array<{
      target: { kind: "pool" } | { kind: "state"; contentType: string; key: string };
    }>;
  }): HTMLElement {
    const card = document.createElement("article");
    card.className =
      "rounded border border-indigo-900/60 bg-indigo-950/20 p-3 space-y-2";

    const header = document.createElement("div");
    header.className = "font-sans text-sm text-indigo-100";
    header.textContent = group.listenerContentType;

    const list = document.createElement("ul");
    list.className = "space-y-1 pl-3";

    for (const watch of group.watches) {
      const item = document.createElement("li");
      item.className = "text-slate-300";
      item.textContent = formatWatchTarget(watch.target);
      list.append(item);
    }

    card.append(header, list);
    return card;
  }
}

export class RegistryPoolDebugContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new RegistryPoolDebugContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Pool Debug";
  }
}
