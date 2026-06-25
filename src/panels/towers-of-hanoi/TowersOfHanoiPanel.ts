import {
  ContentInstance,
  ContentType,
} from "../../tilingWM/index.js";
import type { Panel } from "../../tilingWM/index.js";

const MIN_DISKS = 3;
const MAX_DISKS = 8;
const DEFAULT_DISKS = 5;

type PegIndex = 0 | 1 | 2;

interface GameState {
  pegs: [number[], number[], number[]];
  moves: number;
  selectedPeg: PegIndex | null;
  won: boolean;
}

class TowersOfHanoiContent extends ContentInstance {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private statusEl: HTMLSpanElement | null = null;
  private diskSelect: HTMLSelectElement | null = null;
  private width = 0;
  private height = 0;
  private diskCount = DEFAULT_DISKS;
  private state: GameState = this.createInitialState(DEFAULT_DISKS);
  private resizeObserver: ResizeObserver | null = null;
  private readonly abort = new AbortController();

  mount(): void {
    if (this.root) {
      return;
    }

    this.root = document.createElement("div");
    this.root.className =
      "flex h-full w-full min-h-0 flex-col bg-slate-950 text-slate-100";

    const header = document.createElement("div");
    header.className =
      "flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2";

    this.statusEl = document.createElement("span");
    this.statusEl.className = "font-mono text-xs text-slate-400";

    const controls = document.createElement("div");
    controls.className = "flex flex-wrap items-center gap-2";

    const diskField = document.createElement("label");
    diskField.className = "flex items-center gap-2 text-xs text-slate-400";

    const diskLabel = document.createElement("span");
    diskLabel.textContent = "Disks";

    this.diskSelect = document.createElement("select");
    this.diskSelect.className =
      "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-teal-500";
    for (let count = MIN_DISKS; count <= MAX_DISKS; count += 1) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      if (count === DEFAULT_DISKS) {
        option.selected = true;
      }
      this.diskSelect.append(option);
    }
    this.diskSelect.addEventListener(
      "change",
      () => {
        this.diskCount = Number(this.diskSelect?.value ?? DEFAULT_DISKS);
        this.resetGame();
      },
      { signal: this.abort.signal },
    );

    diskField.append(diskLabel, this.diskSelect);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.className =
      "cursor-pointer rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800";
    resetButton.addEventListener(
      "click",
      () => {
        this.resetGame();
      },
      { signal: this.abort.signal },
    );

    controls.append(diskField, resetButton);
    header.append(this.statusEl, controls);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "block min-h-0 w-full flex-1 cursor-pointer";
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener(
      "click",
      (event) => {
        this.handleCanvasClick(event);
      },
      { signal: this.abort.signal },
    );

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this.canvas);

    this.root.append(header, this.canvas);
    this.updateStatus();
  }

  activate(container: HTMLElement, _panel: Panel): void {
    if (!this.root) {
      this.mount();
    }

    if (this.root && this.root.parentElement !== container) {
      container.append(this.root);
    }

    this.resizeCanvas();
  }

  deactivate(): void {
    this.root?.remove();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.abort.abort();
    this.deactivate();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.statusEl = null;
    this.diskSelect = null;
  }

  onResize(_width: number, _height: number): void {
    this.resizeCanvas();
  }

  private createInitialState(diskCount: number): GameState {
    const pegs: [number[], number[], number[]] = [[], [], []];
    for (let size = diskCount; size >= 1; size -= 1) {
      pegs[0].push(size);
    }

    return {
      pegs,
      moves: 0,
      selectedPeg: null,
      won: false,
    };
  }

  private resetGame(): void {
    this.state = this.createInitialState(this.diskCount);
    this.updateStatus();
    this.draw();
  }

  private minMoves(diskCount: number): number {
    return (1 << diskCount) - 1;
  }

  private updateStatus(): void {
    if (!this.statusEl) {
      return;
    }

    const optimal = this.minMoves(this.diskCount);
    if (this.state.won) {
      const perfect =
        this.state.moves === optimal ? " · perfect!" : ` · optimal ${optimal}`;
      this.statusEl.textContent = `Solved in ${this.state.moves} moves${perfect}`;
      return;
    }

    const selected =
      this.state.selectedPeg === null
        ? ""
        : ` · peg ${this.state.selectedPeg + 1} selected`;
    this.statusEl.textContent = `${this.state.moves} moves · min ${optimal}${selected}`;
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.ctx) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (width === this.width && height === this.height) {
      this.draw();
      return;
    }

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }

  private pegCenters(): number[] {
    return [this.width * 0.2, this.width * 0.5, this.width * 0.8];
  }

  private pegIndexFromX(x: number): PegIndex | null {
    const centers = this.pegCenters();
    const hitRadius = this.width * 0.12;
    let closest: PegIndex | null = null;
    let closestDistance = Infinity;

    for (let index = 0; index < centers.length; index += 1) {
      const distance = Math.abs(x - centers[index]);
      if (distance < hitRadius && distance < closestDistance) {
        closest = index as PegIndex;
        closestDistance = distance;
      }
    }

    return closest;
  }

  private handleCanvasClick(event: MouseEvent): void {
    if (!this.canvas || this.state.won) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.width;
    const peg = this.pegIndexFromX(x);
    if (peg === null) {
      return;
    }

    if (this.state.selectedPeg === null) {
      if (this.state.pegs[peg].length === 0) {
        return;
      }

      this.state.selectedPeg = peg;
      this.updateStatus();
      this.draw();
      return;
    }

    if (this.state.selectedPeg === peg) {
      this.state.selectedPeg = null;
      this.updateStatus();
      this.draw();
      return;
    }

    if (this.tryMove(this.state.selectedPeg, peg)) {
      this.state.moves += 1;
      this.state.selectedPeg = null;
      this.state.won = this.state.pegs[2].length === this.diskCount;
    } else {
      this.state.selectedPeg = this.state.pegs[peg].length > 0 ? peg : null;
    }

    this.updateStatus();
    this.draw();
  }

  private tryMove(from: PegIndex, to: PegIndex): boolean {
    const source = this.state.pegs[from];
    const target = this.state.pegs[to];
    if (source.length === 0) {
      return false;
    }

    const disk = source[source.length - 1];
    const topTarget = target[target.length - 1];
    if (topTarget !== undefined && disk > topTarget) {
      return false;
    }

    source.pop();
    target.push(disk);
    return true;
  }

  private diskColor(size: number): string {
    const hue = 168 + ((size - 1) / Math.max(1, this.diskCount - 1)) * 72;
    return `hsl(${hue} 70% 45%)`;
  }

  private draw(): void {
    if (!this.ctx) {
      return;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const baseY = this.height * 0.82;
    const pegTop = this.height * 0.18;
    const pegHeight = baseY - pegTop;
    const centers = this.pegCenters();
    const maxDiskWidth = this.width * 0.22;
    const minDiskWidth = maxDiskWidth * 0.35;
    const diskHeight = Math.max(14, this.height * 0.045);
    const diskGap = 2;
    const pegWidth = Math.max(6, this.width * 0.012);

    ctx.fillStyle = "#334155";
    ctx.fillRect(this.width * 0.08, baseY, this.width * 0.84, pegWidth);

    for (let peg = 0; peg < centers.length; peg += 1) {
      const x = centers[peg];
      const selected = this.state.selectedPeg === peg;

      ctx.fillStyle = selected ? "#14b8a6" : "#475569";
      ctx.fillRect(x - pegWidth / 2, pegTop, pegWidth, pegHeight);

      const stack = this.state.pegs[peg as PegIndex];
      for (let level = 0; level < stack.length; level += 1) {
        const size = stack[level];
        const width =
          minDiskWidth +
          ((size - 1) / Math.max(1, this.diskCount - 1)) *
            (maxDiskWidth - minDiskWidth);
        const diskBottom = baseY - level * (diskHeight + diskGap);

        ctx.fillStyle = this.diskColor(size);
        ctx.beginPath();
        ctx.roundRect(
          x - width / 2,
          diskBottom - diskHeight,
          width,
          diskHeight,
          6,
        );
        ctx.fill();

        ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
        ctx.font = `600 ${Math.max(10, diskHeight * 0.45)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(size), x, diskBottom - diskHeight / 2);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "500 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let peg = 0; peg < centers.length; peg += 1) {
      ctx.fillText(String(peg + 1), centers[peg], baseY + pegWidth + 18);
    }
    ctx.textAlign = "start";

    if (this.state.won) {
      this.drawWinOverlay(ctx);
    } else if (this.state.selectedPeg === null) {
      ctx.fillStyle = "#64748b";
      ctx.font = "400 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Click a peg to pick a disk, then click another peg to move it",
        this.width / 2,
        this.height * 0.08,
      );
      ctx.textAlign = "start";
    }
  }

  private drawWinOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText("Tower complete!", this.width / 2, this.height / 2 - 16);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "400 14px system-ui, sans-serif";
    ctx.fillText(
      `${this.state.moves} moves · reset to play again`,
      this.width / 2,
      this.height / 2 + 14,
    );
    ctx.textAlign = "start";
  }

  protected getTextInputRoot(): HTMLElement | null {
    return this.root;
  }
}

export class TowersOfHanoiContentType extends ContentType {
  create(_container: HTMLElement, panel: Panel): ContentInstance {
    return new TowersOfHanoiContent(panel.id);
  }

  getDefaultTitle(): string {
    return "Towers of Hanoi";
  }
}
