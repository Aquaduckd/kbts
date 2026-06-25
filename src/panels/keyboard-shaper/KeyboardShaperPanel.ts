import {
  ContentInstance,
  ContentType,
  createStateProvider,
  isEditableTarget,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  KeyboardLayout,
  computeKeyLayouts,
  KEY_FINGER_OPTIONS,
  KEY_HAND_OPTIONS,
  fingerHandFromShortcutDigit,
  keyFingerHandColor,
  parseShortcutDigit,
  type FingerHandPalette,
  loadStaticKeyboard,
  loadUserKeyboard,
  saveUserKeyboard,
  loadAllStaticPaletteLibraries,
  loadStaticPalette,
  loadUserPalette,
  listUserPalettes,
  type FingerPaletteData,
  type StaticPaletteLibrary,
  type FlowDirection,
  type KeyGridPosition,
  type KeyLayout,
  type KeyOverride,
  type KeyboardLayoutData,
} from "../../kbts/keyboard/index.js";
import {
  KeyboardLoadModal,
  type KeyboardLoadSelection,
} from "./KeyboardLoadModal.js";
import { KeyboardSaveModal } from "./KeyboardSaveModal.js";
import {
  FINGER_PALETTE_EDITOR_TYPE,
  FINGER_PALETTE_KEY,
} from "../finger-palette-editor/FingerPaletteEditorPanel.js";

interface KeyboardShaperSummary {
  rows: number;
  cols: number;
  gridLabel: string;
  keyCount: number;
  flow: FlowDirection;
  keyOverrideCount: number;
  lineOverrideCount: number;
}

interface KeyboardShaperCosmetics {
  keySize: number;
  gap: number;
}

type KeyDragMode = "move" | "resize-e" | "resize-s" | "resize-se";

const KEY_EDGE_SIZE = 8;
const KEY_EIGHTHS = 8;
const KEY_SIZE_EIGHTHS_DEFAULT = 8;
const KEY_SIZE_EIGHTHS_MAX = 80;
const KEY_OFFSET_EIGHTHS_MIN = 0;
const KEY_OFFSET_EIGHTHS_MAX = 80;
const KEY_SIZE_PX_MIN = 8;
const KEY_SIZE_PX_MAX = 120;

const DEFAULT_COSMETICS: KeyboardShaperCosmetics = {
  keySize: 40,
  gap: 4,
};

const PALETTE_EDITOR_SOURCE = "editor";
const PALETTE_USER_SOURCE = "user";
const DEFAULT_PALETTE_LIBRARY_ID = "default";
const DEFAULT_PALETTE_ENTRY_ID = "classic";

class KeyboardShaperContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  private previewScroll: HTMLDivElement | null = null;
  private summary: HTMLSpanElement | null = null;
  private selectedKeySection: HTMLDivElement | null = null;
  private selectedKeyContent: HTMLDivElement | null = null;
  private selectedRowSection: HTMLDivElement | null = null;
  private selectedRowContent: HTMLDivElement | null = null;
  private selectedRowHeading: HTMLHeadingElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private rowsInput: HTMLInputElement | null = null;
  private colsInput: HTMLInputElement | null = null;
  private flowSelect: HTMLSelectElement | null = null;
  private readonly keyboard = new KeyboardLayout();
  private cosmetics: KeyboardShaperCosmetics = { ...DEFAULT_COSMETICS };
  private fingerPalette: FingerHandPalette = {
    pinky: "#f472b6",
    ring: "#a855f7",
    middle: "#3b82f6",
    leftIndex: "#a3e635",
    rightIndex: "#22c55e",
    leftThumb: "#ef4444",
    rightThumb: "#f97316",
  };
  private paletteSource = DEFAULT_PALETTE_LIBRARY_ID;
  private selectedPaletteEntryId: string | null = DEFAULT_PALETTE_ENTRY_ID;
  private staticPaletteLibraries: StaticPaletteLibrary[] = [];
  private readonly paletteLibraryCache = new Map<string, FingerHandPalette>();
  private paletteSourceSelect: HTMLSelectElement | null = null;
  private paletteEntryField: HTMLLabelElement | null = null;
  private paletteEntrySelect: HTMLSelectElement | null = null;
  private statePool: StatePool | null = null;
  private selectedPosition: KeyGridPosition | null = null;
  private readonly loadModal: KeyboardLoadModal;
  private readonly saveModal: KeyboardSaveModal;
  private keyDragState: {
    index: number;
    mode: KeyDragMode;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    startWidthEighths: number;
    startHeightEighths: number;
  } | null = null;
  private abort = new AbortController();

  constructor(panelId: string) {
    super(panelId);
    this.loadModal = new KeyboardLoadModal({
      onSelect: (selection) => {
        void this.handleLoadSelection(selection);
      },
    });
    this.saveModal = new KeyboardSaveModal({
      getName: () => this.keyboard.name,
      onSave: (name) => {
        saveUserKeyboard(name, this.keyboard.toData());
        this.keyboard.name = name.trim();
        this.syncControlsFromKeyboard();
        this.notifyKeyboardStateChange();
      },
    });
  }

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "h-full w-full flex bg-slate-950 text-slate-100 min-h-0";

    const controls = document.createElement("aside");
    controls.className =
      "w-56 shrink-0 border-r border-slate-800 p-3 overflow-y-auto space-y-2";

    const hint = document.createElement("p");
    hint.className = "text-xs text-slate-500 leading-relaxed";
    hint.textContent =
      "Click a key to edit. Drag center to move, edges to resize. Number keys to assign finger.";

    controls.append(this.createLoadSaveButtons());
    controls.append(hint);
    controls.append(
      this.createKeyboardNameField(),
      this.createInlineFieldRow(
        this.createKeyboardNumberField("Rows", "rows", 1, 32, 1, true),
        this.createKeyboardNumberField("Cols", "cols", 1, 32, 1, true),
      ),
      this.createFlowField(),
    );

    this.selectedKeySection = document.createElement("div");
    this.selectedKeySection.className =
      "pt-2 border-t border-slate-800 space-y-2";

    const selectedKeyHeading = document.createElement("h2");
    selectedKeyHeading.className = "text-sm font-semibold text-slate-200";
    selectedKeyHeading.textContent = "Selected key";
    this.selectedKeyContent = document.createElement("div");
    this.selectedKeyContent.className = "space-y-2";
    this.selectedKeySection.append(selectedKeyHeading, this.selectedKeyContent);
    controls.append(this.selectedKeySection);

    this.selectedRowSection = document.createElement("div");
    this.selectedRowSection.className =
      "pt-2 border-t border-slate-800 space-y-2";

    const selectedRowHeading = document.createElement("h2");
    selectedRowHeading.className = "text-sm font-semibold text-slate-200";
    selectedRowHeading.textContent = "Selected row";
    this.selectedRowHeading = selectedRowHeading;
    this.selectedRowContent = document.createElement("div");
    this.selectedRowContent.className = "space-y-2";
    this.selectedRowSection.append(selectedRowHeading, this.selectedRowContent);
    controls.append(this.selectedRowSection);

    const cosmeticsSection = document.createElement("div");
    cosmeticsSection.className =
      "pt-2 border-t border-slate-800 space-y-2";

    const cosmeticsHeading = document.createElement("h2");
    cosmeticsHeading.className = "text-sm font-semibold text-slate-200";
    cosmeticsHeading.textContent = "Cosmetics";

    cosmeticsSection.append(
      cosmeticsHeading,
      this.createInlineFieldRow(
        this.createCosmeticsNumberField("Size", "keySize", KEY_SIZE_PX_MIN, KEY_SIZE_PX_MAX, 1, true),
        this.createCosmeticsNumberField("Gap", "gap", 0, 64, 1, true),
      ),
      this.createInlineFieldRow(
        this.createPaletteSourceField(),
        this.createPaletteEntryField(),
      ),
    );

    controls.append(cosmeticsSection);

    const main = document.createElement("div");
    main.className = "flex-1 flex flex-col min-w-0 min-h-0";

    const toolbar = document.createElement("div");
    toolbar.className =
      "shrink-0 border-b border-slate-800 px-3 py-2 flex items-center justify-start gap-2";

    this.summary = document.createElement("span");
    this.summary.className = "text-xs text-slate-500 font-mono";

    toolbar.append(this.summary);

    this.previewScroll = document.createElement("div");
    this.previewScroll.className =
      "flex-1 overflow-auto bg-slate-900/40 p-4 min-h-0";

    this.preview = document.createElement("div");
    this.preview.className = "relative";
    this.previewScroll.append(this.preview);

    this.previewScroll.addEventListener(
      "click",
      (event) => {
        if (
          event.target === this.previewScroll ||
          event.target === this.preview
        ) {
          this.selectKey(null);
        }
      },
      { signal: this.abort.signal },
    );

    main.append(toolbar, this.previewScroll);
    this.root.append(controls, main);
    this.syncKeyboardKeys();
    this.renderSelectedRowControls();
    this.renderSelectedKeyControls();
    this.renderGrid();
    void this.loadPaletteLibraries();

    document.addEventListener(
      "keydown",
      this.onFingerHandShortcut,
      { signal: this.abort.signal },
    );
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.renderGrid();
  }

  deactivate(): void {
    this.root?.remove();
  }

  exposeState(pool: StatePool, panel: Panel): () => void {
    this.statePool = pool;

    const unregister = pool.register(
      createStateProvider(panel.contentType, {
        keyboard: () => this.keyboard.toData(),
        summary: () => this.getKeyboardSummary(),
      }),
    );
    const unwatchPalette = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: FINGER_PALETTE_EDITOR_TYPE,
        key: FINGER_PALETTE_KEY,
      },
      () => {
        this.onPaletteEditorPoolChange();
      },
    );

    void this.applyPaletteSelection();

    return () => {
      unregister();
      unwatchPalette();
    };
  }

  private getKeyboardSummary(): KeyboardShaperSummary {
    const data = this.keyboard.toData();

    return {
      rows: data.rows,
      cols: data.cols,
      gridLabel: `${data.rows}×${data.cols}`,
      keyCount: this.keyboard.keyCount,
      flow: data.flow,
      keyOverrideCount: Object.keys(data.keys).length,
      lineOverrideCount: Object.keys(data.lineKeyCounts).length,
    };
  }

  private notifyKeyboardStateChange(): void {
    this.statePool?.notifyChange("keyboard-shaper", "keyboard");
    this.statePool?.notifyChange("keyboard-shaper", "summary");
  }

  destroy(): void {
    this.deactivate();
    this.abort.abort();
    this.loadModal.destroy();
    this.saveModal.destroy();
    this.root = null;
    this.preview = null;
    this.previewScroll = null;
    this.summary = null;
    this.selectedKeySection = null;
    this.selectedKeyContent = null;
    this.selectedRowSection = null;
    this.selectedRowContent = null;
    this.selectedRowHeading = null;
    this.nameInput = null;
    this.rowsInput = null;
    this.colsInput = null;
    this.flowSelect = null;
    this.paletteSourceSelect = null;
    this.paletteEntryField = null;
    this.paletteEntrySelect = null;
    this.paletteLibraryCache.clear();
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

  private async handleLoadSelection(
    selection: KeyboardLoadSelection,
  ): Promise<void> {
    try {
      const data =
        selection.library === "static"
          ? await loadStaticKeyboard(
              selection.libraryId,
              selection.entry.file,
              this.abort.signal,
            )
          : loadUserKeyboard(selection.id);

      if (!data) {
        return;
      }

      this.applyKeyboardData(data);
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load keyboard shape", error);
    }
  }

  private applyKeyboardData(data: KeyboardLayoutData): void {
    this.keyboard.loadFromData(data);
    this.selectedPosition = null;
    this.syncControlsFromKeyboard();
    this.syncKeyboardKeys();
    this.notifyKeyboardStateChange();
    this.renderSelectedRowControls();
    this.renderSelectedKeyControls();
    this.renderGrid();
  }

  private syncControlsFromKeyboard(): void {
    if (this.nameInput) {
      this.nameInput.value = this.keyboard.name;
    }
    if (this.rowsInput) {
      this.rowsInput.value = String(this.keyboard.rows);
    }
    if (this.colsInput) {
      this.colsInput.value = String(this.keyboard.cols);
    }
    if (this.flowSelect) {
      this.flowSelect.value = this.keyboard.flow;
    }
    this.syncTextInputForFocus(this.root);
  }

  private getSelectedKeyIndex(): number | null {
    if (!this.selectedPosition) {
      return null;
    }

    const { row, col } = this.selectedPosition;
    if (!this.keyboard.hasKeyAt(row, col)) {
      return null;
    }

    return this.keyboard.indexForPosition(row, col);
  }

  private selectKey(index: number | null): void {
    if (index === null) {
      this.selectedPosition = null;
    } else {
      const { row, col } = this.keyboard.cellPosition(index);
      this.selectedPosition = { row, col };
    }
    this.renderSelectedRowControls();
    this.renderSelectedKeyControls();
    this.renderGrid();
  }

  private syncKeyboardKeys(): void {
    this.keyboard.syncKeys();

    if (
      this.selectedPosition &&
      !this.keyboard.hasKeyAt(
        this.selectedPosition.row,
        this.selectedPosition.col,
      )
    ) {
      this.selectedPosition = null;
    }
  }

  private getKeyOverride(index: number): KeyOverride {
    return this.keyboard.getKeyOverride(index);
  }

  private applyKeyOverride(index: number, patch: Partial<KeyOverride>): void {
    this.keyboard.setKeyOverride(index, patch);
  }

  private setKeyOverride(index: number, patch: Partial<KeyOverride>): void {
    this.applyKeyOverride(index, patch);
    this.notifyKeyboardStateChange();
  }

  private resetKeyOverride(index: number): void {
    this.keyboard.resetKeyOverride(index);
    this.notifyKeyboardStateChange();
    this.renderSelectedRowControls();
    this.renderSelectedKeyControls();
    this.renderGrid();
  }

  private readonly onFingerHandShortcut = (event: KeyboardEvent): void => {
    if (!this.panelFocused || !this.root?.isConnected || this.selectedPosition === null) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const digit = parseShortcutDigit(event);
    if (digit === null) {
      return;
    }

    const mapping = fingerHandFromShortcutDigit(digit);
    if (!mapping) {
      return;
    }

    const index = this.getSelectedKeyIndex();
    if (index === null) {
      return;
    }

    event.preventDefault();
    this.setKeyOverride(index, mapping);
    this.renderSelectedKeyControls();
    this.renderGrid();
  };

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private slotUnitPx(): number {
    return this.cosmetics.keySize + this.cosmetics.gap;
  }

  private slotEighthPx(): number {
    return this.slotUnitPx() / KEY_EIGHTHS;
  }

  private sizeUnitsToPx(units: number): number {
    return units * this.slotUnitPx() - this.cosmetics.gap;
  }

  private sizeEighthsToPx(eighths: number): number {
    return this.sizeUnitsToPx(eighths / KEY_EIGHTHS);
  }

  private sizePxToEighths(px: number): number {
    return Math.round(
      ((px + this.cosmetics.gap) / this.slotUnitPx()) * KEY_EIGHTHS,
    );
  }

  private offsetDeltaToEighths(deltaPx: number): number {
    return Math.round(deltaPx / this.slotEighthPx());
  }

  private eighthsToUnits(eighths: number): number {
    return eighths / KEY_EIGHTHS;
  }

  private unitsToEighths(units: number): number {
    return Math.round(units * KEY_EIGHTHS);
  }

  private snapUnits(units: number): number {
    const step = 1 / KEY_EIGHTHS;
    return Math.round(units / step) * step;
  }

  private clampUnitsToEighths(
    units: number,
    minEighths: number,
    maxEighths: number,
  ): number {
    return this.clampEighths(
      this.unitsToEighths(this.snapUnits(units)),
      minEighths,
      maxEighths,
    );
  }

  private clampEighths(value: number, min: number, max: number): number {
    return this.clamp(Math.round(value), min, max);
  }

  private getKeyDragMode(
    localX: number,
    localY: number,
    width: number,
    height: number,
  ): KeyDragMode {
    const onRight = localX >= width - KEY_EDGE_SIZE;
    const onBottom = localY >= height - KEY_EDGE_SIZE;

    if (onRight && onBottom) {
      return "resize-se";
    }
    if (onRight) {
      return "resize-e";
    }
    if (onBottom) {
      return "resize-s";
    }

    return "move";
  }

  private cursorForKeyDragMode(mode: KeyDragMode): string {
    switch (mode) {
      case "move":
        return "move";
      case "resize-e":
        return "ew-resize";
      case "resize-s":
        return "ns-resize";
      case "resize-se":
        return "nwse-resize";
    }
  }

  private beginKeyDrag(
    index: number,
    mode: KeyDragMode,
    clientX: number,
    clientY: number,
  ): void {
    const override = this.getKeyOverride(index);

    this.keyDragState = {
      index,
      mode,
      startX: clientX,
      startY: clientY,
      startOffsetX: override.offsetX,
      startOffsetY: override.offsetY,
      startWidthEighths: override.width ?? KEY_SIZE_EIGHTHS_DEFAULT,
      startHeightEighths: override.height ?? KEY_SIZE_EIGHTHS_DEFAULT,
    };

    const onMove = (event: MouseEvent) => {
      this.updateKeyDrag(event);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this.keyDragState = null;
      this.notifyKeyboardStateChange();
      this.renderSelectedKeyControls();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private updateKeyDrag(event: MouseEvent): void {
    if (!this.keyDragState) {
      return;
    }

    const {
      index,
      mode,
      startX,
      startY,
      startOffsetX,
      startOffsetY,
      startWidthEighths,
      startHeightEighths,
    } = this.keyDragState;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const layoutXDeltaToEighths = this.offsetDeltaToEighths(deltaX);
    const layoutYDeltaToEighths = this.offsetDeltaToEighths(deltaY);

    switch (mode) {
      case "move":
        this.applyKeyOverride(index, {
          offsetX: this.clampEighths(
            startOffsetX + layoutXDeltaToEighths,
            KEY_OFFSET_EIGHTHS_MIN,
            KEY_OFFSET_EIGHTHS_MAX,
          ),
          offsetY: this.clampEighths(
            startOffsetY + layoutYDeltaToEighths,
            KEY_OFFSET_EIGHTHS_MIN,
            KEY_OFFSET_EIGHTHS_MAX,
          ),
        });
        break;
      case "resize-e": {
        const widthEighths = this.clampEighths(
          this.sizePxToEighths(
            this.sizeEighthsToPx(startWidthEighths) + deltaX,
          ),
          KEY_SIZE_EIGHTHS_DEFAULT,
          KEY_SIZE_EIGHTHS_MAX,
        );
        this.applyKeyOverride(index, {
          width:
            widthEighths === KEY_SIZE_EIGHTHS_DEFAULT
              ? undefined
              : widthEighths,
        });
        break;
      }
      case "resize-s": {
        const heightEighths = this.clampEighths(
          this.sizePxToEighths(
            this.sizeEighthsToPx(startHeightEighths) + deltaY,
          ),
          KEY_SIZE_EIGHTHS_DEFAULT,
          KEY_SIZE_EIGHTHS_MAX,
        );
        this.applyKeyOverride(index, {
          height:
            heightEighths === KEY_SIZE_EIGHTHS_DEFAULT
              ? undefined
              : heightEighths,
        });
        break;
      }
      case "resize-se": {
        const widthEighths = this.clampEighths(
          this.sizePxToEighths(
            this.sizeEighthsToPx(startWidthEighths) + deltaX,
          ),
          KEY_SIZE_EIGHTHS_DEFAULT,
          KEY_SIZE_EIGHTHS_MAX,
        );
        const heightEighths = this.clampEighths(
          this.sizePxToEighths(
            this.sizeEighthsToPx(startHeightEighths) + deltaY,
          ),
          KEY_SIZE_EIGHTHS_DEFAULT,
          KEY_SIZE_EIGHTHS_MAX,
        );
        this.applyKeyOverride(index, {
          width:
            widthEighths === KEY_SIZE_EIGHTHS_DEFAULT
              ? undefined
              : widthEighths,
          height:
            heightEighths === KEY_SIZE_EIGHTHS_DEFAULT
              ? undefined
              : heightEighths,
        });
        break;
      }
    }

    this.renderSelectedRowControls();
    this.renderSelectedKeyControls();
    this.renderGrid();
  }

  private attachKeyInteraction(cell: HTMLDivElement, index: number): void {
    cell.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const mode = this.getKeyDragMode(
        event.offsetX,
        event.offsetY,
        cell.offsetWidth,
        cell.offsetHeight,
      );

      this.selectKey(index);
      this.beginKeyDrag(index, mode, event.clientX, event.clientY);
    });

    cell.addEventListener("mousemove", (event) => {
      if (this.keyDragState) {
        return;
      }

      const rect = cell.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const mode = this.getKeyDragMode(
        localX,
        localY,
        rect.width,
        rect.height,
      );

      cell.style.cursor = this.cursorForKeyDragMode(mode);
    });

    cell.addEventListener("mouseleave", () => {
      if (!this.keyDragState) {
        cell.style.cursor = "";
      }
    });
  }

  private computeLayouts(): KeyLayout[] {
    return computeKeyLayouts(this.keyboard, this.cosmetics);
  }

  private getKeyLayout(index: number): KeyLayout {
    return this.computeLayouts()[index]!;
  }

  private renderSelectedRowControls(): void {
    if (!this.selectedRowContent || !this.selectedRowHeading) {
      return;
    }

    const horizontal = this.keyboard.flow === "horizontal";
    this.selectedRowHeading.textContent = horizontal
      ? "Selected row"
      : "Selected column";

    this.selectedRowContent.replaceChildren();

    if (this.selectedPosition === null) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-slate-500";
      empty.textContent = horizontal
        ? "Click a key to edit its row."
        : "Click a key to edit its column.";
      this.selectedRowContent.append(empty);
      return;
    }

    const line = horizontal
      ? this.selectedPosition.row
      : this.selectedPosition.col;
    const keyCount = this.keyboard.getLineKeyCount(line);
    const defaultCount = this.keyboard.defaultLineKeyCount;
    const lineLabel = horizontal
      ? `Row ${line + 1}`
      : `Col ${line + 1}`;

    const summary = document.createElement("p");
    summary.className = "text-xs font-medium text-slate-300 min-w-0";
    summary.textContent = `${lineLabel} · ${keyCount}/${defaultCount} keys`;

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className =
      "shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      this.keyboard.resetLineKeyCount(line);
      this.syncKeyboardKeys();
      this.notifyKeyboardStateChange();
      this.renderSelectedRowControls();
      this.renderSelectedKeyControls();
      this.renderGrid();
    });

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2";
    header.append(summary, reset);

    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = "Keys";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(defaultCount);
    input.step = "1";
    input.value = String(keyCount);
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (Number.isNaN(value)) {
        return;
      }

      const clamped = Math.min(defaultCount, Math.max(1, Math.round(value)));
      input.value = String(clamped);
      this.keyboard.setLineKeyCount(line, clamped);
      this.syncKeyboardKeys();
      this.notifyKeyboardStateChange();
      this.renderSelectedRowControls();
      this.renderSelectedKeyControls();
      this.renderGrid();
    });

    field.append(name, input);
    this.selectedRowContent.append(header, field);
  }

  private renderSelectedKeyControls(): void {
    if (!this.selectedKeyContent) {
      return;
    }

    this.selectedKeyContent.replaceChildren();

    if (this.selectedPosition === null) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-slate-500";
      empty.textContent = "Click a key in the preview to edit it.";
      this.selectedKeyContent.append(empty);
      this.syncTextInputForFocus(this.root);
      return;
    }

    const index = this.getSelectedKeyIndex();
    if (index === null) {
      return;
    }
    const layout = this.getKeyLayout(index);
    const override = this.getKeyOverride(index);
    const unitStep = 1 / KEY_EIGHTHS;
    const offsetUMax = this.eighthsToUnits(KEY_OFFSET_EIGHTHS_MAX);
    const sizeUMin = this.eighthsToUnits(KEY_SIZE_EIGHTHS_DEFAULT);
    const sizeUMax = this.eighthsToUnits(KEY_SIZE_EIGHTHS_MAX);

    const title = document.createElement("p");
    title.className = "text-xs font-medium text-slate-300";
    title.textContent = `Key ${index + 1} · row ${layout.row + 1}, col ${layout.col + 1}`;

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className =
      "shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => this.resetKeyOverride(index));

    const header = document.createElement("div");
    header.className = "flex items-center justify-between gap-2";
    header.append(title, reset);

    this.selectedKeyContent.append(
      header,
      this.createInlineFieldRow(
        this.createKeyNumberField(
          "X",
          this.eighthsToUnits(override.offsetX),
          0,
          offsetUMax,
          unitStep,
          (value) => {
            this.setKeyOverride(index, {
              offsetX: this.clampUnitsToEighths(
                value,
                KEY_OFFSET_EIGHTHS_MIN,
                KEY_OFFSET_EIGHTHS_MAX,
              ),
            });
            this.renderGrid();
          },
          true,
        ),
        this.createKeyNumberField(
          "Y",
          this.eighthsToUnits(override.offsetY),
          0,
          offsetUMax,
          unitStep,
          (value) => {
            this.setKeyOverride(index, {
              offsetY: this.clampUnitsToEighths(
                value,
                KEY_OFFSET_EIGHTHS_MIN,
                KEY_OFFSET_EIGHTHS_MAX,
              ),
            });
            this.renderGrid();
          },
          true,
        ),
      ),
      this.createInlineFieldRow(
        this.createKeyNumberField(
          "W",
          this.eighthsToUnits(override.width ?? KEY_SIZE_EIGHTHS_DEFAULT),
          sizeUMin,
          sizeUMax,
          unitStep,
          (value) => {
            const eighths = this.clampUnitsToEighths(
              value,
              KEY_SIZE_EIGHTHS_DEFAULT,
              KEY_SIZE_EIGHTHS_MAX,
            );
            this.setKeyOverride(index, {
              width:
                eighths === KEY_SIZE_EIGHTHS_DEFAULT ? undefined : eighths,
            });
            this.renderGrid();
          },
          true,
        ),
        this.createKeyNumberField(
          "H",
          this.eighthsToUnits(override.height ?? KEY_SIZE_EIGHTHS_DEFAULT),
          sizeUMin,
          sizeUMax,
          unitStep,
          (value) => {
            const eighths = this.clampUnitsToEighths(
              value,
              KEY_SIZE_EIGHTHS_DEFAULT,
              KEY_SIZE_EIGHTHS_MAX,
            );
            this.setKeyOverride(index, {
              height:
                eighths === KEY_SIZE_EIGHTHS_DEFAULT ? undefined : eighths,
            });
            this.renderGrid();
          },
          true,
        ),
      ),
      this.createInlineFieldRow(
        this.createKeySelectField(
          "Finger",
          override.finger,
          KEY_FINGER_OPTIONS,
          (value) => {
            this.setKeyOverride(index, { finger: value });
            this.renderGrid();
          },
          true,
        ),
        this.createKeySelectField(
          "Hand",
          override.hand,
          KEY_HAND_OPTIONS,
          (value) => {
            this.setKeyOverride(index, { hand: value });
            this.renderGrid();
          },
          true,
        ),
      ),
    );
    this.syncTextInputForFocus(this.root);
  }

  private createKeySelectField<T extends string>(
    label: string,
    value: T | undefined,
    options: Array<{ value: T; label: string }>,
    onChange: (value: T | undefined) => void,
    inline = false,
  ): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = inline
      ? "block min-w-0 space-y-1"
      : "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = label;

    const select = document.createElement("select");
    select.className =
      "w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "—";
    select.append(emptyOption);

    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.append(item);
    }

    select.value = value ?? "";
    select.addEventListener(
      "change",
      () => {
        onChange((select.value || undefined) as T | undefined);
      },
      { signal: this.abort.signal },
    );

    field.append(name, select);
    return field;
  }

  private styleKeyCell(
    cell: HTMLDivElement,
    override: KeyOverride,
    selected: boolean,
  ): void {
    const color = keyFingerHandColor(
      override.finger,
      override.hand,
      this.fingerPalette,
    );
    cell.style.backgroundColor = color ?? "";

    if (selected) {
      cell.className = color
        ? "absolute rounded-sm border-2 border-indigo-400 shadow-sm select-none"
        : "absolute rounded-sm border-2 border-indigo-400 bg-indigo-950 shadow-sm select-none";
    } else {
      cell.className = color
        ? "absolute rounded-sm border border-slate-600 shadow-sm select-none hover:border-slate-400"
        : "absolute rounded-sm border border-slate-600 bg-slate-800 shadow-sm select-none hover:border-slate-400";
    }
  }

  private styleKeyLabel(
    label: HTMLSpanElement,
    override: KeyOverride,
    selected: boolean,
  ): void {
    const colored =
      keyFingerHandColor(
        override.finger,
        override.hand,
        this.fingerPalette,
      ) !== null;
    if (colored || selected) {
      label.className =
        "flex h-full items-center justify-center text-[10px] text-slate-950 select-none pointer-events-none";
      return;
    }

    label.className =
      "flex h-full items-center justify-center text-[10px] text-slate-500 select-none pointer-events-none";
  }

  private createKeyboardNameField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = "Name";

    const input = document.createElement("input");
    input.type = "text";
    input.value = this.keyboard.name;
    input.placeholder = "Keyboard name";
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";
    this.nameInput = input;

    input.addEventListener(
      "input",
      () => {
        this.keyboard.name = input.value;
        this.notifyKeyboardStateChange();
      },
      { signal: this.abort.signal },
    );

    field.append(name, input);
    return field;
  }

  private createKeyboardNumberField(
    label: string,
    key: "rows" | "cols",
    min: number,
    max: number,
    step: number,
    inline = false,
  ): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = inline
      ? "block min-w-0 space-y-1"
      : "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.keyboard[key]);
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    if (key === "rows") {
      this.rowsInput = input;
    } else {
      this.colsInput = input;
    }

    input.addEventListener(
      "input",
      () => {
        const value = Number(input.value);
        if (Number.isNaN(value)) {
          return;
        }

        this.keyboard[key] = Math.min(max, Math.max(min, value));
        input.value = String(this.keyboard[key]);
        this.syncKeyboardKeys();
        this.notifyKeyboardStateChange();
        this.renderSelectedRowControls();
        this.renderSelectedKeyControls();
        this.renderGrid();
      },
      { signal: this.abort.signal },
    );

    field.append(name, input);
    return field;
  }

  private createPaletteSourceField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Source";

    const select = document.createElement("select");
    select.className =
      "w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";
    this.paletteSourceSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.paletteSource = select.value;
        this.populatePaletteEntrySelect();
        this.syncPaletteSourceUi();
        void this.applyPaletteSelection();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createPaletteEntryField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";
    this.paletteEntryField = field;

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Palette";

    const select = document.createElement("select");
    select.className =
      "w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
    this.paletteEntrySelect = select;

    select.addEventListener(
      "change",
      () => {
        this.selectedPaletteEntryId = select.value || null;
        void this.applyPaletteSelection();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private syncPaletteSourceUi(): void {
    if (!this.paletteEntryField || !this.paletteEntrySelect) {
      return;
    }

    const editorSource = this.paletteSource === PALETTE_EDITOR_SOURCE;
    this.paletteEntryField.classList.toggle("opacity-50", editorSource);
    this.paletteEntrySelect.disabled = editorSource;
  }

  private isPaletteEditorAvailable(): boolean {
    return (
      this.statePool?.has(FINGER_PALETTE_EDITOR_TYPE, FINGER_PALETTE_KEY) ??
      false
    );
  }

  private getDefaultStaticPaletteSelection(): {
    libraryId: string;
    entryId: string;
  } | null {
    const defaultLibrary = this.staticPaletteLibraries.find(
      (library) => library.info.id === DEFAULT_PALETTE_LIBRARY_ID,
    );
    if (defaultLibrary) {
      const classic = defaultLibrary.entries.find(
        (entry) => entry.id === DEFAULT_PALETTE_ENTRY_ID,
      );
      if (classic) {
        return {
          libraryId: defaultLibrary.info.id,
          entryId: classic.id,
        };
      }

      const firstEntry = defaultLibrary.entries[0];
      if (firstEntry) {
        return {
          libraryId: defaultLibrary.info.id,
          entryId: firstEntry.id,
        };
      }
    }

    const firstLibrary = this.staticPaletteLibraries[0];
    const firstEntry = firstLibrary?.entries[0];
    if (!firstLibrary || !firstEntry) {
      return null;
    }

    return {
      libraryId: firstLibrary.info.id,
      entryId: firstEntry.id,
    };
  }

  private setDefaultPaletteSource(): void {
    const defaults = this.getDefaultStaticPaletteSelection();
    if (defaults) {
      this.paletteSource = defaults.libraryId;
      this.selectedPaletteEntryId = defaults.entryId;
      return;
    }

    this.paletteSource = PALETTE_USER_SOURCE;
    this.selectedPaletteEntryId = null;
  }

  private onPaletteEditorPoolChange(): void {
    this.populatePaletteSourceSelect();

    if (
      this.paletteSource === PALETTE_EDITOR_SOURCE &&
      this.isPaletteEditorAvailable()
    ) {
      this.syncPaletteFromPool();
      return;
    }

    void this.applyPaletteSelection();
  }

  private async revertToDefaultPaletteSource(): Promise<void> {
    const defaults = this.getDefaultStaticPaletteSelection();
    if (!defaults) {
      return;
    }

    if (
      this.paletteSource === defaults.libraryId &&
      this.selectedPaletteEntryId === defaults.entryId
    ) {
      return;
    }

    this.paletteSource = defaults.libraryId;
    this.selectedPaletteEntryId = defaults.entryId;
    this.populatePaletteSourceSelect();
    await this.applyPaletteSelection();
  }

  private async loadPaletteLibraries(): Promise<void> {
    try {
      this.staticPaletteLibraries = await loadAllStaticPaletteLibraries(
        this.abort.signal,
      );
      this.populatePaletteSourceSelect();
      await this.applyPaletteSelection();
    } catch {
      if (this.abort.signal.aborted) {
        return;
      }

      this.staticPaletteLibraries = [];
      this.populatePaletteSourceSelect();
      await this.revertToDefaultPaletteSource();
    }
  }

  private populatePaletteSourceSelect(): void {
    if (!this.paletteSourceSelect) {
      return;
    }

    const selected = this.paletteSource;
    const editorAvailable = this.isPaletteEditorAvailable();
    this.paletteSourceSelect.replaceChildren();

    if (editorAvailable) {
      const editorOption = document.createElement("option");
      editorOption.value = PALETTE_EDITOR_SOURCE;
      editorOption.textContent = "Palette Editor";
      this.paletteSourceSelect.append(editorOption);
    }

    for (const library of this.staticPaletteLibraries) {
      const option = document.createElement("option");
      option.value = library.info.id;
      option.textContent = library.info.label;
      this.paletteSourceSelect.append(option);
    }

    const userOption = document.createElement("option");
    userOption.value = PALETTE_USER_SOURCE;
    userOption.textContent = "User library";
    this.paletteSourceSelect.append(userOption);

    const validSource =
      (selected === PALETTE_EDITOR_SOURCE && editorAvailable) ||
      selected === PALETTE_USER_SOURCE ||
      this.staticPaletteLibraries.some((library) => library.info.id === selected);

    if (!validSource) {
      this.setDefaultPaletteSource();
    } else {
      this.paletteSource = selected;
    }

    this.paletteSourceSelect.value = this.paletteSource;
    this.syncPaletteSourceUi();
    this.populatePaletteEntrySelect();
  }

  private populatePaletteEntrySelect(): void {
    if (!this.paletteEntrySelect) {
      return;
    }

    this.paletteEntrySelect.replaceChildren();

    if (this.paletteSource === PALETTE_EDITOR_SOURCE) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "—";
      this.paletteEntrySelect.append(placeholder);
      this.selectedPaletteEntryId = null;
      return;
    }

    if (this.paletteSource === PALETTE_USER_SOURCE) {
      const palettes = listUserPalettes();
      if (palettes.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No palettes saved";
        this.paletteEntrySelect.append(placeholder);
        this.selectedPaletteEntryId = null;
        return;
      }

      for (const entry of palettes) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        this.paletteEntrySelect.append(option);
      }

      if (
        this.selectedPaletteEntryId &&
        palettes.some((entry) => entry.id === this.selectedPaletteEntryId)
      ) {
        this.paletteEntrySelect.value = this.selectedPaletteEntryId;
        return;
      }

      this.selectedPaletteEntryId = palettes[0].id;
      this.paletteEntrySelect.value = this.selectedPaletteEntryId;
      return;
    }

    const library = this.staticPaletteLibraries.find(
      (item) => item.info.id === this.paletteSource,
    );
    if (!library || library.entries.length === 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "No palettes available";
      this.paletteEntrySelect.append(placeholder);
      this.selectedPaletteEntryId = null;
      return;
    }

    for (const entry of library.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      this.paletteEntrySelect.append(option);
    }

    if (
      this.selectedPaletteEntryId &&
      library.entries.some((entry) => entry.id === this.selectedPaletteEntryId)
    ) {
      this.paletteEntrySelect.value = this.selectedPaletteEntryId;
      return;
    }

    this.selectedPaletteEntryId = library.entries[0].id;
    this.paletteEntrySelect.value = this.selectedPaletteEntryId;
  }

  private getSelectedStaticPaletteEntry():
    | { libraryId: string; entry: StaticPaletteLibrary["entries"][number] }
    | null {
    if (
      this.paletteSource === PALETTE_EDITOR_SOURCE ||
      this.paletteSource === PALETTE_USER_SOURCE
    ) {
      return null;
    }

    const library = this.staticPaletteLibraries.find(
      (item) => item.info.id === this.paletteSource,
    );
    if (!library) {
      return null;
    }

    const entry = library.entries.find(
      (item) => item.id === this.selectedPaletteEntryId,
    );
    if (!entry) {
      return null;
    }

    return { libraryId: library.info.id, entry };
  }

  private paletteCacheKey(libraryId: string, entryId: string): string {
    return `${libraryId}:${entryId}`;
  }

  private colorsFromPaletteData(data: FingerPaletteData): FingerHandPalette {
    return {
      pinky: data.pinky,
      ring: data.ring,
      middle: data.middle,
      leftIndex: data.leftIndex,
      rightIndex: data.rightIndex,
      leftThumb: data.leftThumb,
      rightThumb: data.rightThumb,
    };
  }

  private syncPaletteFromPool(): void {
    if (this.paletteSource !== PALETTE_EDITOR_SOURCE) {
      return;
    }

    if (!this.isPaletteEditorAvailable()) {
      void this.revertToDefaultPaletteSource();
      return;
    }

    const palette = this.statePool?.get<FingerHandPalette>(
      FINGER_PALETTE_EDITOR_TYPE,
      FINGER_PALETTE_KEY,
    );
    if (!palette) {
      void this.revertToDefaultPaletteSource();
      return;
    }

    this.fingerPalette = { ...palette };
    this.renderGrid();
  }

  private async applyPaletteSelection(): Promise<void> {
    if (this.paletteSource === PALETTE_EDITOR_SOURCE) {
      if (!this.isPaletteEditorAvailable()) {
        await this.revertToDefaultPaletteSource();
        return;
      }

      this.syncPaletteFromPool();
      return;
    }

    if (this.paletteSource === PALETTE_USER_SOURCE) {
      if (!this.selectedPaletteEntryId) {
        if (this.getDefaultStaticPaletteSelection()) {
          await this.revertToDefaultPaletteSource();
        }
        return;
      }

      const data = loadUserPalette(this.selectedPaletteEntryId);
      if (!data) {
        await this.revertToDefaultPaletteSource();
        return;
      }

      this.fingerPalette = this.colorsFromPaletteData(data);
      this.renderGrid();
      return;
    }

    const selected = this.getSelectedStaticPaletteEntry();
    if (!selected) {
      await this.revertToDefaultPaletteSource();
      return;
    }

    const cacheKey = this.paletteCacheKey(
      selected.libraryId,
      selected.entry.id,
    );
    const cached = this.paletteLibraryCache.get(cacheKey);
    if (cached) {
      this.fingerPalette = { ...cached };
      this.renderGrid();
      return;
    }

    try {
      const data = await loadStaticPalette(
        selected.libraryId,
        selected.entry.file,
        this.abort.signal,
      );
      const colors = this.colorsFromPaletteData(data);
      this.paletteLibraryCache.set(cacheKey, colors);

      const current = this.getSelectedStaticPaletteEntry();
      if (
        current &&
        current.libraryId === selected.libraryId &&
        current.entry.id === selected.entry.id
      ) {
        this.fingerPalette = { ...colors };
        this.renderGrid();
      }
    } catch {
      if (this.abort.signal.aborted) {
        return;
      }

      await this.revertToDefaultPaletteSource();
    }
  }

  private createCosmeticsNumberField(
    label: string,
    key: keyof KeyboardShaperCosmetics,
    min: number,
    max: number,
    step: number,
    inline = false,
  ): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = inline
      ? "block min-w-0 space-y-1"
      : "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.cosmetics[key]);
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    input.addEventListener(
      "input",
      () => {
        const value = Number(input.value);
        if (Number.isNaN(value)) {
          return;
        }

        this.cosmetics[key] = Math.min(max, Math.max(min, value));
        input.value = String(this.cosmetics[key]);
        this.renderSelectedRowControls();
        this.renderSelectedKeyControls();
        this.renderGrid();
      },
      { signal: this.abort.signal },
    );

    field.append(name, input);
    return field;
  }

  private createInlineFieldRow(
    ...fields: HTMLLabelElement[]
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className =
      fields.length === 3
        ? "grid grid-cols-3 gap-2"
        : "grid grid-cols-2 gap-2";
    row.append(...fields);
    return row;
  }

  private createKeyNumberField(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
    inline = false,
  ): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = inline
      ? "block min-w-0 space-y-1"
      : "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    input.addEventListener("input", () => {
      const next = Number(input.value);
      if (Number.isNaN(next)) {
        return;
      }

      const clamped = this.snapUnits(Math.min(max, Math.max(min, next)));
      input.value = String(clamped);
      onChange(clamped);
    });

    field.append(name, input);
    return field;
  }

  private createFlowField(inline = false): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = inline
      ? "block min-w-0 space-y-1"
      : "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = "Flow";

    const select = document.createElement("select");
    select.className =
      "w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500";

    for (const option of [
      { value: "horizontal", label: "Horizontal" },
      { value: "vertical", label: "Vertical" },
    ]) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.append(el);
    }

    select.value = this.keyboard.flow;
    this.flowSelect = select;
    select.addEventListener(
      "change",
      () => {
        this.keyboard.flow = select.value as FlowDirection;
        this.keyboard.clearLineKeyCounts();
        this.syncKeyboardKeys();
        this.notifyKeyboardStateChange();
        this.renderSelectedRowControls();
        this.renderSelectedKeyControls();
        this.renderGrid();
      },
      { signal: this.abort.signal },
    );

    field.append(name, select);
    return field;
  }

  private renderGrid(): void {
    if (!this.preview || !this.summary) {
      return;
    }

    const { rows, cols, flow } = this.keyboard;
    const { keySize } = this.cosmetics;
    const count = this.keyboard.keyCount;
    const layouts = this.computeLayouts();

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
      const selected =
        this.selectedPosition !== null &&
        layout.row === this.selectedPosition.row &&
        layout.col === this.selectedPosition.col;

      const override = this.getKeyOverride(layout.index);

      const cell = document.createElement("div");
      this.styleKeyCell(cell, override, selected);
      cell.style.left = `${layout.x}px`;
      cell.style.top = `${layout.y}px`;
      cell.style.width = `${layout.width}px`;
      cell.style.height = `${layout.height}px`;
      cell.title = `Key ${layout.index + 1} (row ${layout.row + 1}, col ${layout.col + 1})`;

      this.attachKeyInteraction(cell, layout.index);

      const label = document.createElement("span");
      this.styleKeyLabel(label, override, selected);
      label.textContent = String(layout.index + 1);
      cell.append(label);

      this.preview.append(cell);
    }

    const selectedIndex = this.getSelectedKeyIndex();
    const selectedLabel =
      selectedIndex === null ? "none" : `#${selectedIndex + 1}`;
    this.summary.textContent = `${rows}×${cols} · ${count} keys · ${flow} · key size ${keySize}px · selected ${selectedLabel}`;
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }
}

export class KeyboardShaperContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new KeyboardShaperContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Keyboard Shaper";
  }
}
