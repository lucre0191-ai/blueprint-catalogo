# Blueprint OS — Guia de despliegue en GitHub Pages

Paso a paso para que el catalogo publico quede funcionando en una URL real
tipo `https://tu-usuario.github.io/tu-repo/`.

## Antes de empezar: que SI sube al repo publico y que NO

```
tu-repo/                    (PUBLICO)
├── index.html
├── assets/
│   ├── style.css
│   └── app.js
├── data/                   <- JSON ya filtrados (sin costos, sin clientes)
│   ├── catalogs.json
│   ├── kits.json
│   ├── config.json
│   ├── comparador.json
│   ├── products.json
│   ├── bom.json
│   ├── biblioteca_tecnica.json
│   ├── media.json
│   ├── showcase.json
│   └── content_blocks.json
├── media_blueprint/         <- tus fotos reales (las subes tu)
└── scripts/
    └── export_to_json.py    <- opcional, para regenerar data/ en el futuro
```

**`Blueprint_OS_Mod_7.xlsx` NUNCA va en este repo.** Tiene costos, margenes,
proveedores y datos de clientes. Guardalo en tu computadora, Google Drive,
o un repo de GitHub **privado** aparte si quieres versionarlo. La tabla
"CLASIFICACION DE DATOS" en la hoja `SYSTEM_CONFIG` del Excel es tu
referencia de que hoja es publica/privada/mixta si mas adelante agregas
algo nuevo al `data/`.

---

## Paso 1 — Crear el repositorio

1. Entra a [github.com](https://github.com) y crea una cuenta si no tienes.
2. Click en **New repository** (boton verde, o `+` arriba a la derecha).
3. Nombre del repo: lo que quieras, por ejemplo `catalogo-solar`.
   - Si lo llamas exactamente `tu-usuario.github.io`, el sitio queda en la
     raiz de tu dominio (`https://tu-usuario.github.io/`).
   - Con cualquier otro nombre, queda en una subcarpeta
     (`https://tu-usuario.github.io/catalogo-solar/`). Con las rutas
     relativas que ya corregimos, **ambos casos funcionan igual** — no
     tienes que preocuparte por elegir mal.
4. Marca **Public**.
5. NO marques "Add a README" (para que el repo quede vacio y sea mas facil
   subir todo de una vez). Click **Create repository**.

## Paso 2 — Subir los archivos (sin usar la terminal)

1. En la pagina del repo recien creado, click en **uploading an existing file**
   (o **Add file > Upload files**).
2. Del `site.zip` que te entregue, descomprimelo en tu computadora y
   arrastra **el contenido** de esa carpeta (no la carpeta misma) a la
   ventana del navegador: `index.html`, la carpeta `assets/`, la carpeta
   `data/`. GitHub preserva la estructura de carpetas al arrastrar.
3. Abajo, en "Commit changes", deja un mensaje corto (ej. "Primera version
   del catalogo") y click **Commit changes**.

> Alternativa mas rapida para el futuro (si te animas con la terminal):
> ```bash
> git clone https://github.com/tu-usuario/catalogo-solar.git
> cd catalogo-solar
> # copia index.html, assets/, data/, media_blueprint/ aqui
> git add .
> git commit -m "Actualizar catalogo"
> git push
> ```

## Paso 3 — Subir tus fotos reales

1. Dentro del repo en GitHub, click **Add file > Upload files** otra vez.
2. Crea la carpeta arrastrando fotos ya organizadas en subcarpetas por SKU
   (GitHub crea la carpeta sola si arrastras una carpeta completa desde tu
   computadora), respetando los mismos nombres que usaste en
   `MEDIA_LIBRARY` — por ejemplo:
   ```
   media_blueprint/SUNEVO-PAN-590W-001/principal.jpg
   media_blueprint/kits/K5-HYBRID/hero_RD_ES.jpg
   ```
3. Commit changes.
4. Si el nombre de archivo no coincide exacto con lo que dice `MEDIA_LIBRARY`/
   `CATALOGO_MASTER` en el Excel, esa card sigue mostrando el placeholder
   "Imagen pendiente" — no rompe el sitio, pero tampoco muestra la foto.

## Paso 4 — Activar GitHub Pages

1. En el repo, ve a **Settings** (pestaña arriba).
2. En el menu izquierdo, click **Pages**.
3. En "Build and deployment" → "Source", elige **Deploy from a branch**.
4. En "Branch", elige `main` y la carpeta `/ (root)`. Click **Save**.
5. Espera 1-2 minutos. GitHub te muestra un mensaje con la URL final,
   algo como `https://tu-usuario.github.io/catalogo-solar/`.

## Paso 5 — Probar que todo funcione

1. Abre la URL que te dio GitHub.
2. Deberias ver: fondo oscuro, retícula de celda solar, el titulo del
   catalogo, y las cards de los kits cargando (con placeholder si aun no
   subiste fotos).
3. Si algo no carga, abre las herramientas de desarrollador del navegador
   (F12 o clic derecho → Inspeccionar → pestaña **Console**) y busca
   errores en rojo. Los mas comunes:
   - `404` en algun `data/*.json` → revisa que la carpeta `data/` quedo
     exactamente donde dice el Paso 2, al mismo nivel que `index.html`.
   - `404` en una imagen → el nombre de archivo no coincide con
     `MEDIA_LIBRARY` (no es un error del sitio, es un archivo que falta).
4. Prueba en el celular tambien: abre la URL y toca **Solicitar por
   WhatsApp** en una card — debe abrir WhatsApp con el mensaje pre-llenado.

## Paso 6 — Actualizar el catalogo en el futuro

Cada vez que cambies algo en el Excel (nuevo kit, precio nuevo, catalogo
que pasa a "Listo"):

1. Corre el exportador: `python3 scripts/export_to_json.py Blueprint_OS_Mod_7.xlsx data`
2. En GitHub, entra a la carpeta `data/` del repo y sube los archivos
   `.json` nuevos (GitHub te deja reemplazar los que ya existen con el
   mismo nombre — solo arrastralos de nuevo y confirma "Commit changes").
3. GitHub Pages se vuelve a publicar solo, en menos de un minuto. No hay
   que tocar `index.html`, `assets/` ni nada mas — esa es literalmente la
   idea de haber separado el sitio (fijo) de los datos (`data/`, que
   cambian seguido).

## Opcional — Dominio propio

Si mas adelante quieres algo como `catalogo.tudominio.com` en vez de
`tu-usuario.github.io/...`: en **Settings > Pages > Custom domain**, escribe
tu dominio, y en tu proveedor de DNS agrega un registro CNAME apuntando a
`tu-usuario.github.io`. GitHub emite el certificado HTTPS solo, sin costo.
