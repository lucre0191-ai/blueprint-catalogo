/* ======================================================================
   HERO ENGINE — assets/js/engines/hero-engine.js
   ----------------------------------------------------------------------
   Regla de arquitectura (propietaria, 2026-08-05): toda experiencia
   audiovisual de Blueprint se implementa como un Engine independiente.

   Hero Engine es responsable de la seccion "Hero Scene / Hero Film"
   al tope de la Ficha del kit (Documento 06, seccion 9.2; Documento 05B
   -- Cinematic Experience System). Hero Scene responde "que consigue el
   cliente" (el kit en una situacion real de uso) -- distinta de Hero
   Product (kitImage/kitVisual en core.js), que responde "que compra el
   cliente". Hero Film es la version cinematografica de la misma escena
   (video corto, sin sonido, loop); mientras no exista, Hero Scene se
   muestra sola como imagen fija -- nunca se inventa video ni se repite
   otra imagen.

   Hero Engine lee los datos ya resueltos desde core.js (kitScene) y
   delega la construccion del markup video/imagen a Media Engine: no
   duplica esa logica, y si mañana el patron "video con poster" cambia,
   el cambio vive en un solo lugar. Views.js solo llama a
   renderKitHero(catalog, name) -- no le importa como esta armado.
   ====================================================================== */

import { kitScene, escapeHtml } from "../core.js";
import { mediaElement } from "./media-engine.js";

/** Seccion narrativa "Hero Scene / Hero Film" de la Ficha del kit.
 *  Sin Hero Scene propia -> "" (la ficha omite la seccion entera, misma
 *  regla honesta que kitVisual() en core.js: nunca un placeholder
 *  generico en su lugar). */
export function renderKitHero(catalog, name) {
  const { scene, film } = kitScene(catalog);
  if (!scene) return "";
  const alt = escapeHtml(name || "");
  const visual = mediaElement({
    image: scene,
    video: film,
    alt,
    className: "kit-scene-media",
  });
  return `
    <section class="kit-scene-hero">
      ${visual}
      <div class="kit-scene-scrim" aria-hidden="true"></div>
      <p class="kit-scene-caption">${alt}</p>
    </section>`;
}
