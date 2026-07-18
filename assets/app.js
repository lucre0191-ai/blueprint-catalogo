/* ======================================================================
   BLUEPRINT OS — app.js
   Lee /data/*.json (generados por scripts/export_to_json.py) y arma el
   catalogo. No hay datos escritos a mano aqui: si un JSON viene vacio,
   la seccion correspondiente lo dice explicitamente en vez de inventar
   contenido.
   ====================================================================== */

const DATA_FILES = ["catalogs", "kits", "config", "comparador"];

const PLACEHOLDER_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
    <rect x="3" y="4" width="18" height="13" rx="1"/>
    <path d="M3 8h18M7 4v13M17 4v13"/>
    <path d="M12 17v3M9 20h6"/>
  </svg>`;

const ICONS = {
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.1a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20.1Zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.7-1.2-1.5-1.4-1.7-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.1 1.6 2.5 3.9 3.4.5.2 1 .4 1.3.5.5.2 1 .1 1.4.1.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/></svg>`,
  pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v5M13 12v5M13 12h1.3a1.3 1.3 0 0 1 0 5H13"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.7 15.8 6.3M8.2 13.3l7.6 4.4"/></svg>`,
};

function waDigits(raw) {
  return (raw || "").replace(/[^\d]/g, "");
}

function buildInquiryText(catalog, kit) {
  const price = kit ? `$${fmtUSD(kit.Precio_Sugerido_Reventa_USD)} USD` : "precio a confirmar";
  return (
    `Hola, me interesa el ${catalog.Nombre_Comercial} (${catalog.Mercado}). ` +
    `Vi que ronda ${price}. ¿Me pueden dar mas detalles?`
  );
}

function whatsappLink(number, text) {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}


async function loadData() {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      try {
        const res = await fetch(`data/${name}.json`);
        if (!res.ok) throw new Error(res.status);
        return [name, await res.json()];
      } catch (err) {
        console.warn(`No se pudo cargar data/${name}.json`, err);
        return [name, null];
      }
    })
  );
  return Object.fromEntries(entries);
}

function fmtUSD(n) {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function kitImage(url, label) {
  if (!url) return `<div class="placeholder">${PLACEHOLDER_ICON}<span>Imagen pendiente</span></div>`;
  return `<img src="${url}" alt="${label}" loading="lazy"
    onerror="this.parentElement.innerHTML = '<div class=&quot;placeholder&quot;>${PLACEHOLDER_ICON.replace(/"/g, '&quot;')}<span>Imagen pendiente</span></div>'">`;
}

function renderStats(catalogs, kits) {
  const el = document.getElementById("hero-stats");
  const markets = new Set((catalogs || []).map((c) => c.Mercado));
  const kw = (kits || []).reduce((sum, k) => sum + (k.Potencia_Panel_kW || 0), 0);
  el.innerHTML = `
    <div class="stat"><span class="n">${kits ? kits.length : "—"}</span><span class="l">Kits activos</span></div>
    <div class="stat"><span class="n">${markets.size || "—"}</span><span class="l">Mercados</span></div>
    <div class="stat"><span class="n">${kw ? kw.toFixed(1) : "—"}</span><span class="l">kW en catalogo</span></div>
  `;
}

function renderMarketTabs(orderedMarkets, onChange) {
  const wrap = document.getElementById("market-tabs");
  if (orderedMarkets.length <= 1) { wrap.style.display = "none"; return orderedMarkets[0]; }

  wrap.innerHTML = orderedMarkets
    .map((m, i) => `<button data-market="${m}" class="${i === 0 ? "active" : ""}">${m}</button>`)
    .join("");

  wrap.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.market);
    });
  });
  return orderedMarkets[0];
}

function kitCard(catalog, kit, config) {
  const feed = (catalog.Que_Puede_Alimentar || "")
    .replace(/^Puede alimentar\s*/i, "")
    .replace(/\.$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const waHref = config?.WhatsApp_Ventas
    ? whatsappLink(config.WhatsApp_Ventas, buildInquiryText(catalog, kit))
    : null;

  return `
    <article class="kit-card" data-catalog-id="${catalog.ID_Catalogo}">
      <div class="kit-media">
        ${kitImage(catalog.Imagen_Principal, catalog.Nombre_Comercial)}
        <span class="kit-category">${catalog.Categoria || "Kit"}</span>
      </div>
      <div class="kit-body">
        <h3 class="kit-title">${catalog.Titulo || catalog.Nombre_Comercial}</h3>
        <div class="kit-name">${catalog.Nombre_Comercial}</div>
        <p class="kit-sub">${catalog.Subtitulo || catalog.Descripcion_Corta || ""}</p>
        ${feed.length ? `<ul class="kit-feed">${feed.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
        <div class="kit-specs">
          <div class="cell"><span class="v">${kit ? kit.Potencia_Panel_kW : "—"}</span><span class="k">kW panel</span></div>
          <div class="cell"><span class="v">${kit ? kit.Potencia_Inversor_kW : "—"}</span><span class="k">kW inversor</span></div>
          <div class="cell"><span class="v">${kit ? kit.Bateria_kWh : "—"}</span><span class="k">kWh bateria</span></div>
        </div>
        <div class="kit-price">
          <span class="amount">$${fmtUSD(kit ? kit.Precio_Sugerido_Reventa_USD : null)}</span>
          <span class="currency">USD sugerido</span>
        </div>
        <div class="kit-actions">
          ${waHref
            ? `<a class="btn-whatsapp" href="${waHref}" target="_blank" rel="noopener">${ICONS.whatsapp}Solicitar por WhatsApp</a>`
            : `<span class="btn-whatsapp disabled" title="Falta WhatsApp_Ventas en SYSTEM_CONFIG">${ICONS.whatsapp}Solicitar</span>`}
          <div class="icon-actions">
            <button type="button" class="icon-btn" data-action="download-image" title="Descargar como imagen">${ICONS.image}</button>
            <button type="button" class="icon-btn" data-action="download-pdf" title="Descargar como PDF">${ICONS.pdf}</button>
            <button type="button" class="icon-btn" data-action="share" title="Compartir">${ICONS.share}</button>
          </div>
        </div>
      </div>
    </article>`;
}

function renderKits(catalogs, kitsById, market, config) {
  const grid = document.getElementById("kit-grid");
  const filtered = catalogs
    .filter((c) => c.Mercado === market)
    .sort((a, b) => (a.Orden || 0) - (b.Orden || 0));

  if (!filtered.length) {
    grid.innerHTML = `<div class="state-msg">
      Todavia no hay catalogos <strong>Listos</strong> o <strong>Publicados</strong> para ${market}.
      Revisa el Estado en <strong>CATALOGO_MASTER</strong>.
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map((c) => kitCard(c, kitsById.get(c.Kit_ID), config)).join("");
}

/* ---------- Exportar / compartir cada card ---------- */

function slug(text) {
  return (text || "kit")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function captureCard(cardEl) {
  if (typeof html2canvas === "undefined") {
    throw new Error("html2canvas no cargo (revisa conexion / CDN bloqueado)");
  }
  // Oculta la barra de acciones en la captura: no tiene sentido en la imagen exportada.
  const actions = cardEl.querySelector(".kit-actions");
  const prevDisplay = actions.style.display;
  actions.style.display = "none";
  try {
    return await html2canvas(cardEl, {
      backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg-surface") || "#121a2e",
      scale: 2,
      useCORS: true,
    });
  } finally {
    actions.style.display = prevDisplay;
  }
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function handleDownloadImage(cardEl, catalog) {
  try {
    const canvas = await captureCard(cardEl);
    downloadCanvas(canvas, `${slug(catalog.Nombre_Comercial)}.png`);
  } catch (err) {
    alert("No se pudo generar la imagen: " + err.message);
  }
}

async function handleDownloadPDF(cardEl, catalog) {
  try {
    if (!window.jspdf) throw new Error("jsPDF no cargo (revisa conexion / CDN bloqueado)");
    const canvas = await captureCard(cardEl);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const ratio = canvas.height / canvas.width;
    const w = pageW - 60;
    const h = w * ratio;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 30, 30, w, h);
    pdf.save(`${slug(catalog.Nombre_Comercial)}.pdf`);
  } catch (err) {
    alert("No se pudo generar el PDF: " + err.message);
  }
}

async function handleShare(cardEl, catalog, kit) {
  const text = buildInquiryText(catalog, kit);
  try {
    const canvas = await captureCard(cardEl);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], `${slug(catalog.Nombre_Comercial)}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: catalog.Nombre_Comercial, text });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: catalog.Nombre_Comercial, text });
      return;
    }
  } catch (err) {
    if (err.name === "AbortError") return; // el usuario cerro el dialogo de compartir
    console.warn("Share nativo fallo, uso respaldo:", err);
  }
  // Respaldo sin Web Share API: abre WhatsApp con el texto (el usuario elige a quien enviarlo).
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
}

function wireCardActions(catalogsById, kitsById) {
  document.getElementById("kit-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const cardEl = btn.closest(".kit-card");
    const catalog = catalogsById.get(cardEl.dataset.catalogId);
    const kit = kitsById.get(catalog.Kit_ID);
    if (btn.dataset.action === "download-image") handleDownloadImage(cardEl, catalog);
    if (btn.dataset.action === "download-pdf") handleDownloadPDF(cardEl, catalog);
    if (btn.dataset.action === "share") handleShare(cardEl, catalog, kit);
  });
}

function renderTech(comparador) {
  const grid = document.getElementById("tech-grid");
  if (!comparador) {
    grid.innerHTML = `<div class="state-msg">No se pudo cargar la biblioteca tecnica.</div>`;
    return;
  }
  const sections = [
    { key: "paneles_solares", label: "Paneles solares", unit: "W" },
    { key: "inversores", label: "Inversores", unit: "W" },
    { key: "baterias", label: "Baterias", unit: "W" },
  ];
  grid.innerHTML = sections
    .map(({ key, label, unit }) => {
      const rows = comparador[key] || [];
      if (!rows.length) return "";
      return `
        <div class="tech-block">
          <h3>${label}</h3>
          <span class="count">${rows.length} modelo${rows.length === 1 ? "" : "s"} en catalogo</span>
          <table class="tech-table">
            <thead><tr><th>Modelo</th><th>Marca</th><th>Potencia</th><th>Garantia</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `<tr>
                    <td>${r.Modelo || "—"}</td>
                    <td>${r.Marca || "—"}</td>
                    <td>${r.Potencia_W ? r.Potencia_W + unit : "—"}</td>
                    <td>${r.Garantia_Anios ? r.Garantia_Anios + " a." : "—"}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
    })
    .join("");
}

function renderHeaderMeta(config) {
  const el = document.getElementById("header-meta");
  if (!config) { el.innerHTML = ""; return; }
  const chips = [config.Mercado_Default, config.Moneda_Default, config.Idioma_Default].filter(Boolean);
  el.innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join("");
}

async function init() {
  const data = await loadData();
  const catalogs = data.catalogs || [];
  const kits = data.kits || [];
  const kitsById = new Map(kits.map((k) => [k.Kit_ID, k]));
  const catalogsById = new Map(catalogs.map((c) => [c.ID_Catalogo, c]));

  renderHeaderMeta(data.config);
  renderStats(data.catalogs, data.kits);
  renderTech(data.comparador);
  wireCardActions(catalogsById, kitsById);

  if (!catalogs.length) {
    document.getElementById("kit-grid").innerHTML = `<div class="state-msg">
      Todavia no hay catalogos publicados. Corre <strong>export_to_json.py</strong>
      despues de marcar kits como Listo en CATALOGO_MASTER.
    </div>`;
    document.getElementById("market-tabs").style.display = "none";
    return;
  }

  const uniqueMarkets = [...new Set(catalogs.map((c) => c.Mercado).filter(Boolean))];
  const defaultMarket = data.config?.Mercado_Default && uniqueMarkets.includes(data.config.Mercado_Default)
    ? data.config.Mercado_Default
    : uniqueMarkets[0];
  const orderedMarkets = [defaultMarket, ...uniqueMarkets.filter((m) => m !== defaultMarket)];

  const firstTab = renderMarketTabs(orderedMarkets, (market) => renderKits(catalogs, kitsById, market, data.config));
  renderKits(catalogs, kitsById, firstTab, data.config);
}

function runPowerOnSequence() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  document.body.classList.add("power-restoring");
  requestAnimationFrame(() => {
    setTimeout(() => document.body.classList.remove("power-restoring"), 900);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  runPowerOnSequence();
  init();
});
