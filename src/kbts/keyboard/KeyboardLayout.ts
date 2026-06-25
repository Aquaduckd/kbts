import type { KeyOverride } from "./keyTypes.js";
import {
  isEmptyKeyOverride,
  normalizeKeyOverride,
  resolveKeyOverride,
} from "./keyColors.js";

export type { KeyFinger, KeyHand, KeyOverride } from "./keyTypes.js";

export type FlowDirection = "horizontal" | "vertical";

export interface KeyGridPosition {
  row: number;
  col: number;
}

export interface KeyboardLayoutData {
  name: string;
  rows: number;
  cols: number;
  flow: FlowDirection;
  keys: Record<string, KeyOverride>;
  lineKeyCounts: Record<number, number>;
}

export const DEFAULT_KEYBOARD_LAYOUT: KeyboardLayoutData = {
  name: "",
  rows: 3,
  cols: 10,
  flow: "horizontal",
  keys: {},
  lineKeyCounts: {},
};

export class KeyboardLayout {
  name: string;
  rows: number;
  cols: number;
  flow: FlowDirection;
  private readonly keys = new Map<string, KeyOverride>();
  private readonly lineKeyCounts = new Map<number, number>();

  constructor(data: KeyboardLayoutData = DEFAULT_KEYBOARD_LAYOUT) {
    this.name = "";
    this.rows = 0;
    this.cols = 0;
    this.flow = "horizontal";
    this.loadFromData(data);
  }

  loadFromData(data: KeyboardLayoutData): void {
    this.name = data.name ?? "";
    this.rows = data.rows;
    this.cols = data.cols;
    this.flow = data.flow;
    this.keys.clear();
    this.lineKeyCounts.clear();

    for (const [key, override] of Object.entries(data.keys)) {
      const position = this.parsePositionKey(key);
      const normalized = normalizeKeyOverride(override);
      if (position && normalized) {
        this.keys.set(this.positionKey(position.row, position.col), normalized);
      }
    }

    for (const [line, count] of Object.entries(data.lineKeyCounts)) {
      this.lineKeyCounts.set(Number(line), count);
    }

    this.syncKeys();
  }

  get keyCount(): number {
    if (this.flow === "horizontal") {
      let total = 0;
      for (let row = 0; row < this.rows; row += 1) {
        total += this.getLineKeyCount(row);
      }
      return total;
    }

    let total = 0;
    for (let col = 0; col < this.cols; col += 1) {
      total += this.getLineKeyCount(col);
    }
    return total;
  }

  get lineCount(): number {
    return this.flow === "horizontal" ? this.rows : this.cols;
  }

  get defaultLineKeyCount(): number {
    return this.flow === "horizontal" ? this.cols : this.rows;
  }

  getLineKeyCount(line: number): number {
    return this.lineKeyCounts.get(line) ?? this.defaultLineKeyCount;
  }

  setLineKeyCount(line: number, count: number): void {
    const clamped = Math.min(this.defaultLineKeyCount, Math.max(1, count));

    if (clamped === this.defaultLineKeyCount) {
      this.lineKeyCounts.delete(line);
    } else {
      this.lineKeyCounts.set(line, clamped);
    }
  }

  resetLineKeyCount(line: number): void {
    this.lineKeyCounts.delete(line);
  }

  hasLineKeyCountOverride(line: number): boolean {
    return this.lineKeyCounts.has(line);
  }

  getLineForKey(index: number): number {
    return this.cellPosition(index).line;
  }

  cellPosition(index: number): KeyGridPosition & { line: number } {
    if (this.flow === "horizontal") {
      let offset = 0;

      for (let row = 0; row < this.rows; row += 1) {
        const count = this.getLineKeyCount(row);
        if (index < offset + count) {
          return {
            row,
            col: index - offset,
            line: row,
          };
        }
        offset += count;
      }

      throw new RangeError(`Key index ${index} is out of range`);
    }

    let offset = 0;

    for (let col = 0; col < this.cols; col += 1) {
      const count = this.getLineKeyCount(col);
      if (index < offset + count) {
        return {
          row: index - offset,
          col,
          line: col,
        };
      }
      offset += count;
    }

    throw new RangeError(`Key index ${index} is out of range`);
  }

  lineStartIndex(line: number): number {
    let index = 0;

    for (let i = 0; i < line; i += 1) {
      index += this.getLineKeyCount(i);
    }

    return index;
  }

  syncKeys(): void {
    for (const [line, count] of [...this.lineKeyCounts.entries()]) {
      if (line >= this.lineCount || count > this.defaultLineKeyCount) {
        this.lineKeyCounts.delete(line);
      }
    }

    for (const key of [...this.keys.keys()]) {
      const position = this.parsePositionKey(key);
      if (!position || !this.isValidPosition(position.row, position.col)) {
        this.keys.delete(key);
      }
    }
  }

  clearLineKeyCounts(): void {
    this.lineKeyCounts.clear();
  }

  hasKeyAt(row: number, col: number): boolean {
    return this.isValidPosition(row, col);
  }

  indexForPosition(row: number, col: number): number {
    if (!this.isValidPosition(row, col)) {
      throw new RangeError(`No key at row ${row}, col ${col}`);
    }

    if (this.flow === "horizontal") {
      return this.lineStartIndex(row) + col;
    }

    return this.lineStartIndex(col) + row;
  }

  getKeyOverride(index: number): KeyOverride {
    const { row, col } = this.cellPosition(index);
    return this.getKeyOverrideAt(row, col);
  }

  getKeyOverrideAt(row: number, col: number): KeyOverride {
    const stored = this.keys.get(this.positionKey(row, col));
    if (!stored) {
      return {
        offsetX: 0,
        offsetY: 0,
      };
    }

    return resolveKeyOverride(stored);
  }

  setKeyOverride(index: number, patch: Partial<KeyOverride>): void {
    const { row, col } = this.cellPosition(index);
    this.setKeyOverrideAt(row, col, patch);
  }

  setKeyOverrideAt(
    row: number,
    col: number,
    patch: Partial<KeyOverride>,
  ): void {
    const current = this.getKeyOverrideAt(row, col);
    const next = resolveKeyOverride({ ...current, ...patch });
    const key = this.positionKey(row, col);

    if (isEmptyKeyOverride(next)) {
      this.keys.delete(key);
    } else {
      this.keys.set(key, next);
    }
  }

  resetKeyOverride(index: number): void {
    const { row, col } = this.cellPosition(index);
    this.resetKeyOverrideAt(row, col);
  }

  resetKeyOverrideAt(row: number, col: number): void {
    this.keys.delete(this.positionKey(row, col));
  }

  toData(): KeyboardLayoutData {
    return {
      name: this.name,
      rows: this.rows,
      cols: this.cols,
      flow: this.flow,
      keys: Object.fromEntries(
        [...this.keys.entries()].map(([position, override]) => [
          position,
          resolveKeyOverride(override),
        ]),
      ),
      lineKeyCounts: Object.fromEntries(this.lineKeyCounts),
    };
  }

  private positionKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  private parsePositionKey(key: string): KeyGridPosition | null {
    const parts = key.split(",");
    if (parts.length !== 2) {
      return null;
    }

    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (Number.isNaN(row) || Number.isNaN(col)) {
      return null;
    }

    return { row, col };
  }

  private isValidPosition(row: number, col: number): boolean {
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) {
      return false;
    }

    if (this.flow === "horizontal") {
      return col < this.getLineKeyCount(row);
    }

    return row < this.getLineKeyCount(col);
  }
}
