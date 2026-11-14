// Páginas en español de la web pública.
import { DATOS, correo, domicilio, nif, titular } from './comun.mjs';

const L = 'es';
const fecha = `<p class="muted">Última actualización: ${DATOS.actualizado.es}</p>`;

export const conoce = {
  ruta: 'conoce/',
  otra: 'en/',
  titulo: 'Vocify · Mira, escucha y ensaya las voces de tu grupo',
  descripcion: 'Vocify convierte partituras y grabaciones en líneas de luz para que cada cantante vea y escuche su voz. Para grupos vocales, coros y bandas.',
  doc: false,
  cuerpo: `
    <section class="hero">
      <div>
        <h1>Las voces de tu grupo, <span>en líneas de luz</span>.</h1>
        <p class="lead">Sube la partitura o una grabación y Vocify dibuja cada voz como una línea de neón que sube y baja con la melodía. Escucha la tuya, silencia las demás y ensaya hasta que salga.</p>
        <div class="cta"><a class="btn primary" href="../">Abrir Vocify en el navegador</a><a class="btn" href="#como">Cómo funciona</a></div>
        <p class="muted" style="margin-top:14px">Gratis. Funciona sin cuenta. App para iPhone en camino.</p>
      </div>
      <img class="shot" src="img/visualizar.jpg" width="440" height="956" alt="Cuatro voces dibujadas como líneas de neón de colores sobre fondo oscuro" />
    </section>

    <section class="features" id="como">
      <div class="feature"><h3>🎼 Importa la partitura</h3><p>MusicXML (MuseScore, Finale, Sibelius, Flat…) o MIDI. Con repeticiones, ligaduras y acordes.</p></div>
      <div class="feature"><h3>🎙️ O una grabación</h3><p>WAV, MP3, M4A, OGG, FLAC… Vocify escucha el audio en tu dispositivo y lo convierte en voces que luego puedes corregir.</p></div>
      <div class="feature"><h3>🌈 Mira cada voz</h3><p>Cada voz es una línea de color con su nombre. Ves de un vistazo quién sube, quién baja y dónde os cruzáis.</p></div>
      <div class="feature"><h3>🎧 Ensaya la tuya</h3><p>Solo o silencio por voz, velocidad lenta, metrónomo, cuenta atrás y bucle de los compases difíciles.</p></div>
      <div class="feature"><h3>✏️ Edita y compón</h3><p>Pon, mueve y alarga notas con el dedo; cambia acordes, transporta y deshaz. O tararea una melodía y se convierte en notas.</p></div>
      <div class="feature"><h3>👥 Comparte con el grupo</h3><p>Crea el grupo, invita con un código y las canciones se sincronizan solas para todos.</p></div>
      <div class="feature"><h3>🤖 Asistente de arreglos</h3><p>Revisa cruces y saltos, propone acordes y crea voces nuevas. Con IA (Claude) para ideas más elaboradas.</p></div>
      <div class="feature"><h3>🎸 Acordes para instrumentos</h3><p>Si quieres, debajo aparece cómo tocar cada acorde en guitarra, ukelele o piano.</p></div>
      <div class="feature"><h3>📱 Vídeo para redes</h3><p>Graba un vídeo vertical con las líneas y el sonido, listo para compartir.</p></div>
    </section>

    <section class="gallery" aria-label="Capturas">
      <figure><img src="img/visualizar.jpg" width="440" height="956" alt="Visualizador con las voces" loading="lazy" /><figcaption>Las voces en movimiento</figcaption></figure>
      <figure><img src="img/voces.jpg" width="440" height="956" alt="Panel de voces con volumen y solo" loading="lazy" /><figcaption>Tu voz, sola o con todas</figcaption></figure>
      <figure><img src="img/editar.jpg" width="440" height="956" alt="Editor de notas" loading="lazy" /><figcaption>Editor táctil</figcaption></figure>
      <figure><img src="img/asistente.jpg" width="440" height="956" alt="Asistente de arreglos" loading="lazy" /><figcaption>Asistente</figcaption></figure>
    </section>

    <section class="band">
      <h2>Tus canciones son tuyas</h2>
      <p class="muted">Sin publicidad y sin rastreo. Sin cuenta, todo se queda en tu dispositivo; el audio del micrófono y las grabaciones se analizan ahí mismo y no se envían a ningún sitio. <a href="../privacidad/">Política de privacidad</a>.</p>
      <p><a class="btn primary" href="../">Empezar ahora</a></p>
    </section>`,
};

export const privacidad = {
  ruta: 'privacidad/',
  otra: 'en/privacy/',
  titulo: 'Vocify · Política de privacidad',
  descripcion: 'Qué datos trata Vocify, para qué, con quién y cómo borrarlos.',
  cuerpo: `
      <h1>Política de privacidad</h1>
      ${fecha}

      <div class="box"><b>En pocas palabras:</b> puedes usar Vocify sin cuenta y entonces todo se queda en tu dispositivo. El micrófono y las grabaciones que importas se analizan en tu dispositivo y no se envían a ningún sitio. Si creas una cuenta, guardamos lo justo para que funcionen el grupo y la IA. No hay publicidad, no hay rastreo y no vendemos datos. Puedes descargar tus datos y borrar tu cuenta desde la app.</div>

      <h2>1. Quién es el responsable</h2>
      <p>El responsable del tratamiento es ${titular(L)}, con NIF ${nif(L)} y domicilio en ${domicilio(L)} (en adelante, «Vocify» o «nosotros»). Para cualquier asunto de privacidad, escríbenos a ${correo()}.</p>

      <h2>2. Qué datos tratamos</h2>
      <h3>Si usas Vocify sin cuenta</h3>
      <p>Tus canciones y ajustes se guardan solo en tu dispositivo (en el almacenamiento del navegador o de la app). No recibimos nada.</p>
      <h3>Micrófono («Tararear»)</h3>
      <p>Con tu permiso, la app escucha el micrófono para detectar la altura de las notas que cantas. <b>El audio se analiza en tiempo real en tu dispositivo, no se graba en ningún archivo y no se envía a ningún servidor.</b> Solo se guardan las notas resultantes dentro de tu canción.</p>
      <h3>Grabaciones que importas</h3>
      <p>Cuando conviertes un audio (WAV, MP3…) en voces, o lo mezclas con una partitura, el análisis se hace en tu dispositivo con un modelo que se descarga junto a la app. El archivo de audio no se sube a ningún servidor.</p>
      <p>Si al mezclar eliges <i>oír la grabación junto a las voces</i>, el audio se guarda en el almacenamiento de tu dispositivo para poder reproducirlo después. Sigue sin salir de ahí: no se sube al grupo ni a ningún servidor, y lo borras quitando la grabación en el panel de voces o eliminando la canción.</p>
      <h3>Sacar la letra de una grabación</h3>
      <p>Si pides a la app que escuche la letra de una grabación (al mezclarla con una partitura o con el botón «Letra»), el reconocimiento de lo que se canta también se hace en tu dispositivo: el audio no se sube a ningún servidor. La primera vez, la app descarga el modelo que escucha la letra (Whisper, unos 80 MB) de Hugging Face y su motor de jsDelivr, y los guarda en tu dispositivo. Como en cualquier descarga, esos servicios ven la dirección IP de tu conexión; no les enviamos nada más.</p>
      <h3>Si creas una cuenta (opcional)</h3>
      <ul>
        <li><b>Correo electrónico</b> y, si la usas, la <b>contraseña</b> (la guarda nuestro proveedor de autenticación de forma cifrada e irreversible; nosotros no podemos verla).</li>
        <li><b>Nombre visible</b>, que ven los miembros de tus grupos.</li>
        <li>Si entras con <b>«Iniciar sesión con Apple»</b>: el identificador que nos da Apple, el correo que Apple comparta (puede ser una dirección privada de Apple) y tu nombre la primera vez. También guardamos <b>cifrado</b> un código de Apple que solo sirve para revocar ese acceso cuando borras la cuenta.</li>
        <li><b>Grupos</b> a los que perteneces, tu papel (creador o miembro) y el código de invitación.</li>
        <li><b>Canciones que compartes con un grupo</b> (título, notas, acordes, nombres y colores de las voces) y quién las modificó por última vez.</li>
        <li><b>Uso de la IA</b>: la fecha y hora de cada petición, solo para aplicar el límite diario.</li>
      </ul>
      <h3>Asistente con IA</h3>
      <p>Cuando pides algo a la IA, enviamos tu petición y una descripción en texto de la canción abierta (notas, acordes, nombres de las voces y tempo) a Anthropic, que proporciona el modelo Claude, para generar la respuesta. No enviamos tu correo, tu nombre ni ningún audio. Las funciones «Revisar», «Acordes» y «Crear voces» del asistente funcionan en tu dispositivo sin enviar nada.</p>
      <h3>Datos técnicos</h3>
      <p>Como cualquier servicio en Internet, nuestros proveedores de alojamiento registran de forma automática datos técnicos de cada conexión (dirección IP, fecha, página pedida, tipo de navegador) para mantener el servicio seguro y resolver errores. No los usamos para perfilarte.</p>

      <h2>3. Para qué y con qué base legal</h2>
      <div class="table-wrap"><table>
        <tr><th>Finalidad</th><th>Base legal (RGPD)</th></tr>
        <tr><td>Crear y mantener tu cuenta, tus grupos y las canciones compartidas</td><td>Ejecución del contrato que aceptas al registrarte (art. 6.1.b)</td></tr>
        <tr><td>Responder a tus peticiones a la IA</td><td>Ejecución del contrato (art. 6.1.b)</td></tr>
        <tr><td>Límite diario de la IA, seguridad y prevención de abusos</td><td>Interés legítimo en mantener el servicio estable y seguro (art. 6.1.f)</td></tr>
        <tr><td>Uso del micrófono</td><td>Tu permiso en el dispositivo, que puedes retirar en cualquier momento en los ajustes</td></tr>
        <tr><td>Atender tus consultas y ejercicios de derechos</td><td>Obligación legal y ejecución del contrato (art. 6.1.c y 6.1.b)</td></tr>
      </table></div>
      <p>No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni elaboramos perfiles.</p>

      <h2>4. Con quién compartimos datos</h2>
      <p>Solo con los proveedores técnicos que necesitamos para prestar el servicio, que actúan como encargados del tratamiento bajo contrato:</p>
      <div class="table-wrap"><table>
        <tr><th>Proveedor</th><th>Para qué</th><th>Dónde</th></tr>
        <tr><td>Supabase, Inc.</td><td>Cuentas, inicio de sesión, base de datos de grupos y canciones</td><td>Unión Europea (Fráncfort, Alemania)</td></tr>
        <tr><td>Render Services, Inc.</td><td>Servidor de la app y alojamiento de la web</td><td>Unión Europea (Fráncfort, Alemania); la web estática se sirve desde su red de distribución global</td></tr>
        <tr><td>Anthropic Ireland, Limited</td><td>Modelo de IA Claude, solo cuando usas el asistente con IA</td><td>Estados Unidos</td></tr>
        <tr><td>Apple Distribution International Ltd.</td><td>«Iniciar sesión con Apple» y distribución de la app, si los usas</td><td>Según su propia política</td></tr>
        <tr><td>GitHub, Inc.</td><td>Copia de la web en GitHub Pages (solo si entras por esa dirección)</td><td>Estados Unidos</td></tr>
      </table></div>
      <p>Los miembros de tus grupos ven tu nombre visible y las canciones que compartes en ese grupo. No vendemos ni cedemos tus datos a nadie más, salvo obligación legal.</p>

      <h2>5. Transferencias fuera de la Unión Europea</h2>
      <p>Cuando usas el asistente con IA, tu petición se procesa en Estados Unidos. Anthropic se compromete en su acuerdo de tratamiento de datos a aplicar las cláusulas contractuales tipo aprobadas por la Comisión Europea (Decisión 2021/914). Los demás proveedores con sede en Estados Unidos aplican igualmente las garantías del RGPD (cláusulas contractuales tipo u otros mecanismos válidos) para cualquier acceso desde fuera de la UE.</p>

      <h2>6. Cuánto tiempo los guardamos</h2>
      <ul>
        <li><b>Cuenta, nombre y grupos:</b> mientras tengas la cuenta. Al borrarla se eliminan.</li>
        <li><b>Registro de uso de la IA:</b> 30 días; después se borra automáticamente.</li>
        <li><b>Código de Apple:</b> hasta que borres la cuenta y se revoque el acceso.</li>
        <li><b>Peticiones a la IA en Anthropic:</b> Anthropic las borra en un máximo de 30 días, salvo que se marquen por incumplir sus normas de uso (hasta 2 años) o por obligación legal. No las usa para entrenar sus modelos.</li>
        <li><b>Canciones compartidas:</b> forman parte del grupo. Si borras tu cuenta o sales del grupo, las canciones que compartiste siguen disponibles para el resto de miembros, sin tu nombre. Puedes quitarlas del grupo antes desde <i>Mis canciones</i> (botón ⊘). Un grupo, con sus canciones, se elimina cuando sale su último miembro.</li>
        <li><b>Datos técnicos de conexión:</b> el tiempo limitado que conserven nuestros proveedores por seguridad.</li>
      </ul>

      <h2>7. Descargar tus datos y borrar tu cuenta</h2>
      <p>En la app: <i>Menú → Grupo y cuenta</i>.</p>
      <ul>
        <li><b>Descargar mis datos</b> te da un archivo con tu cuenta, tus grupos y las canciones compartidas.</li>
        <li><b>Eliminar mi cuenta</b> borra tu correo, tu nombre, tu pertenencia a los grupos y el registro de uso de la IA, y revoca el acceso de «Iniciar sesión con Apple» si lo usaste. Las canciones guardadas solo en tu dispositivo no se tocan.</li>
      </ul>
      <p>Si no puedes entrar en la app, sigue los pasos de <a href="../borrar-cuenta/">borrar la cuenta</a>.</p>

      <h2>8. Tus derechos</h2>
      <p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a ${correo()} desde el correo de tu cuenta. Te responderemos en un plazo máximo de un mes. Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es">www.aepd.es</a>).</p>

      <h2>9. Seguridad</h2>
      <p>Todas las conexiones van cifradas (HTTPS). La base de datos aplica reglas de acceso por fila: cada persona solo puede leer sus grupos y las canciones de esos grupos. Las claves del servidor no salen de él y el código de Apple se guarda cifrado.</p>

      <h2>10. Publicidad y rastreo</h2>
      <p>Vocify no muestra publicidad, no usa herramientas de analítica de terceros, no te rastrea entre apps o webs y no usa cookies de seguimiento. Solo usa el almacenamiento local del dispositivo para guardar tus canciones, tus ajustes y tu sesión.</p>

      <h2>11. Menores</h2>
      <p>Para crear una cuenta hay que tener al menos 14 años (o contar con el consentimiento de tus padres o tutores). Sin cuenta, la app no recoge datos personales.</p>

      <h2>12. Cambios</h2>
      <p>Si cambiamos esta política, actualizaremos la fecha de arriba y, si el cambio es importante, te avisaremos en la app.</p>`,
};

export const condiciones = {
  ruta: 'condiciones/',
  otra: 'en/terms/',
  titulo: 'Vocify · Condiciones de uso',
  descripcion: 'Condiciones de uso de Vocify.',
  cuerpo: `
      <h1>Condiciones de uso</h1>
      ${fecha}

      <h2>1. Quiénes somos</h2>
      <p>Vocify es un servicio de ${titular(L)}, con NIF ${nif(L)} y domicilio en ${domicilio(L)}. Contacto: ${correo()}.</p>

      <h2>2. Qué es Vocify</h2>
      <p>Vocify es una aplicación (web y móvil) para ver, escuchar, componer y ensayar las voces de una canción. Se puede usar gratis y sin cuenta. Con una cuenta, además, puedes crear grupos, compartir canciones y usar el asistente con IA.</p>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Necesitas al menos 14 años o el consentimiento de tus padres o tutores.</li>
        <li>Los datos que nos des deben ser ciertos y tu contraseña, secreta. Eres responsable de lo que se haga con tu cuenta.</li>
        <li>Puedes borrar tu cuenta cuando quieras desde la app.</li>
      </ul>

      <h2>4. Tu contenido</h2>
      <p>Las canciones, arreglos y grabaciones que crees o importes son tuyos. Para poder guardarlas y mostrarlas a los miembros de tus grupos, nos das permiso para alojarlas y procesarlas, solo con ese fin y mientras las tengas en el servicio.</p>
      <p>Debes tener derecho a usar lo que importas o compartes. Muchas partituras y grabaciones tienen derechos de autor: compártelas solo dentro de tu grupo y respetando la ley. Si alguien nos avisa de un contenido que infringe sus derechos, podremos retirarlo.</p>

      <h2>5. Uso aceptable</h2>
      <p>No uses Vocify para actividades ilegales, para molestar a otras personas, para intentar acceder a datos ajenos, para sobrecargar o atacar el servicio ni para extraer datos de forma automatizada.</p>

      <h2>6. Asistente con IA y conversión de audio</h2>
      <p>Las sugerencias del asistente (también las de la IA) y las notas que se obtienen de una grabación o de lo que tarareas son aproximaciones que pueden contener errores. Revísalas antes de usarlas. El asistente con IA tiene un límite diario de peticiones por persona.</p>

      <h2>7. El servicio</h2>
      <p>Vocify se ofrece gratis y tal como está. Hacemos lo posible para que funcione bien y sin interrupciones, pero puede haber fallos o paradas de mantenimiento, y las funciones pueden cambiar. Te recomendamos guardar una copia de tus canciones (<i>Menú → Exportar proyecto</i>). Podemos suspender cuentas que incumplan estas condiciones.</p>

      <h2>8. Responsabilidad</h2>
      <p>No respondemos de los daños indirectos ni de la pérdida de contenido que no se deba a nuestra culpa o negligencia. Nada de estas condiciones limita los derechos que te reconoce la normativa de consumidores y usuarios.</p>

      <h2>9. App del App Store</h2>
      <p>Si usas la app de iPhone, también se aplica el contrato de licencia estándar de Apple para apps (EULA). Apple no es responsable del servicio ni de su soporte.</p>

      <h2>10. Cambios</h2>
      <p>Podemos actualizar estas condiciones. Si el cambio es importante, te avisaremos en la app con antelación. Si no estás de acuerdo, puedes dejar de usar Vocify y borrar tu cuenta.</p>

      <h2>11. Ley aplicable</h2>
      <p>Estas condiciones se rigen por la ley española. Si eres consumidor, puedes acudir a los juzgados de tu domicilio.</p>

      <p>Tratamos tus datos según la <a href="../privacidad/">política de privacidad</a>.</p>`,
};

export const soporte = {
  ruta: 'soporte/',
  otra: 'en/support/',
  titulo: 'Vocify · Ayuda y contacto',
  descripcion: 'Preguntas frecuentes y contacto de Vocify.',
  cuerpo: `
      <h1>Ayuda y contacto</h1>
      <p>¿Algo no funciona o tienes una idea? Escríbenos a ${correo()}. Si nos dices tu dispositivo y qué estabas haciendo, lo resolveremos antes.</p>

      <h2>Preguntas frecuentes</h2>
      <details><summary>¿Qué archivos puedo importar?</summary><p>Partituras en <b>MusicXML</b> (.musicxml, .xml, .mxl) y <b>MIDI</b> (.mid), y grabaciones de audio (<b>WAV, MP3, M4A, AAC, OGG, OPUS, FLAC, AIFF</b>…). Desde MuseScore: <i>Archivo → Exportar → MusicXML</i>. En el iPhone también puedes abrir una partitura o un audio desde WhatsApp, Mail o Archivos con «Compartir → Vocify».</p></details>
      <details><summary>¿Cómo convierto una grabación en voces?</summary><p>Pulsa <i>Importar</i> y elige el audio. Indica cuántas voces se oyen (o deja que Vocify lo averigüe) y espera un poco: el análisis se hace en tu dispositivo. Funciona mejor con voces solas (a cappella), sin instrumentos y con poco eco. El resultado es un punto de partida: corrige en el editor las notas que no hayan salido bien.</p><p>Si cada cantante graba su voz por separado (empezando todos en el mismo punto), importa la primera y después las demás eligiendo <i>Añadir a «…» como voz nueva</i>: quedan juntas en la misma canción y salen mucho mejor que con todo el grupo en una sola pista.</p><p><b>Lo que mejor funciona</b> es <i>Mezclar grabación y partitura</i> (en el menú, o eligiendo los dos archivos a la vez): las notas las pone la partitura, que están bien, y el ritmo, el tono y la octava los pone la grabación. Además puede añadir una voz con lo que se canta de verdad y dejar la grabación sonando junto a las voces.</p></details>
      <details><summary>¿Cómo ensayo solo mi voz?</summary><p>En el panel de voces, toca <b>S</b> (solo) en tu voz o baja el volumen de las demás. Con el botón de ensayo (⇄) repites unos compases en bucle, con metrónomo, cuenta atrás y velocidad lenta.</p></details>
      <details><summary>¿Cómo comparto canciones con mi grupo?</summary><p>Crea una cuenta, ve a <i>Menú → Grupo y cuenta</i>, crea el grupo y manda el código de invitación. Después, con la canción abierta, pulsa <i>Compartir «…» con el grupo</i> en ese mismo panel. Los cambios se sincronizan solos.</p></details>
      <details><summary>¿Necesito conexión a Internet?</summary><p>No para ver, escuchar, editar ni tararear: todo eso funciona sin conexión. Para convertir audio, en la app funciona siempre sin conexión; en el navegador hace falta conexión la primera vez, para descargar el modelo. Para sacar la letra de una grabación hace falta conexión la primera vez (se descargan unos 80 MB). Sí para compartir con el grupo y para el asistente con IA.</p></details>
      <details><summary>No se oye nada en el iPhone</summary><p>Sube el volumen y comprueba que ninguna voz está en silencio en el panel de voces. En la app de iPhone suena aunque el interruptor de silencio esté activado; en el navegador del iPhone, quita el modo silencio.</p></details>
      <details><summary>¿La IA tiene límite?</summary><p>Sí, un número de peticiones al día por persona, para que el servicio siga siendo gratis. Las funciones del asistente que no usan IA no tienen límite.</p></details>
      <details><summary>¿Cómo descargo mis datos o borro mi cuenta?</summary><p>En <i>Menú → Grupo y cuenta</i>: <b>Descargar mis datos</b> o <b>Eliminar mi cuenta</b>. Más detalles en <a href="../borrar-cuenta/">borrar la cuenta</a>.</p></details>

      <h2>Más información</h2>
      <p><a href="../privacidad/">Política de privacidad</a> · <a href="../condiciones/">Condiciones de uso</a></p>`,
};

export const borrar = {
  ruta: 'borrar-cuenta/',
  otra: 'en/delete-account/',
  titulo: 'Vocify · Borrar la cuenta',
  descripcion: 'Cómo borrar tu cuenta de Vocify y qué datos se eliminan.',
  cuerpo: `
      <h1>Borrar tu cuenta de Vocify</h1>
      <h2>Desde la app (lo más rápido)</h2>
      <ol>
        <li>Abre Vocify (en el iPhone o en <a href="../">el navegador</a>) e inicia sesión.</li>
        <li>Ve a <i>Menú → Grupo y cuenta</i>.</li>
        <li>Pulsa <b>Eliminar mi cuenta</b> y confirma.</li>
      </ol>
      <p>Si quieres conservar una copia, pulsa antes <b>Descargar mis datos</b>.</p>

      <h2>Si no puedes entrar</h2>
      <p>Escríbenos a ${correo()} desde el correo de tu cuenta con el asunto «Borrar mi cuenta». La borraremos en un plazo máximo de un mes y te lo confirmaremos.</p>

      <h2>Qué se borra</h2>
      <ul>
        <li>Tu correo, tu contraseña y tu nombre visible.</li>
        <li>Tu pertenencia a todos los grupos.</li>
        <li>El registro de uso de la IA.</li>
        <li>El acceso de «Iniciar sesión con Apple», que se revoca ante Apple.</li>
      </ul>
      <h2>Qué se queda</h2>
      <ul>
        <li>Las canciones guardadas en tu dispositivo (siguen ahí; puedes borrarlas en <i>Mis canciones</i> o desinstalando la app).</li>
        <li>Las canciones que compartiste con un grupo, que siguen disponibles para sus miembros sin tu nombre. Si no quieres que se queden, quítalas del grupo antes (en <i>Mis canciones</i>, botón ⊘). Si eras el único miembro, el grupo y sus canciones se borran.</li>
      </ul>`,
};

export const PAGINAS_ES = [conoce, privacidad, condiciones, soporte, borrar].map((p) => ({ ...p, lang: L }));
