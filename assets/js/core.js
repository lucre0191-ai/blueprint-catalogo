/* ======================================================================
   BLUEPRINT VIEWER 2.0 — core.js
   ----------------------------------------------------------------------
   Capa de datos y utilidades compartidas. Lee /data/*.json, generados
   por scripts/export_to_json.py, SIN modificar su estructura.

   Regla de oro heredada del exportador: si un dato no esta o vino roto
   ("(bloque no encontrado)" es el texto que deja un cruce INDEX/MATCH
   fallido en Excel), la interfaz lo trata como ausente y cae a un campo
   real alternativo o a un estado vacio explicito. Nunca se inventa
   contenido comercial para rellenar un hueco.
   ====================================================================== */

export const DATA_FILES = [
  "products", "kits", "kit_components", "media", "showcase",
  "catalogs", "content_blocks", "comparador", "biblioteca_tecnica",
  "config", "bom",
];

/** Carga los 11 JSON en paralelo. Si alguno falta, la app sigue viva
 *  con ese dataset en null (cada vista decide como degradar). */
export async function loadAll() {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      try {
        const res = await fetch(`data/${name}.json`);
        if (!res.ok) throw new Error(res.status);
        return [name, await res.json()];
      } catch (err) {
        console.warn(`No se pudo cargar data/${name}.json`, err);
        return [name, null];
      }
    })
  );
  return Object.fromEntries(entries);
}

/** Normaliza valores rotos o vacios (ver "Regla de oro" arriba). */
export function clean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === "(bloque no encontrado)") return null;
    return t;
  }
  return v;
}

/** Primer valor no vacio de una lista de candidatos (fallback en cadena). */
export function firstOf(...candidates) {
  for (const c of candidates) {
    const v = clean(c);
    if (v !== null) return v;
  }
  return null;
}

export function fmtUSD(n) {
  if (typeof n !== "number") return null;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtNum(n, decimals = 1) {
  if (typeof n !== "number") return "—";
  return Number(n.toFixed(decimals)).toString();
}

export function waDigits(raw) {
  return (raw || "").replace(/[^\d]/g, "");
}

export function whatsappLink(number, text) {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}

export function slug(text) {
  return (text || "item")
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ruta de imagen tal cual viene del JSON (ya es relativa, ver README:
 *  media_blueprint/SKU/archivo.jpg, sin "/" inicial). null si no hay dato. */
export function img(path) {
  return clean(path);
}

/* ---------------------------------------------------------------------
   Indices en memoria: evitan recorrer arrays completos en cada render.
   --------------------------------------------------------------------- */
export function buildIndices(data) {
  const products = data.products || [];
  const kits = data.kits || [];
  const media = data.media || [];
  const catalogs = data.catalogs || [];
  const showcase = data.showcase || [];
  const biblioteca = data.biblioteca_tecnica || [];
  const kitComponents = data.kit_components || {};
  const contentBlocks = data.content_blocks || [];

  const productsBySku = new Map(products.map((p) => [p.SKU, p]));
  const mediaBySku = new Map(media.map((m) => [m.SKU, m]));
  const showcaseBySku = new Map(showcase.map((s) => [s.SKU, s]));
  const bibliotecaBySku = new Map(biblioteca.map((b) => [b.SKU, b]));
  const kitsById = new Map(kits.map((k) => [k.Kit_ID, k]));

  const catalogsByKit = new Map();
  for (const c of catalogs) {
    if (!c.Kit_ID) continue;
    if (!catalogsByKit.has(c.Kit_ID)) catalogsByKit.set(c.Kit_ID, []);
    catalogsByKit.get(c.Kit_ID).push(c);
  }

  const contentBlocksByGroup = new Map();
  for (const b of contentBlocks) {
    if (!b.Block_Group) continue;
    if (!contentBlocksByGroup.has(b.Block_Group)) contentBlocksByGroup.set(b.Block_Group, []);
    contentBlocksByGroup.get(b.Block_Group).push(b);
  }

  return {
    products, kits, media, catalogs, showcase, biblioteca, contentBlocks,
    kitComponents,
    productsBySku, mediaBySku, showcaseBySku, bibliotecaBySku,
    kitsById, catalogsByKit, contentBlocksByGroup,
  };
}

/** Catalogo comercial de un kit para un mercado dado (o el primero
 *  disponible si el mercado pedido no tiene fila propia). */
export function catalogFor(idx, kitId, market) {
  const rows = idx.catalogsByKit.get(kitId) || [];
  if (!rows.length) return null;
  const forMarket = rows.filter((r) => r.Mercado === market);
  const pool = forMarket.length ? forMarket : rows;
  return [...pool].sort((a, b) => (a.Orden || 999) - (b.Orden || 999))[0];
}

export function marketsFrom(catalogs) {
  return [...new Set((catalogs || []).map((c) => c.Mercado).filter(Boolean))];
}

/** ---------------------------------------------------------------------
 *  Imagen propia del kit — NUNCA la de un componente.
 *  ---------------------------------------------------------------------
 *  Fuente unica: catalogs.json -> Imagen_Principal. Es el unico campo
 *  del contrato pensado para representar al KIT como producto
 *  comercial (ver README del exportador).
 *
 *  Regla dura: esta funcion jamas cae en Imagen_Panel / Imagen_Inversor
 *  / Imagen_Bateria ni en la foto del primer componente del BOM. Esos
 *  campos son honestos para mostrar "que trae el kit" (una galeria de
 *  piezas), pero no son una fotografia del kit en si. Usarlos como
 *  imagen principal hace que kits distintos que comparten el mismo
 *  panel o inversor se vean identicos entre si — ese fue el bug
 *  reportado ("todos los kits muestran la misma imagen").
 *
 *  Estrategia de fallback (documentada, no silenciosa): si el kit no
 *  tiene Imagen_Principal asignada en el Excel, esta funcion devuelve
 *  null. La vista (mediaImage() en views.js, o el generador de PDF)
 *  debe entonces mostrar un estado "Imagen pendiente" explicito —
 *  nunca inventar ni tomar prestada una imagen que no pertenece al kit. */
export function kitImage(catalog) {
  return catalog ? clean(catalog.Imagen_Principal) : null;
}

/** Componentes NO opcionales de un kit (lo que siempre viene incluido). */
export function includedComponents(idx, kitId) {
  return (idx.kitComponents[kitId] || []).filter((c) => !c.Opcional);
}

/** Componentes opcionales de un kit = ampliaciones reales, no inventadas. */
export function optionalComponents(idx, kitId) {
  return (idx.kitComponents[kitId] || []).filter((c) => c.Opcional);
}

/** Garantia real del kit: la mayor garantia entre sus componentes
 *  incluidos (dato calculado, no un campo de marketing roto). */
export function kitWarrantyYears(idx, kitId) {
  const included = includedComponents(idx, kitId);
  const years = included.map((c) => c.Garantia_Anios).filter((n) => typeof n === "number");
  return years.length ? Math.max(...years) : null;
}

/* ---------------------------------------------------------------------
   Router hash-based: compatible con GitHub Pages (sin backend, sin
   configuracion de servidor). Formato: #/ruta/param
   --------------------------------------------------------------------- */
export function initRouter(routes, fallback) {
  function currentPath() {
    const hash = location.hash.replace(/^#/, "") || "/";
    return hash.split("?")[0];
  }
  function resolve() {
    const path = currentPath();
    const segments = path.split("/").filter(Boolean);
    for (const route of routes) {
      const match = route.match(segments);
      if (match) {
        window.scrollTo(0, 0);
        route.handler(match);
        return;
      }
    }
    fallback();
  }
  window.addEventListener("hashchange", resolve);
  window.addEventListener("DOMContentLoaded", resolve);
  return resolve;
}

/** Helper para declarar una ruta: route(["kit", ":id"], (params) => {...}) */
export function makeRoute(pattern, handler) {
  const parts = pattern;
  return {
    handler,
    match(segments) {
      if (segments.length !== parts.length) return null;
      const params = {};
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
        else if (parts[i] !== segments[i]) return null;
      }
      return params;
    },
  };
}

/** Estado de UI compartido entre vistas (mercado activo, seleccion del
 *  comparador). No se persiste: vive solo mientras dura la sesion. */
export const state = {
  market: null,
  compareKits: [],
  compareComponents: {},
};
