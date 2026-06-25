import type { KeyboardLayoutData } from "./KeyboardLayout.js";

export interface KeyCharacterOverride {
  primary?: string;
  shift?: string;
  useDefaultShift?: boolean;
}

export interface KeyboardCharacterData {
  keys: Record<string, KeyCharacterOverride>;
}

export interface ResolvedKeyCharacter {
  primary: string;
  shift: string;
  useDefaultShift: boolean;
}

export const DEFAULT_KEYBOARD_CHARACTER_DATA: KeyboardCharacterData = {
  keys: {},
};

export function getDefaultPrimaryForPosition(
  _layout: Pick<KeyboardLayoutData, "rows" | "cols" | "flow">,
  _row: number,
  _col: number,
): string {
  return "";
}

export const ANSI_SHIFT_MAP: Record<string, string> = {
  "`": "~",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
  "-": "_",
  "=": "+",
  "[": "{",
  "]": "}",
  "\\": "|",
  ";": ":",
  "'": '"',
  ",": "<",
  ".": ">",
  "/": "?",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
  f: "F",
  g: "G",
  h: "H",
  i: "I",
  j: "J",
  k: "K",
  l: "L",
  m: "M",
  n: "N",
  o: "O",
  p: "P",
  q: "Q",
  r: "R",
  s: "S",
  t: "T",
  u: "U",
  v: "V",
  w: "W",
  x: "X",
  y: "Y",
  z: "Z",
};

export function positionKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function ansiShiftForPrimary(primary: string): string {
  if (!primary) {
    return "";
  }

  const mapped = ANSI_SHIFT_MAP[primary];
  if (mapped !== undefined) {
    return mapped;
  }

  if (primary.length === 1 && /[a-z]/.test(primary)) {
    return primary.toUpperCase();
  }

  return "";
}

export function normalizeKeyCharacterOverride(
  value: unknown,
): KeyCharacterOverride | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const override: KeyCharacterOverride = {};

  if (typeof record.primary === "string") {
    override.primary = record.primary.slice(0, 1);
  }
  if (typeof record.shift === "string") {
    override.shift = record.shift.slice(0, 1);
  }
  if (typeof record.useDefaultShift === "boolean") {
    override.useDefaultShift = record.useDefaultShift;
  }

  return override;
}

export function resolveKeyCharacter(
  layout: Pick<KeyboardLayoutData, "rows" | "cols" | "flow">,
  row: number,
  col: number,
  override?: KeyCharacterOverride,
): ResolvedKeyCharacter {
  const defaultPrimary = getDefaultPrimaryForPosition(layout, row, col);
  const useDefaultShift = override?.useDefaultShift !== false;
  const primary = override?.primary ?? defaultPrimary;
  const shift = useDefaultShift
    ? ansiShiftForPrimary(primary)
    : (override?.shift ?? "");

  return { primary, shift, useDefaultShift };
}

export function isEmptyKeyCharacterOverride(
  layout: Pick<KeyboardLayoutData, "rows" | "cols" | "flow">,
  row: number,
  col: number,
  override: KeyCharacterOverride,
): boolean {
  if (override.useDefaultShift === false) {
    return false;
  }

  if (override.shift !== undefined) {
    return false;
  }

  const defaultPrimary = getDefaultPrimaryForPosition(layout, row, col);
  if (override.primary !== undefined && override.primary !== defaultPrimary) {
    return false;
  }

  return true;
}

export class KeyboardCharacters {
  private layout: Pick<KeyboardLayoutData, "rows" | "cols" | "flow"> = {
    rows: 3,
    cols: 10,
    flow: "horizontal",
  };
  private readonly keys = new Map<string, KeyCharacterOverride>();

  setLayout(layout: Pick<KeyboardLayoutData, "rows" | "cols" | "flow">): void {
    this.layout = {
      rows: layout.rows,
      cols: layout.cols,
      flow: layout.flow,
    };

    for (const key of [...this.keys.keys()]) {
      const position = this.parsePositionKey(key);
      if (
        !position ||
        position.row >= this.layout.rows ||
        position.col >= this.layout.cols
      ) {
        this.keys.delete(key);
      }
    }
  }

  clear(): void {
    this.keys.clear();
  }

  loadFromData(data: KeyboardCharacterData = DEFAULT_KEYBOARD_CHARACTER_DATA): void {
    this.keys.clear();

    for (const [key, override] of Object.entries(data.keys ?? {})) {
      const position = this.parsePositionKey(key);
      const normalized = normalizeKeyCharacterOverride(override);
      if (position && normalized) {
        this.keys.set(positionKey(position.row, position.col), normalized);
      }
    }

    this.pruneEmptyEntries();
  }

  toData(): KeyboardCharacterData {
    const keys: Record<string, KeyCharacterOverride> = {};

    for (const key of this.keys.keys()) {
      const position = this.parsePositionKey(key);
      if (!position) {
        continue;
      }

      const stored = this.getStoredOverride(position.row, position.col);
      if (stored) {
        keys[key] = stored;
      }
    }

    return { keys };
  }

  getResolvedAt(row: number, col: number): ResolvedKeyCharacter {
    return resolveKeyCharacter(
      this.layout,
      row,
      col,
      this.keys.get(positionKey(row, col)),
    );
  }

  setPrimaryAt(row: number, col: number, primary: string): void {
    const nextPrimary = primary.slice(0, 1);
    const defaultPrimary = getDefaultPrimaryForPosition(this.layout, row, col);
    const current = this.keys.get(positionKey(row, col)) ?? {};
    const patch: KeyCharacterOverride = { ...current };

    if (!nextPrimary || nextPrimary === defaultPrimary) {
      delete patch.primary;
    } else {
      patch.primary = nextPrimary;
    }

    this.writeOverride(row, col, patch);
  }

  setShiftAt(row: number, col: number, shift: string): void {
    const nextShift = shift.slice(0, 1);
    const current = this.keys.get(positionKey(row, col)) ?? {};
    const patch: KeyCharacterOverride = {
      ...current,
      useDefaultShift: false,
      shift: nextShift,
    };

    this.writeOverride(row, col, patch);
  }

  setUseDefaultShiftAt(row: number, col: number, useDefaultShift: boolean): void {
    const current = this.keys.get(positionKey(row, col)) ?? {};
    const patch: KeyCharacterOverride = { ...current };

    if (useDefaultShift) {
      patch.useDefaultShift = true;
      delete patch.shift;
    } else {
      patch.useDefaultShift = false;
      patch.shift =
        patch.shift ??
        resolveKeyCharacter(this.layout, row, col, current).shift;
    }

    this.writeOverride(row, col, patch);
  }

  private writeOverride(row: number, col: number, override: KeyCharacterOverride): void {
    const key = positionKey(row, col);

    if (isEmptyKeyCharacterOverride(this.layout, row, col, override)) {
      this.keys.delete(key);
      return;
    }

    const stored = this.getStoredOverride(row, col, override);
    if (!stored) {
      this.keys.delete(key);
      return;
    }

    this.keys.set(key, stored);
  }

  private getStoredOverride(
    row: number,
    col: number,
    override: KeyCharacterOverride = this.keys.get(positionKey(row, col)) ?? {},
  ): KeyCharacterOverride | null {
    const stored: KeyCharacterOverride = {};

    const defaultPrimary = getDefaultPrimaryForPosition(this.layout, row, col);
    if (override.primary !== undefined && override.primary !== defaultPrimary) {
      stored.primary = override.primary;
    }

    if (override.useDefaultShift === false) {
      stored.useDefaultShift = false;
      if (override.shift !== undefined) {
        stored.shift = override.shift;
      }
    }

    if (Object.keys(stored).length === 0) {
      return null;
    }

    return stored;
  }

  private pruneEmptyEntries(): void {
    for (const [key, override] of [...this.keys.entries()]) {
      const position = this.parsePositionKey(key);
      if (!position) {
        this.keys.delete(key);
        continue;
      }

      if (isEmptyKeyCharacterOverride(this.layout, position.row, position.col, override)) {
        this.keys.delete(key);
      }
    }
  }

  private parsePositionKey(key: string): { row: number; col: number } | null {
    const match = /^(-?\d+),(-?\d+)$/.exec(key);
    if (!match) {
      return null;
    }

    return {
      row: Number(match[1]),
      col: Number(match[2]),
    };
  }
}
