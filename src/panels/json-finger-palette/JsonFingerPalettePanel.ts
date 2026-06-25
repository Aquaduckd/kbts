import {
  ContentInstance,
  ContentType,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  loadAllStaticPaletteLibraries,
  loadStaticPalette,
  loadUserPalette,
  listUserPalettes,
  type FingerHandPalette,
  type FingerPaletteData,
  type StaticPaletteLibrary,
} from "../../kbts/keyboard/index.js";
import {
  FINGER_PALETTE_EDITOR_TYPE,
  FINGER_PALETTE_KEY,
  FINGER_PALETTE_NAME_KEY,
} from "../finger-palette-editor/FingerPaletteEditorPanel.js";

const EDITOR_SOURCE = "editor";
const USER_SOURCE = "user";

class JsonFingerPaletteContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private hint: HTMLParagraphElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private paletteField: HTMLLabelElement | null = null;
  private paletteSelect: HTMLSelectElement | null = null;
  private output: HTMLPreElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private statePool: StatePool | null = null;
  private source = EDITOR_SOURCE;
  private selectedPaletteId: string | null = null;
  private staticLibraries: StaticPaletteLibrary[] = [];
  private readonly libraryCache = new Map<string, FingerPaletteData>();
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

    controls.append(this.createSourceField(), this.createPaletteField());

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
    const render = () => {
      if (this.source === EDITOR_SOURCE) {
        this.render();
      }
    };
    render();
    const unwatchPalette = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: FINGER_PALETTE_EDITOR_TYPE,
        key: FINGER_PALETTE_KEY,
      },
      render,
    );
    const unwatchName = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: FINGER_PALETTE_EDITOR_TYPE,
        key: FINGER_PALETTE_NAME_KEY,
      },
      render,
    );
    return () => {
      unwatchPalette();
      unwatchName();
    };
  }

  destroy(): void {
    this.abort.abort();
    this.deactivate();
    this.root = null;
    this.hint = null;
    this.sourceSelect = null;
    this.paletteField = null;
    this.paletteSelect = null;
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

    const editorOption = document.createElement("option");
    editorOption.value = EDITOR_SOURCE;
    editorOption.textContent = "Finger Palette Editor";
    select.append(editorOption);

    select.addEventListener(
      "change",
      () => {
        this.source = select.value;
        this.populatePaletteSelect();
        this.syncSourceUi();
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createPaletteField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";
    this.paletteField = field;

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Palette";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
    this.paletteSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.selectedPaletteId = select.value || null;
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private syncSourceUi(): void {
    if (!this.hint || !this.paletteField || !this.paletteSelect) {
      return;
    }

    this.paletteField.classList.toggle(
      "opacity-50",
      this.source === EDITOR_SOURCE,
    );
    this.paletteSelect.disabled = this.source === EDITOR_SOURCE;

    if (this.source === EDITOR_SOURCE) {
      this.hint.textContent =
        "Reads finger-palette-editor.name and finger-palette-editor.palette from the shared state pool.";
      return;
    }

    if (this.source === USER_SOURCE) {
      this.hint.textContent = "Shows JSON from palettes saved in local storage.";
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    this.hint.textContent = library
      ? `Shows JSON from the ${library.info.label} library.`
      : "Shows JSON from a static finger palette library.";
  }

  private async loadLibraries(): Promise<void> {
    try {
      this.staticLibraries = await loadAllStaticPaletteLibraries(
        this.abort.signal,
      );
      this.populateSourceSelect();

      if (this.source !== EDITOR_SOURCE) {
        this.populatePaletteSelect();
        void this.render();
      }
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      this.staticLibraries = [];
      this.populateSourceSelect();
      if (this.source !== EDITOR_SOURCE && this.output) {
        this.output.textContent = `Failed to load palette libraries.\n\n${String(error)}`;
      }
    }
  }

  private populateSourceSelect(): void {
    if (!this.sourceSelect) {
      return;
    }

    const selected = this.source;
    this.sourceSelect.replaceChildren();

    const editorOption = document.createElement("option");
    editorOption.value = EDITOR_SOURCE;
    editorOption.textContent = "Finger Palette Editor";
    this.sourceSelect.append(editorOption);

    for (const library of this.staticLibraries) {
      const option = document.createElement("option");
      option.value = library.info.id;
      option.textContent = library.info.label;
      this.sourceSelect.append(option);
    }

    const userOption = document.createElement("option");
    userOption.value = USER_SOURCE;
    userOption.textContent = "User library";
    this.sourceSelect.append(userOption);

    const validSource =
      selected === EDITOR_SOURCE ||
      selected === USER_SOURCE ||
      this.staticLibraries.some((library) => library.info.id === selected);

    this.source = validSource ? selected : EDITOR_SOURCE;
    this.sourceSelect.value = this.source;
    this.syncSourceUi();
    this.populatePaletteSelect();
  }

  private populatePaletteSelect(): void {
    if (!this.paletteSelect) {
      return;
    }

    this.paletteSelect.replaceChildren();

    if (this.source === EDITOR_SOURCE) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "—";
      this.paletteSelect.append(placeholder);
      this.selectedPaletteId = null;
      return;
    }

    if (this.source === USER_SOURCE) {
      const palettes = listUserPalettes();
      if (palettes.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No palettes saved";
        this.paletteSelect.append(placeholder);
        this.selectedPaletteId = null;
        return;
      }

      for (const entry of palettes) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        this.paletteSelect.append(option);
      }

      if (
        this.selectedPaletteId &&
        palettes.some((entry) => entry.id === this.selectedPaletteId)
      ) {
        this.paletteSelect.value = this.selectedPaletteId;
        return;
      }

      this.selectedPaletteId = palettes[0].id;
      this.paletteSelect.value = this.selectedPaletteId;
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library || library.entries.length === 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "No palettes available";
      this.paletteSelect.append(placeholder);
      this.selectedPaletteId = null;
      return;
    }

    for (const entry of library.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      this.paletteSelect.append(option);
    }

    if (
      this.selectedPaletteId &&
      library.entries.some((entry) => entry.id === this.selectedPaletteId)
    ) {
      this.paletteSelect.value = this.selectedPaletteId;
      return;
    }

    this.selectedPaletteId = library.entries[0].id;
    this.paletteSelect.value = this.selectedPaletteId;
  }

  private getSelectedStaticEntry():
    | { libraryId: string; entry: StaticPaletteLibrary["entries"][number] }
    | null {
    if (this.source === EDITOR_SOURCE || this.source === USER_SOURCE) {
      return null;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library) {
      return null;
    }

    const entry = library.entries.find(
      (item) => item.id === this.selectedPaletteId,
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

    if (this.source === EDITOR_SOURCE) {
      const data = this.readEditorPaletteJson();
      if (!data) {
        this.output.textContent =
          "No finger palette state is available.\n\nOpen a Finger Palette Editor panel to publish palette data.";
        return;
      }

      this.output.textContent = JSON.stringify(data, null, 2);
      return;
    }

    if (this.source === USER_SOURCE) {
      if (!this.selectedPaletteId) {
        this.output.textContent =
          "No palettes saved.\n\nSave palettes from Finger Palette Editor to populate the user library.";
        return;
      }

      const data = loadUserPalette(this.selectedPaletteId);
      if (!data) {
        this.output.textContent =
          "Selected palette could not be loaded from the user library.";
        return;
      }

      this.output.textContent = JSON.stringify(data, null, 2);
      return;
    }

    const selected = this.getSelectedStaticEntry();
    if (!selected) {
      this.output.textContent =
        "No palette selected.\n\nAdd libraries under static/palette/ with a manifest.json in each folder.";
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
      const data = await loadStaticPalette(
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

  private readEditorPaletteJson(): FingerPaletteData | null {
    if (!this.statePool) {
      return null;
    }

    const palette = this.statePool.get<FingerHandPalette>(
      FINGER_PALETTE_EDITOR_TYPE,
      FINGER_PALETTE_KEY,
    );
    if (!palette) {
      return null;
    }

    const name =
      this.statePool.get<string>(
        FINGER_PALETTE_EDITOR_TYPE,
        FINGER_PALETTE_NAME_KEY,
      ) ?? "";

    return {
      name,
      ...palette,
    };
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

export class JsonFingerPaletteContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new JsonFingerPaletteContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Json Finger Palette";
  }
}
