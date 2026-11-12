// Integración con la app nativa (iOS/Android vía Capacitor). En web no hace nada especial.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Guarda un archivo: en web lo descarga; en el móvil abre el menú de compartir (Archivos, WhatsApp, AirDrop…). */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return;
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  await Share.share({ title: filename, files: [res.uri] });
}

/** Ajustes al arrancar dentro de la app nativa. */
export async function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native', 'native-' + platform);
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') await StatusBar.setBackgroundColor({ color: '#1f0a28' });
  } catch {
    /* sin barra de estado configurable */
  }
}
