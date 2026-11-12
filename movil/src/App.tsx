import * as AppleAuthentication from 'expo-apple-authentication';
import { setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import VOCES_HTML from './generated/voces-html';

/**
 * Voces en el iPhone/Android: la web entera (compilada en un solo HTML por `npm run build:movil`) dentro de un WebView,
 * más un puente para lo que el navegador no puede hacer (ver `src/native.ts` de la web):
 *  - «save»: guardar/compartir un archivo (MIDI, proyecto, vídeo) con el menú de compartir del sistema;
 *  - «apple-sign-in»: «Iniciar sesión con Apple» nativo (el nonce lo genera la web, como en Baulify);
 *  - «open-url»: abrir un enlace fuera de la app.
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
  // Partituras abiertas desde otra app («Abrir con… Voces»): esperan a que la web esté lista.
  const webReady = useRef(false);
  const pendingFiles = useRef<{ name: string; base64: string }[]>([]);

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

  // Se inyecta antes de cargar la web: así la web sabe que está en la app y qué puede pedir.
  const bootstrap = useMemo(
    () => `window.VocesNative = ${JSON.stringify({ platform: Platform.OS, apple: apple === true, version: '1.0.0' })}; true;`,
    [apple],
  );

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
          {apple !== null && (
          <WebView
            ref={web}
            source={{ html: VOCES_HTML, baseUrl: ORIGIN }}
            originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={bootstrap}
            onMessage={onMessage}
            onLoadEnd={() => SplashScreen.hideAsync().catch(() => {})}
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
});
