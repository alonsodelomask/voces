# Auditoría de Vocify (21/11/2026)

Han revisado la app nueve auditores, cada uno en un área. Después, tres investigaciones más han cubierto huecos: cómo convive la app vieja del iPhone con versiones nuevas, cómo te enteras de los fallos y el grupo probado con dos cantantes simulados. Otra pasada ha comprobado cada hallazgo. Aquí solo quedan los que se han confirmado del todo o en parte. Se han quitado los falsos y las cosas que ya existían. Cuando varias áreas encontraron lo mismo, el hallazgo aparece una sola vez con todos sus códigos (los `id` entre comillas invertidas).

**Esfuerzo:** S = menos de medio día · M = 1 o 2 días · L = una semana · XL = más.

> **Importante para el iPhone:** la web va metida dentro de la app. Por eso **cualquier arreglo de la web solo llega al iPhone con una compilación nueva** en EAS, que haces tú. Los cambios en Supabase (migraciones), en Render o en App Store Connect no necesitan compilar.


## Estado (22/11/2026): lo urgente ya arreglado

Aplicado esa misma noche, con pruebas y una revisión independiente de cada tanda. Pasan las 481 pruebas unitarias, las 45 del servidor, las 37 de navegador (ordenador y móvil), y `expo-doctor` da 21 de 21:

- **1 · La mezcla de ensayo es de cada uno.** Solo, Silencio, Ocultar y el volumen ya no se suben al grupo ni se pierden al llegar otra versión. La canción compartida sigue llevando esos campos con sus valores normales, para que la 1.0 suene (`src/cloud/mix.ts`).
- **2 · Ediciones a la vez.** La subida solo se hace si nadie ha cambiado la canción desde que la viste. Si choca, tus cambios se guardan aparte como «… (mis cambios)» y te queda la versión del grupo, con un aviso claro. Al abrir una canción del grupo se trae la versión más nueva. Las subidas que fallan se reintentan (`src/cloud/groupSync.ts`).
- **3 · Número de formato.** Si una canción la hizo una versión más nueva de la app, se abre en modo «solo ver» con el aviso «Actualiza la app para editarla». Falta el aviso de versión mínima de la app, que pide servidor o web pública: está pendiente.
- **5, 6 y 7 · Canciones de fuera.** Se revisan al entrar (`src/songCheck.ts`): no pueden ejecutar código ni congelar el visualizador. Un proyecto que ya existe se abre como copia y no machaca el tuyo.
- **8 · Se guarda al momento** al cambiar de canción, al abrir la biblioteca y al salir o pasar a segundo plano.
- **9 · iPhone.** Si iOS cierra la web, la app la vuelve a abrir, como mucho 3 veces por minuto, y avisa. La app muestra su versión y su compilación reales (al pie de la Ayuda).
- **13 · Invitar desde el iPhone** comparte `https://vocify.es/`.
- **14 · IA.** «Afinar con IA» ya cabe en el límite del servidor. Aplicar una propuesta conserva la letra. Con el servidor dormido dice «se está despertando» y la petición fallida no gasta cupo. El cupo diario ya no se puede saltar con peticiones a la vez.
- **15 · Cambiar el tempo** mueve también los inicios de compás.
- **17 · Correo real** quitado de `docs/BACKEND.md`. Sigue en el historial de Git: borrarlo de ahí exige reescribirlo y es decisión tuya.
- **18 · Servidor:** Hono y Zod al día. `npm audit` da 0 vulnerabilidades.

**Pendiente** (decisión o mano tuya): 4 (TestFlight con el cuarteto), 10 (vídeo en el iPhone), 11 (revocación de Apple, migración 006), 12 (contraste), 16 (presupuesto en OpenAI) y, del punto 3, la versión mínima de la app. Todo lo de la web solo llega al iPhone con una compilación nueva.

---

## 1. En pocas palabras

- **La base está sana.** El código compila sin errores. Pasan las 437 pruebas unitarias, las 40 del servidor y 30 de las 31 del navegador (la otra falla solo a veces). La web no tiene vulnerabilidades conocidas. Todas las tablas tienen reglas de acceso y no hay claves secretas en el repositorio. Crear y editar funciona bien y el aspecto está cuidado.
- **El fallo más serio está en el grupo, y ya se ha reproducido.** Con dos cantantes simulados (Ana y Bruno): el Solo y el Silencio de Bruno llegaron a Ana, y al darle a reproducir a ella solo le sonaba el Tenor. En las tres pruebas de ediciones a la vez se perdió el cambio de alguien, una vez sin dejar copia ni en el historial. Al volver a abrir la app se edita la copia vieja del dispositivo. Arreglarlo cuesta menos de lo que se pensaba: lo básico es S-M.
- **La 1.0 del iPhone vivirá meses y no se podrá cambiar.** La canción no lleva número de formato. Una app vieja edita y sube al grupo canciones guardadas por una versión más nueva sin enterarse, y si una versión nueva quita un campo como el volumen, la 1.0 deja de sonar (medido). La protección («esta canción es más nueva que la app: solo ver») tiene que ir en la compilación que se envía a revisión.
- **Las canciones que llegan de fuera no se revisan.** Un proyecto `.voces.json` recibido por WhatsApp puede ejecutar código en la app, sustituir sin avisar tu copia de esa canción o dejar el visualizador congelado.
- **La app aún no trata a cada cantante como alguien que aprende «su» voz.** En las líneas no pone qué voz es cada una. No se puede oír la nota de salida. El móvil se apaga a mitad del ensayo. En el iPhone, los botones de cada voz son diminutos.
- **Hoy solo te enteras de un fallo si un cantante se molesta en escribirte.** La app no avisa de sus errores ni muestra su versión, el servidor no avisa a nadie y nadie del cuarteto ha probado todavía la app en TestFlight.
- **Antes o justo después de la revisión de Apple** hay varios riesgos baratos de corregir: la app se queda en blanco si iOS cierra la web (y no llega ningún aviso), el vídeo puede cerrar la app, la revocación de «Iniciar sesión con Apple» puede perderse y la declaración de «Contraste suficiente» hoy no sería exacta.
- **Los tres movimientos más importantes:**
  1. Guardar la mezcla de ensayo solo en el dispositivo y hacer segura la sincronización del grupo.
  2. Preparar la compilación que va a revisión para que aguante meses en los iPhone: número de formato y «solo ver», versión visible, recuperar la pantalla en blanco, y una semana de TestFlight con el cuarteto antes de enviarla.
  3. Crear un modo de ensayo pensado para el cantante: «Mi voz», «Dar el tono», nombres de voz en las líneas y una forma de invitar al grupo con un enlace.

---

## 2. Primero, lo urgente

Son fallos reales y riesgos de perder datos, de seguridad o de la revisión de Apple. Están ordenados por gravedad.

| # | Qué pasa | Por qué es urgente | Esfuerzo | id |
|---|---|---|---|---|
| 1 | **El ensayo de una persona cambia la canción de todo el grupo.** Solo, Silencio, Ocultar y el volumen se guardan dentro de la canción. Pulsarlos no sube nada, pero en cuanto corriges una nota la canción sube con ellos. Medido: a Ana le llegó el Solo del Tenor de Bruno y solo le sonaba esa voz. Mientras están tocados, la app no trae los cambios de los demás y, al guardar, los pisa. | Es lo que más se hace en un cuarteto: cada uno pone su voz en solo. Puede borrar el trabajo de un compañero y deja canciones con voces calladas sin motivo aparente. **Ojo con cómo se arregla:** mientras exista la 1.0, la canción compartida debe seguir llevando «sin solo, sin silencio, volumen normal». Si se quitan esos campos, la 1.0 deja de sonar. | S | `uso-solo-se-sincroniza`, `ensayo-mezcla-compartida`, `hueco3-solo-silencio-viajan-al-grupo`, `hueco1-quitar-campos-rompe-la-1-0` |
| 2 | **Si dos personas editan a la vez, o una edita una copia vieja, se pierde trabajo sin aviso.** Reproducido en tres escenas. Al subir no se comprueba si otro cambió la canción: se sustituye entera. Si el aviso del grupo llega en el segundo y medio que tarda en subir tu cambio, tu cambio se borra de todas partes, también del historial, y Deshacer ya no sirve. Al volver a abrir la app se edita la copia del dispositivo sin mirar si el grupo tiene otra más nueva. Si una subida falla por falta de cobertura, no se vuelve a intentar. | Es el uso normal de un grupo que ensaya una vez por semana. La pérdida es invisible y el aviso que sale («Canción actualizada por tu grupo.») parece una buena noticia. | S-M (juntar los cambios voz por voz: M-L, después) | `datos-grupo-ediciones-a-la-vez`, `hueco3-subida-sin-comprobar-version`, `hueco3-carrera-borra-sin-rastro`, `datos-grupo-copia-vieja`, `hueco3-reabrir-copia-vieja`, `datos-grupo-subida-sin-reintento`, `codigo-main-ts-sincronizacion-grupo` |
| 3 | **La app 1.0 no sabrá que una canción es más nueva que ella.** La canción no lleva número de formato. Probado: una app vieja abre, edita y prepara para subir al grupo una canción de una versión nueva sin enterarse. No hay aviso de «actualiza la app». Y la app pasa a la web una versión fija «1.0.0», así que nadie sabe qué tiene cada teléfono. | La 1.0 seguirá meses en los iPhone de quien no actualice y no se puede cambiar después. La protección solo sirve si va en la compilación que se envía a revisión. Sin ella, cualquier cambio futuro en lo que se guarda (secciones, compases, Solo y Silencio aparte) tendrá que ser compatible con la 1.0 para siempre. | M | `hueco1-guardia-formato-en-la-1-0`, `hueco1-aviso-actualiza-la-app`, `hueco2-version-invisible` |
| 4 | **Nadie del cuarteto ha probado todavía la app en su iPhone.** En TestFlight solo hay un probador, que sigue «Invitado», y ninguna compilación tiene instalaciones. No está escrito cómo se manda un comentario ni dónde se lee. | Es la única forma, gratis y sin tocar código, de encontrar antes de la revisión los fallos que solo salen en un iPhone (micrófono, vídeo, AirPods, pantalla en blanco). Cada comentario llega con captura, modelo del teléfono y compilación. | S (sin compilar) | `hueco2-testflight-canal-del-cuarteto` |
| 5 | **Una canción que llega de fuera puede ejecutar código en la app.** El color y el identificador de cada voz se meten en la pantalla sin limpiar. Ese código podría llevarse tu sesión. | Pasarse archivos por WhatsApp es lo normal en un grupo, y la app está a punto de ir a la tienda. El arreglo es muy barato. | S | `codigo-html-en-cancion-de-fuera` (y, como segunda barrera más adelante, `seguridad-web-sin-csp`) |
| 6 | **Abrir un `.voces.json` sustituye sin avisar tu canción**, y si es del grupo también la del grupo, aunque el archivo sea más viejo. | Una copia antigua puede deshacer el trabajo reciente de todo el grupo. | S | `codigo-proyecto-importado-machaca` |
| 7 | **Una canción mal hecha congela el visualizador** hasta que recargas, y como la app abre la última canción, se vuelve a congelar en cada arranque. | Da la impresión de que la app está rota y nadie sabe por qué. | S (el parche dentro del bucle de dibujo) + M (la función que revisa las canciones) | `codigo-cancion-rota-congela` |
| 8 | **Se pierde el último cambio si cambias de canción enseguida o cierras la app en el iPhone.** El guardado espera 0,8 s y la app solo guarda al salir con un aviso del navegador que el iPhone casi nunca da. | Lo que se pierde es justo lo último que hiciste. | S | `codigo-cambio-perdido-al-cambiar-cancion`, `datos-guardar-al-salir`, `accesible-guardar-al-salir` |
| 9 | **iPhone: si iOS cierra la web por falta de memoria, la app se queda en blanco y no llega ningún aviso.** Pasa sobre todo al convertir audio, cargar el modelo de la letra o grabar vídeo. No cuenta como cierre de la app, así que no llega informe a TestFlight. Ojo: recargar la web no basta, porque su dirección interna (`app.voces.invalid`) no existe. Hay que volver a montar el WebView, que es el navegador interno de la app. | Si le pasa al revisor de Apple, la app parece rota. Son pocas líneas. Guardar una marca antes de las tareas pesadas permite explicar después: «Vocify se ha reiniciado porque el teléfono se quedó sin memoria». | S | `rendimiento-webview-sin-recuperar`, `hueco2-pantalla-vacia-sin-rastro` |
| 10 | **iPhone: el vídeo vertical viaja entero en un solo mensaje** (puede pasar de 100 MB) y puede cerrar la app. Además, sale «Vídeo guardado» aunque haya fallado. | La función se anuncia en la ficha de la App Store. | M | `accesible-video-puente-nativo` |
| 11 | **La revocación de «Iniciar sesión con Apple» puede perderse.** Si el servidor de Render está dormido, el código de Apple no llega. Y si «Eliminar mi cuenta» usa el plan B, el token se borra sin revocar. | Lo exigen la norma 5.1.1(v) de Apple y tu propia política de privacidad. Se arregla con una migración nueva (006) y un aviso para despertar el servidor. | S + S | `seguridad-borrado-fallback-pierde-apple`, `seguridad-apple-codigo-arranque-frio` |
| 12 | **«Contraste suficiente» no se cumple** en los botones rosa (3,6:1, cuando hacen falta 4,5:1), y `docs/APP_STORE.md` aconseja declararlo. | Lo que se declara a Apple debe ser verdad. Hasta corregirlo, **no marques esa casilla en App Store Connect** (no hace falta compilar). | S | `accesible-contraste-boton-principal` |
| 13 | **Invitar desde el iPhone comparte un enlace roto** (`https://app.voces.invalid/`). | Es el primer mensaje que reciben los cantantes invitados. | S | `mercado-invitacion-enlace-roto-app` |
| 14 | **IA: «Afinar con IA» falla casi siempre** (el servidor no admite peticiones de más de 2.000 caracteres). **Aplicar una propuesta borra la letra** de esa voz. **Con el servidor dormido, sale un falso «comprueba la conexión»** y la petición se descuenta del cupo. | Es la primera impresión de la IA, también para el revisor. Cada arreglo es pequeño. | S cada uno | `ia-fusion-limite-2000`, `ia-aplicar-borra-letra`, `ia-espera-servidor-dormido` |
| 15 | **Cambiar el tempo mueve las notas pero no los compases de la partitura.** Medido: de 60 a 120, una nota pasa de 4 s a 2 s y los inicios de compás siguen en 0, 4 y 8 s. Después, al mezclar la grabación, la app numera mal los compases. | Da números de compás equivocados hoy. Y las secciones con nombre que se quieren añadir tendrían el mismo problema si se guardan en segundos. | S | `hueco1-tiempos-en-segundos-se-desfasan` |
| 16 | **La IA no tiene un tope de gasto total.** El límite es de 40 peticiones al día por persona, y cualquiera puede crear cuentas. En el peor caso son unos 22 $ al día por cuenta, cargados en la cuenta de OpenAI que compartes con Baulify. | Una factura inesperada sería lo más dañino para un proyecto tan pequeño. **Hoy mismo, sin tocar código:** pon un presupuesto mensual en OpenAI que corte el gasto. | S | `seguridad-ia-sin-tope-global`, `mercado-modelo-sostenible-ia` |
| 17 | **Hay un correo real de una integrante en el repositorio público** (`docs/BACKEND.md:81`). | Es un dato personal expuesto en Internet y va contra la regla de usar datos ficticios. Seguirá en el historial de Git. | S | `seguridad-correo-real-en-repo` |
| 18 | **El servidor usa versiones de Hono y Zod con fallos publicados.** Una de ellas podría saltarse la comprobación de sesión. | Subirlas cuesta casi nada. Después, despliegas tú. | S | `codigo-dependencias-servidor` |

**Qué hacer con la versión que va a revisión.** La compilación 5 ya va por detrás de la web: le faltan las líneas de pentagrama. Conviene hacer una compilación 6 antes de enviar, con lo que no se puede añadir después: el número de formato y el «solo ver» (punto 3), los valores por defecto del volumen en el motor de audio (punto 1), la versión real del binario a la vista y recuperar la pantalla en blanco (punto 9). Después, una semana de TestFlight con el cuarteto, con un ensayo entero (punto 4). En App Store Connect, elige «Publicar manualmente» y activa la «Publicación por fases» para las actualizaciones: así una versión mala llega primero a poca gente y se puede pausar (`hueco1-app-sin-arreglo-rapido`, no hace falta compilar). Lo demás de la app (puntos 10, la parte de la app del 11 y 13) puede ir en la 1.0.1. Si la 1.0 ya está enviada sin la protección del punto 3, cualquier cambio en lo que se guarda en la canción tendrá que hacerse sin romper nada para la 1.0. La migración 006 (punto 11) y el presupuesto de OpenAI (punto 16) no dependen de compilar. Pasar `voces-api` al plan Starter de Render (7 $/mes) evitaría los arranques en frío durante la revisión. Es una decisión tuya.

---

## 3. Lo que más mejoraría el ensayo

Ordenado por lo que aporta frente a lo que cuesta. Lo primero es requisito de casi todo lo demás.

1. **Guardar la mezcla de ensayo solo en tu móvil** (S · `ensayo-mezcla-compartida`, `uso-solo-se-sincroniza`, `hueco3-solo-silencio-viajan-al-grupo`). Sin esto, cualquier modo de ensayo seguiría cambiando la canción del grupo. Mientras exista la 1.0, la canción compartida sigue llevando «sin solo, sin silencio, volumen normal» y la mezcla de cada uno se guarda aparte en su dispositivo (`hueco1-quitar-campos-rompe-la-1-0`).
2. **Poner el nombre de cada voz junto a su línea** (S · `uso-nombres-voz-en-lineas`). Hoy solo se distinguen por el color. La función de dibujo que pinta las etiquetas junto a las notas ya existe.
3. **«Dar el tono»**: oír la primera nota de cada voz desde el punto actual (S · `ensayo-dar-el-tono`, `uso-dar-la-nota`). El sintetizador ya sabe tocar una nota suelta (`engine.preview`).
4. **Que la pantalla no se apague mientras suena** (S, necesita compilar · `ensayo-pantalla-encendida`). En la app, con `expo-keep-awake`; en la web, con la función del navegador que mantiene la pantalla encendida (`wakeLock`).
5. **Modo «Mi voz»** (M · `ensayo-mi-voz`): con un toque, «Todas», «Mi voz destacada», «Mi voz a un oído» o «Sin mi voz». Además, tu línea más gruesa y el karaoke con tu letra. Es el método clásico de las pistas de aprendizaje.
6. **Una barra de voces que se toque con el dedo y botones grandes con nombre** (M · `uso-panel-voces-movil`, `accesible-panel-voces-ensayo`, `uso-botones-pequenos-movil`). Pastillas por voz sobre el reproductor y zona de toque de 44 px. El lector de pantalla diría «Escuchar solo Tenor» en vez de «S». Y la ✕ de eliminar voz, lejos de los demás botones.
7. **Compases bien contados y a la vista** (M · `ensayo-compases-descuadrados`, `uso-ensayo-compases`, `hueco1-tiempos-en-segundos-se-desfasan`). Usar los inicios de compás reales de la partitura (`barStarts`) para el Ensayo, el metrónomo y la cuenta atrás. Así una anacrusa (notas antes del primer compás completo) no descuadra la cuenta. Recalcular esos inicios al cambiar el tempo. Además: número de compás en el visualizador, el tramo marcado en la barra de posición, y ocultar «Desde/Hasta» con «Toda la canción».
8. **Que no salte el zoom al escribir en el iPhone** (S · `accesible-zoom-al-escribir-iphone`). Basta con letra de 16 px en los campos de las pantallas táctiles.
9. **La barra del editor en el móvil** (M · `uso-editor-movil-barra`). Dejar siempre a la vista el selector de voz y las herramientas de dibujar, borrar y mover, y el resto en «Más».
10. **Secciones con nombre y notas del director** («Estribillo», «respirar tras "mar"»), importadas de las marcas de ensayo del MusicXML, y bucle con un toque (M, editarlas con el dedo ya es L · `ensayo-secciones-y-notas`). Depende del punto 7. Guardar cada sección en pulsos o en número de compás, no en segundos: así una app vieja que cambie el tempo no la descoloca.
11. **Notas en Do, Re, Mi** (M · `uso-notas-do-re-mi`, `mercado-solfeo-do-re-mi`). Por defecto en español, también en los acordes y en los textos del asistente.
12. **Exportar la pista de ensayo de cada voz en audio**, para quien escucha en el coche o no instala la app (M · `ensayo-pista-audio`). Conviene empezar por WAV.
13. **Grabarme cantando con las demás voces y escucharlo** (M · `ensayo-grabarme`). Ojo: cambia el texto del permiso del micrófono («El audio no se guarda») y la política. Mejor después de la revisión de Apple.
14. **Ver al momento si vas afinado sobre tu línea** (L · `ensayo-afinacion-en-vivo`, `uso-cantar-encima`). Tararear ya enseña tu altura en directo; falta compararla con tu voz y dar un resumen por compases.
15. **IA más útil para el grupo**: crear voces «en bloque» con el mismo ritmo y la misma letra que la melodía (S · `ia-crear-voces-ritmo-letra`); respetar la tesitura de cada cuerda (M · `ia-tesitura-por-cuerda`); decir a la IA en qué compases, voz y tramo estás (S · `ia-contexto-compases-seleccion`); escuchar la propuesta antes de aplicarla (M · `ia-escuchar-propuesta`); y decir a cada cantante qué nota del acorde canta, sin IA y sin conexión (M · `ia-papel-en-el-acorde`).
16. **Oír la grabación real más despacio sin que cambie el tono** (M-L, hay que probarlo en un iPhone · `ensayo-grabacion-lenta`, `uso-grabacion-lenta`).
17. **Cambiar el tono solo para mí al ensayar** (S · `ensayo-tono-personal`).

---

## 4. Victorias rápidas (menos de medio día cada una)

**Que no se pierda nada**
- Guardar lo pendiente al cambiar de canción y cuando la app pasa a segundo plano · `codigo-cambio-perdido-al-cambiar-cancion`, `datos-guardar-al-salir`, `accesible-guardar-al-salir`
- Quitar Solo, Silencio, Ocultar y volumen de lo que se sube (dejarlos en su valor normal) y conservar los propios al ponerse al día · `hueco3-solo-silencio-viajan-al-grupo`
- No traer la versión del grupo mientras haya una subida pendiente o en marcha · `hueco3-carrera-borra-sin-rastro`
- Subir solo si la canción sigue siendo la versión que tenías; si no, guardar la tuya como copia «(mis cambios)» y avisar · `hueco3-subida-sin-comprobar-version`
- Al abrir una canción del grupo, al arrancar y al volver a la app, traer la del grupo si es más nueva · `hueco3-reabrir-copia-vieja`
- Escapar el color y el identificador de las voces · `codigo-html-en-cancion-de-fuera`
- Abrir un proyecto importado como copia, con un identificador nuevo · `codigo-proyecto-importado-machaca`
- Que un error no pare el bucle de dibujo, más un aviso general de errores (primer paso de «Informar de un problema») · `codigo-cancion-rota-congela`
- Recalcular los inicios de compás al cambiar el tempo · `hueco1-tiempos-en-segundos-se-desfasan`
- Pedir al navegador que no borre las canciones (`navigator.storage.persist()`) · `datos-pedir-almacenamiento-persistente`, `rendimiento-almacen-persistente`
- Arreglar los textos de «Borrar para siempre… de este dispositivo», que en realidad borra en toda la cuenta · `datos-borrar-para-siempre-engana`
- Avisar entre pestañas, o dejar activa solo una · `datos-dos-pestanas`

**iPhone y revisión de Apple**
- Invitar a los cuatro cantantes a TestFlight y escribir en `docs/BACKEND.md` cómo se manda un comentario (captura › «Compartir beta») y dónde se lee (App Store Connect › TestFlight › Comentarios) · `hueco2-testflight-canal-del-cuarteto`
- Elegir «Publicar manualmente» y la publicación por fases, y dejar escrito el plan B: «si la app falla, usad vocify.es en Safari» · `hueco1-app-sin-arreglo-rapido`
- Valores por defecto en el motor de audio (`v.volume ?? 0.8`), para que la 1.0 aguante canciones sin esos campos · `hueco1-quitar-campos-rompe-la-1-0`
- Leer la versión y la compilación reales del binario (con `expo-application`) y mostrarlas al pie de Ayuda, por ejemplo «Vocify 1.0.0 (compilación 6) · web 6283eba» · `hueco2-version-invisible`
- Volver a montar el WebView si iOS cierra la web · `rendimiento-webview-sin-recuperar`, `hueco2-pantalla-vacia-sin-rastro`
- Meter la revocación de Apple en la migración 006 y despertar `/health` al pulsar «Iniciar sesión con Apple» · `seguridad-borrado-fallback-pierde-apple`, `seguridad-apple-codigo-arranque-frio`
- Oscurecer el degradado de los botones y no declarar «Contraste suficiente» hasta entonces · `accesible-contraste-boton-principal`
- Decidir entre fijar la pantalla en vertical o compactar el modo horizontal · `accesible-apaisado`
- Letra de 16 px en los campos de las pantallas táctiles · `accesible-zoom-al-escribir-iphone`

**Ensayo**
- Nombres de voz en las líneas · `uso-nombres-voz-en-lineas`
- «Dar el tono» · `ensayo-dar-el-tono`, `uso-dar-la-nota`
- Pantalla encendida mientras suena · `ensayo-pantalla-encendida`
- Tono personal para ensayar · `ensayo-tono-personal`

**IA**
- Mandar la lista de diferencias de «Afinar con IA» dentro de la canción, no en la petición · `ia-fusion-limite-2000`
- Conservar la letra al aplicar una propuesta · `ia-aplicar-borra-letra`
- Despertar el servidor y distinguir «tarda demasiado» de «sin conexión» · `ia-espera-servidor-dormido`
- Crear voces en bloque nota a nota y con letra · `ia-crear-voces-ritmo-letra`
- Compases, voz activa y tramo en lo que se manda a la IA · `ia-contexto-compases-seleccion`
- Tope diario de gasto total en el servidor · `seguridad-ia-sin-tope-global`
- Mostrar «Te quedan N hoy» y leer el límite real · `ia-cupo-visible-y-justo`
- No mandar a OpenAI nombres de personas ni el título · `ia-nombres-a-openai`

**Crecimiento**
- Invitar con la dirección vocify.es · `mercado-invitacion-enlace-roto-app`
- Botón «Me han invitado: tengo un código» · `mercado-bienvenida-invitado`
- Acceso a la cuenta y al grupo desde la biblioteca, y una biblioteca vacía con «Abrir el ejemplo» y «Unirme a mi grupo» · `uso-biblioteca-sin-salida`, `uso-primera-vez-vacia`
- Enlace `?probar` en la web pública, enlace a «Qué es Vocify» y mejor título de la página · `mercado-raiz-muro-login`
- Imagen de vista previa de 1200×630 para WhatsApp y alta en Search Console (lo haces tú) · `mercado-seo-vista-previa`
- Firma «vocify.es», que se pueda quitar, en el vídeo exportado · `mercado-video-firma`
- Sección para directores en la web pública · `mercado-landing-directores`
- Palabras clave y ficha en español de México, para la próxima versión · `mercado-aso-palabras-clave`

**Mantenimiento y privacidad**
- Escribir en `docs/BACKEND.md` cómo volver atrás la web: Render › voces-web › Deploys › la última que funcionaba › Rollback. Al hacerlo, Render apaga la publicación automática: hay que volver a activarla cuando esté arreglado. Las canciones del grupo estropeadas se recuperan con «Historial de versiones» · `hueco1-web-sin-vuelta-atras`
- Una orden `npm test` que lance las 437 pruebas, añadida a la lista de AGENTS.md · `codigo-una-orden-para-probar-todo`
- Pasar a `scripts/` la prueba de dos cantantes sin nube (`dos-cantantes.mjs`), para comprobar los arreglos del grupo · `hueco3-prueba-grupo-sin-nube`
- Una prueba de «canción del futuro»: campos inventados en la canción, en una voz y en una nota que deben seguir ahí tras abrir, editar y subir · `hueco1-prueba-de-cancion-del-futuro`
- Subir Hono y Zod · `codigo-dependencias-servidor`
- Retirar la copia vieja de GitHub Pages · `codigo-copia-vieja-github-pages`
- Quitar el correo real del repositorio · `seguridad-correo-real-en-repo`
- Añadir Hostinger a la política de privacidad · `seguridad-politica-falta-hostinger`
- Migración 006: tamaño máximo de las canciones del grupo, quitar la regla de borrado directo y limitar los intentos con el código de invitación · `seguridad-canciones-grupo-sin-tamano`, `seguridad-borrado-salta-papelera`, `seguridad-codigo-invitacion-adivinable`
- Contar los fallos del servidor por día y tipo, sin datos personales (tabla nueva en la 006), y revisarla cada semana junto a Render › Logs · `hueco2-servidor-sin-avisos`
- Que soporte@vocify.es reenvíe una copia al correo que miras en el móvil, y apuntar su renovación (noviembre de 2027) junto a la de la clave de OpenAI (lo haces tú en Hostinger) · `hueco2-buzon-soporte-unico`
- Cambiar el servicio de correo (SMTP) y los límites de envío en Supabase (lo haces tú) · `mercado-correo-limite-hora`, `seguridad-cupo-correos`

**Batería y velocidad**
- Primer paso para ahorrar batería: no dibujar con la biblioteca o la entrada abiertas y no reescribir el contador de tiempo si no cambia · `rendimiento-bucle-sin-pausa`, `accesible-bucle-bateria`
- Suspender el audio tras la pausa · `rendimiento-audio-sigue-encendido`
- Calcular los acordes al soltar la nota, no en cada paso del arrastre · `rendimiento-acordes-en-cada-arrastre`
- Arranque sin copiar todas las canciones · `rendimiento-arranque-copia-todo`
- Usar primero lo guardado en la web sin conexión y limpiar los archivos de versiones antiguas · `rendimiento-sw-espera-red`, `rendimiento-cache-sw-crece`
- Biblioteca con fichas guardadas y una pequeña espera entre teclas al buscar · `rendimiento-biblioteca-cada-tecla`
- Tope de memoria para «Deshacer» · `rendimiento-deshacer-memoria`

**Accesibilidad e interfaz**
- Menú ⋮ sin opciones repetidas y otro icono para «Voces» · `uso-menus-duplicados`
- Que la ayuda se abra por el principio y en apartados · `uso-ayuda-larga`
- Barra espaciadora y menú ⋯ con teclado · `accesible-teclado-espacio-menu`
- Avisos que lea VoiceOver y diálogos con nombre · `accesible-lector-avisos-lienzo`
- Respetar «Reducir movimiento» en las chispas · `accesible-movimiento-reducido`
- Botón Atrás en Android · `accesible-android-atras`
- Limpiar el código sin usar y quitar `window.voces` de la versión publicada · `codigo-limpieza-menor`

---

## 5. Apuestas más grandes

| Apuesta | Esfuerzo | Cuándo tiene sentido | id |
|---|---|---|---|
| **Juntar los cambios del grupo voz por voz** («Ana cambió la soprano mientras tú también: ¿con cuál te quedas?»). Las voces ya tienen un identificador fijo. | M-L | Justo después de lo básico de la sincronización (no traer cambios con una subida pendiente y comprobar la versión al abrir y al subir). Antes no. | `datos-grupo-ediciones-a-la-vez`, `hueco3-subida-sin-comprobar-version` |
| **Aviso «actualiza la app» con una versión mínima** (tabla pública en Supabase o `version.json` en vocify.es), y «recarga la página» en la web | M | Leer la versión real del binario, ya en la compilación que va a revisión. El aviso, cuanto antes: es lo que permite retirar la 1.0. | `hueco1-aviso-actualiza-la-app` |
| **«Informar de un problema»**: un aviso cuando algo falla y un correo ya escrito, que envía el propio usuario, con versión, teléfono y últimos errores (nunca títulos, letras ni notas) | M | El aviso de errores en la web, ya. Abrir el correo desde la app necesita compilar, porque hoy la app bloquea los enlaces `mailto:`. Así la etiqueta de privacidad sigue en «Diagnóstico: No». | `hueco2-informar-problema` |
| **Arreglos rápidos sin pasar por la tienda** (`expo-updates`), solo para fallos | M | Si un fallo de la app tarda demasiado en arreglarse. Nunca para novedades (norma 2.5.2 de Apple). Necesita una compilación nueva. | `hueco1-app-sin-arreglo-rapido` |
| **Afinación en vivo sobre tu línea** | L | Después de «Mi voz» y de los compases bien contados, que necesita para el resumen. | `ensayo-afinacion-en-vivo`, `uso-cantar-encima` |
| **Grabación real más lenta sin cambiar el tono** | M-L | Cuando el grupo use mucho canciones con grabación. Antes hay que probar en un iPhone que no se desincroniza. | `ensayo-grabacion-lenta`, `uso-grabacion-lenta` |
| **Copia de seguridad de toda la biblioteca** (un .zip con las grabaciones) y recuperarla | M | Pronto: es la única red para las grabaciones y para quien no tiene cuenta. | `datos-copia-de-seguridad` |
| **Que se vea dónde está guardada cada canción** (en tu cuenta, solo aquí o sin subir) | M | A la vez que la copia de seguridad. | `datos-estado-cuenta-invisible`, `datos-grupo-subida-sin-reintento` |
| **Enlace para unirse al grupo.** Fase 1 solo en la web (`?unirse=`). Fase 2: enlaces universales (enlaces web que abren la app si está instalada) | M | La fase 1 ya, sin compilar. La fase 2, con la siguiente versión de la app. | `mercado-enlace-unirse-grupo` |
| **Sacar la sincronización del grupo de `main.ts`** para poder probarla con la nube de prueba | M (por pasos) | Al arreglar la sincronización. Conviene empezar por guardar lo pendiente al cambiar de canción. La prueba de dos cantantes ya permite comprobar cada paso. | `codigo-main-ts-sincronizacion-grupo`, `hueco3-prueba-grupo-sin-nube` |
| **Que la IA conteste solo el trozo que cambia** (unas 9 veces más corto y más barato) | M | Cuando se use la IA con frecuencia. Evita además respuestas cortadas. | `ia-respuesta-por-tramos` |
| **Android en Google Play** (12 personas probando durante 14 días) | M + espera | Empezar pronto la prueba cerrada si hay cantantes con Android. Mientras, la web instalable. | `mercado-android-google-play` |
| **Texto que crece con el «Tamaño del texto» del iPhone** | M (L si también crece el visualizador) | Si en el grupo hay personas con vista cansada, o para declararlo a Apple. | `accesible-texto-pequeno` |
| **Capturas de la App Store con frases** y las novedades | M | Con la próxima versión: solo se cambian al enviar una versión. | `mercado-capturas-mensaje` |
| **Política de contenido (CSP)**, una lista de los sitios desde los que la web puede cargar código | M | Después de escapar los campos de la canción. Probarla primero solo en modo aviso. | `seguridad-web-sin-csp` |
| **Probar con AirPods y, si suena a llamada, activar el micrófono solo al tararear** | M | Probarlo en TestFlight antes de tocar el código. | `accesible-audio-airpods` |
| **Basic Pitch en un hilo aparte** (Worker), para que la pantalla no se congele al convertir audio | M | Si convertir audio deja la app sin responder o iOS la cierra. | `rendimiento-basicpitch-memoria` |
| **Modelo «los cantantes gratis, paga quien crea el grupo»** | XL (decisión de negocio) | Solo si crece el uso y los costes. Choca con una decisión anterior (ver el apartado 7). | `mercado-modelo-sostenible-ia` |

---

## 6. Por área

### 6.1 Uso real de la app (recorrido con capturas)
Lo mejor es crear y editar. Lo que más falla es aprender tu voz: no se ve qué línea es cada voz ni en qué compás vas, y en el móvil el panel de voces tapa casi todo. Hay un fallo real: Solo y Silencio viajan al grupo.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| Solo, Silencio, Ocultar y el volumen viajan al grupo | Pisa el trabajo de otros | S-M | `uso-solo-se-sincroniza` |
| No pone qué línea es cada voz | Lo primero que necesita un cantante | S | `uso-nombres-voz-en-lineas` |
| Panel de voces que tapa la pantalla; M y S crípticos | Gesto central del ensayo en el iPhone | M | `uso-panel-voces-movil` |
| Ensayo por números de compás que no se ven | Repetir trozos es lo más habitual | M | `uso-ensayo-compases` |
| Barra del editor que esconde lo importante | No sabes en qué voz editas | M | `uso-editor-movil-barra` |
| No se puede oír la primera nota | Hace falta en cada entrada | S | `uso-dar-la-nota` |
| Notas solo en C, D, E | El público español lee Do, Re, Mi | M | `uso-notas-do-re-mi` |
| La biblioteca no lleva a la cuenta ni al grupo | El invitado no encuentra dónde unirse | S | `uso-biblioteca-sin-salida` |
| Botones de menos de 44 px | Toques equivocados | M | `uso-botones-pequenos-movil` |
| Menús que repiten opciones | Confunde | S | `uso-menus-duplicados` |
| Biblioteca vacía mientras suena el ejemplo | Mala primera impresión | S | `uso-primera-vez-vacia` |
| A 0,75× la grabación se calla | Se pierde la mejor ayuda | L | `uso-grabacion-lenta` |
| No se puede cantar y ver si vas afinado | Falta la ayuda de ensayo en casa | L | `uso-cantar-encima` |
| Ayuda larga que se abre por el final | Quien menos sabe se pierde | S | `uso-ayuda-larga` |

### 6.2 Funciones para ensayar en grupo vocal
Ya tiene velocidad, solo, silencio, volumen, bucle, metrónomo, karaoke y uso sin conexión. Le falta tratar a cada cantante como alguien que aprende su voz. La mayor oportunidad es el modo «Mi voz».

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| La mezcla de ensayo viaja al grupo | Bloquea y pisa cambios | S-M | `ensayo-mezcla-compartida` |
| Compases y metrónomo descuadrados con anacrusa | El bucle no ensaya lo pedido | M | `ensayo-compases-descuadrados` |
| Modo «Mi voz» (destacada, a un oído, sin ella) | Método estándar de aprendizaje | M | `ensayo-mi-voz` |
| El móvil se apaga a mitad del ensayo | Lo nota cualquiera | S | `ensayo-pantalla-encendida` |
| Botón «Dar el tono» | Evita otra app de diapasón | S | `ensayo-dar-el-tono` |
| Grabarme y escucharlo | Cierra el ciclo de aprendizaje | M | `ensayo-grabarme` |
| Afinación en vivo y resumen por compases | Como un profesor al lado | L | `ensayo-afinacion-en-vivo` |
| Grabación lenta con el mismo tono | Pasajes rápidos | M | `ensayo-grabacion-lenta` |
| Secciones con nombre y notas del director | Bucle con un toque | M | `ensayo-secciones-y-notas` |
| Pistas de ensayo en audio | Llega a quien no usa la app | M | `ensayo-pista-audio` |
| Tono personal al ensayar | Ensayar ronco sin tocar la canción | S | `ensayo-tono-personal` |

### 6.3 Mercado, primera impresión y crecimiento
El producto es mejor que el de la competencia: convierte cualquier partitura o grabación en voces en el propio teléfono. Pero el camino de un grupo nuevo está roto o es largo: el enlace de invitación es incorrecto, no hay enlace para unirse y la primera pantalla de vocify.es es un formulario de entrada.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| La invitación desde el iPhone lleva un enlace roto | Primer mensaje al grupo | S | `mercado-invitacion-enlace-roto-app` |
| No hay enlace para unirse de un toque | Pasar de 1 a 4-30 usuarios | M | `mercado-enlace-unirse-grupo` |
| La bienvenida no tiene «me han invitado» | 3 de cada 4 personas del cuarteto llegan así | S | `mercado-bienvenida-invitado` |
| vocify.es empieza por el formulario de entrada | Asusta a quien no es técnico | S | `mercado-raiz-muro-login` |
| Palabras clave con huecos; falta la ficha de México | Búsquedas en la tienda | S | `mercado-aso-palabras-clave` |
| Capturas sin texto y antiguas | Deciden si alguien instala | M | `mercado-capturas-mensaje` |
| La web no le habla al director | Quien decide es una persona | S | `mercado-landing-directores` |
| No sale en buscadores; vista previa recortada | Confianza al compartir | S | `mercado-seo-vista-previa` |
| Los vídeos no dicen «Vocify» | Publicidad gratis y sin rastreo | S | `mercado-video-firma` |
| Sin tope global de IA ni plan de costes | Riesgo de factura | S (el código) | `mercado-modelo-sostenible-ia` |
| 30 correos por hora | Registro de todo el coro a la vez | S (configuración) | `mercado-correo-limite-hora` |
| Do, Re, Mi | Encaja con el mercado hispano | M | `mercado-solfeo-do-re-mi` |
| Android sin preparar (14 días de prueba) | Cantantes con Android | M | `mercado-android-google-play` |
| Nunca pide valoración | Posición en la tienda | S (necesita compilar) | `mercado-pedir-valoracion` |

### 6.4 Código y mantenimiento
Está en buen estado: modo estricto, pruebas que pasan y web sin vulnerabilidades. Los problemas están en las canciones que llegan de fuera y en el estado repartido de `main.ts`.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| Una canción de fuera ejecuta código | Robo de sesión | S | `codigo-html-en-cancion-de-fuera` |
| Se pierde el último cambio al cambiar de canción | Pérdida silenciosa | S | `codigo-cambio-perdido-al-cambiar-cancion` |
| Un proyecto importado sustituye tu canción | Pisa la del grupo | S | `codigo-proyecto-importado-machaca` |
| Una canción rota congela el visualizador | Parece que la app está rota | S-M | `codigo-cancion-rota-congela` |
| Las 437 pruebas no están en la lista de comprobaciones | Lo no listado no se comprueba | S | `codigo-una-orden-para-probar-todo` |
| Hono y Zod con fallos publicados | Comprobación de sesión | S | `codigo-dependencias-servidor` |
| Copia vieja en GitHub Pages (42 cambios atrás) | Tercera versión sin mantener | S | `codigo-copia-vieja-github-pages` |
| `main.ts` concentra todo; el grupo no se puede probar | Origen de los fallos de guardado | M | `codigo-main-ts-sincronizacion-grupo` |
| Código sin usar; `window.voces` en la versión publicada | Confunde y deja herramientas internas al alcance | S | `codigo-limpieza-menor` |

### 6.5 Rendimiento y batería
La web carga deprisa (unos 548 KB, primera pintura en alrededor de 1 s) y lo pesado se carga solo cuando se usa. El mayor gasto es redibujar sin parar aunque no suene nada.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| Se redibuja sin parar en pausa y en la biblioteca | Batería en cada ensayo | M (primer paso S) | `rendimiento-bucle-sin-pausa` |
| Los acordes se recalculan en cada paso del arrastre | Editar va a saltos | S | `rendimiento-acordes-en-cada-arrastre` |
| WebView en blanco si iOS lo cierra, sin ningún aviso a nadie | La app parece rota y el fallo no se ve | S | `rendimiento-webview-sin-recuperar`, `hueco2-pantalla-vacia-sin-rastro` |
| Biblioteca lenta con muchas canciones | Buscar con retraso | S | `rendimiento-biblioteca-cada-tecla` |
| El arranque copia todas las canciones | Espera innecesaria | S | `rendimiento-arranque-copia-todo` |
| Sin conexión, la web espera a la red | Locales con poca cobertura | S | `rendimiento-sw-espera-red` |
| El audio sigue encendido en pausa | Batería | S | `rendimiento-audio-sigue-encendido` |
| HTML de 3,4 MB en el iPhone | Décimas de segundo; no compensa ahora | M | `rendimiento-html-movil-pesado` |
| Memoria retenida tras convertir audio | Más fácil que iOS cierre la web | M | `rendimiento-basicpitch-memoria` |
| No se pide almacenamiento persistente | Borrado por el navegador | S | `rendimiento-almacen-persistente` |
| La copia sin conexión crece sin límite | Espacio | S | `rendimiento-cache-sw-crece` |
| «Deshacer» guarda 150 copias enteras | Memoria con canciones largas | S | `rendimiento-deshacer-memoria` |

### 6.6 Accesibilidad y app del iPhone
Buena base: diálogos nativos, buen contraste del texto normal y el menú de la cuenta bien hecho. Los fallos están en lo que más se usa en el móvil (el panel de voces y los campos de texto) y en tres riesgos de la app nativa.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| Botones de voz de 26 px y sin nombre para VoiceOver | Función central del ensayo | S | `accesible-panel-voces-ensayo` |
| El vídeo pasa entero por el puente con la app | Puede cerrar la app | M | `accesible-video-puente-nativo` |
| Zoom al tocar un campo | Pantalla descolocada | S | `accesible-zoom-al-escribir-iphone` |
| Contraste de los botones principales (3,6:1) | Lo que se declara a Apple | S | `accesible-contraste-boton-principal` |
| AirPods con calidad de llamada (por probar) | Ensayar con auriculares | M | `accesible-audio-airpods` |
| La letra no crece con los ajustes del iPhone | Personas con vista cansada | M | `accesible-texto-pequeno` |
| Atrás cierra la app en Android | Primera queja en Android | S | `accesible-android-atras` |
| La mezcla no se guarda al cerrar la app | Ensayo deshecho | S | `accesible-guardar-al-salir` |
| Espacio y menú ⋯ con teclado | Uso con teclado | S | `accesible-teclado-espacio-menu` |
| VoiceOver no lee los avisos ni el lienzo | Requisito para declarar VoiceOver | S (avisos) / M (lienzo) | `accesible-lector-avisos-lienzo` |
| Repinta en pausa | Batería | S | `accesible-bucle-bateria` |
| No respeta «Reducir movimiento» (las chispas) | Mareo | S | `accesible-movimiento-reducido` |
| Título cortado en horizontal | El revisor suele girar el móvil | S | `accesible-apaisado` |

### 6.7 Seguridad, privacidad y servidor
Bien hecho en lo esencial: reglas de acceso en todas las tablas, sesión comprobada, peticiones validadas y sin secretos en el repositorio. Los fallos están en los bordes: el servidor dormido, la IA sin tope global y pequeños detalles de privacidad.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| IA sin tope de gasto total | Saldo compartido con Baulify | S | `seguridad-ia-sin-tope-global` |
| Borrar la cuenta por el plan B pierde la revocación de Apple | Norma de Apple y tu política | S | `seguridad-borrado-fallback-pierde-apple` |
| El código de Apple se pierde con el servidor dormido | Revocación imposible | S | `seguridad-apple-codigo-arranque-frio` |
| Correo real en el repositorio público | Dato personal | S | `seguridad-correo-real-en-repo` |
| Falta Hostinger en la política | RGPD y Apple | S | `seguridad-politica-falta-hostinger` |
| Cupo de 30 correos por hora agotable | Nadie recibe su código | S | `seguridad-cupo-correos` |
| Canciones del grupo sin tamaño máximo | Base de datos llena | S | `seguridad-canciones-grupo-sin-tamano` |
| Borrado definitivo que se salta la papelera | Pérdida sin vuelta atrás | S | `seguridad-borrado-salta-papelera` |
| Código de invitación corto y sin límite de intentos | Crece con la tienda | S | `seguridad-codigo-invitacion-adivinable` |
| Sin CSP | Segunda barrera | M | `seguridad-web-sin-csp` |
| Avisos de borrado que llegan a todas las cuentas conectadas | Filtración mínima | M | `seguridad-tiempo-real-borrados` |

### 6.8 Que nunca se pierda una canción
En el dispositivo es sólido: guardado por canción, papelera, diario de cambios pendientes y una buena sincronización de la cuenta. Los huecos están en el grupo y en la falta de copia de seguridad. Los fallos del grupo ya no son solo deducciones: se han reproducido con dos cantantes simulados (Ana y Bruno) en dos Chrome sin ventana, con Supabase y el «tiempo real» (el aviso instantáneo de cambios) de mentira. Ninguna subida comprueba la versión y el disparador del historial nunca rechaza nada: solo guarda copia si cambia el autor o han pasado 10 minutos.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| Solo y Silencio llegan a los demás (medido: a Ana solo le sonaba el Tenor) | Cambia lo que oye todo el grupo | S | `hueco3-solo-silencio-viajan-al-grupo` |
| Ediciones a la vez: se acepta cualquier subida y el cambio de uno se pierde | Uso central del cuarteto | S-M (voz por voz: M-L) | `datos-grupo-ediciones-a-la-vez`, `hueco3-subida-sin-comprobar-version` |
| Un aviso del grupo durante la subida borra tu cambio sin rastro | No queda ni en el historial | S | `hueco3-carrera-borra-sin-rastro` |
| Se abre la copia vieja aunque el grupo tenga una nueva | Deshaces el trabajo de otro | S | `datos-grupo-copia-vieja`, `hueco3-reabrir-copia-vieja` |
| «Borrar de este dispositivo» borra en toda la cuenta | El texto engaña y no se puede deshacer | S | `datos-borrar-para-siempre-engana` |
| No se pide almacenamiento persistente | Biblioteca sin cuenta | S | `datos-pedir-almacenamiento-persistente` |
| No hay copia de seguridad completa | Las grabaciones no tienen ninguna copia | M | `datos-copia-de-seguridad` |
| Una subida fallida al grupo no se reintenta | El grupo cree tener la última versión | M | `datos-grupo-subida-sin-reintento` |
| No se ve el estado de la cuenta | Falsa seguridad | M | `datos-estado-cuenta-invisible` |
| Últimos cambios perdidos al salir | Lo último que hiciste | S | `datos-guardar-al-salir` |
| Dos pestañas se pisan | Pérdida silenciosa | S | `datos-dos-pestanas` |
| Ordenador compartido: otra cuenta adopta tus canciones | Privacidad | M | `datos-ordenador-compartido` |
| Prueba repetible de dos cantantes sin entrar en Supabase | Sin ella, los arreglos no se pueden comprobar | S | `hueco3-prueba-grupo-sin-nube` |

### 6.9 Inteligencia artificial y funciones inteligentes
Lo que funciona sin conexión (revisar, acordes, crear voces, Whisper, Basic Pitch) está muy trabajado y es rápido. La IA de OpenAI funciona, pero tiene tres fallos que el grupo va a notar, y le falta contexto (compases, letra, tesitura de cada cuerda).

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| «Afinar con IA» falla con más de unas 20 diferencias | No funciona en el caso normal | S | `ia-fusion-limite-2000` |
| Aplicar una propuesta borra la letra | Trabajo perdido | S | `ia-aplicar-borra-letra` |
| Espera a ciegas y error falso | Primera impresión; cupo gastado | S | `ia-espera-servidor-dormido` |
| Crear voces «en bloque» no sigue ritmo ni letra | Hay que rehacerlas a mano | S | `ia-crear-voces-ritmo-letra` |
| No tiene en cuenta la tesitura de cada cuerda | Arreglos que no se pueden cantar | M | `ia-tesitura-por-cuerda` |
| La IA no sabe de compases ni de selección | Menos reintentos | S | `ia-contexto-compases-seleccion` |
| Reescribe la voz entera | Coste y tiempo | M | `ia-respuesta-por-tramos` |
| El cupo cuenta los fallos y no se ve | Justicia y control del gasto | S | `ia-cupo-visible-y-justo` |
| Mismo esfuerzo de razonamiento para todo | Medir antes de cambiar | S | `ia-esfuerzo-segun-tarea` |
| No se puede escuchar la propuesta antes de aplicarla | Se decide de oído | M | `ia-escuchar-propuesta` |
| Qué nota del acorde canta cada voz | Afinar a cappella, sin coste | M | `ia-papel-en-el-acorde` |
| Nombres de quien canta enviados a OpenAI | Promesa de privacidad | S | `ia-nombres-a-openai` |

### 6.10 Convivir con versiones viejas de la app
Hoy una app más vieja no estropea por las buenas una canción guardada por una versión más nueva: se ha probado que conserva los campos que no conoce. Los peligros de verdad son tres. La app vieja cambia el tempo y mueve las notas, pero deja en su sitio los datos que no conoce (compases, secciones). Si una versión nueva quita un campo como el volumen, la vieja deja de sonar. Y la vieja sigue subiendo al grupo el silencio de cada persona. No hay número de formato, ni aviso de «actualiza la app», ni pasos escritos para volver atrás la web. La app del iPhone no se puede arreglar sin otra revisión de Apple.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| La canción no lleva número de formato ni hay «solo ver» para canciones más nuevas | La 1.0 edita y sube canciones que no entiende | M | `hueco1-guardia-formato-en-la-1-0` |
| Si se deja de guardar el volumen de una voz, la 1.0 se queda muda (error medido en el motor de audio) | Decide cómo se arregla Solo y Silencio | S | `hueco1-quitar-campos-rompe-la-1-0` |
| Cambiar el tempo no mueve los compases guardados | Compases mal numerados al mezclar | S | `hueco1-tiempos-en-segundos-se-desfasan` |
| No hay aviso de «actualiza la app» y la versión que ve la web es siempre «1.0.0» | Retirar la 1.0 cuando haga falta | M | `hueco1-aviso-actualiza-la-app` |
| La web se publica sola con cada cambio y no hay pasos para volver atrás | Un fallo llega al grupo en minutos | S | `hueco1-web-sin-vuelta-atras` |
| Un fallo grave de la app solo se arregla con otra compilación y otra revisión | Uno o dos días con la app rota | S (publicar por fases) / M (`expo-updates`) | `hueco1-app-sin-arreglo-rapido` |
| Ninguna prueba vigila que se conserven los datos que la app no conoce | Protege lo que hoy funciona bien | S | `hueco1-prueba-de-cancion-del-futuro` |

### 6.11 Enterarse de los fallos
Hoy solo te enteras de un fallo si un cantante pulsa «Contáctanos», que abre la ayuda de vocify.es en Safari, y desde allí escribe a soporte@vocify.es. Dentro de la app no hay aviso de errores: se provocaron dos errores y el usuario no vio nada. No se muestra la versión. El servidor solo deja líneas en el registro de Render, que nadie mira y que dura unos 7 días. La gran oportunidad no cuesta código: usar TestFlight como canal de quejas del cuarteto antes de publicar. La pantalla en blanco por falta de memoria está en el apartado 6.5.

| Qué | Por qué importa | Esfuerzo | id |
|---|---|---|---|
| TestFlight sin usar: un solo probador, «Invitado», sin instalaciones | Única vía gratis para ver fallos en iPhones reales antes de la revisión | S | `hueco2-testflight-canal-del-cuarteto` |
| Los errores no se ven y no hay «Informar de un problema» (y los enlaces `mailto:` están bloqueados en la app) | Cada queja llega como «no me va» | M | `hueco2-informar-problema` |
| Nadie puede saber qué compilación tiene cada teléfono | Cada queja obliga a preguntar otra vez | S | `hueco2-version-invisible` |
| Los fallos del servidor solo quedan en un registro de pocos días | Un saldo agotado de OpenAI puede pasar semanas sin verse | S | `hueco2-servidor-sin-avisos` |
| El buzón de soporte también envía los correos para entrar y caduca sin recordatorio | Se perderían a la vez quejas, soporte de Apple y accesos | S | `hueco2-buzon-soporte-unico` |

---

## 7. Lo que no conviene hacer (por ahora)

- **Comunidad, perfiles públicos, reconocer partituras en PDF o en foto, instrumentos propios e insertar Vocify en otras webs.** Se descartaron a propósito en `docs/AUDITORIA_FLAT.md` y ningún hallazgo de esta auditoría los necesita.
- **Cobrar ahora («Vocify Grupo»).** La auditoría anterior descartó cobrar, y la app es gratis. El modelo «los cantantes gratis, paga quien crea el grupo» (`mercado-modelo-sostenible-ia`) queda como decisión tuya para el futuro, si crecen el uso y los costes. Lo de ahora es el presupuesto en OpenAI y el tope global.
- **Analítica de terceros, anuncios o rastreo para medir el crecimiento.** Van contra la privacidad primero. Search Console y la firma del vídeo no rastrean a nadie. Un CAPTCHA externo (Turnstile, `seguridad-cupo-correos`) añadiría un tercero: solo si hay abuso, y citándolo en la política.
- **Mandar los errores de la app a un servidor sin declararlo.** «Informar de un problema» debe enviarlo el propio usuario desde su correo. Si algún día se mandan a `voces-api`, hay que declarar «Diagnóstico» en App Store Connect y cambiar la política (`hueco2-informar-problema`).
- **Quitar campos de la canción o cambiar su significado mientras exista la 1.0.** En la canción se añaden campos, no se quitan. Conviene dejar esta regla escrita en AGENTS.md (`hueco1-quitar-campos-rompe-la-1-0`).
- **Subir el número de formato por cada novedad.** Solo cuando un campo nuevo dejaría la canción mal si la edita una app vieja (`hueco1-guardia-formato-en-la-1-0`).
- **Guardar secciones u otros momentos de la canción en segundos.** Mejor en pulsos o en número de compás (`hueco1-tiempos-en-segundos-se-desfasan`).
- **Usar `expo-updates` para novedades.** Solo para arreglar fallos: la norma 2.5.2 de Apple no deja cambiar funciones descargando código (`hueco1-app-sin-arreglo-rapido`).
- **Subir audio a un servidor** para la afinación en vivo, para grabarse o para la grabación lenta. Todo debe hacerse en el dispositivo, como propone cada hallazgo.
- **Grabarse y guardar el audio antes de la revisión de Apple** (`ensayo-grabarme`). Cambia el texto del permiso del micrófono y la política de privacidad. Mejor en una versión posterior.
- **Audio con la pantalla bloqueada.** `enableBackgroundPlayback` está en `false` a propósito. Es una decisión aparte, con su propia revisión de Apple. Por ahora basta con mantener la pantalla encendida.
- **Sacar el modelo de Basic Pitch del HTML del iPhone** (`rendimiento-html-movil-pesado`). Ahorra poco, en un iPhone real serían décimas de segundo, y la primera conversión dejaría de funcionar sin conexión.
- **Bajar la longitud máxima de respuesta de la IA a 16.000** (`seguridad-ia-sin-tope-global`, punto 2). Puede cortar respuestas buenas. Si se baja, mejor a unos 32.000 y midiendo antes.
- **Bajar el razonamiento en «Afinar con IA»** (`ia-esfuerzo-segun-tarea`). Necesita criterio musical. Primero hay que medir con peticiones reales.
- **Impedir el zoom con `maximum-scale=1`.** Bloquea también ampliar con dos dedos, que necesita quien ve mal. La solución es la letra de 16 px.
- **Activar `noUncheckedIndexedAccess`** en TypeScript: da 715 errores y aporta poco.
- **Reescribir `main.ts` de golpe.** Mejor por pasos, empezando por guardar lo pendiente al cambiar de canción.
- **Whisper con la tarjeta gráfica (WebGPU).** No se ha comprobado que el WebView del iPhone lo admita.
- **Cambiar el subtítulo de la App Store sin preguntarte.** Lo elegiste tú. Lo seguro es mejorar las palabras clave y añadir la ficha de México.

---

## 8. Lo que esta auditoría no ha podido comprobar

- **Nada se ha probado en un iPhone ni en un Android reales.** Estas cosas salen del código y de mediciones en Chrome, y hay que confirmarlas en TestFlight: la pantalla que se apaga, el corte del sonido en segundo plano o con una llamada, los AirPods, el tamaño real del vídeo por el puente, el zoom al escribir, el teclado que tapa los diálogos, si existe el menú de compartir dentro del WebView, si iOS da los avisos de salida de la página, el borrado de datos a los 7 días y el permiso de almacenamiento persistente.
- **La pantalla en blanco por falta de memoria** no se ha provocado en un iPhone real. El riesgo sale del código instalado de `react-native-webview` y de casos publicados. Una investigación propone recargar el WebView y otra dice que recargar no basta y hay que volver a montarlo: conviene comprobarlo en TestFlight.
- **El grupo contra Supabase real.** Los fallos del grupo se han reproducido con dos cantantes simulados, pero la regla de acceso, el orden de los disparadores y la comparación de datos se imitaron a partir de las migraciones 001 y 004, sin ejecutarlos en Postgres. Tampoco se comprobó si la fecha que llega por «tiempo real» tiene el mismo formato que la de la API, ni cómo se comporta el «tiempo real» con el iPhone en segundo plano o al reconectar (se simuló reteniendo el aviso). Las canciones de la cuenta (`personal_songs`) y los repertorios del grupo, que se sincronizan de otra forma, no entraron en esta prueba.
- **Versiones mezcladas de verdad.** No se hizo ninguna subida real con `pushSong`: se calculó lo que subiría con la misma expresión del código. Tampoco se probaron dos navegadores guardando a la vez la misma canción del grupo con versiones distintas de la app.
- **Los servicios en vivo:** Supabase, Render, OpenAI, App Store Connect y Hostinger. No se sabe si hay presupuesto en OpenAI, qué límites de envío de correos hay en Supabase, si está activada la confirmación del correo ni si las claves de Apple están en Render. No se sabe si en TestFlight está puesto el correo para comentarios, si los probadores tienen activados los comentarios, si soporte@vocify.es reenvía a otro correo, ni si en App Store Connect ya está elegida la publicación manual o por fases. No se ha llamado a la API de producción.
- **Render:** no se sabe cuántas publicaciones antiguas de la web guarda en el plan gratuito para volver atrás, ni cuántos días de registro da a los servicios gratuitos (su documentación da 7 días para el plan Hobby).
- **Apple y Expo:** no se comprobaron los límites gratuitos de EAS Update. Se citó la norma 2.5.2 de revisión de Apple. La página de Apple sobre informes de cierre no se pudo leer y se usaron la ayuda de Xcode y la de TestFlight. Este equipo es Windows: sin un Mac no hay Xcode, así que de los informes de cierre solo verás lo que llegue por TestFlight o App Analytics.
- **La IA real.** Los tiempos, los tokens y el coste son estimaciones a partir del tamaño del texto.
- **Calidad real con audio de verdad:** Basic Pitch, Whisper, la mezcla de grabación y partitura, Tararear y la grabación de vídeo (solo se han abierto sus ventanas).
- **VoiceOver y TalkBack de verdad** (se usó el árbol de accesibilidad de Chrome), el modo claro y no todos los diálogos con teclado.
- **El trabajo de la tarjeta gráfica** del visualizador: los resplandores no entran en las cifras de batería, así que el gasto real será algo mayor.
- **Seguridad:** de los 64 usos de `innerHTML` se revisaron a fondo solo algunos. Tampoco se ha comprobado que el fallo de Hono afecte de verdad a estas rutas.
- **La copia de GitHub Pages** no se abrió, para no mandar datos de la cuenta a un servicio externo. Sus fechas salen de Git.
- **No se ha compilado la app** (`npm run build:movil`, `expo-doctor`). La versión móvil solo se compiló en una carpeta temporal.
- **Un incidente menor:** un auditor usó por error un puerto que ya ocupaba otro, así que pudo crear una canción de prueba ficticia en el perfil temporal de Chrome de ese otro auditor. No toca el repositorio ni ningún servicio real. Las pruebas de las investigaciones de huecos usaron puertos propios (9431, 9437, 9441 y 9442), borraron sus canciones y sus perfiles temporales al terminar, y no tocaron el repositorio ni la nube.
- Las pruebas y las capturas de cada área están en `C:\Users\ALONSO~1\AppData\Local\Temp\claude\bdf6211c68ec5e54\0a87d037-cf8f-4d55-8c68-551af3ec547f\scratchpad\auditoria\` (subcarpetas uso, ensayo, mercado, codigo, rendimiento, accesible, datos, ia, hueco1, hueco2 y hueco3). Las más útiles para comprobar arreglos: `hueco1\pruebas\h1-campos-futuros.js` (canción del futuro), `hueco2\errores.mjs` (errores invisibles) y `hueco3\dos-cantantes.mjs` (grupo con dos cantantes, escenas `solo`, `avez`, `carrera` y `reabrir`).

