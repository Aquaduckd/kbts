import type { KeyFinger, KeyHand, KeyOverride } from "./keyTypes.js";

export interface KeyFingerHandShortcut {
  label: string;
  finger: KeyFinger;
  hand: KeyHand;
}

export const KEY_FINGER_HAND_SHORTCUTS: readonly KeyFingerHandShortcut[] = [
  { label: "LP", finger: "pinky", hand: "left" },
  { label: "LR", finger: "ring", hand: "left" },
  { label: "LM", finger: "middle", hand: "left" },
  { label: "LI", finger: "index", hand: "left" },
  { label: "LT", finger: "thumb", hand: "left" },
  { label: "RT", finger: "thumb", hand: "right" },
  { label: "RI", finger: "index", hand: "right" },
  { label: "RM", finger: "middle", hand: "right" },
  { label: "RR", finger: "ring", hand: "right" },
  { label: "RP", finger: "pinky", hand: "right" },
];

const KEY_FINGERS = new Set<KeyFinger>([
  "pinky",
  "ring",
  "middle",
  "index",
  "thumb",
]);
const KEY_HANDS = new Set<KeyHand>(["left", "right"]);

export function fingerHandFromShortcutDigit(
  digit: number,
): Pick<KeyFingerHandShortcut, "finger" | "hand"> | null {
  return KEY_FINGER_HAND_SHORTCUTS[digit] ?? null;
}

export function parseShortcutDigit(event: KeyboardEvent): number | null {
  if (event.key.length === 1 && event.key >= "0" && event.key <= "9") {
    return Number(event.key);
  }

  const digitMatch = /^Digit(\d)$/.exec(event.code);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const numpadMatch = /^Numpad(\d)$/.exec(event.code);
  if (numpadMatch) {
    return Number(numpadMatch[1]);
  }

  return null;
}

function parseKeyFinger(value: unknown): KeyFinger | undefined {
  return typeof value === "string" && KEY_FINGERS.has(value as KeyFinger)
    ? (value as KeyFinger)
    : undefined;
}

function parseKeyHand(value: unknown): KeyHand | undefined {
  return typeof value === "string" && KEY_HANDS.has(value as KeyHand)
    ? (value as KeyHand)
    : undefined;
}

export function resolveKeyOverride(override: KeyOverride): KeyOverride {
  const resolved: KeyOverride = {
    offsetX: override.offsetX ?? 0,
    offsetY: override.offsetY ?? 0,
  };

  if (override.width !== undefined) {
    resolved.width = override.width;
  }
  if (override.height !== undefined) {
    resolved.height = override.height;
  }
  if (override.finger !== undefined) {
    resolved.finger = override.finger;
  }
  if (override.hand !== undefined) {
    resolved.hand = override.hand;
  }

  return resolved;
}

export function normalizeKeyOverride(raw: unknown): KeyOverride | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const draft: KeyOverride = {
    offsetX: typeof record.offsetX === "number" ? record.offsetX : 0,
    offsetY: typeof record.offsetY === "number" ? record.offsetY : 0,
  };

  if (typeof record.width === "number") {
    draft.width = record.width;
  }
  if (typeof record.height === "number") {
    draft.height = record.height;
  }

  const finger = parseKeyFinger(record.finger);
  const hand = parseKeyHand(record.hand);
  if (finger !== undefined) {
    draft.finger = finger;
  }
  if (hand !== undefined) {
    draft.hand = hand;
  }

  const resolved = resolveKeyOverride(draft);
  return isEmptyKeyOverride(resolved) ? null : resolved;
}

export function isEmptyKeyOverride(override: KeyOverride): boolean {
  const resolved = resolveKeyOverride(override);

  return (
    resolved.offsetX === 0 &&
    resolved.offsetY === 0 &&
    resolved.width === undefined &&
    resolved.height === undefined &&
    resolved.finger === undefined &&
    resolved.hand === undefined
  );
}

export const KEY_FINGER_OPTIONS: Array<{ value: KeyFinger; label: string }> = [
  { value: "pinky", label: "Pinky" },
  { value: "ring", label: "Ring" },
  { value: "middle", label: "Middle" },
  { value: "index", label: "Index" },
  { value: "thumb", label: "Thumb" },
];

export const KEY_HAND_OPTIONS: Array<{ value: KeyHand; label: string }> = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export interface FingerHandPalette {
  pinky: string;
  ring: string;
  middle: string;
  leftIndex: string;
  rightIndex: string;
  leftThumb: string;
  rightThumb: string;
}

export const DEFAULT_FINGER_HAND_PALETTE: FingerHandPalette = {
  pinky: "#f472b6",
  ring: "#a855f7",
  middle: "#3b82f6",
  leftIndex: "#a3e635",
  rightIndex: "#22c55e",
  leftThumb: "#ef4444",
  rightThumb: "#f97316",
};

export function keyFingerHandColor(
  finger?: KeyFinger,
  hand?: KeyHand,
  palette: FingerHandPalette = DEFAULT_FINGER_HAND_PALETTE,
): string | null {
  if (!finger) {
    return null;
  }

  switch (finger) {
    case "pinky":
      return palette.pinky;
    case "ring":
      return palette.ring;
    case "middle":
      return palette.middle;
    case "index":
      if (hand === "left") {
        return palette.leftIndex;
      }
      if (hand === "right") {
        return palette.rightIndex;
      }
      return null;
    case "thumb":
      if (hand === "left") {
        return palette.leftThumb;
      }
      if (hand === "right") {
        return palette.rightThumb;
      }
      return null;
  }
}
