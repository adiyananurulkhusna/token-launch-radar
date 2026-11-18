// token-launch-radar — dashboard (model "radar-2")
//
// This file is the page's own copy of the model rules in lib/model.ts.
// impliedOf, gasFor, categoryPlan and farmSteps here produce exactly the
// same numbers and the same farm-plan strings as the program that writes
// board.json, so the page and the board can never disagree. The detail
// drawer renders the steps this file generates.

(function () {
  "use strict";
  var DATA = window.__RADAR_DATA__;
  if (!DATA) { document.getElementById("rows").innerHTML = "<tr><td colspan=7>Data failed to load.</td></tr>"; return; }

  // ---- model (same constants as lib/model.ts) ----
  var GROWTH_FLOOR = -60, GROWTH_CAP = 120, GROWTH_MIN = 0.85, GROWTH_MAX = 1.3;
  var MATURITY_DAYS = 1095, UNKNOWN_AGE = 365, REACH_STEP = 0.04, REACH_MAX_EXTRA = 5;

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function ageDays(asOf, listedAt) {
    if (!listedAt) return UNKNOWN_AGE;
    var a = Date.parse(asOf), b = Date.parse(listedAt);
    if (isNaN(a) || isNaN(b)) return UNKNOWN_AGE;
    return Math.max(0, Math.floor((a - b) / 86400000));
  }
  function fmtMoney(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n);
  }
  function fmtAge(days) {
    if (days >= 365) return (days / 365).toFixed(1) + "y";
    if (days >= 30) return Math.round(days / 30) + "mo";
    return days + "d";
  }
  function fmtPct(x) {
    if (x == null) return "—";
    return (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Implied value from a row's stored multiple, with adjustable growth
  // weight and maturity floor (the sandbox). At the defaults (0.35, 0.70)
  // this reproduces the board exactly.
  function impliedCalc(row, gw, mf) {
    var growth = clamp(row.change_7d == null ? 0 : row.change_7d, GROWTH_FLOOR, GROWTH_CAP);
    var g = clamp(1 + (growth / 100) * gw, GROWTH_MIN, GROWTH_MAX);
    var m = mf + (1 - mf) * (Math.min(row.age_days, MATURITY_DAYS) / MATURITY_DAYS);
    var r = 1 + REACH_STEP * Math.min(Math.max(row.chains.length - 1, 0), REACH_MAX_EXTRA);
    return { value: Math.max(1, Math.round(row.tvl_usd * row.model.multiple * g * m * r)), growth: g, maturity: m, reach: r };
  }

  function gasFor(chain) {
    var c = (chain || "").toLowerCase();
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

  function categoryPlan(category) {
    switch (category) {
      case "Lending": return { action: "Deposit collateral and borrow a small amount against it", cadence: "Repay part of the loan, then deposit again", capital: "$500 of collateral, borrow $150" };
      case "CDP": return { action: "Mint the protocol's stablecoin against your collateral", cadence: "Mint a little more, then repay a little, each week", capital: "$500 of collateral, mint $200" };
      case "Dexs": return { action: "Provide liquidity to the busiest pool and swap through it once", cadence: "Swap a small amount and add a little liquidity weekly", capital: "$500 of liquidity, $50 per swap" };
      case "Yield": return { action: "Deposit into the highest-APY vault and leave it compounding", cadence: "Top up the vault and claim rewards once a week", capital: "$500 into the vault" };
      case "Derivatives": case "Perpetual": return { action: "Open a small 2x leveraged position and hold it for a week", cadence: "Close and reopen a small position once a week", capital: "$200 position, 2x leverage" };
      case "Bridge": case "Canonical Bridge": case "Cross Chain Bridge": return { action: "Bridge funds to the protocol's main chain and use them there", cadence: "Bridge a small amount back and forth once a month", capital: "$300 per bridge" };
      case "Liquid Staking": case "Liquid Restaking": case "Restaking": case "Staking Pool": return { action: "Stake the chain's native asset and hold the receipt token", cadence: "Top up the stake a little each week", capital: "$500 staked" };
      case "RWA": return { action: "Buy the tokenized asset and hold it in your wallet", cadence: "Add a small amount to the position each month", capital: "$500 of the asset" };
      case "Prediction Market": return { action: "Place a small bet on a market you follow and let it settle", cadence: "Place one small bet per week on a market you read", capital: "$20-50 per market" };
      case "Risk Curators": return { action: "Deposit into a curated vault and let the curator manage it", cadence: "Check the vault's allocation and top up monthly", capital: "$500 into a vault" };
      case "Onchain Capital Allocator": return { action: "Deposit into an allocation vault", cadence: "Review the allocation and top up once a month", capital: "$500 into a vault" };
      case "Basis Trading": return { action: "Deposit into a basis vault", cadence: "Check the funding-rate yield and top up monthly", capital: "$500 into a vault" };
      case "Yield Aggregator": return { action: "Deposit and enable auto-compound", cadence: "Harvest and re-deposit once a week", capital: "$500 deposited" };
      case "Indexes": return { action: "Buy the index token and hold it", cadence: "Add a small amount each month", capital: "$500 of the index" };
      case "Insurance": return { action: "Buy cover for a protocol you already use", cadence: "Renew or extend the cover each month", capital: "$300 of cover" };
      case "Stablecoins": case "Dual-Token Stablecoin": case "Stablecoin Wrapper": return { action: "Mint or hold the stablecoin and use it for a payment", cadence: "Use the stablecoin for one payment each week", capital: "$500 held" };
      case "Payments": return { action: "Send or receive a payment through the protocol", cadence: "Make one payment a week through it", capital: "$200 per payment" };
      case "Governance Incentives": return { action: "Vote on two open proposals", cadence: "Vote on every new proposal while it is open", capital: "no capital, just your time" };
      case "CeDeFi": return { action: "Deposit into the CeDeFi vault", cadence: "Check the vault yield and top up monthly", capital: "$500 into the vault" };
      case "Collateral Markets": case "Collateral Management": return { action: "Deposit collateral into the market", cadence: "Top up the collateral once a month", capital: "$500 of collateral" };
      case "Chain": return { action: "Bridge funds to the chain and use its native apps", cadence: "Use one native app on the chain each week", capital: "$300 bridged" };
      case "Launchpad": return { action: "Stake to qualify for allocations", cadence: "Apply for every allocation you qualify for", capital: "$500 staked" };
      case "Privacy": return { action: "Deposit through a private pool", cadence: "Use the private pool once a month", capital: "$200 per deposit" };
      case "AI Agents": case "Decentralized AI": return { action: "Delegate to an agent or run one with a small budget", cadence: "Check the agent's output and re-delegate weekly", capital: "$100 delegated" };
      case "NFT Marketplace": return { action: "List or buy an NFT on the marketplace", cadence: "Trade one small item per week", capital: "$100 per trade" };
      case "Options": return { action: "Buy a call or put with 30 days to expiry", cadence: "Roll the position once a month", capital: "$100 per option" };
      case "Leveraged Farming": return { action: "Open a 2x leveraged farm position", cadence: "Rebalance the position once a week", capital: "$300 at 2x" };
      case "Liquidity Manager": return { action: "Deposit into a managed liquidity position", cadence: "Check the position's range and top up monthly", capital: "$500 deposited" };
      case "Token Locker": return { action: "Lock liquidity for 30 days", cadence: "Extend or add to the lock each month", capital: "$500 locked" };
      case "DOR": return { action: "Deposit into a rate vault", cadence: "Check the rate and top up monthly", capital: "$500 deposited" };
      case "CEX": return { action: "Trade a small amount on the exchange", cadence: "Place one trade per week", capital: "$200 per trade" };
      default: return { action: "Deposit into the protocol's main product and use it", cadence: "Use the protocol once a week, every week", capital: "$500 deposited" };
    }
  }

  function farmSteps(row, implied) {
    var main = row.chains[0] || "Ethereum";
    var gas = gasFor(main);
    var plan = categoryPlan(row.category);
    var age = fmtAge(row.age_days);
    return [
      "Set up a fresh wallet for this farm only, write the seed phrase on paper and store it offline; never share it or paste it anywhere. Cost: $0. Time: 15 minutes.",
      plan.action + " on " + main + " (" + plan.capital + "). One transaction costs about " + gas.cost + " in gas and takes " + gas.speed + ". Keep the receipt and tx hash.",
      plan.cadence + "; do it the same day each week so the activity looks like a real user, not a one-off. Each round costs about " + gas.cost + " in gas.",
      "Keep the position open for at least 30 days. " + row.name + " has been listed for " + age + " and holds " + fmtMoney(row.tvl_usd) + " of TVL, so a short farm that exits in a week is the pattern airdrop filters usually cut.",
      "Check the protocol's own points or rewards page once a week, from its official site only; never connect your wallet to a link from a group chat or DM. Cost: $0. Time: 5 minutes.",
      "Write down every deposit, tx hash and date in a farm log. If " + row.name + " launches a token, the implied value today is " + fmtMoney(implied) + " by this radar's model — a model, not a price — so only sell what the claim is actually worth, and keep the gas reserve for the claim itself."
    ];
  }

  // ---- state ----
  var state = { q: "", cat: "", chain: "", min: 0, watch: false, sort: "implied", tab: "pre", gw: 0.35, mf: 0.7, selected: null };
  var watchSet = {};
  DATA.watchlist.slugs.forEach(function (s) { watchSet[s] = true; });
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

  function readHash() {
    var h = location.hash.slice(1);
    if (!h) return;
    h.split("&").forEach(function (kv) {
      var p = kv.split("="), k = p[0], v = decodeURIComponent(p[1] || "");
      if (k === "q") state.q = v;
      else if (k === "cat") state.cat = v;
      else if (k === "chain") state.chain = v;
      else if (k === "min") state.min = +v || 0;
      else if (k === "watch") state.watch = v === "1";
      else if (k === "sort") state.sort = v;
      else if (k === "tab") state.tab = v === "live" ? "live" : "pre";
      else if (k === "p") state.selected = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push("q=" + encodeURIComponent(state.q));
    if (state.cat) parts.push("cat=" + encodeURIComponent(state.cat));
    if (state.chain) parts.push("chain=" + encodeURIComponent(state.chain));
    if (state.min) parts.push("min=" + state.min);
    if (state.watch) parts.push("watch=1");
    if (state.sort !== "implied") parts.push("sort=" + state.sort);
    if (state.tab === "live") parts.push("tab=live");
    if (state.selected) parts.push("p=" + state.selected);
    history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search);
  }

  // ---- header / stats ----
  var early = DATA.rows.length - DATA.watchlist.covered;
  document.getElementById("meta").textContent =
    "Snapshot " + DATA.snapshot.as_of + " · DefiLlama protocol index · " + DATA.model.name;
  document.getElementById("lede").textContent =
    DATA.rows.length + " pre-token protocols, ranked by implied value";
  document.getElementById("lede-sub").textContent =
    "The watchlist is the floor: every protocol with at least " + fmtMoney(DATA.snapshot.floor_usd) +
    " of TVL and no token on record (" + DATA.watchlist.covered + " of " + DATA.watchlist.total +
    "). The early radar adds " + early + " more pre-token protocols below that floor. Implied value is a model, not a promise.";
  var med = DATA.rows[Math.floor(DATA.rows.length / 2)];
  document.getElementById("stats").innerHTML = [
    ["Watchlist covered", DATA.watchlist.covered + " / " + DATA.watchlist.total],
    ["Pre-token rows", String(DATA.rows.length)],
    ["Early rows below the floor", String(early)],
    ["Median implied value", fmtMoney(med ? med.implied_value_usd : 0)]
  ].map(function (s) { return "<div class=stat><b>" + esc(s[1]) + "</b><span>" + esc(s[0]) + "</span></div>"; }).join("");

  // ---- filter options ----
  var cats = {}, chains = {};
  DATA.rows.forEach(function (r) {
    cats[r.category || "Uncategorized"] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) {
      var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  fillSelect("cat", Object.keys(cats).sort());
  fillSelect("chain", Object.keys(chains).sort());

  // ---- category multiples panel ----
  var mults = Object.keys(DATA.model.category_multiples)
    .map(function (k) { return { cat: k, m: DATA.model.category_multiples[k] }; })
    .filter(function (x) { return x.m.n >= 3; })
    .sort(function (a, b) { return b.m.multiple - a.m.multiple; })
    .slice(0, 9);
  document.getElementById("mults").innerHTML = mults.map(function (x) {
    return "<div class=mult><b>" + x.m.multiple.toFixed(3) + "×</b> " + esc(x.cat) +
      "<br><span>median FDV/TVL, " + x.m.n + " live comparables</span></div>";
  }).join("") +
  "<div class=mult><b>" + DATA.model.global_multiple.toFixed(3) + "×</b> global median" +
  "<br><span>fallback when a category has fewer than 3 live comparables</span></div>";

  // ---- table ----
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !watchSet[r.slug]) return false;
      if (state.cat && (r.category || "Uncategorized") !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.min) return false;
      if (q) {
        var hay = (r.name + " " + (r.category || "") + " " + r.chains.join(" ") + " " + r.slug).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var calc = function (r) { return impliedCalc(r, state.gw, state.mf).value; };
    if (state.sort === "tvl") rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug); });
    else if (state.sort === "growth") rows.sort(function (a, b) { return (b.change_7d || -1e9) - (a.change_7d || -1e9) || a.slug.localeCompare(b.slug); });
    else if (state.sort === "age") rows.sort(function (a, b) { return b.age_days - a.age_days || a.slug.localeCompare(b.slug); });
    else if (state.sort === "name") rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else rows.sort(function (a, b) { return calc(b) - calc(a) || a.slug.localeCompare(b.slug); });
    return rows;
  }

  function rowHtml(r, implied) {
    var badge = watchSet[r.slug]
      ? "<span class='badge watch'>Watchlist</span>"
      : "<span class='badge early'>Early</span>";
    var chg = r.change_7d == null ? "<span class=flat>—</span>"
      : "<span class='" + (r.change_7d >= 0 ? "up" : "down") + "'>" + fmtPct(r.change_7d) + "</span>";
    var pct = Math.max(2, Math.round((implied / maxImplied) * 100));
    return "<tr data-slug='" + esc(r.slug) + "'" + (state.selected === r.slug ? " class=selected" : "") + ">" +
      "<td class=rank>" + r.rank + "</td>" +
      "<td><div class=pname>" + esc(r.name) + "</div><div class=psub>" + esc(r.category || "Uncategorized") + " on " + esc(r.chains.slice(0, 3).join(", ")) + (r.chains.length > 3 ? " +" + (r.chains.length - 3) : "") + "</div></td>" +
      "<td class=num>" + fmtMoney(r.tvl_usd) + "</td>" +
      "<td class=num>" + chg + "</td>" +
      "<td class=num>" + fmtAge(r.age_days) + "</td>" +
      "<td><div class=bar><div class=track><div class=fill style='width:" + pct + "%'></div></div><span class=barval>" + fmtMoney(implied) + "</span></div></td>" +
      "<td>" + badge + "</td></tr>";
  }

  function render() {
    var tbody = document.getElementById("rows");
    var note = document.getElementById("table-note");
    var count = document.getElementById("count");
    var empty = document.getElementById("empty");
    var sandboxActive = state.gw !== 0.35 || state.mf !== 0.7;
    document.getElementById("sandbox-note").textContent = sandboxActive
      ? "Sandbox active — the table below is re-ranked with growth weight " + state.gw.toFixed(2) + " and maturity floor " + state.mf.toFixed(2) + "."
      : "Sandbox matches the board at the defaults.";
    if (state.tab === "live") {
      note.textContent = "Live-token protocols, set aside. They already have a token — they are the comparables the category multiples come from, not the radar's targets.";
      count.textContent = DATA.live.length + " live-token protocols shown";
      tbody.innerHTML = DATA.live.map(function (r) {
        return "<tr data-slug='" + esc(r.slug) + "'><td class=rank>—</td>" +
          "<td><div class=pname>" + esc(r.name) + "</div><div class=psub>" + esc(r.category || "Uncategorized") + " on " + esc(r.chains.slice(0, 3).join(", ")) + "</div></td>" +
          "<td class=num>" + fmtMoney(r.tvl_usd) + "</td>" +
          "<td class=num>" + (r.change_7d == null ? "<span class=flat>—</span>" : "<span class='" + (r.change_7d >= 0 ? "up" : "down") + "'>" + fmtPct(r.change_7d) + "</span>") + "</td>" +
          "<td class=num>—</td>" +
          "<td><div class=bar><span class=barval>" + fmtMoney(r.mcap_usd) + " market cap</span></div></td>" +
          "<td><span class='badge live'>Token · " + r.multiple.toFixed(2) + "×</span></td></tr>";
      }).join("");
      empty.hidden = true;
      return;
    }
    note.textContent = "Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.";
    var rows = filteredRows();
    count.textContent = rows.length + " rows shown";
    empty.hidden = rows.length > 0;
    tbody.innerHTML = rows.map(function (r) { return rowHtml(r, impliedCalc(r, state.gw, state.mf).value); }).join("");
  }

  // ---- detail drawer ----
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    var drawer = document.getElementById("drawer");
    var body = document.getElementById("drawer-body");
    if (!row) { drawer.hidden = true; state.selected = null; render(); return; }
    state.selected = slug;
    var c = impliedCalc(row, state.gw, state.mf);
    var steps = farmSteps(row, c.value);
    body.innerHTML =
      "<h2>" + esc(row.name) + "</h2>" +
      "<p class=dsub>" + esc(row.category || "Uncategorized") + " on " + esc(row.chains.join(", ")) +
      " · " + (watchSet[row.slug] ? "on the watchlist" : "early, below the floor") + "</p>" +
      "<div class=big>" + fmtMoney(c.value) + "</div>" +
      "<p class=bigsub>implied value — model radar-2, snapshot " + DATA.snapshot.as_of + "</p>" +
      "<h3>Model breakdown</h3><table class=dtable>" +
      "<tr><td>TVL</td><td>" + fmtMoney(row.tvl_usd) + "</td></tr>" +
      "<tr><td>× category multiple<br><span style='color:var(--muted);font-size:12px'>" + esc(row.model.multiple_source) + "</span></td><td>" + row.model.multiple.toFixed(3) + "×</td></tr>" +
      "<tr><td>× growth " + fmtPct(row.change_7d) + " (7d)</td><td>" + c.growth.toFixed(2) + "×</td></tr>" +
      "<tr><td>× maturity (" + fmtAge(row.age_days) + " listed)</td><td>" + c.maturity.toFixed(2) + "×</td></tr>" +
      "<tr><td>× reach (" + row.chains.length + " chain" + (row.chains.length > 1 ? "s" : "") + ")</td><td>" + c.reach.toFixed(2) + "×</td></tr>" +
      "<tr class=total><td>= implied value</td><td>" + fmtMoney(c.value) + "</td></tr></table>" +
      "<h3>Farm plan — 6 steps</h3><ol class=steps>" +
      steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      "<div class=note><strong>Read this first.</strong> This protocol records no token in the snapshot — that is a fact about the snapshot, not a promise that no token exists or that one will launch. The implied value is this radar's model, not a price. Farming costs real gas; never farm with money you need, and never connect a wallet to a link from a group chat or DM.</div>";
    drawer.hidden = false;
    render();
  }
  function closeDetail() {
    state.selected = null;
    document.getElementById("drawer").hidden = true;
    writeHash();
    render();
  }
  document.getElementById("drawer-close").addEventListener("click", closeDetail);
  document.getElementById("rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-slug]");
    if (!tr) return;
    if (state.tab === "live") return;
    openDetail(tr.getAttribute("data-slug"));
    writeHash();
  });

  // ---- controls ----
  function bind(id, evt, fn) { document.getElementById(id).addEventListener(evt, fn); }
  bind("q", "input", function (e) { state.q = e.target.value; writeHash(); render(); });
  bind("cat", "change", function (e) { state.cat = e.target.value; writeHash(); render(); });
  bind("chain", "change", function (e) { state.chain = e.target.value; writeHash(); render(); });
  bind("min", "change", function (e) { state.min = +e.target.value; writeHash(); render(); });
  bind("watch", "change", function (e) { state.watch = e.target.checked; writeHash(); render(); });
  bind("sort", "change", function (e) { state.sort = e.target.value; writeHash(); render(); });
  bind("tab-pre", "click", function () { state.tab = "pre"; setTabs(); writeHash(); render(); });
  bind("tab-live", "click", function () { state.tab = "live"; setTabs(); writeHash(); render(); });
  function setTabs() {
    document.getElementById("tab-pre").classList.toggle("active", state.tab === "pre");
    document.getElementById("tab-live").classList.toggle("active", state.tab === "live");
    document.getElementById("tab-pre").setAttribute("aria-selected", state.tab === "pre");
    document.getElementById("tab-live").setAttribute("aria-selected", state.tab === "live");
  }
  bind("gw", "input", function (e) {
    state.gw = +e.target.value;
    document.getElementById("gw-val").textContent = state.gw.toFixed(2);
    render();
  });
  bind("mf", "input", function (e) {
    state.mf = +e.target.value;
    document.getElementById("mf-val").textContent = state.mf.toFixed(2);
    render();
  });
  bind("reset", "click", function () {
    state.gw = 0.35; state.mf = 0.7;
    document.getElementById("gw").value = "0.35";
    document.getElementById("mf").value = "0.7";
    document.getElementById("gw-val").textContent = "0.35";
    document.getElementById("mf-val").textContent = "0.70";
    render();
  });

  // ---- init from hash ----
  readHash();
  document.getElementById("q").value = state.q;
  document.getElementById("cat").value = state.cat;
  document.getElementById("chain").value = state.chain;
  document.getElementById("min").value = String(state.min);
  document.getElementById("watch").checked = state.watch;
  document.getElementById("sort").value = state.sort;
  setTabs();
  render();
  if (state.selected) openDetail(state.selected);
})();
