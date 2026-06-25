import {
  ContentInstance,
  ContentType,
  bindingFromKeyboardEvent,
  findConflictingAction,
  formatShortcutBinding,
  loadShortcutConfig,
  resetShortcutBinding,
  resetShortcutConfig,
  setShortcutCaptureActive,
  SHORTCUT_ACTION_LABELS,
  SHORTCUT_ACTION_ORDER,
  updateShortcutBinding,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutConfig,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

class ShortcutsPanelContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private list: HTMLDivElement | null = null;
  private status: HTMLParagraphElement | null = null;
  private config: ShortcutConfig = loadShortcutConfig();
  private editingAction: ShortcutAction | null = null;
  private readonly captureHandler = (event: KeyboardEvent) => {
    if (!this.editingAction || !this.panelFocused) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.stopEditing("Binding unchanged.");
      return;
    }

    const binding = bindingFromKeyboardEvent(event);
    if (!binding) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const conflict = findConflictingAction(
      this.config,
      binding,
      this.editingAction,
    );
    if (conflict) {
      this.setStatus(
        `Already used by “${SHORTCUT_ACTION_LABELS[conflict]}”.`,
        true,
      );
      return;
    }

    this.config = updateShortcutBinding(this.editingAction, binding);
    this.stopEditing(`Updated “${SHORTCUT_ACTION_LABELS[this.editingAction]}”.`);
  };

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "flex h-full w-full flex-col overflow-hidden bg-slate-950 p-4 text-slate-100";

    const header = document.createElement("div");
    header.className = "shrink-0";

    const hint = document.createElement("p");
    hint.className = "text-xs leading-relaxed text-slate-500";
    hint.textContent =
      "Click Edit, then press the key combination you want. Escape cancels.";

    const resetAll = document.createElement("button");
    resetAll.type = "button";
    resetAll.textContent = "Reset all to defaults";
    resetAll.className =
      "mt-3 cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800";
    resetAll.addEventListener("click", () => {
      this.config = resetShortcutConfig();
      this.stopEditing("Restored default shortcuts.");
    });

    this.status = document.createElement("p");
    this.status.className = "mt-2 min-h-[1rem] text-xs text-slate-500";

    header.append(hint, resetAll, this.status);

    this.list = document.createElement("div");
    this.list.className =
      "mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-700";

    this.root.append(header, this.list);
    this.renderList();
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    this.config = loadShortcutConfig();

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.renderList();
  }

  deactivate(): void {
    this.stopEditing();
    this.root?.remove();
  }

  destroy(): void {
    this.stopEditing();
    this.root?.replaceChildren();
    this.root = null;
    this.list = null;
    this.status = null;
  }

  onBlur(): void {
    super.onBlur();
    if (this.editingAction) {
      this.stopEditing("Binding unchanged.");
    }
  }

  private renderList(): void {
    if (!this.list) {
      return;
    }

    this.list.replaceChildren();

    for (const action of SHORTCUT_ACTION_ORDER) {
      this.list.append(this.createRow(action, this.config[action]));
    }
  }

  private createRow(
    action: ShortcutAction,
    binding: ShortcutBinding,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between gap-3 border-b border-slate-700 px-3 py-2 last:border-b-0";

    const label = document.createElement("span");
    label.className = "min-w-0 text-sm text-slate-200";
    label.textContent = SHORTCUT_ACTION_LABELS[action];

    const controls = document.createElement("div");
    controls.className = "flex shrink-0 items-center gap-2";

    const bindingButton = document.createElement("button");
    bindingButton.type = "button";
    bindingButton.dataset.action = action;
    bindingButton.className =
      "min-w-[8rem] cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left font-mono text-xs text-slate-200 hover:border-indigo-500";
    bindingButton.textContent = formatShortcutBinding(binding);
    bindingButton.addEventListener("click", () => {
      this.startEditing(action, bindingButton);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.title = "Reset to default";
    reset.textContent = "↺";
    reset.className =
      "cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300";
    reset.addEventListener("click", () => {
      this.config = resetShortcutBinding(action);
      this.renderList();
      this.setStatus(`Reset “${SHORTCUT_ACTION_LABELS[action]}” to default.`);
    });

    controls.append(bindingButton, reset);
    row.append(label, controls);
    return row;
  }

  private startEditing(
    action: ShortcutAction,
    button: HTMLButtonElement,
  ): void {
    this.stopEditing();

    this.editingAction = action;
    setShortcutCaptureActive(true);
    button.textContent = "Press keys…";
    button.classList.add("border-indigo-500", "bg-indigo-950/40");
    this.setStatus(`Recording shortcut for “${SHORTCUT_ACTION_LABELS[action]}”.`);
    document.addEventListener("keydown", this.captureHandler, true);
  }

  private stopEditing(message?: string): void {
    if (this.editingAction) {
      document.removeEventListener("keydown", this.captureHandler, true);
      setShortcutCaptureActive(false);
      this.editingAction = null;
      this.renderList();
    }

    if (message) {
      this.setStatus(message);
    }
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) {
      return;
    }

    this.status.textContent = message;
    this.status.classList.toggle("text-rose-400", isError);
    this.status.classList.toggle("text-slate-500", !isError);
  }
}

export class ShortcutsPanelContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new ShortcutsPanelContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Shortcuts";
  }
}
