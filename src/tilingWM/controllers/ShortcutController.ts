import {
  findMatchingAction,
  getShortcutConfig,
  isShortcutCaptureActive,
  type ShortcutAction,
  type ShortcutConfig,
} from "../shortcuts/ShortcutConfig.js";

export interface ShortcutControllerOptions {
  onAction: (action: ShortcutAction) => void;
  isEnabled?: () => boolean;
  getConfig?: () => ShortcutConfig;
}

export class ShortcutController {
  private readonly onAction: ShortcutControllerOptions["onAction"];
  private readonly isEnabled: () => boolean;
  private readonly getConfig: () => ShortcutConfig;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  constructor(options: ShortcutControllerOptions) {
    this.onAction = options.onAction;
    this.isEnabled = options.isEnabled ?? (() => true);
    this.getConfig = options.getConfig ?? getShortcutConfig;

    this.onKeyDown = (event) => {
      if (!this.isEnabled() || isShortcutCaptureActive()) {
        return;
      }

      const action = findMatchingAction(event, this.getConfig());
      if (!action) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.onAction(action);
    };

    document.addEventListener("keydown", this.onKeyDown, true);
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown, true);
  }
}
