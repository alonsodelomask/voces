// Función de servidor (Supabase Edge Function, Deno) que pide a Claude ideas de arreglo vocal.
// La clave de Anthropic vive solo aquí (secreto ANTHROPIC_API_KEY), nunca en la app.
//
// Despliegue:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '40');

const SYSTEM = `Eres el asistente de arreglos de «Voces», una app con la que grupos vocales (a cappella o con poco acompañamiento) componen y ensayan sus voces.
Recibes la canción como texto: tempo, compás, armadura, acordes y cada voz como lista inicio:duración:nota, con tiempos en PULSOS (negras) desde 0 y notas en notación científica (C4 = do central, F#4, Bb3).
Atiende la petición de la persona y responde SIEMPRE con el JSON pedido:
- "reply": explicación breve en español (máximo 6 frases), práctica y concreta, como hablaría un arreglista a su grupo.
- "chords": lista completa de acordes nueva (beat + nombre, p. ej. "F#m7", "Bb/D") SOLO si propones cambiar la armonía; si no, lista vacía.
- "voices": voces que creas o reescribes. "targetId" es el id de la voz existente que se reemplaza entera, o "" para crear una voz nueva. Incluye TODAS las notas de esa voz (beat, dur, note). No incluyas voces que no cambian.
Reglas musicales: cada voz es monofónica (sin notas solapadas); mantén registros cantables (graves ~E2-D4, tenores ~C3-A4, contraltos ~G3-D5, sopranos ~C4-A5); evita saltos grandes sin motivo, quintas y octavas paralelas y cruces de voces; respeta la armadura salvo que te pidan modular; ajusta los tiempos a la rejilla de corcheas salvo que la canción use valores más finos. Si la petición no tiene que ver con música o con esta canción, explica amablemente en "reply" para qué sirves y deja las listas vacías.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'chords', 'voices'],
  properties: {
    reply: { type: 'string' },
    chords: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['beat', 'name'],
        properties: { beat: { type: 'number' }, name: { type: 'string' } },
      },
    },
    voices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetId', 'name', 'notes'],
        properties: {
          targetId: { type: 'string' },
          name: { type: 'string' },
          notes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['beat', 'dur', 'note'],
              properties: { beat: { type: 'number' }, dur: { type: 'number' }, note: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Solo usuarios con sesión iniciada.
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Inicia sesión para usar la IA.' }, 401);

  let body: { prompt?: unknown; song?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Petición no válida.' }, 400);
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const song = typeof body.song === 'string' ? body.song : '';
  if (!prompt || prompt.length > 2000) return json({ error: 'Escribe una petición (máx. 2000 caracteres).' }, 400);
  if (song.length > 120_000) return json({ error: 'La canción es demasiado larga para la IA.' }, 413);

  // Límite diario por usuario.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Has llegado al límite de ${DAILY_LIMIT} peticiones a la IA por día.` }, 429);
  await admin.from('ai_usage').insert({ user_id: user.id });

  const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  try {
    const msg = await client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: `CANCIÓN\n${song}\n\nPETICIÓN\n${prompt}` }],
      })
      .finalMessage();

    if (msg.stop_reason === 'refusal') {
      return json({ reply: 'La IA no puede ayudar con esta petición.', chords: [], voices: [] });
    }
    if (msg.stop_reason === 'max_tokens') {
      return json({ error: 'La respuesta era demasiado larga. Pide algo más acotado (por ejemplo, solo unos compases).' }, 502);
    }
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const out = JSON.parse(text);
    return json(out);
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'La IA está saturada; prueba en un minuto.' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: `Error de la IA (${err.status ?? '?'}).` }, 502);
    return json({ error: 'No se pudo interpretar la respuesta de la IA.' }, 502);
  }
});
