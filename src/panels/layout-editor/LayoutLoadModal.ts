import {
  deleteUserLayout,
  loadAllStaticLayoutLibraries,
  listUserLayouts,
  type StaticLayoutLibrary,
} from "../../kbts/keyboard/layoutLibrary.js";

export type LayoutLoadSelection =
  | {
      library: "static";
      libraryId: string;
      entry: StaticLayoutLibrary["entries"][number];
    }
  | { library: "user"; id: string; label: string };

export interface LayoutLoadModalOptions {
  onSelect: (selection: LayoutLoadSelection) => void;
}

export class LayoutLoadModal {
  private readonly backdrop: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly onSelect: LayoutLoadModalOptions["onSelect"];
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private cachedStaticLibraries: StaticLayoutLibrary[] = [];
  private open = false;

  constructor(options: LayoutLoadModalOptions) {
    this.onSelect = options.onSelect;

    this.backdrop = document.createElement("div");
    this.backdrop.setAttribute("role", "presentation");
    this.backdrop.className =
      "fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4";

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "layout-load-title");
    dialog.className =
      "box-border flex max-h-[min(80vh,32rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl";

    const title = document.createElement("h2");
    title.id = "layout-load-title";
    title.textContent = "Load layout";
    title.className = "m-0 text-sm font-semibold text-slate-100";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Choose a layout from a library.";
    subtitle.className = "mt-1 text-xs text-slate-400";

    this.status = document.createElement("p");
    this.status.className = "mt-3 hidden text-xs text-red-400";

    this.list = document.createElement("div");
    this.list.className =
      "mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.className =
      "mt-4 w-full shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-3 py-2 text-xs text-slate-300 hover:bg-slate-800";
    cancelButton.addEventListener("click", () => this.close());

    dialog.append(title, subtitle, this.status, this.list, cancelButton);
    this.backdrop.append(dialog);
    document.body.append(this.backdrop);

    this.backdrop.addEventListener("click", (event) => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });

    this.onKeyDown = (event) => {
      if (event.key === "Escape" && this.open) {
        this.close();
      }
    };
    document.addEventListener("keydown", this.onKeyDown);
  }

  async openModal(): Promise<void> {
    this.open = true;
    this.status.classList.add("hidden");
    this.list.replaceChildren();
    this.list.append(this.createLoadingState());
    this.backdrop.classList.remove("hidden");
    this.backdrop.classList.add("flex");

    try {
      const [staticLibraries, userEntries] = await Promise.all([
        loadAllStaticLayoutLibraries(),
        Promise.resolve(listUserLayouts()),
      ]);
      this.cachedStaticLibraries = staticLibraries;
      this.renderEntries(staticLibraries, userEntries);
    } catch (error) {
      this.list.replaceChildren();
      this.status.textContent = `Failed to load libraries. ${String(error)}`;
      this.status.classList.remove("hidden");
    }
  }

  close(): void {
    this.open = false;
    this.backdrop.classList.add("hidden");
    this.backdrop.classList.remove("flex");
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.backdrop.remove();
  }

  private createLoadingState(): HTMLParagraphElement {
    const loading = document.createElement("p");
    loading.textContent = "Loading libraries…";
    loading.className = "text-sm text-slate-500";
    return loading;
  }

  private refreshList(): void {
    this.renderEntries(this.cachedStaticLibraries, listUserLayouts());
  }

  private renderEntries(
    staticLibraries: StaticLayoutLibrary[],
    userEntries: Array<{ id: string; label: string; savedAt: number }>,
  ): void {
    this.list.replaceChildren();

    if (staticLibraries.length === 0 && userEntries.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No layouts are available.";
      empty.className =
        "rounded-md border border-slate-700 px-3 py-6 text-center text-sm text-slate-500";
      this.list.append(empty);
      return;
    }

    const folderList = document.createElement("div");
    folderList.className =
      "flex flex-col divide-y divide-slate-700 rounded-md border border-slate-700";

    for (const library of staticLibraries) {
      folderList.append(
        this.createCollapsibleSection(
          library.info.label,
          library.entries.map((entry) =>
            this.createOptionButton(entry.label, () => {
              this.onSelect({
                library: "static",
                libraryId: library.info.id,
                entry,
              });
              this.close();
            }),
          ),
        ),
      );
    }

    if (userEntries.length > 0) {
      folderList.append(
        this.createCollapsibleSection(
          "Your library",
          userEntries.map((entry) =>
            this.createUserLibraryRow(entry.id, entry.label),
          ),
        ),
      );
    }

    this.list.append(folderList);
  }

  private createCollapsibleSection(
    label: string,
    rows: HTMLElement[],
  ): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "group shrink-0";
    details.open = true;

    const summary = document.createElement("summary");
    summary.className =
      "cursor-pointer list-none bg-slate-800/40 px-3 py-2 text-xs font-semibold text-slate-300 select-none group-open:border-b group-open:border-slate-700 [&::-webkit-details-marker]:hidden";

    const marker = document.createElement("span");
    marker.textContent = "▸";
    marker.setAttribute("aria-hidden", "true");
    marker.className =
      "mr-1.5 inline-block w-[1em] transition-transform duration-150 ease-in-out group-open:rotate-90";

    summary.append(marker, label);

    const list = document.createElement("div");
    list.className = "flex flex-col divide-y divide-slate-700";
    list.append(...rows);

    details.append(summary, list);
    return details;
  }

  private createOptionButton(
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className =
      "w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800";
    button.addEventListener("click", onClick);
    return button;
  }

  private createUserLibraryRow(id: string, label: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "flex items-stretch";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = label;
    loadButton.className =
      "min-w-0 flex-1 cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800";
    loadButton.addEventListener("click", () => {
      this.onSelect({ library: "user", id, label });
      this.close();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete saved layout";
    deleteButton.setAttribute("aria-label", `Delete ${label}`);
    deleteButton.className =
      "shrink-0 cursor-pointer border-0 border-l border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteUserLayout(id);
      this.refreshList();
    });

    row.append(loadButton, deleteButton);
    return row;
  }
}
