(() => {
  "use strict";
  const KEY = "ecg-tracker-v1";
  const DAY = 86400000;
  const defaults = { rate: 1.9, service: 0, budget: "", readings: [], topups: [] };
  let state = load();

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => Number(n).toLocaleString("en-GH", { minimumFractionDigits: d, maximumFractionDigits: d });
  const today = () => new Date().toISOString().slice(0, 10);
  const toTime = (s) => new Date(s + "T00:00:00Z").getTime();

  function load() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return Object.assign({}, defaults); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    render();
  }

  // Readings sorted ascending with usage vs previous reading.
  function readingsWithUsage() {
    const sorted = [...state.readings].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((r, i) => ({ ...r, used: i ? r.value - sorted[i - 1].value : null, prev: i ? sorted[i - 1] : null }));
  }

  // Spread each interval's usage evenly over the days it covers -> {date: kWh}
  function dailyUsage() {
    const out = {};
    for (const r of readingsWithUsage()) {
      if (r.used == null || r.used < 0) continue;
      const start = toTime(r.prev.date), end = toTime(r.date);
      const days = Math.max(1, Math.round((end - start) / DAY));
      for (let i = 1; i <= days; i++) {
        const d = new Date(start + i * DAY).toISOString().slice(0, 10);
        out[d] = (out[d] || 0) + r.used / days;
      }
    }
    return out;
  }

  function monthlyUsage() {
    const m = {};
    for (const [d, k] of Object.entries(dailyUsage())) m[d.slice(0, 7)] = (m[d.slice(0, 7)] || 0) + k;
    return m;
  }
  const monthCost = (kwh) => kwh * state.rate + Number(state.service || 0);

  function renderStats() {
    const daily = dailyUsage();
    const days = Object.keys(daily).sort();
    const monthKey = today().slice(0, 7);
    const mUsed = monthlyUsage()[monthKey] || 0;
    const last7 = days.slice(-7);
    const avg = last7.length ? last7.reduce((s, d) => s + daily[d], 0) / last7.length : 0;
    const latest = [...state.readings].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const budget = Number(state.budget) || 0;
    const cost = mUsed ? monthCost(mUsed) : 0;
    const cards = [
      ["This month", `${fmt(mUsed)} kWh`, `≈ GH₵ ${fmt(cost)}`],
      ["Avg / day (last 7)", `${fmt(avg)} kWh`, `≈ GH₵ ${fmt(avg * state.rate)}`],
      ["Projected month", `GH₵ ${fmt(avg ? monthCost(avg * 30) : 0)}`, "at current daily average"],
      ["Latest reading", latest ? fmt(latest.value) : "—", latest ? latest.date : "none yet"],
    ];
    if (budget) {
      const left = budget - cost;
      cards.push(["Budget left", `<span class="${left < 0 ? "over" : "ok"}">GH₵ ${fmt(left)}</span>`, `of GH₵ ${fmt(budget)}`]);
    }
    const purchased = state.topups.reduce((s, t) => s + t.units, 0);
    if (state.topups.length) cards.push(["Prepaid bought", `${fmt(purchased)} kWh`, `GH₵ ${fmt(state.topups.reduce((s, t) => s + t.amount, 0))}`]);
    $("stats").innerHTML = cards.map(([l, v, n]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`).join("");
  }

  function renderChart() {
    const daily = dailyUsage();
    const end = toTime(today());
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(end - i * DAY).toISOString().slice(0, 10); days.push([d, daily[d] || 0]); }
    const has = days.some(([, v]) => v > 0);
    $("chart-empty").hidden = has;
    const cv = $("chart"), dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 160;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted"), line = css.getPropertyValue("--line"), acc = css.getPropertyValue("--accent");
    const max = Math.max(1, ...days.map(([, v]) => v)), pad = 24, bw = (w - 30) / days.length;
    c.font = "11px system-ui"; c.fillStyle = muted; c.strokeStyle = line;
    c.beginPath(); c.moveTo(30, h - pad); c.lineTo(w, h - pad); c.stroke();
    c.fillText(fmt(max, 1), 0, 12); c.fillText("0", 14, h - pad);
    days.forEach(([d, v], i) => {
      const bh = (v / max) * (h - pad - 14);
      c.fillStyle = acc; c.fillRect(30 + i * bw + 1, h - pad - bh, Math.max(1, bw - 2), bh);
      if (i % 7 === 0 || i === days.length - 1) { c.fillStyle = muted; c.fillText(d.slice(5), 30 + i * bw - 6, h - 8); }
    });
  }

  function renderTables() {
    const mu = monthlyUsage();
    $("months").tBodies[0].innerHTML = Object.keys(mu).sort().reverse()
      .map((m) => `<tr><td>${m}</td><td>${fmt(mu[m])}</td><td>${fmt(monthCost(mu[m]))}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No data yet</td></tr>`;

    $("readings").tBodies[0].innerHTML = readingsWithUsage().reverse()
      .map((r) => `<tr><td>${r.date}</td><td>${fmt(r.value)}</td><td>${r.used == null ? "—" : (r.used < 0 ? `<span class="over">${fmt(r.used)}</span>` : fmt(r.used))}</td><td><button class="del" data-del="readings" data-id="${r.id}" title="Delete">✕</button></td></tr>`).join("")
      || `<tr><td colspan="4" class="muted">No readings yet</td></tr>`;

    $("topups").tBodies[0].innerHTML = [...state.topups].sort((a, b) => b.date.localeCompare(a.date))
      .map((t) => `<tr><td>${t.date}</td><td>${fmt(t.amount)}</td><td>${fmt(t.units)}</td><td>${t.units ? fmt(t.amount / t.units, 3) : "—"}</td><td><button class="del" data-del="topups" data-id="${t.id}" title="Delete">✕</button></td></tr>`).join("")
      || `<tr><td colspan="5" class="muted">No top-ups yet</td></tr>`;
  }

  function render() { renderStats(); renderChart(); renderTables(); }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  $("reading-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const date = $("r-date").value, value = parseFloat($("r-value").value);
    if (state.readings.some((r) => r.date === date) && !confirm("A reading already exists for this date. Add another?")) return;
    state.readings.push({ id: uid(), date, value });
    $("r-value").value = ""; save();
  });
  $("topup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.topups.push({ id: uid(), date: $("t-date").value, amount: parseFloat($("t-amount").value), units: parseFloat($("t-units").value) });
    e.target.reset(); $("t-date").value = today(); save();
  });
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.rate = parseFloat($("s-rate").value); state.service = parseFloat($("s-service").value) || 0; state.budget = $("s-budget").value;
    save();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    state[b.dataset.del] = state[b.dataset.del].filter((x) => x.id !== b.dataset.id); save();
  });
  $("export").addEventListener("click", () => {
    const rows = [["type", "date", "reading_kwh", "amount_ghs", "units_kwh"]];
    state.readings.forEach((r) => rows.push(["reading", r.date, r.value, "", ""]));
    state.topups.forEach((t) => rows.push(["topup", t.date, "", t.amount, t.units]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = "ecg-usage.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("clear").addEventListener("click", () => {
    if (confirm("Delete ALL readings, top-ups and settings? This cannot be undone.")) { state = Object.assign({}, defaults, { readings: [], topups: [] }); fillSettings(); save(); }
  });

  function fillSettings() { $("s-rate").value = state.rate; $("s-service").value = state.service; $("s-budget").value = state.budget; }
  $("r-date").value = $("t-date").value = today();
  fillSettings(); render();
  window.addEventListener("resize", renderChart);
})();
