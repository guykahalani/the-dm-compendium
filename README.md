# The DM Compendium

Search and insert Dungeons & Dragons 5th Edition monsters, spells, and items into your notes.

Visit the landing page [here](https://guykahalani.github.io/dm-compendium-landing/).

## Features

- Insert formatted monsters, spells, and items from the command palette.
- Generate monster statblock YAML compatible with popular Obsidian TTRPG tools.
- Render inline spell and item cards in reading view.
- Choose which D&D sources are included in search results.
- Cache selected compendium data locally for faster searching after the first load.

## Usage

1. Open the command palette.
2. Run **The DM Compendium: Insert from compendium**.
3. Choose monsters, items, or spells.
4. Search for an entry and select it to insert formatted content at the cursor.

To refresh cached data manually, run **The DM Compendium: Refresh database**.

You can assign custom shortcuts for these commands from **Settings > Hotkeys**.

## Settings

Open **Settings > Community plugins > The DM Compendium** to choose which sources appear in search results.

## TTRPG plugin compatibility

Monster inserts are designed to work especially well with the Obsidian TTRPG Community plugins:

- [Fantasy Statblocks](https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks)
- [Initiative Tracker](https://github.com/Obsidian-TTRPG-Community/initiative-tracker)
- [Dice Roller](https://github.com/Obsidian-TTRPG-Community/dice-roller)

Inserted monsters use `statblock` code blocks with YAML fields expected by Fantasy Statblocks, including the Basic 5e layout. With those plugins installed, the generated monster cards can be used as rendered statblocks, added to a bestiary, added to the initiative tracker, and used for rolling HP, attacks, and other supported rolls directly from the card.

## Disclosures

- **Network access:** The plugin downloads selected compendium JSON files from `raw.githubusercontent.com/guykahalani/the-dm-compendium` when the local cache is missing or when the refresh command is run. Source changes rebuild the local cache incrementally when possible, fetching only newly added sources and removing disabled sources locally.
- **Local file access:** The plugin writes cache files into its own plugin folder under `.obsidian/plugins/the-dm-compendium/cache`.
- **Account requirements:** No account is required.
- **Telemetry and ads:** The plugin does not collect telemetry, analytics, or usage data, and it does not show ads.
- **Platform support:** This plugin is desktop-only because it uses Node.js filesystem APIs for local caching.

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE).
