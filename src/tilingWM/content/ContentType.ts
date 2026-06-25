import type { Panel } from "../model/Panel.js";
import type { StatePool } from "../state/StatePool.js";

export abstract class ContentInstance {
  constructor(readonly panelId: string) {}

  protected panelFocused = false;

  /** First-time setup. Build DOM/state once. */
  abstract mount(): void;

  /** Attach to a visible slot and resume interaction. */
  activate(container: HTMLElement, panel: Panel): void {
    void container;
    void panel;
  }

  /** Detach from layout and pause interaction. Instance stays alive. */
  deactivate(): void {}

  /** Tear down permanently. */
  abstract destroy(): void;

  /**
   * Register queryable state with the shared pool.
   * Return a cleanup function to withdraw registration.
   */
  exposeState?(_pool: StatePool, _panel: Panel): (() => void) | void;

  onResize(_width: number, _height: number): void {}

  onFocus(): void {
    this.panelFocused = true;
    this.syncTextInputForFocus();
  }

  onBlur(): void {
    this.panelFocused = false;
    this.syncTextInputForFocus();
  }

  protected syncTextInputForFocus(root: HTMLElement | null = null): void {
    const target = root ?? this.getTextInputRoot();
    if (!target) {
      return;
    }

    const enabled = this.panelFocused;

    for (const element of target.querySelectorAll("input, textarea")) {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.readOnly = !enabled;
      }
    }

    for (const element of target.querySelectorAll("select")) {
      if (element instanceof HTMLSelectElement) {
        element.disabled = !enabled;
      }
    }
  }

  protected getTextInputRoot(): HTMLElement | null {
    return null;
  }
}

export abstract class ContentType {
  abstract create(container: HTMLElement, panel: Panel): ContentInstance;

  getDefaultTitle(): string {
    return "Panel";
  }
}
