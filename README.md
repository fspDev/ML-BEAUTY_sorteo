# Sorteo Creadores Beauty — Mercado Libre

App de kiosco para inscribir creadores de contenido y sortear un cupón de $200.000 en productos de Belleza.
Está pensada para una **TV táctil de 55" en vertical** conectada a una notebook **sin internet**. También se ve bien en horizontal.

## Cómo funciona

1. **Frase** (“¿Sos creador de contenido?…”) → a los 15 s pasa al **video** → cuando termina el video, vuelve a la frase, y así en loop.
2. Si alguien **toca la pantalla** → **formulario**: nombre, mail, Instagram, TikTok y seguidores de cada red (tiene que completar al menos una red). Trae su propio teclado en pantalla.
3. Al confirmar → el **frasco**: su nombre cae adentro con los de los demás. Se pueden arrastrar con el dedo, sacudir el frasco con el botón o dándole un toque al vidrio. A los 30 s vuelve a la frase (siempre 30 s, se interactúe o no; se cambia en el panel).
4. **Sorteo**: botón **“Sorteo”** abajo a la derecha (visible en la pantalla de inicio y en la del frasco) → clave **3602**.

El **QR** y el logo están arriba en todas las pantallas, salvo mientras se reproduce el video. El QR lleva a https://www.mercadolibre.com.ar/l/afiliados?forceInApp=true (programa de Afiliados). Para cambiarlo: `npx qrcode -o images/qr.png -w 1000 -q 1 -e M -d 2D3277FF -l FFFFFF00 "<link>"`.

No se puede inscribir dos veces el mismo **mail**, **Instagram** ni **TikTok** (sin importar mayúsculas ni la @).

## Poner en marcha (en la notebook del evento)

1. Tiene que tener **Node.js** instalado (https://nodejs.org). Si no lo tiene, copiá `node.exe` dentro de esta carpeta.
2. Doble clic en **`INICIAR.bat`**.
   - Abre una ventana minimizada “Servidor Sorteo – NO CERRAR” (es la que guarda los datos en disco).
   - Abre Chrome (o Edge) en pantalla completa, modo kiosco.
3. Para salir del modo kiosco: **Alt + F4**.

> Configurá Windows para que la TV use la pantalla en **vertical** y que la notebook no se suspenda.

## Video

Poné el video en **`video/video.mp4`**. Mientras no exista, la app se queda en la frase (vuelve a animarse cada 15 s).

## Los datos (lo más importante)

Cada inscripción se guarda **dos veces**:

| Dónde | Qué hay |
|---|---|
| Carpeta **`data/`** (doble clic en `ABRIR DATOS.bat`) | `participantes.csv` (se abre en Excel), `participantes.json`, `sorteos.json`, `registro.log.jsonl` (historial que nunca se borra) y `backups/` con una copia por hora |
| El navegador del kiosco (carpeta `browser-profile/`) | Copia completa. Si el servidor se cae, se sigue guardando acá y se pasa al disco solo cuando vuelve |

Además, desde el panel se puede **descargar el Excel** y un **respaldo JSON** en cualquier momento.

**Al terminar el evento, copiá la carpeta `data/` a un pendrive.**

## Panel de control

**3 toques rápidos en el logo** (arriba a la izquierda) → clave **3602**. Con teclado físico: **Ctrl + Shift + A**.

- **Inscriptos**: la lista completa (se puede eliminar alguno de prueba).
- **Sorteos**: historial de ganadores y suplentes.
- **Configuración**: segundos de la frase, tiempo de inactividad del formulario, tiempo en el frasco, sonido del video, y cómo se ven los nombres en el frasco (Nombre + inicial / completo / @usuario).
- **Archivar y vaciar**: para empezar otro evento. Guarda una copia en `data/archivado_…`; no borra nada del disco.

El sorteo usa un número aleatorio criptográfico (`crypto.getRandomValues`) sobre todos los inscriptos, no solo los que se ven en el frasco. Por defecto excluye a quienes ya salieron sorteados.

## Versión online (GitHub Pages)

Cada push a `main` publica la app en GitHub Pages con GitHub Actions. **Es solo para mostrarla o probarla**: ahí no hay servidor, así que cada navegador guarda sus inscriptos únicamente en sí mismo (el panel lo avisa en naranja). Para el evento usá siempre la notebook con `INICIAR.bat`.

## Para probar

- `http://localhost:3602/?pantalla=formulario` · `?pantalla=frasco` · `?pantalla=sorteo`
- Si se abre `index.html` directo (sin servidor), funciona igual pero guarda **solo en el navegador**. El panel lo avisa en naranja.

## Archivos

```
index.html          pantallas
css/styles.css      estilos (paleta y tipografía de ML-BEAUTY)
js/app.js           flujo, formulario, sorteo, panel
js/jar.js           frasco con física (matter.js)
js/keyboard.js      teclado en pantalla
js/db.js            guardado doble (disco + navegador)
server.js           servidor local sin dependencias (puerto 3602)
lib/, fonts/        matter.js y Montserrat locales (funciona offline)
images/             logo y QR
video/              acá va video.mp4
```
