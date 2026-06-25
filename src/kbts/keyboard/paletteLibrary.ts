import type { FingerHandPalette } from "./keyColors.js";

export interface FingerPaletteData extends FingerHandPalette {
  name: string;
}

export interface StaticPaletteLibraryInfo {
  id: string;
  label: string;
}

export interface StaticPaletteManifestEntry {
  id: string;
  file: string;
  label: string;
}

export interface StaticPaletteLibrary {
  info: StaticPaletteLibraryInfo;
  entries: StaticPaletteManifestEntry[];
}

export interface UserPaletteRecord {
  label: string;
  savedAt: number;
  data: FingerPaletteData;
}

export interface UserPaletteLibrary {
  palettes: Record<string, UserPaletteRecord>;
}

export const STATIC_PALETTE_BASE = "/static/palette";
export const STATIC_PALETTE_LIBRARIES_MANIFEST_URL = `${STATIC_PALETTE_BASE}/manifest.json`;
export const USER_PALETTE_LIBRARY_KEY = "kbts.userPaletteLibrary.v1";

const PALETTE_COLOR_KEYS: (keyof FingerHandPalette)[] = [
  "pinky",
  "ring",
  "middle",
  "leftIndex",
  "rightIndex",
  "leftThumb",
  "rightThumb",
];

export function staticPaletteLibraryManifestUrl(libraryId: string): string {
  return `${STATIC_PALETTE_BASE}/${libraryId}/manifest.json`;
}

export function staticPaletteUrl(libraryId: string, file: string): string {
  return `${STATIC_PALETTE_BASE}/${libraryId}/${file}`;
}

function parseStaticLibraryInfo(
  value: unknown,
): StaticPaletteLibraryInfo | null {
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
): StaticPaletteManifestEntry | null {
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

export function parseFingerPaletteData(value: unknown): FingerPaletteData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  const colors: Partial<FingerHandPalette> = {};

  for (const key of PALETTE_COLOR_KEYS) {
    if (typeof record[key] !== "string") {
      return null;
    }
    colors[key] = record[key];
  }

  return {
    name,
    ...(colors as FingerHandPalette),
  };
}

export async function loadStaticPaletteLibraries(
  signal?: AbortSignal,
): Promise<StaticPaletteLibraryInfo[]> {
  const response = await fetch(STATIC_PALETTE_LIBRARIES_MANIFEST_URL, {
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
    .filter((entry): entry is StaticPaletteLibraryInfo => entry !== null);
}

export async function loadStaticPaletteLibraryManifest(
  libraryId: string,
  signal?: AbortSignal,
): Promise<StaticPaletteManifestEntry[]> {
  const response = await fetch(staticPaletteLibraryManifestUrl(libraryId), {
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
    .filter((entry): entry is StaticPaletteManifestEntry => entry !== null);
}

export async function loadAllStaticPaletteLibraries(
  signal?: AbortSignal,
): Promise<StaticPaletteLibrary[]> {
  const libraries = await loadStaticPaletteLibraries(signal);
  const loaded = await Promise.all(
    libraries.map(async (info) => ({
      info,
      entries: await loadStaticPaletteLibraryManifest(info.id, signal),
    })),
  );

  return loaded.filter((library) => library.entries.length > 0);
}

export async function loadStaticPalette(
  libraryId: string,
  file: string,
  signal?: AbortSignal,
): Promise<FingerPaletteData> {
  const response = await fetch(staticPaletteUrl(libraryId, file), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const parsed = parseFingerPaletteData(await response.json());
  if (!parsed) {
    throw new Error("Invalid palette JSON");
  }

  return parsed;
}

export function loadUserPaletteLibrary(): UserPaletteLibrary {
  const raw = localStorage.getItem(USER_PALETTE_LIBRARY_KEY);
  if (!raw) {
    return { palettes: {} };
  }

  try {
    const parsed = JSON.parse(raw) as UserPaletteLibrary;
    if (!parsed || typeof parsed !== "object" || !parsed.palettes) {
      return { palettes: {} };
    }

    return parsed;
  } catch {
    return { palettes: {} };
  }
}

export function listUserPalettes(): Array<{
  id: string;
  label: string;
  savedAt: number;
}> {
  const library = loadUserPaletteLibrary();
  return Object.entries(library.palettes)
    .map(([id, record]) => ({
      id,
      label: record.label,
      savedAt: record.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadUserPalette(id: string): FingerPaletteData | null {
  const record = loadUserPaletteLibrary().palettes[id];
  if (!record) {
    return null;
  }

  return parseFingerPaletteData(record.data) ?? record.data;
}

export function saveUserPalette(
  label: string,
  data: FingerPaletteData,
): string {
  const trimmed = label.trim();
  const id = slugifyPaletteId(trimmed);
  const library = loadUserPaletteLibrary();
  library.palettes[id] = {
    label: trimmed,
    savedAt: Date.now(),
    data: { ...data, name: trimmed },
  };
  localStorage.setItem(USER_PALETTE_LIBRARY_KEY, JSON.stringify(library));
  return id;
}

export function deleteUserPalette(id: string): void {
  const library = loadUserPaletteLibrary();
  if (!library.palettes[id]) {
    return;
  }

  delete library.palettes[id];
  localStorage.setItem(USER_PALETTE_LIBRARY_KEY, JSON.stringify(library));
}

export function slugifyPaletteId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `palette-${Date.now()}`;
}
