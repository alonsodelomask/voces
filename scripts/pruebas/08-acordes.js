async () => {
  const { fretShape, pianoVoicing } = await import('/src/viz/chordShapes.ts');
  const fmt = (s) => (s ? s.frets.map((f) => (f < 0 ? 'x' : f)).join('') + (s.barre ? ` cejilla ${s.barre}` : '') + ` (pos ${s.base})` : '—');
  const g = {};
  for (const c of ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'B7', 'G7', 'Cmaj7', 'Ebmaj7', 'F#m', 'Bb', 'C#m', 'Gsus4', 'D/F#', 'Cadd9'])
    g[c] = fmt(fretShape(c, 'guitar'));
  const u = {};
  for (const c of ['C', 'G', 'Am', 'F', 'D', 'Em', 'A', 'E7']) u[c] = fmt(fretShape(c, 'ukulele'));
  const p = { C: pianoVoicing('C'), 'D/F#': pianoVoicing('D/F#'), Cmaj7: pianoVoicing('Cmaj7') };
  // Formas de referencia (las de cualquier libro de acordes).
  const esperadas = { C: 'x32010', G: '320003', D: 'xx0232', Am: 'x02210', E: '022100', Em: '022000', Dm: 'xx0231', A: 'x02220', F: '133211', Bm: 'x24432', 'F#m': '244222', B7: 'x21202', 'D/F#': '200232', 'C#m': 'x46654', G7: '320001' };
  const fallan = Object.entries(esperadas).filter(([c, s]) => !g[c].startsWith(s) && !(c === 'G' && g[c].startsWith('320033')));
  void { ukeEsperadas: { C: '0003', G: '0232', Am: '2000', F: '2010', Em: '0432', A: '2100' } };
  const ukeFallan = Object.entries({ C: '0003', G: '0232', Am: '2000', F: '2010', Em: '0432', A: '2100' }).filter(([c, s]) => !u[c].startsWith(s));
  return { guitarra: g, ukelele: u, piano: p, fallan, ukeFallan, ok: fallan.length === 0 && ukeFallan.length === 0 && !Object.values(g).includes('—') };
}
