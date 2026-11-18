// token-launch-radar — model "radar-2"
//
// The board ranks protocols that record no token, by an implied value that is
// *derived from the snapshot itself*, not from a fixed list of names:
//
//   implied = TVL x category multiple x growth x maturity x reach
//
// * category multiple — the median market-cap / TVL ratio of live-token
//   protocols in the same category, taken from this snapshot. A category
//   with fewer than three live comparables falls back to the global median
//   (0.214 here). The multiple is clamped to [0.03, 1.5] so one outlier
//   cannot dominate. This is the part the starter's flat 0.25 misses: a
//   lending protocol and a bridge do not trade at the same multiple.
// * growth — the 7-day TVL change, clamped to [-60%, +120%], moves the
//   value by at most +/-30% (weight 0.35, clamped to [0.85, 1.30]).
// * maturity — age since listed_at, 0.70 for a protocol listed yesterday up
//   to 1.00 after three years; unknown listing date counts as one year.
// * reach — each extra chain beyond the first adds 4%, up to +20%.
//   A protocol live on many chains is worth more than a single-chain one
//   at the same TVL.
//
// Everything is computed from the snapshot at run time. Re-running the
// program on the same snapshot always produces the same board.
export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist: string[];
  protocols: Proto[];
}

// One row of the board. farm_steps is part of the board file (the gate
// requires it); the page regenerates the same steps from its own copy of
// the rules, so the page and the board can never disagree.
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_source: string;
    growth_mult: number;
    maturity_mult: number;
    reach_mult: number;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  multiple: number;
}

export interface Board {
  snapshot: { as_of: string; source: string; floor_usd: number; rows: number };
  watchlist: { slugs: string[]; covered: number; total: number };
  model: {
    name: string;
    global_multiple: number;
    global_multiple_n: number;
    category_multiples: Record<string, { multiple: number; n: number; source: string }>;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

export const MODEL_NAME = "radar-2 (category-calibrated FDV/TVL)";
export const VERSION = "2.0.0";

// ---- tunables (all visible in the dashboard's model sandbox) ----
export const GROWTH_FLOOR = -60; // % clamp on 7d change
export const GROWTH_CAP = 120; // % clamp on 7d change
export const GROWTH_WEIGHT = 0.35; // how much the 7d change moves value
export const GROWTH_MIN = 0.85;
export const GROWTH_MAX = 1.3;
export const MATURITY_FLOOR = 0.7; // value factor for a brand-new listing
export const MATURITY_DAYS = 1095; // three years to reach full maturity
export const UNKNOWN_AGE_DAYS = 365; // age assumed when listed_at is null
export const REACH_STEP = 0.04; // +4% per extra chain
export const REACH_MAX_EXTRA = 5; // +20% at most
export const MULTIPLE_MIN = 0.03;
export const MULTIPLE_MAX = 1.5;
export const MIN_LIVE_SAMPLES = 3; // live comps needed before a category speaks
export const LIVE_VIEW = 24; // live-token protocols shown for contrast

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const n = a.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number {
  if (!listedAt) return UNKNOWN_AGE_DAYS;
  const a = Date.parse(asOf);
  const b = Date.parse(listedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return UNKNOWN_AGE_DAYS;
  return Math.max(0, Math.floor((a - b) / 86_400_000));
}

export function parseSnapshot(json: unknown): Snapshot {
  if (!json || typeof json !== "object") throw new Error("snapshot is not an object");
  const s = json as Record<string, unknown>;
  if (typeof s.as_of !== "string") throw new Error("snapshot.as_of missing");
  if (typeof s.source !== "string") throw new Error("snapshot.source missing");
  if (typeof s.floor_usd !== "number" || s.floor_usd <= 0) throw new Error("snapshot.floor_usd missing");
  if (!Array.isArray(s.watchlist)) throw new Error("snapshot.watchlist missing");
  if (!Array.isArray(s.protocols)) throw new Error("snapshot.protocols missing");
  for (const p of s.protocols as Record<string, unknown>[]) {
    for (const f of ["slug", "name", "tvl_usd", "mcap_usd", "change_7d", "listed_at", "gecko_id", "symbol", "category"] as const) {
      if (!(f in p)) throw new Error(`protocol ${String(p.slug ?? "?")} is missing ${f}`);
    }
    if (!Array.isArray(p.chains)) throw new Error(`protocol ${String(p.slug ?? "?")} has no chains`);
  }
  return s as unknown as Snapshot;
}

export interface CategoryMultiple {
  multiple: number;
  n: number;
  source: string; // "category median (n=…)" or "global median fallback"
}

// Median FDV/TVL of live-token protocols per category, from this snapshot.
export function categoryMultiples(protocols: Proto[]): { byCategory: Map<string, CategoryMultiple>; global: CategoryMultiple } {
  const live = protocols.filter((p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalMedian = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const global: CategoryMultiple = {
    multiple: clamp(globalMedian, MULTIPLE_MIN, MULTIPLE_MAX),
    n: live.length,
    source: `global median (n=${live.length})`,
  };
  const byCategory = new Map<string, CategoryMultiple>();
  const cats = new Set(protocols.map((p) => p.category ?? "Uncategorized"));
  for (const cat of cats) {
    const comps = live.filter((p) => (p.category ?? "Uncategorized") === cat);
    if (comps.length >= MIN_LIVE_SAMPLES) {
      const m = median(comps.map((p) => (p.mcap_usd as number) / p.tvl_usd));
      byCategory.set(cat, {
        multiple: clamp(m, MULTIPLE_MIN, MULTIPLE_MAX),
        n: comps.length,
        source: `category median (n=${comps.length})`,
      });
    } else {
      byCategory.set(cat, { multiple: global.multiple, n: comps.length, source: `global median fallback (n=${comps.length} live)` });
    }
  }
  return { byCategory, global };
}

export interface Implied {
  value: number;
  multiple: number;
  multipleSource: string;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
}

export function impliedOf(p: Proto, asOf: string, multiples: { byCategory: Map<string, CategoryMultiple>; global: CategoryMultiple }): Implied {
  const cat = p.category ?? "Uncategorized";
  const cm = multiples.byCategory.get(cat) ?? multiples.global;
  const growth = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
  const growthMult = clamp(1 + (growth / 100) * GROWTH_WEIGHT, GROWTH_MIN, GROWTH_MAX);
  const age = ageDays(asOf, p.listed_at);
  const maturityMult = MATURITY_FLOOR + (1 - MATURITY_FLOOR) * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS);
  const reachMult = 1 + REACH_STEP * Math.min(Math.max(p.chains.length - 1, 0), REACH_MAX_EXTRA);
  const value = Math.max(1, Math.round(p.tvl_usd * cm.multiple * growthMult * maturityMult * reachMult));
  return { value, multiple: cm.multiple, multipleSource: cm.source, growthMult, maturityMult, reachMult };
}

// A protocol is rankable when it records no token, is not an exchange
// (exchange tokens are a different game) and is not a versioned pool of
// another protocol (its token, if any, belongs to the parent).
export function isRankable(p: Proto): boolean {
  if (p.mcap_usd != null || p.gecko_id != null || p.symbol != null) return false;
  if (p.category === "CEX") return false;
  if (/(^|\s)(v\d+|version\s*\d+|v\d+\.\d+)/i.test(p.name)) return false;
  return true;
}

// The board's scope: the whole watchlist, plus every rankable protocol
// below the floor. Protocols above the floor that the watchlist does not
// name are left out on purpose: at that size they are overwhelmingly
// wrapped, bridged or exchange products (a wrapped BTC, a bridge run by a
// centralised exchange, a bridged stablecoin) — not standalone protocols
// about to launch a token. Ranking one of those first, at a multi-billion
// implied value, would be the radar misunderstanding its own data.
export function isBoardRow(p: Proto, floorUsd: number, watchlist: Set<string>): boolean {
  if (!isRankable(p)) return false;
  return watchlist.has(p.slug) || p.tvl_usd < floorUsd;
}

export function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function fmtAge(days: number): string {
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 30) return `${Math.round(days / 30)}mo`;
  return `${days}d`;
}

// ---- farm plans ----------------------------------------------------------
// Every row carries 6 steps: each one names a concrete action, a cost and a
// time. Costs are per-transaction gas on the protocol's main chain; the
// page regenerates the same steps from its own copy of these rules, so the
// board and the page always agree. Steps are 20-600 chars each.

export interface GasInfo {
  cost: string; // typical cost of one transaction, USD
  speed: string; // how long one transaction takes
}

export function gasFor(chain: string): GasInfo {
  const c = chain.toLowerCase();
  if (c === "solana") return { cost: "$0.02", speed: "about 1 minute" };
  if (c === "base" || c === "ink") return { cost: "$0.20", speed: "about 1 minute" };
  if (c === "arbitrum") return { cost: "$0.30", speed: "about 2 minutes" };
  if (c === "optimism") return { cost: "$0.25", speed: "about 2 minutes" };
  if (c === "polygon") return { cost: "$0.05", speed: "about 2 minutes" };
  if (c === "binance") return { cost: "$0.15", speed: "about 1 minute" };
  if (c === "avalanche") return { cost: "$0.40", speed: "about 2 minutes" };
  if (c === "tron") return { cost: "$1", speed: "about 3 minutes" };
  if (c === "bitcoin") return { cost: "$2", speed: "30-60 minutes" };
  if (c === "bittensor") return { cost: "$0.50", speed: "about 5 minutes" };
  if (c === "stellar") return { cost: "$0.01", speed: "about 1 minute" };
  if (c === "ethereum") return { cost: "$6", speed: "5-15 minutes" };
  return { cost: "$1", speed: "about 5 minutes" };
}

export interface CategoryPlan {
  action: string; // step 2: the main on-chain action
  cadence: string; // step 3: the repeating action
  capital: string; // suggested size
}

export function categoryPlan(category: string | null): CategoryPlan {
  switch (category) {
    case "Lending":
      return { action: "Deposit collateral and borrow a small amount against it", cadence: "Repay part of the loan, then deposit again", capital: "$500 of collateral, borrow $150" };
    case "CDP":
      return { action: "Mint the protocol's stablecoin against your collateral", cadence: "Mint a little more, then repay a little, each week", capital: "$500 of collateral, mint $200" };
    case "Dexs":
      return { action: "Provide liquidity to the busiest pool and swap through it once", cadence: "Swap a small amount and add a little liquidity weekly", capital: "$500 of liquidity, $50 per swap" };
    case "Yield":
      return { action: "Deposit into the highest-APY vault and leave it compounding", cadence: "Top up the vault and claim rewards once a week", capital: "$500 into the vault" };
    case "Derivatives":
    case "Perpetual":
      return { action: "Open a small 2x leveraged position and hold it for a week", cadence: "Close and reopen a small position once a week", capital: "$200 position, 2x leverage" };
    case "Bridge":
    case "Canonical Bridge":
    case "Cross Chain Bridge":
      return { action: "Bridge funds to the protocol's main chain and use them there", cadence: "Bridge a small amount back and forth once a month", capital: "$300 per bridge" };
    case "Liquid Staking":
    case "Liquid Restaking":
    case "Restaking":
    case "Staking Pool":
      return { action: "Stake the chain's native asset and hold the receipt token", cadence: "Top up the stake a little each week", capital: "$500 staked" };
    case "RWA":
      return { action: "Buy the tokenized asset and hold it in your wallet", cadence: "Add a small amount to the position each month", capital: "$500 of the asset" };
    case "Prediction Market":
      return { action: "Place a small bet on a market you follow and let it settle", cadence: "Place one small bet per week on a market you read", capital: "$20-50 per market" };
    case "Risk Curators":
      return { action: "Deposit into a curated vault and let the curator manage it", cadence: "Check the vault's allocation and top up monthly", capital: "$500 into a vault" };
    case "Onchain Capital Allocator":
      return { action: "Deposit into an allocation vault", cadence: "Review the allocation and top up once a month", capital: "$500 into a vault" };
    case "Basis Trading":
      return { action: "Deposit into a basis vault", cadence: "Check the funding-rate yield and top up monthly", capital: "$500 into a vault" };
    case "Yield Aggregator":
      return { action: "Deposit and enable auto-compound", cadence: "Harvest and re-deposit once a week", capital: "$500 deposited" };
    case "Indexes":
      return { action: "Buy the index token and hold it", cadence: "Add a small amount each month", capital: "$500 of the index" };
    case "Insurance":
      return { action: "Buy cover for a protocol you already use", cadence: "Renew or extend the cover each month", capital: "$300 of cover" };
    case "Stablecoins":
    case "Dual-Token Stablecoin":
    case "Stablecoin Wrapper":
      return { action: "Mint or hold the stablecoin and use it for a payment", cadence: "Use the stablecoin for one payment each week", capital: "$500 held" };
    case "Payments":
      return { action: "Send or receive a payment through the protocol", cadence: "Make one payment a week through it", capital: "$200 per payment" };
    case "Governance Incentives":
      return { action: "Vote on two open proposals", cadence: "Vote on every new proposal while it is open", capital: "no capital, just your time" };
    case "CeDeFi":
      return { action: "Deposit into the CeDeFi vault", cadence: "Check the vault yield and top up monthly", capital: "$500 into the vault" };
    case "Collateral Markets":
    case "Collateral Management":
      return { action: "Deposit collateral into the market", cadence: "Top up the collateral once a month", capital: "$500 of collateral" };
    case "Chain":
      return { action: "Bridge funds to the chain and use its native apps", cadence: "Use one native app on the chain each week", capital: "$300 bridged" };
    case "Launchpad":
      return { action: "Stake to qualify for allocations", cadence: "Apply for every allocation you qualify for", capital: "$500 staked" };
    case "Privacy":
      return { action: "Deposit through a private pool", cadence: "Use the private pool once a month", capital: "$200 per deposit" };
    case "AI Agents":
    case "Decentralized AI":
      return { action: "Delegate to an agent or run one with a small budget", cadence: "Check the agent's output and re-delegate weekly", capital: "$100 delegated" };
    case "NFT Marketplace":
      return { action: "List or buy an NFT on the marketplace", cadence: "Trade one small item per week", capital: "$100 per trade" };
    case "Options":
      return { action: "Buy a call or put with 30 days to expiry", cadence: "Roll the position once a month", capital: "$100 per option" };
    case "Leveraged Farming":
      return { action: "Open a 2x leveraged farm position", cadence: "Rebalance the position once a week", capital: "$300 at 2x" };
    case "Liquidity Manager":
      return { action: "Deposit into a managed liquidity position", cadence: "Check the position's range and top up monthly", capital: "$500 deposited" };
    case "Token Locker":
      return { action: "Lock liquidity for 30 days", cadence: "Extend or add to the lock each month", capital: "$500 locked" };
    case "DOR":
      return { action: "Deposit into a rate vault", cadence: "Check the rate and top up monthly", capital: "$500 deposited" };
    case "CEX":
      return { action: "Trade a small amount on the exchange", cadence: "Place one trade per week", capital: "$200 per trade" };
    default:
      return { action: "Deposit into the protocol's main product and use it", cadence: "Use the protocol once a week, every week", capital: "$500 deposited" };
  }
}

export function farmSteps(p: Proto, implied: number, asOf: string): string[] {
  const main = p.chains[0] ?? "Ethereum";
  const gas = gasFor(main);
  const plan = categoryPlan(p.category);
  const age = fmtAge(ageDays(asOf, p.listed_at));
  return [
    `Set up a fresh wallet for this farm only, write the seed phrase on paper and store it offline; never share it or paste it anywhere. Cost: $0. Time: 15 minutes.`,
    `${plan.action} on ${main} (${plan.capital}). One transaction costs about ${gas.cost} in gas and takes ${gas.speed}. Keep the receipt and tx hash.`,
    `${plan.cadence}; do it the same day each week so the activity looks like a real user, not a one-off. Each round costs about ${gas.cost} in gas.`,
    `Keep the position open for at least 30 days. ${p.name} has been listed for ${age} and holds ${fmtMoney(p.tvl_usd)} of TVL, so a short farm that exits in a week is the pattern airdrop filters usually cut.`,
    `Check the protocol's own points or rewards page once a week, from its official site only; never connect your wallet to a link from a group chat or DM. Cost: $0. Time: 5 minutes.`,
    `Write down every deposit, tx hash and date in a farm log. If ${p.name} launches a token, the implied value today is ${fmtMoney(implied)} by this radar's model — a model, not a price — so only sell what the claim is actually worth, and keep the gas reserve for the claim itself.`,
  ];
}

// ---- board build ---------------------------------------------------------

export function buildBoard(snapshot: Snapshot): Board {
  const multiples = categoryMultiples(snapshot.protocols);
  const watchlistSet = new Set(snapshot.watchlist);
  const ranked = snapshot.protocols
    .filter((p) => isBoardRow(p, snapshot.floor_usd, watchlistSet))
    .map((p) => ({ p, imp: impliedOf(p, snapshot.as_of, multiples) }))
    .sort((a, b) => b.imp.value - a.imp.value || a.p.slug.localeCompare(b.p.slug));
  const rows: RadarRow[] = ranked.map(({ p, imp }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: ageDays(snapshot.as_of, p.listed_at),
    implied_value_usd: imp.value,
    model: {
      multiple: imp.multiple,
      multiple_source: imp.multipleSource,
      growth_mult: imp.growthMult,
      maturity_mult: imp.maturityMult,
      reach_mult: imp.reachMult,
    },
    farm_steps: farmSteps(p, imp.value, snapshot.as_of),
  }));
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, LIVE_VIEW)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      multiple: (p.mcap_usd as number) / p.tvl_usd,
    }));
  const covered = snapshot.watchlist.filter((slug) => rows.some((r) => r.slug === slug)).length;
  const catMult: Record<string, { multiple: number; n: number; source: string }> = {};
  for (const [k, v] of multiples.byCategory) catMult[k] = v;
  return {
    snapshot: { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, rows: snapshot.protocols.length },
    watchlist: { slugs: snapshot.watchlist, covered, total: snapshot.watchlist.length },
    model: {
      name: MODEL_NAME,
      global_multiple: multiples.global.multiple,
      global_multiple_n: multiples.global.n,
      category_multiples: catMult,
    },
    rows,
    live,
  };
}

// ---- gate mirror ---------------------------------------------------------
// The same seven checks the house gate runs (see RULES.txt). The program
// refuses to write a board that fails any of them.

export function boardIssue(board: Board, watchlist: string[]): string | null {
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) return `board rows ${rows.length} outside 100-4000`;
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.rank !== i + 1) return `rank ${r.rank} at position ${i + 1}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (!r.name || !r.slug) return `empty name/slug at rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `bad implied value at rank ${r.rank}`;
    }
    if (i > 0 && rows[i - 1].implied_value_usd < r.implied_value_usd) return `board not sorted at rank ${r.rank}`;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `farm steps ${r.farm_steps?.length} at rank ${r.rank}`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `farm step length ${t.length} at rank ${r.rank}`;
    }
  }
  if (rows.length > 1 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) return "all implied values equal";
  for (const slug of watchlist) if (!seen.has(slug)) return `watchlist slug missing: ${slug}`;
  return null;
}

export function dataScript(board: Board): string {
  return `window.__RADAR_DATA__ = ${JSON.stringify(board)};\n`;
}
