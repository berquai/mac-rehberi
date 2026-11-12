"use strict";
const VERSION = "1.0.0";
const TZ = "Europe/Istanbul";
const SPORT_ORDER = { football: 0, basketball: 1, volleyball: 2 };
const SPORT_ICON = { football: "⚽", basketball: "🏀", volleyball: "🏐" };
const SPORT_NAME = { football: "Futbol", basketball: "Basketbol", volleyball: "Voleybol" };
// Skor bilgisi yoksa maçın bittiğini varsaymak için tahmini süre (dk)
const DURATION_MIN = { football: 120, basketball: 135, volleyball: 150 };

const THEMES = [
  ["auto", "Otomatik", "#f4f5f7", "#0f1115"],
  ["light", "Açık", "#ffffff", "#2563eb"],
  ["dark", "Koyu", "#181b21", "#60a5fa"],
  ["midnight", "Gece Yarısı", "#000000", "#a78bfa"],
  ["stadium", "Stadyum", "#133a23", "#facc15"],
  ["parquet", "Parke", "#f1dfc4", "#ea580c"],
  ["sand", "Kum", "#ece2cb", "#0284c7"],
  ["claret", "Bordo-Mavi", "#7a1035", "#1e5bb8"],
  ["yellownavy", "Sarı-Lacivert", "#fcd116", "#0e1a3a"],
  ["yellowred", "Sarı-Kırmızı", "#fdb912", "#a90f26"],
  ["blackwhite", "Siyah-Beyaz", "#000000", "#ffffff"],
  ["redwhite", "Kırmızı-Beyaz", "#d71920", "#ffffff"],
  ["contrast", "Yüksek Kontrast", "#000000", "#ffff00"],
];

const state = { data: null, view: "today", sport: "all", league: "all", loading: false };
const $ = (s) => document.querySelector(s);

/* ---------------------------------------------------------------- saklama (güvenli) */
const store = {
  get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

/* ---------------------------------------------------------------- tarih yardımcıları */
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHM = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtShort = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fmtLong = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const dayKey = (d) => fmtDay.format(d);
function relDay(d) {
  const k = dayKey(d), now = new Date();
  if (k === dayKey(now)) return "Bugün";
  if (k === dayKey(new Date(now.getTime() + 864e5))) return "Yarın";
  if (k === dayKey(new Date(now.getTime() - 864e5))) return "Dün";
  return null;
}

/* ---------------------------------------------------------------- maç durumu */
function enrich(m) {
  m._t = new Date(m.start);
  return m;
}
function isFinished(m, now) {
  if (m.status === "finished") return true;
  if (m.status === "live") return false;
  return now - m._t > DURATION_MIN[m.sport] * 60000;
}
function isOngoing(m, now) { return !isFinished(m, now) && m._t <= now; }
function cmp(a, b) {
  return (a._t - b._t) || (SPORT_ORDER[a.sport] - SPORT_ORDER[b.sport]) ||
    a.home.localeCompare(b.home, "tr") || a.away.localeCompare(b.away, "tr");
}

/* ---------------------------------------------------------------- görünümler */
function select() {
  const now = new Date();
  const all = state.data ? state.data.matches : [];
  if (state.view === "today") {
    const lim = new Date(now.getTime() + 24 * 3600e3);
    return all.filter((m) => !isFinished(m, now) && m._t <= lim).sort(cmp);
  }
  if (state.view === "week") {
    return all.filter((m) => !isFinished(m, now))
      .filter((m) => state.sport === "all" || m.sport === state.sport)
      .filter((m) => state.league === "all" || m.league === state.league)
      .sort(cmp);
  }
  // Sonuçlar: bugün ve dün oynanan, bitmiş maçlar (dünküler bu gece 00:00'da kalkar)
  const keep = new Set([dayKey(now), dayKey(new Date(now.getTime() - 864e5))]);
  return all.filter((m) => isFinished(m, now) && keep.has(dayKey(m._t)))
    .sort((a, b) => (b._t - a._t) || cmp(a, b));
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function channelsHtml(m) {
  if (!m.channels || !m.channels.length) return `<div class="noch">Yayın bilgisi henüz yok</div>`;
  return m.channels.map((c) => {
    const pl = (c.platforms || []).map((p) => esc(p.no ? `${p.name} ${p.no}` : p.name)).join(" · ");
    return `<div class="ch"><b>${esc(c.name)}</b>${pl ? ` <span class="pl">— ${pl}</span>` : ""}</div>`;
  }).join("");
}

function card(m, now, showDate) {
  const ongoing = isOngoing(m, now);
  const finished = isFinished(m, now);
  const sc = m.score;
  const hasScore = sc && sc.home != null && sc.away != null;
  let hw = "", aw = "";
  if (hasScore && finished) {
    const h = +sc.home, a = +sc.away;
    if (h > a) hw = " w"; else if (a > h) aw = " w";
  }
  const tags = [];
  if (m.status === "live" || ongoing) tags.push(`<span class="tag live">${m.status === "live" ? "CANLI" : "BAŞLADI"}</span>`);
  if (finished) tags.push(`<span class="tag">${hasScore ? "MS" : "Bitti"}</span>`);
  tags.push(`<span>${esc(m.league)}</span>`);
  if (m.national) tags.push(`<span class="tag">🇹🇷 A Milli</span>`);
  if (m.women && !/kad[ıi]n|sultan/i.test(m.league)) tags.push(`<span class="tag">Kadınlar</span>`);

  const dLabel = showDate ? (relDay(m._t) || fmtShort.format(m._t)) : "";
  const scoreCell = (v, cls) => `<span class="sc${cls}">${hasScore ? esc(v) : ""}</span>`;
  const resultNote = "";  // Basketbol/voleybolda skor gösterilmiyor; sadece "Bitti" etiketi

  return `<article class="card${m.status === "live" || ongoing ? " live" : ""}">
    <div class="time">
      <div class="hm">${fmtHM.format(m._t)}</div>
      ${dLabel ? `<div class="d">${esc(dLabel)}</div>` : ""}
      <div class="ic" title="${SPORT_NAME[m.sport]}">${SPORT_ICON[m.sport]}</div>
    </div>
    <div>
      <div class="meta">${tags.join("")}</div>
      <div class="teams">
        <span class="${hw.trim()}">${esc(m.home)}</span>${scoreCell(sc && sc.home, hw)}
        <span class="${aw.trim()}">${esc(m.away)}</span>${scoreCell(sc && sc.away, aw)}
      </div>
      ${finished ? resultNote : channelsHtml(m)}
      ${m.note ? `<div class="noch">${esc(m.note)}</div>` : ""}
    </div>
  </article>`;
}

function render() {
  const list = $("#list");
  const now = new Date();
  $("#filters").hidden = state.view !== "week";
  if (!state.data) {
    list.innerHTML = `<div class="empty"><span class="big">⏳</span>Yükleniyor…</div>`;
    return;
  }
  const items = select();
  if (!items.length) {
    const msg = { today: "Önümüzdeki 24 saatte kapsamdaki bir maç yok.", week: "Bu seçimle eşleşen maç yok.", results: "Dün ve bugün biten maç yok." }[state.view];
    list.innerHTML = `<div class="empty"><span class="big">📭</span>${msg}</div>`;
    return;
  }
  let html = "";
  if (state.view === "today") {
    html = items.map((m) => card(m, now, true)).join("");
  } else {
    let last = "";
    for (const m of items) {
      const k = dayKey(m._t);
      if (k !== last) {
        const r = relDay(m._t);
        html += `<h2 class="day">${esc((r ? r + " · " : "") + fmtLong.format(m._t))}</h2>`;
        last = k;
      }
      html += card(m, now, false);
    }
  }
  list.innerHTML = html;
}

function renderLeagues() {
  const sel = $("#league-select");
  const leagues = [...new Set((state.data?.matches || [])
    .filter((m) => state.sport === "all" || m.sport === state.sport)
    .map((m) => m.league))].sort((a, b) => a.localeCompare(b, "tr"));
  if (!leagues.includes(state.league)) state.league = "all";
  sel.innerHTML = `<option value="all">Tüm ligler</option>` +
    leagues.map((l) => `<option${l === state.league ? " selected" : ""}>${esc(l)}</option>`).join("");
}

function renderUpdated() {
  if (!state.data) return;
  const g = new Date(state.data.generated_at);
  const txt = `Son güncelleme: ${relDay(g) ? relDay(g) + " " : fmtShort.format(g) + " "}${fmtHM.format(g)}`;
  $("#updated").textContent = txt;
  $("#foot-updated").textContent = txt;
}

/* ---------------------------------------------------------------- veri */
async function load() {
  if (state.loading) return;
  state.loading = true;
  $("#btn-refresh").classList.add("spin");
  try {
    const r = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    d.matches.forEach(enrich);
    state.data = d;
    renderLeagues();
    renderUpdated();
  } catch (e) {
    if (!state.data) $("#list").innerHTML = `<div class="empty"><span class="big">⚠️</span>Veri yüklenemedi. İnternet bağlantını kontrol edip ↻ ile tekrar dene.</div>`;
    $("#updated").textContent = "Güncellenemedi — çevrimdışı olabilir";
    state.loading = false;
    $("#btn-refresh").classList.remove("spin");
    return;
  }
  state.loading = false;
  $("#btn-refresh").classList.remove("spin");
  render();
}

/* ---------------------------------------------------------------- tema */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set("mr-theme", t);
  document.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-pressed", b.dataset.theme === t));
  const head = getComputedStyle(document.documentElement).getPropertyValue("--head").trim();
  if (head) document.querySelector('meta[name="theme-color"]').setAttribute("content", head);
}
function applySize(s) {
  document.documentElement.dataset.size = s;
  store.set("mr-size", s);
  document.querySelectorAll("#size-chips .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.size === s));
}

/* ---------------------------------------------------------------- olaylar */
function init() {
  $("#version").textContent = VERSION;
  $("#theme-grid").innerHTML = THEMES.map(([id, name, a, b]) =>
    `<button type="button" class="swatch" data-theme="${id}" aria-pressed="false">
       <span class="dots"><i style="background:${a}"></i><i style="background:${b}"></i></span>${name}</button>`).join("");
  $("#theme-grid").addEventListener("click", (e) => { const b = e.target.closest(".swatch"); if (b) applyTheme(b.dataset.theme); });
  $("#size-chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) applySize(b.dataset.size); });
  applyTheme(store.get("mr-theme", "auto"));
  applySize(store.get("mr-size", "normal"));

  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.view;
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    render();
    window.scrollTo({ top: 0 });
  }));
  $("#sport-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.sport = b.dataset.sport;
    document.querySelectorAll("#sport-chips .chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderLeagues(); render();
  });
  $("#league-select").addEventListener("change", (e) => { state.league = e.target.value; render(); });
  $("#btn-refresh").addEventListener("click", load);
  $("#btn-theme").addEventListener("click", () => $("#dlg-theme").showModal());
  $("#btn-about").addEventListener("click", () => $("#dlg-about").showModal());
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  // Otomatik yenileme: veri 10 dakikada bir, ekran her dakika
  setInterval(() => { if (document.visibilityState === "visible") load(); }, 10 * 60e3);
  setInterval(() => { if (document.visibilityState === "visible") { render(); renderUpdated(); } }, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });

  render();
  load();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
init();
