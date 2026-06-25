import {
  ContentInstance,
  ContentType,
  createStateProvider,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  loadAllStaticCorpusLibraries,
  loadMonkeyTypeQuotesCorpus,
  loadMonkeyTypeQuotesManifest,
  loadMonkeyTypeWordsCorpus,
  loadMonkeyTypeWordsManifest,
  loadStaticCorpus,
  loadUserCorpus,
  listUserCorpora,
  saveUserCorpus,
  type CorpusDocument,
  type MonkeyTypeLanguageGroup,
  type StaticCorpusLibrary,
} from "../../kbts/corpus/index.js";
import {
  CorpusLoadModal,
  type CorpusLoadSelection,
} from "./CorpusLoadModal.js";
import { CorpusSaveModal } from "./CorpusSaveModal.js";

export const CORPUS_PANEL_TYPE = "corpus";
export const CORPUS_NAME_KEY = "name";
export const CORPUS_TEXT_KEY = "text";

const USER_LIBRARY_SOURCE = "user";
const MONKEYTYPE_WORDS_SOURCE = "monkeytype-words";
const MONKEYTYPE_QUOTES_SOURCE = "monkeytype-quotes";
const DEFAULT_CORPUS_NAME = "";

class CorpusPanelContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private corpusField: HTMLLabelElement | null = null;
  private corpusSelect: HTMLSelectElement | null = null;
  private lineNumbersEl: HTMLDivElement | null = null;
  private lineNumberObserver: ResizeObserver | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private status: HTMLSpanElement | null = null;
  private statePool: StatePool | null = null;
  private corpusName = DEFAULT_CORPUS_NAME;
  private corpusText = "";
  private source = "";
  private selectedCorpusId: string | null = null;
  private staticLibraries: StaticCorpusLibrary[] = [];
  private monkeyTypeWordsGroups: MonkeyTypeLanguageGroup[] = [];
  private monkeyTypeQuotesGroups: MonkeyTypeLanguageGroup[] = [];
  private loadingFromDropdown = false;
  private readonly loadModal: CorpusLoadModal;
  private readonly saveModal: CorpusSaveModal;
  private readonly abort = new AbortController();

  constructor(panelId: string) {
    super(panelId);
    this.loadModal = new CorpusLoadModal({
      onSelect: (selection) => {
        void this.handleLoadSelection(selection);
      },
    });
    this.saveModal = new CorpusSaveModal({
      getName: () => this.corpusName,
      onSave: (name) => {
        const id = saveUserCorpus(name, this.getCorpusDocument(name.trim()));
        this.corpusName = name.trim();
        this.syncNameField();
        this.notifyNameChange();
        this.source = USER_LIBRARY_SOURCE;
        this.selectedCorpusId = id;
        if (this.sourceSelect) {
          this.sourceSelect.value = this.source;
        }
        this.populateCorpusSelect();
        this.syncTextInputForFocus(this.root);
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
    title.textContent = "Corpus library";

    this.status = document.createElement("span");
    this.status.className = "font-mono text-xs text-slate-500";

    titleRow.append(title, this.status);

    const controls = document.createElement("div");
    controls.className = "grid grid-cols-2 gap-2";
    controls.append(this.createSourceField(), this.createCorpusField());

    header.append(titleRow, controls);

    const body = document.createElement("div");
    body.className = "flex min-h-0 flex-1";

    const sidebar = document.createElement("aside");
    sidebar.className =
      "flex w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-800 px-3 py-3";

    const hint = document.createElement("p");
    hint.className = "text-xs leading-relaxed text-slate-500";
    hint.textContent =
      "Edit corpus text directly, or load from a library with the header dropdowns or Load button.";

    sidebar.append(this.createLoadSaveButtons(), hint, this.createNameField());

    const main = document.createElement("div");
    main.className = "flex min-h-0 min-w-0 flex-1 flex-col";

    main.append(this.createEditor());
    body.append(sidebar, main);
    this.root.append(header, body);
    this.updateStatus();
    void this.loadLibraries();
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.syncTextInputForFocus(this.root);
  }

  deactivate(): void {
    this.root?.remove();
  }

  exposeState(pool: StatePool, panel: Panel): () => void {
    this.statePool = pool;
    return pool.register(
      createStateProvider(panel.contentType, {
        name: () => this.corpusName,
        text: () => this.corpusText,
      }),
    );
  }

  destroy(): void {
    this.abort.abort();
    this.loadModal.destroy();
    this.saveModal.destroy();
    this.deactivate();
    this.root = null;
    this.nameInput = null;
    this.sourceSelect = null;
    this.corpusField = null;
    this.corpusSelect = null;
    this.lineNumbersEl = null;
    this.lineNumberObserver?.disconnect();
    this.lineNumberObserver = null;
    this.textarea = null;
    this.status = null;
    this.statePool = null;
    this.corpusName = DEFAULT_CORPUS_NAME;
    this.corpusText = "";
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }

  private createEditor(): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "flex min-h-0 flex-1 overflow-hidden";

    this.lineNumbersEl = document.createElement("div");
    this.lineNumbersEl.className =
      "shrink-0 overflow-hidden border-r border-slate-800 bg-slate-950 py-4 pl-2 pr-3 text-right font-mono text-sm leading-relaxed whitespace-pre text-slate-600 select-none";
    this.lineNumbersEl.setAttribute("aria-hidden", "true");

    this.textarea = document.createElement("textarea");
    this.textarea.value = this.corpusText;
    this.textarea.spellcheck = false;
    this.textarea.placeholder = "Enter corpus text…";
    this.textarea.className =
      "min-h-0 min-w-0 flex-1 resize-none bg-transparent py-4 pl-4 pr-4 font-mono text-sm leading-relaxed text-slate-100 outline-none";
    this.textarea.addEventListener(
      "input",
      () => {
        this.corpusText = this.textarea?.value ?? "";
        this.scheduleLineNumberUpdate();
        this.updateStatus();
        this.notifyTextChange();
      },
      { signal: this.abort.signal },
    );
    this.textarea.addEventListener(
      "scroll",
      () => {
        if (this.lineNumbersEl && this.textarea) {
          this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
        }
      },
      { signal: this.abort.signal },
    );

    this.lineNumberObserver = new ResizeObserver(() => {
      this.updateLineNumbers();
    });
    this.lineNumberObserver.observe(this.textarea);

    wrapper.append(this.lineNumbersEl, this.textarea);
    this.scheduleLineNumberUpdate();
    return wrapper;
  }

  private getVisualLineCount(textarea: HTMLTextAreaElement): number {
    const style = getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      return Math.max(1, textarea.value.split("\n").length);
    }

    const paddingTop = Number.parseFloat(style.paddingTop);
    const paddingBottom = Number.parseFloat(style.paddingBottom);
    const contentHeight =
      textarea.scrollHeight - paddingTop - paddingBottom;

    return Math.max(1, Math.ceil(contentHeight / lineHeight));
  }

  private scheduleLineNumberUpdate(): void {
    this.updateLineNumbers();
    requestAnimationFrame(() => {
      this.updateLineNumbers();
    });
  }

  private updateLineNumbers(): void {
    if (!this.lineNumbersEl || !this.textarea) {
      return;
    }

    const lineCount = this.getVisualLineCount(this.textarea);
    const widthCh = Math.max(2, String(lineCount).length + 1);
    this.lineNumbersEl.style.minWidth = `${widthCh}ch`;
    this.lineNumbersEl.textContent = Array.from(
      { length: lineCount },
      (_, index) => String(index + 1),
    ).join("\n");
    this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
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

  private createNameField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Name";

    const input = document.createElement("input");
    input.type = "text";
    input.value = this.corpusName;
    input.placeholder = "Corpus name";
    input.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-500";
    this.nameInput = input;

    input.addEventListener(
      "input",
      () => {
        this.corpusName = input.value;
        this.notifyNameChange();
      },
      { signal: this.abort.signal },
    );

    field.append(label, input);
    return field;
  }

  private createSourceField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Source";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-500";
    this.sourceSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.source = select.value;
        this.selectedCorpusId = null;
        this.populateCorpusSelect();
        if (this.source) {
          void this.loadSelectedCorpusFromDropdown();
        }
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private createCorpusField(): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "block min-w-0 space-y-1";
    this.corpusField = field;

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Corpus";

    const select = document.createElement("select");
    select.className =
      "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:opacity-50";
    this.corpusSelect = select;

    select.addEventListener(
      "change",
      () => {
        this.selectedCorpusId = select.value || null;
        void this.loadSelectedCorpusFromDropdown();
      },
      { signal: this.abort.signal },
    );

    field.append(label, select);
    return field;
  }

  private async loadLibraries(): Promise<void> {
    try {
      const [staticLibraries, monkeyTypeWordsGroups, monkeyTypeQuotesGroups] =
        await Promise.all([
          loadAllStaticCorpusLibraries(this.abort.signal),
          loadMonkeyTypeWordsManifest(this.abort.signal),
          loadMonkeyTypeQuotesManifest(this.abort.signal),
        ]);
      this.staticLibraries = staticLibraries;
      this.monkeyTypeWordsGroups = monkeyTypeWordsGroups;
      this.monkeyTypeQuotesGroups = monkeyTypeQuotesGroups;
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load corpus libraries", error);
      this.staticLibraries = [];
      this.monkeyTypeWordsGroups = [];
      this.monkeyTypeQuotesGroups = [];
    }

    this.populateSourceSelect();
    this.populateCorpusSelect();
  }

  private populateSourceSelect(): void {
    if (!this.sourceSelect) {
      return;
    }

    const selected = this.source;
    this.sourceSelect.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "—";
    this.sourceSelect.append(placeholder);

    for (const library of this.staticLibraries) {
      const option = document.createElement("option");
      option.value = library.info.id;
      option.textContent = library.info.label;
      this.sourceSelect.append(option);
    }

    if (this.monkeyTypeWordsGroups.length > 0) {
      const wordsOption = document.createElement("option");
      wordsOption.value = MONKEYTYPE_WORDS_SOURCE;
      wordsOption.textContent = "MonkeyType Words";
      this.sourceSelect.append(wordsOption);
    }

    if (this.monkeyTypeQuotesGroups.length > 0) {
      const quotesOption = document.createElement("option");
      quotesOption.value = MONKEYTYPE_QUOTES_SOURCE;
      quotesOption.textContent = "MonkeyType Quotes";
      this.sourceSelect.append(quotesOption);
    }

    const userOption = document.createElement("option");
    userOption.value = USER_LIBRARY_SOURCE;
    userOption.textContent = "User library";
    this.sourceSelect.append(userOption);

    const validSource =
      selected === USER_LIBRARY_SOURCE ||
      selected === MONKEYTYPE_WORDS_SOURCE ||
      selected === MONKEYTYPE_QUOTES_SOURCE ||
      this.staticLibraries.some((library) => library.info.id === selected);

    this.source = validSource ? selected : "";
    this.sourceSelect.value = this.source;
  }

  private populateCorpusSelect(): void {
    if (!this.corpusSelect) {
      return;
    }

    this.corpusSelect.replaceChildren();

    if (!this.source) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "—";
      this.corpusSelect.append(placeholder);
      this.selectedCorpusId = null;
      this.corpusSelect.disabled = true;
      this.corpusField?.classList.add("opacity-50");
      return;
    }

    if (
      this.source === MONKEYTYPE_WORDS_SOURCE ||
      this.source === MONKEYTYPE_QUOTES_SOURCE
    ) {
      const groups =
        this.source === MONKEYTYPE_WORDS_SOURCE
          ? this.monkeyTypeWordsGroups
          : this.monkeyTypeQuotesGroups;

      if (groups.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No languages available";
        this.corpusSelect.append(placeholder);
        this.selectedCorpusId = null;
        this.corpusSelect.disabled = true;
        this.corpusField?.classList.add("opacity-50");
        return;
      }

      const allLanguages = groups.flatMap((group) => group.languages);

      for (const group of groups) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.label;

        for (const language of group.languages) {
          const option = document.createElement("option");
          option.value = language.id;
          option.textContent = language.label;
          optgroup.append(option);
        }

        this.corpusSelect.append(optgroup);
      }

      if (
        this.selectedCorpusId &&
        allLanguages.some((language) => language.id === this.selectedCorpusId)
      ) {
        this.corpusSelect.value = this.selectedCorpusId;
      } else {
        this.selectedCorpusId = allLanguages[0].id;
        this.corpusSelect.value = this.selectedCorpusId;
      }

      this.corpusSelect.disabled = false;
      this.corpusField?.classList.remove("opacity-50");
      return;
    }

    if (this.source === USER_LIBRARY_SOURCE) {
      const entries = listUserCorpora();
      if (entries.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No saved corpora";
        this.corpusSelect.append(placeholder);
        this.selectedCorpusId = null;
        this.corpusSelect.disabled = true;
        this.corpusField?.classList.add("opacity-50");
        return;
      }

      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        this.corpusSelect.append(option);
      }

      if (
        this.selectedCorpusId &&
        entries.some((entry) => entry.id === this.selectedCorpusId)
      ) {
        this.corpusSelect.value = this.selectedCorpusId;
      } else {
        this.selectedCorpusId = entries[0].id;
        this.corpusSelect.value = this.selectedCorpusId;
      }

      this.corpusSelect.disabled = false;
      this.corpusField?.classList.remove("opacity-50");
      return;
    }

    const library = this.staticLibraries.find(
      (item) => item.info.id === this.source,
    );
    if (!library || library.entries.length === 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "No corpora available";
      this.corpusSelect.append(placeholder);
      this.selectedCorpusId = null;
      this.corpusSelect.disabled = true;
      this.corpusField?.classList.add("opacity-50");
      return;
    }

    for (const entry of library.entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      this.corpusSelect.append(option);
    }

    if (
      this.selectedCorpusId &&
      library.entries.some((entry) => entry.id === this.selectedCorpusId)
    ) {
      this.corpusSelect.value = this.selectedCorpusId;
    } else {
      this.selectedCorpusId = library.entries[0].id;
      this.corpusSelect.value = this.selectedCorpusId;
    }

    this.corpusSelect.disabled = false;
    this.corpusField?.classList.remove("opacity-50");
  }

  private async loadSelectedCorpusFromDropdown(): Promise<void> {
    if (this.loadingFromDropdown || !this.selectedCorpusId) {
      return;
    }

    this.loadingFromDropdown = true;

    try {
      let data: CorpusDocument | null = null;

      if (this.source === USER_LIBRARY_SOURCE) {
        data = loadUserCorpus(this.selectedCorpusId);
      } else if (
        this.source === MONKEYTYPE_WORDS_SOURCE ||
        this.source === MONKEYTYPE_QUOTES_SOURCE
      ) {
        const groups =
          this.source === MONKEYTYPE_WORDS_SOURCE
            ? this.monkeyTypeWordsGroups
            : this.monkeyTypeQuotesGroups;
        const language = groups
          .flatMap((group) => group.languages)
          .find((item) => item.id === this.selectedCorpusId);
        if (language) {
          const loadCorpus =
            this.source === MONKEYTYPE_WORDS_SOURCE
              ? loadMonkeyTypeWordsCorpus
              : loadMonkeyTypeQuotesCorpus;
          data = await loadCorpus(
            language.id,
            language.label,
            this.abort.signal,
          );
        }
      } else {
        const library = this.staticLibraries.find(
          (item) => item.info.id === this.source,
        );
        const entry = library?.entries.find(
          (item) => item.id === this.selectedCorpusId,
        );
        if (entry) {
          data = await loadStaticCorpus(
            this.source,
            entry,
            this.abort.signal,
          );
        }
      }

      if (data) {
        this.applyCorpusDocument(data);
        this.syncSourceSelectionAfterLoad();
      }
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load corpus", error);
    } finally {
      this.loadingFromDropdown = false;
    }
  }

  private async handleLoadSelection(
    selection: CorpusLoadSelection,
  ): Promise<void> {
    try {
      const data =
        selection.library === "static"
          ? await loadStaticCorpus(
              selection.libraryId,
              selection.entry,
              this.abort.signal,
            )
          : loadUserCorpus(selection.id);

      if (!data) {
        return;
      }

      if (selection.library === "static") {
        this.source = selection.libraryId;
        this.selectedCorpusId = selection.entry.id;
      } else {
        this.source = USER_LIBRARY_SOURCE;
        this.selectedCorpusId = selection.id;
      }

      if (this.sourceSelect) {
        this.sourceSelect.value = this.source;
      }
      this.populateCorpusSelect();
      this.applyCorpusDocument(data);
    } catch (error) {
      if (this.abort.signal.aborted) {
        return;
      }

      console.error("Failed to load corpus", error);
    }
  }

  private syncSourceSelectionAfterLoad(): void {
    if (this.sourceSelect && this.sourceSelect.value !== this.source) {
      this.sourceSelect.value = this.source;
      this.populateCorpusSelect();
    }

    if (
      this.corpusSelect &&
      this.selectedCorpusId &&
      this.corpusSelect.value !== this.selectedCorpusId
    ) {
      this.corpusSelect.value = this.selectedCorpusId;
    }
  }

  private applyCorpusDocument(data: CorpusDocument): void {
    this.corpusName = data.name;
    this.corpusText = data.text;
    this.syncNameField();
    if (this.textarea) {
      this.textarea.value = this.corpusText;
    }
    this.scheduleLineNumberUpdate();
    this.updateStatus();
    this.notifyNameChange();
    this.notifyTextChange();
    this.syncTextInputForFocus(this.root);
  }

  private getCorpusDocument(name = this.corpusName): CorpusDocument {
    return {
      name: name.trim(),
      text: this.corpusText,
    };
  }

  private syncNameField(): void {
    if (this.nameInput) {
      this.nameInput.value = this.corpusName;
    }
  }

  private updateStatus(): void {
    if (!this.status) {
      return;
    }

    const lines = this.textarea
      ? this.getVisualLineCount(this.textarea)
      : Math.max(1, this.corpusText.split("\n").length);
    const chars = this.corpusText.length;
    this.status.textContent = `${lines} lines · ${chars} chars`;
  }

  private notifyNameChange(): void {
    this.statePool?.notifyChange(CORPUS_PANEL_TYPE, CORPUS_NAME_KEY);
  }

  private notifyTextChange(): void {
    this.statePool?.notifyChange(CORPUS_PANEL_TYPE, CORPUS_TEXT_KEY);
  }
}

export class CorpusPanelContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new CorpusPanelContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Corpus";
  }
}
