import {
  ContentInstance,
  ContentType,
  createStateProvider,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  DEFAULT_FINGER_HAND_PALETTE,
  loadStaticPalette,
  loadUserPalette,
  saveUserPalette,
  type FingerHandPalette,
  type FingerPaletteData,
} from "../../kbts/keyboard/index.js";
import { ColorWheel } from "./ColorWheel.js";
import {
  PaletteLoadModal,
  type PaletteLoadSelection,
} from "./PaletteLoadModal.js";
import { PaletteSaveModal } from "./PaletteSaveModal.js";

type PaletteSlotKey = keyof FingerHandPalette;

interface PaletteSlotDefinition {
  key: PaletteSlotKey;
  label: string;
}

export const FINGER_PALETTE_EDITOR_TYPE = "finger-palette-editor";
export const FINGER_PALETTE_KEY = "palette";
export const FINGER_PALETTE_NAME_KEY = "name";

const DEFAULT_PALETTE_NAME = "";

const PALETTE_SLOTS: PaletteSlotDefinition[] = [
  { key: "pinky", label: "Pinky" },
  { key: "ring", label: "Ring" },
  { key: "middle", label: "Middle" },
  { key: "leftIndex", label: "Left index" },
  { key: "rightIndex", label: "Right index" },
  { key: "leftThumb", label: "Left thumb" },
  { key: "rightThumb", label: "Right thumb" },
];

class FingerPaletteEditorContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private paletteName = DEFAULT_PALETTE_NAME;
  private readonly palette: FingerHandPalette = {
    ...DEFAULT_FINGER_HAND_PALETTE,
  };
  private selectedSlot: PaletteSlotKey = "pinky";
  private readonly swatches = new Map<PaletteSlotKey, HTMLButtonElement>();
  private readonly colorWheel = new ColorWheel();
  private nameInput: HTMLInputElement | null = null;
  private selectedLabel: HTMLSpanElement | null = null;
  private hexValue: HTMLSpanElement | null = null;
  private statePool: StatePool | null = null;
  private readonly loadModal: PaletteLoadModal;
  private readonly saveModal: PaletteSaveModal;
  private readonly abort = new AbortController();

  constructor(panelId: string) {
    super(panelId);
    this.loadModal = new PaletteLoadModal({
      onSelect: (selection) => {
        void this.handleLoadSelection(selection);
      },
    });
    this.saveModal = new PaletteSaveModal({
      getName: () => this.paletteName,
      onSave: (name) => {
        saveUserPalette(name, this.getPaletteData());
        this.paletteName = name.trim();
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
      "flex h-full w-full min-h-0 flex-col overflow-auto bg-slate-950 p-4 text-slate-100";

    const hint = document.createElement("p");
    hint.className = "shrink-0 text-xs leading-relaxed text-slate-500";
    hint.textContent =
      "Select a swatch, then use the color wheel to edit that finger color.";

    const card = document.createElement("div");
    card.className =
      "mt-3 w-full max-w-xs shrink-0 rounded-md border border-slate-800 bg-slate-900/60 p-3 space-y-2";

    card.append(this.createNameField(), this.createPaletteSwatches());

    const editor = document.createElement("div");
    editor.className =
      "mt-3 flex w-full max-w-xs shrink-0 flex-col rounded-md border border-slate-800 bg-slate-900/60 p-3";

    const editorHeading = document.createElement("div");
    editorHeading.className = "flex items-center justify-between gap-2";

    const editorTitle = document.createElement("span");
    editorTitle.className = "shrink-0 text-xs font-medium text-slate-300";
    editorTitle.textContent = "Color wheel";

    this.selectedLabel = document.createElement("span");
    this.selectedLabel.className =
      "min-w-0 truncate text-right text-xs text-slate-500";
    this.updateSelectedLabel();

    editorHeading.append(editorTitle, this.selectedLabel);

    const wheelWrap = document.createElement("div");
    wheelWrap.className = "flex justify-center";
    wheelWrap.append(this.colorWheel.getElement());

    const hexRow = document.createElement("div");
    hexRow.className =
      "mt-2 flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5";

    const hexLabel = document.createElement("span");
    hexLabel.className = "text-xs text-slate-500";
    hexLabel.textContent = "Hex";

    this.hexValue = document.createElement("span");
    this.hexValue.className = "font-mono text-xs text-slate-200";
    this.updateHexValue();

    hexRow.append(hexLabel, this.hexValue);
    editor.append(editorHeading, wheelWrap, hexRow);

    this.colorWheel.setColor(this.palette[this.selectedSlot]);
    this.colorWheel.onChange((hex) => {
      this.palette[this.selectedSlot] = hex;
      this.updateSwatch(this.selectedSlot, hex);
      this.updateHexValue();
      this.notifyPaletteChange();
    });

    this.root.append(
      hint,
      this.createLoadSaveButtons(),
      card,
      editor,
    );
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

  exposeState(pool: StatePool, panel: Panel): () => void {
    this.statePool = pool;
    return pool.register(
      createStateProvider(panel.contentType, {
        palette: () => ({ ...this.palette }),
        name: () => this.paletteName,
      }),
    );
  }

  destroy(): void {
    this.abort.abort();
    this.loadModal.destroy();
    this.saveModal.destroy();
    this.deactivate();
    this.root = null;
    this.swatches.clear();
    this.nameInput = null;
    this.selectedLabel = null;
    this.hexValue = null;
    this.statePool = null;
  }

  private createLoadSaveButtons(): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "mt-2 grid max-w-xs grid-cols-2 gap-2";

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
    selection: PaletteLoadSelection,
  ): Promise<void> {
    try {
      const data =
        selection.library === "static"
          ? await loadStaticPalette(
              selection.libraryId,
              selection.entry.file,
              this.abort.signal,
            )
          : loadUserPalette(selection.id);

      if (!data) {
        return;
      }

      this.applyPaletteData(data);
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load finger palette", error);
    }
  }

  private getPaletteData(): FingerPaletteData {
    return {
      name: this.paletteName,
      ...this.palette,
    };
  }

  private applyPaletteData(data: FingerPaletteData): void {
    this.paletteName = data.name;
    this.syncNameField();

    for (const slot of PALETTE_SLOTS) {
      this.palette[slot.key] = data[slot.key];
      this.updateSwatch(slot.key, data[slot.key]);
    }

    this.colorWheel.setColor(this.palette[this.selectedSlot]);
    this.updateHexValue();
    this.notifyPaletteChange();
    this.notifyNameChange();
  }

  private syncNameField(): void {
    if (this.nameInput) {
      this.nameInput.value = this.paletteName;
    }
  }

  private notifyPaletteChange(): void {
    this.statePool?.notifyChange(FINGER_PALETTE_EDITOR_TYPE, FINGER_PALETTE_KEY);
  }

  private notifyNameChange(): void {
    this.statePool?.notifyChange(FINGER_PALETTE_EDITOR_TYPE, FINGER_PALETTE_NAME_KEY);
  }

  private createNameField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = "Name";

    const input = document.createElement("input");
    input.type = "text";
    input.value = this.paletteName;
    input.placeholder = "Palette name";
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-500";
    this.nameInput = input;

    input.addEventListener(
      "input",
      () => {
        this.paletteName = input.value;
        this.notifyNameChange();
      },
      { signal: this.abort.signal },
    );

    field.append(name, input);
    return field;
  }

  private createPaletteSwatches(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "space-y-2";

    section.append(
      this.createInlineFieldRow(
        this.createPaletteSwatchField("pinky"),
        this.createPaletteSwatchField("ring"),
        this.createPaletteSwatchField("middle"),
      ),
      this.createInlineFieldRow(
        this.createPaletteSwatchField("leftIndex"),
        this.createPaletteSwatchField("rightIndex"),
      ),
      this.createInlineFieldRow(
        this.createPaletteSwatchField("leftThumb"),
        this.createPaletteSwatchField("rightThumb"),
      ),
    );

    return section;
  }

  private createPaletteSwatchField(key: PaletteSlotKey): HTMLDivElement {
    const slot = PALETTE_SLOTS.find((entry) => entry.key === key);
    if (!slot) {
      throw new Error(`Unknown palette slot: ${key}`);
    }

    const field = document.createElement("div");
    field.className = "block min-w-0 space-y-1";

    const name = document.createElement("span");
    name.className = "text-xs text-slate-400";
    name.textContent = slot.label;

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className =
      "h-6 w-full rounded border shadow-inner transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70";
    swatch.style.backgroundColor = this.palette[key];
    swatch.title = `${slot.label}: ${this.palette[key]}`;
    swatch.setAttribute("aria-pressed", key === this.selectedSlot ? "true" : "false");
    swatch.addEventListener("click", () => {
      this.selectSlot(key);
    });

    this.applySwatchSelectionStyle(swatch, key === this.selectedSlot);
    this.swatches.set(key, swatch);

    field.append(name, swatch);
    return field;
  }

  private selectSlot(key: PaletteSlotKey): void {
    this.selectedSlot = key;
    this.updateSelectedLabel();
    this.updateHexValue();
    this.colorWheel.setColor(this.palette[key]);

    for (const [slotKey, swatch] of this.swatches) {
      const selected = slotKey === key;
      swatch.setAttribute("aria-pressed", selected ? "true" : "false");
      this.applySwatchSelectionStyle(swatch, selected);
    }
  }

  private applySwatchSelectionStyle(
    swatch: HTMLButtonElement,
    selected: boolean,
  ): void {
    swatch.className = selected
      ? "h-6 w-full rounded border-2 border-sky-400 shadow-inner transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70"
      : "h-6 w-full rounded border border-slate-700 shadow-inner transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70";
  }

  private updateSwatch(key: PaletteSlotKey, color: string): void {
    const swatch = this.swatches.get(key);
    if (!swatch) {
      return;
    }

    const slot = PALETTE_SLOTS.find((entry) => entry.key === key);
    swatch.style.backgroundColor = color;
    swatch.title = `${slot?.label ?? key}: ${color}`;
  }

  private updateSelectedLabel(): void {
    if (!this.selectedLabel) {
      return;
    }

    const slot = PALETTE_SLOTS.find((entry) => entry.key === this.selectedSlot);
    this.selectedLabel.textContent = `Editing ${slot?.label ?? this.selectedSlot}`;
  }

  private updateHexValue(): void {
    if (!this.hexValue) {
      return;
    }

    this.hexValue.textContent = this.palette[this.selectedSlot];
  }

  private createInlineFieldRow(
    ...fields: HTMLDivElement[]
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className =
      fields.length === 3
        ? "grid grid-cols-3 gap-2"
        : "grid grid-cols-2 gap-2";
    row.append(...fields);
    return row;
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }
}

export class FingerPaletteEditorContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new FingerPaletteEditorContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Finger Palette Editor";
  }
}
