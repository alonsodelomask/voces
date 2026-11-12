// Igual que probar.mjs pero con las pruebas pesadas de audio (scripts/pruebas-audio).
process.env.TIMEOUT ??= '900000';
process.env.PRUEBAS_DIR = 'pruebas-audio';
await import('./probar.mjs');
