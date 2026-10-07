(() => {
  "use strict";
  const KEY = "ecg-tracker-v1";
  const DAY = 86400000;
  const defaults = { rate: 1.9, service: 0, budget: "", readings: [], topups: [], balances: [], alertDays: 3, alertKwh: "", notify: false, lastAlert: "" };
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

  // Usage between consecutive remaining-balance checks: previous balance + top-ups in (prev, this] - this balance.
  function balanceIntervals() {
    const sorted = [...state.balances].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((b, i) => {
      if (!i) return { ...b, used: null, prev: null };
      const prev = sorted[i - 1];
      const bought = state.topups.filter((t) => t.date > prev.date && t.date <= b.date).reduce((s, t) => s + t.units, 0);
      return { ...b, prev, used: prev.units + bought - b.units };
    });
  }

  // Spread an interval's usage evenly over the days it covers, adding into out.
  function spread(out, prevDate, date, used) {
    const start = toTime(prevDate), end = toTime(date);
    const days = Math.max(1, Math.round((end - start) / DAY));
    for (let i = 1; i <= days; i++) {
      const d = new Date(start + i * DAY).toISOString().slice(0, 10);
      out[d] = (out[d] || 0) + used / days;
    }
  }

  // Daily usage {date: kWh}. Meter readings win on days they cover; balance checks fill the rest.
  function dailyUsage() {
    const fromReadings = {}, fromBalances = {};
    for (const r of readingsWithUsage()) if (r.used != null && r.used >= 0) spread(fromReadings, r.prev.date, r.date, r.used);
    for (const b of balanceIntervals()) if (b.used != null && b.used >= 0) spread(fromBalances, b.prev.date, b.date, b.used);
    return Object.assign({}, fromBalances, fromReadings);
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

  // Estimated prepaid balance: last calibration (or 0) + top-ups since - usage since.
  function prepaidBalance() {
    if (!state.topups.length && !state.balances.length) return null;
    const check = [...state.balances].sort((x, y) => x.date.localeCompare(y.date)).pop();
    const since = check ? check.date : "";
    const bought = state.topups.filter((t) => t.date > since).reduce((s, t) => s + t.units, 0);
    const daily = dailyUsage(), dates = Object.keys(daily).sort();
    const recent = dates.slice(-7);
    const avg = recent.length ? recent.reduce((s, d) => s + daily[d], 0) / recent.length : 0;
    // Known usage after the check, plus the average for days not yet covered by a reading/check.
    let used = dates.filter((d) => d > since).reduce((s, d) => s + daily[d], 0);
    const coveredTo = [since, dates[dates.length - 1] || ""].sort().pop();
    if (coveredTo) used += avg * Math.max(0, Math.round((toTime(today()) - toTime(coveredTo)) / DAY));
    const balance = (check ? check.units : 0) + bought - used;
    return { balance, bought, used, check, avg, daysLeft: avg > 0 && balance > 0 ? balance / avg : null };
  }

  function renderBalance() {
    const p = prepaidBalance();
    if (!p) { $("balance-box").innerHTML = `<p class="muted">Log a top-up or calibrate your meter balance to see your remaining units.</p>`; return; }
    const low = p.balance <= 0 ? "over" : p.daysLeft != null && p.daysLeft < 3 ? "over" : "ok";
    const cards = [
      ["Estimated remaining", `<span class="${low}">${fmt(Math.max(0, p.balance))} kWh</span>`, p.check ? `calibrated ${p.check.date} at ${fmt(p.check.units)} kWh` : "no calibration yet"],
      ["Days left", p.daysLeft != null ? fmt(p.daysLeft, 1) : "—", p.avg ? `at ${fmt(p.avg)} kWh/day` : "needs 2+ readings"],
      ["Value remaining", `GH₵ ${fmt(Math.max(0, p.balance) * state.rate)}`, "at your tariff"],
    ];
    $("balance-box").innerHTML = cards.map(([l, v, n]) => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`).join("");
  }

  function historyRows() {
    return [
      ...state.readings.map((r) => ({ id: r.id, list: "readings", type: "reading", date: r.date, text: `Meter reading ${fmt(r.value)} kWh` })),
      ...state.topups.map((t) => ({ id: t.id, list: "topups", type: "topup", date: t.date, text: `Top-up GH₵ ${fmt(t.amount)} → ${fmt(t.units)} kWh` })),
      ...balanceIntervals().map((b) => ({ id: b.id, list: "balances", type: "balance", date: b.date, text: `Meter balance ${fmt(b.units)} kWh` + (b.used == null ? "" : b.used < 0 ? " (balance went up: missing top-up?)" : ` (used ${fmt(b.used)} kWh since ${b.prev.date})`) })),
    ].sort((x, y) => y.date.localeCompare(x.date));
  }

  function renderAlert() {
    const p = prepaidBalance(), box = $("alert");
    let msg = "";
    if (p && state.balances.length + state.topups.length) {
      const days = Number(state.alertDays) || 0, kwh = Number(state.alertKwh) || 0;
      const bal = Math.max(0, p.balance);
      if (p.balance <= 0) msg = "Your prepaid balance is estimated at 0 kWh — top up now.";
      else if (kwh && bal < kwh) msg = `Low balance: about ${fmt(bal)} kWh left (below your ${fmt(kwh)} kWh alert).`;
      else if (days && p.daysLeft != null && p.daysLeft < days) msg = `Low balance: about ${fmt(p.daysLeft, 1)} day(s) left at your current usage (${fmt(bal)} kWh). Top up soon.`;
    }
    box.hidden = !msg; box.textContent = msg;
    box.classList.toggle("warn", !!msg && p.balance > 0);
    // At most one system notification per day, only while the app is open.
    if (msg && state.notify && "Notification" in window && Notification.permission === "granted" && state.lastAlert !== today()) {
      state.lastAlert = today();
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      try { new Notification("ECG balance low", { body: msg, icon: "icon-192.png" }); } catch {}
    }
  }

  function renderHistory() {
    const all = historyRows();
    const sel = $("h-month"), cur = sel.value;
    const months = [...new Set(all.map((r) => r.date.slice(0, 7)))].sort().reverse();
    sel.innerHTML = `<option value="">All months</option>` + months.map((m) => `<option ${m === cur ? "selected" : ""}>${m}</option>`).join("");
    const type = $("h-type").value, month = sel.value;
    const rows = all.filter((r) => (!type || r.type === type) && (!month || r.date.startsWith(month)));
    const label = { reading: "Reading", topup: "Top-up", balance: "Balance" };
    $("history").tBodies[0].innerHTML = rows.map((r) => `<tr><td>${r.date}</td><td><span class="tag">${label[r.type]}</span></td><td>${r.text}</td><td><button class="del" data-del="${r.list}" data-id="${r.id}" title="Delete">✕</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">No records</td></tr>`;
    $("h-count").textContent = `${rows.length} of ${all.length} records`;
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

  function render() { renderStats(); renderBalance(); renderAlert(); renderChart(); renderTables(); renderHistory(); }

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
  $("balance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.balances.push({ id: uid(), date: $("b-date").value, units: parseFloat($("b-units").value) });
    $("b-units").value = ""; save();
  });
  $("h-type").addEventListener("change", renderHistory);
  $("h-month").addEventListener("change", renderHistory);
  $("backup").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    a.download = `ecg-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  });
  $("restore").addEventListener("click", () => $("restore-file").click());
  $("restore-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.readings) || !Array.isArray(d.topups)) throw new Error("bad file");
      if (!confirm("Replace current data with this backup?")) return;
      state = Object.assign({}, defaults, d, { balances: Array.isArray(d.balances) ? d.balances : [] });
      fillSettings(); save();
    } catch { alert("That file isn't a valid ECG tracker backup."); }
  });
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.rate = parseFloat($("s-rate").value); state.service = parseFloat($("s-service").value) || 0; state.budget = $("s-budget").value;
    state.alertDays = $("s-alert-days").value; state.alertKwh = $("s-alert-kwh").value;
    state.notify = $("s-notify").checked;
    if (state.notify && "Notification" in window && Notification.permission === "default") Notification.requestPermission().then(render);
    else if (state.notify && !("Notification" in window)) alert("This browser doesn't support notifications; the in-app banner will still show.");
    save();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    state[b.dataset.del] = state[b.dataset.del].filter((x) => x.id !== b.dataset.id); save();
  });
  $("export").addEventListener("click", () => {
    const rows = [["type", "date", "reading_kwh", "amount_ghs", "units_kwh"]];
    state.readings.forEach((r) => rows.push(["reading", r.date, r.value, "", ""]));
    state.balances.forEach((b) => rows.push(["balance", b.date, "", "", b.units]));
    state.topups.forEach((t) => rows.push(["topup", t.date, "", t.amount, t.units]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = "ecg-usage.csv"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("clear").addEventListener("click", () => {
    if (confirm("Delete ALL readings, top-ups and settings? This cannot be undone.")) { state = Object.assign({}, defaults, { readings: [], topups: [], balances: [] }); fillSettings(); save(); }
  });

  function fillSettings() { $("s-alert-days").value = state.alertDays; $("s-alert-kwh").value = state.alertKwh; $("s-notify").checked = !!state.notify; $("s-rate").value = state.rate; $("s-service").value = state.service; $("s-budget").value = state.budget; }
  $("r-date").value = $("t-date").value = $("b-date").value = today();
  fillSettings(); render();
  window.addEventListener("resize", renderChart);

  const setOffline = () => { $("offline").hidden = navigator.onLine; };
  window.addEventListener("online", setOffline); window.addEventListener("offline", setOffline); setOffline();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
