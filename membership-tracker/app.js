(() => {
  "use strict";
  const KEY = "bn-members-v1";
  const SOON_DAYS = 7;
  const defaultPackages = [
    { id: "daily", name: "Daily Hot Desk", count: 1, unit: "day", price: 200 },
    { id: "weekly", name: "Weekly Hot Desk", count: 1, unit: "week", price: 800 },
    { id: "monthly", name: "Monthly Hot Desk", count: 1, unit: "month", price: 2500 },
    { id: "dedicated", name: "Dedicated Desk", count: 1, unit: "month", price: 3200 },
    { id: "booth", name: "Private Office Booth", count: 1, unit: "month", price: 4000 },
    { id: "virtual", name: "Virtual Office", count: 1, unit: "month", price: 1200 },
    { id: "office-annual", name: "Private Office (annual)", count: 12, unit: "month", price: "" },
    { id: "office-biannual", name: "Private Office (bi-annual)", count: 6, unit: "month", price: "" },
  ];
  const defaults = { packages: defaultPackages, members: [], remind: [7, 3, 1, 0], notify: false, sent: {} };
  let state = load();
  let editingMember = null, editingPkg = null;

  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const unitLabel = (n, u) => `${n} ${u}${n === 1 ? "" : "s"}`;

  // ---- dates (all YYYY-MM-DD strings, computed in UTC so DST never shifts a day) ----
  const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const ms = (s) => Date.parse(s + "T00:00:00Z");
  const addDays = (s, n) => iso(ms(s) + n * 86400000);
  function addMonths(s, n) {
    const { y, m, d } = parse(s);
    const t = m + n, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return iso(Date.UTC(ny, nm, Math.min(d, last)));
  }
  // Last included day of a package.
  function endDate(start, count, unit) {
    const next = unit === "month" ? addMonths(start, count) : addDays(start, count * (unit === "week" ? 7 : 1));
    return addDays(next, -1);
  }
  const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
  const pretty = (s) => new Date(ms(s)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved ? Object.assign({}, defaults, saved) : structuredClone(defaults);
    } catch { return structuredClone(defaults); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    render();
  }

  function enrich(m) {
    const end = endDate(m.start, m.count, m.unit);
    const left = daysBetween(localToday(), end);
    const status = left < 0 ? "expired" : left <= SOON_DAYS ? "soon" : "active";
    return { ...m, end, left, status };
  }
  const members = () => state.members.map(enrich).sort((a, b) => a.end.localeCompare(b.end));

  function leftText(m) {
    if (m.left < 0) return `Expired ${unitLabel(-m.left, "day")} ago`;
    if (m.left === 0) return "Ends today";
    if (m.left === 1) return "Ends tomorrow";
    return `${m.left} days left`;
  }

  // ---- rendering ----
  function render() {
    renderStats(); renderBanner(); renderPkgSelects(); renderList(); renderPkgList(); renderSettings(); updatePreview();
  }

  function renderStats() {
    const ms_ = members();
    const c = (s) => ms_.filter((m) => m.status === s).length;
    const card = (label, value, cls = "") => `<div class="card"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
    $("stats").innerHTML = card("Active", c("active") + c("soon")) + card("Ending within 7 days", c("soon"), c("soon") ? "over" : "") + card("Expired", c("expired"), c("expired") ? "over" : "");
  }

  function renderBanner() {
    const el = $("alert");
    const due = members().filter((m) => m.status !== "active" && m.left >= -3);
    if (!due.length) { el.hidden = true; return; }
    const expired = due.filter((m) => m.status === "expired");
    el.className = "alert" + (expired.length ? "" : " warn");
    el.textContent = due.map((m) => `${m.name}: ${m.pkgName} — ${leftText(m).toLowerCase()}`).join(" · ");
    el.hidden = false;
  }

  function renderPkgSelects() {
    const opts = state.packages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    const cur = $("m-pkg").value;
    $("m-pkg").innerHTML = opts;
    if (cur && state.packages.some((p) => p.id === cur)) $("m-pkg").value = cur; else if (!editingMember) applyPackage();
    const fcur = $("f-pkg").value;
    $("f-pkg").innerHTML = `<option value="">All packages</option>` + opts;
    $("f-pkg").value = fcur;
  }

  function renderList() {
    const q = $("f-search").value.trim().toLowerCase(), st = $("f-status").value, pk = $("f-pkg").value;
    const list = members().filter((m) =>
      (st === "all" || (st === "active" ? m.status !== "expired" : m.status === st)) &&
      (!pk || m.pkgId === pk) &&
      (!q || (m.name + " " + (m.phone || "")).toLowerCase().includes(q)));
    $("list-empty").hidden = state.members.length > 0;
    $("list").innerHTML = list.map((m) => `
      <div class="item ${m.status}">
        <div><div class="name">${esc(m.name)}</div>
          <div class="meta">${esc(m.pkgName)} · ${unitLabel(m.count, m.unit)}${m.price !== "" && m.price != null ? " · GH₵ " + fmt(m.price) : ""}${m.phone ? " · " + esc(m.phone) : ""}</div>
          <div class="meta">${pretty(m.start)} → <strong>${pretty(m.end)}</strong></div>
          ${m.notes ? `<div class="meta">${esc(m.notes)}</div>` : ""}</div>
        <span class="badge">${leftText(m)}</span>
        <div class="btns">
          <button class="small" data-act="renew" data-id="${m.id}">Renew</button>
          <button class="small ghost" data-act="edit" data-id="${m.id}">Edit</button>
          ${m.phone ? `<a href="tel:${esc(m.phone)}"><button class="small ghost" type="button">Call</button></a>` : ""}
          <button class="danger" data-act="del" data-id="${m.id}">Delete</button>
        </div>
      </div>`).join("");
  }

  function renderPkgList() {
    $("pkg-list").innerHTML = state.packages.map((p) => `
      <div class="item" style="border-left-color:var(--accent)">
        <div><div class="name">${esc(p.name)}</div>
          <div class="meta">${unitLabel(p.count, p.unit)}${p.price !== "" && p.price != null ? " · GH₵ " + fmt(p.price) : ""}</div></div>
        <div class="btns" style="grid-column:auto">
          <button class="small ghost" data-pact="edit" data-id="${esc(p.id)}">Edit</button>
          <button class="danger" data-pact="del" data-id="${esc(p.id)}">Delete</button>
        </div>
      </div>`).join("");
  }

  function renderSettings() {
    if (document.activeElement !== $("s-remind")) $("s-remind").value = state.remind.join(", ");
    $("s-notify").checked = !!state.notify;
  }

  function updatePreview() {
    const s = $("m-start").value, n = +$("m-count").value;
    $("m-end-preview").textContent = s && n > 0 ? `Ends on ${pretty(endDate(s, n, $("m-unit").value))}` : "";
  }

  // ---- members ----
  function applyPackage() {
    const p = state.packages.find((x) => x.id === $("m-pkg").value);
    if (!p) return;
    $("m-count").value = p.count; $("m-unit").value = p.unit; $("m-price").value = p.price ?? "";
  }
  function resetMemberForm() {
    editingMember = null;
    $("member-form").reset();
    $("m-start").value = localToday();
    $("form-title").textContent = "Add a member / booking";
    $("m-submit").textContent = "Save"; $("m-cancel").hidden = true;
    applyPackage(); updatePreview();
  }

  $("member-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = state.packages.find((x) => x.id === $("m-pkg").value);
    const m = {
      id: editingMember || uid(), name: $("m-name").value.trim(), phone: $("m-phone").value.trim(),
      pkgId: $("m-pkg").value, pkgName: p ? p.name : "Package", start: $("m-start").value,
      count: Math.max(1, Math.floor(+$("m-count").value)), unit: $("m-unit").value,
      price: $("m-price").value === "" ? "" : +$("m-price").value, notes: $("m-notes").value.trim(),
    };
    if (editingMember) state.members = state.members.map((x) => (x.id === m.id ? m : x)); else state.members.push(m);
    resetMemberForm(); save();
  });
  $("m-pkg").addEventListener("change", () => { applyPackage(); updatePreview(); });
  ["m-start", "m-count", "m-unit"].forEach((id) => $(id).addEventListener("input", updatePreview));
  $("m-cancel").addEventListener("click", resetMemberForm);
  ["f-search", "f-status", "f-pkg"].forEach((id) => $(id).addEventListener("input", renderList));

  $("list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const m = state.members.find((x) => x.id === b.dataset.id);
    if (!m) return;
    if (b.dataset.act === "del") {
      if (confirm(`Delete ${m.name}?`)) { state.members = state.members.filter((x) => x !== m); save(); }
    } else if (b.dataset.act === "renew") {
      // New period starts the day after the current one ends (or today if it already lapsed longer ago).
      const next = addDays(endDate(m.start, m.count, m.unit), 1);
      m.start = next < localToday() && confirm("This lapsed a while ago. Start the renewal today instead of the day after it ended?") ? localToday() : next;
      save();
    } else {
      editingMember = m.id;
      $("m-name").value = m.name; $("m-phone").value = m.phone || ""; $("m-pkg").value = m.pkgId;
      $("m-start").value = m.start; $("m-count").value = m.count; $("m-unit").value = m.unit;
      $("m-price").value = m.price ?? ""; $("m-notes").value = m.notes || "";
      $("form-title").textContent = "Edit member"; $("m-submit").textContent = "Update"; $("m-cancel").hidden = false;
      updatePreview(); $("member-form").scrollIntoView({ behavior: "smooth" });
    }
  });

  // ---- packages ----
  function resetPkgForm() {
    editingPkg = null; $("pkg-form").reset();
    $("p-submit").textContent = "Add package"; $("p-cancel").hidden = true;
  }
  $("pkg-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = { id: editingPkg || uid(), name: $("p-name").value.trim(), count: Math.max(1, Math.floor(+$("p-count").value)), unit: $("p-unit").value, price: $("p-price").value === "" ? "" : +$("p-price").value };
    if (editingPkg) {
      state.packages = state.packages.map((x) => (x.id === p.id ? p : x));
      state.members.forEach((m) => { if (m.pkgId === p.id) m.pkgName = p.name; });
    } else state.packages.push(p);
    resetPkgForm(); save();
  });
  $("p-cancel").addEventListener("click", resetPkgForm);
  $("pkg-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-pact]");
    if (!b) return;
    const p = state.packages.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.pact === "del") {
      const used = state.members.filter((m) => m.pkgId === p.id).length;
      if (confirm(`Delete "${p.name}"?` + (used ? ` ${used} existing member(s) keep their dates and package name.` : ""))) {
        state.packages = state.packages.filter((x) => x !== p); save();
      }
    } else {
      editingPkg = p.id;
      $("p-name").value = p.name; $("p-count").value = p.count; $("p-unit").value = p.unit; $("p-price").value = p.price ?? "";
      $("p-submit").textContent = "Update package"; $("p-cancel").hidden = false;
      $("pkg-form").scrollIntoView({ behavior: "smooth" });
    }
  });

  // ---- reminders ----
  const parseRemind = (s) => [...new Set(s.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => b - a);

  $("s-save").addEventListener("click", async () => {
    state.remind = parseRemind($("s-remind").value);
    if (!state.remind.length) state.remind = [0];
    state.notify = $("s-notify").checked;
    if (state.notify && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    if (state.notify && (!("Notification" in window) || Notification.permission !== "granted")) {
      state.notify = false; alert("Notifications are blocked or unsupported on this device. Allow them in browser settings, or use the calendar (.ics) reminders.");
    }
    save(); checkReminders();
  });

  async function notify(title, body, tag) {
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) return reg.showNotification(title, { body, tag, icon: "icon-192.png" });
      new Notification(title, { body, tag, icon: "icon-192.png" });
    } catch {}
  }

  // Fires each (member, end date, threshold) once. Expired packages fire once under "exp".
  function checkReminders() {
    if (!state.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    let changed = false;
    for (const m of members()) {
      const hit = m.left < 0 ? "exp" : state.remind.filter((d) => m.left <= d).sort((a, b) => a - b)[0];
      if (hit == null) continue;
      const key = `${m.id}|${m.end}|${hit}`;
      if (state.sent[key]) continue;
      state.sent[key] = 1; changed = true;
      notify(m.left < 0 ? "Package expired" : "Package ending", `${m.name}: ${m.pkgName} — ${leftText(m).toLowerCase()} (${pretty(m.end)})`, key);
    }
    if (changed) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  }

  // ---- calendar export: all-day event on the end date with an alarm per reminder day ----
  $("ics").addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BaseNord//Membership Tracker//EN", "CALSCALE:GREGORIAN"];
    const esc_ = (s) => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    for (const m of state.members.map(enrich)) {
      lines.push("BEGIN:VEVENT", `UID:${m.id}-${m.end}@basenord`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${m.end.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(m.end, 1).replace(/-/g, "")}`,
        `SUMMARY:${esc_(`Ends: ${m.name} – ${m.pkgName}`)}`, `DESCRIPTION:${esc_(`${m.name}${m.phone ? " " + m.phone : ""}. ${m.pkgName}, ${pretty(m.start)} to ${pretty(m.end)}.`)}`);
      for (const d of state.remind) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc_(`${m.name}: ${m.pkgName} ends ${d ? "in " + d + " day" + (d === 1 ? "" : "s") : "today"}`)}`,
          // Alarm fires at 9am, d days before the end date.
          d ? `TRIGGER:-PT${d * 24 - 9}H` : "TRIGGER:PT9H", "END:VALARM");
      }
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    download("basenord-package-ends.ics", "text/calendar", lines.join("\r\n"));
  });

  function download(name, type, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("export").addEventListener("click", () => download(`basenord-members-${localToday()}.json`, "application/json", JSON.stringify(state, null, 2)));
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.members) || !Array.isArray(d.packages)) throw 0;
      if (!confirm("Replace all current data with this backup?")) return;
      state = Object.assign({}, defaults, d); save();
    } catch { alert("That file is not a valid backup."); }
    e.target.value = "";
  });

  resetMemberForm();
  render();
  checkReminders();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); checkReminders(); } });
})();
