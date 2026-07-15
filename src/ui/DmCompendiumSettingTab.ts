import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  getDefaultIncludedSources,
  normalizeSourceKey,
  SourceInfo,
  SOURCE_LIST,
  DmCompendiumSettings,
} from "../settings";

const PRIORITY_SOURCE_KEYS = ["PHB", "XPHB", "DMG", "XDMG", "MM", "XMM"];

export interface DmCompendiumSettingsPlugin {
  settings: DmCompendiumSettings;
  saveSettings(): Promise<void>;
  scheduleSourceFilteredCacheRefresh(): void;
}

export class DmCompendiumSettingTab extends PluginSettingTab {
  private compendiumPlugin: Plugin & DmCompendiumSettingsPlugin;
  private sourceSearchQuery = "";
  private sourceSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, plugin: Plugin & DmCompendiumSettingsPlugin) {
    super(app, plugin);
    this.compendiumPlugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    if (this.sourceSearchTimer) {
      clearTimeout(this.sourceSearchTimer);
      this.sourceSearchTimer = null;
    }
    containerEl.empty();

    this.renderSourceActions(containerEl);

    const sourceSearchEl = containerEl.createDiv();
    const sourceListEl = containerEl.createDiv();
    this.renderSourceSearch(sourceSearchEl, sourceListEl);
    this.renderSourceSettings(sourceListEl);
  }

  private renderSourceActions(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName("D&D sources")
      .setDesc("Choose which sources appear in D&D search results.")
      .addButton((button) => {
        button
          .setButtonText("Defaults")
          .onClick(async () => {
            this.compendiumPlugin.settings.includedSources = getDefaultIncludedSources();
            await this.compendiumPlugin.saveSettings();
            this.compendiumPlugin.scheduleSourceFilteredCacheRefresh();
            this.display();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("All")
          .onClick(async () => {
            this.compendiumPlugin.settings.includedSources = getAllSourceKeys();
            await this.compendiumPlugin.saveSettings();
            this.compendiumPlugin.scheduleSourceFilteredCacheRefresh();
            this.display();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("None")
          .onClick(async () => {
            this.compendiumPlugin.settings.includedSources = [];
            await this.compendiumPlugin.saveSettings();
            this.compendiumPlugin.scheduleSourceFilteredCacheRefresh();
            this.display();
          });
      });
  }

  private renderSourceSearch(containerEl: HTMLElement, sourceListEl: HTMLElement) {
    new Setting(containerEl)
      .setName("Search sources")
      .addText((text) => {
        text
          .setPlaceholder("Type a source name or abbreviation...")
          .setValue(this.sourceSearchQuery)
          .onChange((value) => {
            if (this.sourceSearchTimer) {
              clearTimeout(this.sourceSearchTimer);
            }

            this.sourceSearchTimer = setTimeout(() => {
              this.sourceSearchTimer = null;
              this.sourceSearchQuery = value;
              this.renderSourceSettings(sourceListEl);
            }, 200);
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Clear")
          .onClick(() => {
            this.sourceSearchQuery = "";
            this.display();
          });
      });
  }

  private renderSourceSettings(containerEl: HTMLElement) {
    containerEl.empty();

    const includedSources = this.compendiumPlugin.settings.includedSources.map(normalizeSourceKey);
    const sourceEntries = getSourceEntries()
      .sort(compareSourcesForSettings)
      .filter(([sourceKey, source]) => sourceMatchesSearch(sourceKey, source, this.sourceSearchQuery));

    if (!sourceEntries.length) {
      new Setting(containerEl)
        .setName("No matching sources")
        .setDesc("Try another source name or abbreviation.");
      return;
    }

    sourceEntries.forEach(([sourceKey, source]) => {
      const normalizedSourceKey = normalizeSourceKey(sourceKey);
      new Setting(containerEl)
        .setName(`${source.full} (${source.short})`)
        .addToggle((toggle) => {
          toggle
            .setValue(includedSources.indexOf(normalizedSourceKey) !== -1)
            .onChange(async (value) => {
              const nextSources = this.compendiumPlugin.settings.includedSources.map(normalizeSourceKey);
              const existingIndex = nextSources.indexOf(normalizedSourceKey);
              if (value) {
                if (existingIndex === -1) {
                  nextSources.push(normalizedSourceKey);
                }
              } else if (existingIndex !== -1) {
                nextSources.splice(existingIndex, 1);
              }
              this.compendiumPlugin.settings.includedSources = nextSources.sort();
              await this.compendiumPlugin.saveSettings();
              this.compendiumPlugin.scheduleSourceFilteredCacheRefresh();
            });
        });
    });
  }
}

function getAllSourceKeys() {
  const sourceKeys: string[] = [];

  for (const sourceKey in SOURCE_LIST) {
    sourceKeys.push(normalizeSourceKey(sourceKey));
  }

  return sourceKeys;
}

function getSourceEntries(): Array<[string, SourceInfo]> {
  const sourceEntries: Array<[string, SourceInfo]> = [];

  for (const sourceKey in SOURCE_LIST) {
    sourceEntries.push([sourceKey, SOURCE_LIST[sourceKey]]);
  }

  return sourceEntries;
}

function sourceMatchesSearch(sourceKey: string, source: SourceInfo, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    sourceKey,
    normalizeSourceKey(sourceKey),
    source.full,
    source.short,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function compareSourcesForSettings(
  [leftKey, leftSource]: [string, SourceInfo],
  [rightKey, rightSource]: [string, SourceInfo]
) {
  const leftPriority = PRIORITY_SOURCE_KEYS.indexOf(normalizeSourceKey(leftKey));
  const rightPriority = PRIORITY_SOURCE_KEYS.indexOf(normalizeSourceKey(rightKey));

  if (leftPriority !== -1 || rightPriority !== -1) {
    if (leftPriority === -1) return 1;
    if (rightPriority === -1) return -1;
    return leftPriority - rightPriority;
  }

  return leftSource.full.localeCompare(rightSource.full) || leftKey.localeCompare(rightKey);
}
