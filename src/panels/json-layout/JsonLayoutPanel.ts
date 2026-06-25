import {
  ContentInstance,
  ContentType,
  type StatePool,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import type { KeyboardCharacterData } from "../../kbts/keyboard/index.js";
import {
  LAYOUT_CHARACTERS_KEY,
  LAYOUT_EDITOR_TYPE,
  LAYOUT_NAME_KEY,
  LAYOUT_SHAPE_KEY,
  type LayoutEditorShapeInfo,
} from "../layout-editor/LayoutEditorPanel.js";

interface JsonLayoutData {
  name: string;
  shape: LayoutEditorShapeInfo | null;
  characters: KeyboardCharacterData | null;
}

class JsonLayoutContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private hint: HTMLParagraphElement | null = null;
  private output: HTMLPreElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private statePool: StatePool | null = null;
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
    this.hint.textContent =
      "Reads layout-editor name, shape, and characters from the shared state pool.";

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
    this.root.append(this.hint, outputShell);
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
    const render = () => this.render();
    render();
    const unwatchCharacters = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: LAYOUT_EDITOR_TYPE,
        key: LAYOUT_CHARACTERS_KEY,
      },
      render,
    );
    const unwatchShape = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: LAYOUT_EDITOR_TYPE,
        key: LAYOUT_SHAPE_KEY,
      },
      render,
    );
    const unwatchName = pool.watchPanel(
      panel,
      {
        kind: "state",
        contentType: LAYOUT_EDITOR_TYPE,
        key: LAYOUT_NAME_KEY,
      },
      render,
    );
    return () => {
      unwatchCharacters();
      unwatchShape();
      unwatchName();
    };
  }

  destroy(): void {
    this.abort.abort();
    this.deactivate();
    this.root = null;
    this.hint = null;
    this.output = null;
    this.copyButton = null;
    this.statePool = null;
  }

  private render(): void {
    if (!this.output) {
      return;
    }

    const data = this.readLayoutData();
    if (!data) {
      this.output.textContent =
        "No layout editor state is available.\n\nOpen a Layout Editor panel to publish layout data.";
      return;
    }

    this.output.textContent = JSON.stringify(data, null, 2);
  }

  private readLayoutData(): JsonLayoutData | null {
    if (!this.statePool) {
      return null;
    }

    const shape =
      this.statePool.get<LayoutEditorShapeInfo>(
        LAYOUT_EDITOR_TYPE,
        LAYOUT_SHAPE_KEY,
      ) ?? null;
    const characters =
      this.statePool.get<KeyboardCharacterData>(
        LAYOUT_EDITOR_TYPE,
        LAYOUT_CHARACTERS_KEY,
      ) ?? null;
    const name =
      this.statePool.get<string>(LAYOUT_EDITOR_TYPE, LAYOUT_NAME_KEY) ?? "";

    if (!shape && !characters && !name) {
      return null;
    }

    return { name, shape, characters };
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

export class JsonLayoutContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new JsonLayoutContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Json Layout";
  }
}
