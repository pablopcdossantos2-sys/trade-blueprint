import test from "node:test";
import assert from "node:assert/strict";
import { loadWebStatePayload } from "../src/attachmentStore.ts";
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  clearStorageLoadGuard,
  initialState,
  loadStateResult,
  parseBackup,
  saveState,
  serializeState,
} from "../src/storage.ts";

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

function installStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
}

test("migra estado v7 vazio para o schema atual sem perder configuracoes", () => {
  installStorage();
  const current = initialState();
  const legacy = {
    ...current,
    schemaVersion: 7,
    trainingRecords: undefined,
    setupExamples: undefined,
  };
  delete legacy.trainingRecords;
  delete legacy.setupExamples;

  const migrated = parseBackup(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.trainingRecords, []);
  assert.deepEqual(migrated.setupExamples, []);
  assert.deepEqual(migrated.settings.assets, current.settings.assets);
});

test("falha de leitura preserva o conteudo original e bloqueia sobrescrita", () => {
  installStorage();
  const original = JSON.stringify({ schemaVersion: 999, payload: "nao sobrescrever" });
  localStorage.setItem(STORAGE_KEY, original);

  const result = loadStateResult();

  assert.ok(result.error);
  assert.ok(result.recoveryKey);
  assert.equal(localStorage.getItem(STORAGE_KEY), original);
  assert.equal(localStorage.getItem(result.recoveryKey), original);
  assert.throws(() => saveState(initialState()), /NÃO serão sobrescritos|modo protegido/i);
  assert.equal(localStorage.getItem(STORAGE_KEY), original);

  clearStorageLoadGuard();
});

test("recargas de estado corrompido mantêm uma só cópia de recuperação", () => {
  installStorage();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999 }));
  const first = loadStateResult();
  const second = loadStateResult();
  assert.equal(first.recoveryKey, second.recoveryKey);
  assert.equal([...Array(localStorage.length)].map((_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith("trade-blueprint-corrompido-")).length, 1);
  clearStorageLoadGuard();
});

test("corrige somente campos de enum traduzidos em backups EN/ES", () => {
  installStorage();
  const original = initialState();
  original.rules.push({
    id: "r", title: "Risk", description: "Neutral", rationale: "", active: true,
    category: "Entrada", attachments: [], createdAt: original.updatedAt, updatedAt: original.updatedAt,
  });
  const json = JSON.parse(serializeState(original));
  json.rules[0].category = "Entry";
  json.rules[0].title = "Risk";
  const repaired = parseBackup(JSON.stringify(json));
  assert.equal(repaired.rules[0].category, "Entrada");
  assert.equal(repaired.rules[0].title, "Risk");
  assert.equal(repaired.rules[0].description, "Neutral");
});

test("recusa serializar enums invalidos antes de gravar", () => {
  installStorage();
  const broken = initialState();
  broken.rules.push({
    id: "r", title: "Regra", description: "Texto", rationale: "", active: true,
    category: "Entry", attachments: [], createdAt: broken.updatedAt, updatedAt: broken.updatedAt,
  });
  assert.throws(() => serializeState(broken), /category/);
});

test("estado valido continua salvando normalmente", () => {
  installStorage();
  clearStorageLoadGuard();
  const state = initialState();

  saveState(state);

  const saved = localStorage.getItem(STORAGE_KEY);
  assert.ok(saved);
  const parsed = JSON.parse(saved);
  assert.equal(parsed.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(parsed.settings.assets, state.settings.assets);
});


test("schema v9 armazena a mesma imagem uma unica vez e reidrata as referencias", () => {
  installStorage();
  const state = initialState();
  const attachment = {
    id: "img-1",
    name: "grafico.webp",
    dataUrl: "data:image/webp;base64,AAAA",
    createdAt: "2026-10-16T12:00:00.000Z",
  };

  state.settings.attachments = [attachment];
  state.rules = [{
    id: "rule-1",
    title: "Regra",
    category: "Risco",
    description: "Descricao",
    rationale: "",
    active: true,
    attachments: [{ ...attachment }],
    createdAt: "2026-10-16T12:00:00.000Z",
    updatedAt: "2026-10-16T12:00:00.000Z",
  }];

  const serialized = serializeState(state);
  const persisted = JSON.parse(serialized);

  assert.equal(persisted.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(persisted.attachmentData["img-1"], attachment.dataUrl);
  assert.equal(persisted.settings.attachments[0].dataUrl, "");
  assert.equal(persisted.rules[0].attachments[0].dataUrl, "");
  assert.equal(serialized.split(attachment.dataUrl).length - 1, 1);

  const hydrated = parseBackup(serialized);
  assert.equal(hydrated.settings.attachments[0].dataUrl, attachment.dataUrl);
  assert.equal(hydrated.rules[0].attachments[0].dataUrl, attachment.dataUrl);
  assert.deepEqual(hydrated.attachmentData, {});
});


test("schema v9 rejeita referencia de imagem sem conteudo deduplicado", () => {
  installStorage();
  const state = initialState();
  const serialized = JSON.parse(serializeState(state));
  serialized.settings.attachments = [{
    id: "img-ausente",
    name: "ausente.webp",
    dataUrl: "",
    createdAt: "2026-10-16T12:00:00.000Z",
  }];
  serialized.attachmentData = {};

  assert.throws(
    () => parseBackup(JSON.stringify(serialized)),
    /img-ausente|sem conteúdo de imagem/i,
  );
});


test("migra schema v8 para v9 preservando imagens embutidas", () => {
  installStorage();
  const state = initialState();
  const attachment = {
    id: "img-v8",
    name: "legado.webp",
    dataUrl: "data:image/webp;base64,VVVV",
    createdAt: "2026-10-16T12:00:00.000Z",
  };
  state.settings.attachments = [attachment];

  const legacy = {
    ...state,
    schemaVersion: 8,
  };
  delete legacy.attachmentData;

  const migrated = parseBackup(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.settings.attachments[0].dataUrl, attachment.dataUrl);

  const persistedV9 = JSON.parse(serializeState(migrated));
  assert.equal(persistedV9.settings.attachments[0].dataUrl, "");
  assert.equal(persistedV9.attachmentData["img-v8"], attachment.dataUrl);
});


test("loader web preserva schema legado com imagens inline antes da migracao", async () => {
  installStorage();
  const legacy = {
    schemaVersion: 8,
    settings: {
      traderName: "",
      assets: ["WINFUT"],
      defaultMaxRisk: "1R",
      defaultMaxTrades: 3,
      theme: "dark",
      language: "pt-BR",
      attachments: [{
        id: "img-inline",
        name: "legado.webp",
        dataUrl: "data:image/webp;base64,AAAA",
        createdAt: "2026-10-16T12:00:00.000Z",
      }],
    },
  };
  const raw = JSON.stringify(legacy);
  localStorage.setItem(STORAGE_KEY, raw);

  assert.equal(await loadWebStatePayload(), raw);
});

test("schema v9 rejeita datas inexistentes sem derrubar a leitura", () => {
  installStorage();
  const state = initialState();
  const raw = JSON.parse(serializeState(state));
  raw.journalTrades.push({
    id: "j", externalId: "1", tradingDate: "2026-02-30", asset: "WINFUT",
    side: "", entryTime: "", exitTime: "", entryPrice: "", exitPrice: "",
    quantity: "", result: "", notes: "", scenarioLabel: "", importSource: "teste",
    importedAt: state.updatedAt,
  });
  assert.throws(() => parseBackup(JSON.stringify(raw)), /tradingDate|Data inválida/);
});
