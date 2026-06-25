import type { Rect } from "../geometry/Rect.js";
import type { SplitDirection } from "../model/Split.js";

export interface GutterViewOptions {
  onDragStart?: (splitId: string, clientX: number, clientY: number) => void;
  onDragMove?: (splitId: string, clientX: number, clientY: number) => void;
  onDragEnd?: (splitId: string) => void;
}

export class GutterView {
  readonly element: HTMLDivElement;

  constructor(
    readonly splitId: string,
    readonly direction: SplitDirection,
    options: GutterViewOptions = {},
  ) {
    this.element = document.createElement("div");
    this.element.dataset.splitId = splitId;
    this.element.className = "tw-gutter";
    this.element.style.position = "absolute";
    this.element.style.zIndex = "2";
    this.element.style.background = "transparent";
    this.element.style.touchAction = "none";
    this.element.style.cursor =
      direction === "horizontal" ? "col-resize" : "row-resize";

    this.element.addEventListener("pointerdown", (event) => {
      this.element.setPointerCapture(event.pointerId);
      options.onDragStart?.(splitId, event.clientX, event.clientY);
    });

    this.element.addEventListener("pointermove", (event) => {
      if (!this.element.hasPointerCapture(event.pointerId)) {
        return;
      }

      options.onDragMove?.(splitId, event.clientX, event.clientY);
    });

    const endDrag = (event: PointerEvent) => {
      if (!this.element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.element.releasePointerCapture(event.pointerId);
      options.onDragEnd?.(splitId);
    };

    this.element.addEventListener("pointerup", endDrag);
    this.element.addEventListener("pointercancel", endDrag);
  }

  applyRect(rect: Rect): void {
    this.element.style.left = `${rect.x}px`;
    this.element.style.top = `${rect.y}px`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.height = `${rect.height}px`;
  }
}
