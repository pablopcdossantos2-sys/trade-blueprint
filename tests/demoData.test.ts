import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_DATA_VERSION, ensureDemoData } from "../src/demoData.ts";
import { initialState } from "../src/storage.ts";

test("insere um exemplo identificável em cada área de registro", () => {
  const seeded = ensureDemoData(initialState());

  assert.equal(seeded.demoDataVersion, DEMO_DATA_VERSION);
  assert.ok(seeded.rules.some((item) => item.isDemo));
  assert.ok(seeded.setups.some((item) => item.isDemo));
  assert.ok(seeded.plans.some((item) => item.isDemo));
  assert.ok(seeded.planTemplates.some((item) => item.isDemo));
  assert.ok(seeded.journalTrades.some((item) => item.isDemo));
  assert.equal(seeded.trainingRecords.some((item) => item.isDemo), false);
  assert.equal(seeded.setupExamples.some((item) => item.isDemo), false);
  assert.ok(seeded.studies.some((item) => item.isDemo));

  const historicalPlan = seeded.plans.find((item) => item.isDemo && item.review.reviewedAt);
  assert.ok(historicalPlan);
  assert.ok(historicalPlan.versions.length > 0);
});

test("não recria exemplos depois que o usuário os remove", () => {
  const seeded = ensureDemoData(initialState());
  const cleared = {
    ...seeded,
    rules: seeded.rules.filter((item) => !item.isDemo),
    setups: seeded.setups.filter((item) => !item.isDemo),
    plans: seeded.plans.filter((item) => !item.isDemo),
    planTemplates: seeded.planTemplates.filter((item) => !item.isDemo),
    journalTrades: seeded.journalTrades.filter((item) => !item.isDemo),
    trainingRecords: seeded.trainingRecords.filter((item) => !item.isDemo),
    setupExamples: seeded.setupExamples.filter((item) => !item.isDemo),
    studies: seeded.studies.filter((item) => !item.isDemo),
  };

  const next = ensureDemoData(cleared);
  assert.equal(next.demoDataVersion, DEMO_DATA_VERSION);
  for (const collection of [
    next.rules, next.setups, next.plans, next.planTemplates,
    next.journalTrades, next.trainingRecords, next.setupExamples, next.studies,
  ]) {
    assert.equal(collection.some((item) => item.isDemo), false);
  }
});

test("preserva registros reais ao acrescentar os exemplos", () => {
  const state = initialState();
  const realRule = {
    id: "user-rule-1",
    title: "Minha regra de risco",
    category: "Risco" as const,
    description: "Não ampliar o stop.",
    rationale: "Manter risco previsível.",
    active: true,
    attachments: [],
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };
  state.rules.push(realRule);

  const seeded = ensureDemoData(state);
  assert.equal(seeded.rules.find((item) => item.id === realRule.id)?.title, realRule.title);
  assert.equal(seeded.rules.filter((item) => !item.isDemo).length, 1);
  assert.equal(seeded.rules.filter((item) => item.isDemo).length, 1);
});


test("preserva registros legados de treinamento sem criar novos exemplos", () => {
  const state = initialState();
  const legacyTraining = {
    id: "legacy-training-1",
    type: "revisit" as const,
    prompt: "Registro antigo",
    decisionNow: "Aguardar",
    interpretationNow: "Confirmar",
    comparisonNotes: "Revisar depois",
    createdAt: "2026-01-02T12:00:00.000Z",
  };
  const legacySetupExample = {
    id: "legacy-setup-example-1",
    setupId: "legacy-setup",
    planId: "legacy-plan",
    classification: "Correto" as const,
    notes: "Exemplo antigo",
    createdAt: "2026-01-02T12:00:00.000Z",
  };
  state.trainingRecords.push(legacyTraining);
  state.setupExamples.push(legacySetupExample);

  const seeded = ensureDemoData(state);

  assert.deepEqual(seeded.trainingRecords, [legacyTraining]);
  assert.deepEqual(seeded.setupExamples, [legacySetupExample]);
  assert.equal(seeded.trainingRecords.some((item) => item.isDemo), false);
  assert.equal(seeded.setupExamples.some((item) => item.isDemo), false);
});
