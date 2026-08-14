import { ACCENTS } from "./timing";

export type VisualType =
  | "allocation"
  | "comparison"
  | "trend"
  | "stat"
  | "risk"
  | "timeline"
  | "asset"
  | "statement";

export type CryptoAsset = {
  id: string;
  symbol: string;
  name: string;
  iconSlug: string;
};

export type ExtractedAllocation = { primary: number; secondary: number };

export type ExtractedComparison = {
  left: string;
  right: string;
  leftIcon: string;
  rightIcon: string;
};

export type ExtractedTimeline = { phrase: string; emphasizedLabel?: string };

export type Domain = "crypto" | "stocks" | "ai" | "economy" | "business" | "technology" | "general";

export type AccentKind = "asset" | "risk" | "opportunity" | "topic";
export type AccentEntity = {
  kind: AccentKind;
  label: string;
  asset?: CryptoAsset;
  /** Icon registry key — set for "topic" accents (a lucide topic icon name), resolved via icon-registry.ts. */
  icon?: string;
};

// Word-number handling — bounded, not a general NLP number parser. Enough for
// casual finance narration ("eighty percent", "eighty-twenty rule").
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1_000_000, billion: 1_000_000_000,
};

function wordOrDigitToNumber(token: string): number {
  const digit = Number(token);
  return Number.isNaN(digit) ? (WORD_NUMBERS[token.toLowerCase()] ?? 0) : digit;
}

const SCALE_WORDS: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, million: 1e6,
  b: 1e9, billion: 1e9,
};

export function scaleFor(token: string | undefined): number {
  if (!token) return 1;
  return SCALE_WORDS[token.toLowerCase()] ?? 1;
}

// Allocation — "eighty-twenty rule" / "80-20" / "80/20", or a single percent
// mention with allocation-context language nearby ("allocate 80 percent").
const RATIO_WORD = "(?:ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\\d{2,3})";
const ALLOCATION_RATIO_PATTERN = new RegExp(`\\b(${RATIO_WORD})[\\s\\-/](${RATIO_WORD})\\b`, "i");
const ALLOCATION_CONTEXT = /\b(allocate|allocation|portfolio|holdings|split|diversify)\b/i;

const DIGIT_PERCENT_PATTERN = /(-?\d+(?:\.\d+)?)\s?%/;
const WORD_PERCENT_PATTERN = new RegExp(`\\b(${RATIO_WORD})\\b\\s*(?:percent|per cent)\\b`, "i");

/** Digit form ("12%") or word form ("eighty percent" / "eighty per cent") — shared by extractAllocation and narration-planner's extractMetric. */
export function extractPercent(text: string): number | null {
  const digit = text.match(DIGIT_PERCENT_PATTERN);
  if (digit) return parseFloat(digit[1]);
  const word = text.match(WORD_PERCENT_PATTERN);
  return word ? wordOrDigitToNumber(word[1]) : null;
}

/** Position of whichever percent form matched (digit form takes priority, same as extractPercent) — for narration-planner's label-derivation, which needs an index into the original text. */
export function findPercentMatchIndex(text: string): number | undefined {
  const digit = text.match(DIGIT_PERCENT_PATTERN);
  if (digit) return digit.index;
  return text.match(WORD_PERCENT_PATTERN)?.index;
}

export function extractAllocation(text: string): ExtractedAllocation | null {
  const ratioMatch = text.match(ALLOCATION_RATIO_PATTERN);
  if (ratioMatch) {
    const a = wordOrDigitToNumber(ratioMatch[1]);
    const b = wordOrDigitToNumber(ratioMatch[2]);
    if (a > 0 && b > 0 && Math.abs(a + b - 100) <= 5) {
      return { primary: a, secondary: b };
    }
  }

  const pct = extractPercent(text);
  if (pct !== null && ALLOCATION_CONTEXT.test(text)) {
    return { primary: pct, secondary: 100 - pct };
  }

  return null;
}

// Crypto assets — small curated list, not exhaustive; an unmatched coin name
// just falls through to "statement", same accepted-limitation pattern as
// everything else in this file.
export const CRYPTO_ASSETS: CryptoAsset[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", iconSlug: "SiBitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", iconSlug: "SiEthereum" },
  { id: "solana", symbol: "SOL", name: "Solana", iconSlug: "SiSolana" },
  { id: "ripple", symbol: "XRP", name: "XRP", iconSlug: "SiRipple" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", iconSlug: "SiDogecoin" },
  { id: "cardano", symbol: "ADA", name: "Cardano", iconSlug: "SiCardano" },
  { id: "tether", symbol: "USDT", name: "Tether", iconSlug: "SiTether" },
  { id: "bnb", symbol: "BNB", name: "BNB", iconSlug: "SiBinance" },
  // No dedicated brand logo exists for these in the installed icon set — a
  // generic "Coins" topic icon (already in icon-registry.ts) stands in
  // rather than leaving major, commonly-discussed stablecoins unrecognized.
  { id: "usdc", symbol: "USDC", name: "USD Coin", iconSlug: "Coins" },
  { id: "dai", symbol: "DAI", name: "Dai", iconSlug: "Coins" },
];

const ASSET_KEYWORD_PATTERN = new RegExp(
  `\\b(${CRYPTO_ASSETS.flatMap((asset) => [asset.id, asset.symbol]).join("|")})\\b`,
  "gi",
);

export function extractAssets(text: string): CryptoAsset[] {
  const found: CryptoAsset[] = [];
  for (const match of text.matchAll(ASSET_KEYWORD_PATTERN)) {
    const token = match[1].toLowerCase();
    const asset = CRYPTO_ASSETS.find((a) => a.id === token || a.symbol.toLowerCase() === token);
    if (asset && !found.includes(asset)) found.push(asset);
  }
  return found;
}

// Topic icon dictionary — the reusable visual asset library. Deliberately
// plain data (pattern → icon registry key + display label) so it can keep
// growing without touching any rendering code; icon-registry.ts resolves the
// key strings to real components. Order matters a little (first match per
// category wins in a couple of overlapping cases) but is not precedence in
// the same strict sense as VisualType — every matching entry can surface as
// its own accent, up to the shared per-beat cap.
export type TopicIconEntry = { pattern: RegExp; icon: string; label: string };

export const TOPIC_ICON_KEYWORDS: TopicIconEntry[] = [
  // Finance
  { pattern: /\bwallets?\b/i, icon: "Wallet", label: "Wallet" },
  { pattern: /\bportfolios?\b|\bholdings?\b/i, icon: "PieChart", label: "Portfolio" },
  { pattern: /\bdollars?\b|\bcash\b|\bbills?\b/i, icon: "Banknote", label: "Cash" },
  { pattern: /\bbanks?\b|\bbanking\b/i, icon: "Landmark", label: "Bank" },
  { pattern: /\bcredit cards?\b/i, icon: "CreditCard", label: "Credit" },
  { pattern: /\bcalculat(?:e|or|ing)\b/i, icon: "Calculator", label: "Calculator" },
  { pattern: /\bdashboards?\b/i, icon: "LayoutDashboard", label: "Dashboard" },
  { pattern: /\bticker\b|\bmarket data\b/i, icon: "Activity", label: "Ticker" },
  // Markets
  { pattern: /\bcandlesticks?\b/i, icon: "CandlestickChart", label: "Candles" },
  { pattern: /\bcharts?\b|\bgraphs?\b/i, icon: "LineChart", label: "Chart" },
  { pattern: /\bheat ?maps?\b/i, icon: "Grid3x3", label: "Heatmap" },
  { pattern: /\btrading (?:screen|platform|desk)\b/i, icon: "MonitorSmartphone", label: "Trading" },
  { pattern: /\ballocations?\b/i, icon: "PieChart", label: "Allocation" },
  { pattern: /\bvolatil(?:e|ity)\b/i, icon: "Activity", label: "Volatility" },
  // Business
  { pattern: /\bjob\b|\bsalary\b|\bwork\b|\bcareer\b/i, icon: "Briefcase", label: "Career" },
  { pattern: /\bhustle\b|\bside\b|\bstartups?\b/i, icon: "Rocket", label: "Startup" },
  { pattern: /\boffices?\b|\bcompan(?:y|ies)\b|\bcorporations?\b|\bfirms?\b/i, icon: "Building2", label: "Company" },
  { pattern: /\bteams?\b|\bemployees?\b/i, icon: "Users", label: "Team" },
  { pattern: /\bbuildings?\b|\bheadquarters\b/i, icon: "Building", label: "Building" },
  // AI
  { pattern: /\bchips?\b|\bsemiconductors?\b|\bhardware\b/i, icon: "Cpu", label: "Chips" },
  { pattern: /\bneural\b|\bdeep learning\b|\bbrains?\b/i, icon: "BrainCircuit", label: "AI" },
  { pattern: /\bcircuits?\b/i, icon: "Cpu", label: "Circuit" },
  { pattern: /\bnodes?\b|\bnetworks?\b/i, icon: "Network", label: "Network" },
  { pattern: /\bautomation\b|\brobots?\b|\bbots?\b/i, icon: "Bot", label: "Automation" },
  // Economics
  { pattern: /\binflation\b/i, icon: "TrendingUp", label: "Inflation" },
  { pattern: /\brecession\b/i, icon: "TrendingDown", label: "Recession" },
  { pattern: /\bgdp\b/i, icon: "Landmark", label: "GDP" },
  { pattern: /\bcpi\b/i, icon: "Percent", label: "CPI" },
  { pattern: /\btax(?:es)?\b/i, icon: "Percent", label: "Tax" },
  { pattern: /\binterest rates?\b/i, icon: "Percent", label: "Rates" },
  { pattern: /\bglobal\b|\bworldwide\b|\bmacro\b/i, icon: "Globe", label: "Global" },
  // Technology
  { pattern: /\bservers?\b|\bdata center\b/i, icon: "Server", label: "Servers" },
  { pattern: /\bcloud\b/i, icon: "Cloud", label: "Cloud" },
  { pattern: /\bdatabase\b|\bdata\b/i, icon: "Database", label: "Data" },
  { pattern: /\blaptops?\b|\bcomputers?\b/i, icon: "Laptop", label: "Computer" },
  { pattern: /\bsmartphones?\b|\bphones?\b|\bmobile\b/i, icon: "Smartphone", label: "Mobile" },
  // Finance (research/documents)
  { pattern: /\bgold\b/i, icon: "Gem", label: "Gold" },
  { pattern: /\bdocuments?\b|\breports?\b|\bfilings?\b/i, icon: "FileText", label: "Report" },
  { pattern: /\bresearch\b|\banalysis\b|\banalyz(?:e|ing)\b/i, icon: "Search", label: "Research" },
  { pattern: /\bquarter(?:ly)?\b|\bschedule\b|\btimeline\b/i, icon: "Calendar", label: "Schedule" },
  { pattern: /\breal.?time\b|\baround.the.clock\b|\b24\/7\b/i, icon: "Clock", label: "Real-time" },
  // Warnings
  { pattern: /\bshields?\b/i, icon: "Shield", label: "Shield" },
  { pattern: /\blocks?\b|\bsecurity\b/i, icon: "Lock", label: "Security" },
  { pattern: /\bdanger(?:ous)?\b/i, icon: "AlertTriangle", label: "Danger" },
  { pattern: /\brisk\b|high-risk/i, icon: "TriangleAlert", label: "Risk" },
  { pattern: /\bstable\b|\bsafe\b|\bsecure\b/i, icon: "ShieldCheck", label: "Stable" },
  // Opportunity
  { pattern: /\brocket\b|\bmoon(?:ing)?\b/i, icon: "Rocket", label: "Upside" },
  { pattern: /\bupward\b|\bsoaring\b/i, icon: "TrendingUp", label: "Upward" },
  { pattern: /\bspark(?:ing)?\b|\bbreakout\b/i, icon: "Sparkles", label: "Breakout" },
  { pattern: /\bgrowth\b|\bgains?\b/i, icon: "TrendingUp", label: "Growth" },
  // Generic crypto (only reached when no specific asset name matched)
  { pattern: /\bcrypto(?:currency)?\b|\bcoins?\b/i, icon: "Coins", label: "Crypto" },
];

// Domain — orthogonal to VisualType/NarrativeRole: "what topic is this beat
// actually about," used to pick a restrained, topic-matched ambient
// background motif so richness generalizes beyond crypto. Same
// "document, don't perfect" precedent as every other extractor here — a beat
// with no domain signal just falls through to "general" (no forced motif).
const DOMAIN_KEYWORDS: Record<Exclude<Domain, "general">, RegExp> = {
  crypto: /\b(crypto|blockchain|bitcoin|ethereum|solana|token|coin|wallet|defi|nft|exchange|stablecoins?)\b/i,
  stocks: /\b(stocks?|shares?|nasdaq|s&p|dow jones|nyse|ticker|equit(?:y|ies)|dividends?)\b/i,
  ai: /\b(ai|artificial intelligence|machine learning|neural|chatgpt|llm|algorithm|automation|generative ai|language models?|gpt)\b/i,
  economy: /\b(inflation|recession|gdp|cpi|interest rates?|the fed|economy|economic|unemployment)\b/i,
  business: /\b(startups?|compan(?:y|ies)|business|revenue|office|team|corporate|enterprise)\b/i,
  technology: /\b(servers?|chips?|software|hardware|cloud|data center|laptops?|smartphones?)\b/i,
};

/** A named crypto asset is the strongest, most specific domain signal — it wins outright before any keyword dictionary is consulted. */
export function classifyDomain(text: string): Domain {
  if (extractAssets(text).length > 0) return "crypto";
  for (const domain of Object.keys(DOMAIN_KEYWORDS) as (keyof typeof DOMAIN_KEYWORDS)[]) {
    if (DOMAIN_KEYWORDS[domain].test(text)) return domain;
  }
  return "general";
}

// Risk / opportunity language — drives accent detection and the "risk"/
// "payoff" narrative roles. Deliberately separate from narration-planner's
// HIGH_INTENSITY_WORDS/MEDIUM_INTENSITY_WORDS, which answer a different
// question (how dramatic the wording is, for plain/sweep/decode text
// treatment) — a word can legitimately serve both systems.
export const RISK_WORDS =
  /\b(risk|risky|risks|volatile|volatility|warning|caution|beware|danger|dangerous|could lose|not guaranteed|crisis|distrust|losing (?:confidence|trust)|crisis of confidence|uncertainty|instability|unstable|scrutiny|red flags?|backing away|pulling back|quietly (?:backing|pulling|walking) away)\b/i;
export const OPPORTUNITY_WORDS =
  /\b(opportunity|opportunities|upside|potential|explosive growth|gains?|breakout|rally|surging?)\b/i;

// Comparison — "stable job vs side hustle", "Ethereum has outperformed Bitcoin"
export const COMPARISON_PATTERN =
  /\b(versus|vs\.?|compared to|instead of|rather than|outperform(?:ed|s|ing)?|underperform(?:ed|s|ing)?|surpass(?:ed|es|ing)?|overtook|overtaken|beat(?:s|ing)?|lost to)\b/i;

/** Splits at the marker word into left/right, deriving an icon per side — prefers a named crypto asset's real logo over a generic topic icon when the side text names one. No grammar awareness beyond that, an accepted limitation. */
export function extractComparison(text: string): ExtractedComparison | null {
  const match = text.match(COMPARISON_PATTERN);
  if (!match || match.index === undefined) return null;

  const left = text.slice(0, match.index).trim().replace(/[,:;]$/, "");
  const right = text
    .slice(match.index + match[0].length)
    .trim()
    .replace(/^[,:;]\s*/, "")
    .replace(/\.$/, "");
  if (!left || !right) return null;

  return {
    left,
    right,
    leftIcon: resolveSideIcon(left),
    rightIcon: resolveSideIcon(right),
  };
}

function resolveSideIcon(sideText: string): string {
  const [asset] = extractAssets(sideText);
  if (asset) return asset.iconSlug;
  const topic = TOPIC_ICON_KEYWORDS.find((entry) => entry.pattern.test(sideText));
  return topic?.icon ?? "Circle";
}

const TIMELINE_PATTERN =
  /\b(next week|next month|next year|this week|this month|this year|by \d{4}|in \d{4}|over the next \w+ (?:weeks?|months?|years?)|by next \w+|within \w+ (?:days?|weeks?|months?|years?)|long-term|short-term)\b/i;

export function extractTimeline(text: string): ExtractedTimeline | null {
  const match = text.match(TIMELINE_PATTERN);
  if (!match) return null;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  return {
    phrase: match[0],
    emphasizedLabel: yearMatch ? yearMatch[1] : undefined,
  };
}

// Narrative-role marker words — "warning"/"comparison"/"payoff" roles reuse
// RISK_WORDS/COMPARISON_PATTERN/OPPORTUNITY_WORDS above; only these two are new.
export const EXAMPLE_MARKERS =
  /\b(for example|for instance|such as|imagine|picture this|consider|think of it as)\b/i;
export const EVIDENCE_MARKERS =
  /\b(according to|data shows?|research shows?|studies show|reports? shows?|in fact|the numbers show)\b/i;

// Secondary accents — nothing detected goes to waste. Runs regardless of what
// won primary; a signal already shown as the primary visual isn't re-added.
export function extractAccents(text: string, wonType: VisualType): AccentEntity[] {
  const accents: AccentEntity[] = [];

  // "comparison" already puts both named assets front-and-center as the
  // primary visual's own icons — re-showing them as corner accents would
  // just be the same two logos twice. "asset" only wins with a single asset
  // (classifyVisualType's extractAssets(text)[0]) — any OTHER named asset in
  // the same sentence ("Bitcoin and Ethereum make up most portfolios" — Bitcoin
  // wins primary, Ethereum is still a real, distinct thing worth surfacing)
  // still deserves its own accent, so only the winning one is excluded here.
  if (wonType !== "comparison") {
    const assets = extractAssets(text);
    const skip = wonType === "asset" ? 1 : 0;
    for (const asset of assets.slice(skip)) {
      accents.push({ kind: "asset", label: asset.symbol, asset });
    }
  }
  if (wonType !== "risk" && RISK_WORDS.test(text)) {
    accents.push({ kind: "risk", label: "Risk" });
  }
  if (OPPORTUNITY_WORDS.test(text)) {
    accents.push({ kind: "opportunity", label: "Growth" });
  }

  // Broader topical visuals — every sentence should get *some* supporting
  // visual where one genuinely applies, not just when risk/opportunity/asset
  // language happens to fire. Only fills remaining slots, and skips any icon
  // already implied by a stronger signal above (no duplicate-looking chips).
  for (const entry of TOPIC_ICON_KEYWORDS) {
    if (accents.length >= ACCENTS.maxPerBeat) break;
    if (!entry.pattern.test(text)) continue;
    if (accents.some((a) => a.icon === entry.icon)) continue;
    accents.push({ kind: "topic", label: entry.label, icon: entry.icon });
  }

  return accents.slice(0, ACCENTS.maxPerBeat);
}

// Hero icon — for "statement" beats (TitleCard, the plain-text fallback):
// which single icon-registry key, if any, best represents what this beat is
// actually about. Reuses the same accents/domain data planBeats() already
// computes, so a beat with no real entity/topic signal correctly resolves to
// `undefined` — TitleCard renders plain, not a forced icon on every sentence.
const DOMAIN_HERO_ICONS: Partial<Record<Domain, string>> = {
  crypto: "Coins",
  stocks: "LineChart",
  ai: "BrainCircuit",
  economy: "Landmark",
  business: "Briefcase",
  technology: "Cpu",
};

/** Prefers a named asset's real brand logo, then a matched topic icon, then a generic per-domain icon — in that order of specificity. */
export function resolveHeroIcon(accents: AccentEntity[], domain: Domain): string | undefined {
  const assetAccent = accents.find((a) => a.kind === "asset" && a.asset);
  if (assetAccent?.asset) return assetAccent.asset.iconSlug;

  const topicAccent = accents.find((a) => a.kind === "topic" && a.icon);
  if (topicAccent?.icon) return topicAccent.icon;

  return DOMAIN_HERO_ICONS[domain];
}
