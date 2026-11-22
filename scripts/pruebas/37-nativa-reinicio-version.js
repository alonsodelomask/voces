async () => {
  // App del iPhone: si el sistema cierra la web por falta de memoria, la app la vuelve a montar con `restarts` > 0 y
  // la web lo explica, diciendo qué se estaba haciendo. En un arranque normal, una marca vieja no da ningún aviso; y si
  // se vuelve a montar sin tarea pesada (cierre en segundo plano), el aviso es neutro y no habla de memoria.
  // Además, al pie de la Ayuda se ve la versión y la compilación reales que pasa la app.
  const MARCA = 'voces.tareaPesada';
  const vuelta = window.__vuelta;
  const res = { vuelta };
  if (vuelta === 0) {
    // Como si el teléfono se hubiera quedado sin memoria mientras convertía una grabación.
    const { heavyTask } = await import('/src/native.ts');
    const unmark = heavyTask('convertía el audio en notas');
    res.marcada = localStorage.getItem(MARCA);
    unmark();
    res.desmarcada = localStorage.getItem(MARCA) === null;
    heavyTask('convertía el audio en notas'); // esta no se desmarca: la web «se cierra» a medias
    sessionStorage.setItem('__reinicios', '1');
    res.ok = res.marcada === 'convertía el audio en notas' && res.desmarcada;
    res.recargar = res.ok;
    return res;
  }
  await new Promise((r) => setTimeout(r, 300));
  const toast = document.querySelector('#toast');
  const aviso = toast && !toast.hidden ? toast.textContent : '';
  if (vuelta === 1) {
    res.aviso = aviso;
    res.marcaBorrada = localStorage.getItem(MARCA) === null;
    res.version = document.querySelector('#help-version')?.textContent ?? '';
    const versionOk = /^Versión 1\.0\.0 \(compilación 12\)( · web [0-9a-f]{7})?$/.test(res.version);
    // Ahora, un arranque normal (la app no ha vuelto a montar la web) con una marca que se quedó de otra vez.
    localStorage.setItem(MARCA, 'grababa el vídeo');
    sessionStorage.setItem('__reinicios', '0');
    res.ok = aviso === 'Vocify se ha reiniciado porque el teléfono se quedó sin memoria mientras convertía el audio en notas.' && res.marcaBorrada && versionOk;
    res.recargar = res.ok;
    return res;
  }
  if (vuelta === 2) {
    res.aviso = aviso;
    res.marcaBorrada = localStorage.getItem(MARCA) === null;
    // Ahora, la app vuelve a montar la web sin ninguna tarea pesada a medias (iOS la cerró en segundo plano).
    sessionStorage.setItem('__reinicios', '1');
    res.ok = !/sin memoria/.test(aviso) && res.marcaBorrada;
    res.recargar = res.ok;
    return res;
  }
  // Aviso neutro, no de error: no se culpa a la memoria ni parece un fallo.
  res.aviso = aviso;
  res.rojo = !!toast?.classList.contains('error');
  sessionStorage.removeItem('__reinicios');
  res.ok = aviso === 'Vocify se ha vuelto a abrir.' && !res.rojo;
  return res;
}
