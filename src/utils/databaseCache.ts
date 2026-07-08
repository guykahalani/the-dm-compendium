import * as fs from 'fs';
import * as path from 'path';
import { requestUrl } from 'obsidian';
import { normalizeSourceKey } from '../settings';

const SPELL_SOURCE_LIST = require('../spell-source-list.json') as string[];
const MONSTER_SOURCE_LIST = require('../monster-source-list.json') as string[];
const ITEM_SOURCE_LIST = require('../item-source-list.json') as string[];
const SPELL_SOURCE_SET = new Set(SPELL_SOURCE_LIST.map(normalizeSourceKey));
const MONSTER_SOURCE_SET = new Set(MONSTER_SOURCE_LIST.map(normalizeSourceKey));
const ITEM_SOURCE_SET = new Set(ITEM_SOURCE_LIST.map(normalizeSourceKey));
const CACHE_METADATA_FILE = '.database-cache.json';
const DATA_REF = 'main';
const RAW_DATA_BASE_URL = `https://raw.githubusercontent.com/guykahalani/the-dm-compendium/${DATA_REF}/data`;
const REMOTE_FETCH_CONCURRENCY = 6;

type DatabaseCacheEntry = Record<string, unknown>;

interface CacheMetadata {
  includedSources?: string[];
}

interface SourceFilteredDatabaseFile {
  name: string;
  description: string;
  sourceSet: Set<string>;
  getSourceUrl: (sourceKey: string) => string;
}

const SOURCE_FILTERED_DATABASE_FILES: SourceFilteredDatabaseFile[] = [
  {
    name: 'spells.json',
    description: 'spells',
    sourceSet: SPELL_SOURCE_SET,
    getSourceUrl: getSpellSourceUrl,
  },
  {
    name: 'bestiary.json',
    description: 'monsters',
    sourceSet: MONSTER_SOURCE_SET,
    getSourceUrl: getBestiarySourceUrl,
  },
  {
    name: 'items.json',
    description: 'items',
    sourceSet: ITEM_SOURCE_SET,
    getSourceUrl: getItemSourceUrl,
  },
];

export function getCacheDir(pluginDir: string): string {
  return path.join(pluginDir, 'cache');
}

export async function hasDatabaseCache(
  pluginDir: string,
  includedSources: string[],
): Promise<boolean> {
  const cacheDir = getCacheDir(pluginDir);
  const results = await Promise.all(
    SOURCE_FILTERED_DATABASE_FILES.map((file) =>
      hasFile(path.join(cacheDir, file.name)),
    ),
  );

  return (
    results.every(Boolean) &&
    (await hasMatchingCacheMetadata(cacheDir, includedSources))
  );
}

export async function refreshDatabaseCache(
  pluginDir: string,
  includedSources: string[],
): Promise<void> {
  const cacheDir = getCacheDir(pluginDir);
  await fs.promises.mkdir(cacheDir, { recursive: true });

  await writeSourceFilteredJsonCacheFiles(
    cacheDir,
    includedSources,
    includedSources,
  );
  await writeCacheMetadata(cacheDir, includedSources);
}

export async function refreshSourceFilteredDatabaseCache(
  pluginDir: string,
  includedSources: string[],
): Promise<void> {
  const cacheDir = getCacheDir(pluginDir);
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const normalizedIncludedSources = normalizeSources(includedSources);
  if (!normalizedIncludedSources.length) {
    await writeEmptySourceFilteredJsonCacheFiles(cacheDir);
    await writeCacheMetadata(cacheDir, normalizedIncludedSources);
    return;
  }

  const previousIncludedSources = await readCacheMetadataIncludedSources(cacheDir);
  const canUseExistingCache =
    previousIncludedSources !== null &&
    await hasAllSourceFilteredCacheFiles(cacheDir);

  if (!canUseExistingCache) {
    await writeSourceFilteredJsonCacheFiles(
      cacheDir,
      normalizedIncludedSources,
      normalizedIncludedSources,
    );
    await writeCacheMetadata(cacheDir, normalizedIncludedSources);
    return;
  }

  const addedSources = normalizedIncludedSources.filter(
    (source) => !previousIncludedSources.includes(source),
  );

  await Promise.all(
    SOURCE_FILTERED_DATABASE_FILES.map((file) =>
      writeIncrementalSourceFilteredJsonCacheFile(
        cacheDir,
        file,
        normalizedIncludedSources,
        addedSources,
      ),
    ),
  );
  await writeCacheMetadata(cacheDir, normalizedIncludedSources);
}

async function writeSourceFilteredJsonCacheFiles(
  cacheDir: string,
  includedSources: string[],
  sourcesToFetch: string[],
) {
  await Promise.all(
    SOURCE_FILTERED_DATABASE_FILES.map((file) =>
      writeSourceFilteredJsonCacheFile(
        cacheDir,
        file,
        includedSources,
        sourcesToFetch,
      ),
    ),
  );
}

async function writeEmptySourceFilteredJsonCacheFiles(cacheDir: string) {
  await Promise.all(
    SOURCE_FILTERED_DATABASE_FILES.map((file) =>
      writeJsonCacheFile(cacheDir, file.name, []),
    ),
  );
}

async function writeSourceFilteredJsonCacheFile(
  cacheDir: string,
  file: SourceFilteredDatabaseFile,
  includedSources: string[],
  sourcesToFetch: string[],
) {
  const includedSourceSet = new Set(getSelectedSources(includedSources, file.sourceSet));
  const sourceGroups = await fetchSourceGroups(
    file,
    getSelectedSources(sourcesToFetch, file.sourceSet),
  );
  const data = sortAndDedupeEntries(
    filterEntriesByIncludedSources(sourceGroups.flat(), includedSourceSet),
  );

  await writeJsonCacheFile(cacheDir, file.name, data);
}

async function writeIncrementalSourceFilteredJsonCacheFile(
  cacheDir: string,
  file: SourceFilteredDatabaseFile,
  includedSources: string[],
  addedSources: string[],
) {
  const includedSourceSet = new Set(getSelectedSources(includedSources, file.sourceSet));
  const existingData = await readJsonCacheFile(cacheDir, file.name);
  const filteredExistingData = filterEntriesByIncludedSources(
    existingData,
    includedSourceSet,
  );
  const addedSourceGroups = await fetchSourceGroups(
    file,
    getSelectedSources(addedSources, file.sourceSet),
  );
  const data = sortAndDedupeEntries([
    ...filteredExistingData,
    ...addedSourceGroups.flat(),
  ]);

  await writeJsonCacheFile(cacheDir, file.name, data);
}

async function fetchSourceGroups(
  file: SourceFilteredDatabaseFile,
  selectedSources: string[],
) {
  return await mapWithConcurrency(
    selectedSources,
    REMOTE_FETCH_CONCURRENCY,
    async (sourceKey) => {
      try {
        return await fetchJsonArrayFromGithub(
          file.getSourceUrl(sourceKey),
          `${sourceKey} ${file.description}`,
        );
      } catch (error) {
        if (error instanceof MissingRemoteSourceError) {
          console.warn(`[DM Compendium] ${error.message}`);
          return [];
        }

        throw error;
      }
    },
  );
}

async function fetchJsonArrayFromGithub(
  sourceUrl: string,
  description: string,
): Promise<DatabaseCacheEntry[]> {
  let response;
  try {
    response = await requestUrl({
      url: sourceUrl,
      method: 'GET',
      throw: false,
    });
  } catch (error) {
    throw new Error(`Failed to fetch remote ${description} data: ${getErrorMessage(error)}`);
  }

  if (response.status === 404) {
    throw new MissingRemoteSourceError(description, sourceUrl);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to fetch remote ${description} data: HTTP ${response.status}.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(response.text);
  } catch {
    throw new Error(`Remote ${description} data is not valid JSON.`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Remote ${description} data is not a JSON array.`);
  }

  return data as DatabaseCacheEntry[];
}

function getSelectedSources(includedSources: string[], sourceSet: Set<string>) {
  return includedSources
    .map(normalizeSourceKey)
    .filter((sourceKey) => sourceSet.has(sourceKey))
    .sort();
}

function getSpellSourceUrl(sourceKey: string) {
  return `${RAW_DATA_BASE_URL}/spells/${sourceKey.toLowerCase()}.json`;
}

function getBestiarySourceUrl(sourceKey: string) {
  return `${RAW_DATA_BASE_URL}/bestiary/${sourceKey.toLowerCase()}.json`;
}

function getItemSourceUrl(sourceKey: string) {
  return `${RAW_DATA_BASE_URL}/items/${sourceKey.toLowerCase()}.json`;
}

async function hasFile(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasMatchingCacheMetadata(
  cacheDir: string,
  includedSources: string[],
) {
  try {
    const metadata = await readCacheMetadata(cacheDir);
    return sourcesMatch(metadata.includedSources ?? [], includedSources);
  } catch {
    return false;
  }
}

async function hasAllSourceFilteredCacheFiles(cacheDir: string) {
  const results = await Promise.all(
    SOURCE_FILTERED_DATABASE_FILES.map((file) =>
      hasFile(path.join(cacheDir, file.name)),
    ),
  );

  return results.every(Boolean);
}

async function readCacheMetadataIncludedSources(cacheDir: string) {
  try {
    const metadata = await readCacheMetadata(cacheDir);
    if (!Array.isArray(metadata.includedSources)) {
      return null;
    }

    return normalizeSources(metadata.includedSources);
  } catch {
    return null;
  }
}

async function readCacheMetadata(cacheDir: string): Promise<CacheMetadata> {
  return JSON.parse(
    await fs.promises.readFile(
      path.join(cacheDir, CACHE_METADATA_FILE),
      'utf-8',
    ),
  ) as CacheMetadata;
}

async function writeCacheMetadata(cacheDir: string, includedSources: string[]) {
  await fs.promises.writeFile(
    path.join(cacheDir, CACHE_METADATA_FILE),
    JSON.stringify(
      { includedSources: normalizeSources(includedSources) },
      null,
      2,
    ),
    'utf-8',
  );
}

function sourcesMatch(left: string[], right: string[]) {
  return (
    JSON.stringify(normalizeSources(left)) ===
    JSON.stringify(normalizeSources(right))
  );
}

function normalizeSources(sources: string[]) {
  return sources.map(normalizeSourceKey).sort();
}

async function readJsonCacheFile(
  cacheDir: string,
  fileName: string,
): Promise<DatabaseCacheEntry[]> {
  const data = JSON.parse(
    await fs.promises.readFile(path.join(cacheDir, fileName), 'utf-8'),
  ) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`Cached ${fileName} data is not a JSON array.`);
  }

  return data as DatabaseCacheEntry[];
}

async function writeJsonCacheFile(
  cacheDir: string,
  fileName: string,
  data: DatabaseCacheEntry[],
) {
  await fs.promises.writeFile(
    path.join(cacheDir, fileName),
    JSON.stringify(data, null, 2),
    'utf-8',
  );
}

function filterEntriesByIncludedSources(
  entries: DatabaseCacheEntry[],
  includedSources: Set<string>,
) {
  return entries.filter((entry) => {
    const source = entry.source;
    if (typeof source !== 'string' || !source) {
      return true;
    }

    return includedSources.has(normalizeSourceKey(source));
  });
}

function sortAndDedupeEntries(entries: DatabaseCacheEntry[]) {
  const seen = new Set<string>();
  const deduped: DatabaseCacheEntry[] = [];

  for (const entry of entries) {
    const key = `${String(entry.source ?? '')}\u0000${String(entry.name ?? '')}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped.sort((left, right) => {
    const byName = String(left.name).localeCompare(String(right.name));
    return byName || String(left.source).localeCompare(String(right.source));
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

class MissingRemoteSourceError extends Error {
  constructor(description: string, sourceUrl: string) {
    super(`Remote ${description} data file was not found at ${sourceUrl}.`);
    this.name = 'MissingRemoteSourceError';
  }
}
