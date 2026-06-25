import {
  ContentInstance,
  ContentType,
  createStateProvider,
  isEditableTarget,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  KeyboardCharacters,
  KeyboardLayout,
  computeKeyLayouts,
  DEFAULT_KEYBOARD_LAYOUT_COSMETICS,
  loadAllStaticLibraries,
  loadStaticKeyboard,
  loadStaticLayout,
  loadUserKeyboard,
  loadUserLayout,
  listUserKeyboards,
  saveUserLayout,
  type KeyboardLayoutDocument,
  type KeyGridPosition,
  type KeyboardLayoutData,
  type LayoutEditorShapeInfo,
  type LayoutEditorShapeSummary,
  type StaticKeyboardLibrary,
} from "../../kbts/keyboard/index.js";
import {
  LayoutLoadModal,
  type LayoutLoadSelection,
} from "./LayoutLoadModal.js";
import { LayoutSaveModal } from "./LayoutSaveModal.js";

const KEYBOARD_SHAPER_TYPE = "keyboard-shaper";
export const LAYOUT_EDITOR_TYPE = "layout-editor";
const KEYBOARD_SHAPE_KEY = "keyboard";
export const LAYOUT_CHARACTERS_KEY = "characters";
export const LAYOUT_SHAPE_KEY = "shape";
export const LAYOUT_NAME_KEY = "name";
export const LAYOUT_KEYBOARD_KEY = "keyboard";

export type {
  LayoutEditorShapeInfo,
  LayoutEditorShapeSummary,
} from "../../kbts/keyboard/index.js";
const SHAPER_SOURCE = "shaper";
const USER_LIBRARY_SOURCE = "user";
const DEFAULT_LIBRARY_ID = "default";
const DEFAULT_KEYBOARD_ID = "ansi-stagger-3x10";
const DEFAULT_LAYOUT_NAME = "";

class LayoutEditorContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private summary: HTMLSpanElement | null = null;
  private preview: HTMLDivElement | null = null;
  private previewScroll: HTMLDivElement | null = null;
  private selectedKeyContent: HTMLDivElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private keyboardField: HTMLLabelElement | null = null;
  private keyboardSelect: HTMLSelectElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private statePool: StatePool | null = null;
  private layoutName = DEFAULT_LAYOUT_NAME;
  private readonly loadModal: LayoutLoadModal;
  private readonly saveModal: LayoutSaveModal;
  private source = SHAPER_SOURCE;
  private selectedKeyboardId: string | null = null;
  private selectedPosition: KeyGridPosition | null = null;
  private loadedShapeKey: string | null = null;
  private layoutData: KeyboardLayoutData | null = null;
  private readonly characters = new KeyboardCharacters();
  private staticLibraries: StaticKeyboardLibrary[] = [];
  private readonly libraryCache = new Map<string, KeyboardLayoutData>();
  private readonly abort = new AbortController();

  constructor(panelId: string) {
    super(panelId);
    this.loadModal = new LayoutLoadModal({
      onSelect: (selection) => {
        void this.handleLoadSelection(selection);
      },
    });
    this.saveModal = new LayoutSaveModal({
      getName: () => this.layoutName,
      onSave: (name) => {
        saveUserLayout(name, this.getLayoutData(name.trim()));
        this.layoutName = name.trim();
        this.syncNameField();
        this.notifyNameChange();
      },
    });
  }

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "flex h-full w-full min-h-0 flex-col bg-slate-950 text-slate-100";

    const header = document.createElement("div");
    header.className =
      "flex shrink-0 flex-col gap-2 border-b border-slate-800 px-3 py-2";

    const titleRow = document.createElement("div");
    titleRow.className = "flex items-center justify-between gap-2";

    const title = document.createElement("span");
    title.className = "text-xs text-slate-400";
    title.textContent = "Keyboard shape";

    this.summary = document.createElement("span");
    this.summary.className = "font-mono text-xs text-slate-500";

    titleRow.append(title, this.summary);

    const controls = document.createElement("div");
    controls.className = "grid grid-cols-2 gap-2";
    controls.append(this.createSourceField(), this.createKeyboardField());

    header.append(titleRow, controls);

    const body = document.createElement("div");
    body.className = "flex min-h-0 flex-1";

    const sidebar = document.createElement("aside");
    sidebar.className =
      "flex w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 px-3 py-3";

    const hint = document.createElement("p");
    hint.className = "text-xs leading-relaxed text-slate-500";
    hint.textContent =
      "Click a key to edit. Type to set primary, arrow keys to move.";

    const selectedKeyHeading = document.createElement("h2");
    selectedKeyHeading.className = "text-xs font-medium text-slate-300";
    selectedKeyHeading.textContent = "Selected key";

    this.selectedKeyContent = document.createElement("div");
    this.selectedKeyContent.className = "space-y-2";

    sidebar.append(
      this.createLoadSaveButtons(),
      hint,
      this.createNameField(),
      selectedKeyHeading,
      this.selectedKeyContent,
    );

    const previewScroll = document.createElement("div");
    previewScroll.className =
      "min-h-0 flex-1 overflow-auto bg-slate-900/40 p-4 outline-none";
    previewScroll.tabIndex = 0;
    this.previewScroll = previewScroll;
    previewScroll.addEventListener(
      "mousedown",
      () => {
        previewScroll.focus();
      },
      { signal: this.abort.signal },
    );

    this.preview = document.createElement("div");
    this.preview.className = "relative";
    previewScroll.append(this.preview);

    body.append(sidebar, previewScroll);
    this.root.append(header, body);
    this.root.addEventListener(
      "keydown",
      (event) => {
        this.handleEditorKeyDown(event);
      },
      { signal: this.abort.signal },
    );
    this.syncSourceUi();
    this.renderSelectedKeyControls();
    void this.loadLibraries();
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    void this.render();
  }

  deactivate(): void {
    this.root?.remove();
  }

  exposeState(pool: StatePool, panel: Panel): () => void {
    this.statePool = pool;
    const unregister = pool.register(
      createStateProvider(panel.contentType, {
        characters: () => this.characters.toData(),
        shape: () => this.getShapeInfo(),
        name: () => this.layoutName,
        keyboard: () => this.layoutData ?? undefined,
      }),
    );
    const renderFromShaper = () => {
      if (this.source === SHAPER_SOURCE) {
        void this.render();
      }
    };
    renderFromShaper();
    const unwatchShaper = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: KEYBOARD_SHAPER_TYPE,
        key: KEYBOARD_SHAPE_KEY,
      },
      renderFromShaper,
    );
    return () => {
      unregister();
      unwatchShaper();
    };
  }

  destroy(): void {
    this.abort.abort();
    this.loadModal.destroy();
    this.saveModal.destroy();
    this.deactivate();
    this.root = null;
    this.summary = null;
    this.preview = null;
    this.previewScroll = null;
    this.selectedKeyContent = null;
    this.sourceSelect = null;
    this.keyboardField = null;
    this.keyboardSelect = null;
    this.nameInput = null;
    this.statePool = null;
    this.layoutName = DEFAULT_LAYOUT_NAME;
    this.layoutData = null;
    this.loadedShapeKey = null;
    this.selectedPosition = null;
    this.characters.clear();
    this.libraryCache.clear();
  }

  private createNameField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Name";

    const input = document.createElement("input");
    input.type = "text";
    input.value = this.layoutName;
    input.placeholder = "Layout name";
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";
    this.nameInput = input;

    input.addEventListener(
      "input",
      () => {
        this.layoutName = input.value;
        this.notifyNameChange();
      },
      { signal: this.abort.signal },
    );

    field.append(label, input);
    return field;
  }

  private createLoadSaveButtons(): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "grid grid-cols-2 gap-2";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Load";
    loadButton.className =
      "cursor-pointer rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800";
    loadButton.addEventListener(
      "click",
      () => {
        void this.loadModal.openModal();
      },
      { signal: this.abort.signal },
    );

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.className =
      "cursor-pointer rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800";
    saveButton.addEventListener(
      "click",
      () => {
        this.saveModal.openModal();
      },
      { signal: this.abort.signal },
    );

    row.append(loadButton, saveButton);
    return row;
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

    select.addEventListener(
      "change",
      () => {
        this.source = select.value;
        this.populateKeyboardSelect();
        this.syncSourceUi();
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createKeyboardField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";
    this.keyboardField = field;

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Keyboard";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
    this.keyboardSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.selectedKeyboardId = select.value || null;
        void this.render();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private syncSourceUi(): void {
    if (!this.keyboardField || !this.keyboardSelect) {
      return;
    }

    const librarySource = this.source !== SHAPER_SOURCE;
    this.keyboardField.classList.toggle("opacity-50", !librarySource);
    this.keyboardSelect.disabled = !librarySource;
  }

  private async loadLibraries(): Promise<void> {
    try {
      this.staticLibraries = await loadAllStaticLibraries(this.abort.signal);
      this.populateSourceSelect();
      this.applyFallbackSourceIfNeeded();
      void this.render();
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      this.staticLibraries = [];
      this.populateSourceSelect();
      void this.render();
    }
  }

  private applyFallbackSourceIfNeeded(): boolean {
    if (this.readShaperKeyboard() || this.source !== SHAPER_SOURCE) {
      return false;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === DEFAULT_LIBRARY_ID,
    );
    if (
      !library?.entries.some((entry) => entry.id === DEFAULT_KEYBOARD_ID)
    ) {
      return false;
    }

    this.source = DEFAULT_LIBRARY_ID;
    this.selectedKeyboardId = DEFAULT_KEYBOARD_ID;
    if (this.sourceSelect) {
      this.sourceSelect.value = this.source;
    }
    this.syncSourceUi();
    this.populateKeyboardSelect();
    return true;
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

    for (const library of this.staticLibraries) {
      const option = document.createElement("option");
      option.value = library.info.id;
      option.textContent = library.info.label;
      this.sourceSelect.append(option);
    }

    const userOption = document.createElement("option");
    userOption.value = USER_LIBRARY_SOURCE;
    userOption.textContent = "User library";
    this.sourceSelect.append(userOption);

    const validSource =
      selected === SHAPER_SOURCE ||
      selected === USER_LIBRARY_SOURCE ||
      this.staticLibraries.some((library) => library.info.id === selected);

    this.source = validSource ? selected : SHAPER_SOURCE;
    this.sourceSelect.value = this.source;
    this.syncSourceUi();
    this.populateKeyboardSelect();
  }

  private populateKeyboardSelect(): void {
    if (!this.keyboardSelect) {
      return;
    }

    this.keyboardSelect.replaceChildren();

    if (this.source === SHAPER_SOURCE) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "—";
      this.keyboardSelect.append(placeholder);
      this.selectedKeyboardId = null;
      return;
    }

    if (this.source === USER_LIBRARY_SOURCE) {
      const entries = listUserKeyboards();
      if (entries.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No saved keyboards";
        this.keyboardSelect.append(placeholder);
        this.selectedKeyboardId = null;
        return;
      }

      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        this.keyboardSelect.append(option);
      }

      if (
        this.selectedKeyboardId &&
        entries.some((entry) => entry.id === this.selectedKeyboardId)
      ) {
        this.keyboardSelect.value = this.selectedKeyboardId;
        return;
      }

      this.selectedKeyboardId = entries[0].id;
      this.keyboardSelect.value = this.selectedKeyboardId;
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library || library.entries.length === 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "No keyboards available";
      this.keyboardSelect.append(placeholder);
      this.selectedKeyboardId = null;
      return;
    }

    for (const entry of library.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      this.keyboardSelect.append(option);
    }

    if (
      this.selectedKeyboardId &&
      library.entries.some((entry) => entry.id === this.selectedKeyboardId)
    ) {
      this.keyboardSelect.value = this.selectedKeyboardId;
      return;
    }

    this.selectedKeyboardId = library.entries[0].id;
    this.keyboardSelect.value = this.selectedKeyboardId;
  }

  private getLayoutData(name = this.layoutName): KeyboardLayoutDocument {
    return {
      name: name.trim(),
      shape: this.getShapeInfo(),
      characters: this.characters.toData(),
    };
  }

  private syncNameField(): void {
    if (this.nameInput) {
      this.nameInput.value = this.layoutName;
    }
  }

  private async handleLoadSelection(
    selection: LayoutLoadSelection,
  ): Promise<void> {
    try {
      const data =
        selection.library === "static"
          ? await loadStaticLayout(
              selection.libraryId,
              selection.entry.file,
              this.abort.signal,
            )
          : loadUserLayout(selection.id);

      if (!data) {
        return;
      }

      this.applyLayoutData(data);
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load layout", error);
    }
  }

  private applyLayoutData(data: KeyboardLayoutDocument): void {
    this.layoutName = data.name;
    this.syncNameField();
    this.notifyNameChange();

    this.applyShapeSource(data.shape);
    this.loadedShapeKey = data.shape.shapeKey;
    this.selectedPosition = null;
    this.characters.loadFromData(data.characters);
    this.notifyCharactersChange();

    void this.render();
  }

  private applyShapeSource(shape: LayoutEditorShapeInfo): void {
    if (shape.source === SHAPER_SOURCE) {
      this.source = SHAPER_SOURCE;
      this.selectedKeyboardId = null;
    } else if (shape.source === USER_LIBRARY_SOURCE) {
      this.source = USER_LIBRARY_SOURCE;
      this.selectedKeyboardId = shape.keyboardId;
    } else {
      this.source = shape.source;
      this.selectedKeyboardId = shape.keyboardId;
    }

    if (this.sourceSelect) {
      this.sourceSelect.value = this.source;
    }

    this.syncSourceUi();
    this.populateKeyboardSelect();

    if (this.selectedKeyboardId && this.keyboardSelect) {
      this.keyboardSelect.value = this.selectedKeyboardId;
    }
  }

  private getShapeKey(): string {
    if (this.source === SHAPER_SOURCE) {
      return SHAPER_SOURCE;
    }

    if (this.source === USER_LIBRARY_SOURCE) {
      return `${USER_LIBRARY_SOURCE}:${this.selectedKeyboardId ?? ""}`;
    }

    return `${this.source}:${this.selectedKeyboardId ?? ""}`;
  }

  private getShapeInfo(): LayoutEditorShapeInfo {
    const shapeKey = this.getShapeKey();
    let sourceLabel: string;
    let keyboardLabel: string | null = null;

    if (this.source === SHAPER_SOURCE) {
      sourceLabel = "Keyboard Shaper";
    } else if (this.source === USER_LIBRARY_SOURCE) {
      sourceLabel = "User library";
      if (this.selectedKeyboardId) {
        keyboardLabel =
          listUserKeyboards().find((entry) => entry.id === this.selectedKeyboardId)
            ?.label ?? this.selectedKeyboardId;
      }
    } else {
      const library = this.staticLibraries.find(
        (item) => item.info.id === this.source,
      );
      sourceLabel = library?.info.label ?? this.source;
      const entry = library?.entries.find(
        (item) => item.id === this.selectedKeyboardId,
      );
      keyboardLabel = entry?.label ?? this.selectedKeyboardId;
    }

    let summary: LayoutEditorShapeSummary | null = null;
    if (this.layoutData) {
      const keyboard = new KeyboardLayout(this.layoutData);
      summary = {
        rows: this.layoutData.rows,
        cols: this.layoutData.cols,
        flow: this.layoutData.flow,
        keyCount: keyboard.keyCount,
      };
    }

    return {
      source: this.source,
      keyboardId: this.selectedKeyboardId,
      shapeKey,
      sourceLabel,
      keyboardLabel,
      summary,
    };
  }

  private getSelectedStaticEntry():
    | { libraryId: string; entry: StaticKeyboardLibrary["entries"][number] }
    | null {
    if (this.source === SHAPER_SOURCE || this.source === USER_LIBRARY_SOURCE) {
      return null;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library) {
      return null;
    }

    const entry = library.entries.find(
      (item) => item.id === this.selectedKeyboardId,
    );
    if (!entry) {
      return null;
    }

    return { libraryId: library.info.id, entry };
  }

  private cacheKey(libraryId: string, entryId: string): string {
    return `${libraryId}:${entryId}`;
  }

  private readShaperKeyboard(): KeyboardLayoutData | null {
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

  private async resolveKeyboardData(): Promise<KeyboardLayoutData | null> {
    if (this.source === SHAPER_SOURCE) {
      return this.readShaperKeyboard();
    }

    if (this.source === USER_LIBRARY_SOURCE) {
      if (!this.selectedKeyboardId) {
        return null;
      }

      return loadUserKeyboard(this.selectedKeyboardId);
    }

    const selected = this.getSelectedStaticEntry();
    if (!selected) {
      return null;
    }

    const key = this.cacheKey(selected.libraryId, selected.entry.id);
    const cached = this.libraryCache.get(key);
    if (cached) {
      return cached;
    }

    const data = await loadStaticKeyboard(
      selected.libraryId,
      selected.entry.file,
      this.abort.signal,
    );
    this.libraryCache.set(key, data);
    return data;
  }

  private syncCharactersForShape(data: KeyboardLayoutData): void {
    const shapeKey = this.getShapeKey();
    if (shapeKey !== this.loadedShapeKey) {
      this.loadedShapeKey = shapeKey;
    }

    if (
      this.selectedPosition &&
      (this.selectedPosition.row >= data.rows ||
        this.selectedPosition.col >= data.cols)
    ) {
      this.selectedPosition = null;
    }

    this.layoutData = data;
    this.characters.setLayout(data);
    this.notifyShapeChange();
  }

  private notifyCharactersChange(): void {
    this.statePool?.notifyChange(LAYOUT_EDITOR_TYPE, LAYOUT_CHARACTERS_KEY);
  }

  private notifyShapeChange(): void {
    this.statePool?.notifyChange(LAYOUT_EDITOR_TYPE, LAYOUT_SHAPE_KEY);
    this.statePool?.notifyChange(LAYOUT_EDITOR_TYPE, LAYOUT_KEYBOARD_KEY);
  }

  private notifyNameChange(): void {
    this.statePool?.notifyChange(LAYOUT_EDITOR_TYPE, LAYOUT_NAME_KEY);
  }

  private selectKey(row: number, col: number): void {
    this.selectedPosition = { row, col };
    this.previewScroll?.focus();
    this.renderSelectedKeyControls();
    void this.renderPreviewGrid();
  }

  private moveSelection(deltaRow: number, deltaCol: number): void {
    if (!this.layoutData) {
      return;
    }

    const keyboard = new KeyboardLayout(this.layoutData);

    if (this.selectedPosition === null) {
      for (let row = 0; row < keyboard.rows; row += 1) {
        for (let col = 0; col < keyboard.cols; col += 1) {
          if (keyboard.hasKeyAt(row, col)) {
            this.selectKey(row, col);
            return;
          }
        }
      }
      return;
    }

    const nextRow = this.selectedPosition.row + deltaRow;
    const nextCol = this.selectedPosition.col + deltaCol;
    if (keyboard.hasKeyAt(nextRow, nextCol)) {
      this.selectKey(nextRow, nextCol);
    }
  }

  private setPrimaryForSelected(primary: string): void {
    if (!this.selectedPosition) {
      return;
    }

    const { row, col } = this.selectedPosition;
    this.characters.setPrimaryAt(row, col, primary);
    this.notifyCharactersChange();
    this.renderSelectedKeyControls();
    void this.renderPreviewGrid();
  }

  private handleEditorKeyDown(event: KeyboardEvent): void {
    if (!this.panelFocused || !this.layoutData) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelection(-1, 0);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelection(1, 0);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.moveSelection(0, -1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.moveSelection(0, 1);
      return;
    }

    if (this.selectedPosition === null) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.setPrimaryForSelected("");
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      this.setPrimaryForSelected(event.key);
    }
  }

  private isSelectedKey(row: number, col: number): boolean {
    return (
      this.selectedPosition?.row === row && this.selectedPosition?.col === col
    );
  }

  private renderSelectedKeyControls(): void {
    if (!this.selectedKeyContent) {
      return;
    }

    this.selectedKeyContent.replaceChildren();

    if (!this.layoutData || this.selectedPosition === null) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-slate-500";
      empty.textContent =
        "Click a key in the preview to edit characters. Type to set primary, arrow keys to move.";
      this.selectedKeyContent.append(empty);
      this.syncTextInputForFocus(this.root);
      return;
    }

    const { row, col } = this.selectedPosition;
    const keyboard = new KeyboardLayout(this.layoutData);
    const index = keyboard.indexForPosition(row, col);
    const resolved = this.characters.getResolvedAt(row, col);

    const title = document.createElement("p");
    title.className = "text-xs font-medium text-slate-300";
    title.textContent = `Key ${index + 1} · row ${row + 1}, col ${col + 1}`;

    const primaryField = this.createCharacterField(
      "Primary",
      resolved.primary,
      false,
      (value) => {
        this.characters.setPrimaryAt(row, col, value);
        this.notifyCharactersChange();
        this.renderSelectedKeyControls();
        void this.renderPreviewGrid();
      },
    );

    const useDefaultShiftField = document.createElement("label");
    useDefaultShiftField.className = "flex items-center gap-2 text-xs text-slate-300";

    const useDefaultShiftCheckbox = document.createElement("input");
    useDefaultShiftCheckbox.type = "checkbox";
    useDefaultShiftCheckbox.checked = resolved.useDefaultShift;
    useDefaultShiftCheckbox.className = "rounded border-slate-600 bg-slate-900";
    useDefaultShiftCheckbox.addEventListener(
      "change",
      () => {
        this.characters.setUseDefaultShiftAt(
          row,
          col,
          useDefaultShiftCheckbox.checked,
        );
        this.notifyCharactersChange();
        this.renderSelectedKeyControls();
        void this.renderPreviewGrid();
      },
      { signal: this.abort.signal },
    );

    const useDefaultShiftLabel = document.createElement("span");
    useDefaultShiftLabel.textContent = "Use default shift map";

    useDefaultShiftField.append(useDefaultShiftCheckbox, useDefaultShiftLabel);

    const shiftField = this.createCharacterField(
      "Shift",
      resolved.shift,
      resolved.useDefaultShift,
      (value) => {
        this.characters.setShiftAt(row, col, value);
        this.notifyCharactersChange();
        this.renderSelectedKeyControls();
        void this.renderPreviewGrid();
      },
    );

    this.selectedKeyContent.append(
      title,
      primaryField,
      useDefaultShiftField,
      shiftField,
    );
    this.syncTextInputForFocus(this.root);
  }

  private createCharacterField(
    label: string,
    value: string,
    disabled: boolean,
    onChange: (value: string) => void,
  ): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.maxLength = 1;
    input.disabled = disabled;
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
    input.addEventListener(
      "input",
      () => {
        const next = input.value.slice(-1);
        input.value = next;
        onChange(next);
      },
      { signal: this.abort.signal },
    );

    field.append(name, input);
    return field;
  }

  private showPreviewMessage(message: string): void {
    if (!this.preview || !this.summary) {
      return;
    }

    this.layoutData = null;
    this.notifyShapeChange();
    this.summary.textContent = "No shape loaded";
    this.preview.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "text-sm text-slate-500";
    empty.textContent = message;
    this.preview.append(empty);
    this.renderSelectedKeyControls();
  }

  private async render(): Promise<void> {
    if (!this.preview || !this.summary) {
      return;
    }

    if (this.source !== SHAPER_SOURCE && !this.selectedKeyboardId) {
      this.showPreviewMessage("Select a keyboard from the library.");
      return;
    }

    if (
      this.source !== SHAPER_SOURCE &&
      this.source !== USER_LIBRARY_SOURCE &&
      !this.getSelectedStaticEntry()
    ) {
      this.showPreviewMessage("Select a keyboard from the library.");
      return;
    }

    if (
      this.source !== SHAPER_SOURCE &&
      this.source !== USER_LIBRARY_SOURCE
    ) {
      this.showPreviewMessage("Loading keyboard…");
    }

    const selectedStatic = this.getSelectedStaticEntry();

    let data: KeyboardLayoutData | null;
    try {
      data = await this.resolveKeyboardData();
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      this.showPreviewMessage(`Failed to load keyboard.\n\n${String(error)}`);
      return;
    }

    if (selectedStatic) {
      const currentStatic = this.getSelectedStaticEntry();
      if (
        !currentStatic ||
        currentStatic.libraryId !== selectedStatic.libraryId ||
        currentStatic.entry.id !== selectedStatic.entry.id
      ) {
        return;
      }
    } else if (this.source === USER_LIBRARY_SOURCE) {
      const currentId = this.selectedKeyboardId;
      if (!currentId || currentId !== this.keyboardSelect?.value) {
        return;
      }
    }

    if (!data) {
      if (this.source === SHAPER_SOURCE) {
        if (this.applyFallbackSourceIfNeeded()) {
          void this.render();
          return;
        }

        this.showPreviewMessage(
          "Open a Keyboard Shaper panel to publish keyboard shape data.",
        );
        return;
      }

      if (this.source === USER_LIBRARY_SOURCE) {
        this.showPreviewMessage(
          "No saved keyboards.\n\nSave shapes from Keyboard Shaper to populate the user library.",
        );
        return;
      }

      this.showPreviewMessage("Select a keyboard from the library.");
      return;
    }

    this.syncCharactersForShape(data);
    this.notifyCharactersChange();
    await this.renderPreviewGrid(data);
    this.renderSelectedKeyControls();
  }

  private async renderPreviewGrid(data?: KeyboardLayoutData): Promise<void> {
    if (!this.preview || !this.summary) {
      return;
    }

    const layoutData = data ?? this.layoutData;
    if (!layoutData) {
      return;
    }

    const keyboard = new KeyboardLayout(layoutData);
    const layouts = computeKeyLayouts(
      keyboard,
      DEFAULT_KEYBOARD_LAYOUT_COSMETICS,
    );

    this.summary.textContent = `${layoutData.rows}×${layoutData.cols} · ${keyboard.keyCount} keys · ${layoutData.flow}`;

    let maxX = 0;
    let maxY = 0;
    for (const layout of layouts) {
      maxX = Math.max(maxX, layout.x + layout.width);
      maxY = Math.max(maxY, layout.y + layout.height);
    }

    this.preview.replaceChildren();
    this.preview.style.width = `${maxX + 16}px`;
    this.preview.style.height = `${maxY + 16}px`;

    for (const layout of layouts) {
      const selected = this.isSelectedKey(layout.row, layout.col);
      const resolved = this.characters.getResolvedAt(layout.row, layout.col);
      const cell = document.createElement("div");
      cell.className = selected
        ? "absolute cursor-pointer rounded-sm border-2 border-indigo-400 bg-slate-800 shadow-sm select-none"
        : "absolute cursor-pointer rounded-sm border border-slate-600 bg-slate-800 shadow-sm select-none hover:border-slate-400";
      cell.style.left = `${layout.x}px`;
      cell.style.top = `${layout.y}px`;
      cell.style.width = `${layout.width}px`;
      cell.style.height = `${layout.height}px`;
      cell.title = `Key ${layout.index + 1} (row ${layout.row + 1}, col ${layout.col + 1})`;
      cell.addEventListener(
        "click",
        () => {
          this.selectKey(layout.row, layout.col);
        },
        { signal: this.abort.signal },
      );

      const shiftLabel = document.createElement("span");
      shiftLabel.className =
        "pointer-events-none absolute left-1 top-0.5 select-none text-[8px] leading-none text-slate-400";
      shiftLabel.textContent = resolved.shift;

      const primaryLabel = document.createElement("span");
      primaryLabel.className =
        "pointer-events-none flex h-full select-none items-center justify-center text-sm text-slate-100";
      primaryLabel.textContent = resolved.primary;

      cell.append(shiftLabel, primaryLabel);
      this.preview.append(cell);
    }
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }
}

export class LayoutEditorContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new LayoutEditorContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Layout Editor";
  }
}
