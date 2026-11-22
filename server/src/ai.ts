import OpenAI, { APIConnectionError, APIError, RateLimitError } from 'openai';
import { z } from 'zod';

import { ApiError, errorClassName } from './errors.ts';

/**
 * Asistente de arreglos vocales con OpenAI (como Baulify: Responses API, salida JSON estricta y `store: false`). La app manda la canción como texto (pulsos y notas) y una petición; la
 * respuesta es un JSON con una explicación, acordes nuevos (o ninguno) y las voces que se crean o reescriben.
 */

export const aiRequest = z
  .object({
    // 2.000 se quedaba corto: «Afinar con IA» de la app 1.0 manda en la petición la lista de diferencias (hasta 120
    // líneas). Las versiones nuevas la mandan con la canción, que ya admite mucho más; esto es para las de antes.
    prompt: z.string().trim().min(1).max(16_000),
    song: z.string().max(120_000),
  })
  .strict();
export type AiRequest = z.infer<typeof aiRequest>;

const noteSchema = z.object({ beat: z.number().min(0).max(100_000), dur: z.number().positive().max(10_000), note: z.string().max(8) });
export const aiAnswer = z.object({
  reply: z.string().max(4000),
  chords: z.array(z.object({ beat: z.number().min(0).max(100_000), name: z.string().max(24) })).max(2000),
  voices: z.array(z.object({ targetId: z.string().max(64), name: z.string().max(80), notes: z.array(noteSchema).max(5000) })).max(12),
});
export type AiAnswer = z.infer<typeof aiAnswer>;

export interface AiProvider {
  readonly name: string;
  arrange(request: AiRequest): Promise<AiAnswer>;
}

/** GPT-6.1 Sol: casi tan bueno como Astra a una quinta parte del precio. Se cambia con `OPENAI_MODEL` en Render. */
export const DEFAULT_MODEL = 'gpt-6.1-sol';

const SYSTEM = `Eres el asistente de arreglos de «Vocify», una app con la que grupos vocales (a cappella o con poco acompañamiento) componen y ensayan sus voces.
Recibes la canción como texto: tempo, compás, armadura, acordes y cada voz como lista inicio:duración:nota, con tiempos en PULSOS (negras) desde 0 y notas en notación científica (C4 = do central, F#4, Bb3).
Atiende la petición de la persona y responde SIEMPRE con el JSON pedido:
- "reply": explicación breve en español (máximo 6 frases), práctica y concreta, como hablaría un arreglista a su grupo.
- "chords": lista completa de acordes nueva (beat + nombre, p. ej. "F#m7", "Bb/D") SOLO si propones cambiar la armonía; si no, lista vacía.
- "voices": voces que creas o reescribes. "targetId" es el id de la voz existente que se reemplaza entera, o "" para crear una voz nueva. Incluye TODAS las notas de esa voz (beat, dur, note). No incluyas voces que no cambian.
Reglas musicales: cada voz es monofónica (sin notas solapadas); mantén registros cantables (graves ~E2-D4, tenores ~C3-A4, contraltos ~G3-D5, sopranos ~C4-A5); evita saltos grandes sin motivo, quintas y octavas paralelas y cruces de voces; respeta la armadura salvo que te pidan modular; ajusta los tiempos a la rejilla de corcheas salvo que la canción use valores más finos. Si la petición no tiene que ver con música o con esta canción, explica amablemente en "reply" para qué sirves y deja las listas vacías.`;

/** El mismo esquema que `aiAnswer`, en JSON Schema para las salidas estructuradas de la API. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'chords', 'voices'],
  properties: {
    reply: { type: 'string' },
    chords: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['beat', 'name'], properties: { beat: { type: 'number' }, name: { type: 'string' } } },
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

export type OpenAIClientLike = Pick<OpenAI, 'responses'>;

export function createOpenAIProvider(
  apiKey: string,
  model: string = DEFAULT_MODEL,
  client: OpenAIClientLike = new OpenAI({ apiKey, maxRetries: 1, timeout: 180_000 }),
): AiProvider {
  return {
    name: `OpenAI (${model})`,
    async arrange({ prompt, song }) {
      let response: Awaited<ReturnType<OpenAIClientLike['responses']['create']>> & { output_text?: string };
      try {
        response = await client.responses.create({
          model,
          instructions: SYSTEM,
          input: `CANCIÓN
${song}

PETICIÓN
${prompt}`,
          reasoning: { effort: 'medium' },
          max_output_tokens: 48_000,
          // Ni OpenAI guarda la conversación ni se usa para entrenar (API).
          store: false,
          text: { format: { type: 'json_schema', name: 'arreglo', strict: true, schema: OUTPUT_SCHEMA } },
        });
      } catch (error) {
        // Nunca el mensaje del error: puede llevar la petición. Solo la clase y el estado.
        console.error(`[voces] fallo al llamar a OpenAI: ${errorClassName(error)}${error instanceof APIError ? ` (${error.status ?? '?'})` : ''}`);
        // Solo es gratis (no cuenta para el cupo) si OpenAI contestó con un error (429, 5xx…): no ha generado nada.
        // Si se cortó la conexión o se agotó la espera (`APIConnectionError`, sin estado), puede haber seguido generando
        // y cobrando la respuesta, así que cuenta.
        const free = error instanceof APIError && !(error instanceof APIConnectionError) && typeof error.status === 'number';
        if (error instanceof RateLimitError) throw new ApiError('ai-unavailable', 'La IA está saturada; prueba en un minuto.', { free });
        throw new ApiError('ai-failed', 'La IA no ha podido responder. Prueba otra vez.', { free });
      }
      // La negativa del modelo llega como contenido «refusal», no como texto.
      const refused = (response.output ?? []).some((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'));
      if (refused || response.incomplete_details?.reason === 'content_filter') {
        return { reply: 'La IA no puede ayudar con esta petición.', chords: [], voices: [] };
      }
      if (response.status === 'incomplete') {
        throw new ApiError('ai-failed', 'La respuesta era demasiado larga. Pide algo más acotado (por ejemplo, solo unos compases).');
      }
      if (response.status === 'failed') throw new ApiError('ai-failed', 'La IA no ha podido responder. Prueba otra vez.');
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.output_text ?? '');
      } catch {
        throw new ApiError('ai-failed', 'No se pudo interpretar la respuesta de la IA.');
      }
      const result = aiAnswer.safeParse(parsed);
      if (!result.success) throw new ApiError('ai-failed', 'No se pudo interpretar la respuesta de la IA.');
      return result.data;
    },
  };
}

/** Sin clave ni gasto: para probar la app y el servidor con datos ficticios. */
export function createSimulatedProvider(): AiProvider {
  return {
    name: 'IA simulada',
    async arrange({ prompt }) {
      return {
        reply: `(Respuesta simulada) He leído tu petición: «${prompt.slice(0, 80)}». Te propongo una voz nueva sencilla para probar.`,
        chords: [],
        voices: [
          {
            targetId: '',
            name: 'Voz simulada',
            notes: [
              { beat: 0, dur: 2, note: 'C4' },
              { beat: 2, dur: 2, note: 'E4' },
              { beat: 4, dur: 4, note: 'G4' },
            ],
          },
        ],
      };
    },
  };
}
