import * as AppleAuthentication from 'expo-apple-authentication';
import * as Application from 'expo-application';
import { setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import VOCES_HTML from './generated/voces-html';

/**
 * Vocify en el iPhone/Android: la web entera (compilada en un solo HTML por `npm run build:movil`) dentro de un WebView,
 * más un puente para lo que el navegador no puede hacer (ver `src/native.ts` de la web):
 *  - «save»: guardar/compartir un archivo (MIDI, proyecto, vídeo) con el menú de compartir del sistema;
 *  - «apple-sign-in»: «Iniciar sesión con Apple» nativo (el nonce lo genera la web, como en Baulify);
 *  - «open-url»: abrir un enlace fuera de la app.
 *
 * Si el sistema cierra la web por falta de memoria (pasa en el iPhone al convertir audio, cargar el modelo de la letra
 * o grabar vídeo), el WebView se vuelve a montar: recargarlo no sirve, porque la dirección es inventada y el HTML va
 * inyectado, y la pantalla se quedaría en blanco. La web recibe cuántas veces ha pasado para explicárselo a quien la usa.
 *
 * Origen fijo `https://app.voces.invalid`: es un contexto seguro (micrófono y Web Crypto), conserva el almacenamiento
 * entre aperturas y nunca resuelve a ningún servidor. El servidor de Render lo admite en CORS.
 */
const ORIGIN = 'https://app.voces.invalid/';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Request = { id: string; type: string; [key: string]: unknown };
type Reply = { id: string; ok: boolean; result?: unknown; error?: string; cancelled?: boolean };

export default function App() {
  const web = useRef<WebView>(null);
  // null = aún comprobando si el iPhone ofrece «Iniciar sesión con Apple» (la web se carga después).
  const [apple, setApple] = useState<boolean | null>(Platform.OS === 'ios' ? null : false);
  // Partituras abiertas desde otra app («Abrir con… Vocify»): esperan a que la web esté lista.
  const webReady = useRef(false);
  const pendingFiles = useRef<{ name: string; base64: string }[]>([]);
  // Veces que el sistema ha cerrado la web en esta sesión: cambia la `key` del WebView y lo monta de nuevo.
  const [restarts, setRestarts] = useState(0);
  // Si la web se cae nada más abrirse (p. ej. al reabrir una canción que agota la memoria), montarla otra vez sería un
  // bucle sin fin: tras 3 cierres en un minuto se para y se ofrece reintentar a mano.
  const recentCrashes = useRef<number[]>([]);
  const [gaveUp, setGaveUp] = useState(false);

  function remount() {
    // La web nueva tiene que volver a decir «ready» antes de recibir partituras.
    webReady.current = false;
    const now = Date.now();
    recentCrashes.current = [...recentCrashes.current.filter((t) => now - t < 60_000), now];
    if (recentCrashes.current.length >= 3) {
      setGaveUp(true);
      SplashScreen.hideAsync().catch(() => {});
    }
    setRestarts((n) => n + 1);
  }

  function retry() {
    recentCrashes.current = [];
    setGaveUp(false);
  }

  function deliverFiles() {
    if (!webReady.current) return;
    for (const f of pendingFiles.current.splice(0)) {
      web.current?.injectJavaScript(`window.__vocesOpenFile && window.__vocesOpenFile(${JSON.stringify(f)}); true;`);
    }
  }

  async function receiveUrl(url: string | null) {
    if (!url || !/^(file|content):/i.test(url)) return;
    try {
      const name = decodeURIComponent(url.split(/[/?#]/).filter(Boolean).pop() ?? 'partitura');
      const base64 = await new File(url).base64();
      pendingFiles.current.push({ name, base64 });
      deliverFiles();
    } catch {
      // Archivo ilegible: la web no recibe nada (el sistema ya ha mostrado la app).
    }
  }

  useEffect(() => {
    Linking.getInitialURL().then(receiveUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => void receiveUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Que el sintetizador suene aunque el iPhone esté en silencio, y que el micrófono pueda grabar (Tararear).
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, interruptionMode: 'doNotMix' }).catch(() => {});
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setApple).catch(() => setApple(false));
  }, []);

  // Se inyecta antes de cargar la web: así la web sabe que está en la app, qué puede pedir, qué versión y compilación
  // tiene este teléfono (para el soporte) y si viene de un cierre por falta de memoria.
  const bootstrap = useMemo(() => {
    const info = {
      platform: Platform.OS,
      apple: apple === true,
      version: Application.nativeApplicationVersion ?? '?',
      build: Application.nativeBuildVersion ?? '?',
      restarts,
    };
    return `window.VocesNative = ${JSON.stringify(info)}; true;`;
  }, [apple, restarts]);

  function reply(message: Reply) {
    web.current?.injectJavaScript(`window.__vocesNativeReply && window.__vocesNativeReply(${JSON.stringify(message)}); true;`);
  }

  async function handle(request: Request): Promise<unknown> {
    switch (request.type) {
      case 'ready':
        // La web ya escucha: se le entregan las partituras que llegaron antes.
        webReady.current = true;
        deliverFiles();
        return null;
      case 'save': {
        const name = String(request.name ?? 'voces').replace(/[\\/:*?"<>|]+/g, '').slice(0, 120) || 'voces';
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        file.write(String(request.base64 ?? ''), { encoding: 'base64' });
        await Sharing.shareAsync(file.uri, { mimeType: String(request.mime ?? 'application/octet-stream'), dialogTitle: name });
        return null;
      }
      case 'apple-sign-in': {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce: String(request.nonce ?? ''),
        });
        if (!credential.identityToken) throw new Error('Apple no ha devuelto la identidad.');
        const n = credential.fullName;
        const fullName = n ? [n.givenName, n.middleName, n.familyName].filter(Boolean).join(' ').trim() || null : null;
        return { identityToken: credential.identityToken, authorizationCode: credential.authorizationCode, email: credential.email, fullName };
      }
      case 'open-url': {
        const url = String(request.url ?? '');
        if (/^https?:\/\//.test(url)) await Linking.openURL(url);
        return null;
      }
      default:
        throw new Error('Petición desconocida.');
    }
  }

  async function onMessage(event: WebViewMessageEvent) {
    let request: Request;
    try {
      request = JSON.parse(event.nativeEvent.data);
      if (!request || typeof request.id !== 'string') return;
    } catch {
      return;
    }
    try {
      reply({ id: request.id, ok: true, result: await handle(request) });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ERR_REQUEST_CANCELED') reply({ id: request.id, ok: false, cancelled: true });
      else reply({ id: request.id, ok: false, error: (error as Error).message?.slice(0, 200) ?? 'Error' });
    }
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.root}>
          {gaveUp && (
            <View style={styles.stopped}>
              <Text style={styles.stoppedText}>Vocify no ha podido abrirse por falta de memoria.</Text>
              <Text style={styles.stoppedHint}>Cierra otras apps y vuelve a intentarlo.</Text>
              <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          )}
          {apple !== null && !gaveUp && (
          <WebView
            key={restarts}
            ref={web}
            source={{ html: VOCES_HTML, baseUrl: ORIGIN }}
            originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={bootstrap}
            onMessage={onMessage}
            onLoadEnd={() => SplashScreen.hideAsync().catch(() => {})}
            // El sistema ha cerrado la web (iPhone: sin memoria; Android: el proceso que la dibuja). Sin esto, pantalla en blanco.
            onContentProcessDidTerminate={remount}
            onRenderProcessGone={remount}
            // Solo la propia app se abre dentro; cualquier otro enlace va al navegador del teléfono.
            onShouldStartLoadWithRequest={(req) => {
              if (req.url.startsWith(ORIGIN) || req.url.startsWith('about:') || req.url.startsWith('data:') || req.url.startsWith('blob:')) return true;
              if (/^https?:\/\//.test(req.url)) Linking.openURL(req.url).catch(() => {});
              return false;
            }}
            mediaCapturePermissionGrantType="grant"
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowFileAccess={false}
            javaScriptEnabled
            domStorageEnabled
            bounces={false}
            overScrollMode="never"
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            contentInsetAdjustmentBehavior="never"
            style={styles.web}
            containerStyle={styles.web}
          />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14041a' },
  web: { flex: 1, backgroundColor: '#14041a' },
  // Mismos colores que la web (src/styles.css: --text, --muted, --accent).
  stopped: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stoppedText: { color: '#f1eaf5', fontSize: 18, textAlign: 'center' },
  stoppedHint: { color: '#b7a3c2', fontSize: 15, textAlign: 'center' },
  retry: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#e940d6' },
  retryText: { color: '#14041a', fontSize: 16, fontWeight: '600' },
});
