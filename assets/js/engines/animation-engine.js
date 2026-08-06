/* ======================================================================
   ANIMATION ENGINE — assets/js/engines/animation-engine.js
   ----------------------------------------------------------------------
   Regla de arquitectura (propietaria, 2026-08-05): toda experiencia
   audiovisual de Blueprint se implementa como un Engine independiente.

   Animation Engine reune todo el movimiento general del sitio que no es
   propio de un Engine mas especifico (Blackout Engine tiene su propia
   coreografia de apagon->luz; Hero Engine anima solo su propio video):

     - Reveal-on-scroll de secciones (Documento 05: fade + desplazamiento
       vertical, 300ms, nunca todas a la vez).
     - Transicion entre pantallas via View Transitions API (Documento 05,
       "Cambio entre Tarjeta y Ficha").
     - El fundido de entrada del body ("revealing") que sigue al apagon.

   Las tres comparten una sola regla de accesibilidad -- respetar
   prefers-reduced-motion -- que antes estaba duplicada en tres lugares
   (core.js, app.js x2). Vive una sola vez aca: prefersReducedMotion().
   ====================================================================== */

/** Unica fuente de verdad para "el visitante pidio menos movimiento".
 *  Antes duplicada en initScrollReveal (core.js) y en wireBlackout() +
 *  runRender() (app.js) -- consolidarla es la simplificacion que exige
 *  la regla 10 de arquitectura ("toda mejora debe simplificar el
 *  sistema"). */
export function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** Entrada de secciones al hacer scroll. Solo anima secciones que
 *  arrancan fuera del viewport -- lo que ya se ve al cargar la pantalla
 *  se muestra directo, sin parpadeo. Si el navegador no soporta
 *  IntersectionObserver, o el visitante pidio menos movimiento, todo se
 *  muestra sin animar (nunca depende de esto para ser legible). */
export function initScrollReveal(container) {
  if (!container || typeof IntersectionObserver !== "function") return;
  if (prefersReducedMotion()) return;
  const els = container.querySelectorAll(".section, .cta-band");
  if (!els.length) return;
  const vh = window.innerHeight || 800;
  const toObserve = [];
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < vh * 0.92) return; // ya visible: se muestra directo
    el.classList.add("reveal-io");
    toObserve.push(el);
  });
  if (!toObserve.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
  toObserve.forEach((el) => io.observe(el));
}

/** ---------------------------------------------------------------------
 *  View Transitions (Documento 05): navegar entre pantallas se siente
 *  como una continuacion, no como un corte. Para la tarjeta de kit que
 *  el visitante realmente toco, ademas se etiqueta su imagen para que
 *  el navegador haga un morph con la foto de la Ficha en vez de un
 *  crossfade generico. Se degrada sola (misma llamada, sin rama
 *  especial) en navegadores sin soporte o si el visitante pidio menos
 *  movimiento.
 *  ------------------------------------------------------------------- */
const VT_NAME = "kit-hero-transition";

function tagViewTransitionSource(e) {
  const a = e.target.closest('a[href^="#/kit/"]');
  if (!a) return;
  const card = a.closest(".kit-card");
  const media = card && card.querySelector(".kit-media");
  if (media) media.style.viewTransitionName = VT_NAME;
}

function clearViewTransitionNames() {
  document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => {
    el.style.viewTransitionName = "";
  });
}

/** Conecta la deteccion de "que tarjeta se toco" y devuelve `runRender`,
 *  la funcion que app.js usa para envolver cada render de ruta. Se
 *  llama una sola vez al arrancar la app. `viewEl` es el contenedor
 *  donde se pinta cada vista (para encadenar initScrollReveal despues
 *  de cada render, sin que app.js tenga que acordarse de hacerlo). */
export function initViewTransitions(viewEl) {
  document.addEventListener("click", tagViewTransitionSource, true);

  return function runRender(renderFn) {
    const supported = typeof document.startViewTransition === "function";
    const finish = () => initScrollReveal(viewEl);
    if (!supported || prefersReducedMotion()) {
      renderFn();
      finish();
      return;
    }
    const transition = document.startViewTransition(() => { renderFn(); finish(); });
    transition.finished.then(clearViewTransitionNames).catch(clearViewTransitionNames);
  };
}

/** Fundido de entrada del body justo despues de que la ceremonia de
 *  apagon revela el sitio (Blackout Engine llama a esto vía el callback
 *  `onReveal` que le pasa app.js, indirectamente, al iniciar la app). */
export function revealBody() {
  document.body.classList.add("revealing");
  setTimeout(() => document.body.classList.remove("revealing"), 1250);
}
