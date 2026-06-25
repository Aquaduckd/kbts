import {
  ContentInstance,
  ContentType,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  loadAllStaticLibraries,
  loadStaticKeyboard,
  type KeyboardLayoutData,
  type StaticKeyboardLibrary,
} from "../../kbts/keyboard/index.js";
import {
  LAYOUT_EDITOR_TYPE,
  LAYOUT_KEYBOARD_KEY,
} from "../layout-editor/LayoutEditorPanel.js";

const KEYBOARD_SHAPER_TYPE = "keyboard-shaper";
const KEYBOARD_SHAPE_KEY = "keyboard";
const SHAPER_SOURCE = "shaper";
const LAYOUT_EDITOR_SOURCE = LAYOUT_EDITOR_TYPE;

class JsonShaperContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private hint: HTMLParagraphElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private shapeField: HTMLLabelElement | null = null;
  private shapeSelect: HTMLSelectElement | null = null;
  private output: HTMLPreElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private statePool: StatePool | null = null;
  private source = SHAPER_SOURCE;
  private selectedShapeId: string | null = null;
  private staticLibraries: StaticKeyboardLibrary[] = [];
  private readonly libraryCache = new Map<string, KeyboardLayoutData>();
  private readonly abort = new AbortController();

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "flex h-full w-full min-h-0 flex-col overflow-hidden bg-slate-950 p-4 text-slate-100";

    this.hint = document.createElement("p");
    this.hint.className = "shrink-0 text-xs text-slate-500";

    const controls = document.createElement("div");
    controls.className = "mt-3 shrink-0 grid grid-cols-2 gap-2";

    controls.append(this.createSourceField(), this.createShapeField());

    const outputShell = document.createElement("div");
    outputShell.className =
      "relative mt-4 min-h-0 flex-1 overflow-hidden rounded-md border border-slate-800 bg-slate-900/60";

    this.copyButton = document.createElement("button");
    this.copyButton.type = "button";
    this.copyButton.textContent = "Copy";
    this.copyButton.title = "Copy JSON to clipboard";
    this.copyButton.className =
      "absolute right-2 top-2 z-10 cursor-pointer rounded border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    this.copyButton.addEventListener(
      "click",
      () => {
        void this.copyOutputToClipboard();
      },
      { signal: this.abort.signal },
    );

    this.output = document.createElement("pre");
    this.output.className =
      "h-full overflow-auto p-3 font-mono text-xs leading-relaxed text-slate-200";

    outputShell.append(this.copyButton, this.output);
    this.root.append(this.hint, controls, outputShell);
    this.syncSourceUi();
    void this.loadLibraries();
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
    const unwatchShaper = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: KEYBOARD_SHAPER_TYPE,
        key: KEYBOARD_SHAPE_KEY,
      },
      () => {
        if (this.source === SHAPER_SOURCE) {
          render();
        }
      },
    );
    const unwatchLayoutEditor = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: LAYOUT_EDITOR_TYPE,
        key: LAYOUT_KEYBOARD_KEY,
      },
      () => {
        if (this.source === LAYOUT_EDITOR_SOURCE) {
          render();
        }
      },
    );
    return () => {
      unwatchShaper();
      unwatchLayoutEditor();
    };
  }

  destroy(): void {
    this.abort.abort();
    this.deactivate();
    this.root = null;
    this.hint = null;
    this.sourceSelect = null;
    this.shapeField = null;
    this.shapeSelect = null;
    this.output = null;
    this.copyButton = null;
    this.statePool = null;
    this.libraryCache.clear();
  }

  private createSourceField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Source";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";
    this.sourceSelect = select;

    const shaperOption = document.createElement("option");
    shaperOption.value = SHAPER_SOURCE;
    shaperOption.textContent = "Keyboard Shaper";
    select.append(shaperOption);

    const layoutEditorOption = document.createElement("option");
    layoutEditorOption.value = LAYOUT_EDITOR_SOURCE;
    layoutEditorOption.textContent = "Layout Editor";
    select.append(layoutEditorOption);

    select.addEventListener(
      "change",
      () => {
        this.source = select.value;
        this.populateShapeSelect();
        this.syncSourceUi();
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createShapeField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";
    this.shapeField = field;

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Shape";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
    this.shapeSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.selectedShapeId = select.value || null;
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private syncSourceUi(): void {
    if (!this.hint || !this.shapeField || !this.shapeSelect) {
      return;
    }

    const liveSource =
      this.source === SHAPER_SOURCE || this.source === LAYOUT_EDITOR_SOURCE;
    this.shapeField.classList.toggle("opacity-50", liveSource);
    this.shapeSelect.disabled = liveSource;

    if (this.source === SHAPER_SOURCE) {
      this.hint.textContent =
        "Reads keyboard-shaper.keyboard from the shared state pool.";
      return;
    }

    if (this.source === LAYOUT_EDITOR_SOURCE) {
      this.hint.textContent =
        "Reads layout-editor.keyboard from the shared state pool.";
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    this.hint.textContent = library
      ? `Shows JSON from the ${library.info.label} library.`
      : "Shows JSON from a static keyboard shape library.";
  }

  private async loadLibraries(): Promise<void> {
    try {
      this.staticLibraries = await loadAllStaticLibraries(this.abort.signal);
      this.populateSourceSelect();

      if (this.source !== SHAPER_SOURCE && this.source !== LAYOUT_EDITOR_SOURCE) {
        this.populateShapeSelect();
        void this.render();
      }
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      this.staticLibraries = [];
      this.populateSourceSelect();
      if (
        this.source !== SHAPER_SOURCE &&
        this.source !== LAYOUT_EDITOR_SOURCE &&
        this.output
      ) {
        this.output.textContent = `Failed to load keyboard libraries.\n\n${String(error)}`;
      }
    }
  }

  private populateSourceSelect(): void {
    if (!this.sourceSelect) {
      return;
    }

    const selected = this.source;
    this.sourceSelect.replaceChildren();

    const shaperOption = document.createElement("option");
    shaperOption.value = SHAPER_SOURCE;
    shaperOption.textContent = "Keyboard Shaper";
    this.sourceSelect.append(shaperOption);

    const layoutEditorOption = document.createElement("option");
    layoutEditorOption.value = LAYOUT_EDITOR_SOURCE;
    layoutEditorOption.textContent = "Layout Editor";
    this.sourceSelect.append(layoutEditorOption);

    for (const library of this.staticLibraries) {
      const option = document.createElement("option");
      option.value = library.info.id;
      option.textContent = library.info.label;
      this.sourceSelect.append(option);
    }

    const validSource =
      selected === SHAPER_SOURCE ||
      selected === LAYOUT_EDITOR_SOURCE ||
      this.staticLibraries.some((library) => library.info.id === selected);

    this.source = validSource ? selected : SHAPER_SOURCE;
    this.sourceSelect.value = this.source;
    this.syncSourceUi();
    this.populateShapeSelect();
  }

  private populateShapeSelect(): void {
    if (!this.shapeSelect) {
      return;
    }

    this.shapeSelect.replaceChildren();

    if (this.source === SHAPER_SOURCE || this.source === LAYOUT_EDITOR_SOURCE) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "—";
      this.shapeSelect.append(placeholder);
      this.selectedShapeId = null;
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library || library.entries.length === 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "No shapes available";
      this.shapeSelect.append(placeholder);
      this.selectedShapeId = null;
      return;
    }

    for (const entry of library.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      this.shapeSelect.append(option);
    }

    if (
      this.selectedShapeId &&
      library.entries.some((entry) => entry.id === this.selectedShapeId)
    ) {
      this.shapeSelect.value = this.selectedShapeId;
      return;
    }

    this.selectedShapeId = library.entries[0].id;
    this.shapeSelect.value = this.selectedShapeId;
  }

  private getSelectedStaticEntry():
    | { libraryId: string; entry: StaticKeyboardLibrary["entries"][number] }
    | null {
    if (this.source === SHAPER_SOURCE || this.source === LAYOUT_EDITOR_SOURCE) {
      return null;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library) {
      return null;
    }

    const entry = library.entries.find(
      (item) => item.id === this.selectedShapeId,
    );
    if (!entry) {
      return null;
    }

    return { libraryId: library.info.id, entry };
  }

  private cacheKey(libraryId: string, entryId: string): string {
    return `${libraryId}:${entryId}`;
  }

  private async render(): Promise<void> {
    if (!this.output) {
      return;
    }

    if (this.source === SHAPER_SOURCE) {
      const data = this.readKeyboardShape();
      if (!data) {
        this.output.textContent =
          "No keyboard shaper state is available.\n\nOpen a Keyboard Shaper panel to publish keyboard data.";
        return;
      }

      this.output.textContent = JSON.stringify(data, null, 2);
      return;
    }

    if (this.source === LAYOUT_EDITOR_SOURCE) {
      const data = this.readLayoutEditorKeyboard();
      if (!data) {
        this.output.textContent =
          "No layout editor state is available.\n\nOpen a Layout Editor panel with a loaded keyboard shape.";
        return;
      }

      this.output.textContent = JSON.stringify(data, null, 2);
      return;
    }

    const selected = this.getSelectedStaticEntry();
    if (!selected) {
      this.output.textContent =
        "No keyboard shape selected.\n\nAdd libraries under static/keyboard/ with a manifest.json in each folder.";
      return;
    }

    const key = this.cacheKey(selected.libraryId, selected.entry.id);
    const cached = this.libraryCache.get(key);
    if (cached) {
      this.output.textContent = JSON.stringify(cached, null, 2);
      return;
    }

    this.output.textContent = `Loading ${selected.entry.label}…`;

    try {
      const data = await loadStaticKeyboard(
        selected.libraryId,
        selected.entry.file,
        this.abort.signal,
      );
      this.libraryCache.set(key, data);
      const current = this.getSelectedStaticEntry();
      if (
        current &&
        current.libraryId === selected.libraryId &&
        current.entry.id === selected.entry.id
      ) {
        this.output.textContent = JSON.stringify(data, null, 2);
      }
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      this.output.textContent = `Failed to load ${selected.entry.label}.\n\n${String(error)}`;
    }
  }

  private readKeyboardShape(): KeyboardLayoutData | null {
    if (!this.statePool) {
      return null;
    }

    return (
      this.statePool.get<KeyboardLayoutData>(
        KEYBOARD_SHAPER_TYPE,
        KEYBOARD_SHAPE_KEY,
      ) ?? null
    );
  }

  private readLayoutEditorKeyboard(): KeyboardLayoutData | null {
    if (!this.statePool) {
      return null;
    }

    return (
      this.statePool.get<KeyboardLayoutData>(
        LAYOUT_EDITOR_TYPE,
        LAYOUT_KEYBOARD_KEY,
      ) ?? null
    );
  }

  private async copyOutputToClipboard(): Promise<void> {
    if (!this.output || !this.copyButton) {
      return;
    }

    const text = this.output.textContent ?? "";
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const original = this.copyButton.textContent;
      this.copyButton.textContent = "Copied";
      window.setTimeout(() => {
        if (this.copyButton) {
          this.copyButton.textContent = original;
        }
      }, 1200);
    } catch {
      this.copyButton.textContent = "Failed";
      window.setTimeout(() => {
        if (this.copyButton) {
          this.copyButton.textContent = "Copy";
        }
      }, 1200);
    }
  }
}

export class JsonShaperContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new JsonShaperContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Json Shaper";
  }
}
