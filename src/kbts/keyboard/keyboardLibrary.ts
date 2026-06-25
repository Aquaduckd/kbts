import type { KeyboardLayoutData } from "./KeyboardLayout.js";

export interface StaticKeyboardLibraryInfo {
  id: string;
  label: string;
}

export interface StaticKeyboardManifestEntry {
  id: string;
  file: string;
  label: string;
}

export interface StaticKeyboardLibrary {
  info: StaticKeyboardLibraryInfo;
  entries: StaticKeyboardManifestEntry[];
}

export interface UserKeyboardRecord {
  label: string;
  savedAt: number;
  data: KeyboardLayoutData;
}

export interface UserKeyboardLibrary {
  keyboards: Record<string, UserKeyboardRecord>;
}

export const STATIC_KEYBOARD_BASE = "/static/keyboard";
export const STATIC_LIBRARIES_MANIFEST_URL = `${STATIC_KEYBOARD_BASE}/manifest.json`;
export const USER_KEYBOARD_LIBRARY_KEY = "kbts.userKeyboardLibrary.v1";

export function staticLibraryManifestUrl(libraryId: string): string {
  return `${STATIC_KEYBOARD_BASE}/${libraryId}/manifest.json`;
}

export function staticKeyboardUrl(libraryId: string, file: string): string {
  return `${STATIC_KEYBOARD_BASE}/${libraryId}/${file}`;
}

function parseStaticLibraryInfo(
  value: unknown,
): StaticKeyboardLibraryInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.label !== "string") {
    return null;
  }

  return { id: record.id, label: record.label };
}

function parseStaticManifestEntry(
  value: unknown,
): StaticKeyboardManifestEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.file !== "string" ||
    typeof record.label !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    file: record.file,
    label: record.label,
  };
}

export async function loadStaticLibraries(
  signal?: AbortSignal,
): Promise<StaticKeyboardLibraryInfo[]> {
  const response = await fetch(STATIC_LIBRARIES_MANIFEST_URL, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const entries = (await response.json()) as unknown[];
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(parseStaticLibraryInfo)
    .filter((entry): entry is StaticKeyboardLibraryInfo => entry !== null);
}

export async function loadStaticLibraryManifest(
  libraryId: string,
  signal?: AbortSignal,
): Promise<StaticKeyboardManifestEntry[]> {
  const response = await fetch(staticLibraryManifestUrl(libraryId), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const entries = (await response.json()) as unknown[];
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(parseStaticManifestEntry)
    .filter((entry): entry is StaticKeyboardManifestEntry => entry !== null);
}

export async function loadAllStaticLibraries(
  signal?: AbortSignal,
): Promise<StaticKeyboardLibrary[]> {
  const libraries = await loadStaticLibraries(signal);
  const loaded = await Promise.all(
    libraries.map(async (info) => ({
      info,
      entries: await loadStaticLibraryManifest(info.id, signal),
    })),
  );

  return loaded.filter((library) => library.entries.length > 0);
}

export async function loadStaticKeyboard(
  libraryId: string,
  file: string,
  signal?: AbortSignal,
): Promise<KeyboardLayoutData> {
  const response = await fetch(staticKeyboardUrl(libraryId, file), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as KeyboardLayoutData;
}

export function loadUserKeyboardLibrary(): UserKeyboardLibrary {
  const raw = localStorage.getItem(USER_KEYBOARD_LIBRARY_KEY);
  if (!raw) {
    return { keyboards: {} };
  }

  try {
    const parsed = JSON.parse(raw) as UserKeyboardLibrary;
    if (!parsed || typeof parsed !== "object" || !parsed.keyboards) {
      return { keyboards: {} };
    }

    return parsed;
  } catch {
    return { keyboards: {} };
  }
}

export function listUserKeyboards(): Array<{
  id: string;
  label: string;
  savedAt: number;
}> {
  const library = loadUserKeyboardLibrary();
  return Object.entries(library.keyboards)
    .map(([id, record]) => ({
      id,
      label: record.label,
      savedAt: record.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadUserKeyboard(id: string): KeyboardLayoutData | null {
  return loadUserKeyboardLibrary().keyboards[id]?.data ?? null;
}

export function saveUserKeyboard(
  label: string,
  data: KeyboardLayoutData,
): string {
  const trimmed = label.trim();
  const id = slugifyKeyboardId(trimmed);
  const library = loadUserKeyboardLibrary();
  library.keyboards[id] = {
    label: trimmed,
    savedAt: Date.now(),
    data: { ...data, name: trimmed },
  };
  localStorage.setItem(USER_KEYBOARD_LIBRARY_KEY, JSON.stringify(library));
  return id;
}

export function deleteUserKeyboard(id: string): void {
  const library = loadUserKeyboardLibrary();
  if (!library.keyboards[id]) {
    return;
  }

  delete library.keyboards[id];
  localStorage.setItem(USER_KEYBOARD_LIBRARY_KEY, JSON.stringify(library));
}

export function slugifyKeyboardId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `keyboard-${Date.now()}`;
}
