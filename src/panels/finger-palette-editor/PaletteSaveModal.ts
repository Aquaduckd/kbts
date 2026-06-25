export interface PaletteSaveModalOptions {
  getName: () => string;
  onSave: (name: string) => void;
}

export class PaletteSaveModal {
  private readonly backdrop: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLParagraphElement;
  private readonly getName: PaletteSaveModalOptions["getName"];
  private readonly onSave: PaletteSaveModalOptions["onSave"];
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private open = false;

  constructor(options: PaletteSaveModalOptions) {
    this.getName = options.getName;
    this.onSave = options.onSave;

    this.backdrop = document.createElement("div");
    this.backdrop.setAttribute("role", "presentation");
    this.backdrop.className =
      "fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4";

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "palette-save-title");
    dialog.className =
      "box-border w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl";

    const title = document.createElement("h2");
    title.id = "palette-save-title";
    title.textContent = "Save palette";
    title.className = "m-0 text-sm font-semibold text-slate-100";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Save the current palette to your local library.";
    subtitle.className = "mt-1 text-xs text-slate-400";

    const field = document.createElement("label");
    field.className = "mt-4 block space-y-1";

    const label = document.createElement("span");
    label.className = "text-xs text-slate-400";
    label.textContent = "Name";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "Palette name";
    this.input.className =
      "w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none";
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit();
      }
    });

    field.append(label, this.input);

    this.status = document.createElement("p");
    this.status.className = "mt-2 min-h-[1rem] text-xs text-red-400";

    const actions = document.createElement("div");
    actions.className = "mt-4 grid grid-cols-2 gap-2";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.className =
      "cursor-pointer rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800";
    cancelButton.addEventListener("click", () => this.close());

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.className =
      "cursor-pointer rounded-md border border-sky-500 bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500";
    saveButton.addEventListener("click", () => this.submit());

    actions.append(cancelButton, saveButton);
    dialog.append(title, subtitle, field, this.status, actions);
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

  openModal(): void {
    this.open = true;
    this.input.value = this.getName();
    this.status.textContent = "";
    this.backdrop.classList.remove("hidden");
    this.backdrop.classList.add("flex");
    this.input.focus();
    this.input.select();
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

  private submit(): void {
    const name = this.input.value.trim();
    if (!name) {
      this.status.textContent = "Enter a name to save this palette.";
      return;
    }

    this.onSave(name);
    this.close();
  }
}
