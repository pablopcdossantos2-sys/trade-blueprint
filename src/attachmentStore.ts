// Chave legada deliberadamente estável para preservar instalações anteriores ao rebranding.
// Mantê-la igual a STORAGE_KEY em storage.ts.
import { storageLoadGuardMessage } from "./storage.ts";

const STORAGE_KEY = "plano-de-trade-data-v1";

const DB_NAME = "trade-blueprint-attachments";
const DB_VERSION = 1;
const STORE_NAME = "attachments";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAttachmentObject(value: unknown): value is JsonObject & {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
} {
  if (!isObject(value)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.dataUrl === "string"
    && typeof value.createdAt === "string";
}

function collectAttachmentIds(value: unknown, ids = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachmentIds(item, ids));
    return ids;
  }
  if (!isObject(value)) return ids;

  if (isAttachmentObject(value)) ids.add(value.id);
  Object.values(value).forEach((item) => collectAttachmentIds(item, ids));
  return ids;
}

function request<T>(source: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error("Falha no IndexedDB."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha na transação do IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Transação do IndexedDB cancelada."));
  });
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Este navegador não oferece IndexedDB para armazenar os anexos."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("Não foi possível abrir o IndexedDB."));
  });
}

async function existingKeys(db: IDBDatabase) {
  const transaction = db.transaction(STORE_NAME, "readonly");
  const keys = await request(transaction.objectStore(STORE_NAME).getAllKeys());
  await transactionDone(transaction);
  return new Set(keys.map(String));
}

async function readAttachmentData(db: IDBDatabase, ids: Set<string>) {
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const entries = await Promise.all([...ids].map(async (id) => {
    const value = await request(store.get(id));
    if (typeof value !== "string" || !value) {
      throw new Error(`O anexo ${id} não foi encontrado no IndexedDB. Os dados foram mantidos em modo protegido.`);
    }
    return [id, value] as const;
  }));
  await transactionDone(transaction);
  return Object.fromEntries(entries);
}

let saveQueue: Promise<void> = Promise.resolve();

async function performSave(serializedState: string, allowRecovery: boolean) {
  if (!allowRecovery) {
    const guard = storageLoadGuardMessage();
    if (guard) throw new Error(guard);
  }
  const parsed = JSON.parse(serializedState) as JsonObject;
  const attachmentData = isObject(parsed.attachmentData)
    ? Object.fromEntries(Object.entries(parsed.attachmentData).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1]))
    : {};
  const referencedIds = collectAttachmentIds(parsed);

  const db = await openDatabase();
  try {
    const known = await existingKeys(db);
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    for (const [id, dataUrl] of Object.entries(attachmentData)) {
      if (!known.has(id)) store.put(dataUrl, id);
    }
    // Não excluir anexos durante o salvamento: a gravação no localStorage
    // pode falhar e outras abas ainda podem referenciar os arquivos antigos.
    // A limpeza explícita permanece disponível após backup e confirmação.
    await transactionDone(transaction);

    for (const id of referencedIds) {
      if (!known.has(id) && !(id in attachmentData)) {
        throw new Error(`O estado referencia o anexo ${id}, mas o conteúdo da imagem não está disponível.`);
      }
    }

    parsed.attachmentData = {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } finally {
    db.close();
  }
}

export function saveWebStateExternalized(serializedState: string, allowRecovery = false) {
  const operation = saveQueue.then(() => performSave(serializedState, allowRecovery));
  saveQueue = operation.catch(() => undefined);
  return operation;
}

export async function loadWebStatePayload() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as JsonObject;
  // Schemas anteriores ao v9 carregam a imagem diretamente em cada Attachment.
  // Eles precisam chegar intactos ao migrador de storage antes da primeira externalização.
  if (!isObject(parsed.attachmentData)) return raw;

  const embedded = Object.values(parsed.attachmentData)
    .some((value) => typeof value === "string" && !!value);
  if (embedded) return raw;

  const ids = collectAttachmentIds(parsed);
  if (!ids.size) return raw;

  const db = await openDatabase();
  try {
    parsed.attachmentData = await readAttachmentData(db, ids);
    return JSON.stringify(parsed);
  } finally {
    db.close();
  }
}

export async function clearWebAttachmentStore() {
  if (typeof indexedDB === "undefined") return;
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
