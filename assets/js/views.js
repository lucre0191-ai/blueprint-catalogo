/* ======================================================================
   BLUEPRINT VIEWER 2.0 — views.js
   Una funcion de render por pantalla. Cada una recibe el mismo "ctx"
   (datos + indices + config + helpers) y devuelve HTML a partir de los
   JSON reales. Ninguna vista escribe un nombre de producto, precio o
   beneficio a mano: todo sale de /data/*.json.
   ====================================================================== */

import {
  clean, firstOf, fmtUSD, fmtNum, whatsappLink, escapeHtml, img,
  catalogFor, marketsFrom, includedComponents, optionalComponents,
  kitWarrantyYears, kitVisual, state,
} from "./core.js";
import { ICONS, PLACEHOLDER_ICON } from "./icons.js";
import { generateCommercialPDF, generateTechnicalPDF, shareCommercialPDF } from "./pdfgen.js";
import { termHint } from "./glossary.js";

const LINEA_ICON = {
  "Respaldo": "shield", "Continuidad": "bolt", "Autonomia": "battery",
  "Operacion Critica": "store", "Portatil": "suitcase",
};

function icon(name, cls = "") {
  return `<span class="ic ${cls}">${ICONS[name] || ""}</span>`;
}

function mediaImage(path, label, sizeClass = "") {
  if (!path) {
    return `<div class="media-ph ${sizeClass}">${PLACEHOLDER_ICON}<span>Imagen pendiente</span></div>`;
  }
  const safe = escapeHtml(path);
  const fallback = PLACEHOLDER_ICON.replace(/"/g, "&quot;");
  return `<img class="${sizeClass}" src="${safe}" alt="${escapeHtml(label || "")}" loading="lazy"
    onerror="this.outerHTML = '<div class=&quot;media-ph ${sizeClass}&quot;>${fallback}<span>Imagen pendiente</span></div>'">`;
}

/** Grilla de 2-3 fotos de componentes, para cuando el kit no tiene foto
 *  propia (ver kitVisual() en core.js). Siempre se ve como una grilla,
 *  nunca como una sola imagen a pantalla completa — la diferencia
 *  visual deja claro que son piezas del kit, no una foto oficial de el. */
function mediaMosaic(images, label, compact = false) {
  const tiles = images
    .map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(label || "")}" loading="lazy" onerror="this.style.visibility='hidden'">`)
    .join("");
  const tag = compact ? "" : `<span class="media-mosaic-tag">Componentes principales</span>`;
  return `<div class="media-mosaic count-${images.length}">${tiles}${tag}</div>`;
}

/** Elige entre foto propia, mosaico de componentes o placeholder — ver
 *  kitVisual() en core.js para la logica de que se muestra y por que.
 *  `compact` omite el rotulo del mosaico en tarjetas pequenas donde no
 *  entra con claridad (el listado de kits, por ejemplo). */
function kitMedia(catalog, label, sizeClass = "", compact = false) {
  const visual = kitVisual(catalog);
  if (visual.image) return mediaImage(visual.image, label, sizeClass);
  if (visual.mosaic.length) return mediaMosaic(visual.mosaic, label, compact);
  return mediaImage(null, label, sizeClass);
}

function buildInquiryText(name, market, price) {
  const priceTxt = price ? `$${price} USD` : "precio a confirmar";
  return `Hola, me interesa ${name}${market ? " (" + market + ")" : ""}. Vi que ronda ${priceTxt}. ¿Me pueden dar mas detalles?`;
}

function waButton(config, text, label = "Solicitar por WhatsApp") {
  const num = config && config.WhatsApp_Ventas;
  if (!num) return `<span class="btn btn-wa disabled">${icon("whatsapp")}Solicitar</span>`;
  return `<a class="btn btn-wa" href="${whatsappLink(num, text)}" target="_blank" rel="noopener">${icon("whatsapp")}${label}</a>`;
}

/* ---------------------------------------------------------------------
   Estadisticas globales (100% calculadas desde kits.json / catalogs.json,
   nunca escritas a mano).
   --------------------------------------------------------------------- */
function computeStats(idx) {
  const kits = idx.kits;
  const kw = kits.reduce((sum, k) => sum + (k.Potencia_Panel_kW || 0), 0);
  const markets = marketsFrom(idx.catalogs);
  const maxWarranty = Math.max(0, ...idx.products.map((p) => p.Garantia_Anios || 0));
  return { kitCount: kits.length, marketCount: markets.length, kw, maxWarranty };
}

/* =======================================================================
   TARJETAS REUTILIZABLES
   ======================================================================= */
function kitCard(idx, kit, catalogEntry, config) {
  const name = firstOf(catalogEntry && catalogEntry.Nombre_Comercial, kit.Nombre_Comercial);
  const title = firstOf(catalogEntry && catalogEntry.Titulo, name);
  const subtitle = firstOf(catalogEntry && catalogEntry.Subtitulo, catalogEntry && catalogEntry.Descripcion_Corta, kit.Cliente_Objetivo);
  const feedRaw = firstOf(catalogEntry && catalogEntry.Que_Puede_Alimentar, kit.Aplicaciones) || "";
  const feed = feedRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const price = fmtUSD(kit.Precio_Sugerido_Reventa_USD);
  const market = catalogEntry ? catalogEntry.Mercado : null;

  return `
    <article class="kit-card" data-kit-id="${escapeHtml(kit.Kit_ID)}">
      <a class="kit-media" href="#/kit/${encodeURIComponent(kit.Kit_ID)}">
        ${kitMedia(catalogEntry, name, "cover", true)}
        <span class="pill pill-dark">${escapeHtml(kit.Linea || "Kit")}</span>
      </a>
      <div class="kit-body">
        <h3 class="kit-title"><a href="#/kit/${encodeURIComponent(kit.Kit_ID)}">${escapeHtml(title)}</a></h3>
        ${subtitle ? `<p class="kit-sub">${escapeHtml(subtitle)}</p>` : ""}
        ${feed.length ? `<ul class="tag-list">${feed.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
        <div class="kit-specs">
          <div class="cell"><span class="v">${fmtNum(kit.Potencia_Panel_kW)}</span><span class="k">kW panel${termHint("panel")}</span></div>
          <div class="cell"><span class="v">${fmtNum(kit.Potencia_Inversor_kW)}</span><span class="k">kW inversor${termHint("inversor")}</span></div>
          <div class="cell"><span class="v">${fmtNum(kit.Bateria_kWh)}</span><span class="k">kWh bateria${termHint("bateria")}</span></div>
        </div>
        <div class="kit-foot">
          <div class="kit-price">${price ? `<span class="amount">$${price}</span><span class="cur">USD sugerido</span>` : `<span class="amount muted">Consultar</span>`}</div>
          <a class="btn btn-ghost btn-sm" href="#/kit/${encodeURIComponent(kit.Kit_ID)}">Ver solucion ${icon("arrowRight")}</a>
        </div>
      </div>
    </article>`;
}

function productCard(product, media) {
  const image = firstOf(media && media.Imagen_principal);
  return `
    <article class="prod-card">
      <a class="prod-media" href="#/producto/${encodeURIComponent(product.SKU)}">
        ${mediaImage(image, product.Nombre_Comercial_Tecnico, "cover")}
        <span class="pill pill-dark">${escapeHtml(product.Categoria || "")}</span>
      </a>
      <div class="prod-body">
        <h3 class="prod-title"><a href="#/producto/${encodeURIComponent(product.SKU)}">${escapeHtml(product.Nombre_Comercial_Tecnico || product.Modelo)}</a></h3>
        <p class="prod-sub">${escapeHtml(product.Marca || "")}${product.Subcategoria ? " · " + escapeHtml(product.Subcategoria) : ""}</p>
        <div class="prod-specs">
          ${product.Potencia_W ? `<span>${icon("bolt")}${product.Potencia_W} W</span>` : ""}
          ${product.Capacidad_kWh ? `<span>${icon("battery")}${product.Capacidad_kWh} kWh</span>` : ""}
          ${product.Garantia_Anios ? `<span>${icon("shield")}${product.Garantia_Anios} años</span>` : ""}
        </div>
        <a class="btn btn-ghost btn-sm" href="#/producto/${encodeURIComponent(product.SKU)}">Ver producto ${icon("arrowRight")}</a>
      </div>
    </article>`;
}

/* =======================================================================
   HOME
   ======================================================================= */
export function renderHome(ctx) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const market = state.market || config.Mercado_Default || marketsFrom(idx.catalogs)[0];
  const stats = computeStats(idx);

  const curated = idx.catalogs
    .filter((c) => c.Mercado === market && !String(c.ID_Catalogo || "").startsWith("AUTO-"))
    .sort((a, b) => (a.Orden || 999) - (b.Orden || 999));
  const featured = curated[0] || idx.catalogs.find((c) => c.Mercado === market) || idx.catalogs[0];
  const featuredKit = featured ? idx.kitsById.get(featured.Kit_ID) : null;

  const heroTitle = firstOf(featured && featured.Titulo, "Que el apagon no decida que se daña en tu casa");
  const heroLede = firstOf(
    featured && featured.Subtitulo,
    featured && featured.Descripcion_Corta,
    "Te ayudamos a elegir cuanto necesitas segun lo que de verdad queres mantener andando — la nevera, un ventilador, las luces de noche. Sin tecnicismos, sin adivinar."
  );

  const lineas = [...new Set(idx.kits.map((k) => k.Linea).filter(Boolean))];
  const destacados = (curated.length ? curated : idx.catalogs.filter((c) => c.Mercado === market)).slice(0, 3);

  const beneficiosRaw = curated
    .map((c) => c.Beneficios_Comerciales)
    .filter(Boolean)
    .flatMap((t) => t.split(".").map((s) => s.trim()).filter(Boolean));
  const beneficios = [...new Set(beneficiosRaw)].slice(0, 4);

  ctx.container.innerHTML = `
    <section class="hero">
      <div class="wrap hero-inner">
        <p class="eyebrow">${icon("bolt")}Energia solar explicada sin vueltas</p>
        <h1>${escapeHtml(heroTitle)}</h1>
        <p class="lede">${escapeHtml(heroLede)}</p>
        <form class="search-bar" id="home-search">
          <span class="sb-icon">${icon("search")}</span>
          <input type="search" placeholder="¿Que necesitas mantener prendido? Ej: nevera, ventilador, negocio..." aria-label="Buscar soluciones">
          <button type="submit" class="btn btn-primary">Buscar</button>
        </form>
        <div class="hero-stats">
          <div class="stat"><span class="n">${stats.kitCount}</span><span class="l">Soluciones listas</span></div>
          <div class="stat"><span class="n">${stats.marketCount || "—"}</span><span class="l">Mercados</span></div>
          <div class="stat"><span class="n">${fmtNum(stats.kw)}</span><span class="l">kW disponibles</span></div>
          <div class="stat"><span class="n">${stats.maxWarranty}</span><span class="l">Años de garantia</span></div>
        </div>
      </div>
    </section>

    <section class="section wrap">
      <div class="section-head"><div><h2>¿Que problema queres resolver?</h2><p class="desc">Desde un apagon que te agarra con los chicos en casa, hasta un negocio que no puede parar.</p></div></div>
      <div class="cat-grid">
        ${lineas.map((l) => `
          <a class="cat-card" href="#/kits" data-linea="${escapeHtml(l)}">
            <span class="icon-circle">${icon(LINEA_ICON[l] || "bolt")}</span>
            <span class="cat-name">${escapeHtml(l)}</span>
            <span class="cat-count">${idx.kits.filter((k) => k.Linea === l).length} solucion${idx.kits.filter((k) => k.Linea === l).length === 1 ? "" : "es"}</span>
          </a>`).join("")}
      </div>
    </section>

    <section class="section wrap">
      <div class="section-head">
        <div><h2>Las mas elegidas en ${escapeHtml(market || "tu zona")}</h2><p class="desc">Precio real, componentes reales — nada armado a ultimo momento.</p></div>
        <a class="btn btn-ghost" href="#/kits">Ver todas las soluciones ${icon("arrowRight")}</a>
      </div>
      <div class="kit-grid">
        ${destacados.length
          ? destacados.map((c) => kitCard(idx, idx.kitsById.get(c.Kit_ID) || {}, c, config)).join("")
          : `<div class="state-msg">Todavia no tenemos soluciones cargadas para ${escapeHtml(market || "esta zona")}. Escribinos y te ayudamos igual.</div>`}
      </div>
    </section>

    ${beneficios.length ? `
    <section class="section wrap">
      <div class="section-head"><div><h2>Por que elegir Blueprint</h2></div></div>
      <div class="benefit-grid">
        ${beneficios.map((b) => `<div class="benefit"><span class="icon-circle sm">${icon("check")}</span><p>${escapeHtml(b)}.</p></div>`).join("")}
      </div>
    </section>` : ""}

    <section class="quickband wrap">
      <a href="#/biblioteca">${icon("book")}Manuales y fichas tecnicas</a>
      <a href="#/comparador">${icon("scale")}Comparar equipos</a>
      <a href="#/catalogo">${icon("layers")}Ver todos los equipos</a>
      ${waButton(config, "Hola, no se cual solucion me conviene. ¿Me pueden ayudar a elegir?", "No se cual elegir — ayudenme")}
    </section>
  `;

  ctx.container.querySelector("#home-search").addEventListener("submit", (e) => {
    e.preventDefault();
    state.searchQuery = e.target.querySelector("input").value;
    location.hash = "#/kits";
  });
  ctx.container.querySelectorAll(".cat-card").forEach((a) => {
    a.addEventListener("click", () => { state.lineaFilter = a.dataset.linea; });
  });
}

/* =======================================================================
   KITS (catalogo comercial — kits.json + catalogs.json)
   ======================================================================= */
export function renderKits(ctx) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const markets = marketsFrom(idx.catalogs);
  if (!state.market) state.market = config.Mercado_Default && markets.includes(config.Mercado_Default) ? config.Mercado_Default : markets[0];
  const lineas = [...new Set(idx.kits.map((k) => k.Linea).filter(Boolean))];

  function rowsFor(market, linea, q) {
    let rows = idx.catalogs.filter((c) => c.Mercado === market);
    if (linea) rows = rows.filter((c) => (idx.kitsById.get(c.Kit_ID) || {}).Linea === linea);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((c) => {
        const kit = idx.kitsById.get(c.Kit_ID) || {};
        const hay = [c.Nombre_Comercial, c.Titulo, kit.Aplicaciones, kit.Cliente_Objetivo].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
    return rows.sort((a, b) => (a.Orden || 999) - (b.Orden || 999));
  }

  function paint() {
    const rows = rowsFor(state.market, state.lineaFilter, state.searchQuery);
    ctx.container.querySelector("#kits-grid").innerHTML = rows.length
      ? rows.map((c) => kitCard(idx, idx.kitsById.get(c.Kit_ID) || {}, c, config)).join("")
      : `<div class="state-msg">No encontramos soluciones con esos filtros para <strong>${escapeHtml(state.market || "")}</strong>. Probá con otra palabra o escribinos por WhatsApp.</div>`;
    ctx.container.querySelector("#kits-count").textContent = `${rows.length} solucion${rows.length === 1 ? "" : "es"} encontrada${rows.length === 1 ? "" : "s"}`;
  }

  ctx.container.innerHTML = `
    <section class="section wrap">
      <div class="section-head">
        <div><h2>Todas las soluciones</h2><p class="desc">El precio es orientativo y no incluye instalacion, salvo que se indique lo contrario.</p></div>
      </div>
      <div class="filter-bar">
        <div class="market-tabs" id="market-tabs">
          ${markets.map((m) => `<button class="${m === state.market ? "active" : ""}" data-market="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join("")}
        </div>
        <div class="chip-row" id="linea-chips">
          <button class="chip ${!state.lineaFilter ? "on" : ""}" data-linea="">Todas</button>
          ${lineas.map((l) => `<button class="chip ${state.lineaFilter === l ? "on" : ""}" data-linea="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join("")}
        </div>
        <form class="search-inline" id="kits-search">
          <span class="sb-icon">${icon("search")}</span>
          <input type="search" placeholder="Buscar por nombre o para que la queres..." value="${escapeHtml(state.searchQuery || "")}">
        </form>
        <span class="count" id="kits-count"></span>
      </div>
      <div class="kit-grid" id="kits-grid"></div>
    </section>
  `;

  paint();

  ctx.container.querySelectorAll("#market-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.market = btn.dataset.market;
      ctx.container.querySelectorAll("#market-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      paint();
    });
  });
  ctx.container.querySelectorAll("#linea-chips button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lineaFilter = btn.dataset.linea || null;
      ctx.container.querySelectorAll("#linea-chips button").forEach((b) => b.classList.toggle("on", b === btn));
      paint();
    });
  });
  ctx.container.querySelector("#kits-search").addEventListener("submit", (e) => e.preventDefault());
  ctx.container.querySelector("#kits-search input").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    paint();
  });
}

/* =======================================================================
   FICHA DE KIT (#/kit/:id)
   ======================================================================= */
export function renderKitDetail(ctx, params) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const kit = idx.kitsById.get(params.id);
  if (!kit) {
    ctx.container.innerHTML = `<div class="wrap section"><div class="state-msg">No encontramos el kit <strong>${escapeHtml(params.id)}</strong>.</div></div>`;
    return;
  }
  const market = state.market || config.Mercado_Default;
  const catalog = catalogFor(idx, kit.Kit_ID, market);
  const included = includedComponents(idx, kit.Kit_ID);
  const optional = optionalComponents(idx, kit.Kit_ID);
  const warranty = kitWarrantyYears(idx, kit.Kit_ID);
  const price = fmtUSD(kit.Precio_Sugerido_Reventa_USD);
  const name = firstOf(catalog && catalog.Nombre_Comercial, kit.Nombre_Comercial);
  const tagline = firstOf(catalog && catalog.Subtitulo, catalog && catalog.Descripcion_Corta, kit.Cliente_Objetivo);
  // La galeria SI puede mostrar fotos de componentes: aqui es honesto,
  // porque es literalmente "que trae el kit", no "una foto del kit".
  const gallery = [catalog && catalog.Imagen_Panel, catalog && catalog.Imagen_Inversor, catalog && catalog.Imagen_Bateria, ...included.map((c) => c.Imagen)]
    .map((p) => clean(p)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  const feedText = firstOf(catalog && catalog.Que_Puede_Alimentar, kit.Aplicaciones);
  const feed = feedText ? feedText.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const docs = [];
  included.forEach((c) => {
    const m = idx.mediaBySku.get(c.SKU);
    const b = idx.bibliotecaBySku.get(c.SKU);
    [["Datasheet", m && m.Datasheet], ["Manual", m && m.Manual], ["Catalogo", m && m.Catalogo],
     ["Certificados", m && m.Certificados], ["Video", m && m.Video],
     ["Datasheet", b && b.Datasheet_URL], ["Manual", b && b.Manual_URL],
     ["Certificados", b && b.Certificados_URL], ["Video", b && b.Video_URL]]
      .forEach(([label, url]) => { const u = clean(url); if (u) docs.push({ label, url: u, sku: c.SKU }); });
  });

  ctx.container.innerHTML = `
    <div class="crumb wrap"><a href="#/kits">Kits</a> ${icon("chevronRight")} <span>${escapeHtml(kit.Linea || "")}</span> ${icon("chevronRight")} <span class="on">${escapeHtml(name)}</span></div>

    <div class="wrap kit-top">
      <div class="gallery">
        <div class="gallery-main">${kitMedia(catalog, name, "cover")}</div>
        ${gallery.length ? `<div class="gallery-strip">${gallery.map((g) => mediaImage(g, name, "cover")).join("")}</div>` : ""}
      </div>
      <aside class="buy-card">
        <span class="pill">${escapeHtml(kit.Linea || "Kit")}</span>
        <h1>${escapeHtml(name)}</h1>
        ${tagline ? `<p class="tagline">${escapeHtml(tagline)}</p>` : ""}
        <div class="spec-grid">
          <div class="spec-item"><span class="k">${icon("panel")}Panel${termHint("panel")}</span><span class="v">${fmtNum(kit.Potencia_Panel_kW)} kW</span></div>
          <div class="spec-item"><span class="k">${icon("bolt")}Inversor${termHint("inversor")}</span><span class="v">${fmtNum(kit.Potencia_Inversor_kW)} kW</span></div>
          <div class="spec-item"><span class="k">${icon("battery")}Bateria${termHint("bateria")}</span><span class="v">${fmtNum(kit.Bateria_kWh)} kWh</span></div>
          <div class="spec-item"><span class="k">${icon("shield")}Garantia${termHint("garantia")}</span><span class="v">${warranty ? warranty + " años" : "—"}</span></div>
        </div>
        <div class="price-row">${price ? `<span class="amount">$${price}</span><span class="cur">USD sugerido</span>` : `<span class="amount muted">Precio a confirmar</span>`}</div>
        <div class="actions-col">
          ${waButton(config, buildInquiryText(name, market, price), "Solicitar por WhatsApp")}
          <button class="btn btn-ghost" id="btn-pdf-comercial">${icon("pdf")}Descargar Ficha Comercial (PDF)</button>
          <button class="btn btn-ghost" id="btn-pdf-tecnica">${icon("layers")}Descargar Especificacion Tecnica (PDF)</button>
          <button class="btn btn-ghost" id="btn-share">${icon("share")}Compartir</button>
        </div>
      </aside>
    </div>

    <div class="subnav wrap">
      <a href="#incluye">Que incluye</a><a href="#alimenta">Que puede alimentar</a>
      <a href="#autonomia">Autonomia</a>${optional.length ? `<a href="#ampliaciones">Ampliaciones</a>` : ""}${docs.length ? `<a href="#documentos">Documentos</a>` : ""}
    </div>

    <section class="section wrap two-col">
      <div id="incluye">
        <h3>Que incluye</h3>
        ${included.map((c) => `<div class="include-row">${icon("check")}<span>${c.Cantidad || 1}× ${escapeHtml(c.Descripcion || c.SKU)}</span></div>`).join("") || `<p class="muted">Sin datos de composicion.</p>`}
      </div>
      <div id="alimenta">
        <h3>Que puede alimentar</h3>
        ${feed.length
          ? `<div class="power-grid">${feed.map((f) => `<div class="power-item">${icon("bolt")}<span>${escapeHtml(f)}</span></div>`).join("")}</div>`
          : `<p class="muted">No hay detalle cargado para este kit todavia.</p>`}
        <h3 style="margin-top:28px">Autonomia${termHint("autonomia")}</h3>
        <p class="autonomy-text" id="autonomia">${escapeHtml(kit.Autonomia_Aprox || "Todavia no tenemos ese dato para este kit — preguntanos por WhatsApp y te lo confirmamos.")}</p>
      </div>
    </section>

    ${optional.length ? `
    <section class="section wrap" id="ampliaciones">
      <h3>Opciones de ampliacion</h3>
      <p class="muted" style="margin:4px 0 18px">Componentes opcionales reales de este kit, no genericos.</p>
      <div class="upgrade-grid">
        ${optional.map((c) => `<div class="upgrade-card"><span class="icon-circle sm">${icon("bolt")}</span><h4>${escapeHtml(c.Descripcion || c.SKU)}</h4><p>${escapeHtml(c.Categoria || "")}${c.Potencia_W ? " · " + c.Potencia_W + " W" : ""}</p><a href="#/producto/${encodeURIComponent(c.SKU)}" class="btn btn-ghost btn-sm">Ver componente</a></div>`).join("")}
      </div>
    </section>` : ""}

    ${docs.length ? `
    <section class="section wrap" id="documentos">
      <h3>Documentos</h3>
      <div class="doc-list">
        ${docs.map((d) => `<a class="doc-row" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${icon("file")}<span>${escapeHtml(d.label)} — ${escapeHtml(d.sku)}</span>${icon("download")}</a>`).join("")}
      </div>
    </section>` : ""}

    <section class="cta-band wrap">
      <div><h3>¿Listo para tu independencia energetica?</h3><p class="muted">Un asesor tecnico te acompaña en todo el proceso.</p></div>
      ${waButton(config, buildInquiryText(name, market, price), "Solicitar cotizacion")}
    </section>
  `;

  const btnPdfComercial = ctx.container.querySelector("#btn-pdf-comercial");
  const btnPdfTecnica = ctx.container.querySelector("#btn-pdf-tecnica");
  const btnShare = ctx.container.querySelector("#btn-share");

  // Genera cada PDF en el momento a partir de los JSON — nunca es una
  // captura de pantalla, asi que un cambio futuro en el Excel se ve
  // reflejado automaticamente sin tocar este codigo.
  async function withBusyLabel(btn, busyText, task) {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = busyText;
    try {
      await task();
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  if (btnPdfComercial) {
    btnPdfComercial.addEventListener("click", () =>
      withBusyLabel(btnPdfComercial, "Generando…", () => generateCommercialPDF(idx, data, kit.Kit_ID, market))
    );
  }
  if (btnPdfTecnica) {
    btnPdfTecnica.addEventListener("click", () =>
      withBusyLabel(btnPdfTecnica, "Generando…", () => generateTechnicalPDF(idx, data, kit.Kit_ID, market))
    );
  }
  if (btnShare) {
    btnShare.addEventListener("click", () =>
      withBusyLabel(btnShare, "Preparando…", () => shareCommercialPDF(idx, data, kit.Kit_ID, market))
    );
  }
}

/* =======================================================================
   CATALOGO DE COMPONENTES (#/catalogo — products.json)
   ======================================================================= */
export function renderCatalogo(ctx) {
  const { idx } = ctx;
  const categorias = [...new Set(idx.products.map((p) => p.Categoria).filter(Boolean))].sort();
  const marcas = [...new Set(idx.products.map((p) => p.Marca).filter(Boolean))].sort();

  const filters = { categoria: "", marca: "", tipo: "", q: "" };

  function tiposFor(categoria) {
    return [...new Set(idx.products.filter((p) => !categoria || p.Categoria === categoria).map((p) => p.Subcategoria).filter(Boolean))].sort();
  }

  function apply() {
    let rows = idx.products;
    if (filters.categoria) rows = rows.filter((p) => p.Categoria === filters.categoria);
    if (filters.marca) rows = rows.filter((p) => p.Marca === filters.marca);
    if (filters.tipo) rows = rows.filter((p) => p.Subcategoria === filters.tipo);
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      rows = rows.filter((p) => [p.Nombre_Comercial_Tecnico, p.Modelo, p.Descripcion_Tecnica].filter(Boolean).join(" ").toLowerCase().includes(needle));
    }
    return rows;
  }

  function paint() {
    const rows = apply();
    ctx.container.querySelector("#cat-grid").innerHTML = rows.length
      ? rows.map((p) => productCard(p, idx.mediaBySku.get(p.SKU))).join("")
      : `<div class="state-msg">Ningun componente coincide con esos filtros.</div>`;
    ctx.container.querySelector("#cat-count").textContent = `${rows.length} componente${rows.length === 1 ? "" : "s"}`;
    const tipoSelect = ctx.container.querySelector("#f-tipo");
    tipoSelect.innerHTML = `<option value="">Tipo / subcategoria</option>` + tiposFor(filters.categoria).map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    tipoSelect.value = filters.tipo;
  }

  ctx.container.innerHTML = `
    <section class="section wrap">
      <div class="section-head"><div><h2>Cada pieza, por separado</h2><p class="desc">Paneles, inversores, baterias y accesorios — para quien ya sabe lo que busca, o quiere entender que trae cada solucion por dentro.</p></div></div>
      <div class="filter-bar">
        <select id="f-categoria"><option value="">Categoria</option>${categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>
        <select id="f-marca"><option value="">Marca</option>${marcas.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}</select>
        <select id="f-tipo"></select>
        <form class="search-inline" id="cat-search"><span class="sb-icon">${icon("search")}</span><input type="search" placeholder="Buscar modelo..."></form>
        <span class="count" id="cat-count"></span>
      </div>
      <div class="grid-products" id="cat-grid"></div>
    </section>
  `;

  paint();
  ctx.container.querySelector("#f-categoria").addEventListener("change", (e) => { filters.categoria = e.target.value; filters.tipo = ""; paint(); });
  ctx.container.querySelector("#f-marca").addEventListener("change", (e) => { filters.marca = e.target.value; paint(); });
  ctx.container.querySelector("#f-tipo").addEventListener("change", (e) => { filters.tipo = e.target.value; paint(); });
  ctx.container.querySelector("#cat-search").addEventListener("submit", (e) => e.preventDefault());
  ctx.container.querySelector("#cat-search input").addEventListener("input", (e) => { filters.q = e.target.value; paint(); });
}

/* =======================================================================
   FICHA DE PRODUCTO (#/producto/:sku)
   ======================================================================= */
export function renderProductDetail(ctx, params) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const product = idx.productsBySku.get(params.sku);
  if (!product) {
    ctx.container.innerHTML = `<div class="wrap section"><div class="state-msg">No encontramos el producto <strong>${escapeHtml(params.sku)}</strong>.</div></div>`;
    return;
  }
  const media = idx.mediaBySku.get(product.SKU);
  const showcase = idx.showcaseBySku.get(product.SKU);
  const biblio = idx.bibliotecaBySku.get(product.SKU);
  const gallery = [media && media.Imagen_principal, media && media.Imagen_2, media && media.Imagen_3].map(clean).filter(Boolean);
  const related = idx.products.filter((p) => p.Categoria === product.Categoria && p.SKU !== product.SKU).slice(0, 4);

  const docs = [];
  [["Datasheet", media && media.Datasheet], ["Manual", media && media.Manual], ["Catalogo", media && media.Catalogo],
   ["Certificados", media && media.Certificados], ["Video", media && media.Video],
   ["Datasheet", biblio && biblio.Datasheet_URL], ["Manual", biblio && biblio.Manual_URL],
   ["Certificados", biblio && biblio.Certificados_URL], ["Video", biblio && biblio.Video_URL]]
    .forEach(([label, url]) => { const u = clean(url); if (u) docs.push({ label, url: u }); });

  const specs = [
    ["Marca", product.Marca], ["Fabricante", product.Fabricante], ["Modelo", product.Modelo],
    ["Potencia", product.Potencia_W ? product.Potencia_W + " W" : null],
    ["Capacidad", product.Capacidad_kWh ? product.Capacidad_kWh + " kWh" : null],
    ["Voltaje", clean(product.Voltaje)], ["Garantia", product.Garantia_Anios ? product.Garantia_Anios + " años" : null],
    ["Peso", product.Peso_kg ? product.Peso_kg + " kg" : null], ["Dimensiones", clean(product.Dimensiones)],
    ["Lead time", clean(product.Lead_Time)],
  ].filter(([, v]) => v);

  ctx.container.innerHTML = `
    <div class="crumb wrap"><a href="#/catalogo">Catalogo</a> ${icon("chevronRight")} <span>${escapeHtml(product.Categoria || "")}</span> ${icon("chevronRight")} <span class="on">${escapeHtml(product.Nombre_Comercial_Tecnico || product.Modelo)}</span></div>
    <div class="wrap kit-top">
      <div class="gallery">
        <div class="gallery-main">${mediaImage(gallery[0], product.Nombre_Comercial_Tecnico, "cover")}</div>
        ${gallery.length > 1 ? `<div class="gallery-strip">${gallery.slice(1).map((g) => mediaImage(g, product.Nombre_Comercial_Tecnico, "cover")).join("")}</div>` : ""}
      </div>
      <aside class="buy-card">
        <span class="pill">${escapeHtml(product.Categoria || "")}</span>
        <h1>${escapeHtml(product.Nombre_Comercial_Tecnico || product.Modelo)}</h1>
        <p class="tagline">${escapeHtml(showcase && showcase.Beneficios ? showcase.Beneficios : product.Descripcion_Tecnica || "")}</p>
        ${waButton(config, `Hola, quiero mas informacion sobre ${product.Nombre_Comercial_Tecnico || product.Modelo} (${product.SKU}).`, "Consultar por WhatsApp")}
      </aside>
    </div>

    <section class="section wrap two-col">
      <div>
        <h3>Especificaciones</h3>
        <table class="spec-table">${specs.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
      </div>
      <div>
        ${showcase && showcase.Problema_que_Resuelve ? `<h3>Que problema resuelve</h3><p class="muted">${escapeHtml(showcase.Problema_que_Resuelve)}</p>` : ""}
        ${showcase && showcase.Tipo_Cliente_Recomendado ? `<h3 style="margin-top:20px">Recomendado para</h3><p class="muted">${escapeHtml(showcase.Tipo_Cliente_Recomendado)}</p>` : ""}
        ${docs.length ? `<h3 style="margin-top:20px">Documentos</h3><div class="doc-list">${docs.map((d) => `<a class="doc-row" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${icon("file")}<span>${escapeHtml(d.label)}</span>${icon("download")}</a>`).join("")}</div>` : ""}
      </div>
    </section>

    ${related.length ? `
    <section class="section wrap">
      <h3>Relacionados</h3>
      <div class="grid-products">${related.map((p) => productCard(p, idx.mediaBySku.get(p.SKU))).join("")}</div>
    </section>` : ""}
  `;
}

/* =======================================================================
   COMPARADOR (#/comparador — comparador.json: inversores/baterias/paneles)
   ======================================================================= */
export function renderComparador(ctx) {
  const { idx, data } = ctx;
  const comparador = data.comparador || {};
  const cats = [
    { key: "inversores", label: "Inversores", unit: "W" },
    { key: "baterias", label: "Baterias", unit: "W" },
    { key: "paneles_solares", label: "Paneles solares", unit: "W" },
  ].filter((c) => (comparador[c.key] || []).length);

  if (!cats.length) {
    ctx.container.innerHTML = `<div class="wrap section"><div class="state-msg">No se pudo cargar el comparador tecnico.</div></div>`;
    return;
  }
  let activeCat = cats[0].key;
  const selected = {};
  cats.forEach((c) => { selected[c.key] = []; });

  function rowsOf(catKey) { return comparador[catKey] || []; }

  function statRow(a, b, key, label, unit) {
    const va = a ? a[key] : null, vb = b ? b[key] : null;
    const winA = typeof va === "number" && typeof vb === "number" && va > vb;
    const winB = typeof va === "number" && typeof vb === "number" && vb > va;
    return `<div class="compare-row">
      <div class="compare-stat ${winA ? "win" : ""}"><span class="val">${va != null ? va + (unit || "") : "—"}</span><span class="lbl">${label}</span></div>
      <div class="compare-cat-label">${label}</div>
      <div class="compare-stat ${winB ? "win" : ""}"><span class="val">${vb != null ? vb + (unit || "") : "—"}</span><span class="lbl">${label}</span></div>
    </div>`;
  }

  function paintGrid() {
    const rows = rowsOf(activeCat);
    ctx.container.querySelector("#comp-grid").innerHTML = rows.map((r) => `
      <label class="compare-pick ${selected[activeCat].includes(r.SKU) ? "picked" : ""}">
        <input type="checkbox" value="${escapeHtml(r.SKU)}" ${selected[activeCat].includes(r.SKU) ? "checked" : ""}>
        <div class="pick-body">
          <span class="pick-name">${escapeHtml(r.Marca)} ${escapeHtml(r.Modelo)}</span>
          <span class="pick-specs">${r.Potencia_W ? r.Potencia_W + " W · " : ""}${r.Garantia_Anios ? r.Garantia_Anios + " años gtia." : ""}</span>
        </div>
      </label>`).join("");
    ctx.container.querySelectorAll("#comp-grid input").forEach((cb) => {
      cb.addEventListener("change", () => {
        let sel = selected[activeCat];
        if (cb.checked) {
          if (sel.length >= 2) sel.shift();
          sel.push(cb.value);
        } else {
          selected[activeCat] = sel.filter((s) => s !== cb.value);
        }
        paintGrid();
        paintCompare();
      });
    });
  }

  function paintCompare() {
    const sel = selected[activeCat];
    const panel = ctx.container.querySelector("#comp-panel");
    if (sel.length < 1) { panel.innerHTML = `<p class="muted">Marca hasta 2 productos de la lista para compararlos.</p>`; return; }
    const rows = rowsOf(activeCat);
    const a = rows.find((r) => r.SKU === sel[0]);
    const b = sel[1] ? rows.find((r) => r.SKU === sel[1]) : null;
    panel.innerHTML = `
      <div class="compare-head">
        <div class="pick-slot"><span class="pick-name">${escapeHtml(a.Marca)} ${escapeHtml(a.Modelo)}</span></div>
        <div class="compare-vs">VS</div>
        <div class="pick-slot">${b ? `<span class="pick-name">${escapeHtml(b.Marca)} ${escapeHtml(b.Modelo)}</span>` : `<span class="muted">Elegi un segundo producto</span>`}</div>
      </div>
      ${statRow(a, b, "Potencia_W", "Potencia", " W")}
      ${statRow(a, b, "Garantia_Anios", "Garantia", " años")}
      <div class="compare-row"><div class="compare-stat"><span class="val" style="font-size:13px">${escapeHtml(a.Descripcion_Tecnica || "")}</span></div><div class="compare-cat-label">Detalle</div><div class="compare-stat"><span class="val" style="font-size:13px">${b ? escapeHtml(b.Descripcion_Tecnica || "") : "—"}</span></div></div>
    `;
  }

  ctx.container.innerHTML = `
    <section class="section wrap">
      <div class="section-head"><div><h2>¿Cual me conviene?</h2><p class="desc">Elegi una categoria y hasta 2 modelos para verlos lado a lado, en lenguaje simple.</p></div></div>
      <div class="chip-row" id="comp-cats">
        ${cats.map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-cat="${c.key}">${c.label} (${rowsOf(c.key).length})</button>`).join("")}
      </div>
      <div class="compare-layout">
        <div class="compare-grid" id="comp-grid"></div>
        <div class="compare-panel" id="comp-panel"></div>
      </div>
    </section>
  `;

  paintGrid();
  paintCompare();
  ctx.container.querySelectorAll("#comp-cats button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCat = btn.dataset.cat;
      ctx.container.querySelectorAll("#comp-cats button").forEach((b) => b.classList.toggle("on", b === btn));
      paintGrid();
      paintCompare();
    });
  });
}

/* =======================================================================
   BIBLIOTECA TECNICA (#/biblioteca — biblioteca_tecnica.json + media.json)
   ======================================================================= */
export function renderBiblioteca(ctx) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const docs = [];
  idx.products.forEach((p) => {
    const m = idx.mediaBySku.get(p.SKU);
    const b = idx.bibliotecaBySku.get(p.SKU);
    [["Datasheet", "file", m && m.Datasheet], ["Manual", "book", m && m.Manual], ["Catalogo", "pdf", m && m.Catalogo],
     ["Certificados", "shield", m && m.Certificados], ["Video", "share", m && m.Video],
     ["Datasheet", "file", b && b.Datasheet_URL], ["Manual", "book", b && b.Manual_URL],
     ["Certificados", "shield", b && b.Certificados_URL], ["Video", "share", b && b.Video_URL]]
      .forEach(([label, ic, url]) => {
        const u = clean(url);
        if (u) docs.push({ label, ic, url: u, sku: p.SKU, name: p.Nombre_Comercial_Tecnico || p.Modelo });
      });
  });
  const groups = [...new Set(docs.map((d) => d.label))];

  ctx.container.innerHTML = `
    <section class="section wrap">
      <div class="section-head"><div><h2>Manuales y certificados</h2><p class="desc">Para el que quiere revisar la letra chica antes de decidir: fichas tecnicas, manuales y certificados reales de cada equipo.</p></div></div>
      ${docs.length ? `
        <div class="chip-row">${groups.map((g) => `<span class="chip">${escapeHtml(g)} (${docs.filter((d) => d.label === g).length})</span>`).join("")}</div>
        <div class="doc-list" style="margin-top:20px">
          ${docs.map((d) => `<a class="doc-row" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${icon(d.ic)}<span>${escapeHtml(d.label)} — ${escapeHtml(d.name)}</span>${icon("download")}</a>`).join("")}
        </div>
      ` : `
        <div class="state-msg">
          Todavia no tenemos documentos cargados aca. En cuanto esten listos los datasheets, manuales o certificados, van a aparecer automaticamente.
        </div>
        <div class="cta-band" style="margin-top:24px">
          <div><h3>¿Buscas una ficha especifica?</h3><p class="muted">Pedila directo y te la enviamos.</p></div>
          ${waButton(config, "Hola, estoy buscando la ficha tecnica de un producto Blueprint que no encuentro en la biblioteca.", "Pedir documento")}
        </div>
      `}
    </section>
  `;
}

/* =======================================================================
   CONTACTO
   ======================================================================= */
export function renderContacto(ctx) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const stats = computeStats(idx);

  ctx.container.innerHTML = `
    <section class="section wrap contact-wrap">
      <div class="contact-info">
        <span class="eyebrow">Hablemos</span>
        <h1>Hablemos de tu proyecto</h1>
        <p class="lede">Contanos que queres alimentar y te ayudamos a armar la solucion exacta.</p>
        <div class="info-row"><span class="icon-circle sm">${icon("whatsapp")}</span><div><div class="k">WhatsApp</div><div class="v">${config.WhatsApp_Ventas ? escapeHtml(config.WhatsApp_Ventas) : "No configurado"}</div></div></div>
        <div class="info-row"><span class="icon-circle sm">${icon("layers")}</span><div><div class="k">Catalogo</div><div class="v">${stats.kitCount} kits activos en ${stats.marketCount || "—"} mercado${stats.marketCount === 1 ? "" : "s"}</div></div></div>
        <div class="info-row"><span class="icon-circle sm">${icon("shield")}</span><div><div class="k">Garantia</div><div class="v">Hasta ${stats.maxWarranty} años segun componente</div></div></div>
      </div>
      <div class="form-card" id="contact-form">
        <h3>Contanos tu proyecto</h3>
        <div class="field"><label>Nombre</label><input id="c-name" type="text" placeholder="Tu nombre"></div>
        <div class="field"><label>Tipo de proyecto</label>
          <select id="c-type"><option>Residencial</option><option>Comercial</option><option>Portatil / emergencia</option><option>Movilidad electrica</option></select>
        </div>
        <div class="field"><label>Contanos que necesitas</label><textarea id="c-msg" rows="3" placeholder="Describi tu consumo o el equipo que queres alimentar..."></textarea></div>
        <button class="btn btn-primary" id="c-send" style="justify-content:center">${icon("whatsapp")}Enviar por WhatsApp</button>
        <p class="muted" style="font-size:12px">Este formulario abre WhatsApp con tu mensaje. Blueprint Viewer no tiene servidor ni base de datos: nada queda guardado aca.</p>
      </div>
    </section>
  `;

  ctx.container.querySelector("#c-send").addEventListener("click", () => {
    const name = ctx.container.querySelector("#c-name").value.trim();
    const type = ctx.container.querySelector("#c-type").value;
    const msg = ctx.container.querySelector("#c-msg").value.trim();
    const text = `Hola, soy ${name || "un cliente interesado"}. Tengo un proyecto ${type.toLowerCase()}. ${msg}`.trim();
    if (!config.WhatsApp_Ventas) { alert("El numero de WhatsApp de ventas no esta configurado en SYSTEM_CONFIG."); return; }
    window.open(whatsappLink(config.WhatsApp_Ventas, text), "_blank");
  });
}

export function renderNotFound(ctx) {
  ctx.container.innerHTML = `<div class="wrap section"><div class="state-msg">Pagina no encontrada. <a href="#/">Volver al inicio</a></div></div>`;
}
