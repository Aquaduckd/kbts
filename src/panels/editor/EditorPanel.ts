import {
  ContentInstance,
  ContentType,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

class EditorContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private status: HTMLSpanElement | null = null;
  private abort = new AbortController();

  constructor(
    panelId: string,
    private readonly panel: Panel,
  ) {
    super(panelId);
  }

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className = "h-full w-full flex flex-col bg-slate-900";

    this.textarea = document.createElement("textarea");
    this.textarea.className =
      "flex-1 w-full resize-none bg-transparent p-4 font-mono text-sm text-slate-100 outline-none";
    this.textarea.spellcheck = false;
    this.textarea.value = `// ${this.panel.title}\n`;

    const footer = document.createElement("div");
    footer.className =
      "border-t border-slate-800 px-3 py-1 text-xs text-slate-500";
    footer.dataset.role = "status-bar";

    this.status = document.createElement("span");
    footer.append(this.status);

    this.root.append(this.textarea, footer);

    this.textarea.addEventListener(
      "input",
      () => this.updateStatus(),
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

    this.updateStatus();
  }

  deactivate(): void {
    this.root?.remove();
  }

  destroy(): void {
    this.deactivate();
    this.abort.abort();
    this.root = null;
    this.textarea = null;
    this.status = null;
  }

  onResize(width: number, height: number): void {
    this.updateStatus(width, height);
  }

  onFocus(): void {
    super.onFocus();
    const footer = this.root?.querySelector("[data-role='status-bar']");
    footer?.classList.add("text-emerald-400");
  }

  onBlur(): void {
    super.onBlur();
    const footer = this.root?.querySelector("[data-role='status-bar']");
    footer?.classList.remove("text-emerald-400");
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }

  private updateStatus(width?: number, height?: number): void {
    if (!this.textarea || !this.status) {
      return;
    }

    const text = this.textarea.value;
    const lines = text.split("\n").length;
    const chars = text.length;
    const size =
      width !== undefined && height !== undefined
        ? ` · ${Math.round(width)}×${Math.round(height)}`
        : "";

    this.status.textContent = `${lines} lines · ${chars} chars${size}`;
  }
}

export class EditorContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new EditorContent(panel.id, panel);
  }

  getDefaultTitle(): string {
    return "Editor";
  }
}
