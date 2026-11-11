import { z } from "zod";
import type { AppState } from "./types";

export const CURRENT_SCHEMA_VERSION = 9;
// Mantemos a chave legada para preservar dados criados antes da adoção do nome Trade Blueprint.
export const STORAGE_KEY = "plano-de-trade-data-v1";
const STORAGE_LOAD_GUARD_KEY = "trade-blueprint-storage-load-guard";

export type StateLoadResult = {
  state: AppState;
  error?: string;
  recoveryKey?: string;
};

function setStorageLoadGuard(message: string, recoveryKey?: string) {
  try {
    localStorage.setItem(STORAGE_LOAD_GUARD_KEY, JSON.stringify({ message, recoveryKey, createdAt: now() }));
  } catch {
    // If storage itself is unavailable, saveState will still surface the write failure.
  }
}

export function clearStorageLoadGuard() {
  try {
    localStorage.removeItem(STORAGE_LOAD_GUARD_KEY);
  } catch {
    // Nothing else to do.
  }
}

export function storageLoadGuardMessage() {
  try {
    const raw = localStorage.getItem(STORAGE_LOAD_GUARD_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : "O armazenamento local está em modo protegido.";
  } catch {
    return "O armazenamento local está em modo protegido.";
  }
}

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  dataUrl: z.string(),
  createdAt: z.string(),
});

const scenarioSchema = z.object({
  id: z.string(),
  label: z.enum(["A", "B", "C"]),
  title: z.string(),
  trigger: z.string(),
  confirmation: z.string(),
  action: z.string(),
  invalidation: z.string(),
  stop: z.string(),
  targets: z.string(),
  avoid: z.string(),
});

const ruleSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  title: z.string(),
  category: z.enum(["Entrada", "Saída", "Risco", "Horário", "Contexto", "Comportamento", "Outro"]),
  description: z.string(),
  rationale: z.string(),
  active: z.boolean(),
  attachments: z.array(attachmentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const settingsV2Schema = z.object({
  traderName: z.string(),
  assets: z.array(z.string()),
  defaultMaxRisk: z.string(),
  defaultMaxTrades: z.number().int().min(1),
  theme: z.enum(["dark", "light"]),
  attachments: z.array(attachmentSchema),
});

const settingsSchema = settingsV2Schema.extend({
  language: z.enum(["pt-BR", "en", "es"]),
});

const reviewV1Schema = z.object({
  happened: z.string(),
  observedScenario: z.enum(["A", "B", "C", "Nenhum", "Mistura", ""]),
  followedPlan: z.enum(["Sim", "Parcialmente", "Não", "Não operei", ""]),
  deviations: z.string(),
  lessons: z.string(),
  result: z.string(),
  attachments: z.array(attachmentSchema),
  reviewedAt: z.string().optional(),
});

const reviewV5Schema = reviewV1Schema.extend({
  executionSummary: z.string(),
});

const reviewSchema = reviewV5Schema.extend({
  executionOrigin: z.enum(["", "Planejada", "Parcialmente planejada", "Improvisada"]),
  violatedRuleIds: z.array(z.string()),
  readingQuality: z.number().int().min(0).max(5),
  executionQuality: z.number().int().min(0).max(5),
});

const planV1Schema = z.object({
  id: z.string(),
  planDate: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(z.string()),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  attachments: z.array(attachmentSchema),
  review: reviewV1Schema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const legacyStateSchema = z.object({
  schemaVersion: z.literal(1),
  rules: z.array(ruleSchema),
  plans: z.array(planV1Schema),
  settings: settingsV2Schema,
  updatedAt: z.string(),
});

const setupSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  title: z.string(),
  description: z.string(),
  marketContext: z.string(),
  entryCriteria: z.string(),
  confirmation: z.string(),
  invalidation: z.string(),
  stopModel: z.string(),
  targetModel: z.string(),
  avoid: z.string(),
  behaviorNotes: z.string(),
  active: z.boolean(),
  attachments: z.array(attachmentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const snapshotV4Schema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  frozenAt: z.string(),
  asset: z.string(),
  tradingDate: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(z.string()),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  attachments: z.array(attachmentSchema),
});

const planV4Schema = z.object({
  id: z.string(),
  planDate: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(z.string()),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  attachments: z.array(attachmentSchema),
  planStatus: z.enum(["draft", "frozen"]),
  versions: z.array(snapshotV4Schema),
  review: reviewV5Schema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
});

const thesisConvictionSchema = z.enum(["", "Baixa", "Média", "Alta"]);

const snapshotSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  frozenAt: z.string(),
  asset: z.string(),
  tradingDate: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(checklistItemSchema),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  thesisConviction: thesisConvictionSchema,
  changeMindCondition: z.string(),
  readinessScore: z.number().int().min(0).max(100).optional(),
  readinessIssues: z.array(z.string()).optional(),
  attachments: z.array(attachmentSchema),
});

const planV5Schema = z.object({
  id: z.string(),
  planDate: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(checklistItemSchema),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  thesisConviction: thesisConvictionSchema,
  changeMindCondition: z.string(),
  attachments: z.array(attachmentSchema),
  planStatus: z.enum(["draft", "frozen"]),
  versions: z.array(snapshotSchema),
  review: reviewV5Schema,
  createdAt: z.string(),
  updatedAt: z.string(),
});


const planV6Schema = z.object({
  id: z.string(),
  planDate: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(checklistItemSchema),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  thesisConviction: thesisConvictionSchema,
  changeMindCondition: z.string(),
  attachments: z.array(attachmentSchema),
  planStatus: z.enum(["draft", "frozen"]),
  versions: z.array(snapshotSchema),
  review: reviewSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});


const planSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  sessionId: z.string(),
  planDate: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(checklistItemSchema),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  thesisConviction: thesisConvictionSchema,
  changeMindCondition: z.string(),
  attachments: z.array(attachmentSchema),
  planStatus: z.enum(["draft", "frozen"]),
  versions: z.array(snapshotSchema),
  review: reviewSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const planTemplateSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  title: z.string(),
  asset: z.string(),
  setupId: z.string().optional(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  thesisConviction: thesisConvictionSchema,
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  changeMindCondition: z.string(),
  maxRisk: z.string(),
  maxTrades: z.number().int().min(1),
  noTradeConditions: z.string(),
  checklist: z.array(checklistItemSchema),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const journalTradeSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  externalId: z.string(),
  tradingDate: z.string(),
  asset: z.string(),
  side: z.string(),
  entryTime: z.string(),
  exitTime: z.string(),
  entryPrice: z.string(),
  exitPrice: z.string(),
  quantity: z.string(),
  result: z.string(),
  notes: z.string(),
  planId: z.string().optional(),
  sessionId: z.string().optional(),
  scenarioLabel: z.enum(["", "A", "B", "C"]),
  importSource: z.string(),
  importedAt: z.string(),
});

const trainingRecordSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  type: z.enum(["replay", "revisit", "error"]),
  planId: z.string().optional(),
  setupId: z.string().optional(),
  ruleId: z.string().optional(),
  prompt: z.string(),
  decisionNow: z.string(),
  interpretationNow: z.string(),
  comparisonNotes: z.string(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

const setupExampleSchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  setupId: z.string(),
  planId: z.string(),
  classification: z.enum(["Correto", "Incorreto"]),
  notes: z.string(),
  createdAt: z.string(),
});

const studySchema = z.object({
  id: z.string(),
  isDemo: z.boolean().optional(),
  title: z.string(),
  studyDate: z.string(),
  referenceDate: z.string(),
  asset: z.string(),
  timeframe: z.string(),
  bias: z.enum(["Alta", "Baixa", "Neutro"]),
  setupId: z.string().optional(),
  objective: z.string(),
  marketContext: z.string(),
  keyLevels: z.string(),
  macroEvents: z.string(),
  evidenceAgainstThesis: z.string(),
  scenarios: z.array(scenarioSchema),
  behaviorPlan: z.string(),
  conclusion: z.string(),
  lessons: z.string(),
  status: z.enum(["draft", "completed"]),
  attachments: z.array(attachmentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const stateV2Schema = z.object({
  schemaVersion: z.literal(2),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planV4Schema),
  settings: settingsV2Schema,
  updatedAt: z.string(),
});

const stateV3Schema = z.object({
  schemaVersion: z.literal(3),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planV4Schema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateV4Schema = z.object({
  schemaVersion: z.literal(4),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planV4Schema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateV5Schema = z.object({
  schemaVersion: z.literal(5),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planV5Schema),
  planTemplates: z.array(planTemplateSchema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateV6Schema = z.object({
  schemaVersion: z.literal(6),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planV6Schema),
  planTemplates: z.array(planTemplateSchema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateV7Schema = z.object({
  schemaVersion: z.literal(7),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planSchema),
  planTemplates: z.array(planTemplateSchema),
  journalTrades: z.array(journalTradeSchema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateV8Schema = z.object({
  schemaVersion: z.literal(8),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planSchema),
  planTemplates: z.array(planTemplateSchema),
  journalTrades: z.array(journalTradeSchema),
  trainingRecords: z.array(trainingRecordSchema),
  setupExamples: z.array(setupExampleSchema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

const stateSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  demoDataVersion: z.number().int().optional(),
  attachmentData: z.record(z.string(), z.string()),
  rules: z.array(ruleSchema),
  setups: z.array(setupSchema),
  plans: z.array(planSchema),
  planTemplates: z.array(planTemplateSchema),
  journalTrades: z.array(journalTradeSchema),
  trainingRecords: z.array(trainingRecordSchema),
  setupExamples: z.array(setupExampleSchema),
  studies: z.array(studySchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

type JsonObject = Record<string, unknown>;

function isAttachmentLike(value: unknown): value is JsonObject & { id: string; name: string; createdAt: string; dataUrl: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as JsonObject;
  return typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.createdAt === "string"
    && typeof item.dataUrl === "string";
}

function compactAttachments(value: unknown, attachmentData: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => compactAttachments(item, attachmentData));
  if (!value || typeof value !== "object") return value;

  const source = value as JsonObject;
  const target: JsonObject = {};

  if (isAttachmentLike(source) && source.dataUrl) {
    attachmentData[source.id] = source.dataUrl;
  }

  for (const [key, item] of Object.entries(source)) {
    if (key === "attachmentData") continue;
    if (key === "dataUrl" && isAttachmentLike(source)) {
      target[key] = "";
      continue;
    }
    target[key] = compactAttachments(item, attachmentData);
  }

  return target;
}

function hydrateAttachments(value: unknown, attachmentData: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => hydrateAttachments(item, attachmentData));
  if (!value || typeof value !== "object") return value;

  const source = value as JsonObject;
  const target: JsonObject = {};
  for (const [key, item] of Object.entries(source)) {
    if (key === "attachmentData") continue;
    target[key] = hydrateAttachments(item, attachmentData);
  }

  if (isAttachmentLike(source)) {
    const resolved = source.dataUrl || attachmentData[source.id];
    if (!resolved) {
      throw new Error(`Anexo ${source.id} está sem conteúdo de imagem no armazenamento deduplicado.`);
    }
    target.dataUrl = resolved;
  }

  return target;
}

function hydrateCurrentState(state: z.infer<typeof stateSchema>): AppState {
  const hydrated = hydrateAttachments(state, state.attachmentData) as AppState;
  hydrated.attachmentData = {};
  return hydrated;
}

export function serializeState(state: AppState, pretty = false, exportedAt?: string) {
  const attachmentData = { ...state.attachmentData };
  const compacted = compactAttachments(state, attachmentData) as JsonObject;
  const payload: JsonObject = {
    ...compacted,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    attachmentData,
    updatedAt: now(),
  };
  if (exportedAt) payload.exportedAt = exportedAt;
  return JSON.stringify(payload, null, pretty ? 2 : undefined);
}

function now() {
  return new Date().toISOString();
}

function migratedChecklist(items: string[]) {
  return items.map((text) => ({ id: crypto.randomUUID(), text, checked: false }));
}

function migrateSnapshotV4(snapshot: z.infer<typeof snapshotV4Schema>) {
  return {
    ...snapshot,
    checklist: migratedChecklist(snapshot.checklist),
    thesisConviction: "" as const,
    changeMindCondition: "",
    readinessScore: undefined,
    readinessIssues: undefined,
  };
}

function migratePlanV4(plan: z.infer<typeof planV4Schema>) {
  return {
    ...plan,
    sessionId: crypto.randomUUID(),
    checklist: migratedChecklist(plan.checklist),
    thesisConviction: "" as const,
    changeMindCondition: "",
    versions: plan.versions.map(migrateSnapshotV4),
    review: migrateReviewV5(plan.review),
  };
}

function migrateV1PlanToV4(plan: z.infer<typeof planV1Schema>): z.infer<typeof planV4Schema> {
  return {
    ...plan,
    setupId: undefined,
    evidenceAgainstThesis: "",
    planStatus: "draft",
    versions: [],
    review: {
      ...plan.review,
      executionSummary: "",
    },
  };
}

function migrateReviewV5(review: z.infer<typeof reviewV5Schema>) {
  return {
    ...review,
    executionOrigin: "" as const,
    violatedRuleIds: [],
    readingQuality: 0,
    executionQuality: 0,
  };
}

function migratePlanV5(plan: z.infer<typeof planV5Schema>) {
  return {
    ...plan,
    sessionId: crypto.randomUUID(),
    review: migrateReviewV5(plan.review),
  };
}

function migratePlanV6(plan: z.infer<typeof planV6Schema>) {
  return {
    ...plan,
    sessionId: crypto.randomUUID(),
  };
}

export function initialState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    attachmentData: {},
    rules: [],
    setups: [],
    plans: [],
    planTemplates: [],
    journalTrades: [],
    trainingRecords: [],
    setupExamples: [],
    studies: [],
    settings: {
      traderName: "",
      assets: ["WINFUT", "WDOFUT", "DI1FUT", "EWZ"],
      defaultMaxRisk: "",
      defaultMaxTrades: 3,
      theme: "dark",
      language: "pt-BR",
      attachments: [],
    },
    updatedAt: now(),
  };
}

function migrateState(data: unknown): AppState {
  const versionResult = z.object({ schemaVersion: z.number().int() }).safeParse(data);
  if (!versionResult.success) {
    throw new Error("Arquivo sem versão de schema reconhecível.");
  }

  if (versionResult.data.schemaVersion === CURRENT_SCHEMA_VERSION) {
    const current = stateSchema.safeParse(data);
    if (!current.success) {
      const issue = current.error.issues[0];
      throw new Error(`Dados incompatíveis em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return hydrateCurrentState(current.data);
  }

  if (versionResult.data.schemaVersion === 8) {
    const legacy = stateV8Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v8 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 7) {
    const legacy = stateV7Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v7 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      trainingRecords: [],
      setupExamples: [],
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 6) {
    const legacy = stateV6Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v6 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      plans: legacy.data.plans.map(migratePlanV6),
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 5) {
    const legacy = stateV5Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v5 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      plans: legacy.data.plans.map(migratePlanV5),
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 4) {
    const legacy = stateV4Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v4 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      plans: legacy.data.plans.map(migratePlanV4),
      planTemplates: [],
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 3) {
    const legacy = stateV3Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v3 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      plans: legacy.data.plans.map(migratePlanV4),
      planTemplates: [],
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      studies: [],
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 2) {
    const legacy = stateV2Schema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v2 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      ...legacy.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      plans: legacy.data.plans.map(migratePlanV4),
      planTemplates: [],
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      studies: [],
      settings: { ...legacy.data.settings, language: "pt-BR" },
      updatedAt: now(),
    };
  }

  if (versionResult.data.schemaVersion === 1) {
    const legacy = legacyStateSchema.safeParse(data);
    if (!legacy.success) {
      const issue = legacy.error.issues[0];
      throw new Error(`Backup v1 inválido em ${issue.path.join(".") || "arquivo"}: ${issue.message}`);
    }
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      attachmentData: {},
      rules: legacy.data.rules,
      setups: [],
      plans: legacy.data.plans.map((plan) => migratePlanV4(migrateV1PlanToV4(plan))),
      planTemplates: [],
      journalTrades: [],
      trainingRecords: [],
      setupExamples: [],
      studies: [],
      settings: { ...legacy.data.settings, language: "pt-BR" },
      updatedAt: now(),
    };
  }

  throw new Error(`Versão de backup não suportada: ${versionResult.data.schemaVersion}.`);
}

export function loadStateResult(): StateLoadResult {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    clearStorageLoadGuard();
    return { state: initialState() };
  }

  try {
    const state = migrateState(JSON.parse(saved) as unknown);
    clearStorageLoadGuard();
    return { state };
  } catch (error) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const recoveryKey = `trade-blueprint-corrompido-${stamp}`;
    let preserved = false;

    try {
      localStorage.setItem(recoveryKey, saved);
      preserved = true;
    } catch {
      // The original key remains untouched even if there is no quota for a recovery copy.
    }

    const reason = error instanceof Error ? error.message : String(error);
    const message = preserved
      ? `Os dados locais não puderam ser lidos e NÃO serão sobrescritos. Uma cópia bruta foi preservada em ${recoveryKey}. Motivo: ${reason}`
      : `Os dados locais não puderam ser lidos e NÃO serão sobrescritos. O conteúdo original permanece na chave principal, mas não houve espaço para criar uma cópia adicional. Motivo: ${reason}`;

    setStorageLoadGuard(message, preserved ? recoveryKey : undefined);
    return { state: initialState(), error: message, recoveryKey: preserved ? recoveryKey : undefined };
  }
}

export function loadState(): AppState {
  return loadStateResult().state;
}

export function saveState(state: AppState) {
  const guard = storageLoadGuardMessage();
  if (guard) {
    throw new Error(guard);
  }
  localStorage.setItem(STORAGE_KEY, serializeState(state));
}

export function parseBackup(text: string): AppState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("O arquivo selecionado não contém um JSON válido.");
  }
  return migrateState(data);
}

export function exportBackup(state: AppState) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([
    serializeState(state, true, now()),
  ], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `trade-blueprint-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
