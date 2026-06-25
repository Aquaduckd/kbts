export type ShortcutAction =
  | "focusLeft"
  | "focusRight"
  | "focusUp"
  | "focusDown"
  | "resizeLeft"
  | "resizeRight"
  | "resizeUp"
  | "resizeDown"
  | "splitHorizontal"
  | "splitVertical"
  | "openPanelPicker"
  | "closePanel";

export interface ShortcutBinding {
  key: string;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export type ShortcutConfig = Record<ShortcutAction, ShortcutBinding>;

export const SHORTCUT_STORAGE_KEY = "kbts.keyboardShortcuts.v2";

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  focusLeft: { key: "ArrowLeft", shiftKey: true },
  focusRight: { key: "ArrowRight", shiftKey: true },
  focusUp: { key: "ArrowUp", shiftKey: true },
  focusDown: { key: "ArrowDown", shiftKey: true },
  resizeLeft: { key: "ArrowLeft", altKey: true, shiftKey: true },
  resizeRight: { key: "ArrowRight", altKey: true, shiftKey: true },
  resizeUp: { key: "ArrowUp", altKey: true, shiftKey: true },
  resizeDown: { key: "ArrowDown", altKey: true, shiftKey: true },
  splitHorizontal: { key: "h", shiftKey: true },
  splitVertical: { key: "v", shiftKey: true },
  openPanelPicker: { key: "Enter", shiftKey: true },
  closePanel: { key: "Backspace", shiftKey: true },
};

export const SHORTCUT_ACTION_ORDER: ShortcutAction[] = [
  "focusLeft",
  "focusRight",
  "focusUp",
  "focusDown",
  "resizeLeft",
  "resizeRight",
  "resizeUp",
  "resizeDown",
  "splitHorizontal",
  "splitVertical",
  "openPanelPicker",
  "closePanel",
];

export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  focusLeft: "Focus panel left",
  focusRight: "Focus panel right",
  focusUp: "Focus panel up",
  focusDown: "Focus panel down",
  resizeLeft: "Resize panel left",
  resizeRight: "Resize panel right",
  resizeUp: "Resize panel up",
  resizeDown: "Resize panel down",
  splitHorizontal: "Split horizontally",
  splitVertical: "Split vertically",
  openPanelPicker: "Open panel picker",
  closePanel: "Close panel",
};

let shortcutCaptureActive = false;

export function setShortcutCaptureActive(active: boolean): void {
  shortcutCaptureActive = active;
}

export function isShortcutCaptureActive(): boolean {
  return shortcutCaptureActive;
}

export function getShortcutConfig(): ShortcutConfig {
  if (!localStorage.getItem(SHORTCUT_STORAGE_KEY)) {
    localStorage.setItem(
      SHORTCUT_STORAGE_KEY,
      JSON.stringify(DEFAULT_SHORTCUTS),
    );
  }

  return loadShortcutConfig();
}

export function loadShortcutConfig(): ShortcutConfig {
  const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
  if (!raw) {
    return cloneDefaults();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig>;
    return mergeShortcutConfig(parsed);
  } catch {
    return cloneDefaults();
  }
}

export function saveShortcutConfig(config: ShortcutConfig): void {
  localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(config));
}

export function resetShortcutConfig(): ShortcutConfig {
  const defaults = cloneDefaults();
  saveShortcutConfig(defaults);
  return defaults;
}

export function resetShortcutBinding(action: ShortcutAction): ShortcutConfig {
  const config = loadShortcutConfig();
  config[action] = { ...cloneDefaults()[action] };
  saveShortcutConfig(config);
  return config;
}

export function formatShortcutBinding(binding: ShortcutBinding): string {
  const parts: string[] = [];

  if (binding.ctrlKey) {
    parts.push("Ctrl");
  }
  if (binding.altKey) {
    parts.push("Option");
  }
  if (binding.metaKey) {
    parts.push("Cmd");
  }
  if (binding.shiftKey) {
    parts.push("Shift");
  }

  parts.push(formatDisplayKey(binding.key));
  return parts.join(" + ");
}

export function bindingFromKeyboardEvent(
  event: KeyboardEvent,
): ShortcutBinding | null {
  if (isModifierKey(event.key)) {
    return null;
  }

  const binding: ShortcutBinding = {
    key: normalizeBindingKey(event.key),
  };

  if (event.altKey) {
    binding.altKey = true;
  }
  if (event.metaKey) {
    binding.metaKey = true;
  }
  if (event.ctrlKey) {
    binding.ctrlKey = true;
  }
  if (event.shiftKey) {
    binding.shiftKey = true;
  }

  return binding;
}

export function bindingsEqual(
  left: ShortcutBinding,
  right: ShortcutBinding,
): boolean {
  return (
    normalizeBindingKey(left.key) === normalizeBindingKey(right.key) &&
    (left.altKey ?? false) === (right.altKey ?? false) &&
    (left.metaKey ?? false) === (right.metaKey ?? false) &&
    (left.ctrlKey ?? false) === (right.ctrlKey ?? false) &&
    (left.shiftKey ?? false) === (right.shiftKey ?? false)
  );
}

export function findConflictingAction(
  config: ShortcutConfig,
  binding: ShortcutBinding,
  except?: ShortcutAction,
): ShortcutAction | null {
  for (const action of SHORTCUT_ACTION_ORDER) {
    if (action === except) {
      continue;
    }

    if (bindingsEqual(config[action], binding)) {
      return action;
    }
  }

  return null;
}

export function updateShortcutBinding(
  action: ShortcutAction,
  binding: ShortcutBinding,
): ShortcutConfig {
  const config = loadShortcutConfig();
  config[action] = { ...binding };
  saveShortcutConfig(config);
  return config;
}

export function matchesShortcut(
  event: KeyboardEvent,
  binding: ShortcutBinding,
): boolean {
  if (!matchesKey(event, binding.key)) {
    return false;
  }

  return (
    event.altKey === (binding.altKey ?? false) &&
    event.metaKey === (binding.metaKey ?? false) &&
    event.ctrlKey === (binding.ctrlKey ?? false) &&
    event.shiftKey === (binding.shiftKey ?? false)
  );
}

export function findMatchingAction(
  event: KeyboardEvent,
  config: ShortcutConfig,
): ShortcutAction | null {
  for (const [action, binding] of Object.entries(config) as [
    ShortcutAction,
    ShortcutBinding,
  ][]) {
    if (matchesShortcut(event, binding)) {
      return action;
    }
  }

  return null;
}

function mergeShortcutConfig(partial: Partial<ShortcutConfig>): ShortcutConfig {
  const merged = cloneDefaults();

  for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
    const binding = partial[action];
    if (binding?.key) {
      merged[action] = { ...binding };
    }
  }

  return merged;
}

function cloneDefaults(): ShortcutConfig {
  return structuredClone(DEFAULT_SHORTCUTS);
}

function matchesKey(event: KeyboardEvent, key: string): boolean {
  return normalizeBindingKey(event.key) === normalizeBindingKey(key);
}

function normalizeBindingKey(key: string): string {
  if (key === " ") {
    return "Space";
  }

  if (key.length === 1) {
    return key.toLowerCase();
  }

  return key;
}

function formatDisplayKey(key: string): string {
  switch (key) {
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "Enter":
      return "Enter";
    case "Escape":
      return "Escape";
    case "Delete":
      return "Delete";
    case "Backspace":
      return "Backspace";
    case "Space":
      return "Space";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

function isModifierKey(key: string): boolean {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}
