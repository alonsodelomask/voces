# Publicar Voces en la App Store (y en Google Play)

El proyecto ya incluye las apps nativas generadas con **Capacitor**:

| Carpeta    | Qué es                                                        |
| ---------- | ------------------------------------------------------------- |
| `ios/`     | Proyecto de Xcode (iPhone/iPad)                               |
| `android/` | Proyecto de Android Studio                                    |
| `assets/`  | Icono (1024×1024) y pantalla de carga de los que salen todos los tamaños |

Ya está configurado:

- Identificador de la app: `io.github.alonsodelomask.voces` (en `capacitor.config.ts`; cámbialo antes de la primera subida si quieres otro, porque luego no se puede cambiar).
- Permiso de micrófono con su texto explicativo (iOS `Info.plist` y Android `AndroidManifest.xml`).
- `ITSAppUsesNonExemptEncryption = NO` (la app solo usa HTTPS, así que te ahorras la pregunta de exportación de cifrado).
- Iconos y pantalla de carga para todos los tamaños.
- Exportar MIDI, proyecto y vídeo abre el menú de compartir del móvil (Archivos, WhatsApp, AirDrop…).
- Borrar la cuenta desde la propia app (Apple lo exige si hay cuentas).
- Política de privacidad pública: <https://alonsodelomask.github.io/voces/privacidad.html>

---

## 1. Lo que necesitas

1. **Cuenta de Apple Developer Program**: 99 €/año en <https://developer.apple.com/programs/>. Tarda de unas horas a un par de días en activarse.
2. **Un Mac con Xcode** (gratis en la Mac App Store). Apple solo permite compilar y subir apps de iOS desde macOS. Si no tienes Mac:
   - **Codemagic** (<https://codemagic.io>): conectas el repositorio de GitHub y compila en sus Macs (tiene minutos gratis al mes). Recomendado si no tienes Mac.
   - Alquilar un Mac en la nube por horas (MacinCloud, AWS EC2 Mac…).
   - Pedir prestado un Mac un par de horas: basta para la primera subida.
3. *(Recomendado)* **La nube configurada** antes de compilar, para que los grupos y la IA funcionen en la app: sigue [`NUBE.md`](NUBE.md).

## 2. Compilar en el Mac

```bash
git clone https://github.com/alonsodelomask/voces.git
cd voces
npm install
# si tienes la nube: crea .env.local (ver .env.example)
npm run ios          # compila la web, la copia a ios/ y abre Xcode
```

En Xcode:

1. Selecciona el proyecto **App** → pestaña **Signing & Capabilities** → en *Team* elige tu cuenta de desarrollador.
2. *(Opcional)* Si solo quieres iPhone (así no te piden capturas de iPad): pestaña **General** → *Supported Destinations* → quita iPad.
3. En **General**: *Version* `1.0.0`, *Build* `1`. Súbelo a `2`, `3`… en cada subida nueva.
4. Prueba en tu iPhone: conéctalo por cable, elígelo arriba y pulsa ▶.

## 3. Crear la app en App Store Connect

En <https://appstoreconnect.apple.com> → **Apps → +**:

- **Nombre**: «Voces» puede estar cogido; alternativas: «Voces – Armonías para grupos», «Voces: ensaya tus voces».
- **Idioma principal**: Español (España).
- **ID del paquete**: `io.github.alonsodelomask.voces`.
- **SKU**: `voces-001`.

Ficha de la app:

- **Categoría**: Música (secundaria: Educación).
- **Subtítulo** (30 caracteres): «Ve y ensaya las voces del grupo».
- **Descripción** (sugerencia):
  > Voces convierte las partituras de tu grupo en líneas de colores que se mueven al ritmo de la música, como un sintetizador. Importa MusicXML o MIDI (desde MuseScore, Flat, Sibelius…), escucha cada voz por separado, ralentiza para ensayar y compón tus propias voces: tarareando, en la rejilla o con ayuda del asistente. Crea el grupo de tu banda, comparte las canciones y trabajad todos sobre la misma versión.
- **Palabras clave**: `coro,a cappella,armonía,voces,partitura,musicxml,midi,ensayo,banda,tararear`
- **URL de soporte**: <https://github.com/alonsodelomask/voces/issues>
- **URL de la política de privacidad**: <https://alonsodelomask.github.io/voces/privacidad.html>
- **Clasificación por edades**: 4+ (no hay contenido sensible).
- **Capturas**: como mínimo para iPhone de 6,9" (1320×2868). Haz capturas del visualizador, del editor, de «Tararear» y del panel del grupo en el simulador de Xcode (iPhone 16 Pro Max → ⌘S).

### Privacidad de la app (cuestionario «App Privacy»)

Con la nube activada, responde:

| Dato                                    | ¿Se recoge? | Vinculado al usuario | Rastreo | Para qué               |
| --------------------------------------- | ----------- | -------------------- | ------- | ---------------------- |
| Información de contacto → Email         | Sí          | Sí                   | No      | Funcionalidad de la app |
| Información de contacto → Nombre        | Sí          | Sí                   | No      | Funcionalidad de la app |
| Contenido del usuario → Otro (canciones) | Sí          | Sí                   | No      | Funcionalidad de la app |
| Audio                                   | **No** (se analiza en el dispositivo y no se guarda) | — | — | — |

Sin la nube: «No se recogen datos».

## 4. Subir y enviar a revisión

1. En Xcode: destino **Any iOS Device (arm64)** → menú **Product → Archive**.
2. En el Organizer: **Distribute App → App Store Connect → Upload**.
3. A los ~15 minutos aparece en App Store Connect → **TestFlight**. Invita a los del grupo como probadores internos o externos: es la mejor forma de probarla antes de publicarla.
4. Cuando esté lista: en la versión 1.0, elige la build y pulsa **Enviar a revisión**.

**Notas para el revisor** (importante): el revisor de Apple necesita poder entrar. Crea en Supabase un usuario de demostración con contraseña (*Authentication → Users → Add user → Create new user*, marcando *Auto Confirm User*) y pon en *App Review Information → Sign-in required*:

```
Email: demo@... (el que crees)
Password: (la que pongas)
Todas las funciones principales funcionan sin cuenta. La cuenta solo es necesaria para
grupos compartidos e IA. En la pantalla de inicio de sesión, pulsar «Usar contraseña».
El micrófono se usa en Editar → Tararear para convertir el canto en notas.
```

### Motivos de rechazo habituales y cómo están cubiertos

| Norma de Apple                                     | Estado                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| 4.2: funcionalidad mínima (no ser «una web metida en una app») | Funciona sin conexión, usa el micrófono y el menú de compartir del sistema, y tiene editor y grabación |
| 5.1.1(v): borrar la cuenta desde la app            | Grupo y cuenta → Eliminar mi cuenta                           |
| 5.1.1: no exigir cuenta para funciones que no la necesitan | Sin cuenta funciona todo salvo grupos e IA                 |
| 2.1: la app no debe fallar en la revisión          | Probar en TestFlight antes; dejar la cuenta de demostración   |
| Texto del permiso de micrófono                     | Explica para qué se usa                                       |

## 5. Actualizaciones

Cada vez que cambies algo:

```bash
npm run ios     # en el Mac
```

Sube el número de *Build*, haz **Archive → Upload** y envía la nueva versión. La web se actualiza aparte con `npm run deploy`.

---

## Google Play (Android)

Se puede hacer todo desde Windows:

1. Instala **Android Studio** (<https://developer.android.com/studio>).
2. `npm run android`: compila y abre el proyecto en Android Studio.
3. Prueba en tu móvil (activa la depuración USB) o en el emulador.
4. **Build → Generate Signed App Bundle** → crea una clave de firma (**guárdala bien: sin ella no podrás actualizar la app**) → genera el `.aab`.
5. Cuenta de **Google Play Console**: 25 $ (pago único) en <https://play.google.com/console>. Crea la app, sube el `.aab` a «Prueba interna» para el grupo y después a «Producción».
6. En *Seguridad de los datos* responde lo mismo que en la tabla de privacidad de Apple.
