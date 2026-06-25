import {
  KeyboardLayout,
} from "./KeyboardLayout.js";
import type { KeyOverride } from "./keyTypes.js";

export interface KeyboardLayoutCosmetics {
  keySize: number;
  gap: number;
}

export interface KeyLayout {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_KEYBOARD_LAYOUT_COSMETICS: KeyboardLayoutCosmetics = {
  keySize: 40,
  gap: 4,
};

const KEY_EIGHTHS = 8;
const KEY_SIZE_EIGHTHS_DEFAULT = 8;

export function computeKeyLayouts(
  keyboard: KeyboardLayout,
  cosmetics: KeyboardLayoutCosmetics = DEFAULT_KEYBOARD_LAYOUT_COSMETICS,
): KeyLayout[] {
  const { gap } = cosmetics;
  const count = keyboard.keyCount;
  const layouts: KeyLayout[] = [];

  for (let index = 0; index < count; index += 1) {
    const { row, col } = keyboard.cellPosition(index);
    const override = keyboard.getKeyOverride(index);
    const width = sizeEighthsToPx(
      override.width ?? KEY_SIZE_EIGHTHS_DEFAULT,
      cosmetics,
    );
    const height = sizeEighthsToPx(
      override.height ?? KEY_SIZE_EIGHTHS_DEFAULT,
      cosmetics,
    );
    const { offsetX, offsetY } = offsetEighthsForLayoutPx(override, cosmetics);

    let x = 0;
    let y = 0;

    if (index === 0) {
      x = offsetX;
      y = offsetY;
    } else if (keyboard.flow === "horizontal") {
      const rowStartIndex = keyboard.lineStartIndex(row);

      if (col === 0) {
        x = offsetX;
        y =
          lineBottom(
            layouts,
            keyboard.lineStartIndex(row - 1),
            rowStartIndex - 1,
          ) +
          gap +
          offsetY;
      } else {
        const prev = layouts[index - 1]!;
        const rowStart = layouts[rowStartIndex]!;
        x = prev.x + prev.width + gap + offsetX;
        y = rowStart.y + offsetY;
      }
    } else {
      const colStartIndex = keyboard.lineStartIndex(col);

      if (row === 0) {
        x =
          lineRight(
            layouts,
            keyboard.lineStartIndex(col - 1),
            colStartIndex - 1,
          ) +
          gap +
          offsetX;
        y = offsetY;
      } else {
        const prev = layouts[index - 1]!;
        const colStart = layouts[colStartIndex]!;
        x = colStart.x + offsetX;
        y = prev.y + prev.height + gap + offsetY;
      }
    }

    layouts.push({ index, row, col, x, y, width, height });
  }

  return layouts;
}

function lineBottom(
  layouts: KeyLayout[],
  startIndex: number,
  endIndex: number,
): number {
  if (endIndex < startIndex) {
    return 0;
  }

  let bottom = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const layout = layouts[index]!;
    bottom = Math.max(bottom, layout.y + layout.height);
  }

  return bottom;
}

function lineRight(
  layouts: KeyLayout[],
  startIndex: number,
  endIndex: number,
): number {
  if (endIndex < startIndex) {
    return 0;
  }

  let right = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const layout = layouts[index]!;
    right = Math.max(right, layout.x + layout.width);
  }

  return right;
}

function slotUnitPx(cosmetics: KeyboardLayoutCosmetics): number {
  return cosmetics.keySize + cosmetics.gap;
}

function slotEighthsToPx(eighths: number, cosmetics: KeyboardLayoutCosmetics): number {
  return (eighths / KEY_EIGHTHS) * slotUnitPx(cosmetics);
}

function sizeUnitsToPx(units: number, cosmetics: KeyboardLayoutCosmetics): number {
  return units * slotUnitPx(cosmetics) - cosmetics.gap;
}

function sizeEighthsToPx(
  eighths: number,
  cosmetics: KeyboardLayoutCosmetics,
): number {
  return sizeUnitsToPx(eighths / KEY_EIGHTHS, cosmetics);
}

function offsetEighthsForLayoutPx(
  override: KeyOverride,
  cosmetics: KeyboardLayoutCosmetics,
): { offsetX: number; offsetY: number } {
  return {
    offsetX: slotEighthsToPx(override.offsetX, cosmetics),
    offsetY: slotEighthsToPx(override.offsetY, cosmetics),
  };
}
