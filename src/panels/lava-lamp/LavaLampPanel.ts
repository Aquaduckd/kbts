import { ContentInstance, ContentType } from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";
import {
  LAVA_LAMP_BACKGROUND,
  LAVA_LAMP_CONFIG,
  LAVA_LAMP_CONTENT_INSET_PX,
} from "./lavaLampConfig.js";
import { LavaLampSimulation } from "./lavaLampSimulation.js";

class LavaLampContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private viewport: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private errorEl: HTMLParagraphElement | null = null;
  private simulation: LavaLampSimulation | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pointerAbort: AbortController | null = null;
  private cursorRing: HTMLDivElement | null = null;
  private pointerUiActive = false;
  private pointerCssX = 0;
  private pointerCssY = 0;

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "box-border flex h-full w-full min-h-0 flex-col overflow-hidden bg-slate-950";
    this.root.style.backgroundColor = LAVA_LAMP_BACKGROUND;
    this.root.style.padding = `${LAVA_LAMP_CONTENT_INSET_PX}px`;

    this.viewport = document.createElement("div");
    this.viewport.className = "relative min-h-0 min-w-0 flex-1 overflow-hidden";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "block h-full w-full touch-none";

    this.errorEl = document.createElement("p");
    this.errorEl.className =
      "absolute inset-0 hidden items-center justify-center p-4 text-center text-sm text-red-300";
    this.errorEl.textContent = "WebGL failed to start.";

    this.cursorRing = document.createElement("div");
    this.cursorRing.className = "pointer-events-none absolute rounded-full";
    this.cursorRing.style.border = "1px solid rgba(255, 255, 255, 0.25)";
    this.cursorRing.style.display = "none";

    this.viewport.append(this.canvas, this.cursorRing, this.errorEl);
    this.root.append(this.viewport);

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeToContainer();
    });
    this.resizeObserver.observe(this.viewport);
    this.attachPointerHandlers();
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.ensureSimulation();
    this.resizeToContainer();
    this.simulation?.start();
  }

  deactivate(): void {
    this.simulation?.stop();
    this.simulation?.clearPointer();
    this.hideCursorRing();
    this.root?.remove();
  }

  destroy(): void {
    this.pointerAbort?.abort();
    this.pointerAbort = null;
    this.simulation?.stop();
    this.simulation?.clearPointer();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.deactivate();
    this.root = null;
    this.viewport = null;
    this.canvas = null;
    this.errorEl = null;
    this.cursorRing = null;
    this.simulation = null;
  }

  onResize(_width: number, _height: number): void {
    this.resizeToContainer();
  }

  private attachPointerHandlers(): void {
    if (!this.canvas) {
      return;
    }

    this.pointerAbort?.abort();
    this.pointerAbort = new AbortController();
    const { signal } = this.pointerAbort;

    this.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.simulation || event.button !== 0) {
          return;
        }

        event.preventDefault();
        this.canvas?.setPointerCapture(event.pointerId);
        this.updatePointer(event, true);
      },
      { signal },
    );

    this.canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.simulation?.isPointerActive()) {
          return;
        }

        event.preventDefault();
        this.updatePointer(event, true);
      },
      { signal },
    );

    const releasePointer = (event: PointerEvent): void => {
      if (this.canvas?.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.simulation?.clearPointer();
      this.hideCursorRing();
    };

    this.canvas.addEventListener("pointerup", releasePointer, { signal });
    this.canvas.addEventListener("pointercancel", releasePointer, { signal });
    this.canvas.addEventListener(
      "lostpointercapture",
      () => {
        this.simulation?.clearPointer();
        this.hideCursorRing();
      },
      { signal },
    );
  }

  private updatePointer(event: PointerEvent, active: boolean): void {
    if (!this.canvas || !this.simulation) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (rect.bottom - event.clientY) * scaleY;

    this.simulation.setPointer(x, y, active);

    this.pointerUiActive = active;
    this.pointerCssX = event.clientX - rect.left;
    this.pointerCssY = event.clientY - rect.top;
    this.syncCursorRing();
  }

  private hideCursorRing(): void {
    this.pointerUiActive = false;
    if (this.cursorRing) {
      this.cursorRing.style.display = "none";
    }
  }

  private syncCursorRing(): void {
    if (!this.cursorRing || !this.canvas || !this.pointerUiActive) {
      this.hideCursorRing();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const scale = rect.width / this.canvas.width;
    const diameter = LAVA_LAMP_CONFIG.cursorForceRadius * 2 * scale;

    this.cursorRing.style.display = "block";
    this.cursorRing.style.width = `${diameter}px`;
    this.cursorRing.style.height = `${diameter}px`;
    this.cursorRing.style.left = `${this.pointerCssX - diameter / 2}px`;
    this.cursorRing.style.top = `${this.pointerCssY - diameter / 2}px`;
  }

  private ensureSimulation(): void {
    if (this.simulation || !this.canvas) {
      return;
    }

    try {
      this.simulation = new LavaLampSimulation(this.canvas, LAVA_LAMP_CONFIG);
      this.showError(this.simulation.getError());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.showError(message);
    }
  }

  private resizeToContainer(): void {
    if (!this.viewport || !this.canvas) {
      return;
    }

    this.ensureSimulation();
    if (!this.simulation) {
      return;
    }

    const rect = this.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.simulation.resize(width, height);
    this.syncCursorRing();
    this.showError(this.simulation.getError());
  }

  private showError(message: string | null): void {
    if (!this.errorEl || !this.canvas) {
      return;
    }

    if (message) {
      this.errorEl.textContent = message;
      this.errorEl.classList.remove("hidden");
      this.errorEl.classList.add("flex");
      this.canvas.classList.add("hidden");
      return;
    }

    this.errorEl.classList.add("hidden");
    this.errorEl.classList.remove("flex");
    this.canvas.classList.remove("hidden");
  }
}

export class LavaLampContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new LavaLampContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Lava Lamp";
  }
}
