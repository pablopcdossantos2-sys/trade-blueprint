import type {
  AppState,
  ChecklistItem,
  JournalTrade,
  PlanReview,
  PlanSnapshot,
  PlanTemplate,
  Scenario,
  SetupExample,
  TradePlan,
  TradeRule,
  TradeSetup,
  TradeStudy,
  TrainingRecord,
} from "./types";

export const DEMO_DATA_VERSION = 1;

function id() {
  return crypto.randomUUID();
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function businessDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const direction = offset < 0 ? -1 : 1;
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + direction);
  return localDate(date);
}

function timestamp(date: string, hour: number, minute = 0) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function demoRule(): TradeRule {
  const stamp = new Date().toISOString();
  return {
    id: id(),
    isDemo: true,
    title: "Exemplo — Não ampliar o stop após a entrada",
    category: "Risco",
    description: "Mantenha o limite de risco definido antes da entrada. Qualquer ajuste deve seguir um critério de gestão previamente documentado.",
    rationale: "A regra evita que uma operação inicialmente controlada se transforme em uma perda maior por reação emocional.",
    active: true,
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function demoSetup(): TradeSetup {
  const stamp = new Date().toISOString();
  return {
    id: id(),
    isDemo: true,
    title: "Exemplo — Reteste após rompimento",
    description: "Padrão ilustrativo para reconhecer quando um nível rompido passa a atuar como referência.",
    marketContext: "Mercado com direção definida, rompimento acompanhado por participação e retorno organizado ao nível.",
    entryCriteria: "Aguardar o retorno ao nível rompido e observar a reação do preço. Não entrar apenas porque o nível foi tocado.",
    confirmation: "Exigir retomada do movimento na direção do rompimento e confirmação no timeframe de execução.",
    invalidation: "Perda sustentada do nível que deveria ser defendido no reteste.",
    stopModel: "Posicionar o stop além do ponto que invalida a hipótese, respeitando o risco máximo definido no plano.",
    targetModel: "Registrar previamente as regiões de saída e o critério para reduzir ou encerrar a posição.",
    avoid: "Não antecipar o reteste, perseguir preço ou aplicar o padrão em contexto lateral sem confirmação.",
    behaviorNotes: "Esperar a confirmação; aceitar que a ausência de entrada também é uma decisão válida.",
    active: true,
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function demoScenarios(): Scenario[] {
  return [
    {
      id: id(), label: "A", title: "Exemplo — Continuidade após reteste",
      trigger: "O preço retorna ao nível rompido e permanece na região.",
      confirmation: "A reação volta a favorecer a direção do rompimento.",
      action: "Aguardar confirmação e então avaliar a entrada conforme as regras do sistema.",
      invalidation: "Aceitação do preço do outro lado do nível.",
      stop: "Além do ponto de invalidação, dentro do risco máximo.",
      targets: "Regiões técnicas registradas no plano.",
      avoid: "Não antecipar a confirmação.",
    },
    {
      id: id(), label: "B", title: "Exemplo — Falha do rompimento",
      trigger: "O preço retorna ao nível e não consegue retomá-lo.",
      confirmation: "A falha fica clara pela permanência do preço além do nível.",
      action: "Cancelar a hipótese de continuidade e reavaliar o contexto.",
      invalidation: "Retomada consistente do nível rompido.",
      stop: "Não há entrada enquanto a hipótese não estiver confirmada.",
      targets: "Reavaliar apenas após nova estrutura.",
      avoid: "Não insistir em uma tese invalidada.",
    },
    {
      id: id(), label: "C", title: "Exemplo — Ausência de oportunidade",
      trigger: "O preço não retorna à região ou o contexto fica confuso.",
      confirmation: "Nenhuma confirmação objetiva aparece.",
      action: "Não operar e preservar o limite de risco.",
      invalidation: "Uma nova estrutura pode originar outro plano.",
      stop: "Sem operação.",
      targets: "Sem operação.",
      avoid: "Não perseguir o movimento.",
    },
  ];
}

function demoChecklist(): ChecklistItem[] {
  return [
    { id: id(), text: "Li as regras de risco antes de operar", checked: true },
    { id: id(), text: "Identifiquei o nível que invalida a hipótese", checked: true },
    { id: id(), text: "Defini quando não devo operar", checked: true },
  ];
}

function demoReview(ruleId: string): PlanReview {
  return {
    happened: "Exemplo fictício: o preço testou o nível, confirmou a reação e depois perdeu força perto da região de saída.",
    observedScenario: "A",
    followedPlan: "Parcialmente",
    executionSummary: "Exemplo fictício: entrada após confirmação, com encerramento antes do alvo planejado.",
    executionOrigin: "Planejada",
    violatedRuleIds: [ruleId],
    readingQuality: 4,
    executionQuality: 3,
    deviations: "A saída ocorreu antes do critério de gestão definido no exemplo.",
    lessons: "Registrar o critério de saída com a mesma clareza usada para definir a entrada.",
    result: "Exemplo: +0,5R",
    attachments: [],
    reviewedAt: timestamp(businessDate(-1), 17, 0),
  };
}

function demoHistoricalPlan(setupId: string, ruleId: string): TradePlan {
  const stamp = new Date().toISOString();
  const tradingDate = businessDate(-1);
  const checklist = demoChecklist();
  const scenarios = demoScenarios();
  const review = demoReview(ruleId);
  const base = {
    id: id(),
    sessionId: id(),
    planDate: tradingDate,
    tradingDate,
    asset: "WINFUT",
    bias: "Alta" as const,
    setupId,
    marketContext: "Exemplo fictício: sessão com direção inicial definida e teste de uma região previamente mapeada.",
    keyLevels: "Exemplo: máxima anterior e região de reteste.",
    macroEvents: "Verificar calendário econômico antes da sessão.",
    evidenceAgainstThesis: "Ausência de continuidade e aceitação do preço abaixo do nível.",
    maxRisk: "Exemplo: 1R",
    maxTrades: 2,
    noTradeConditions: "Não operar sem confirmação ou após atingir o limite de risco.",
    checklist,
    scenarios,
    behaviorPlan: "Aguardar confirmação e não perseguir preço.",
    thesisConviction: "Média" as const,
    changeMindCondition: "Aceitação consistente do preço além do nível de invalidação.",
    attachments: [],
    planStatus: "frozen" as const,
    versions: [] as PlanSnapshot[],
    review,
    createdAt: timestamp(tradingDate, 8, 0),
    updatedAt: timestamp(tradingDate, 17, 0),
    isDemo: true,
  };
  const snapshot: PlanSnapshot = {
    id: id(),
    version: 1,
    frozenAt: timestamp(tradingDate, 8, 45),
    asset: base.asset,
    tradingDate,
    bias: base.bias,
    setupId,
    marketContext: base.marketContext,
    keyLevels: base.keyLevels,
    macroEvents: base.macroEvents,
    evidenceAgainstThesis: base.evidenceAgainstThesis,
    maxRisk: base.maxRisk,
    maxTrades: base.maxTrades,
    noTradeConditions: base.noTradeConditions,
    checklist: structuredClone(checklist),
    scenarios: structuredClone(scenarios),
    behaviorPlan: base.behaviorPlan,
    thesisConviction: base.thesisConviction,
    changeMindCondition: base.changeMindCondition,
    readinessScore: 90,
    readinessIssues: ["Exemplo: o plano pode detalhar ainda mais o critério de saída."],
    attachments: [],
  };
  return { ...base, versions: [snapshot] };
}

function demoUpcomingPlan(setupId: string) {
  const stamp = new Date().toISOString();
  return {
    id: id(),
    sessionId: id(),
    planDate: localDate(new Date()),
    tradingDate: businessDate(1),
    asset: "WINFUT",
    bias: "Neutro" as const,
    setupId,
    marketContext: "Exemplo: aguardar a abertura e identificar se haverá direção definida.",
    keyLevels: "Exemplo: máxima e mínima anteriores.",
    macroEvents: "Consultar o calendário antes do pregão.",
    evidenceAgainstThesis: "A hipótese perde validade se o preço permanecer em equilíbrio sem confirmação.",
    maxRisk: "Exemplo: 1R",
    maxTrades: 2,
    noTradeConditions: "Não operar sem gatilho claro ou após alcançar o limite diário.",
    checklist: demoChecklist().map((item) => ({ ...item, checked: false })),
    scenarios: demoScenarios(),
    behaviorPlan: "Esperar o preço chegar à região; não antecipar a entrada.",
    thesisConviction: "Baixa" as const,
    changeMindCondition: "Uma estrutura clara e confirmação no timeframe de execução.",
    attachments: [],
    planStatus: "draft" as const,
    versions: [],
    review: {
      happened: "", observedScenario: "", followedPlan: "", executionSummary: "",
      executionOrigin: "", violatedRuleIds: [], readingQuality: 0, executionQuality: 0,
      deviations: "", lessons: "", result: "", attachments: [],
    },
    createdAt: stamp,
    updatedAt: stamp,
    isDemo: true,
  } satisfies TradePlan;
}

function demoTemplate(setupId: string): PlanTemplate {
  const stamp = new Date().toISOString();
  return {
    id: id(),
    isDemo: true,
    title: "Exemplo — Plano com reteste",
    asset: "WINFUT",
    setupId,
    bias: "Neutro",
    thesisConviction: "Baixa",
    marketContext: "Use este modelo apenas como ponto de partida; descreva o contexto real da próxima sessão.",
    keyLevels: "Máxima/mínima anterior e região de reteste.",
    macroEvents: "Conferir calendário econômico.",
    evidenceAgainstThesis: "Ausência de confirmação e perda do nível de referência.",
    changeMindCondition: "Aceitação consistente do preço além da invalidação.",
    maxRisk: "Exemplo: 1R",
    maxTrades: 2,
    noTradeConditions: "Não operar sem confirmação.",
    checklist: demoChecklist(),
    scenarios: demoScenarios(),
    behaviorPlan: "Aguardar; não perseguir preço.",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function demoStudy(): TradeStudy {
  const stamp = new Date().toISOString();
  const studyDate = businessDate(-1);
  return {
    id: id(),
    isDemo: true,
    title: "Exemplo — Reação do preço à abertura",
    studyDate,
    referenceDate: studyDate,
    asset: "WINFUT",
    timeframe: "5 min",
    bias: "Neutro",
    objective: "Observar como o preço reage à região de fechamento anterior.",
    marketContext: "Exemplo fictício: abertura próxima ao fechamento anterior, com teste dos dois lados.",
    keyLevels: "Fechamento anterior, máxima e mínima da primeira faixa.",
    macroEvents: "Sem evento relevante no exemplo.",
    evidenceAgainstThesis: "A ausência de aceitação em qualquer lado impede definir uma direção.",
    scenarios: demoScenarios(),
    behaviorPlan: "Esperar a faixa inicial se formar antes de definir o cenário.",
    conclusion: "O contexto permaneceu indefinido; não houve condição suficiente para classificar uma entrada.",
    lessons: "Registrar o que faria a hipótese deixar de valer antes de observar o desfecho.",
    status: "completed",
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
    completedAt: stamp,
  };
}

function demoJournalTrade(plan: TradePlan): JournalTrade {
  const tradingDate = plan.tradingDate;
  return {
    id: id(),
    isDemo: true,
    externalId: "DEMO-WINFUT-001",
    tradingDate,
    asset: plan.asset,
    side: "Compra",
    entryTime: "09:18",
    exitTime: "09:42",
    entryPrice: "132.500",
    exitPrice: "132.550",
    quantity: "1",
    result: "Exemplo: +0,5R",
    notes: "Registro fictício para demonstrar o vínculo entre execução e plano.",
    planId: plan.id,
    sessionId: plan.sessionId,
    scenarioLabel: "A",
    importSource: "Exemplo de demonstração",
    importedAt: new Date().toISOString(),
  };
}

function demoTraining(plan: TradePlan, ruleId: string): TrainingRecord {
  const stamp = new Date().toISOString();
  return {
    id: id(),
    isDemo: true,
    type: "revisit",
    planId: plan.id,
    setupId: plan.setupId,
    ruleId,
    prompt: "Exemplo: revisitar uma decisão após a sessão.",
    decisionNow: "Aguardar a confirmação completa antes de considerar uma entrada.",
    interpretationNow: "A região foi respeitada inicialmente, mas a confirmação não se manteve.",
    comparisonNotes: "A saída antecipada deve ser comparada ao critério de gestão que havia sido definido.",
    createdAt: stamp,
    completedAt: stamp,
  };
}

function demoSetupExample(plan: TradePlan, setupId: string): SetupExample {
  return {
    id: id(),
    isDemo: true,
    setupId,
    planId: plan.id,
    classification: "Incorreto",
    notes: "Exemplo didático: a entrada ocorreu antes da confirmação exigida pelo setup. Use a classificação para registrar o que repetir ou evitar.",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Insere exemplos fictícios uma única vez, preservando todos os dados existentes.
 * O marcador permanece mesmo depois de o usuário excluir os exemplos, evitando que
 * os itens reapareçam em toda inicialização.
 */
export function ensureDemoData(state: AppState): AppState {
  if ((state.demoDataVersion ?? 0) >= DEMO_DATA_VERSION) return state;

  const rule = demoRule();
  const setup = demoSetup();
  const historicalPlan = demoHistoricalPlan(setup.id, rule.id);
  const upcomingPlan = demoUpcomingPlan(setup.id);

  return {
    ...state,
    demoDataVersion: DEMO_DATA_VERSION,
    rules: [...state.rules, rule],
    setups: [...state.setups, setup],
    plans: [...state.plans, historicalPlan, upcomingPlan],
    planTemplates: [...state.planTemplates, demoTemplate(setup.id)],
    journalTrades: [...state.journalTrades, demoJournalTrade(historicalPlan)],
    trainingRecords: [...state.trainingRecords, demoTraining(historicalPlan, rule.id)],
    setupExamples: [...state.setupExamples, demoSetupExample(historicalPlan, setup.id)],
    studies: [...state.studies, demoStudy()],
  };
}
