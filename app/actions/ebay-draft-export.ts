import "server-only";

import { createClient } from "@/lib/supabase/server";

const EBAY_TRADING_CARD_CATEGORY_ID = "261328";
const EBAY_DEFAULT_COUNTRY_OF_ORIGIN = "United States";
const EBAY_DEFAULT_SPORT = "Baseball";
const EBAY_DEFAULT_FORMAT = "FixedPrice";
const EBAY_TITLE_MAX_LENGTH = 80;

const EBAY_INFO_ROWS = [
  "#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,",
  "#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,",
  "\"#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts\",,,,,,,,,,",
  "#INFO,,,,,,,,,,",
];

const EBAY_HEADERS = [
  "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)",
  "Custom label (SKU)",
  "Category ID",
  "Title",
  "UPC",
  "Price",
  "Quantity",
  "Item photo URL",
  "Condition ID",
  "Description",
  "Format",
  "C:Sport",
  "C:Player/Athlete",
  "C:Manufacturer",
  "C:Set",
  "C:Card Number",
  "C:Year Manufactured",
  "C:Season",
  "C:Parallel/Variety",
  "C:Autographed",
  "C:Signed By",
  "C:Features",
  "C:Print Run",
  "C:Team",
  "C:Country of Origin",
] as const;

type InventoryItemForEbay = {
  id: string;
  status: string | null;
  item_type: string | null;
  title: string | null;
  player_name: string | null;
  year: string | number | null;
  brand: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel_name: string | null;
  team: string | null;
  quantity: number | null;
  available_quantity: number | null;
  notes: string | null;
};

type EbayDraftRow = Record<(typeof EBAY_HEADERS)[number], string>;

export type EbayDraftCsvResult = {
  filename: string;
  csv: string;
  itemCount: number;
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingHash(value: string | null | undefined) {
  return clean(value).replace(/^#/, "");
}

function cleanPlayerName(value: string | null | undefined) {
  return clean(value)
    .replace(/\s+(?:RC|Rookie(?:\s+Card)?)$/i, "")
    .trim();
}

function includesLoose(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function joinUnique(parts: Array<string | null | undefined>) {
  const output: string[] = [];

  for (const rawPart of parts) {
    const part = clean(rawPart);
    if (!part) continue;

    const alreadyIncluded = output.some(
      (existing) =>
        existing.toLowerCase() === part.toLowerCase() ||
        existing.toLowerCase().includes(part.toLowerCase()),
    );

    if (!alreadyIncluded) output.push(part);
  }

  return output.join(" ");
}

function manufacturerFor(item: InventoryItemForEbay) {
  const source = `${clean(item.brand)} ${clean(item.set_name)} ${clean(item.title)}`.toLowerCase();

  if (
    source.includes("topps") ||
    source.includes("bowman")
  ) {
    return "Topps";
  }

  if (source.includes("upper deck")) return "Upper Deck";

  if (
    source.includes("panini") ||
    source.includes("donruss") ||
    source.includes("prizm") ||
    source.includes("select") ||
    source.includes("optic") ||
    source.includes("mosaic")
  ) {
    return "Panini";
  }

  if (source.includes("leaf")) return "Leaf";

  return clean(item.brand);
}

function setFor(item: InventoryItemForEbay) {
  const setName = clean(item.set_name);
  if (setName) return setName;

  const year = clean(item.year);
  const brand = clean(item.brand);

  return joinUnique([year, brand]);
}

function featureData(item: InventoryItemForEbay) {
  const source = [
    item.title,
    item.notes,
    item.parallel_name,
    item.set_name,
    item.item_type,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  const features: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) {
    features.push("1st Bowman");
  }

  if (/\bfuture\s+stars?\b/i.test(source)) {
    features.push("Future Stars");
  }

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    features.push("Rookie");
  }

  if (
    /\berror\b/i.test(source) ||
    /\berr\b/i.test(source)
  ) {
    features.push("Error");
  }

  const serialMatch =
    source.match(/(?:^|[\s(])(\d{1,6})\s*\/\s*(\d{1,6})(?:\b|\))/) ||
    source.match(/(?:^|[\s(])\/\s*(\d{1,6})(?:\b|\))/);

  let serialNumber = "";
  let printRun = "";

  if (serialMatch) {
    if (serialMatch.length >= 3 && serialMatch[2]) {
      serialNumber = `${serialMatch[1]}/${serialMatch[2]}`;
      printRun = serialMatch[2];
    } else if (serialMatch[1]) {
      printRun = serialMatch[1];
    }

    features.push("Serial Numbered");
  }

  const isAutographed =
    /\bauto\b/i.test(source) ||
    /\bautograph(?:ed)?\b/i.test(source) ||
    /\bsigned\b/i.test(source);

  return {
    features: Array.from(new Set(features)).join("|"),
    printRun,
    serialNumber,
    autographed: isAutographed ? "Yes" : "",
    signedBy: isAutographed ? cleanPlayerName(item.player_name) : "",
  };
}

function buildEbayTitle(item: InventoryItemForEbay) {
  const player = cleanPlayerName(item.player_name);
  const year = clean(item.year);
  const setName = setFor(item);
  const parallel = clean(item.parallel_name);
  const cardNumber = stripLeadingHash(item.card_number);
  const team = clean(item.team);
  const source = `${clean(item.title)} ${clean(item.notes)}`;
  const features = featureData(item);

  const specialTerms: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) specialTerms.push("1st Bowman");

  if (
    /\bauto\b/i.test(source) ||
    /\bautograph(?:ed)?\b/i.test(source)
  ) {
    specialTerms.push("Auto");
  }

  if (/\bfuture\s+stars?\b/i.test(source)) specialTerms.push("Future Stars");

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    specialTerms.push("Rookie Card");
  }

  if (/\bbloody\s+elbow\b/i.test(source)) {
    specialTerms.push("Bloody Elbow Error");
  } else if (/\berror\b/i.test(source) || /\berr\b/i.test(source)) {
    specialTerms.push("Error");
  }

  const parts = [
    player,
    year,
    setName,
    parallel,
    cardNumber ? `#${cardNumber}` : "",
    features.serialNumber,
    ...specialTerms,
    team,
  ];

  let title = joinUnique(parts);

  if (!title) {
    title = clean(item.title) || player || "Trading Card";
  }

  if (title.length <= EBAY_TITLE_MAX_LENGTH) return title;

  // Preserve the beginning of the title, where the player/year/set/card info
  // normally lives, and avoid cutting in the middle of a word when possible.
  const shortened = title.slice(0, EBAY_TITLE_MAX_LENGTH + 1);
  const lastSpace = shortened.lastIndexOf(" ");

  return shortened
    .slice(0, lastSpace >= 55 ? lastSpace : EBAY_TITLE_MAX_LENGTH)
    .trim();
}

const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `{summary}

{details}

Card pictured is the exact card you will receive. Please review the photos carefully for condition. The card will be packaged securely for shipping.`;

function stableVariantIndex(seed: string, length: number) {
  if (length <= 1) return 0;

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % length;
}

function buildSummary(item: InventoryItemForEbay) {
  const player = cleanPlayerName(item.player_name);
  const year = clean(item.year);
  const setName = setFor(item);
  const parallel = clean(item.parallel_name);
  const cardNumber = stripLeadingHash(item.card_number);
  const features = featureData(item);
  const source = `${clean(item.title)} ${clean(item.notes)}`;
  const descriptors: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) descriptors.push('1st Bowman');
  if (features.autographed === 'Yes') descriptors.push('Autograph');
  if (/\bfuture\s+stars?\b/i.test(source)) descriptors.push('Future Stars');

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    descriptors.push('Rookie Card');
  }

  if (/\berror\b/i.test(source) || /\berr\b/i.test(source)) {
    descriptors.push('Error');
  }

  const opening = joinUnique([
    year,
    setName,
    player,
    ...descriptors,
    cardNumber ? `#${cardNumber}` : '',
    parallel,
  ]);

  const serialText = features.printRun
    ? features.serialNumber
      ? `, serial numbered ${features.serialNumber}`
      : `, serial numbered /${features.printRun}`
    : '';

  return `${opening || clean(item.title) || 'Trading card'}${serialText}.`;
}

function buildDetails(item: InventoryItemForEbay) {
  const player = cleanPlayerName(item.player_name);
  const year = clean(item.year);
  const setName = setFor(item);
  const parallel = clean(item.parallel_name);
  const team = clean(item.team);
  const features = featureData(item);
  const source = `${clean(item.title)} ${clean(item.notes)} ${parallel}`;

  const isFirstBowman = /\b1st\s+bowman\b/i.test(source);
  const isRookie =
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source);
  const isAuto = features.autographed === "Yes";
  const isNumbered = Boolean(features.printRun);
  const hasParallel = Boolean(parallel);

  const subject = player || clean(item.title) || "this card";
  const release = joinUnique([year, setName]);
  const fromRelease = release ? ` from ${release}` : "";
  const teamPhrase = team ? `${team} fans` : "";
  const playerCollectors = player ? `${player} collectors` : "player collectors";

  const collectorTargets = [
    playerCollectors,
    teamPhrase,
    isFirstBowman || isRookie ? "prospect collectors" : "",
    setName ? `${setName} collectors` : "",
  ].filter(Boolean);

  const targetA = collectorTargets[0] || "collectors";
  const targetB =
    collectorTargets.find((value) => value !== targetA) || "card collectors";

  const generalCollectionTargets = [
    player ? "the player" : "",
    team ? "the team" : "",
    setName ? "the set" : "",
  ].filter(Boolean);

  const generalCollectionText =
    generalCollectionTargets.length >= 3
      ? `${generalCollectionTargets.slice(0, -1).join(", ")}, or ${generalCollectionTargets.at(-1)}`
      : generalCollectionTargets.length === 2
        ? `${generalCollectionTargets[0]} or ${generalCollectionTargets[1]}`
        : generalCollectionTargets[0] || "the hobby";

  let phrases: string[] = [];

  if (isFirstBowman && isAuto && isNumbered) {
    phrases = [
      `A premium early-career autograph of ${subject}${fromRelease}, combining the appeal of a 1st Bowman with a limited print run of just ${features.printRun} copies. A strong centerpiece for ${targetA} and ${targetB}.`,
      `This 1st Bowman autograph pairs an important early card of ${subject} with the added scarcity of only ${features.printRun} copies. An excellent choice for prospect-focused collections.`,
      `An exciting early-career signed card of ${subject}${fromRelease}, with the 1st Bowman designation and a print run limited to ${features.printRun}. A standout option for serious player and prospect collectors.`,
      `A desirable combination of 1st Bowman, autograph, and low-numbered scarcity, this ${subject} card is limited to just ${features.printRun} copies. It has plenty of appeal for ${targetA}.`,
      `Few card types combine early-career appeal and collectibility like a numbered 1st Bowman autograph. This ${subject} example is limited to ${features.printRun} copies and makes a strong addition to a focused collection.`,
      `An impressive signed early-career card featuring ${subject}${fromRelease}. With its 1st Bowman status and limited ${features.printRun}-copy run, it checks several boxes for prospect collectors.`,
      `This ${subject} card brings together a key early-career designation, an autograph, and a limited print run of ${features.printRun}. A compelling pickup for ${targetA} or ${targetB}.`,
      `A highly collectible early issue of ${subject}${fromRelease}, highlighted by an autograph and a print run of only ${features.printRun}. A great card for collectors who favor scarce prospect material.`,
    ];
  } else if (isFirstBowman && isNumbered) {
    phrases = [
      `An important early-career card of ${subject}${fromRelease}, with the added scarcity of a print run limited to just ${features.printRun}. A strong choice for prospect collectors.`,
      `This 1st Bowman of ${subject} is limited to only ${features.printRun} copies, giving an already desirable early card an extra level of collectibility.`,
      `A scarce early issue of ${subject}${fromRelease}, combining the appeal of a 1st Bowman with a limited ${features.printRun}-copy run. A great addition for ${targetA}.`,
      `For collectors following ${subject} early in the player's career, this numbered 1st Bowman offers both prospect appeal and limited production of just ${features.printRun}.`,
      `A strong prospect card featuring ${subject}${fromRelease}. The 1st Bowman designation makes it an important early collectible, while the ${features.printRun}-copy print run adds scarcity.`,
      `This early-career ${subject} card stands out with its 1st Bowman designation and limited print run of ${features.printRun}. An appealing pickup for ${targetA} and ${targetB}.`,
      `A desirable numbered prospect card of ${subject}${fromRelease}, limited to ${features.printRun} copies. Its early-career status makes it a natural fit for player-focused collections.`,
      `An appealing 1st Bowman of ${subject} with only ${features.printRun} copies produced. A nice combination of early-career significance and numbered-card scarcity.`,
    ];
  } else if (isAuto && isNumbered) {
    phrases = [
      `A signed ${subject} card${fromRelease} with a limited print run of just ${features.printRun} copies. The combination of autograph and scarcity gives this one strong collector appeal.`,
      `This autograph of ${subject} is limited to only ${features.printRun} copies, making it a compelling addition for ${targetA} or ${targetB}.`,
      `An eye-catching signed card featuring ${subject}${fromRelease}, backed by a print run of just ${features.printRun}. A great option for collectors looking for something beyond the base card.`,
      `Autograph appeal meets limited production on this ${subject} card, with only ${features.printRun} copies in the run. A strong piece for a focused player collection.`,
      `A limited signed issue of ${subject}${fromRelease}, produced in a run of just ${features.printRun}. This one offers both the personal touch of an autograph and numbered-card scarcity.`,
      `This ${subject} autograph carries extra collectibility thanks to its ${features.printRun}-copy print run. A standout choice for ${targetA}.`,
      `A sharp signed card of ${subject}${fromRelease}, limited to only ${features.printRun} copies. An appealing combination for autograph, player, and team collectors.`,
      `With an autograph and a limited run of ${features.printRun}, this ${subject} card has two features collectors tend to seek out. A strong addition to ${targetA}.`,
    ];
  } else if (isRookie && isNumbered) {
    phrases = [
      `A great early-career card of ${subject}${fromRelease}, with a limited print run of just ${features.printRun}. A strong addition for prospect collectors and ${targetA}.`,
      `This numbered rookie issue of ${subject} is limited to only ${features.printRun} copies, adding extra scarcity to an important early-career card.`,
      `An appealing early card featuring ${subject}${fromRelease}, produced in a run of just ${features.printRun}. A nice pickup for player, prospect, and team collections.`,
      `A limited early-career release of ${subject}, with only ${features.printRun} copies produced. The rookie designation and numbered run give it added collector appeal.`,
      `This ${subject} rookie combines early-career collectibility with a ${features.printRun}-copy print run. A strong option for ${targetA} or ${targetB}.`,
      `A scarce rookie-year card of ${subject}${fromRelease}, limited to just ${features.printRun}. A natural fit for collectors building a focused player or prospect collection.`,
      `Early-career appeal and limited production come together on this ${subject} card, with a print run of only ${features.printRun}. A great pickup for ${targetA}.`,
      `A collectible rookie issue of ${subject}${fromRelease}, made even more appealing by its limited ${features.printRun}-copy run. A solid choice for long-term player collections.`,
    ];
  } else if (isNumbered) {
    phrases = [
      `A sharp-looking ${subject} card${fromRelease}, limited to just ${features.printRun} copies. The low print run gives it extra appeal beyond the standard base version.`,
      `Only ${features.printRun} copies were produced in this numbered run, giving this ${subject} card an added level of scarcity. A strong pickup for ${targetA}.`,
      `A limited ${subject} card${fromRelease} with a print run of just ${features.printRun}. A nice option for player, team, and parallel collectors.`,
      `This numbered ${subject} issue is limited to ${features.printRun} copies, making it an appealing alternative to the base card for collectors looking for added scarcity.`,
      `With only ${features.printRun} copies in the run, this ${subject} card offers the kind of limited production that can make a collection stand out.`,
      `A scarce numbered card featuring ${subject}${fromRelease}, produced in a run of just ${features.printRun}. A great addition for ${targetA} or ${targetB}.`,
      `This ${subject} card carries a limited print run of ${features.printRun}, adding an extra collectible element to the release. A solid choice for a focused collection.`,
      `Limited to only ${features.printRun} copies, this ${subject} card brings some welcome scarcity to the set. An appealing pickup for player and team collectors alike.`,
    ];
  } else if (isFirstBowman) {
    phrases = [
      `An important early-career card of ${subject}${fromRelease}. The 1st Bowman designation gives it strong appeal for prospect collectors and fans following the player from the beginning.`,
      `A key early issue of ${subject}${fromRelease}, making this a natural choice for prospect-focused and player collections.`,
      `This 1st Bowman represents an early collectible of ${subject} and makes a strong addition for collectors following the player's development.`,
      `A desirable early-career card featuring ${subject}${fromRelease}. A great pickup for prospect collectors or anyone building a focused ${subject} collection.`,
      `For collectors who enjoy getting in on a player early, this ${subject} card offers the appeal of an important first Bowman release.`,
      `An appealing prospect-era card of ${subject}${fromRelease}, well suited for player collectors and those building out the release.`,
      `This early ${subject} issue is a strong fit for prospect collections, with the 1st Bowman designation marking an important point in the player's card history.`,
      `A solid early-career collectible featuring ${subject}${fromRelease}. The 1st Bowman status makes it especially relevant for prospect and player collectors.`,
    ];
  } else if (isAuto) {
    phrases = [
      `A signed card featuring ${subject}${fromRelease}, adding an extra level of collectibility beyond the standard issue. A strong choice for ${targetA}.`,
      `This ${subject} autograph makes a distinctive addition to a player or team collection, pairing the card design with a player signature.`,
      `An eye-catching signed issue of ${subject}${fromRelease}. A great option for collectors who enjoy adding autographs to their player-focused collections.`,
      `The autograph gives this ${subject} card an extra personal element and makes it a natural centerpiece for ${targetA}.`,
      `A collectible signed card of ${subject}${fromRelease}, offering something extra for autograph, player, and team collectors.`,
      `This autographed ${subject} card stands apart from the standard release and makes a strong addition to a focused collection.`,
      `A great signature card featuring ${subject}${fromRelease}, with plenty of appeal for ${targetA} and autograph collectors.`,
      `Add a signed ${subject} to the collection with this attractive issue${fromRelease}. A nice choice for fans looking for more than a standard base card.`,
    ];
  } else if (isRookie) {
    phrases = [
      `A great early-career card of ${subject}${fromRelease}. A nice addition for prospect collectors, ${targetA}, or anyone building the set.`,
      `An appealing early issue featuring ${subject}${fromRelease}, well suited for player collectors and fans following the beginning of the career.`,
      `This ${subject} rookie is a strong pickup for collectors looking to add an early-career card to a player, team, or set collection.`,
      `A solid rookie-year collectible of ${subject}${fromRelease}. A natural fit for prospect collectors and ${targetA}.`,
      `Add an early card of ${subject} to the collection with this rookie issue${fromRelease}. A nice choice for player and team collectors alike.`,
      `This early-career ${subject} card offers plenty of appeal for collectors following ${generalCollectionText}.`,
      `A noteworthy rookie issue featuring ${subject}${fromRelease}. A strong addition for collectors building around the player's early cards.`,
      `An attractive early-career release of ${subject}${fromRelease}, making it a great option for prospect, player, and set collectors.`,
    ];
  } else if (hasParallel) {
    phrases = [
      `A sharp-looking ${parallel} variation of ${subject}${fromRelease}, offering a distinctive alternative to the standard base card. A nice addition for ${targetA}.`,
      `This ${parallel} parallel gives the ${subject} card a different look from the base version and adds extra appeal for player and set collectors.`,
      `An eye-catching ${parallel} issue featuring ${subject}${fromRelease}. A strong option for collectors building player rainbows or parallel runs.`,
      `The ${parallel} treatment helps this ${subject} card stand apart from the standard release. A great pickup for ${targetA} or ${targetB}.`,
      `A distinctive ${parallel} variation of ${subject}${fromRelease}, well suited for collectors looking to add some variety beyond the base card.`,
      `This ${subject} parallel features the ${parallel} treatment, giving it added visual appeal for player, team, and set collectors.`,
      `A nice ${parallel} version of ${subject}${fromRelease}, offering collectors another way to build out a player or set run.`,
      `Add some variety to the collection with this ${parallel} parallel of ${subject}${fromRelease}. A solid choice for ${targetA}.`,
    ];
  } else {
    phrases = [
      `A sharp-looking card featuring ${subject}${fromRelease}. A nice addition for ${targetA}, ${targetB}, or anyone building the set.`,
      `A solid collectible featuring ${subject}${fromRelease}, well suited for player, team, and set collections.`,
      `This ${subject} card${fromRelease} makes a clean addition to a focused player or team collection.`,
      `A nice issue featuring ${subject}${fromRelease}. A strong pickup for collectors of the player, team, or release.`,
      `Add ${subject} to the collection with this card${fromRelease}, a solid choice for player and set collectors alike.`,
      `An appealing card of ${subject}${fromRelease}, offering a straightforward addition to a player, team, or set build.`,
      `This ${subject} issue${fromRelease} is a great fit for collectors filling out a set or building a dedicated player collection.`,
      `A clean collectible featuring ${subject}${fromRelease}, with broad appeal for ${targetA} and ${targetB}.`,
    ];
  }

  return phrases[stableVariantIndex(item.id, phrases.length)];
}

function buildTemplateValues(item: InventoryItemForEbay) {
  const features = featureData(item);

  return {
    '{summary}': buildSummary(item),
    '{details}': buildDetails(item),
    '{title}': buildEbayTitle(item),
    '{year}': clean(item.year),
    '{player}': clean(item.player_name),
    '{set}': setFor(item),
    '{card_number}': stripLeadingHash(item.card_number),
    '{team}': clean(item.team),
    '{parallel}': clean(item.parallel_name),
    '{features}': features.features.replaceAll('|', ', '),
    '{serial_number}': features.serialNumber,
    '{print_run}': features.printRun,
  } as const;
}

function renderDescriptionTemplate(
  item: InventoryItemForEbay,
  template: string,
) {
  let output = template;

  for (const [token, value] of Object.entries(buildTemplateValues(item))) {
    output = output.replaceAll(token, value);
  }

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function buildDescription(item: InventoryItemForEbay, template: string) {
  return renderDescriptionTemplate(item, template);
}

function csvEscape(value: string) {
  if (
    value.includes(",") ||
    value.includes("\"") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}

function buildRow(item: InventoryItemForEbay, descriptionTemplate: string): EbayDraftRow {
  const featureInfo = featureData(item);
  const year = clean(item.year);

  return {
    "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)":
      "Draft",
    "Custom label (SKU)": item.id,
    "Category ID": EBAY_TRADING_CARD_CATEGORY_ID,
    Title: buildEbayTitle(item),
    UPC: "",
    Price: "",
    Quantity: "1",
    "Item photo URL": "",
    "Condition ID": "",
    Description: buildDescription(item, descriptionTemplate),
    Format: EBAY_DEFAULT_FORMAT,
    "C:Sport": EBAY_DEFAULT_SPORT,
    "C:Player/Athlete": cleanPlayerName(item.player_name),
    "C:Manufacturer": manufacturerFor(item),
    "C:Set": setFor(item),
    "C:Card Number": stripLeadingHash(item.card_number),
    "C:Year Manufactured": year,
    "C:Season": year,
    "C:Parallel/Variety": clean(item.parallel_name),
    "C:Autographed": featureInfo.autographed,
    "C:Signed By": featureInfo.signedBy,
    "C:Features": featureInfo.features,
    "C:Print Run": featureInfo.printRun,
    "C:Team": clean(item.team),
    "C:Country of Origin": EBAY_DEFAULT_COUNTRY_OF_ORIGIN,
  };
}

function buildCsv(items: InventoryItemForEbay[], descriptionTemplate: string) {
  const headerLine = EBAY_HEADERS.map(csvEscape).join(",");

  const dataLines = items.map((item) => {
    const row = buildRow(item, descriptionTemplate);
    return EBAY_HEADERS.map((header) => csvEscape(row[header])).join(",");
  });

  // The BOM helps Excel open the file as UTF-8 without changing eBay's
  // tested Seller Hub Reports structure.
  return `\uFEFF${[...EBAY_INFO_ROWS, headerLine, ...dataLines].join("\r\n")}\r\n`;
}

function assertExportable(item: InventoryItemForEbay) {
  const availableQuantity = Number(item.available_quantity ?? 0);

  if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
    throw new Error(
      `${clean(item.title) || clean(item.player_name) || "Inventory item"} has no available quantity to export.`,
    );
  }

  if (
    item.status === "giveaway" ||
    item.status === "personal" ||
    item.status === "junk" ||
    item.status === "sold"
  ) {
    throw new Error(
      `${clean(item.title) || clean(item.player_name) || "Inventory item"} is not currently sellable and cannot be exported to an eBay draft.`,
    );
  }
}

export async function getEbayDraftCsvForInventoryIds(
  inventoryItemIds: string[],
): Promise<EbayDraftCsvResult> {
  const ids = Array.from(
    new Set(
      inventoryItemIds
        .map((value) => clean(value))
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) {
    throw new Error("Select at least one inventory item to export.");
  }

  if (ids.length > 2000) {
    throw new Error("A single HITS eBay draft export cannot exceed 2,000 items.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to export eBay drafts.");
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      `
        id,
        status,
        item_type,
        title,
        player_name,
        year,
        brand,
        set_name,
        card_number,
        parallel_name,
        team,
        quantity,
        available_quantity,
        notes
      `,
    )
    .eq("user_id", user.id)
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Unable to load inventory for eBay export: ${error.message}`);
  }

  const items = (data ?? []) as InventoryItemForEbay[];

  if (items.length !== ids.length) {
    throw new Error(
      "One or more selected inventory items could not be found or do not belong to the signed-in user.",
    );
  }

  // Supabase does not guarantee that an IN query returns rows in the same
  // order as the supplied IDs. Preserve the user's selection/order here.
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = ids
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is InventoryItemForEbay => Boolean(item));

  orderedItems.forEach(assertExportable);

  const { data: ebaySettings, error: ebaySettingsError } = await supabase
    .from("ebay_export_settings")
    .select("description_template")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ebaySettingsError) {
    throw new Error(
      `Unable to load eBay export settings: ${ebaySettingsError.message}`,
    );
  }

  const descriptionTemplate =
    typeof ebaySettings?.description_template === "string"
      ? ebaySettings.description_template
      : DEFAULT_EBAY_DESCRIPTION_TEMPLATE;

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  return {
    filename: `HITS-eBay-Drafts-${timestamp}.csv`,
    csv: buildCsv(orderedItems, descriptionTemplate),
    itemCount: orderedItems.length,
  };
}
