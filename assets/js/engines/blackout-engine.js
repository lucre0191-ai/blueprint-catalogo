/* ======================================================================
   BLACKOUT ENGINE — assets/js/engines/blackout-engine.js
   ----------------------------------------------------------------------
   Regla de arquitectura (propietaria, 2026-08-05): toda experiencia
   audiovisual de Blueprint se implementa como un Engine independiente.

   Blackout Engine es dueño de la ceremonia de entrada "apagon -> luz"
   (Documento 05B, "Guion Entrada"): el sitio recibe a cada visitante
   "apagado" y solo se revela cuando toca el interruptor (o Enter/
   Espacio) Y los datos ya terminaron de cargar -- lo que tarde mas de
   los dos. La escena de fondo (foto o, cuando exista, el video
   cinematografico corto) es markup estatico en index.html porque hoy es
   siempre la misma para todos los visitantes; si algun dia necesita
   variar (por mercado, por kit destacado, etc.) ese cambio queda
   contenido aca adentro, sin tocar el resto del sitio.

   No sabe nada de rutas ni de vistas: recibe una promesa con los datos
   ya cargados y, cuando ambas condiciones se cumplen, avisa via
   `onReveal(data, idx)` -- quien decide que hacer con eso (arrancar el
   router, en este sitio) es responsabilidad de quien lo llama (app.js). */

import { prefersReducedMotion } from "./animation-engine.js";

/** Arranca la ceremonia "apagon -> luz". Dos condiciones independientes
 *  tienen que cumplirse para revelar el sitio: que el visitante haya
 *  tocado el interruptor, y que los datos ya hayan terminado de cargar.
 *  Cualquiera de las dos puede llegar primero -- se maneja igual.
 *
 *  `dataPromise` resuelve a `{ data, idx }`.
 *  `onReveal(data, idx)` se llama exactamente una vez, cuando el sitio
 *  ya se revelo (clases blackout-* removidas del body). */
export function initBlackoutEngine(dataPromise, onReveal) {
  const blackout = document.getElementById("blackout");
  const hint = document.getElementById("blackout-hint");

  let clicked = false;
  let ready = null; // { data, idx } una vez que dataPromise resuelve
  let revealed = false;

  function tryReveal() {
    if (revealed || !clicked || !ready) return;
    revealed = true;
    document.body.classList.remove("blackout-active");
    document.body.classList.remove("blackout-pressed");
    onReveal(ready.data, ready.idx);
  }

  function activate() {
    if (clicked) return;
    clicked = true;
    document.body.classList.add("blackout-pressed");
    if (!ready) hint.textContent = "Encendiendo…";
    // Deja ver el destello del interruptor incluso si los datos ya
    // estaban listos -- si no, la ceremonia se sentiria "cortada". El
    // tiempo (550ms) esta afinado para el destello real (.blackout-burst,
    // 900ms) -- asi el flash ya se noto bien antes de que el apagon
    // empiece a desvanecerse encima.
    setTimeout(tryReveal, prefersReducedMotion() ? 60 : 550);
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
