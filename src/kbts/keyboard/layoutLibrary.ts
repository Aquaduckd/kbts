import type { KeyboardLayoutData } from "./KeyboardLayout.js";
import {
  normalizeKeyCharacterOverride,
  type KeyboardCharacterData,
} from "./keyCharacters.js";

export interface LayoutEditorShapeSummary {
  rows: number;
  cols: number;
  flow: KeyboardLayoutData["flow"];
  keyCount: number;
}

export interface LayoutEditorShapeInfo {
  source: string;
  keyboardId: string | null;
  shapeKey: string;
  sourceLabel: string;
  keyboardLabel: string | null;
  summary: LayoutEditorShapeSummary | null;
}

export interface KeyboardLayoutDocument {
  name: string;
  shape: LayoutEditorShapeInfo;
  characters: KeyboardCharacterData;
}

export interface StaticLayoutLibraryInfo {
  id: string;
  label: string;
}

export interface StaticLayoutManifestEntry {
  id: string;
  file: string;
  label: string;
}

export interface StaticLayoutLibrary {
  info: StaticLayoutLibraryInfo;
  entries: StaticLayoutManifestEntry[];
}

export interface UserLayoutRecord {
  label: string;
  savedAt: number;
  data: KeyboardLayoutDocument;
}

export interface UserLayoutLibrary {
  layouts: Record<string, UserLayoutRecord>;
}

export const STATIC_LAYOUT_BASE = "/static/layout";
export const STATIC_LAYOUT_LIBRARIES_MANIFEST_URL = `${STATIC_LAYOUT_BASE}/manifest.json`;
export const USER_LAYOUT_LIBRARY_KEY = "kbts.userLayoutLibrary.v1";

export function staticLayoutLibraryManifestUrl(libraryId: string): string {
  return `${STATIC_LAYOUT_BASE}/${libraryId}/manifest.json`;
}

export function staticLayoutUrl(libraryId: string, file: string): string {
  return `${STATIC_LAYOUT_BASE}/${libraryId}/${file}`;
}

function parseStaticLibraryInfo(value: unknown): StaticLayoutLibraryInfo | null {
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
): StaticLayoutManifestEntry | null {
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

function parseLayoutEditorShapeSummary(
  value: unknown,
): LayoutEditorShapeSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.rows !== "number" ||
    typeof record.cols !== "number" ||
    (record.flow !== "horizontal" && record.flow !== "vertical") ||
    typeof record.keyCount !== "number"
  ) {
    return null;
  }

  return {
    rows: record.rows,
    cols: record.cols,
    flow: record.flow,
    keyCount: record.keyCount,
  };
}

function parseLayoutEditorShapeInfo(value: unknown): LayoutEditorShapeInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.source !== "string" ||
    (record.keyboardId !== null && typeof record.keyboardId !== "string") ||
    typeof record.shapeKey !== "string" ||
    typeof record.sourceLabel !== "string" ||
    (record.keyboardLabel !== null && typeof record.keyboardLabel !== "string")
  ) {
    return null;
  }

  const summary =
    record.summary === null
      ? null
      : parseLayoutEditorShapeSummary(record.summary);
  if (record.summary !== null && !summary) {
    return null;
  }

  return {
    source: record.source,
    keyboardId: record.keyboardId,
    shapeKey: record.shapeKey,
    sourceLabel: record.sourceLabel,
    keyboardLabel: record.keyboardLabel,
    summary,
  };
}

function parseKeyboardCharacterData(value: unknown): KeyboardCharacterData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!record.keys || typeof record.keys !== "object") {
    return null;
  }

  const keys: Record<string, NonNullable<ReturnType<typeof normalizeKeyCharacterOverride>>> =
    {};

  for (const [key, override] of Object.entries(
    record.keys as Record<string, unknown>,
  )) {
    const normalized = normalizeKeyCharacterOverride(override);
    if (normalized) {
      keys[key] = normalized;
    }
  }

  return { keys };
}

export function parseKeyboardLayoutDocument(
  value: unknown,
): KeyboardLayoutDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  const shape = parseLayoutEditorShapeInfo(record.shape);
  const characters = parseKeyboardCharacterData(record.characters);

  if (!shape || !characters) {
    return null;
  }

  return { name, shape, characters };
}

export async function loadStaticLayoutLibraries(
  signal?: AbortSignal,
): Promise<StaticLayoutLibraryInfo[]> {
  const response = await fetch(STATIC_LAYOUT_LIBRARIES_MANIFEST_URL, {
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const entries = (await response.json()) as unknown[];
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(parseStaticLibraryInfo)
    .filter((entry): entry is StaticLayoutLibraryInfo => entry !== null);
}

export async function loadStaticLayoutLibraryManifest(
  libraryId: string,
  signal?: AbortSignal,
): Promise<StaticLayoutManifestEntry[]> {
  const response = await fetch(staticLayoutLibraryManifestUrl(libraryId), {
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const entries = (await response.json()) as unknown[];
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(parseStaticManifestEntry)
    .filter((entry): entry is StaticLayoutManifestEntry => entry !== null);
}

export async function loadAllStaticLayoutLibraries(
  signal?: AbortSignal,
): Promise<StaticLayoutLibrary[]> {
  const libraries = await loadStaticLayoutLibraries(signal);
  const loaded = await Promise.all(
    libraries.map(async (info) => ({
      info,
      entries: await loadStaticLayoutLibraryManifest(info.id, signal),
    })),
  );

  return loaded.filter((library) => library.entries.length > 0);
}

export async function loadStaticLayout(
  libraryId: string,
  file: string,
  signal?: AbortSignal,
): Promise<KeyboardLayoutDocument> {
  const response = await fetch(staticLayoutUrl(libraryId, file), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const parsed = parseKeyboardLayoutDocument(await response.json());
  if (!parsed) {
    throw new Error("Invalid layout JSON");
  }

  return parsed;
}

export function loadUserLayoutLibrary(): UserLayoutLibrary {
  const raw = localStorage.getItem(USER_LAYOUT_LIBRARY_KEY);
  if (!raw) {
    return { layouts: {} };
  }

  try {
    const parsed = JSON.parse(raw) as UserLayoutLibrary;
    if (!parsed || typeof parsed !== "object" || !parsed.layouts) {
      return { layouts: {} };
    }

    return parsed;
  } catch {
    return { layouts: {} };
  }
}

export function listUserLayouts(): Array<{
  id: string;
  label: string;
  savedAt: number;
}> {
  const library = loadUserLayoutLibrary();
  return Object.entries(library.layouts)
    .map(([id, record]) => ({
      id,
      label: record.label,
      savedAt: record.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadUserLayout(id: string): KeyboardLayoutDocument | null {
  const record = loadUserLayoutLibrary().layouts[id];
  if (!record) {
    return null;
  }

  return parseKeyboardLayoutDocument(record.data) ?? record.data;
}

export function saveUserLayout(
  label: string,
  data: KeyboardLayoutDocument,
): string {
  const trimmed = label.trim();
  const id = slugifyLayoutId(trimmed);
  const library = loadUserLayoutLibrary();
  library.layouts[id] = {
    label: trimmed,
    savedAt: Date.now(),
    data: { ...data, name: trimmed },
  };
  localStorage.setItem(USER_LAYOUT_LIBRARY_KEY, JSON.stringify(library));
  return id;
}

export function deleteUserLayout(id: string): void {
  const library = loadUserLayoutLibrary();
  if (!library.layouts[id]) {
    return;
  }

  delete library.layouts[id];
  localStorage.setItem(USER_LAYOUT_LIBRARY_KEY, JSON.stringify(library));
}

export function slugifyLayoutId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `layout-${Date.now()}`;
}
