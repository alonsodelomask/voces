import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { ApiError, errorClassName } from './errors.ts';

/**
 * Asistente de arreglos vocales con Claude. La app manda la canción como texto (pulsos y notas) y una petición; la
 * respuesta es un JSON con una explicación, acordes nuevos (o ninguno) y las voces que se crean o reescriben.
 */

export const aiRequest = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
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

export const MODEL = 'claude-opus-5-5';

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

export function createClaudeProvider(apiKey: string, client: Anthropic = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })): AiProvider {
  return {
    name: `Claude (${MODEL})`,
    async arrange({ prompt, song }) {
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages
          .stream({
            model: MODEL,
            max_tokens: 32000,
            // Si el modelo rechaza una petición, la API la reintenta con otro modelo (se avisa en la documentación).
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
            system: SYSTEM,
            messages: [{ role: 'user', content: `CANCIÓN\n${song}\n\nPETICIÓN\n${prompt}` }],
          })
          .finalMessage();
      } catch (error) {
        console.error(`[voces] fallo al llamar a Claude: ${errorClassName(error)}${error instanceof Anthropic.APIError ? ` (${error.status ?? '?'})` : ''}`);
        if (error instanceof Anthropic.RateLimitError) throw new ApiError('ai-unavailable', 'La IA está saturada; prueba en un minuto.');
        throw new ApiError('ai-failed', 'La IA no ha podido responder. Prueba otra vez.');
      }
      if (message.stop_reason === 'refusal') return { reply: 'La IA no puede ayudar con esta petición.', chords: [], voices: [] };
      if (message.stop_reason === 'max_tokens') {
        throw new ApiError('ai-failed', 'La respuesta era demasiado larga. Pide algo más acotado (por ejemplo, solo unos compases).');
      }
      const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
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
