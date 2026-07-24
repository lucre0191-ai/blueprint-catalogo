/* ======================================================================
   BLUEPRINT VIEWER 2.0 — app.js (punto de entrada)
   ----------------------------------------------------------------------
   Carga los JSON una sola vez, arma los indices y conecta el router
   hash-based con las vistas de assets/js/views.js. No hay build step:
   son modulos ES nativos, compatibles con GitHub Pages tal cual.

   Ademas orquesta la ceremonia de entrada "apagon -> luz": el sitio
   carga los datos en segundo plano mientras muestra el apagon, y solo
   se revela cuando el visitante toca el interruptor Y los datos ya
   estan listos (lo que tarde mas de los dos). Ver wireBlackout().
   ====================================================================== */

import { loadAll, buildIndices, initRouter, makeRoute, state } from "./js/core.js";
import {
  renderHome, renderKits, renderKitDetail, renderCatalogo,
  renderProductDetail, renderComparador, renderDiagnostico, renderAprender,
  renderCotizacion, renderContacto, renderNotFound,
} from "./js/views.js";
import { initGlossary } from "./js/glossary.js";

const viewEl = document.getElementById("view");
const navEl = document.getElementById("main-nav");

function setActiveNav(path) {
  navEl.querySelectorAll("a").forEach((a) => {
    const target = a.getAttribute("href").replace("#", "");
    a.classList.toggle("active", target === path || (target === "/" && path === "/"));
  });
}

/** Arranca el router y las vistas — se llama recien cuando la luz ya
 *  se restauro (ver wireBlackout), nunca antes: asi el visitante nunca
 *  ve un parpadeo de contenido a medio cargar detras del apagon. */
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

  initRouter(routes, () => { setActiveNav(""); renderNotFound(ctx); })();

  const toggle = document.getElementById("nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    navEl.addEventListener("click", (e) => { if (e.target.tagName === "A") document.body.classList.remove("nav-open"); });
  }

  document.body.classList.add("revealing");
  setTimeout(() => document.body.classList.remove("revealing"), 1250);
}

/** Ceremonia "apagon -> luz". Dos condiciones independientes tienen
 *  que cumplirse para revelar el sitio: que el visitante haya tocado
 *  el interruptor, y que los datos ya hayan terminado de cargar.
 *  Cualquiera de las dos puede llegar primero — se maneja igual. */
function wireBlackout(dataPromise) {
  const blackout = document.getElementById("blackout");
  const hint = document.getElementById("blackout-hint");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let clicked = false;
  let ready = null; // { data, idx } una vez que loadAll() termina
  let revealed = false;

  function tryReveal() {
    if (revealed || !clicked || !ready) return;
    revealed = true;
    document.body.classList.remove("blackout-active");
    document.body.classList.remove("blackout-pressed");
    initApp(ready.data, ready.idx);
  }

  function activate() {
    if (clicked) return;
    clicked = true;
    document.body.classList.add("blackout-pressed");
    if (!ready) hint.textContent = "Encendiendo…";
    // Deja ver el destello del interruptor incluso si los datos ya
    // estaban listos — si no, la ceremonia se sentiria "cortada".
    setTimeout(tryReveal, prefersReduced ? 60 : 420);
    // Si la conexion esta muy lenta (frecuente en la isla), no dejamos
    // el interruptor esperando para siempre sin explicar nada.
    setTimeout(() => {
      if (!revealed) hint.textContent = "La conexion esta lenta — seguimos intentando…";
    }, 8000);
  }

  blackout.addEventListener("click", activate);
  blackout.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
  });

  dataPromise.then((result) => { ready = result; tryReveal(); });
}

async function main() {
  document.body.classList.add("blackout-active");
  initGlossary();

  const dataPromise = loadAll().then((data) => ({ data, idx: buildIndices(data) }));
  wireBlackout(dataPromise);
}

main();
