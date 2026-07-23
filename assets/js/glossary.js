/* ======================================================================
   BLUEPRINT VIEWER 2.0 — glossary.js
   ----------------------------------------------------------------------
   Explicaciones en lenguaje cotidiano de los terminos tecnicos que mas
   aparecen en el sitio (Panel, Inversor, Bateria, Garantia...). No es
   contenido comercial ni dato de ningun kit: es cultura general sobre
   como funciona un sistema solar, pensada para alguien que nunca
   trabajo con uno — la ama de casa, el guajiro con familia afuera que
   le mando el kit, el que solo quiere que la nevera no se dañe.

   termHint(key) devuelve un boton "?" que initGlossary() sabe abrir
   como un popover accesible (clic o tap, tambien teclado, se cierra
   con Escape o clic afuera). No depende de hover: en un celular no
   existe.
   ====================================================================== */

export const GLOSSARY = {
  panel: "El panel solar es el que \"agarra\" la luz del sol y la convierte en electricidad. Entre mas paneles tenga tu kit, mas energia puede generar mientras hay sol.",
  inversor: "El inversor es el corazon del sistema: convierte la energia del panel o la bateria en la corriente que usan tus aparatos — la nevera, las luces, el televisor.",
  bateria: "La bateria guarda la energia que no usaste durante el dia para dartela de noche, o justo cuando se va la corriente de la calle.",
  autonomia: "La autonomia es cuanto tiempo puede aguantar tu casa funcionando con la bateria llena, sin sol y sin corriente — depende de cuantos aparatos tengas prendidos.",
  garantia: "Los años que el fabricante responde por el equipo si se daña por su cuenta, sin que sea culpa tuya.",
  kw: "kW (kilovatio) mide que tan fuerte puede trabajar un equipo en un momento — entre mas kW tiene tu inversor, mas aparatos puede mover al mismo tiempo.",
  kwh: "kWh (kilovatio-hora) mide cuanta energia se puede guardar o gastar en total — entre mas kWh tiene tu bateria, mas tiempo te dura la luz.",
  offgrid: "Off-Grid quiere decir que el sistema puede funcionar sin depender de la corriente de la calle — pensado para donde el servicio es muy inestable.",
  hibrido: "Hibrido quiere decir que el sistema usa el sol cuando hay, y la corriente de la calle o la bateria cuando no hay — lo mejor de los dos mundos.",
};

/** Boton "?" inline. Se coloca justo despues de la etiqueta del
 *  termino (ej: "Inversor ${termHint('inversor')}"). */
export function termHint(key) {
  if (!GLOSSARY[key]) return "";
  return `<button type="button" class="term-hint" data-term="${key}" aria-label="Que es esto">?</button>`;
}

/** Wire global (una sola vez, ver app.js): delegacion de eventos para
 *  que termHint() funcione en cualquier vista, incluidas las que se
 *  vuelven a pintar dinamicamente. Un solo popover reutilizable,
 *  posicionado con getBoundingClientRect para que nunca quede cortado
 *  por un contenedor con overflow:hidden. */
export function initGlossary() {
  let popover = null;
  let openFor = null;

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement("div");
    popover.className = "term-popover";
    popover.setAttribute("role", "tooltip");
    document.body.appendChild(popover);
    return popover;
  }

  function close() {
    if (popover) popover.classList.remove("open");
    openFor = null;
  }

  function openAt(trigger) {
    const key = trigger.dataset.term;
    const text = GLOSSARY[key];
    if (!text) return;
    const pop = ensurePopover();
    pop.textContent = text;
    pop.classList.add("open");
    const width = Math.min(260, window.innerWidth - 32);
    pop.style.width = width + "px";
    const r = trigger.getBoundingClientRect();
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    pop.style.left = `${left}px`;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow > 130) {
      pop.style.top = `${r.bottom + 8}px`;
      pop.style.bottom = "auto";
    } else {
      pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
      pop.style.top = "auto";
    }
    openFor = trigger;
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".term-hint");
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      if (openFor === trigger) { close(); return; }
      openAt(trigger);
      return;
    }
    if (openFor && !e.target.closest(".term-popover")) close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  window.addEventListener("scroll", () => { if (openFor) close(); }, true);
  window.addEventListener("resize", () => { if (openFor) close(); });
}
