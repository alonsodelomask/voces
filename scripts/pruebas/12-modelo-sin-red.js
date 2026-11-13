async () => {
  // Si la descarga del modelo falla una vez (sin conexión, un corte), el siguiente intento tiene que funcionar sin
  // recargar la página, y sin pasarse al procesador: eso es solo para cuando falla la tarjeta gráfica. Antes se quedaba
  // guardado el fallo y no se podía convertir ni mezclar hasta recargar, ya en el procesador (mucho más lento).
  const A = await import('/src/import/audio.ts');
  const avisos = [];
  const warn = console.warn;
  console.warn = (...a) => { avisos.push(String(a[0])); warn.apply(console, a); };
  const fetch0 = window.fetch;
  let cortes = 0;
  window.fetch = (u, ...resto) => {
    const url = String(u?.url ?? u);
    if (/model\.json|\.bin(\?|$)/.test(url) && cortes++ < 1) return Promise.reject(new TypeError('Failed to fetch'));
    return fetch0(u, ...resto);
  };
  const s = new Float32Array(22050 * 3);
  let primero, segundo, fotogramas = 0;
  try {
    await A.basicPitchOutputs(s);
    primero = 'funcionó sin red';
  } catch (e) {
    primero = e.message;
  }
  try {
    fotogramas = (await A.basicPitchOutputs(s)).frames.length;
    segundo = 'bien';
  } catch (e) {
    segundo = e.message;
  } finally {
    window.fetch = fetch0;
    console.warn = warn;
  }
  const procesador = avisos.some((x) => x.includes('se usa el procesador'));
  return {
    primero,
    segundo,
    fotogramas,
    procesador,
    ok: /No se ha podido descargar el modelo/.test(primero) && segundo === 'bien' && fotogramas === Math.ceil(s.length / 256) && !procesador,
  };
}
