// Pruebas de quién gana al sincronizar las canciones de la cuenta entre dispositivos (src/cloud/syncPlan.ts).
// Ids, cuentas y fechas inventados.
// Se ejecutan con: node --test scripts/personalSync.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
const { planSync, localStamp, remoteStamp } = await import("../src/cloud/syncPlan.ts");

const YO = "cuenta-yo";
const OTRA = "cuenta-otra";
const DIA = 86_400_000;
const AHORA = 100 * DIA;
const nada = new Set();
const local = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });
const remota = (id, song_updated_ms, extra = {}) => ({ id, song_updated_ms, song_deleted_ms: null, moved_to_group: null, ...extra });
const plan = (l, r, pending = nada) => planSync(l, r, YO, pending, AHORA);
const vacio = { push: [], pull: [], adopt: [], moveRemote: [], removeLocal: [], forkLocal: [], purgeLocal: [], purgeRemote: [], dropRemote: [] };

describe("marcas de tiempo", () => {
  test("cuenta el último cambio o el paso a la papelera, lo que sea después", () => {
    assert.equal(localStamp({ updatedAt: 5 }), 5);
    assert.equal(localStamp({ updatedAt: 5, deletedAt: 9 }), 9);
    assert.equal(remoteStamp({ song_updated_ms: 7, song_deleted_ms: null }), 7);
    assert.equal(remoteStamp({ song_updated_ms: 7, song_deleted_ms: 8 }), 8);
  });
});

describe("planSync", () => {
  test("lo de aquí que no está en la cuenta se sube; lo de la cuenta que no está aquí se trae", () => {
    const p = plan([local("a", 10)], [remota("b", 20)]);
    assert.deepEqual(p, { ...vacio, push: ["a"], pull: ["b"] });
  });

  test("gana lo más reciente; si es igual, no se hace nada", () => {
    const p = plan([local("a", 30, { ownerId: YO }), local("b", 10, { ownerId: YO }), local("c", 20, { ownerId: YO })], [remota("a", 20), remota("b", 25), remota("c", 20)]);
    assert.deepEqual(p, { ...vacio, push: ["a"], pull: ["b"] });
  });

  test("igual que en la cuenta pero sin dueña aquí (otro dispositivo la subió): se adopta", () => {
    assert.deepEqual(plan([local("a", 20)], [remota("a", 20)]), { ...vacio, adopt: ["a"] });
  });

  test("la papelera cuenta como cambio: mandarla aquí gana a una versión anterior, y recuperarla también", () => {
    // Aquí a la papelera (día 5) después del último cambio de la cuenta (día 4): sube con la papelera.
    assert.deepEqual(plan([local("a", 3 * DIA, { deletedAt: 5 * DIA, ownerId: YO })], [remota("a", 4 * DIA)]).push, ["a"]);
    // En la cuenta está en la papelera (día 5) y aquí se recuperó después (día 6, recuperar cambia updatedAt).
    assert.deepEqual(plan([local("a", 6 * DIA, { ownerId: YO })], [remota("a", 3 * DIA, { song_deleted_ms: 5 * DIA })]).push, ["a"]);
    // En la cuenta fue a la papelera después de lo de aquí: se trae (y aquí irá a la papelera).
    assert.deepEqual(plan([local("a", 4 * DIA, { ownerId: YO })], [remota("a", 3 * DIA, { song_deleted_ms: 5 * DIA })]).pull, ["a"]);
  });

  test("las canciones de otra cuenta que usó este dispositivo no se tocan", () => {
    assert.deepEqual(plan([local("a", 10, { ownerId: OTRA })], []), vacio);
    assert.deepEqual(plan([local("a", 10, { ownerId: OTRA })], [remota("a", 50)]), vacio);
  });

  test("las de un grupo no se suben; si estaban en la cuenta, se marcan como pasadas al grupo", () => {
    assert.deepEqual(plan([local("a", 10, { groupId: "g1" })], []), vacio);
    assert.deepEqual(plan([local("a", 40, { groupId: "g1", ownerId: YO })], [remota("a", 30)]).moveRemote, [{ id: "a", group: "g1", stamp: 40, rescue: false }]);
    // La de la cuenta se cambió después en otro dispositivo: se rescata (copia) antes de marcarla.
    assert.deepEqual(plan([local("a", 40, { groupId: "g1", ownerId: YO })], [remota("a", 70)]).moveRemote, [{ id: "a", group: "g1", stamp: 70, rescue: true }]);
    // Ya marcada: nada más.
    assert.deepEqual(plan([local("a", 40, { groupId: "g1", ownerId: YO })], [remota("a", 40, { moved_to_group: "g1" })]), vacio);
  });

  test("pasada a un grupo en otro dispositivo: la copia de aquí sobra; si aquí se cambió después, va a una copia", () => {
    const movida = remota("a", 50, { moved_to_group: "g1" });
    assert.deepEqual(plan([local("a", 40, { ownerId: YO })], [movida]), { ...vacio, removeLocal: ["a"] });
    assert.deepEqual(plan([local("a", 50, { ownerId: YO })], [movida]), { ...vacio, removeLocal: ["a"] });
    // Nunca se sube encima (eso la sacaría del grupo en los demás): sus cambios van a una canción nueva.
    assert.deepEqual(plan([local("a", 60, { ownerId: YO })], [movida]), { ...vacio, forkLocal: ["a"] });
    // Aquí no está: no se trae (se encuentra en el grupo).
    assert.deepEqual(plan([], [movida]), vacio);
  });

  test("borrada del todo aquí: en la cuenta queda como lápida", () => {
    assert.deepEqual(plan([], [remota("a", 10), remota("b", 10)], new Set(["a"])), { ...vacio, pull: ["b"], purgeRemote: ["a"] });
  });

  test("lápida: la copia de otro dispositivo (aunque esté en su papelera) se borra; si se cambió después, vuelve", () => {
    const T = AHORA - DIA;
    const lapida = remota("a", T, { purged: true });
    assert.deepEqual(plan([local("a", T - 50, { deletedAt: T - 10, ownerId: YO })], [lapida]), { ...vacio, purgeLocal: ["a"] });
    assert.deepEqual(plan([local("a", T + 10, { ownerId: YO })], [lapida]), { ...vacio, push: ["a"] });
    // Sin copia aquí: nada; y las lápidas de más de 90 días se quitan.
    assert.deepEqual(plan([], [lapida]), vacio);
    assert.deepEqual(plan([], [remota("v", AHORA - 91 * DIA, { purged: true })]), { ...vacio, dropRemote: ["v"] });
    // Una lápida no se marca como pasada a un grupo.
    assert.deepEqual(plan([local("a", T + 20, { groupId: "g", ownerId: YO })], [lapida]), vacio);
  });

  test("una borrada pendiente que vuelve a estar aquí (mismo id) no se borra de la cuenta", () => {
    assert.deepEqual(plan([local("a", 30, { ownerId: YO })], [remota("a", 10)], new Set(["a"])), { ...vacio, push: ["a"] });
  });

  test("lo que lleva más de 30 días en la papelera de la cuenta se borra en vez de traerse", () => {
    const vieja = remota("a", 1 * DIA, { song_deleted_ms: AHORA - 31 * DIA });
    const reciente = remota("b", 1 * DIA, { song_deleted_ms: AHORA - 29 * DIA });
    assert.deepEqual(plan([], [vieja, reciente]), { ...vacio, pull: ["b"], purgeRemote: ["a"] });
  });

  test("un dispositivo nuevo, sin nada: se trae todo lo de la cuenta menos lo pasado a grupos", () => {
    const p = plan([], [remota("a", 1), remota("b", 2, { song_deleted_ms: AHORA - DIA }), remota("c", 3, { moved_to_group: "g" })]);
    assert.deepEqual(p, { ...vacio, pull: ["a", "b"] });
  });
});
