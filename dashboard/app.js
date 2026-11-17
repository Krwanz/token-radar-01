// Token Radar, model radar-2. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a top-10 strip and a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is
// in data.js.
(() => {
  'use strict';

  const DATA = window.RADAR;
  if (!DATA) return;
  const app = document.getElementById('board');
  const state = {
    q: '',
    category: 'all',
    chain: 'all',
    scope: 'all',
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtUsd = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  };
  const fmtPct = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };
  const fmtAge = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  };

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. This must match
  // lib/model.ts exactly: base TVL x the market rate (the median mcap/TVL
  // of the comparable live-token protocols, carried in DATA.model as
  // base_multiple), growth clamped -50..100 at weight 0.6, maturity 0.6 +
  // min(age, 1095) / 1095 x 0.4, breadth 1 + 0.04 per extra chain (capped
  // at 5), category 0.6 derivative / 0.9 curator / 1.0 other.
  const DERIVATIVE = ['bridge', 'canonical bridge', 'cross chain bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'staking pool', 'stablecoin wrapper'];
  const categoryFactor = (category) => {
    const c = (category || '').toLowerCase();
    if (DERIVATIVE.includes(c)) return 0.6;
    if (c.includes('curator') || c.includes('allocator')) return 0.9;
    return 1;
  };
  const impliedOf = (row, model) => {
    const raw = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
    const growthMult = 1 + (growth / 100) * model.growth_weight;
    const age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    const maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    const extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_extra_chains);
    const breadth = 1 + extra * model.breadth_step;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth * categoryFactor(row.category)));
  };

  /** Build an element: attrs use class/text/html, on* keys are listeners, the rest are attributes. */
  const el = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (const child of kids.flat()) {
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  };

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  const chainOf = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');
  const capitalFor = (p) => {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  };
  const holdDaysFor = (age) => {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  };
  const actionFor = (p, capital, chain) => {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
    if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  };
  const secondActionFor = (p, capital, chain) => {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    const small = capital >= 150 ? 50 : 25;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against the deposit on ${name} and repay it within a week.`;
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $${small} through ${name}'s main pool on ${chain} and keep the receipt.`;
    if (c.includes('bridge')) return `Deposit the bridged funds into a ${name} pool on ${chain} for one week.`;
    if (c.includes('staking') || c.includes('restak')) return `Delegate a further $${small} through ${name} and check the receipt it returns.`;
    if (c.includes('perpetual') || c.includes('derivative')) return `Open a second small hedge on ${name} with $${small} of margin, then close it.`;
    if (c.includes('prediction')) return `Place a second market position of $${small} on ${name}.`;
    if (c.includes('curator') || c.includes('allocator')) return `Deposit $${small} into a second ${name} vault on ${chain} and keep both shares.`;
    if (c.includes('stable')) return `Swap $${small} of the stable asset through ${name} on ${chain}.`;
    if (c.includes('rwa')) return `Buy a further $${small} of the yield asset on ${name} and hold it.`;
    if (c.includes('insurance')) return `Add $${small} of cover from ${name} on ${chain} for a second week.`;
    return `Make a second deposit of $${small} into ${name} on ${chain} and keep it open for a week.`;
  };
  const stepText = (step) => {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600) s = `${s.slice(0, 596)}...`;
    if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
    return s;
  };
  const farmSteps = (p) => {
    const chain = chainOf(p);
    const capital = capitalFor(p);
    const hold = holdDaysFor(p.age_days);
    const gas = capital >= 150 ? 8 : 4;
    const gas2 = capital >= 150 ? 6 : 3;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: `about $${gas2} of gas`, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; ignore direct messages and lookalike sites.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in two or three tranches and keep gas for the exit.', cost: 'nothing but the log, plus about $3 of exit gas', time: '5 minutes, plus the exit' },
    ].map(stepText);
  };

  const readHash = () => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope')) state.scope = params.get('scope');
  };
  const writeHash = () => {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.selected) params.set('p', state.selected);
    const next = params.toString();
    window.history.replaceState(null, '', next ? `#${next}` : window.location.pathname + window.location.search);
  };

  const rows = () => {
    const q = state.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || !r.chains.includes(state.chain))) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  };
  const sortedRows = (list) => {
    const key = state.sort;
    const valueOf = (r) => {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      return r.implied_value_usd;
    };
    return list.slice().sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  };

  const header = () =>
    el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: `Snapshot ${DATA.as_of}` }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: `${DATA.model_version} model` }),
      ),
    );

  const lede = () =>
    el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: `${DATA.watchlist_size} watchlist protocols, ranked by implied value` }),
        el('p', { text: `The watchlist is the floor: every protocol with at least $${Math.round(DATA.floor_usd / 1e6)}M of TVL and no token on record. The early radar adds ${DATA.early_size} pre-token protocols below that floor, so the board is the whole rankable pre-token universe in this snapshot. Implied value is a model, not a promise.` }),
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: `${DATA.watchlist_size} / ${DATA.watchlist_size}` })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
      ),
    );

  const topTen = () => {
    const top = DATA.rows.slice().sort((a, b) => b.implied_value_usd - a.implied_value_usd).slice(0, 10);
    const max = top.length ? top[0].implied_value_usd : 1;
    return el('section', { class: 'panel topten' },
      el('h2', { text: 'Top 10 at a glance' }),
      el('p', { text: 'The strongest implied values on the board. Select any row in the table below for its full model and farm plan.' }),
      top.map((r) =>
        el('div', { class: 'toprow' },
          el('span', { class: 'num', text: String(r.rank) }),
          el('div', null,
            el('span', { class: 'tname', text: r.name }),
            el('div', { class: 'tbar', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.max(3, Math.round((r.implied_value_usd / max) * 100))}%` })),
          ),
          el('span', { class: 'tval', text: fmtUsd(r.implied_value_usd) }),
        ),
      ),
    );
  };

  const controls = () => {
    const categories = [...new Set(DATA.rows.map((r) => r.category || 'Other'))].sort();
    const chains = [...new Set(DATA.rows.flatMap((r) => r.chains || []))].sort();
    const search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { state.q = search.value; writeHash(); render(); });
    const select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null })),
    );
    select.addEventListener('change', () => { state.category = select.value; writeHash(); render(); });
    const chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null })),
    );
    chainSelect.addEventListener('change', () => { state.chain = chainSelect.value; writeHash(); render(); });
    const scopeBtn = (value, label) =>
      el('button', { type: 'button', 'aria-pressed': state.scope === value ? 'true' : 'false', text: label, onclick: () => { state.scope = value; writeHash(); render(); } });
    const tabBtn = (value, label) =>
      el('button', { type: 'button', 'aria-pressed': state.tab === value ? 'true' : 'false', text: label, onclick: () => { state.tab = value; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'tabs' }, scopeBtn('all', 'All'), scopeBtn('watchlist', 'Watchlist'), scopeBtn('early', 'Early'))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'))),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? `${rows().length} rows shown` : `${DATA.live.length} live-token protocols` }),
    );
  };

  const sortHeader = (key, label) =>
    el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: () => { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null,
      ),
    );

  const boardTable = () => {
    const list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: () => { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; writeHash(); render(); } }),
      ));
    }
    const max = list[0].implied_value_usd || 1;
    const tbody = el('tbody');
    for (const r of list) {
      const growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: `${r.category || 'Other'} on ${chains}` }),
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: `num ${growthClass}`, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.max(3, Math.round((r.implied_value_usd / max) * 100))}%` })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        )),
        el('td', null, el('span', { class: 'status', text: r.watchlist ? 'watchlist' : 'early' })),
      ));
    }
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Scope' }),
          )),
          tbody,
        ),
      ),
    );
  };

  const liveTable = () => {
    const tbody = el('tbody');
    for (const r of DATA.live) {
      const chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: `${r.category || 'Other'} on ${chains}` }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: `num ${r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'}`, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' })),
      ));
    }
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody,
        ),
      ),
    );
  };

  const modelPanel = () => {
    const m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        `implied = round( tvl_usd x ${m.base_multiple} x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) x breadth x category )`,
      ),
      el('p', { class: 'sub', text: `The market rate is the median market cap per dollar of TVL among ${DATA.calibration_n} live-token protocols in this same snapshot that sit in the watchlist's size class and would have been rankable had they no token: ${m.base_multiple.toFixed(3)} here, so a pre-token protocol is priced at the rate the market already pays, not at launch hype. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ${m.unknown_age_days} days. Breadth is 1 + ${m.breadth_step} per extra chain, capped at ${m.breadth_max_extra_chains} extra chains. Category is ${m.category_derivative} for bridges, liquid-staking and other derivative products, ${m.category_curator} for curators and allocators, and 1.00 otherwise. The early radar is every rankable pre-token protocol below the watchlist floor, and the live-token protocols are set aside with their market caps shown.` }),
    );
  };

  const dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  const openDetail = (slug) => {
    const row = DATA.rows.find((r) => r.slug === slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    const steps = farmSteps(row);
    const recomputed = impliedOf(row, DATA.model);
    const matches = recomputed === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: `Rank ${row.rank} of ${DATA.board_size} - ${row.watchlist ? 'watchlist' : 'early'}` }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: `${row.category || 'Other'} on ${row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'}` }),
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => dialog.close() }),
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Base (TVL x market rate)' }), el('b', { class: 'num', text: fmtUsd(Math.round(row.tvl_usd * DATA.model.base_multiple)) })),
        el('div', null, el('span', { text: 'Combined multipliers' }), el('b', { class: 'num', text: (row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier * row.category_factor).toFixed(4) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Category factor' }), el('b', { class: 'num', text: String(row.category_factor) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
      ),
      el('p', { class: 'sub', text: `Model ${DATA.model_version}: the same function scores every protocol, and the market rate is the median mcap/TVL of ${DATA.calibration_n} comparable live-token protocols in this snapshot. The page recomputes this row as ${fmtUsd(recomputed)}${matches ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.'} This is an estimate, not a price.` }),
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  };

  const render = () => {
    app.textContent = '';
    const shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(topTen());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  };

  readHash();
  render();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
