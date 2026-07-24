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
import { termHint, GLOSSARY } from "./glossary.js";

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

  const benefitIcons = [
    ["shield", "Soluciones confiables"],
    ["bolt", "Ahorro inteligente"],
    ["panel", "Energía sostenible"],
    ["store", "Soporte local"],
    ["house", "Para hogares y negocios"],
  ];
  const valueProps = [
    ["house", "Entiende tu realidad", "Hablamos tu idioma, entendemos tus apagones, tus necesidades y tu contexto."],
    ["bolt", "Soluciones inteligentes", "No solo vendemos productos, recomendamos lo que realmente necesitás."],
    ["scale", "Transparencia total", "Precios claros, cotizaciones detalladas, sin letra pequeña."],
    ["book", "Educación continua", "Aprendé sobre energía solar de forma simple, práctica y gratuita."],
    ["store", "Soporte local", "Estamos con vos antes, durante y después de tu compra."],
    ["layers", "Tecnología con propósito", "Usamos tecnología para hacer tu vida más fácil y tu hogar más seguro."],
  ];

  ctx.container.innerHTML = `
    <section class="warm-return">
      <div class="warm-return-bg" aria-hidden="true">
        <img class="wr-slide" src="assets/img/scene-hogar.jpg" alt="">
        <img class="wr-slide" src="assets/img/scene-restaurante.jpg" alt="">
        <img class="wr-slide" src="assets/img/scene-industrial.jpg" alt="">
      </div>
      <div class="warm-return-scrim" aria-hidden="true"></div>
      <div class="wrap">
        <h2>La energía vuelve. Y con ella, tu tranquilidad.</h2>
        <p class="desc">${escapeHtml(heroLede)}</p>
        <div class="benefit-icons-row">
          ${benefitIcons.map(([ic, label]) => `
            <div class="benefit-icon-item">
              <span class="icon-circle">${icon(ic)}</span>
              <span class="label">${escapeHtml(label)}</span>
            </div>`).join("")}
        </div>
      </div>
    </section>

    <section class="hero">
      <div class="wrap hero-inner">
        <p class="eyebrow">${icon("bolt")}Energia solar explicada sin vueltas</p>
        <h1>Encuentra la solucion energetica adecuada para ti.</h1>
        <p class="lede">Aprende, compara y descubre la alternativa que mejor se adapta a tus necesidades.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#diagnostico">${icon("bolt")}Comenzar diagnostico</a>
          <a class="btn btn-ghost" href="#kits">Explorar soluciones ${icon("arrowRight")}</a>
        </div>
        <div class="hero-stats">
          <div class="stat"><span class="n">${stats.kitCount}</span><span class="l">Soluciones listas</span></div>
          <div class="stat"><span class="n">${stats.marketCount || "—"}</span><span class="l">Mercados</span></div>
          <div class="stat"><span class="n">${fmtNum(stats.kw)}</span><span class="l">kW disponibles</span></div>
          <div class="stat"><span class="n">${stats.maxWarranty}</span><span class="l">Años de garantia</span></div>
        </div>
      </div>
    </section>

    <section class="section wrap">
      <div class="quick-access-grid">
        <a class="quick-access-card" href="#/diagnostico/residencial">
          <span class="icon-circle">${icon("house")}</span>
          <h3>Mi hogar</h3>
          <p>Para que tu familia no se quede sin lo esencial cuando se va la luz.</p>
          <span class="qa-cta">Empezar ${icon("arrowRight")}</span>
        </a>
        <a class="quick-access-card" href="#/diagnostico/mipyme">
          <span class="icon-circle">${icon("store")}</span>
          <h3>Mi negocio</h3>
          <p>Para que la operacion no se detenga en cada apagon.</p>
          <span class="qa-cta">Empezar ${icon("arrowRight")}</span>
        </a>
        <a class="quick-access-card" href="#/diagnostico">
          <span class="icon-circle">${icon("layers")}</span>
          <h3>Mi proyecto</h3>
          <p>Algo mas especifico en mente — contanos que necesitas y te guiamos.</p>
          <span class="qa-cta">Empezar ${icon("arrowRight")}</span>
        </a>
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
      <div class="section-head"><div><h2>Por que elegir esta solucion</h2></div></div>
      <div class="benefit-grid">
        ${beneficios.map((b) => `<div class="benefit"><span class="icon-circle sm">${icon("check")}</span><p>${escapeHtml(b)}.</p></div>`).join("")}
      </div>
    </section>` : ""}

    <section class="section wrap">
      <div class="section-head"><div><h2>Por que elegir Blueprint</h2><p class="desc">No se trata solo de energia. Se trata de tranquilidad, de familia, de sueños que no se apagan.</p></div></div>
      <div class="value-grid">
        ${valueProps.map(([ic, title, desc]) => `
          <div class="value-card">
            <span class="icon-circle">${icon(ic)}</span>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(desc)}</p>
          </div>`).join("")}
      </div>
    </section>

    <section class="quickband wrap">
      <a href="#/comparador">${icon("scale")}Comparar equipos</a>
      <a href="#/aprender">${icon("layers")}Ver todos los equipos</a>
      ${waButton(config, "Hola, no se cual solucion me conviene. ¿Me pueden ayudar a elegir?", "No se cual elegir — ayudenme")}
    </section>
  `;

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
          <a class="btn btn-primary" href="#/cotizacion/${encodeURIComponent(kit.Kit_ID)}">${icon("pdf")}Generar cotizacion</a>
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
      <a class="btn btn-primary" href="#/cotizacion/${encodeURIComponent(kit.Kit_ID)}">${icon("pdf")}Generar cotizacion</a>
    </section>
  `;
}

/* =======================================================================
   COTIZACION (#/cotizacion/:id — pantalla propia, antes vivia adentro
   de la Ficha de Kit. Reusa tal cual el motor de PDF (pdfgen.js): esto
   solo le da su propio paso claro dentro del recorrido, no cambia como
   se generan los documentos. #/cotizacion sin id = estado vacio, para
   cuando entran desde el nav sin haber elegido un kit todavia. */
export function renderCotizacion(ctx, params) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const kit = params && params.id ? idx.kitsById.get(params.id) : null;

  if (!kit) {
    ctx.container.innerHTML = `
      <section class="section wrap">
        <div class="section-head"><div><h2>Cotizacion</h2><p class="desc">Todavia no elegiste una solucion. Arranca por el diagnostico o mira las soluciones disponibles.</p></div></div>
        <div class="cta-band wrap">
          <a class="btn btn-primary" href="#diagnostico">${icon("bolt")}Hacer el diagnostico</a>
          <a class="btn btn-ghost" href="#kits">Ver todas las soluciones</a>
        </div>
      </section>`;
    return;
  }

  const market = state.market || config.Mercado_Default;
  const catalog = catalogFor(idx, kit.Kit_ID, market);
  const warranty = kitWarrantyYears(idx, kit.Kit_ID);
  const price = fmtUSD(kit.Precio_Sugerido_Reventa_USD);
  const name = firstOf(catalog && catalog.Nombre_Comercial, kit.Nombre_Comercial);

  ctx.container.innerHTML = `
    <div class="crumb wrap"><a href="#/kit/${encodeURIComponent(kit.Kit_ID)}">${escapeHtml(name)}</a> ${icon("chevronRight")} <span class="on">Cotizacion</span></div>
    <section class="section wrap two-col">
      <div>
        <span class="pill">${escapeHtml(kit.Linea || "Kit")}</span>
        <h1 style="margin:10px 0">${escapeHtml(name)}</h1>
        <div class="price-row">${price ? `<span class="amount">$${price}</span><span class="cur">USD sugerido</span>` : `<span class="amount muted">Precio a confirmar</span>`}</div>
        <div class="spec-grid" style="margin-top:18px">
          <div class="spec-item"><span class="k">${icon("panel")}Panel</span><span class="v">${fmtNum(kit.Potencia_Panel_kW)} kW</span></div>
          <div class="spec-item"><span class="k">${icon("bolt")}Inversor</span><span class="v">${fmtNum(kit.Potencia_Inversor_kW)} kW</span></div>
          <div class="spec-item"><span class="k">${icon("battery")}Bateria</span><span class="v">${fmtNum(kit.Bateria_kWh)} kWh</span></div>
          <div class="spec-item"><span class="k">${icon("shield")}Garantia</span><span class="v">${warranty ? warranty + " años" : "—"}</span></div>
        </div>
      </div>
      <div class="buy-card">
        <h3 style="margin-top:0">Tu cotizacion</h3>
        <p class="muted" style="font-size:13.5px">Generamos el documento en el momento a partir de nuestros datos reales — nunca es una captura vieja.</p>
        <div class="actions-col">
          <button class="btn btn-primary" id="btn-pdf-comercial">${icon("pdf")}Descargar ficha comercial (PDF)</button>
          <button class="btn btn-ghost" id="btn-pdf-tecnica">${icon("layers")}Descargar especificacion tecnica (PDF)</button>
          <button class="btn btn-ghost" id="btn-share">${icon("share")}Compartir</button>
          ${waButton(config, buildInquiryText(name, market, price), "Cerrar por WhatsApp")}
        </div>
      </div>
    </section>
  `;

  async function withBusyLabel(btn, busyText, task) {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = busyText;
    try { await task(); } finally { btn.disabled = false; btn.innerHTML = original; }
  }

  const btnPdfComercial = ctx.container.querySelector("#btn-pdf-comercial");
  const btnPdfTecnica = ctx.container.querySelector("#btn-pdf-tecnica");
  const btnShare = ctx.container.querySelector("#btn-share");
  if (btnPdfComercial) btnPdfComercial.addEventListener("click", () => withBusyLabel(btnPdfComercial, "Generando…", () => generateCommercialPDF(idx, data, kit.Kit_ID, market)));
  if (btnPdfTecnica) btnPdfTecnica.addEventListener("click", () => withBusyLabel(btnPdfTecnica, "Generando…", () => generateTechnicalPDF(idx, data, kit.Kit_ID, market)));
  if (btnShare) btnShare.addEventListener("click", () => withBusyLabel(btnShare, "Preparando…", () => shareCommercialPDF(idx, data, kit.Kit_ID, market)));
}

/* =======================================================================
   EXPLORADOR DE COMPONENTES (products.json)
   ----------------------------------------------------------------------
   Pinta el grid filtrable dentro de CUALQUIER contenedor que reciba —
   usado por la ruta de compatibilidad #/catalogo y por la pestaña
   "Explorar equipos" de Aprender (#/aprender). Una sola implementacion,
   dos entradas — asi no se duplica logica (regla de arquitectura:
   "no crear hojas nuevas si una existente puede ampliarse").
   ======================================================================= */
function paintCatalogoExplorer(container, idx) {
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
    container.querySelector("#cat-grid").innerHTML = rows.length
      ? rows.map((p) => productCard(p, idx.mediaBySku.get(p.SKU))).join("")
      : `<div class="state-msg">Ningun componente coincide con esos filtros.</div>`;
    container.querySelector("#cat-count").textContent = `${rows.length} componente${rows.length === 1 ? "" : "s"}`;
    const tipoSelect = container.querySelector("#f-tipo");
    tipoSelect.innerHTML = `<option value="">Tipo / subcategoria</option>` + tiposFor(filters.categoria).map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    tipoSelect.value = filters.tipo;
  }

  container.innerHTML = `
    <div class="filter-bar">
      <select id="f-categoria"><option value="">Categoria</option>${categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>
      <select id="f-marca"><option value="">Marca</option>${marcas.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}</select>
      <select id="f-tipo"></select>
      <form class="search-inline" id="cat-search"><span class="sb-icon">${icon("search")}</span><input type="search" placeholder="Buscar modelo..."></form>
      <span class="count" id="cat-count"></span>
    </div>
    <div class="grid-products" id="cat-grid"></div>
  `;

  paint();
  container.querySelector("#f-categoria").addEventListener("change", (e) => { filters.categoria = e.target.value; filters.tipo = ""; paint(); });
  container.querySelector("#f-marca").addEventListener("change", (e) => { filters.marca = e.target.value; paint(); });
  container.querySelector("#f-tipo").addEventListener("change", (e) => { filters.tipo = e.target.value; paint(); });
  container.querySelector("#cat-search").addEventListener("submit", (e) => e.preventDefault());
  container.querySelector("#cat-search input").addEventListener("input", (e) => { filters.q = e.target.value; paint(); });
}

/** Ruta de compatibilidad #/catalogo — ya no esta en el nav (su lugar
 *  lo tomo "Aprender"), pero se mantiene viva porque hay links internos
 *  que apuntan aca (ej. "Ver componente" en ampliaciones de un kit). */
export function renderCatalogo(ctx) {
  ctx.container.innerHTML = `
    <section class="section wrap">
      <div class="section-head"><div><h2>Cada pieza, por separado</h2><p class="desc">Paneles, inversores, baterias y accesorios — para quien ya sabe lo que busca, o quiere entender que trae cada solucion por dentro.</p></div></div>
      <div id="cat-explorer"></div>
    </section>
  `;
  paintCatalogoExplorer(ctx.container.querySelector("#cat-explorer"), ctx.idx);
}

/* =======================================================================
   APRENDER (#/aprender — hub de conocimiento)
   ----------------------------------------------------------------------
   Fusiona lo que antes eran dos pantallas sueltas (Catalogo de
   componentes y Biblioteca de fichas tecnicas) en una sola, con la
   logica del Catalogo reutilizada tal cual (ver paintCatalogoExplorer
   arriba). A proposito NO incluye descarga de fichas tecnicas por
   producto — decision explicita de la propietaria: esa info ya vive en
   la Ficha de Kit. El Glosario usa el mismo contenido real que ya
   alimenta los "?" de ayuda en el resto del sitio (glossary.js). */
const GLOSARIO_LABELS = {
  panel: "Panel solar", inversor: "Inversor", bateria: "Bateria",
  autonomia: "Autonomia", garantia: "Garantia", kw: "kW (kilovatio)",
  kwh: "kWh (kilovatio-hora)", offgrid: "Off-Grid", hibrido: "Hibrido",
};

function paintGlosario(container) {
  container.innerHTML = `
    <div class="glossary-list">
      ${Object.entries(GLOSSARY).map(([key, text]) => `
        <div class="glossary-item">
          <h3>${escapeHtml(GLOSARIO_LABELS[key] || key)}</h3>
          <p>${escapeHtml(text)}</p>
        </div>`).join("")}
    </div>`;
}

export function renderAprender(ctx) {
  const { idx, data } = ctx;
  const config = data.config || {};
  let tab = "equipos";

  function paint() {
    ctx.container.innerHTML = `
      <section class="section wrap">
        <div class="section-head"><div><h2>Aprende con Blueprint</h2><p class="desc">Todo lo que necesitas para decidir con confianza, sin vueltas tecnicas ni letra chica.</p></div></div>
        <div class="chip-row">
          <button class="chip ${tab === "equipos" ? "on" : ""}" data-tab="equipos">${icon("layers")}Explorar equipos</button>
          <button class="chip ${tab === "glosario" ? "on" : ""}" data-tab="glosario">${icon("book")}Glosario</button>
        </div>
        <div id="aprender-body" style="margin-top:22px"></div>
        <div class="cta-band wrap" style="margin-top:34px">
          <div><h3>¿Preferis que te lo expliquen directo?</h3><p class="muted">Un asesor te acompaña sin apuro, en lenguaje simple.</p></div>
          ${waButton(config, "Hola, tengo dudas sobre como funciona un sistema solar. ¿Me pueden explicar?", "Consultar por WhatsApp")}
        </div>
      </section>
    `;
    const body = ctx.container.querySelector("#aprender-body");
    if (tab === "equipos") paintCatalogoExplorer(body, idx);
    else paintGlosario(body);
    ctx.container.querySelectorAll(".chip[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { tab = btn.dataset.tab; paint(); });
    });
  }
  paint();
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
  const gallery = [media && media.Imagen_principal, media && media.Imagen_2, media && media.Imagen_3].map(clean).filter(Boolean);
  const related = idx.products.filter((p) => p.Categoria === product.Categoria && p.SKU !== product.SKU).slice(0, 4);

  // Nota: a proposito no hay descarga de ficha tecnica/datasheet aca —
  // decision explicita de la propietaria: esa info ya se muestra en la
  // Ficha de Kit (seccion "Documentos"), no hace falta duplicarla por
  // producto suelto.
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
   DIAGNOSTICO INTELIGENTE (#/diagnostico — Plano 2)
   ----------------------------------------------------------------------
   No es un formulario: es una conversacion corta que se adapta a quien
   la responde. Blueprint no empieza preguntando kW — empieza
   preguntando quien sos y que no puede parar en tu vida.

   Arquitectura (fiel a PLANO-02-DIAGNOSTICO-INTELIGENTE.md):
     Paso 0 — Perfil (7 tipos de cliente, arbol de decision propio)
     Paso 1 — Sub-pregunta de contexto (solo en los perfiles donde
               aporta: MIPYME, Agricola, Turismo — el resto salta directo)
     Paso 2 — Que no puede parar (multi-select, vocabulario propio de
               cada perfil, pero la puntuacion siempre se calcula sobre
               el texto REAL de kit.Aplicaciones — nunca se inventa)
     Paso 3 — Duracion del respaldo necesitado
     Paso 4 — Analisis (pantalla de carga con mensajes secuenciales,
               le da al diagnostico la sensacion de trabajo real)
     Paso 5 — Resultado: kits reales + clasificacion de necesidad +
               nivel de confianza (calculado, nunca inventado) +
               accesorios reales + sugerencia si la combinacion no cierra.

   Regla de oro: todo dato del resultado (kits, precios, accesorios) sale
   de kits.json / kit_components.json. Lo unico "inteligente" es COMO se
   pregunta y COMO se pondera — nunca que producto existe.
   ======================================================================= */
const DIAG_PERFILES = [
  { key: "residencial", label: "Residencial", desc: "Mi hogar, mi familia.", ic: "house", lineas: ["Respaldo", "Continuidad", "Autonomia"] },
  { key: "mipyme", label: "Micro o pequeño negocio", desc: "Restaurante, tienda, taller, oficina...", ic: "store", lineas: ["Continuidad", "Operacion Critica"] },
  { key: "empresa", label: "Empresa", desc: "Produccion, turnos, operacion que no puede parar.", ic: "factory", lineas: ["Operacion Critica"] },
  { key: "agricola", label: "Agrícola", desc: "Bombeo, riego, frio, procesamiento.", ic: "leaf", lineas: ["Operacion Critica", "Autonomia"] },
  { key: "turismo", label: "Turismo", desc: "Hospedaje, restauracion, experiencia del huesped.", ic: "bed", lineas: ["Operacion Critica", "Continuidad"] },
  { key: "institucion", label: "Institución", desc: "Oficinas, servidores, salud, seguridad.", ic: "building", lineas: ["Operacion Critica"] },
  { key: "otro", label: "Otro", desc: "Algo distinto — igual te ayudamos a encontrarlo.", ic: "suitcase", lineas: ["Respaldo", "Continuidad", "Autonomia", "Operacion Critica", "Portatil"] },
];

// Etiqueta amigable de la Linea real de kits.json, para el resultado.
const DIAG_LINEA_LABEL = {
  "Respaldo": "Respaldo esencial",
  "Continuidad": "Continuidad operativa",
  "Autonomia": "Autonomía energética",
  "Operacion Critica": "Operación crítica protegida",
  "Portatil": "Energía portátil",
};

// Sub-pregunta opcional de contexto — solo aporta valor real en estos 3
// perfiles (el rubro cambia mucho la conversacion). "boost" son
// palabras reales de Aplicaciones que se suman como pistas, no un dato
// inventado: es una inferencia razonable sobre ese tipo de negocio.
const DIAG_SUBPREGUNTA = {
  mipyme: {
    label: "¿A que se dedica tu negocio?",
    opciones: [
      { key: "restaurante", label: "Restaurante o cafeteria", ic: "store", boost: ["negocio", "electrodomestico"] },
      { key: "panaderia", label: "Panaderia o reposteria", ic: "store", boost: ["electrodomestico", "negocio"] },
      { key: "tienda", label: "Tienda o comercio", ic: "layers", boost: ["luces", "tv"] },
      { key: "oficina", label: "Oficina o estudio", ic: "layers", boost: ["electrodomestico", "oficina", "tv"] },
      { key: "taller", label: "Taller", ic: "bolt", boost: ["negocio", "carga completa"] },
      { key: "farmacia", label: "Farmacia", ic: "shield", boost: ["nevera", "electrodomestico"] },
      { key: "hotel", label: "Hotel pequeño / hospedaje", ic: "bed", boost: ["a/c", "electrodomestico", "negocio"] },
      { key: "otro", label: "Otro rubro", ic: "suitcase", boost: [] },
    ],
  },
  agricola: {
    label: "¿Cual es tu actividad principal?",
    opciones: [
      { key: "bombeo", label: "Bombeo de agua", ic: "droplet", boost: ["negocio"] },
      { key: "frio", label: "Frio / refrigeracion", ic: "fridge", boost: ["nevera"] },
      { key: "riego", label: "Riego", ic: "droplet", boost: ["negocio"] },
      { key: "procesamiento", label: "Procesamiento o empaque", ic: "layers", boost: ["negocio", "electrodomestico"] },
      { key: "otro", label: "Otra actividad", ic: "leaf", boost: [] },
    ],
  },
  turismo: {
    label: "¿Que tipo de espacio es?",
    opciones: [
      { key: "hotel", label: "Hotel / hospedaje", ic: "bed", boost: ["a/c", "electrodomestico"] },
      { key: "restaurante", label: "Restaurante / bar", ic: "store", boost: ["negocio", "electrodomestico"] },
      { key: "ambos", label: "Ambos", ic: "layers", boost: ["a/c", "negocio", "electrodomestico"] },
      { key: "otro", label: "Otro", ic: "suitcase", boost: [] },
    ],
  },
};

// "Que no puede parar" — vocabulario propio por perfil, pero cada
// opcion apunta a texto REAL de kit.Aplicaciones (ver kits.json).
const DIAG_NECESIDADES_POR_PERFIL = {
  residencial: [
    { key: "nevera", label: "La nevera", ic: "fridge", kw: ["nevera"] },
    { key: "luces", label: "Luces y ventiladores", ic: "bolt", kw: ["luces", "ventilador"] },
    { key: "tv", label: "TV e internet", ic: "tv", kw: ["tv", "router"] },
    { key: "ac", label: "Aire acondicionado", ic: "layers", kw: ["a/c", "aire"] },
    { key: "electrodomesticos", label: "Electrodomesticos / oficina en casa", ic: "plug", kw: ["electrodomestico", "oficina"] },
  ],
  mipyme: [
    { key: "nevera", label: "Refrigeracion / neveras", ic: "fridge", kw: ["nevera", "refrigeracion"] },
    { key: "luces", label: "Luces y ventilacion", ic: "bolt", kw: ["luces", "ventilador"] },
    { key: "ac", label: "Aire acondicionado", ic: "layers", kw: ["a/c", "aire"] },
    { key: "oficina", label: "Equipos de oficina / PC", ic: "plug", kw: ["electrodomestico", "oficina"] },
    { key: "negocio_completo", label: "Toda la operacion del negocio", ic: "store", kw: ["negocio", "carga completa"] },
    { key: "vehiculo", label: "Cargar un vehiculo del negocio", ic: "car", kw: ["vehiculo"] },
  ],
  empresa: [
    { key: "negocio_completo", label: "Toda la produccion / operacion", ic: "factory", kw: ["negocio", "carga completa"] },
    { key: "vehiculo", label: "Flota / vehiculos electricos", ic: "car", kw: ["vehiculo"] },
    { key: "oficina", label: "Sistemas y oficinas", ic: "plug", kw: ["electrodomestico", "oficina"] },
    { key: "ac", label: "Climatizacion", ic: "layers", kw: ["a/c", "aire"] },
  ],
  agricola: [
    { key: "bombeo", label: "Bombas de agua / riego", ic: "droplet", kw: ["negocio"] },
    { key: "frio", label: "Frio / refrigeracion", ic: "fridge", kw: ["nevera", "refrigeracion"] },
    { key: "luces", label: "Iluminacion", ic: "bolt", kw: ["luces"] },
    { key: "electrodomesticos", label: "Equipos de procesamiento", ic: "plug", kw: ["electrodomestico"] },
    { key: "negocio_completo", label: "Toda la explotacion", ic: "store", kw: ["negocio", "carga completa"] },
  ],
  turismo: [
    { key: "ac", label: "Aire acondicionado en habitaciones", ic: "layers", kw: ["a/c", "aire"] },
    { key: "cocina", label: "Cocina / refrigeracion", ic: "fridge", kw: ["nevera", "electrodomestico"] },
    { key: "lavanderia", label: "Lavanderia", ic: "plug", kw: ["electrodomestico"] },
    { key: "internet", label: "Luces e internet para huespedes", ic: "tv", kw: ["luces", "tv", "router"] },
    { key: "negocio_completo", label: "Todo el establecimiento", ic: "store", kw: ["negocio", "carga completa"] },
  ],
  institucion: [
    { key: "computadoras", label: "Computadoras y oficinas", ic: "plug", kw: ["electrodomestico", "oficina"] },
    { key: "servidores", label: "Servidores / continuidad de datos", ic: "layers", kw: ["negocio", "electrodomestico"] },
    { key: "medicos", label: "Equipos medicos sensibles", ic: "fridge", kw: ["nevera", "electrodomestico"] },
    { key: "comunicacion", label: "Comunicacion / internet", ic: "tv", kw: ["tv", "router"] },
    { key: "seguridad", label: "Iluminacion y seguridad", ic: "bolt", kw: ["luces"] },
  ],
  otro: [
    { key: "nevera", label: "La nevera", ic: "fridge", kw: ["nevera"] },
    { key: "luces", label: "Luces y ventiladores", ic: "bolt", kw: ["luces", "ventilador"] },
    { key: "tv", label: "TV e internet", ic: "tv", kw: ["tv", "router"] },
    { key: "ac", label: "Aire acondicionado", ic: "layers", kw: ["a/c", "aire"] },
    { key: "oficina", label: "Electrodomesticos / oficina", ic: "plug", kw: ["electrodomestico", "oficina"] },
    { key: "negocio_completo", label: "Todo el negocio", ic: "store", kw: ["negocio", "carga completa"] },
    { key: "vehiculo", label: "Cargar un vehiculo electrico", ic: "car", kw: ["vehiculo"] },
    { key: "celular", label: "Celular y radio", ic: "wifi", kw: ["celular", "radio"] },
  ],
};

const DIAG_DURACION = [
  { key: "unas_horas", label: "Unas horas", desc: "El apagon es corto, con eso alcanza.", ic: "clock" },
  { key: "todo_el_apagon", label: "Todo el apagon", desc: "A veces se va la luz por horas largas.", ic: "clock" },
  { key: "vivo_sin_red", label: "Vivo sin red estable", desc: "Necesito autonomia real, no solo un respaldo.", ic: "battery" },
];

const DIAG_ANALISIS_MSGS = [
  "Analizando tus necesidades…", "Revisando nuestras soluciones…", "Comparando alternativas reales…",
  "Construyendo tu recomendacion…", "Calculando compatibilidad…", "Preparando tu resultado…",
];

/* Consumo promedio de referencia (Watts), valores tipicos usados en
   dimensionamiento solar — NO son datos de Blueprint ni de un producto
   puntual, son promedios generales de la industria. Por eso el
   resultado siempre lo etiqueta como "estimacion aproximada": es una
   guia, no una medicion real del consumo del cliente. */
const DIAG_CONSUMO_W = {
  nevera: 150, luces: 60, tv: 100, ac: 1200, electrodomesticos: 300,
  negocio_completo: 3000, vehiculo: 3000, oficina: 250, bombeo: 750,
  frio: 400, cocina: 1500, lavanderia: 500, internet: 50,
  computadoras: 200, servidores: 500, medicos: 300, comunicacion: 100,
  seguridad: 80, celular: 20,
};

function diagScoreKit(kit, answers, perfil, subOpcion) {
  let score = 0;
  if ((perfil.lineas || []).includes(kit.Linea)) score += 3;
  const apps = (kit.Aplicaciones || "").toLowerCase();
  const necesidadesDef = DIAG_NECESIDADES_POR_PERFIL[perfil.key] || [];
  answers.necesidades.forEach((n) => {
    const def = necesidadesDef.find((d) => d.key === n);
    if (def && def.kw.some((kw) => apps.includes(kw))) score += 2;
  });
  if (subOpcion) (subOpcion.boost || []).forEach((kw) => { if (apps.includes(kw)) score += 1; });
  if (answers.duracion === "vivo_sin_red" && (kit.Tipo_Sistema === "Off-Grid" || kit.Linea === "Autonomia")) score += 2;
  if (answers.duracion === "todo_el_apagon" && (kit.Tipo_Sistema === "Hibrido" || kit.Linea === "Continuidad" || kit.Linea === "Operacion Critica")) score += 2;
  if (answers.duracion === "unas_horas" && (kit.Linea === "Portatil" || kit.Linea === "Respaldo")) score += 2;
  return score;
}

export function renderDiagnostico(ctx, params) {
  const { idx, data } = ctx;
  const config = data.config || {};
  const market = state.market || (data.config && data.config.Mercado_Default) || marketsFrom(idx.catalogs)[0];
  const prefersReduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const prePerfil = params && DIAG_PERFILES.some((p) => p.key === params.uso) ? params.uso : null;
  const answers = { perfil: prePerfil, sub: null, necesidades: [], duracion: null };
  let stage = prePerfil ? "sub" : "perfil";

  function perfilDef() { return DIAG_PERFILES.find((p) => p.key === answers.perfil); }
  function tieneSubpregunta() { return !!DIAG_SUBPREGUNTA[answers.perfil]; }

  function stageOrder() {
    const base = ["perfil"];
    if (tieneSubpregunta()) base.push("sub");
    base.push("necesidades", "duracion", "analisis", "resultado");
    return base;
  }
  function stepper() {
    const order = stageOrder().filter((s) => s !== "analisis");
    const labels = { perfil: "Perfil", sub: "Contexto", necesidades: "Necesidad", duracion: "Duracion", resultado: "Resultado" };
    const idx2 = order.indexOf(stage === "analisis" ? "resultado" : stage);
    return `<div class="diag-steps">
      ${order.map((s, i) => `<span class="diag-step ${i === idx2 ? "on" : ""} ${i < idx2 ? "done" : ""}">${i + 1}. ${labels[s]}</span>`).join("")}
    </div>`;
  }
  function goBack() {
    const order = stageOrder();
    const i = order.indexOf(stage);
    stage = order[Math.max(0, i - 1)];
    paint();
  }

  function paint() {
    if (stage === "perfil") {
      ctx.container.innerHTML = `
        <section class="section wrap diag-wrap">
          ${stepper()}
          <div class="section-head"><div><h2>Encontremos juntos la solucion adecuada para vos</h2><p class="desc">Unas pocas preguntas — nada tecnico. Cada respuesta cambia la siguiente pregunta, para no hacerte perder tiempo.</p></div></div>
          <div class="diag-grid diag-grid-perfiles">
            ${DIAG_PERFILES.map((o) => `
              <button class="diag-card" data-perfil="${o.key}">
                <span class="icon-circle">${icon(o.ic)}</span>
                <h3>${escapeHtml(o.label)}</h3><p>${escapeHtml(o.desc)}</p>
              </button>`).join("")}
          </div>
        </section>`;
      ctx.container.querySelectorAll("[data-perfil]").forEach((btn) => {
        btn.addEventListener("click", () => {
          answers.perfil = btn.dataset.perfil; answers.sub = null; answers.necesidades = [];
          stage = tieneSubpregunta() ? "sub" : "necesidades";
          paint();
        });
      });
      return;
    }

    if (stage === "sub") {
      const sub = DIAG_SUBPREGUNTA[answers.perfil];
      if (!sub) { stage = "necesidades"; paint(); return; }
      ctx.container.innerHTML = `
        <section class="section wrap diag-wrap">
          ${stepper()}
          <div class="section-head"><div><h2>${escapeHtml(sub.label)}</h2></div></div>
          <div class="diag-grid">
            ${sub.opciones.map((o) => `
              <button class="diag-card" data-sub="${o.key}">
                <span class="icon-circle">${icon(o.ic)}</span>
                <h3>${escapeHtml(o.label)}</h3>
              </button>`).join("")}
          </div>
          <div class="diag-nav"><button class="btn btn-ghost" id="diag-back">Atras</button></div>
        </section>`;
      ctx.container.querySelectorAll("[data-sub]").forEach((btn) => {
        btn.addEventListener("click", () => { answers.sub = btn.dataset.sub; stage = "necesidades"; paint(); });
      });
      ctx.container.querySelector("#diag-back").addEventListener("click", goBack);
      return;
    }

    if (stage === "necesidades") {
      const opciones = DIAG_NECESIDADES_POR_PERFIL[answers.perfil] || DIAG_NECESIDADES_POR_PERFIL.otro;
      ctx.container.innerHTML = `
        <section class="section wrap diag-wrap">
          ${stepper()}
          <div class="section-head"><div><h2>¿Que es lo que no puede parar?</h2><p class="desc">Elegi todo lo que aplique — podes marcar mas de una.</p></div></div>
          <div class="diag-grid diag-grid-multi">
            ${opciones.map((o) => `
              <label class="diag-card diag-check ${answers.necesidades.includes(o.key) ? "on" : ""}" data-nec="${o.key}">
                <span class="icon-circle">${icon(o.ic)}</span>
                <span class="diag-check-label">${escapeHtml(o.label)}</span>
                <span class="diag-check-mark">${icon("check")}</span>
              </label>`).join("")}
          </div>
          <div class="diag-nav">
            <button class="btn btn-ghost" id="diag-back">Atras</button>
            <button class="btn btn-primary" id="diag-next" ${answers.necesidades.length ? "" : "disabled"}>Siguiente ${icon("arrowRight")}</button>
          </div>
        </section>`;
      ctx.container.querySelectorAll("[data-nec]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          const key = el.dataset.nec;
          if (answers.necesidades.includes(key)) answers.necesidades = answers.necesidades.filter((k) => k !== key);
          else answers.necesidades.push(key);
          paint();
        });
      });
      ctx.container.querySelector("#diag-back").addEventListener("click", goBack);
      const next = ctx.container.querySelector("#diag-next");
      if (next) next.addEventListener("click", () => { stage = "duracion"; paint(); });
      return;
    }

    if (stage === "duracion") {
      ctx.container.innerHTML = `
        <section class="section wrap diag-wrap">
          ${stepper()}
          <div class="section-head"><div><h2>¿Cuanto necesitas que dure el respaldo?</h2></div></div>
          <div class="diag-grid">
            ${DIAG_DURACION.map((o) => `
              <button class="diag-card" data-dur="${o.key}">
                <span class="icon-circle">${icon(o.ic)}</span>
                <h3>${escapeHtml(o.label)}</h3><p>${escapeHtml(o.desc)}</p>
              </button>`).join("")}
          </div>
          <div class="diag-nav"><button class="btn btn-ghost" id="diag-back">Atras</button></div>
        </section>`;
      ctx.container.querySelectorAll("[data-dur]").forEach((btn) => {
        btn.addEventListener("click", () => { answers.duracion = btn.dataset.dur; stage = "analisis"; paint(); });
      });
      ctx.container.querySelector("#diag-back").addEventListener("click", goBack);
      return;
    }

    if (stage === "analisis") {
      ctx.container.innerHTML = `
        <section class="section wrap diag-wrap diag-analisis">
          <div class="diag-analisis-spinner">${icon("sparkles")}</div>
          <p class="diag-analisis-msg" id="diag-analisis-msg">${DIAG_ANALISIS_MSGS[0]}</p>
        </section>`;
      if (prefersReduced) { stage = "resultado"; paint(); return; }
      let i = 0;
      const msgEl = ctx.container.querySelector("#diag-analisis-msg");
      const interval = setInterval(() => {
        i++;
        if (i >= DIAG_ANALISIS_MSGS.length) { clearInterval(interval); stage = "resultado"; paint(); return; }
        if (msgEl) msgEl.textContent = DIAG_ANALISIS_MSGS[i];
      }, 450);
      return;
    }

    // stage === "resultado" — 100% calculado sobre kits.json real, nunca inventado.
    const perfil = perfilDef();
    const subDef = DIAG_SUBPREGUNTA[answers.perfil];
    const subOpcion = subDef && answers.sub ? subDef.opciones.find((o) => o.key === answers.sub) : null;
    const necesidadesDef = DIAG_NECESIDADES_POR_PERFIL[answers.perfil] || [];

    const scored = idx.kits
      .map((k) => ({ kit: k, score: diagScoreKit(k, answers, perfil, subOpcion) }))
      .sort((a, b) => b.score - a.score || a.kit.Precio_Sugerido_Reventa_USD - b.kit.Precio_Sugerido_Reventa_USD);
    const bestScore = scored[0] ? scored[0].score : 0;
    const top = scored.slice(0, 3);
    const exact = bestScore > 0;
    const topKit = top[0] && top[0].kit;

    // Nivel de confianza: % real del puntaje obtenido sobre el maximo
    // teorico posible para estas respuestas — nunca un numero de adorno.
    const maxTeorico = 3 + answers.necesidades.length * 2 + (subOpcion ? (subOpcion.boost || []).length : 0) + 2;
    const confianza = maxTeorico > 0 ? Math.min(97, Math.round((bestScore / maxTeorico) * 100)) : 0;

    const accesorios = topKit ? optionalComponents(idx, topKit.Kit_ID).slice(0, 4) : [];
    const necesidadLabel = topKit ? (DIAG_LINEA_LABEL[topKit.Linea] || topKit.Linea) : null;

    // Demanda estimada: SIEMPRE etiquetada como aproximada — suma de
    // consumos promedio de la industria (DIAG_CONSUMO_W), no una
    // medicion real del cliente. Ver nota junto a la tabla arriba.
    const demandaW = answers.necesidades.reduce((sum, n) => sum + (DIAG_CONSUMO_W[n] || 0), 0);
    // Potencial de ampliacion: esto SI es un dato real (opcionales
    // cargados en kit_components.json para ese kit puntual).
    const puedeAmpliar = accesorios.length > 0;

    // Sugerencia honesta si la combinacion no cierra del todo (ej.
    // apagon cortito + operacion critica de precio alto): nunca se
    // oculta, se lo decimos claro como pide el documento.
    const sugerencia = (answers.duracion === "unas_horas" && topKit && topKit.Precio_Sugerido_Reventa_USD > 3500)
      ? "Lo que nos contaste sugiere una necesidad puntual, pero la solucion que mejor calza es una inversion mayor — capaz te conviene evaluar una instalacion por etapas. Hablemos y lo vemos juntos."
      : null;

    const perfilLabel = perfil ? perfil.label.toLowerCase() : "vos";

    ctx.container.innerHTML = `
      <section class="section wrap diag-wrap">
        ${stepper()}
        <div class="diag-result-head">
          <span class="pill">${icon(perfil.ic)}${escapeHtml(perfil.label)}${subOpcion ? " · " + escapeHtml(subOpcion.label) : ""}</span>
          <h2>${exact ? `Esto es lo que mas se ajusta a lo que nos contaste` : "No encontramos una coincidencia exacta — te mostramos lo mas cercano"}</h2>
          ${topKit ? `<p class="desc">Clasificamos tu necesidad como <strong>${escapeHtml(necesidadLabel)}</strong>. Calculado sobre nuestras soluciones reales para ${escapeHtml(perfilLabel)}, no una lista generica.</p>` : ""}
          ${topKit ? `<div class="diag-confidence"><div class="diag-confidence-bar"><span style="width:${confianza}%"></span></div><span class="diag-confidence-label">${confianza}% de coincidencia con lo que nos contaste</span></div>` : ""}
          ${topKit ? `
          <div class="diag-facts">
            ${demandaW > 0 ? `
            <div class="diag-fact">
              <span class="diag-fact-label">Consumo estimado (aproximado)</span>
              <span class="diag-fact-value">~${demandaW.toLocaleString("en-US")} W</span>
              <span class="diag-fact-note">Basado en promedios tipicos, no en una medicion real de tu consumo — un asesor puede afinarlo.</span>
            </div>` : ""}
            <div class="diag-fact">
              <span class="diag-fact-label">Potencial de ampliacion</span>
              <span class="diag-fact-value">${puedeAmpliar ? `Si, ${accesorios.length} opcion${accesorios.length === 1 ? "" : "es"} real${accesorios.length === 1 ? "" : "es"}` : "Sin ampliaciones cargadas para este kit"}</span>
              <span class="diag-fact-note">${puedeAmpliar ? "Podes empezar por acá y crecer despues." : "Este kit ya viene en su configuracion completa."}</span>
            </div>
          </div>` : ""}
        </div>

        ${sugerencia ? `<div class="diag-suggestion">${icon("sparkles")}<p>${escapeHtml(sugerencia)}</p></div>` : ""}

        <div class="kit-grid">
          ${top.map(({ kit }) => kitCard(idx, kit, catalogFor(idx, kit.Kit_ID, market), config)).join("")}
        </div>

        ${accesorios.length ? `
        <div class="diag-accesorios">
          <h3>Accesorios que podrias sumar</h3>
          <div class="chip-row">${accesorios.map((c) => `<span class="chip">${escapeHtml(c.Descripcion || c.SKU)}</span>`).join("")}</div>
        </div>` : ""}

        <div class="cta-band wrap" style="margin-top:8px">
          <div><h3>¿Ninguna te convence del todo?</h3><p class="muted">Un asesor real revisa tu caso y te arma una a medida.</p></div>
          ${waButton(config, `Hola, hice el diagnostico en la web (perfil: ${perfil.label}) y quiero que un asesor revise mi caso.`, "Hablar con un asesor")}
        </div>
        <div style="text-align:center;margin-top:18px">
          <button class="btn btn-ghost" id="diag-restart">Volver a empezar</button>
        </div>
      </section>`;
    ctx.container.querySelector("#diag-restart").addEventListener("click", () => {
      answers.perfil = null; answers.sub = null; answers.necesidades = []; answers.duracion = null; stage = "perfil"; paint();
    });
  }

  paint();
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

/* Nota: se retiro la pantalla "Biblioteca" (listado de fichas tecnicas
   descargables por producto) — decision explicita de la propietaria:
   esa informacion ya se muestra en la Ficha de Kit (seccion
   "Documentos"), no hace falta una pantalla aparte para descargarla
   producto por producto. */

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
