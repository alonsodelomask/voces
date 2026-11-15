import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RateLimitError } from 'openai';

import { createOpenAIProvider, DEFAULT_MODEL, type OpenAIClientLike } from '../src/ai.ts';
import { ApiError } from '../src/errors.ts';
import { loadConfig } from '../src/config.ts';

/** Un cliente de OpenAI de mentira: guarda la petición y devuelve lo que se le diga (sin red ni gasto). */
function fake(answer: unknown | (() => never)) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        calls.push(body);
        if (typeof answer === 'function') return (answer as () => never)();
        return answer;
      },
    },
  } as unknown as OpenAIClientLike;
  return { client, calls };
}

const ARREGLO = { reply: 'Una tercera por encima.', chords: [], voices: [{ targetId: '', name: 'Contralto', notes: [{ beat: 0, dur: 2, note: 'E4' }] }] };
const ok = (text: string) => ({ status: 'completed', output_text: text, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const REQUEST = { prompt: 'Añade una voz', song: 'tempo 120\nvoz v1: 0:2:C4' };

describe('IA con OpenAI', () => {
  it('pide JSON estricto sin guardar la conversación y devuelve el arreglo', async () => {
    const { client, calls } = fake(ok(JSON.stringify(ARREGLO)));
    const ai = createOpenAIProvider('sk-ficticia-123456', undefined, client);
    assert.equal(ai.name, `OpenAI (${DEFAULT_MODEL})`);
    assert.deepEqual(await ai.arrange(REQUEST), ARREGLO);
    const body = calls[0] as { model: string; store: boolean; input: string; text: { format: { type: string; strict: boolean } } };
    assert.equal(body.model, DEFAULT_MODEL);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.match(body.input, /PETICIÓN\nAñade una voz/);
  });

  it('el modelo se puede cambiar', async () => {
    const { client, calls } = fake(ok(JSON.stringify(ARREGLO)));
    await createOpenAIProvider('sk-ficticia-123456', 'gpt-6-astra', client).arrange(REQUEST);
    assert.equal((calls[0] as { model: string }).model, 'gpt-6-astra');
  });

  it('si se niega, lo dice sin cambiar nada', async () => {
    const { client } = fake({ status: 'completed', output_text: '', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }] });
    const r = await createOpenAIProvider('sk-ficticia-123456', undefined, client).arrange(REQUEST);
    assert.deepEqual(r, { reply: 'La IA no puede ayudar con esta petición.', chords: [], voices: [] });
  });

  it('una respuesta cortada o que no es el JSON pedido da un error claro', async () => {
    const cortada = fake({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '{"reply":', output: [] });
    await assert.rejects(createOpenAIProvider('k'.repeat(12), undefined, cortada.client).arrange(REQUEST), (e: ApiError) => /demasiado larga/.test(e.message));
    const rara = fake(ok(JSON.stringify({ reply: 'hola' })));
    await assert.rejects(createOpenAIProvider('k'.repeat(12), undefined, rara.client).arrange(REQUEST), (e: ApiError) => /interpretar/.test(e.message));
  });

  it('saturada: lo dice; el error de la API no sale en el mensaje', async () => {
    const saturada = fake(() => {
      throw new RateLimitError(429, { message: 'secreto de la petición' }, 'secreto de la petición', new Headers());
    });
    await assert.rejects(createOpenAIProvider('k'.repeat(12), undefined, saturada.client).arrange(REQUEST), (e: ApiError) => {
      assert.match(e.message, /saturada/);
      assert.ok(!e.message.includes('secreto'));
      return true;
    });
  });

  it('configuración: clave y modelo de OPENAI_*', () => {
    const c = loadConfig({ SUPABASE_URL: 'https://ficticio.supabase.co', OPENAI_API_KEY: 'sk-ficticia-123456', OPENAI_MODEL: 'gpt-6.1-terra' });
    assert.deepEqual(c.openai, { key: 'sk-ficticia-123456', model: 'gpt-6.1-terra' });
    assert.throws(() => loadConfig({ SUPABASE_URL: 'https://ficticio.supabase.co', OPENAI_MODEL: 'no vale' }), /OPENAI_MODEL/);
  });
});
