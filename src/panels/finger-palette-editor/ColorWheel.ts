import { hexToHsv, hsvToHex } from "./colorUtils.js";

type DragTarget = "hue" | "sv" | null;

export class ColorWheel {
  private readonly canvas: HTMLCanvasElement;
  private readonly size = 220;
  private readonly center: number;
  private readonly outerRadius: number;
  private readonly innerRadius: number;
  private readonly squareSize: number;
  private readonly squareOrigin: number;

  private hue = 0;
  private saturation = 100;
  private value = 100;
  private dragTarget: DragTarget = null;
  private onChangeCallback: ((hex: string) => void) | null = null;

  constructor() {
    this.center = this.size / 2;
    this.outerRadius = this.center - 8;
    this.innerRadius = this.outerRadius - 18;
    this.squareSize = this.innerRadius * 1.35;
    this.squareOrigin = (this.size - this.squareSize) / 2;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = "block touch-none select-none cursor-crosshair";

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.finishDrag);
    this.canvas.addEventListener("pointercancel", this.finishDrag);
    this.canvas.addEventListener("pointerleave", this.finishDrag);

    this.drawWheel();
  }

  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  onChange(callback: (hex: string) => void): void {
    this.onChangeCallback = callback;
  }

  setColor(hex: string, emitChange = false): void {
    const { h, s, v } = hexToHsv(hex);
    this.hue = h;
    this.saturation = s;
    this.value = v;
    this.drawWheel();

    if (emitChange) {
      this.emitChange();
    }
  }

  getColor(): string {
    return hsvToHex(this.hue, this.saturation, this.value);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    this.dragTarget = this.pickTarget(event.offsetX, event.offsetY);
    if (this.dragTarget) {
      this.applyPointer(event.offsetX, event.offsetY);
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragTarget) {
      return;
    }

    this.applyPointer(event.offsetX, event.offsetY);
  };

  private finishDrag = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.dragTarget = null;
  };

  private pickTarget(x: number, y: number): DragTarget {
    if (this.isInsideSquare(x, y)) {
      return "sv";
    }

    const distance = this.distanceFromCenter(x, y);
    if (distance >= this.innerRadius && distance <= this.outerRadius + 4) {
      return "hue";
    }

    return null;
  }

  private applyPointer(x: number, y: number): void {
    if (this.dragTarget === "hue") {
      this.hue = this.pointerToHue(x, y);
      this.drawWheel();
      this.emitChange();
      return;
    }

    if (this.dragTarget === "sv" || this.isInsideSquare(x, y)) {
      this.dragTarget = "sv";
      const saturation =
        ((x - this.squareOrigin) / this.squareSize) * 100;
      const value =
        (1 - (y - this.squareOrigin) / this.squareSize) * 100;
      this.saturation = Math.max(0, Math.min(100, saturation));
      this.value = Math.max(0, Math.min(100, value));
      this.drawWheel();
      this.emitChange();
    }
  }

  private emitChange(): void {
    this.onChangeCallback?.(this.getColor());
  }

  private pointerToHue(x: number, y: number): number {
    const angle =
      (Math.atan2(y - this.center, x - this.center) * 180) / Math.PI;
    return (angle + 360) % 360;
  }

  private distanceFromCenter(x: number, y: number): number {
    const dx = x - this.center;
    const dy = y - this.center;
    return Math.hypot(dx, dy);
  }

  private isInsideSquare(x: number, y: number): boolean {
    return (
      x >= this.squareOrigin &&
      x <= this.squareOrigin + this.squareSize &&
      y >= this.squareOrigin &&
      y <= this.squareOrigin + this.squareSize
    );
  }

  private drawWheel(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, this.size, this.size);

    for (let angle = 0; angle < 360; angle += 1) {
      const start = ((angle - 0.75) * Math.PI) / 180;
      const end = ((angle + 0.75) * Math.PI) / 180;

      ctx.beginPath();
      ctx.arc(this.center, this.center, this.outerRadius, start, end);
      ctx.arc(
        this.center,
        this.center,
        this.innerRadius,
        end,
        start,
        true,
      );
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
      ctx.fill();
    }

    const horizontal = ctx.createLinearGradient(
      this.squareOrigin,
      this.squareOrigin,
      this.squareOrigin + this.squareSize,
      this.squareOrigin,
    );
    horizontal.addColorStop(0, "#ffffff");
    horizontal.addColorStop(1, `hsl(${this.hue}, 100%, 50%)`);
    ctx.fillStyle = horizontal;
    ctx.fillRect(
      this.squareOrigin,
      this.squareOrigin,
      this.squareSize,
      this.squareSize,
    );

    const vertical = ctx.createLinearGradient(
      this.squareOrigin,
      this.squareOrigin,
      this.squareOrigin,
      this.squareOrigin + this.squareSize,
    );
    vertical.addColorStop(0, "rgba(0, 0, 0, 0)");
    vertical.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = vertical;
    ctx.fillRect(
      this.squareOrigin,
      this.squareOrigin,
      this.squareSize,
      this.squareSize,
    );

    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.squareOrigin + 0.5,
      this.squareOrigin + 0.5,
      this.squareSize - 1,
      this.squareSize - 1,
    );

    this.drawHueMarker(ctx);
    this.drawSvMarker(ctx);
  }

  private drawHueMarker(ctx: CanvasRenderingContext2D): void {
    const angle = (this.hue * Math.PI) / 180;
    const markerRadius = (this.outerRadius + this.innerRadius) / 2;
    const x = this.center + Math.cos(angle) * markerRadius;
    const y = this.center + Math.sin(angle) * markerRadius;

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();
  }

  private drawSvMarker(ctx: CanvasRenderingContext2D): void {
    const x =
      this.squareOrigin + (this.saturation / 100) * this.squareSize;
    const y =
      this.squareOrigin + (1 - this.value / 100) * this.squareSize;

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = this.getColor();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f8fafc";
    ctx.stroke();
  }
}
