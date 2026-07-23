/* ======================================================================
   BLUEPRINT VIEWER 2.0 — app.js (punto de entrada)
   ----------------------------------------------------------------------
   Carga los JSON una sola vez, arma los indices y conecta el router
   hash-based con las vistas de assets/js/views.js. No hay build step:
   son modulos ES nativos, compatibles con GitHub Pages tal cual.
   ====================================================================== */

import { loadAll, buildIndices, initRouter, makeRoute, state } from "./js/core.js";
import {
  renderHome, renderKits, renderKitDetail, renderCatalogo,
  renderProductDetail, renderComparador, renderBiblioteca,
  renderContacto, renderNotFound,
} from "./js/views.js";

const viewEl = document.getElementById("view");
const navEl = document.getElementById("main-nav");

function setActiveNav(path) {
  navEl.querySelectorAll("a").forEach((a) => {
    const target = a.getAttribute("href").replace("#", "");
    a.classList.toggle("active", target === path || (target === "/" && path === "/"));
  });
}

function runPowerOnSequence() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  document.body.classList.add("power-restoring");
  requestAnimationFrame(() => setTimeout(() => document.body.classList.remove("power-restoring"), 900));
}

async function main() {
  runPowerOnSequence();
  const data = await loadAll();
  const idx = buildIndices(data);
  const ctx = { data, idx, container: viewEl };

  const routes = [
    makeRoute([], () => { setActiveNav("/"); renderHome(ctx); }),
    makeRoute(["kits"], () => { setActiveNav("kits"); renderKits(ctx); }),
    makeRoute(["kit", ":id"], (p) => { setActiveNav("kits"); renderKitDetail(ctx, p); }),
    makeRoute(["catalogo"], () => { setActiveNav("catalogo"); renderCatalogo(ctx); }),
    makeRoute(["producto", ":sku"], (p) => { setActiveNav("catalogo"); renderProductDetail(ctx, p); }),
    makeRoute(["comparador"], () => { setActiveNav("comparador"); renderComparador(ctx); }),
    makeRoute(["biblioteca"], () => { setActiveNav("biblioteca"); renderBiblioteca(ctx); }),
    makeRoute(["contacto"], () => { setActiveNav("contacto"); renderContacto(ctx); }),
  ];

  initRouter(routes, () => { setActiveNav(""); renderNotFound(ctx); })();

  const toggle = document.getElementById("nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    navEl.addEventListener("click", (e) => { if (e.target.tagName === "A") document.body.classList.remove("nav-open"); });
  }
}

main();
