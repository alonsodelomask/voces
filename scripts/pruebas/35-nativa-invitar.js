async () => {
  // Dentro de la app del iPhone la página vive en https://app.voces.invalid/, que fuera del teléfono no existe: la
  // invitación al grupo debe llevar la web pública (https://vocify.es/), no esa dirección. Se prueba lo que hace el
  // botón «Compartir» del panel del grupo (shareInvite), con y sin menú de compartir. Grupo y código inventados.
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const { inviteUrl } = await import('/src/site.ts');
  const { isNative } = await import('/src/native.ts');
  const { shareInvite } = await import('/src/cloud/groupPanel.ts');
  const grupo = { name: 'Coro de prueba', invite_code: 'ABCD1234' };
  const res = { nativa: isNative, enlace: inviteUrl() };

  // Se sustituyen el menú de compartir y el portapapeles por espías, y se dejan como estaban al acabar.
  const compartir = Object.getOwnPropertyDescriptor(navigator, 'share');
  const portapapeles = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const avisos = [];
  try {
    let compartido = null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (datos) => void (compartido = datos) });
    await shareInvite(grupo, (m) => avisos.push(m));
    res.compartido = compartido;

    let copiado = null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => void (copiado = t) } });
    await shareInvite(grupo, (m) => avisos.push(m));
    res.copiado = copiado;
  } finally {
    if (compartir) Object.defineProperty(navigator, 'share', compartir);
    else delete navigator.share;
    if (portapapeles) Object.defineProperty(navigator, 'clipboard', portapapeles);
    else delete navigator.clipboard;
  }
  res.avisos = avisos;
  const sinRotos = (t) => !t.includes('voces.invalid') && !t.includes('localhost');
  res.ok =
    res.nativa === true &&
    res.enlace === 'https://vocify.es/' &&
    res.compartido?.url === 'https://vocify.es/' &&
    res.compartido.text.includes('ABCD1234') &&
    sinRotos(JSON.stringify(res.compartido)) &&
    res.copiado === 'Únete a «Coro de prueba» en Vocify con el código ABCD1234: https://vocify.es/' &&
    avisos.join() === 'Invitación copiada.';
  return res;
}
