export interface SourceInfo {
  full: string;
  short: string;
  include: boolean;
}

export const SOURCE_LIST = require("./source-list.json") as Record<string, SourceInfo>;

export interface DmCompendiumSettings {
  includedSources: string[];
}

export const DEFAULT_SETTINGS: DmCompendiumSettings = {
  includedSources: [],
};

export function normalizeSourceKey(source: string): string {
  return source.toUpperCase();
}

export function getDefaultIncludedSources(): string[] {
  const includedSources: string[] = [];

  for (const sourceKey in SOURCE_LIST) {
    if (SOURCE_LIST[sourceKey].include) {
      includedSources.push(normalizeSourceKey(sourceKey));
    }
  }

  return includedSources;
}

export function getSourceLabel(source: string): string {
  const sourceInfo = SOURCE_LIST[normalizeSourceKey(source)];
  return sourceInfo?.short ?? source;
}
