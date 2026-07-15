import { MarkdownPostProcessorContext, MarkdownRenderer, MarkdownRenderChild, parseYaml, Plugin } from "obsidian";

interface ItemCardData {
  name?: string;
  source?: string;
  page?: number | string;
  type?: string;
  rarity?: string;
  attunement?: string;
  weight?: string;
  value?: string;
  valueRarity?: string;
  weaponCategory?: string;
  armorClass?: string;
  damage?: string;
  range?: string;
  properties?: string[];
  mastery?: string[];
  entries?: string[];
}

export function registerItemCardProcessor(plugin: Plugin) {
  plugin.registerMarkdownCodeBlockProcessor("itemcard", async (source, el, ctx) => {
    await renderItemCard(plugin, source, el, ctx);
  });
}

async function renderItemCard(
  plugin: Plugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) {
  let item: ItemCardData;

  try {
    item = normalizeItemCardData(parseYaml(source));
  } catch (error) {
    renderError(el, error);
    return;
  }

  el.empty();

  const card = createElement("article", "compendium-item-card");
  el.appendChild(card);

  const header = createElement("header", "compendium-item-card__header");
  card.appendChild(header);
  header.appendChild(createElement("h2", "", item.name ?? "Unknown Item"));
  header.appendChild(createElement("p", "", getItemSubtitle(item)));

  const sourceText = getSourceText(item);
  if (sourceText) {
    header.appendChild(createElement("span", "", sourceText));
  }

  const facts = getItemFacts(item);
  if (facts.length) {
    const meta = createElement("section", "compendium-item-card__meta");
    card.appendChild(meta);
    for (const [label, value] of facts) {
      appendMeta(meta, label, value);
    }
  }

  appendTagList(card, "Properties", item.properties);
  appendTagList(card, "Mastery", item.mastery);

  await appendMarkdownSection(plugin, card, ctx, "compendium-item-card__body", item.entries);
}

function normalizeItemCardData(raw: unknown): ItemCardData {
  if (!raw || typeof raw !== "object") {
    throw new Error("Item card block must contain YAML fields.");
  }

  const item = raw as ItemCardData;
  return {
    ...item,
    properties: normalizeStringList(item.properties),
    mastery: normalizeStringList(item.mastery),
    entries: normalizeStringList(item.entries),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter((item) => item.length > 0);
}

function getItemSubtitle(item: ItemCardData): string {
  return [item.type, item.rarity, item.attunement].filter(Boolean).join(", ");
}

function getSourceText(item: ItemCardData): string {
  if (!item.source && !item.page) {
    return "";
  }

  return `${item.source ?? ""}${item.page ? `, p. ${item.page}` : ""}`;
}

function getItemFacts(item: ItemCardData): Array<[string, string | undefined]> {
  const facts: Array<[string, string | undefined]> = [
    ["Value", item.value || item.valueRarity],
    ["Weight", item.weight],
    ["Weapon", item.weaponCategory],
    ["Armor Class", item.armorClass],
    ["Damage", item.damage],
    ["Range", item.range],
  ];

  return facts.filter(([, value]) => Boolean(value));
}

function appendMeta(parent: HTMLElement, label: string, value: string | undefined) {
  const item = createElement("div", "compendium-item-card__meta-item");
  item.appendChild(createElement("strong", "", label));
  item.appendChild(createElement("span", "", value || "-"));
  parent.appendChild(item);
}

function appendTagList(parent: HTMLElement, label: string, values: string[] | undefined) {
  if (!values?.length) {
    return;
  }

  const section = createElement("section", "compendium-item-card__tags");
  section.appendChild(createElement("strong", "", label));
  const list = createElement("div", "compendium-item-card__tag-list");
  section.appendChild(list);

  for (const value of values) {
    list.appendChild(createElement("span", "", value));
  }

  parent.appendChild(section);
}

async function appendMarkdownSection(
  plugin: Plugin,
  parent: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  className: string,
  entries: string[] | undefined
) {
  if (!entries?.length) {
    return;
  }

  const section = createElement("section", className);
  parent.appendChild(section);

  for (const entry of entries) {
    const entryEl = createElement("div", "compendium-item-card__entry");
    section.appendChild(entryEl);
    const renderChild = new MarkdownRenderChild(entryEl);
    ctx.addChild(renderChild);
    await MarkdownRenderer.render(plugin.app, entry, entryEl, ctx.sourcePath, renderChild);
  }
}

function renderError(el: HTMLElement, error: unknown) {
  el.empty();
  const message = error instanceof Error ? error.message : "Unable to render item card.";
  const errorEl = createElement("div", "compendium-item-card-error", `Invalid itemcard YAML: ${message}`);
  el.appendChild(errorEl);
}

function createElement(tagName: string, className = "", text = ""): HTMLElement {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  return element;
}
