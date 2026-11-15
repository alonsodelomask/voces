# Auditoría de la biblioteca de flat.io y propuesta para Vocify (15/11/2026)

Petición del usuario: «Me falta en vocify.es un gestor de archivos como el de flat.io». Revisada la biblioteca de Flat (`flat.io/library`) con su cuenta, sin cambiar nada. Se copian **las ideas y las funciones**, no el aspecto: Vocify mantiene su diseño (fondo oscuro y neón).

## 1. Qué tiene flat.io

### Pantalla principal («Tu biblioteca › Tus partituras»)
- **Pantalla completa**, no un diálogo. A la izquierda, una barra lateral fija con:
  - «Tus partituras» y el número total;
  - el botón grande «Crear una partitura»;
  - las listas de reproducción;
  - la papelera, abajo del todo, con su número.
- **Cabecera** con el título, «26 partituras», un buscador y un botón que muestra u oculta la barra de filtros.
- **Lista en filas**, cada una con:
  - una casilla para seleccionarla;
  - un icono;
  - el **nombre**, y debajo los **instrumentos** («Trompeta | Trompeta | Trompeta | Trompeta»);
  - la fecha **relativa** («hace 4 días», «el año pasado»);
  - el **estado** («🔒 Solo yo»);
  - el botón **⋯**.
- **Ordenar** pulsando la cabecera de la columna: por Nombre (A→Z) o por Actualizado (con flecha de sentido).
- **Carga por tramos**: 20 filas y más al bajar («1/20 seleccionadas»).

### Filtros (fichas desplegables en una barra)
| Filtro | Opciones |
| --- | --- |
| Privacidad | Privado, Público, Compartido |
| Creado por | Yo, Comunidad |
| Listas de reproducción | una por lista |
| Fecha | intervalo |

Al elegir uno aparece como ficha activa («Listas de reproducción: …») con un botón **«Limpiar»**.

### Menú ⋯ de cada partitura
Abrir · Agregar a la lista de reproducción · Duplicar · **Historial** (versiones) · Renombrar · Borrar · Publicar · Compartir y colaborar.

### Selección múltiple
Al marcar una casilla, la cabecera cambia a «1/20 seleccionadas» y ofrece **Agregar a la lista de reproducción**, **Duplicar** y **Borrar**. La casilla de la cabecera marca todas.

### Crear una partitura (menú del botón)
- **Nueva partitura**: desde cero.
- **Importar PDF o fotos**: reconoce una partitura impresa.
- **Importar archivo**: MusicXML, MIDI, MuseScore, Guitar Pro, PowerTab, ABC…

### Listas de reproducción (carpetas)
- Se ordenan por Recientes o Alfabético, y tienen botón «+» y menú ⋯ cada una.
- Abrir una lista enseña **la misma pantalla, filtrada por ella**. Si está vacía, sale un mensaje que explica qué hacer.
- «Colaboraciones» es una lista especial con las partituras que otros comparten contigo.

### Papelera
Borrar no es definitivo: lo borrado **se guarda 90 días** y se puede recuperar; después se elimina solo.

### Compartir y colaborar (ventana pequeña junto a la fila)
- Copiar un **enlace privado** (quien lo tenga puede verla).
- Compartir públicamente con la comunidad.
- **Añadir colaboradores para ver o editar**, en tiempo real.
- Incrustarla en una web.
- «Avanzado».

## 2. Qué tiene hoy Vocify

- **«Mis canciones»** (Menú › Mis canciones) es un **diálogo**, no una pantalla. Tiene un buscador por título y «＋ Nueva».
- Cada fila muestra:
  - el título;
  - «☁ Grupo» si está compartida;
  - el número de voces y de notas, y la fecha;
  - cuatro botones de icono: ✎ cambiar el nombre, ⧉ duplicar (con su grabación), ⊘ quitar del grupo y ✕ eliminar.
- **Borrar es definitivo** («No se puede deshacer»). Si la canción tiene grabación, también se borra.
- **No hay** orden, filtros, carpetas ni selección múltiple.
- **Las canciones del grupo están en otro sitio**: *Menú › Grupo y cuenta*, en una lista aparte con quién la cambió y cuándo. Desde la biblioteca solo hay un aviso que remite allí.
- Las canciones se guardan en `localStorage` (`voces.songs.v1`), en un solo bloque. Las grabaciones van en IndexedDB.
- En la nube, la tabla `songs` guarda la última versión de cada canción del grupo. **No hay historial de versiones.**

## 3. Qué copiar, qué adaptar y qué no

| De flat.io | Para Vocify | Por qué |
| --- | --- | --- |
| Biblioteca a pantalla completa con barra lateral | **Copiar** | Es lo que más se echa en falta: verlo todo de un vistazo |
| Nombre y debajo los instrumentos | **Copiar con las voces**: «Unai · Oskitz · Pablo · Markel», y 🎙 si tiene grabación | En un grupo vocal, lo que distingue un arreglo de otro son sus voces |
| Fecha relativa («hace 4 días») | **Copiar** | Se lee más rápido |
| Columna «Estado» (privacidad) | **Adaptar**: «En este dispositivo» o «☁ Txapela» (el grupo), y un aviso si hay cambios sin subir | Vocify no es público. Lo que importa es dónde está cada canción |
| Ordenar por nombre o por fecha | **Copiar**, más «Creada» | |
| Buscador | **Mejorar**: buscar también en voces, letra y autor | Vocify ya tiene esos datos |
| Filtros en fichas con «Limpiar» | **Adaptar**: Dónde (Este dispositivo / cada grupo), Con grabación, Con letra, Lista | Privacidad y Comunidad no aplican |
| Menú ⋯ por canción | **Copiar** con: Abrir · Cambiar el nombre · Duplicar · Añadir a un repertorio · Compartir con el grupo / Quitar del grupo · Exportar (MusicXML, MIDI, vídeo) · Mover a la papelera | Junta en un sitio lo que hoy está repartido |
| Selección múltiple con barra de acciones | **Copiar**: Añadir a un repertorio, Duplicar, Exportar, Mover a la papelera | Para ordenar muchas canciones de una vez |
| Listas de reproducción | **Adaptar como «Repertorios»** (p. ej. «Concierto de Navidad», «Ensayo del jueves»), con orden propio y «Tocar todo seguido» | Para un grupo vocal es más útil que una carpeta |
| Papelera con plazo | **Copiar**: 30 días en el dispositivo, con «Recuperar» y «Vaciar» | Hoy un toque mal dado borra una canción y su grabación sin vuelta atrás |
| Crear: Nueva / Importar | **Copiar el menú** con lo que ya existe: Nueva · Importar partitura · Importar audio · Mezclar grabación y partitura · Tararear | Hoy está repartido entre la portada y el menú |
| Historial de versiones | **Fase 2**, en la nube: guardar versiones de cada canción del grupo y poder volver a una | Cuando editan varios, es lo que evita perder trabajo |
| Colaboraciones | **Ya lo cubre el grupo**: integrar sus canciones en la misma biblioteca, sin pantalla aparte | |
| Enlace privado de solo lectura | **Fase 3, opcional**: para mandar una canción a alguien de fuera del grupo | Necesita servidor y cambiar la privacidad |
| Publicar en una comunidad, incrustar en la web, importar PDF o fotos | **No** | Vocify no tiene comunidad. Reconocer partituras impresas es otro producto |

## 4. Propuesta

### Fase 1: la biblioteca en el dispositivo (sin tocar el servidor)

**Hecha el 15/11/2026** (`src/library/`, `src/storage.ts`; pruebas `scripts/biblioteca.test.mjs` y `scripts/pruebas/04`, `23`, `24` y `25`). Las canciones del grupo salen en la misma lista, pero sin descargar no muestran voces ni miniatura.
1. **Pantalla «Biblioteca»** en lugar del diálogo, también en el móvil, donde la barra lateral se pliega. Contiene:
   - el botón **＋ Crear** con su menú;
   - el buscador;
   - las fichas de filtro;
   - la lista ordenable con casillas.
2. **Cada fila** lleva una miniatura con las líneas de neón de la canción (dibujada a partir de sus notas, sin audio), el título, las voces, 🎙 si tiene grabación, la fecha relativa, dónde está y el **⋯**.
3. **Repertorios**: crearlos, cambiarles el nombre, borrarlos, añadir y quitar canciones, cambiar el orden y «Tocar todo seguido».
4. **Papelera** de 30 días. Borrar mueve la canción y su grabación a la papelera; «Recuperar» la deja como estaba.
5. **Guardado**: pasar las canciones de `localStorage` (un solo bloque de unos 5 MB, que con muchas canciones se llena) a IndexedDB, **una canción por registro**, con traslado automático de lo que ya hay. Sin esto, la biblioteca grande no cabe.
6. **Las canciones del grupo, en la misma lista**, marcadas con ☁. *Grupo y cuenta* se queda para miembros e invitación.

### Fase 2: la nube

**Hecha el 15/11/2026**:
- migración `supabase/migrations/004_biblioteca_grupo.sql`, probada con PGlite en `server/test/sql/biblioteca-grupo.test.ts`;
- biblioteca: ⋯ › Historial, la papelera del grupo dentro de la Papelera y «Compartir con el grupo» en el ⋯ de cada repertorio;
- prueba de navegador `26-biblioteca-grupo.js`, sobre una nube de mentira que solo existe en desarrollo.
- Historial de versiones de las canciones del grupo, en una tabla nueva con su migración aditiva, con «Volver a esta versión».
- Papelera del grupo: quitar una canción la deja recuperable unos días.
- Repertorios del grupo, compartidos entre todos.

### Fase 3, opcional
- Enlace de solo lectura para alguien de fuera del grupo.

### Pruebas
Cada parte, con su prueba en `scripts/pruebas/`:
- crear, ordenar, filtrar y buscar;
- seleccionar varias;
- papelera y recuperación con la grabación;
- repertorios;
- traslado desde `localStorage`, sin perder ninguna canción ni ninguna grabación.

Todo pasa también en móvil.
