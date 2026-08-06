/* ======================================================================
   MEDIA ENGINE — assets/js/engines/media-engine.js
   ----------------------------------------------------------------------
   Regla de arquitectura (propietaria, 2026-08-05): toda experiencia
   audiovisual de Blueprint se implementa como un Engine independiente,
   nunca como un componente aislado -- asi cada uno evoluciona sin tocar
   el resto del sitio.

   Media Engine es la capa mas basica de los cuatro Engines: no sabe nada
   de kits, catalogos ni de la ceremonia de apagon. Su unico trabajo es
   convertir un descriptor de medios ya resuelto (URLs de imagen/video
   que le pasa quien lo llama) en markup HTML seguro, con el patron
   "video con poster que cae a imagen fija si no hay video". Hero Engine
   lo usa hoy para la Ficha del kit; Blackout Engine podria usarlo manana
   si la escena de apagon se vuelve dinamica -- ninguno de los dos
   necesita reescribir esta logica.

   No hace fetch, no lee JSON, no decide reglas de negocio: solo arma
   markup a partir de lo que le dan. Esa separacion es lo que permite que
   cada Engine evolucione sin arrastrar a los demas.
   ====================================================================== */

/** Escapa un string para uso seguro dentro de atributos/texto HTML.
 *  Duplicado deliberadamente de core.js: Media Engine no importa nada
 *  de la capa de datos del sitio (cero acoplamiento hacia arriba). */
function escapeAttr(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ---------------------------------------------------------------------
 *  mediaElement(descriptor) -> string HTML
 *  ---------------------------------------------------------------------
 *  descriptor:
 *    - image      (string|null) URL de la imagen fija / poster del video.
 *    - video      (string|null) URL del video (mp4). Si no hay, se usa
 *                 solo la imagen.
 *    - alt        (string) texto alternativo para el <img>.
 *    - className  (string) clase CSS a aplicar al elemento visual.
 *    - loading    ("lazy"|"eager") solo aplica al <img>, default "lazy".
 *
 *  Si no hay `image` ni `video`, devuelve "" (ningun Engine inventa un
 *  placeholder generico: la vista que lo llama decide que hacer con una
 *  ausencia real de medios).
 *  ------------------------------------------------------------------- */
export function mediaElement({ image, video, alt = "", className = "", loading = "lazy" } = {}) {
  const safeImage = image ? escapeAttr(image) : "";
  const safeAlt = escapeAttr(alt);
  const safeClass = escapeAttr(className);

  if (video) {
    const safeVideo = escapeAttr(video);
    const posterAttr = safeImage ? ` poster="${safeImage}"` : "";
    return `<video class="${safeClass}" autoplay muted loop playsinline${posterAttr}>
         <source src="${safeVideo}" type="video/mp4">
       </video>`;
  }
  if (safeImage) {
    return `<img class="${safeClass}" src="${safeImage}" alt="${safeAlt}" loading="${loading}">`;
  }
  return "";
}
