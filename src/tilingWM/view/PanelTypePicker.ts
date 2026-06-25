import {
  fuzzyMatchScore,
  fuzzyMatchesLabel,
} from "./fuzzyMatch.js";

export interface PanelTypeOption {
  type: string;
  label: string;
}

export interface PanelTypeFolder {
  label: string;
  types: PanelTypeOption[];
}

export interface PanelTypePickerLayout {
  root: PanelTypeOption[];
  folders: PanelTypeFolder[];
}

export interface PanelTypePickerOptions {
  layout: PanelTypePickerLayout;
  onSelect: (panelId: string, type: string, label: string) => void;
}

export class PanelTypePicker {
  private readonly backdrop: HTMLDivElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly searchInput: HTMLInputElement;
  private readonly optionsContainer: HTMLDivElement;
  private readonly emptyState: HTMLParagraphElement;
  private readonly rootList: HTMLDivElement | null;
  private readonly folderList: HTMLDivElement | null;
  private readonly folderDetails: HTMLDetailsElement[] = [];
  private panelId: string | null = null;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onSelect: PanelTypePickerOptions["onSelect"];

  constructor(options: PanelTypePickerOptions) {
    const { layout, onSelect } = options;
    this.onSelect = onSelect;

    this.backdrop = document.createElement("div");
    this.backdrop.setAttribute("role", "presentation");
    this.backdrop.className =
      "fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4";

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "tw-panel-type-title");
    dialog.className =
      "box-border flex max-h-[min(80vh,32rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl";

    const title = document.createElement("h2");
    title.id = "tw-panel-type-title";
    title.textContent = "Panel type";
    title.className = "m-0 text-sm font-semibold text-slate-100";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Choose what this panel should display.";
    subtitle.className = "mt-1 text-xs text-slate-400";

    this.searchInput = document.createElement("input");
    this.searchInput.type = "search";
    this.searchInput.placeholder = "Search panels…";
    this.searchInput.autocomplete = "off";
    this.searchInput.className =
      "mt-4 w-full shrink-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none";
    this.searchInput.addEventListener("input", () => this.applyFilter());
    this.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.selectFirstVisibleOption();
      }
    });

    this.optionsContainer = document.createElement("div");
    this.optionsContainer.setAttribute("role", "listbox");
    this.optionsContainer.setAttribute("aria-labelledby", "tw-panel-type-title");
    this.optionsContainer.className =
      "mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain";

    this.emptyState = document.createElement("p");
    this.emptyState.textContent = "No matching panels.";
    this.emptyState.className =
      "hidden rounded-md border border-slate-700 px-3 py-6 text-center text-sm text-slate-500";
    this.optionsContainer.append(this.emptyState);

    this.rootList = null;
    if (layout.root.length > 0) {
      this.rootList = document.createElement("div");
      this.rootList.className =
        "flex flex-col divide-y divide-slate-700 rounded-md border border-slate-700";
      for (const option of layout.root) {
        this.rootList.append(this.createOptionButton(option));
      }
      this.optionsContainer.append(this.rootList);
    }

    this.folderList = null;
    if (layout.folders.length > 0) {
      this.folderList = document.createElement("div");
      this.folderList.className =
        "flex flex-col divide-y divide-slate-700 rounded-md border border-slate-700";
      for (const folder of layout.folders) {
        const details = this.createFolder(folder);
        this.folderDetails.push(details);
        this.folderList.append(details);
      }
      this.optionsContainer.append(this.folderList);
    }

    this.cancelButton = document.createElement("button");
    this.cancelButton.type = "button";
    this.cancelButton.textContent = "Cancel";
    this.cancelButton.className =
      "mt-4 w-full shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-3 py-2 text-xs text-slate-300 hover:bg-slate-800";
    this.cancelButton.addEventListener("click", () => this.close());

    dialog.append(
      title,
      subtitle,
      this.searchInput,
      this.optionsContainer,
      this.cancelButton,
    );
    this.backdrop.append(dialog);
    document.body.append(this.backdrop);

    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });

    this.onKeyDown = (event) => {
      if (event.key === "Escape" && this.panelId) {
        this.close();
      }
    };
    document.addEventListener("keydown", this.onKeyDown);
  }

  open(panelId: string): void {
    this.panelId = panelId;
    this.searchInput.value = "";
    this.applyFilter();
    this.backdrop.classList.remove("hidden");
    this.backdrop.classList.add("flex");
    this.searchInput.focus();
  }

  close(): void {
    this.panelId = null;
    this.searchInput.value = "";
    this.applyFilter();
    this.backdrop.classList.add("hidden");
    this.backdrop.classList.remove("flex");
  }

  isOpen(): boolean {
    return this.panelId !== null;
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.backdrop.remove();
  }

  private applyFilter(): void {
    const query = this.searchInput.value.trim();
    const filtering = query.length > 0;
    let visibleCount = 0;

    if (this.rootList) {
      let rootVisible = 0;
      for (const button of this.rootList.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      )) {
        const label = button.dataset.label ?? button.textContent ?? "";
        const matches = this.matchesLabel(label, query);
        button.classList.toggle("hidden", !matches);
        if (matches) {
          rootVisible++;
        }
      }
      this.rootList.classList.toggle("hidden", rootVisible === 0);
      visibleCount += rootVisible;
    }

    for (const details of this.folderDetails) {
      let folderVisible = 0;
      for (const button of details.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      )) {
        const label = button.dataset.label ?? button.textContent ?? "";
        const matches = this.matchesLabel(label, query);
        button.classList.toggle("hidden", !matches);
        if (matches) {
          folderVisible++;
        }
      }

      details.classList.toggle("hidden", folderVisible === 0);
      if (filtering && folderVisible > 0) {
        details.open = true;
      } else if (!filtering) {
        details.open = false;
      }
      visibleCount += folderVisible;
    }

    if (this.folderList) {
      const anyFolderVisible = this.folderDetails.some(
        (details) => !details.classList.contains("hidden"),
      );
      this.folderList.classList.toggle("hidden", !anyFolderVisible);
    }

    this.emptyState.classList.toggle("hidden", visibleCount > 0);
  }

  private selectFirstVisibleOption(): void {
    const button = this.getVisibleOptionButtons()[0];
    if (button) {
      this.selectOptionButton(button);
    }
  }

  private getVisibleOptionButtons(): HTMLButtonElement[] {
    const query = this.searchInput.value.trim();
    const buttons: HTMLButtonElement[] = [];

    if (this.rootList && !this.rootList.classList.contains("hidden")) {
      for (const button of this.rootList.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      )) {
        if (!button.classList.contains("hidden")) {
          buttons.push(button);
        }
      }
    }

    for (const details of this.folderDetails) {
      if (details.classList.contains("hidden")) {
        continue;
      }

      for (const button of details.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      )) {
        if (!button.classList.contains("hidden")) {
          buttons.push(button);
        }
      }
    }

    if (query) {
      buttons.sort((left, right) => {
        const leftLabel = left.dataset.label ?? left.textContent ?? "";
        const rightLabel = right.dataset.label ?? right.textContent ?? "";
        const leftScore = fuzzyMatchScore(leftLabel, query) ?? Number.MAX_VALUE;
        const rightScore =
          fuzzyMatchScore(rightLabel, query) ?? Number.MAX_VALUE;
        return leftScore - rightScore;
      });
    }

    return buttons;
  }

  private selectOptionButton(button: HTMLButtonElement): void {
    const type = button.dataset.type;
    const label = button.dataset.label;
    if (!type || !label || !this.panelId) {
      return;
    }

    this.onSelect(this.panelId, type, label);
    this.close();
  }

  private matchesLabel(label: string, query: string): boolean {
    if (!query) {
      return true;
    }
    return fuzzyMatchesLabel(label, query);
  }

  private createFolder(folder: PanelTypeFolder): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "group shrink-0";

    const summary = document.createElement("summary");
    summary.className =
      "cursor-pointer list-none bg-slate-800/40 px-3 py-2 text-xs font-semibold text-slate-300 select-none group-open:border-b group-open:border-slate-700 [&::-webkit-details-marker]:hidden";

    const marker = document.createElement("span");
    marker.textContent = "▸";
    marker.setAttribute("aria-hidden", "true");
    marker.className =
      "mr-1.5 inline-block w-[1em] transition-transform duration-150 ease-in-out group-open:rotate-90";

    summary.append(marker, folder.label);

    const list = document.createElement("div");
    list.className = "flex flex-col divide-y divide-slate-700";

    for (const option of folder.types) {
      list.append(this.createOptionButton(option));
    }

    details.append(summary, list);
    return details;
  }

  private createOptionButton(option: PanelTypeOption): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.dataset.type = option.type;
    button.dataset.label = option.label;
    button.textContent = option.label;
    button.className =
      "w-full shrink-0 cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800";
    button.addEventListener("click", () => this.selectOptionButton(button));
    return button;
  }
}
