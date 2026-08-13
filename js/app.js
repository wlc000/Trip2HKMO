const FILTERS = ["香港", "澳门"];

const grid = document.getElementById("spot-grid");
const filtersEl = document.getElementById("filters");
const dayTabsEl = document.getElementById("day-tabs");
const planTableEl = document.getElementById("plan-table");
const modal = document.getElementById("modal");

let filter = "香港";
const liked = new Set(JSON.parse(localStorage.getItem("liked-spots") || "[]"));

function stars(n) {
  return "●".repeat(n) + "○".repeat(5 - n);
}

function matches(spot) {
  if (filter === "澳门") return spot.city === "mo";
  return spot.city === "hk";
}

function renderFilters() {
  filtersEl.innerHTML = FILTERS.map(
    (name) => `<button class="chip${name === filter ? " is-on" : ""}" data-filter="${name}">${name}</button>`
  ).join("");
}

function xhsUrl(keyword) {
  return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;
}

function beatXhs(beat) {
  if (beat.xhs) return beat.xhs;
  if (beat.spotId) {
    const spot = TRIP.spots.find((s) => s.id === beat.spotId);
    if (spot && spot.xhs && spot.xhs[0]) return spot.xhs[0];
  }
  return "";
}

function renderSpots() {
  const spots = TRIP.spots.filter(matches);
  grid.innerHTML = spots
    .map((spot) => {
      return `
        <button class="spot-card" data-id="${spot.id}">
          <div class="thumb" style="background:${spot.fallback}">
            <div class="thumb-mark">小红书实拍</div>
            <div class="badge-row">
              <span class="badge">${spot.city === "hk" ? "香港" : "澳门"}</span>
              <span class="badge gold">${spot.area}</span>
            </div>
          </div>
          <div class="spot-body">
            <div class="en">${spot.en}</div>
            <h3>${spot.name}</h3>
            <p style="margin:0;color:var(--ink-soft);font-size:14px;">建议停留 ${spot.duration}</p>
          </div>
        </button>`;
    })
    .join("");
}

const TYPE_LABEL = { spot: "景点", commute: "通勤", meal: "吃饭", hotel: "酒店" };
let planDay = 1;
let activeBeatId = "";
let planMap = null;
let planLayer = null;
let planLine = null;
let planMarkers = {};

function currentDay() {
  return TRIP.days.find((d) => d.id === planDay) || TRIP.days[0];
}

function beatLatLng(beat) {
  if (beat.spotId) {
    const spot = TRIP.spots.find((s) => s.id === beat.spotId);
    if (spot) return [spot.lat, spot.lng];
  }
  if (beat.lat != null && beat.lng != null) return [beat.lat, beat.lng];
  return null;
}

function renderDayTabs() {
  dayTabsEl.innerHTML = TRIP.days
    .map(
      (day) =>
        `<button class="chip${day.id === planDay ? " is-on" : ""}" data-plan-day="${day.id}">DAY ${String(day.id).padStart(2, "0")} · ${day.title}</button>`
    )
    .join("");
}

function renderDayOverview() {
  const el = document.getElementById("day-overview");
  if (!el) return;
  const day = currentDay();
  const prep = day.prep || [];
  el.innerHTML = `
    <div class="day-nodes">
      <div class="day-node"><span class="k">从哪出发</span><strong>${day.from || "—"}</strong></div>
      <div class="day-node"><span class="k">当天去哪</span><strong>${day.where || "—"}</strong></div>
      <div class="day-node"><span class="k">晚上住哪</span><strong>${day.stay || "—"}</strong></div>
    </div>
    <p class="day-path">${day.path || ""}</p>
    ${
      prep.length
        ? `<div class="day-prep">
        <h4>当天要提前准备</h4>
        <ul>
          ${prep
            .map(
              (p) =>
                `<li><span class="need">${p.need}</span>${p.item}${
                  p.xhs
                    ? ` <a class="xhs-inline" href="${xhsUrl(p.xhs)}" target="_blank" rel="noreferrer" data-xhs>小红书</a>`
                    : ""
                }</li>`
            )
            .join("")}
        </ul>
      </div>`
        : ""
    }
  `;
}

function renderPrepDays() {
  const el = document.getElementById("prep-days");
  if (!el) return;
  el.innerHTML = TRIP.days
    .map((day) => {
      const prep = day.prep || [];
      return `
        <article class="guide-card">
          <h3>DAY ${String(day.id).padStart(2, "0")} · ${day.title}</h3>
          <p>住 ${day.stay || "—"}。${day.path || ""}</p>
          <ul>
            ${prep
              .map(
                (p) =>
                  `<li><strong>${p.need}</strong> — ${p.item}${
                    p.xhs
                      ? ` <a class="xhs-inline" href="${xhsUrl(p.xhs)}" target="_blank" rel="noreferrer">小红书</a>`
                      : ""
                  }</li>`
              )
              .join("")}
          </ul>
        </article>`;
    })
    .join("");
}

function renderPlanTable() {
  const day = currentDay();
  planTableEl.innerHTML = `
    <thead>
      <tr><th>时间</th><th>类型</th><th>内容</th></tr>
    </thead>
    <tbody>
      ${day.beats
        .map(
          (b) => `
        <tr class="plan-row ${b.type}${b.id === activeBeatId ? " is-on" : ""}" data-beat="${b.id}">
          <td class="plan-time">${b.time}</td>
          <td><span class="kind kind-${b.type}">${TYPE_LABEL[b.type]}</span></td>
          <td>${b.name}${
            beatXhs(b)
              ? ` <a class="xhs-inline" href="${xhsUrl(beatXhs(b))}" target="_blank" rel="noreferrer" data-xhs>小红书</a>`
              : ""
          }</td>
        </tr>`
        )
        .join("")}
    </tbody>`;
}

function planIcon(beat, index, on) {
  const n = index + 1;
  return L.divIcon({
    className: "",
    html: `<div class="plan-pin ${beat.type}${on ? " is-on" : ""}"><span></span><b>${n}</b></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32]
  });
}

function renderPlanMap(mode) {
  if (!planMap) return;
  const day = currentDay();
  planLayer.clearLayers();
  planMarkers = {};
  const pts = [];
  day.beats.forEach((beat, i) => {
    const ll = beatLatLng(beat);
    if (!ll) return;
    pts.push(ll);
    const on = beat.id === activeBeatId;
    const marker = L.marker(ll, { icon: planIcon(beat, i, on), zIndexOffset: on ? 600 : 0 });
    marker.bindPopup(`<strong>${beat.time}</strong><br>${beat.name}`);
    marker.on("click", () => focusBeat(beat.id, true));
    marker.addTo(planLayer);
    planMarkers[beat.id] = marker;
  });
  if (planLine) planMap.removeLayer(planLine);
  planLine = null;
  if (pts.length > 1) {
    planLine = L.polyline(pts, { color: "#b85c38", weight: 3, opacity: 0.55, dashArray: "7 7" }).addTo(planMap);
  }
  const active = day.beats.find((b) => b.id === activeBeatId);
  const activeLl = active ? beatLatLng(active) : null;
  if (mode === "focus" && activeLl) {
    planMap.flyTo(activeLl, Math.max(planMap.getZoom() || 14, 15), { duration: 0.45 });
    const m = planMarkers[activeBeatId];
    if (m) m.openPopup();
  } else if (pts.length) {
    planMap.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 14 });
  }
  requestAnimationFrame(() => planMap.invalidateSize());
}

function focusBeat(id, scroll) {
  activeBeatId = id;
  renderPlanTable();
  renderPlanMap("focus");
  if (scroll) {
    const row = planTableEl.querySelector(`[data-beat="${id}"]`);
    if (row) row.scrollIntoView({ block: "nearest" });
  }
}

function renderDays() {
  const day = currentDay();
  if (!activeBeatId || !day.beats.some((b) => b.id === activeBeatId)) {
    activeBeatId = day.beats[0].id;
  }
  renderDayTabs();
  renderDayOverview();
  renderPlanTable();
  renderPlanMap("day");
}

function initPlanMap() {
  planMap = L.map("plan-map", {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([22.28, 114.16], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(planMap);
  planLayer = L.layerGroup().addTo(planMap);
  planMap.on("click", () => planMap.scrollWheelZoom.enable());
  planMap.on("mouseout", () => planMap.scrollWheelZoom.disable());
  renderPlanMap();
}

function syncPlanMap() {
  if (typeof L === "undefined") return;
  const run = () => {
    if (!planMap) initPlanMap();
    else {
      planMap.invalidateSize();
      renderPlanMap();
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function openSpot(id) {
  const spot = TRIP.spots.find((s) => s.id === id);
  if (!spot) return;
  const saved = liked.has(spot.id);
  const keywords = spot.xhs || [];
  modal.hidden = false;
  modal.classList.add("is-open");
  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-xhs">
        <div class="xhs-kicker">小红书实拍</div>
        <p>笔记图不能直接嵌进页面。点关键词，打开小红书看最新实拍和机位。</p>
        <div class="xhs-chips">
          ${keywords
            .map(
              (kw) =>
                `<a href="${xhsUrl(kw)}" target="_blank" rel="noreferrer">${kw}</a>`
            )
            .join("")}
        </div>
      </div>
      <div class="sheet-body">
        <button class="close" type="button" data-close>×</button>
        <div class="en">${spot.city === "hk" ? "Hong Kong" : "Macao"} · ${spot.area}</div>
        <h2>${spot.name}</h2>
        <p style="margin:0;color:var(--muted);">${spot.en}</p>
        <dl>
          <dt>进入</dt><dd>${spot.enter}</dd>
          <dt>时长</dt><dd>${spot.duration}</dd>
          <dt>注意</dt><dd>${spot.note}</dd>
        </dl>
        <div class="actions">
          <button class="btn primary" data-like="${spot.id}">${saved ? "已收藏" : "收藏这个机位"}</button>
          ${
            keywords[0]
              ? `<a class="btn ghost" target="_blank" rel="noreferrer" href="${xhsUrl(keywords[0])}">打开小红书</a>`
              : ""
          }
          <a class="btn ghost" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.map)}">打开地图</a>
        </div>
      </div>
    </div>`;
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.hidden = true;
  modal.innerHTML = "";
}

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  filter = btn.dataset.filter;
  if (filter === "香港") mapCity = "hk";
  if (filter === "澳门") mapCity = "mo";
  renderFilters();
  renderSpots();
  renderMapCityFilters();
  renderMap();
});

grid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) openSpot(card.dataset.id);
});

modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.dataset.close !== undefined) closeModal();
  const like = e.target.closest("[data-like]");
  if (like) {
    const id = like.dataset.like;
    if (liked.has(id)) liked.delete(id);
    else liked.add(id);
    localStorage.setItem("liked-spots", JSON.stringify([...liked]));
    openSpot(id);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

const mapCityFiltersEl = document.getElementById("map-city-filters");
const atlasList = document.getElementById("atlas-list");
let mapCity = "hk";
let leafletMap = null;
let markerLayer = null;
let markersById = {};
let activeMapId = "";

function citySpots() {
  return TRIP.spots.filter((spot) => spot.city === mapCity);
}

function pinIcon(index, city) {
  return L.divIcon({
    className: "",
    html: `<div class="map-pin ${city}"><span></span><b>${index}</b></div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36]
  });
}

function renderMapCityFilters() {
  mapCityFiltersEl.innerHTML = ["hk", "mo"]
    .map(
      (city) =>
        `<button class="chip${city === mapCity ? " is-on" : ""}" data-map-city="${city}">${
          city === "hk" ? "香港机位" : "澳门机位"
        }</button>`
    )
    .join("");
}

function renderAtlasList(spots) {
  if (!spots.length) {
    atlasList.innerHTML = `<p style="margin:12px 8px;color:var(--muted);font-size:14px;">当前筛选下这座城市没有机位，试试换筛选或切到另一边。</p>`;
    return;
  }
  atlasList.innerHTML = spots
    .map(
      (spot, i) => `
      <button class="atlas-item ${spot.city}${spot.id === activeMapId ? " is-on" : ""}" data-map-id="${spot.id}">
        <span class="n">${i + 1}</span>
        <span>
          <h3>${spot.name}</h3>
          <small>${spot.area} · ${spot.en}</small>
        </span>
        <span class="day-tag">${spot.day ? `DAY ${spot.day}` : "可选"}</span>
      </button>`
    )
    .join("");
}

function popupHtml(spot) {
  return `
    <div class="map-pop">
      <strong>${spot.name}</strong>
      <em>${spot.en} · ${spot.area}</em>
      <span>建议 ${spot.duration}</span>
      <button type="button" data-open-spot="${spot.id}">查看详情</button>
    </div>`;
}

function fitToSpots(spots) {
  if (!spots.length) return;
  const bounds = L.latLngBounds(spots.map((s) => [s.lat, s.lng]));
  leafletMap.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
}

function renderMap() {
  if (!leafletMap) return;
  const spots = citySpots();
  markerLayer.clearLayers();
  markersById = {};
  spots.forEach((spot, i) => {
    const marker = L.marker([spot.lat, spot.lng], { icon: pinIcon(i + 1, spot.city) });
    marker.bindPopup(popupHtml(spot));
    marker.on("click", () => {
      activeMapId = spot.id;
      renderAtlasList(spots);
    });
    marker.addTo(markerLayer);
    markersById[spot.id] = marker;
  });
  renderAtlasList(spots);
  fitToSpots(spots);
  requestAnimationFrame(() => leafletMap.invalidateSize());
}

function focusSpot(id) {
  const spots = citySpots();
  const spot = spots.find((s) => s.id === id);
  if (!spot || !markersById[id]) return;
  activeMapId = id;
  renderAtlasList(spots);
  leafletMap.flyTo([spot.lat, spot.lng], Math.max(leafletMap.getZoom(), 16), { duration: 0.6 });
  markersById[id].openPopup();
}

function initMap() {
  leafletMap = L.map("leaflet-map", {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([22.28, 114.16], 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(leafletMap);

  markerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.on("click", () => leafletMap.scrollWheelZoom.enable());
  leafletMap.on("mouseout", () => leafletMap.scrollWheelZoom.disable());
  renderMap();
}

mapCityFiltersEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-map-city]");
  if (!btn) return;
  mapCity = btn.dataset.mapCity;
  filter = mapCity === "mo" ? "澳门" : "香港";
  activeMapId = "";
  renderFilters();
  renderSpots();
  renderMapCityFilters();
  renderMap();
});

atlasList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-map-id]");
  if (btn) focusSpot(btn.dataset.mapId);
});

dayTabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-plan-day]");
  if (!btn) return;
  planDay = Number(btn.dataset.planDay);
  activeBeatId = "";
  renderDays();
});

const noteJump = document.getElementById("note-jump");
if (noteJump) {
  noteJump.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-scroll]");
    if (!btn) return;
    const target = document.getElementById(btn.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

planTableEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-xhs]")) return;
  const row = e.target.closest("[data-beat]");
  if (row) focusBeat(row.dataset.beat, false);
});

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open-spot]");
  if (open) openSpot(open.dataset.openSpot);
});

renderFilters();
renderSpots();
renderDays();
renderPrepDays();
renderMapCityFilters();

const PANELS = ["plan", "spots", "atlas", "notes"];
const stage = document.querySelector(".stage");

function currentPanel() {
  const id = location.hash.replace("#", "");
  return PANELS.includes(id) ? id : "plan";
}

function syncMap() {
  if (typeof L === "undefined") {
    const box = document.getElementById("leaflet-map");
    if (box && !box.dataset.failed) {
      box.dataset.failed = "1";
      box.innerHTML = '<p style="padding:28px;color:#7a7268;">地图脚本没有加载出来，刷新页面或检查网络后再试。</p>';
    }
    return;
  }
  const run = () => {
    if (!leafletMap) initMap();
    else {
      leafletMap.invalidateSize();
      renderMap();
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function showPanel(id, push) {
  if (!PANELS.includes(id)) id = "plan";
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-on", panel.id === id);
  });
  document.querySelectorAll("[data-panel]").forEach((el) => {
    el.classList.toggle("is-on", el.dataset.panel === id);
  });
  if (stage) stage.scrollTop = 0;
  if (push && location.hash !== "#" + id) {
    history.pushState({ panel: id }, "", "#" + id);
  }
  if (id === "atlas") syncMap();
  if (id === "plan") syncPlanMap();
}

document.querySelector(".app").addEventListener("click", (e) => {
  const link = e.target.closest("[data-panel]");
  if (!link) return;
  e.preventDefault();
  showPanel(link.dataset.panel, true);
});

window.addEventListener("popstate", () => showPanel(currentPanel(), false));

showPanel(currentPanel(), false);
