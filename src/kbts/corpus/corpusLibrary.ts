export interface CorpusDocument {
  name: string;
  text: string;
}

export interface StaticCorpusLibraryInfo {
  id: string;
  label: string;
}

export interface StaticCorpusManifestEntry {
  id: string;
  file: string;
  label: string;
}

export interface StaticCorpusLibrary {
  info: StaticCorpusLibraryInfo;
  entries: StaticCorpusManifestEntry[];
}

export interface UserCorpusRecord {
  label: string;
  savedAt: number;
  data: CorpusDocument;
}

export interface UserCorpusLibrary {
  corpora: Record<string, UserCorpusRecord>;
}

export const STATIC_CORPUS_BASE = "/static/corpus";
export const STATIC_CORPUS_LIBRARIES_MANIFEST_URL = `${STATIC_CORPUS_BASE}/manifest.json`;
export const MONKEYTYPE_REPO = "monkeytypegame/monkeytype";
export const MONKEYTYPE_REF = "master";
export const MONKEYTYPE_GITHUB_CONTENTS_API = `https://api.github.com/repos/${MONKEYTYPE_REPO}/contents`;
export const MONKEYTYPE_LANGUAGE_GROUPS_URL = `https://raw.githubusercontent.com/${MONKEYTYPE_REPO}/${MONKEYTYPE_REF}/frontend/src/ts/constants/languages.ts`;
export const MONKEYTYPE_WORDS_PATH = "frontend/static/languages";
export const MONKEYTYPE_QUOTES_PATH = "frontend/static/quotes";
export const MONKEYTYPE_WORDS_BASE = `https://raw.githubusercontent.com/${MONKEYTYPE_REPO}/${MONKEYTYPE_REF}/${MONKEYTYPE_WORDS_PATH}`;
/** @deprecated Use MONKEYTYPE_WORDS_BASE */
export const MONKEYTYPE_LANGUAGE_BASE = MONKEYTYPE_WORDS_BASE;
export const MONKEYTYPE_QUOTES_BASE = `https://raw.githubusercontent.com/${MONKEYTYPE_REPO}/${MONKEYTYPE_REF}/${MONKEYTYPE_QUOTES_PATH}`;
export const USER_CORPUS_LIBRARY_KEY = "kbts.userCorpusLibrary.v1";

export interface MonkeyTypeLanguageEntry {
  id: string;
  label: string;
}

export interface MonkeyTypeLanguageGroup {
  id: string;
  label: string;
  languages: MonkeyTypeLanguageEntry[];
}

export function staticCorpusLibraryManifestUrl(libraryId: string): string {
  return `${STATIC_CORPUS_BASE}/${libraryId}/manifest.json`;
}

export function staticCorpusUrl(libraryId: string, file: string): string {
  return `${STATIC_CORPUS_BASE}/${libraryId}/${file}`;
}

function parseStaticLibraryInfo(value: unknown): StaticCorpusLibraryInfo | null {
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
): StaticCorpusManifestEntry | null {
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

export function parseCorpusDocument(value: unknown): CorpusDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string") {
    return null;
  }

  return {
    name: typeof record.name === "string" ? record.name : "",
    text: record.text,
  };
}

export async function loadStaticCorpusLibraries(
  signal?: AbortSignal,
): Promise<StaticCorpusLibraryInfo[]> {
  const response = await fetch(STATIC_CORPUS_LIBRARIES_MANIFEST_URL, {
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
    .filter((entry): entry is StaticCorpusLibraryInfo => entry !== null);
}

export async function loadStaticCorpusLibraryManifest(
  libraryId: string,
  signal?: AbortSignal,
): Promise<StaticCorpusManifestEntry[]> {
  const response = await fetch(staticCorpusLibraryManifestUrl(libraryId), {
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
    .filter((entry): entry is StaticCorpusManifestEntry => entry !== null);
}

export async function loadAllStaticCorpusLibraries(
  signal?: AbortSignal,
): Promise<StaticCorpusLibrary[]> {
  const libraries = await loadStaticCorpusLibraries(signal);
  const loaded = await Promise.all(
    libraries.map(async (info) => ({
      info,
      entries: await loadStaticCorpusLibraryManifest(info.id, signal),
    })),
  );

  return loaded.filter((library) => library.entries.length > 0);
}

function formatMonkeyTypeLabel(id: string): string {
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseMonkeyTypeLanguageGroups(
  source: string,
): Record<string, string[]> {
  const marker = "export const LanguageGroups";
  const start = source.indexOf(marker);
  if (start === -1) {
    return {};
  }

  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) {
    return {};
  }

  let depth = 0;
  let braceEnd = -1;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        braceEnd = index;
        break;
      }
    }
  }

  if (braceEnd === -1) {
    return {};
  }

  const body = source.slice(braceStart + 1, braceEnd);
  const groups: Record<string, string[]> = {};
  const groupPattern = /(\w+):\s*\[([\s\S]*?)\]/g;

  for (const match of body.matchAll(groupPattern)) {
    const groupId = match[1];
    const languages = [...match[2].matchAll(/"([^"]+)"/g)].map(
      (languageMatch) => languageMatch[1],
    );
    groups[groupId] = languages;
  }

  return groups;
}

let languageGroupsPromise: Promise<Record<string, string[]>> | null = null;

async function loadMonkeyTypeLanguageGroups(
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  if (!languageGroupsPromise) {
    languageGroupsPromise = (async () => {
      const response = await fetch(MONKEYTYPE_LANGUAGE_GROUPS_URL, { signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return parseMonkeyTypeLanguageGroups(await response.text());
    })().catch((error) => {
      languageGroupsPromise = null;
      throw error;
    });
  }

  return languageGroupsPromise;
}

interface GithubContentEntry {
  name: string;
  type: string;
}

async function loadMonkeyTypeGithubLanguageIds(
  directoryPath: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const response = await fetch(
    `${MONKEYTYPE_GITHUB_CONTENTS_API}/${directoryPath}?ref=${MONKEYTYPE_REF}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const entries = (await response.json()) as unknown;
  if (!Array.isArray(entries)) {
    return new Set();
  }

  const ids = entries
    .filter((entry): entry is GithubContentEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const record = entry as GithubContentEntry;
      return (
        record.type === "file" &&
        typeof record.name === "string" &&
        record.name.endsWith(".json")
      );
    })
    .map((entry) => entry.name.slice(0, -".json".length));

  return new Set(ids);
}

function buildMonkeyTypeLanguageGroups(
  availableIds: Set<string>,
  languageGroups: Record<string, string[]>,
): MonkeyTypeLanguageGroup[] {
  const assigned = new Set<string>();
  const groups: MonkeyTypeLanguageGroup[] = [];

  for (const [groupId, languageIds] of Object.entries(languageGroups)) {
    const languages = languageIds
      .filter((languageId) => availableIds.has(languageId))
      .map((languageId) => ({
        id: languageId,
        label: formatMonkeyTypeLabel(languageId),
      }));

    for (const language of languages) {
      assigned.add(language.id);
    }

    if (languages.length > 0) {
      groups.push({
        id: groupId,
        label: formatMonkeyTypeLabel(groupId),
        languages,
      });
    }
  }

  const ungrouped = [...availableIds]
    .filter((languageId) => !assigned.has(languageId))
    .sort()
    .map((languageId) => ({
      id: languageId,
      label: formatMonkeyTypeLabel(languageId),
    }));

  if (ungrouped.length > 0) {
    groups.push({
      id: "other",
      label: "Other",
      languages: ungrouped,
    });
  }

  return groups;
}

async function loadMonkeyTypeManifestFromGithub(
  directoryPath: string,
  signal?: AbortSignal,
): Promise<MonkeyTypeLanguageGroup[]> {
  const [availableIds, languageGroups] = await Promise.all([
    loadMonkeyTypeGithubLanguageIds(directoryPath, signal),
    loadMonkeyTypeLanguageGroups(signal),
  ]);

  return buildMonkeyTypeLanguageGroups(availableIds, languageGroups);
}

export async function loadMonkeyTypeWordsManifest(
  signal?: AbortSignal,
): Promise<MonkeyTypeLanguageGroup[]> {
  return loadMonkeyTypeManifestFromGithub(MONKEYTYPE_WORDS_PATH, signal);
}

/** @deprecated Use loadMonkeyTypeWordsManifest */
export const loadMonkeyTypeManifest = loadMonkeyTypeWordsManifest;

export async function loadMonkeyTypeQuotesManifest(
  signal?: AbortSignal,
): Promise<MonkeyTypeLanguageGroup[]> {
  return loadMonkeyTypeManifestFromGithub(MONKEYTYPE_QUOTES_PATH, signal);
}

export function monkeyTypeWordsUrl(languageId: string): string {
  return `${MONKEYTYPE_WORDS_BASE}/${encodeURIComponent(languageId)}.json`;
}

/** @deprecated Use monkeyTypeWordsUrl */
export const monkeyTypeLanguageUrl = monkeyTypeWordsUrl;

export function monkeyTypeQuotesUrl(languageId: string): string {
  return `${MONKEYTYPE_QUOTES_BASE}/${encodeURIComponent(languageId)}.json`;
}

export async function loadMonkeyTypeWordsCorpus(
  languageId: string,
  label: string,
  signal?: AbortSignal,
): Promise<CorpusDocument> {
  const response = await fetch(monkeyTypeWordsUrl(languageId), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as { words?: unknown };
  if (!Array.isArray(data.words)) {
    throw new Error("Invalid MonkeyType words JSON");
  }

  const words = data.words.filter(
    (word): word is string => typeof word === "string",
  );

  return {
    name: label,
    text: words.join(" "),
  };
}

/** @deprecated Use loadMonkeyTypeWordsCorpus */
export const loadMonkeyTypeCorpus = loadMonkeyTypeWordsCorpus;

export async function loadMonkeyTypeQuotesCorpus(
  languageId: string,
  label: string,
  signal?: AbortSignal,
): Promise<CorpusDocument> {
  const response = await fetch(monkeyTypeQuotesUrl(languageId), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as { quotes?: unknown };
  if (!Array.isArray(data.quotes)) {
    throw new Error("Invalid MonkeyType quotes JSON");
  }

  const quotes = data.quotes
    .map((quote) => {
      if (!quote || typeof quote !== "object") {
        return null;
      }

      const text = (quote as { text?: unknown }).text;
      return typeof text === "string" ? text : null;
    })
    .filter((text): text is string => text !== null);

  return {
    name: label,
    text: quotes.join("\n\n"),
  };
}

export async function loadStaticCorpus(
  libraryId: string,
  entry: Pick<StaticCorpusManifestEntry, "file" | "label">,
  signal?: AbortSignal,
): Promise<CorpusDocument> {
  const response = await fetch(staticCorpusUrl(libraryId, entry.file), {
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return {
    name: entry.label,
    text: await response.text(),
  };
}

export function loadUserCorpusLibrary(): UserCorpusLibrary {
  const raw = localStorage.getItem(USER_CORPUS_LIBRARY_KEY);
  if (!raw) {
    return { corpora: {} };
  }

  try {
    const parsed = JSON.parse(raw) as UserCorpusLibrary;
    if (!parsed || typeof parsed !== "object" || !parsed.corpora) {
      return { corpora: {} };
    }

    return parsed;
  } catch {
    return { corpora: {} };
  }
}

export function listUserCorpora(): Array<{
  id: string;
  label: string;
  savedAt: number;
}> {
  const library = loadUserCorpusLibrary();
  return Object.entries(library.corpora)
    .map(([id, record]) => ({
      id,
      label: record.label,
      savedAt: record.savedAt,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadUserCorpus(id: string): CorpusDocument | null {
  const record = loadUserCorpusLibrary().corpora[id];
  if (!record) {
    return null;
  }

  return parseCorpusDocument(record.data) ?? record.data;
}

export function saveUserCorpus(label: string, data: CorpusDocument): string {
  const trimmed = label.trim();
  const id = slugifyCorpusId(trimmed);
  const library = loadUserCorpusLibrary();
  library.corpora[id] = {
    label: trimmed,
    savedAt: Date.now(),
    data: { ...data, name: trimmed },
  };
  localStorage.setItem(USER_CORPUS_LIBRARY_KEY, JSON.stringify(library));
  return id;
}

export function deleteUserCorpus(id: string): void {
  const library = loadUserCorpusLibrary();
  if (!library.corpora[id]) {
    return;
  }

  delete library.corpora[id];
  localStorage.setItem(USER_CORPUS_LIBRARY_KEY, JSON.stringify(library));
}

export function slugifyCorpusId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `corpus-${Date.now()}`;
}
