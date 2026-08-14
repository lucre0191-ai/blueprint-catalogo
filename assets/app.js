/* ======================================================================
   BLUEPRINT VIEWER 2.0 — app.js (punto de entrada)
   ----------------------------------------------------------------------
   Carga los JSON una sola vez, arma los indices y conecta el router
   hash-based con las vistas de assets/js/views.js. No hay build step:
   son modulos ES nativos, compatibles con GitHub Pages tal cual.

   Toda experiencia audiovisual del sitio vive en su propio Engine bajo
   assets/js/engines/ (regla de arquitectura de la propietaria,
   2026-08-05): Blackout Engine orquesta la ceremonia de entrada
   "apagon -> luz", Animation Engine el reveal-on-scroll y las View
   Transitions, Hero Engine la seccion Hero Scene/Hero Film de cada
   ficha, y Media Engine el markup video-con-poster compartido. app.js
   solo los conecta entre si: no reimplementa nada de eso.
   ====================================================================== */

import { loadAll, buildIndices, initRouter, makeRoute, state } from "./js/core.js";
import {
  renderHome, renderKits, renderKitDetail, renderCatalogo,
  renderProductDetail, renderComparador, renderDiagnostico, renderAprender,
  renderCotizacion, renderContacto, renderNotFound,
} from "./js/views.js";
import { initGlossary } from "./js/glossary.js";
import { initBlackoutEngine } from "./js/engines/blackout-engine.js";
import { initViewTransitions, revealBody } from "./js/engines/animation-engine.js";
import { attachCatalogButton } from "./js/catalog-pdf.js";

const viewEl = document.getElementById("view");
const navEl = document.getElementById("main-nav");

function setActiveNav(path) {
  navEl.querySelectorAll("a").forEach((a) => {
    const target = a.getAttribute("href").replace("#", "");
    a.classList.toggle("active", target === path || (target === "/" && path === "/"));
  });
}

/** Arranca el router y las vistas — se llama recien cuando la luz ya
 *  se restauro (Blackout Engine llama a esto como su `onReveal`), nunca
 *  antes: asi el visitante nunca ve un parpadeo de contenido a medio
 *  cargar detras del apagon. */
function initApp(data, idx) {
  const ctx = { data, idx, container: viewEl };

  const routes = [
    makeRoute([], () => { setActiveNav("/"); renderHome(ctx); }),
    makeRoute(["diagnostico"], () => { setActiveNav("diagnostico"); renderDiagnostico(ctx, {}); }),
    makeRoute(["diagnostico", ":uso"], (p) => { setActiveNav("diagnostico"); renderDiagnostico(ctx, p); }),
    makeRoute(["kits"], () => { setActiveNav("kits"); renderKits(ctx); }),
    makeRoute(["kit", ":id"], (p) => { setActiveNav("kits"); renderKitDetail(ctx, p); }),
    makeRoute(["catalogo"], () => { setActiveNav("catalogo"); renderCatalogo(ctx); }),
    makeRoute(["producto", ":sku"], (p) => { setActiveNav("catalogo"); renderProductDetail(ctx, p); }),
    makeRoute(["comparador"], () => { setActiveNav("comparador"); renderComparador(ctx); }),
    makeRoute(["aprender"], () => { setActiveNav("aprender"); renderAprender(ctx); }),
    makeRoute(["cotizacion"], () => { setActiveNav("cotizacion"); renderCotizacion(ctx, {}); }),
    makeRoute(["cotizacion", ":id"], (p) => { setActiveNav("cotizacion"); renderCotizacion(ctx, p); }),
    makeRoute(["contacto"], () => { setActiveNav("contacto"); renderContacto(ctx); }),
  ];

  const runRender = initViewTransitions(viewEl);
  initRouter(routes, () => { setActiveNav(""); renderNotFound(ctx); }, runRender)();

  const toggle = document.getElementById("nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    navEl.addEventListener("click", (e) => { if (e.target.tagName === "A") document.body.classList.remove("nav-open"); });
  }

  // CTA secundario del footer (Documento 06, seccion 4.2 — PUB-06):
  // vive fuera del router (footer estatico de index.html), asi que se
  // conecta una sola vez aca. Mercado = el que este activo en pantalla
  // (state.market), o el default del sitio si el visitante todavia no
  // pasó por la seccion Kits.
  const footerCatalogBtn = document.getElementById("footer-catalog-btn");
  if (footerCatalogBtn) {
    attachCatalogButton(footerCatalogBtn, { market: () => state.market || data.config.Mercado_Default });
  }

  revealBody();
}

async function main() {
  document.body.classList.add("blackout-active");
  initGlossary();

  const dataPromise = loadAll().then((data) => ({ data, idx: buildIndices(data) }));
  initBlackoutEngine(dataPromise, initApp);
}

main();
