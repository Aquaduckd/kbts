import {
  ContentInstance,
  ContentType,
} from "../tilingWM/index.js";
import type { Panel } from "../tilingWM/index.js";

export function defineContentType(
  defaultTitle: string,
  mount: (root: HTMLElement, panel: Panel) => void,
): ContentType {
  return new (class extends ContentType {
    create(_container: HTMLElement, panel: Panel): ContentInstance {
      return new (class extends ContentInstance {
        private root: HTMLDivElement | null = null;

        mount(): void {
          if (this.root) {
            return;
          }

          this.root = document.createElement("div");
          this.root.className = "h-full w-full";
          mount(this.root, panel);
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

        destroy(): void {
          this.deactivate();
          this.root?.replaceChildren();
          this.root = null;
        }
      })(panel.id);
    }

    getDefaultTitle(): string {
      return defaultTitle;
    }
  })();
}
