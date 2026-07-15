import * as path from "path";
import { Editor, Notice, Plugin } from "obsidian";
import { FormatterItem } from "../formatters/BaseFormatter";
import { registry } from "../registry";
import {
  DEFAULT_SETTINGS,
  getDefaultIncludedSources,
  normalizeSourceKey,
  DmCompendiumSettings,
} from "../settings";
import { DmCompendiumSettingTab } from "../ui/DmCompendiumSettingTab";
import { insertFromCompendium } from "../ui/InsertModals";
import { registerItemCardProcessor } from "../renderers/ItemCardRenderer";
import { registerSpellCardProcessor } from "../renderers/SpellCardRenderer";
import {
  hasDatabaseCache,
  refreshDatabaseCache,
  refreshSourceFilteredDatabaseCache,
} from "../utils/databaseCache";

// Give users time to finish reading and toggling source names before rebuilding.
const SOURCE_CACHE_REFRESH_DEBOUNCE_MS = 1750;

export class DmCompendiumPlugin extends Plugin {
  compendiumSettings: DmCompendiumSettings = DEFAULT_SETTINGS;
  private pluginDir = "";
  private sourceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  async onload() {
    await this.loadSettings();

    const vaultPath = (this.app.vault.adapter as any).getBasePath() as string;
    this.pluginDir = path.join(vaultPath, this.app.vault.configDir, "plugins", this.manifest.id);

    this.addSettingTab(new DmCompendiumSettingTab(this.app, this));
    registerItemCardProcessor(this);
    registerSpellCardProcessor(this);
    this.addCommands();
  }

  onunload() {
    if (this.sourceRefreshTimer) {
      clearTimeout(this.sourceRefreshTimer);
    }
  }

  async loadSettings() {
    const loadedSettings = (await this.loadData()) as Partial<DmCompendiumSettings> | null;
    this.compendiumSettings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    if (!Array.isArray(loadedSettings?.includedSources)) {
      this.compendiumSettings.includedSources = getDefaultIncludedSources();
    }
  }

  async saveSettings() {
    await this.saveData(this.compendiumSettings);
  }

  scheduleSourceFilteredCacheRefresh() {
    if (this.sourceRefreshTimer) {
      clearTimeout(this.sourceRefreshTimer);
    }

    this.sourceRefreshTimer = setTimeout(async () => {
      this.sourceRefreshTimer = null;
      await this.refreshSourceFilteredCache();
    }, SOURCE_CACHE_REFRESH_DEBOUNCE_MS);
  }

  async getItems(dataType: string): Promise<FormatterItem[]> {
    const formatter = registry[dataType];
    if (!formatter) {
      return [];
    }

    await this.ensureDatabaseCache();
    const items = await formatter.load(this.pluginDir);
    return this.filterItemsBySource(items);
  }

  private addCommands() {
    this.addCommand({
      id: "insert-from-compendium",
      name: "Insert from compendium",
      editorCallback: async (editor: Editor) => {
        await insertFromCompendium(this.app, editor, (dataType) => this.getItems(dataType));
      },
    });

    this.addCommand({
      id: "refresh-compendium-database",
      name: "Refresh database",
      callback: async () => {
        await this.refreshCompendiumDatabase(true);
      },
    });
  }

  private async ensureDatabaseCache() {
    if (await hasDatabaseCache(this.pluginDir, this.compendiumSettings.includedSources)) {
      return;
    }

    await this.refreshCompendiumDatabase(false);
  }

  private async refreshCompendiumDatabase(showSuccessNotice: boolean) {
    try {
      await refreshDatabaseCache(this.pluginDir, this.compendiumSettings.includedSources);
      if (showSuccessNotice) {
        new Notice("Compendium database refreshed.");
      }
    } catch (error) {
      console.error("[DM Compendium] Failed to refresh database cache:", error);
      new Notice("Compendium database refresh failed. Check the developer console.");
    }
  }

  private async refreshSourceFilteredCache() {
    try {
      await refreshSourceFilteredDatabaseCache(
        this.pluginDir,
        this.compendiumSettings.includedSources
      );
    } catch (error) {
      console.error("[DM Compendium] Failed to refresh source-filtered database cache:", error);
      new Notice("Compendium source cache refresh failed. Check the developer console.");
    }
  }

  private filterItemsBySource(items: FormatterItem[]) {
    const includedSources = new Set(this.compendiumSettings.includedSources.map(normalizeSourceKey));
    return items.filter((item) => !item.source || includedSources.has(normalizeSourceKey(item.source)));
  }
}
