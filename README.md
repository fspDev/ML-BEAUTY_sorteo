# Sorteo Creadores Beauty — Mercado Libre

App de kiosco para inscribir creadores de contenido y sortear un cupón de $200.000 en productos de Belleza.
Está pensada para una **TV táctil de 55" en vertical** conectada a una notebook **sin internet**. También se ve bien en horizontal.

## Cómo funciona

1. **Frase** (“¿Sos creador de contenido?…”) → a los 15 s pasa al **video** → cuando termina el video, vuelve a la frase, y así en loop.
2. Si alguien **toca la pantalla** → **formulario**: nombre, mail, celular, edad, si vive en Argentina, Instagram, TikTok y seguidores de cada red (tiene que completar al menos una red). Por las Bases (punto 3.3) no deja participar a menores de 18 ni a quien no vive en Argentina. Trae su propio teclado en pantalla.
   Abajo tiene que **tildar por separado** las **Bases y Condiciones** y la **Declaración de Privacidad**. Cada una tiene su QR (para leerla en el celular) (solo se accede por QR). Sin los dos tildes no deja participar.
3. Al confirmar → el **frasco**: su nombre cae adentro con los de los demás. Se pueden arrastrar con el dedo, sacudir el frasco con el botón o dándole un toque al vidrio. A los 30 s vuelve a la frase (siempre 30 s, se interactúe o no; se cambia en el panel).
4. **Sorteo**: botón **“Sorteo”** abajo a la derecha (visible en la pantalla de inicio y en la del frasco) → clave **3602**.
   - Solo pueden ganar quienes tengan **más de 10.000 seguidores en al menos una red** (no se suman: 9.000 + 2.000 no alcanza). Todos figuran igual en la lista y en el frasco; el contador muestra siempre el total; la regla se aplica solo al elegir al ganador.

El **logo** está arriba y el **QR** abajo a la izquierda en todas las pantallas, salvo mientras se reproduce el video (el QR tampoco se muestra en el formulario, porque ahí va el teclado). El QR lleva a https://www.mercadolibre.com.ar/l/afiliados?forceInApp=true (programa de Afiliados). Para cambiarlo: `npx qrcode -o images/qr.png -w 1000 -q 1 -e M -d 2D3277FF -l FFFFFF00 "<link>"`.

No se puede inscribir dos veces el mismo **mail**, **Instagram** ni **TikTok** (sin importar mayúsculas ni la @).

### Constancia del consentimiento (ByC y Declaración de Privacidad)

Cada inscripción guarda, además de los datos, **una constancia por documento**: `aceptaBases` / `aceptaPrivacidad` (el servidor rechaza inscripciones sin los dos), `aceptaBasesFecha` / `aceptaPrivacidadFecha` (fecha y hora exacta en que se tildó cada casilla, UTC), `…Version` (la versión del PDF, en `LEGAL` al principio de `js/app.js`: **cambiarla si cambia un documento**) y `…Texto` (el texto exacto de la casilla). Queda en `participantes.json`, en el historial `registro.log.jsonl` y como columnas en el Excel.

## Poner en marcha (en la notebook del evento)

1. Tiene que tener **Node.js** instalado (https://nodejs.org). Si no lo tiene, copiá `node.exe` dentro de esta carpeta.
2. Doble clic en **`INICIAR.bat`**.
   - Abre una ventana minimizada “Servidor Sorteo – NO CERRAR” (es la que guarda los datos en disco).
   - Abre Chrome (o Edge) en pantalla completa, modo kiosco.
3. Para salir del modo kiosco: **Alt + F4**.

> Configurá Windows para que la TV use la pantalla en **vertical** y que la notebook no se suspenda.

## Video

El video del loop es **`video/video.mp4`** (Totem Beauty Afiliados y Creadores). Para cambiarlo, reemplazá ese archivo. Si falta, la app se queda en la frase (vuelve a animarse cada 15 s).

## Bases y Condiciones y Declaración de Privacidad

- Los PDF están en `legal/bases.pdf` y `legal/privacidad.pdf`. Los QR apuntan a su copia publicada en GitHub Pages (https://fspdev.github.io/ML-BEAUTY_sorteo/legal/…), así que se leen desde el celular aunque la notebook no tenga internet.
- Si cambia algún documento: reemplazá el PDF (mismo nombre), actualizá la `version` en `LEGAL` al principio de `js/app.js` y subilo al repo. Los QR no cambian.
- Para imprimir: carpeta **`imprimir/`** → `QR-Bases-y-Privacidad.pdf` (hoja A4) y los QR sueltos en PNG y SVG.
- Por cada inscripto queda registrado: si aceptó cada documento, la **fecha y hora exacta** en que tildó cada uno y la **versión** aceptada (columnas nuevas en el Excel).

## Los datos (lo más importante)

Cada inscripción se guarda **dos veces**:

| Dónde | Qué hay |
|---|---|
| Carpeta **`data/`** (doble clic en `ABRIR DATOS.bat`) | `participantes.csv` (se abre en Excel), `participantes.json`, `sorteos.json`, `registro.log.jsonl` (historial que nunca se borra) y `backups/` con una copia por hora |
| El navegador del kiosco (carpeta `browser-profile/`) | Copia completa. Si el servidor se cae, se sigue guardando acá y se pasa al disco solo cuando vuelve |

Además, desde el panel se puede **descargar el Excel** y un **respaldo JSON** en cualquier momento.

**Al terminar el evento, copiá la carpeta `data/` a un pendrive.**

## Panel de control

**3 toques rápidos en el logo** (arriba al centro), sin clave. Con teclado físico: **Ctrl + Shift + A**. (La clave 3602 se sigue pidiendo para sortear y para archivar la lista.)

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
images/             logo y QR (Afiliados, Bases, Privacidad)
legal/              Bases y Condiciones y Declaración de Privacidad (PDF)
imprimir/           QR de Bases y Privacidad listos para imprimir
video/              video.mp4 del loop
```
