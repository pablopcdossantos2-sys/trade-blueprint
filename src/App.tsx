/** @jsxImportSource ./i18nRuntime */
import { useEffect, useMemo, useRef, useState } from "react";
import { prepareImage } from "./images";
import { clearWebAttachmentStore, loadWebStatePayload, saveWebStateExternalized } from "./attachmentStore";
import { normalizedTradeDate, parseJournalRows } from "./journalImport";
import { clearStorageLoadGuard, exportBackup, initialState, loadStateResult, parseBackup, serializeState, STORAGE_KEY } from "./storage";
import { localeForLanguage, setInterfaceLanguage, translateUi, type UiLanguage } from "./i18n";
import { DEMO_DATA_VERSION, ensureDemoData } from "./demoData";
import {
  checkDesktopIntegrity,
  checkDesktopUpdate,
  chooseDesktopBackupDirectory,
  chooseDesktopBackupFile,
  createDesktopBackup,
  desktopVersion,
  getDesktopBackupDirectory,
  installDesktopUpdate,
  isDesktopApp,
  loadDesktopState,
  previewDesktopBackup,
  restoreDesktopBackup,
  saveDesktopState,
  setDesktopBackupDirectory,
  type DesktopIntegrityInfo,
  type DesktopUpdateInfo,
} from "./desktop";
import type {
  AppState,
  Attachment,
  ChecklistItem,
  JournalTrade,
  PlanReview,
  PlanTemplate,
  PlanSnapshot,
  RuleCategory,
  Scenario,
  SetupExample,
  TrainingRecord,
  TradePlan,
  TradeRule,
  TradeSetup,
  TradeStudy,
} from "./types";

type Tab = "dashboard" | "system" | "plans" | "studies" | "history" | "training" | "settings";

const ruleCategories: RuleCategory[] = ["Entrada", "Saída", "Risco", "Horário", "Contexto", "Comportamento", "Outro"];
const defaultChecklist = [
  "Li minhas regras do sistema antes de operar",
  "Mapeei eventos macroeconômicos e horários de risco",
  "Defini onde não devo operar",
  "Defini risco máximo e número máximo de trades",
  "Procurei evidências que contradizem minha tese principal",
];

function checklistFromTexts(items: string[]): ChecklistItem[] {
  return items.map((text) => ({ id: crypto.randomUUID(), text, checked: false }));
}

let activeLocale = "pt-BR";
let activeLanguage: UiLanguage = "pt-BR";

function isoDateLocal(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function tomorrow() {
  const date = new Date();
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || date.getDay() === 6);
  return isoDateLocal(date);
}

function emptyScenario(label: "A" | "B" | "C"): Scenario {
  return {
    id: crypto.randomUUID(),
    label,
    title: "",
    trigger: "",
    confirmation: "",
    action: "",
    invalidation: "",
    stop: "",
    targets: "",
    avoid: "",
  };
}

function emptyReview(): PlanReview {
  return {
    happened: "",
    observedScenario: "",
    followedPlan: "",
    executionSummary: "",
    executionOrigin: "",
    violatedRuleIds: [],
    readingQuality: 0,
    executionQuality: 0,
    deviations: "",
    lessons: "",
    result: "",
    attachments: [],
  };
}

function newPlan(state: AppState): TradePlan {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    planDate: isoDateLocal(),
    tradingDate: tomorrow(),
    asset: state.settings.assets[0] ?? "",
    bias: "Neutro",
    setupId: undefined,
    marketContext: "",
    keyLevels: "",
    macroEvents: "",
    evidenceAgainstThesis: "",
    maxRisk: state.settings.defaultMaxRisk,
    maxTrades: state.settings.defaultMaxTrades,
    noTradeConditions: "",
    checklist: checklistFromTexts(defaultChecklist),
    scenarios: [emptyScenario("A"), emptyScenario("B"), emptyScenario("C")],
    behaviorPlan: "",
    thesisConviction: "",
    changeMindCondition: "",
    attachments: [],
    planStatus: "draft",
    versions: [],
    review: emptyReview(),
    createdAt: stamp,
    updatedAt: stamp,
  };
}


type ReadinessResult = {
  score: number;
  issues: string[];
  criticalIssues: string[];
};

function planReadiness(plan: Pick<TradePlan, "marketContext" | "maxRisk" | "noTradeConditions" | "evidenceAgainstThesis" | "changeMindCondition" | "checklist" | "scenarios" | "behaviorPlan" | "keyLevels">): ReadinessResult {
  const checks: Array<{ ok: boolean; issue: string; critical?: boolean }> = [
    { ok: !!plan.marketContext.trim(), issue: "Contexto de mercado não descrito." },
    { ok: !!plan.keyLevels.trim(), issue: "Níveis importantes não registrados." },
    { ok: !!plan.maxRisk.trim(), issue: "Risco máximo não definido.", critical: true },
    { ok: !!plan.noTradeConditions.trim(), issue: "Condições para não operar não definidas.", critical: true },
    { ok: !!plan.evidenceAgainstThesis.trim(), issue: "Contraprova da tese não registrada.", critical: true },
    { ok: !!plan.changeMindCondition.trim(), issue: "Não foi definido o que faria você mudar de opinião.", critical: true },
    { ok: !!plan.behaviorPlan.trim(), issue: "Plano comportamental não preenchido." },
    { ok: plan.checklist.length > 0 && plan.checklist.every((item) => item.text.trim() && item.checked), issue: "Checklist pré-mercado ainda possui itens pendentes.", critical: true },
    { ok: plan.scenarios.some((scenario) => scenario.title.trim() && scenario.trigger.trim() && scenario.action.trim()), issue: "Nenhum cenário possui hipótese, gatilho e ação completos.", critical: true },
    { ok: plan.scenarios.filter((scenario) => scenario.title.trim() || scenario.trigger.trim() || scenario.action.trim()).every((scenario) => !!scenario.invalidation.trim()), issue: "Há cenário utilizado sem critério de invalidação.", critical: true },
  ];

  const completed = checks.filter((item) => item.ok).length;
  return {
    score: Math.round((completed / checks.length) * 100),
    issues: checks.filter((item) => !item.ok).map((item) => item.issue),
    criticalIssues: checks.filter((item) => !item.ok && item.critical).map((item) => item.issue),
  };
}

function templateFromPlan(plan: TradePlan, title: string): PlanTemplate {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    asset: plan.asset,
    setupId: plan.setupId,
    bias: plan.bias,
    thesisConviction: plan.thesisConviction,
    marketContext: plan.marketContext,
    keyLevels: plan.keyLevels,
    macroEvents: plan.macroEvents,
    evidenceAgainstThesis: plan.evidenceAgainstThesis,
    changeMindCondition: plan.changeMindCondition,
    maxRisk: plan.maxRisk,
    maxTrades: plan.maxTrades,
    noTradeConditions: plan.noTradeConditions,
    checklist: structuredClone(plan.checklist).map((item) => ({ ...item, id: crypto.randomUUID(), checked: false })),
    scenarios: structuredClone(plan.scenarios).map((scenario) => ({ ...scenario, id: crypto.randomUUID() })),
    behaviorPlan: plan.behaviorPlan,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function planFromTemplate(state: AppState, template: PlanTemplate): TradePlan {
  const plan = newPlan(state);
  return {
    ...plan,
    asset: template.asset || plan.asset,
    setupId: template.setupId,
    bias: template.bias,
    thesisConviction: template.thesisConviction,
    marketContext: template.marketContext,
    keyLevels: template.keyLevels,
    macroEvents: template.macroEvents,
    evidenceAgainstThesis: template.evidenceAgainstThesis,
    changeMindCondition: template.changeMindCondition,
    maxRisk: template.maxRisk || plan.maxRisk,
    maxTrades: template.maxTrades,
    noTradeConditions: template.noTradeConditions,
    checklist: structuredClone(template.checklist).map((item) => ({ ...item, id: crypto.randomUUID(), checked: false })),
    scenarios: structuredClone(template.scenarios).map((scenario) => ({ ...scenario, id: crypto.randomUUID() })),
    behaviorPlan: template.behaviorPlan,
  };
}

function duplicatePlan(plan: TradePlan): TradePlan {
  const stamp = new Date().toISOString();
  return {
    ...structuredClone(plan),
    isDemo: false,
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    planDate: isoDateLocal(),
    tradingDate: tomorrow(),
    checklist: plan.checklist.map((item) => ({ ...item, id: crypto.randomUUID(), checked: false })),
    scenarios: plan.scenarios.map((scenario) => ({ ...scenario, id: crypto.randomUUID() })),
    planStatus: "draft",
    versions: [],
    review: emptyReview(),
    createdAt: stamp,
    updatedAt: stamp,
  };
}


function newStudy(state: AppState): TradeStudy {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    studyDate: isoDateLocal(),
    referenceDate: "",
    asset: state.settings.assets[0] ?? "",
    timeframe: "",
    bias: "Neutro",
    setupId: undefined,
    objective: "",
    marketContext: "",
    keyLevels: "",
    macroEvents: "",
    evidenceAgainstThesis: "",
    scenarios: [emptyScenario("A"), emptyScenario("B"), emptyScenario("C")],
    behaviorPlan: "",
    conclusion: "",
    lessons: "",
    status: "draft",
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function blankSetup(): TradeSetup {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    marketContext: "",
    entryCriteria: "",
    confirmation: "",
    invalidation: "",
    stopModel: "",
    targetModel: "",
    avoid: "",
    behaviorNotes: "",
    active: true,
    attachments: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function fmtDate(value: string) {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(activeLocale, { dateStyle: "short" }).format(new Date(y, m - 1, d));
}

function fmtDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(activeLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

function snapshotFromPlan(plan: TradePlan, version: number): PlanSnapshot {
  return {
    id: crypto.randomUUID(),
    version,
    frozenAt: new Date().toISOString(),
    asset: plan.asset,
    tradingDate: plan.tradingDate,
    bias: plan.bias,
    setupId: plan.setupId,
    marketContext: plan.marketContext,
    keyLevels: plan.keyLevels,
    macroEvents: plan.macroEvents,
    evidenceAgainstThesis: plan.evidenceAgainstThesis,
    maxRisk: plan.maxRisk,
    maxTrades: plan.maxTrades,
    noTradeConditions: plan.noTradeConditions,
    checklist: structuredClone(plan.checklist),
    scenarios: structuredClone(plan.scenarios),
    behaviorPlan: plan.behaviorPlan,
    thesisConviction: plan.thesisConviction,
    changeMindCondition: plan.changeMindCondition,
    readinessScore: planReadiness(plan).score,
    readinessIssues: planReadiness(plan).issues,
    attachments: structuredClone(plan.attachments),
  };
}

function currentReference(plan: TradePlan): PlanSnapshot {
  return snapshotFromPlan(plan, Math.max(plan.versions.length, 1));
}

function latestFrozenVersion(plan: TradePlan) {
  return plan.versions.at(-1);
}

function AttachmentField({ value, onChange, title = "Imagens", disabled = false }: { value: Attachment[]; onChange: (next: Attachment[]) => void; title?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  async function add(files: FileList | null) {
    if (!files?.length || disabled) return;
    setBusy(true);
    setError("");
    try {
      const prepared: Attachment[] = [];
      for (const file of Array.from(files)) prepared.push(await prepareImage(file));
      onChange([...valueRef.current, ...prepared]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao anexar imagem.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={`attachment-field ${disabled ? "disabled" : ""}`}>
    <div className="field-label-row"><span>{title}</span><small>PNG/JPG/WebP • compactação automática</small></div>
    {!disabled && <label className="image-drop">
      <input type="file" accept="image/*" multiple onChange={(e) => { void add(e.target.files); e.currentTarget.value = ""; }} />
      {busy ? "Preparando imagens…" : "+ Anexar imagens"}
    </label>}
    {error && <div className="error">{error}</div>}
    {!!value.length && <div className="thumb-grid">{value.map((img) => <figure key={img.id}>
      <img src={img.dataUrl} alt={img.name} />
      <figcaption title={img.name}>{img.name}</figcaption>
      {!disabled && <button type="button" className="tiny danger" onClick={() => onChange(value.filter((x) => x.id !== img.id))}>Remover</button>}
    </figure>)}</div>}
  </div>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Dashboard({ state, onOpenPlans, onOpenSystem }: { state: AppState; onOpenPlans: () => void; onOpenSystem: () => void }) {
  const upcoming = useMemo(
    () => [...state.plans].filter((p) => p.tradingDate >= isoDateLocal()).sort((a, b) => a.tradingDate.localeCompare(b.tradingDate)).slice(0, 6),
    [state.plans],
  );
  const reviewedPlans = state.plans.filter((p) => !p.isDemo && !!p.review.reviewedAt);
  const reviewed = reviewedPlans.length;
  const followed = reviewedPlans.filter((p) => p.review.followedPlan === "Sim").length;
  const frozen = state.plans.filter((p) => !p.isDemo && p.planStatus === "frozen").length;
  const realRules = state.rules.filter((r) => !r.isDemo && r.active).length;
  const realSetups = state.setups.filter((s) => !s.isDemo && s.active).length;
  const realStudies = state.studies.filter((study) => !study.isDemo).length;

  return <section className="page">
    <div className="hero">
      <div>
        <span className="eyebrow">PREPARAÇÃO ANTES DA EXECUÇÃO</span>
        <h1>Preparação do pregão</h1>
        <p>Organize seu sistema de trade, registre o plano antes da abertura e revise o que aconteceu depois da sessão.</p>
      </div>
      <button className="primary big" onClick={onOpenPlans}>Criar plano para o próximo pregão</button>
    </div>

    <div className="stats">
      <div><strong>{realRules}</strong><span>regras ativas</span></div>
      <div><strong>{realSetups}</strong><span>setups ativos</span></div>
      <div><strong>{frozen}</strong><span>planos congelados</span></div>
      <div><strong>{realStudies}</strong><span>estudos registrados</span></div>
      <div><strong>{reviewed ? Math.round((followed / reviewed) * 100) : 0}%</strong><span>aderência integral</span></div>
    </div>

    <div className="two-cols">
      <div className="panel">
        <div className="panel-title"><div><span className="eyebrow">AGENDA</span><h2>Próximos planos</h2></div></div>
        {upcoming.length ? <div className="list">{upcoming.map((p) => <div className="list-row" key={p.id}>
          <div><strong>{p.asset}</strong><span>{fmtDate(p.tradingDate)} • viés {p.bias.toLowerCase()} • {p.versions.length ? `v${p.versions.length}` : "sem versão congelada"}</span></div>
          <div className="badges">{p.isDemo && <span className="badge demo">Exemplo</span>}<span className={`badge ${p.review.reviewedAt ? "ok" : p.planStatus === "frozen" ? "locked" : ""}`}>{p.review.reviewedAt ? "revisado" : p.planStatus === "frozen" ? "congelado" : "rascunho"}</span></div>
        </div>)}</div> : <div className="empty">Nenhum plano futuro. Crie o primeiro plano para o próximo pregão.</div>}
      </div>
      <div className="panel">
        <span className="eyebrow">MÉTODO</span><h2>Ciclo recomendado</h2>
        <ol className="cycle">
          <li><b>Setup + contexto</b><span>Use um padrão conhecido sem ignorar as condições particulares do dia.</span></li>
          <li><b>Contraprova</b><span>Procure evidências contra sua tese antes de defendê-la.</span></li>
          <li><b>Congelamento</b><span>Preserve exatamente o que havia sido decidido antes do pregão.</span></li>
          <li><b>Comparação</b><span>Separe mercado real, sua execução e qualidade do plano.</span></li>
        </ol>
        <button className="small" onClick={onOpenSystem}>Abrir sistema de trade</button>
      </div>
    </div>
  </section>;
}

function RulesPage({ state, setState, embedded = false }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; embedded?: boolean }) {
  const [editing, setEditing] = useState<TradeRule | null>(null);
  const blank = (): TradeRule => ({ id: crypto.randomUUID(), title: "", category: "Entrada", description: "", rationale: "", active: true, attachments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const [draft, setDraft] = useState<TradeRule>(blank());

  function save() {
    if (!draft.title.trim() || !draft.description.trim()) return;
    const item = { ...draft, isDemo: false, updatedAt: new Date().toISOString() };
    setState((s) => ({ ...s, rules: editing ? s.rules.map((r) => r.id === item.id ? item : r) : [item, ...s.rules] }));
    setEditing(null);
    setDraft(blank());
  }

  function edit(rule: TradeRule) {
    setEditing(rule);
    setDraft(structuredClone(rule));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <section className={embedded ? "system-subpage" : "page"}>
    {!embedded && <div className="page-heading"><div><span className="eyebrow">REGRAS GERAIS</span><h1>Regras gerais</h1><p>Defina limites de risco, horários, entradas, saídas e comportamento que valem para todas as operações.</p></div></div>}
    <div className="panel form-panel"><h2>{editing ? "Editar regra" : "Adicionar regra"}</h2>
      <div className="form-grid">
        <Field label="Nome da regra"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Não aumentar stop após entrar" /></Field>
        <Field label="Categoria"><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as RuleCategory })}>{ruleCategories.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Regra"><textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Escreva de forma objetiva o que deve ou não deve ser feito." /></Field>
        <Field label="Por que esta regra existe?" hint="Registrar a justificativa ajuda a obedecer a regra quando houver pressão."><textarea rows={4} value={draft.rationale} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} placeholder="Que problema, erro recorrente ou princípio técnico esta regra protege?" /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Regra ativa</label>
      <AttachmentField value={draft.attachments} onChange={(attachments) => setDraft((current) => ({ ...current, attachments }))} title="Imagens explicativas da regra" />
      <div className="actions"><button className="primary" onClick={save}>{editing ? "Salvar alterações" : "Adicionar regra"}</button>{editing && <button onClick={() => { setEditing(null); setDraft(blank()); }}>Cancelar</button>}</div>
    </div>
    <div className="cards">{state.rules.map((rule) => <article className={`rule-card ${!rule.active ? "muted" : ""}`} key={rule.id}>
      <div className="card-top"><div className="badges"><span className="badge">{rule.category}</span>{rule.isDemo && <span className="badge demo">Exemplo</span>}</div><span className={`status-dot ${rule.active ? "on" : ""}`}>{rule.active ? "ativa" : "inativa"}</span></div>
      <h3>{rule.title}</h3><p>{rule.description}</p>
      {rule.rationale && <div className="why"><b>Por quê:</b> {rule.rationale}</div>}
      {!!rule.attachments.length && <div className="mini-images">{rule.attachments.slice(0, 3).map((img) => <img key={img.id} src={img.dataUrl} alt={img.name} />)}</div>}
      <div className="card-actions"><button onClick={() => edit(rule)}>Editar</button><button className="danger" onClick={() => {
        if (!confirm(translateUi("Remover esta regra?", activeLanguage))) return;
        setState((current) => ({
          ...current,
          rules: current.rules.filter((item) => item.id !== rule.id),
          plans: current.plans.map((plan) => ({
            ...plan,
            review: { ...plan.review, violatedRuleIds: plan.review.violatedRuleIds.filter((id) => id !== rule.id) },
          })),
          trainingRecords: current.trainingRecords.map((record) => record.ruleId === rule.id ? { ...record, ruleId: undefined } : record),
        }));
      }}>Remover</button></div>
    </article>)}</div>
    {!state.rules.length && <div className="empty">Você ainda não cadastrou regras. Comece pelas regras de risco e pelas situações em que não deve operar.</div>}
  </section>;
}

function SetupsPage({ state, setState, embedded = false }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; embedded?: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TradeSetup>(() => blankSetup());

  function reset() {
    setEditingId(null);
    setDraft(blankSetup());
  }

  function save() {
    if (!draft.title.trim() || !draft.entryCriteria.trim()) return;
    const item = { ...draft, isDemo: false, updatedAt: new Date().toISOString() };
    setState((s) => ({
      ...s,
      setups: editingId ? s.setups.map((setup) => setup.id === item.id ? item : setup) : [item, ...s.setups],
    }));
    reset();
  }

  function edit(setup: TradeSetup) {
    setEditingId(setup.id);
    setDraft(structuredClone(setup));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <section className={embedded ? "system-subpage" : "page"}>
    {!embedded && <div className="page-heading"><div><span className="eyebrow">PADRÕES OPERACIONAIS</span><h1>Setups operacionais</h1><p>Descreva os padrões específicos de entrada, com contexto, confirmação e invalidação.</p></div></div>}
    <div className="panel form-panel">
      <h2>{editingId ? "Editar setup" : "Novo setup"}</h2>
      <div className="form-grid two">
        <Field label="Nome do setup"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Pullback na VWAP após abertura direcional" /></Field>
        <Field label="Descrição curta"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Qual ideia operacional este setup representa?" /></Field>
        <Field label="Contexto em que funciona melhor"><textarea rows={4} value={draft.marketContext} onChange={(e) => setDraft({ ...draft, marketContext: e.target.value })} placeholder="Tendência, volatilidade, localização, horário, correlações…" /></Field>
        <Field label="Critérios de entrada"><textarea rows={4} value={draft.entryCriteria} onChange={(e) => setDraft({ ...draft, entryCriteria: e.target.value })} placeholder="Condições objetivas para considerar a entrada." /></Field>
        <Field label="Confirmações necessárias"><textarea rows={4} value={draft.confirmation} onChange={(e) => setDraft({ ...draft, confirmation: e.target.value })} placeholder="O que precisa acontecer antes da execução?" /></Field>
        <Field label="Invalidação"><textarea rows={4} value={draft.invalidation} onChange={(e) => setDraft({ ...draft, invalidation: e.target.value })} placeholder="Quando o setup deixa de existir?" /></Field>
        <Field label="Modelo de stop / risco"><textarea rows={3} value={draft.stopModel} onChange={(e) => setDraft({ ...draft, stopModel: e.target.value })} placeholder="Onde e por que o stop deve ficar?" /></Field>
        <Field label="Modelo de alvo / gestão"><textarea rows={3} value={draft.targetModel} onChange={(e) => setDraft({ ...draft, targetModel: e.target.value })} placeholder="Parciais, trailing, alvos técnicos…" /></Field>
        <Field label="O que evitar"><textarea rows={3} value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} placeholder="Erros típicos: antecipar, perseguir preço, operar fora do horário…" /></Field>
        <Field label="Cuidados comportamentais"><textarea rows={3} value={draft.behaviorNotes} onChange={(e) => setDraft({ ...draft, behaviorNotes: e.target.value })} placeholder="Como devo agir para executar este setup corretamente?" /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Setup ativo</label>
      <AttachmentField value={draft.attachments} onChange={(attachments) => setDraft((current) => ({ ...current, attachments }))} title="Exemplos visuais do setup" />
      <div className="actions"><button className="primary" onClick={save}>{editingId ? "Salvar alterações" : "Adicionar setup"}</button>{editingId && <button onClick={reset}>Cancelar</button>}</div>
    </div>

    <div className="cards setup-cards">{state.setups.map((setup) => <article className={`rule-card ${!setup.active ? "muted" : ""}`} key={setup.id}>
      <div className="card-top"><div className="badges"><span className="badge">Setup</span>{setup.isDemo && <span className="badge demo">Exemplo</span>}</div><span className={`status-dot ${setup.active ? "on" : ""}`}>{setup.active ? "ativo" : "inativo"}</span></div>
      <h3>{setup.title}</h3><p>{setup.description || setup.marketContext}</p>
      <div className="why"><b>Entrada:</b> {setup.entryCriteria}</div>
      {setup.invalidation && <div className="why"><b>Invalida quando:</b> {setup.invalidation}</div>}
      {!!setup.attachments.length && <div className="mini-images">{setup.attachments.slice(0, 3).map((img) => <img key={img.id} src={img.dataUrl} alt={img.name} />)}</div>}
      <div className="card-actions"><button onClick={() => edit(setup)}>Editar</button><button className="danger" onClick={() => {
        if (!confirm(translateUi("Remover este setup?", activeLanguage))) return;
        setState((current) => ({
          ...current,
          setups: current.setups.filter((item) => item.id !== setup.id),
          plans: current.plans.map((plan) => plan.setupId === setup.id ? { ...plan, setupId: undefined } : plan),
          planTemplates: current.planTemplates.map((template) => template.setupId === setup.id ? { ...template, setupId: undefined } : template),
          studies: current.studies.map((study) => study.setupId === setup.id ? { ...study, setupId: undefined } : study),
          trainingRecords: current.trainingRecords.map((record) => record.setupId === setup.id ? { ...record, setupId: undefined } : record),
          setupExamples: current.setupExamples.filter((example) => example.setupId !== setup.id),
        }));
      }}>Remover</button></div>
    </article>)}</div>
    {!state.setups.length && <div className="empty">Nenhum setup cadastrado. Registre primeiro os padrões que você realmente deseja repetir e reconhecer.</div>}
  </section>;
}


function SystemPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [section, setSection] = useState<"rules" | "setups">("rules");
  return <section className="page system-page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">REGRAS E PADRÕES OPERACIONAIS</span>
        <h1>Sistema de trade</h1>
        <p>Cadastre as regras permanentes e os padrões de entrada que compõem seu método. Use as regras gerais para definir limites e os setups para descrever situações específicas de operação.</p>
      </div>
    </div>
    <div className="system-switcher" role="tablist" aria-label="Componentes do sistema de trade">
      <button type="button" role="tab" aria-selected={section === "rules"} className={section === "rules" ? "active" : ""} onClick={() => setSection("rules")}>
        <span><b>Regras gerais</b><small>Risco, horários, limites e comportamento</small></span><strong>{state.rules.length}</strong>
      </button>
      <button type="button" role="tab" aria-selected={section === "setups"} className={section === "setups" ? "active" : ""} onClick={() => setSection("setups")}>
        <span><b>Setups operacionais</b><small>Contexto, entrada, confirmação e invalidação</small></span><strong>{state.setups.length}</strong>
      </button>
    </div>
    <div hidden={section !== "rules"}><RulesPage state={state} setState={setState} embedded /></div>
    <div hidden={section !== "setups"}><SetupsPage state={state} setState={setState} embedded /></div>
  </section>;
}

function ScenarioEditor({ scenario, onChange }: { scenario: Scenario; onChange: (next: Scenario) => void }) {
  const patch = (key: keyof Scenario, value: string) => onChange({ ...scenario, [key]: value });
  return <div className="scenario">
    <div className="scenario-label">Cenário {scenario.label}</div>
    <Field label="Nome do cenário"><input value={scenario.title} onChange={(e) => patch("title", e.target.value)} placeholder="Ex.: Rompimento com aceitação acima da máxima" /></Field>
    <div className="form-grid two">
      <Field label="Se isto acontecer…"><textarea rows={3} value={scenario.trigger} onChange={(e) => patch("trigger", e.target.value)} placeholder="Condição objetiva que ativa a hipótese." /></Field>
      <Field label="Quero ver como confirmação…"><textarea rows={3} value={scenario.confirmation} onChange={(e) => patch("confirmation", e.target.value)} placeholder="O que precisa confirmar antes da entrada?" /></Field>
      <Field label="Então farei…"><textarea rows={3} value={scenario.action} onChange={(e) => patch("action", e.target.value)} placeholder="Plano de ação: entrada, espera, direção, técnica." /></Field>
      <Field label="O cenário deixa de valer quando…"><textarea rows={3} value={scenario.invalidation} onChange={(e) => patch("invalidation", e.target.value)} placeholder="Critério que invalida a tese." /></Field>
      <Field label="Stop / risco"><input value={scenario.stop} onChange={(e) => patch("stop", e.target.value)} placeholder="Ex.: abaixo de 128.450; 1R" /></Field>
      <Field label="Alvos / gestão"><input value={scenario.targets} onChange={(e) => patch("targets", e.target.value)} placeholder="Ex.: parcial em 1R e alvo em 2R" /></Field>
    </div>
    <Field label="O que NÃO fazer neste cenário"><textarea rows={2} value={scenario.avoid} onChange={(e) => patch("avoid", e.target.value)} placeholder="Ex.: não antecipar rompimento; não perseguir preço." /></Field>
  </div>;
}

function VersionHistory({ plan }: { plan: TradePlan }) {
  if (!plan.versions.length) return <div className="version-history empty-version">Nenhuma versão foi congelada ainda. Enquanto estiver em rascunho, o planejamento pode ser alterado sem deixar registro histórico.</div>;
  return <div className="version-history">
    {plan.versions.map((version) => <div key={version.id} className="version-chip"><b>v{version.version}</b><span>{fmtDateTime(version.frozenAt)}</span></div>)}
  </div>;
}

function QualityGate({ plan }: { plan: TradePlan }) {
  const readiness = planReadiness(plan);
  const tone = readiness.score === 100 ? "ok" : readiness.score >= 70 ? "warning" : "danger";

  return <div className={`quality-gate ${tone}`}>
    <div className="quality-score"><strong>{readiness.score}%</strong><span>preparação preenchida</span></div>
    <div className="quality-body">
      <b>{readiness.score === 100 ? "Preparação completa pelos critérios atuais." : "Pontos pendentes antes do congelamento"}</b>
      <p>Este score mede somente a completude do processo de preparação. Ele não prevê o mercado e não é um sinal de entrada.</p>
      {!!readiness.issues.length && <ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </div>
  </div>;
}

function ComparisonPanel({ plan }: { plan: TradePlan }) {
  const frozen = latestFrozenVersion(plan);
  const reference = frozen ?? currentReference(plan);
  const scenarioSummary = reference.scenarios.filter((s) => s.title || s.trigger).map((s) => `${s.label}: ${s.title || s.trigger}`).join(" • ") || "Cenários não definidos";

  return <div className="comparison-wrap">
    <div className="comparison-heading">
      <div><span className="eyebrow">COMPARADOR</span><h3>Planejado × Mercado real × Minha execução</h3></div>
      <span className={`badge ${frozen ? "locked" : "warning"}`}>{frozen ? `Referência congelada v${frozen.version}` : "Sem versão congelada"}</span>
    </div>
    {!frozen && <div className="review-callout warning-callout">Este plano não possui uma fotografia congelada. O comparador usa o rascunho atual apenas como referência e sinaliza que ele não é uma evidência imutável do planejamento pré-pregão.</div>}
    <div className="comparison-grid">
      <article>
        <span className="comparison-number">1</span><h4>Planejado</h4>
        <dl>
          <div><dt>Viés</dt><dd>{reference.bias}</dd></div>
          <div><dt>Convicção declarada</dt><dd>{reference.thesisConviction || "Não registrada"}</dd></div>
          <div><dt>Mudaria de opinião se</dt><dd>{reference.changeMindCondition || "Não registrado"}</dd></div>
          <div><dt>Preparação</dt><dd>{reference.readinessScore === undefined ? "Não registrada nesta versão" : `${reference.readinessScore}%`}</dd></div>
          <div><dt>Cenários</dt><dd>{scenarioSummary}</dd></div>
          <div><dt>Contra a tese</dt><dd>{reference.evidenceAgainstThesis || "Não registrado"}</dd></div>
          <div><dt>Não operar se</dt><dd>{reference.noTradeConditions || "Não registrado"}</dd></div>
          <div><dt>Comportamento</dt><dd>{reference.behaviorPlan || "Não registrado"}</dd></div>
        </dl>
      </article>
      <article>
        <span className="comparison-number">2</span><h4>Mercado real</h4>
        <dl>
          <div><dt>Cenário observado</dt><dd>{plan.review.observedScenario || "Ainda não revisado"}</dd></div>
          <div><dt>O que aconteceu</dt><dd>{plan.review.happened || "Descreva abaixo depois do pregão."}</dd></div>
        </dl>
      </article>
      <article>
        <span className="comparison-number">3</span><h4>Minha execução</h4>
        <dl>
          <div><dt>Segui o plano?</dt><dd>{plan.review.followedPlan || "Ainda não avaliado"}</dd></div>
          <div><dt>O que fiz</dt><dd>{plan.review.executionSummary || "Descreva abaixo sua execução."}</dd></div>
          <div><dt>Desvios</dt><dd>{plan.review.deviations || "Nenhum desvio registrado"}</dd></div>
          <div><dt>Resultado</dt><dd>{plan.review.result || "Não registrado"}</dd></div>
        </dl>
      </article>
    </div>
  </div>;
}

function PlanEditor({ initial, assets, setups, rules, onPersist, onCreateTemplate, onClose }: { initial: TradePlan; assets: string[]; setups: TradeSetup[]; rules: TradeRule[]; onPersist: (p: TradePlan) => void; onCreateTemplate: (template: PlanTemplate) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<TradePlan>(() => structuredClone(initial));
  const [section, setSection] = useState<"plan" | "review">("plan");
  const [notice, setNotice] = useState("");
  const isFrozen = draft.planStatus === "frozen";
  const readiness = planReadiness(draft);

  function patchScenario(id: string, next: Scenario) {
    setDraft((d) => ({ ...d, scenarios: d.scenarios.map((s) => s.id === id ? next : s) }));
  }

  function persist(next = draft, message = "Plano salvo.") {
    if (!next.asset.trim() || !next.tradingDate) {
      setNotice("Informe o ativo e a data do pregão antes de salvar.");
      return false;
    }
    const saved = { ...next, updatedAt: new Date().toISOString() };
    setDraft(saved);
    onPersist(saved);
    setNotice(message);
    return true;
  }

  function freeze() {
    if (!draft.asset.trim() || !draft.tradingDate) {
      setNotice("Informe o ativo e a data do pregão antes de congelar.");
      return;
    }
    if (readiness.criticalIssues.length && !confirm(translateUi("Há pontos críticos pendentes na preparação. Deseja congelar mesmo assim?", activeLanguage))) return;
    const version = draft.versions.length + 1;
    const snapshot = snapshotFromPlan(draft, version);
    const next: TradePlan = {
      ...draft,
      planStatus: "frozen",
      versions: [...draft.versions, snapshot],
      updatedAt: new Date().toISOString(),
    };
    setDraft(next);
    onPersist(next);
    setNotice(`Versão ${version} congelada. O planejamento agora está protegido contra alterações acidentais.`);
  }

  function closeWithoutSaving() {
    const changed = JSON.stringify(draft) !== JSON.stringify(initial);
    if (changed && !confirm(translateUi("Há alterações não salvas. Fechar mesmo assim?", activeLanguage))) return;
    onClose();
  }

  function createNewVersion() {
    const next = { ...draft, planStatus: "draft" as const, updatedAt: new Date().toISOString() };
    setDraft(next);
    onPersist(next);
    setSection("plan");
    setNotice(`Nova versão em rascunho. A v${draft.versions.length} permanece preservada.`);
  }

  function applySetup() {
    const setup = setups.find((item) => item.id === draft.setupId);
    if (!setup) return;
    const scenarioA = draft.scenarios.find((s) => s.label === "A");
    const scenarioHasContent = !!scenarioA && [scenarioA.title, scenarioA.trigger, scenarioA.confirmation, scenarioA.action, scenarioA.invalidation, scenarioA.stop, scenarioA.targets, scenarioA.avoid].some((value) => value.trim());
    if (scenarioHasContent && !confirm(translateUi("O cenário A já possui conteúdo. Aplicar o setup substituirá vários campos. Deseja continuar?", activeLanguage))) return;
    setDraft({
      ...draft,
      marketContext: setup.marketContext || draft.marketContext,
      behaviorPlan: setup.behaviorNotes || draft.behaviorPlan,
      scenarios: draft.scenarios.map((scenario) => scenario.label === "A" ? {
        ...scenario,
        title: setup.title,
        trigger: setup.entryCriteria,
        confirmation: setup.confirmation,
        invalidation: setup.invalidation,
        stop: setup.stopModel,
        targets: setup.targetModel,
        avoid: setup.avoid,
      } : scenario),
    });
    if (!scenarioA) setNotice("O setup foi selecionado, mas o plano não possui cenário A para receber o template.");
    else setNotice("Setup aplicado ao cenário A. Adapte os campos ao contexto específico deste pregão.");
  }

  return <div className="panel plan-editor">
    <div className="editor-head">
      <div><span className="eyebrow">{draft.versions.length ? `PLANO COM ${draft.versions.length} VERSÃO(ÕES) PRESERVADA(S)` : "PLANO EM CONSTRUÇÃO"}</span><h2>{draft.asset || "Ativo"} • {fmtDate(draft.tradingDate)}</h2></div>
      <div className="segmented"><button className={section === "plan" ? "active" : ""} onClick={() => setSection("plan")}>Planejamento</button><button className={section === "review" ? "active" : ""} onClick={() => setSection("review")}>Comparar e revisar</button></div>
    </div>

    <div className={`freeze-banner ${isFrozen ? "locked" : "draft"}`}>
      <div><b>{isFrozen ? "Planejamento congelado" : "Rascunho editável"}</b><span>{isFrozen ? `A v${draft.versions.length} foi preservada em ${fmtDateTime(latestFrozenVersion(draft)?.frozenAt)}.` : "Edite livremente. Quando terminar a preparação, congele uma versão antes do pregão."}</span></div>
      {isFrozen ? <button onClick={createNewVersion}>Criar nova versão</button> : <button className="primary" onClick={freeze}>Congelar versão {draft.versions.length + 1}</button>}
    </div>
    <VersionHistory plan={draft} />
    {!isFrozen && section === "plan" && <QualityGate plan={draft} />}
    {notice && <div className="notice">{notice}</div>}

    {section === "plan" ? <fieldset className="freeze-fieldset" disabled={isFrozen}>
      <div className="form-grid three">
        <Field label="Ativo"><input list="assets" value={draft.asset} onChange={(e) => setDraft({ ...draft, asset: e.target.value.toUpperCase() })} /><datalist id="assets">{assets.map((a) => <option key={a} value={a} />)}</datalist></Field>
        <Field label="Data do pregão"><input type="date" value={draft.tradingDate} onChange={(e) => setDraft({ ...draft, tradingDate: e.target.value })} /></Field>
        <Field label="Viés inicial"><select value={draft.bias} onChange={(e) => setDraft({ ...draft, bias: e.target.value as TradePlan["bias"] })}><option>Alta</option><option>Baixa</option><option>Neutro</option></select></Field>
        <Field label="Convicção na tese" hint="Registro subjetivo para revisão posterior; não é um sinal operacional."><select value={draft.thesisConviction} onChange={(e) => setDraft({ ...draft, thesisConviction: e.target.value as TradePlan["thesisConviction"] })}><option value="">Não avaliada</option><option>Baixa</option><option>Média</option><option>Alta</option></select></Field>
      </div>

      <div className="setup-apply">
        <Field label="Setup de referência (opcional)" hint="O setup é um template. Depois de aplicá-lo, adapte o plano ao contexto do pregão.">
          <select value={draft.setupId ?? ""} onChange={(e) => setDraft({ ...draft, setupId: e.target.value || undefined })}>
            <option value="">Nenhum setup</option>
            {setups.filter((s) => s.active).map((setup) => <option key={setup.id} value={setup.id}>{setup.title}</option>)}
          </select>
        </Field>
        <button type="button" onClick={applySetup} disabled={!draft.setupId}>Aplicar setup ao cenário A</button>
      </div>

      <div className="form-grid two">
        <Field label="Contexto de mercado"><textarea rows={6} value={draft.marketContext} onChange={(e) => setDraft({ ...draft, marketContext: e.target.value })} placeholder="Tendência, localização do preço, volatilidade, fluxo, correlações, fechamento anterior…" /></Field>
        <Field label="Níveis importantes"><textarea rows={6} value={draft.keyLevels} onChange={(e) => setDraft({ ...draft, keyLevels: e.target.value })} placeholder="Máxima/mínima anterior, VWAP, gaps, suportes, resistências, regiões de liquidez…" /></Field>
        <Field label="Eventos e horários de atenção"><textarea rows={4} value={draft.macroEvents} onChange={(e) => setDraft({ ...draft, macroEvents: e.target.value })} placeholder="Ex.: Copom, payroll, abertura NY, leilões, vencimentos…" /></Field>
        <Field label="Condições para NÃO operar"><textarea rows={4} value={draft.noTradeConditions} onChange={(e) => setDraft({ ...draft, noTradeConditions: e.target.value })} placeholder="Ex.: spread anormal, contexto confuso, perda de limite diário…" /></Field>
      </div>

      <div className="counter-thesis">
        <Field label="Evidências contra minha tese / por que posso estar errado?" hint="Procure deliberadamente dados que contradigam seu viés. O objetivo é reduzir viés de confirmação.">
          <textarea rows={5} value={draft.evidenceAgainstThesis} onChange={(e) => setDraft({ ...draft, evidenceAgainstThesis: e.target.value })} placeholder="Ex.: fluxo vendedor apesar do viés de alta; dólar rompendo resistência; preço rejeitando a região que sustentava minha hipótese…" />
        </Field>
        <Field label="O que teria de acontecer para eu mudar de opinião?" hint="Defina antes do pregão quais evidências fariam você abandonar ou revisar a tese.">
          <textarea rows={4} value={draft.changeMindCondition} onChange={(e) => setDraft({ ...draft, changeMindCondition: e.target.value })} placeholder="Ex.: aceitação abaixo da VWAP com aumento de agressão vendedora e perda do suporte que sustentava a tese." />
        </Field>
      </div>

      <div className="form-grid two">
        <Field label="Risco máximo do dia"><input value={draft.maxRisk} onChange={(e) => setDraft({ ...draft, maxRisk: e.target.value })} placeholder="Ex.: 2R ou R$ 600" /></Field>
        <Field label="Máximo de operações"><input type="number" min={1} value={draft.maxTrades} onChange={(e) => setDraft({ ...draft, maxTrades: Math.max(1, Number(e.target.value) || 1) })} /></Field>
      </div>

      <div className="checklist-box"><h3>Checklist pré-mercado</h3>{draft.checklist.map((item, i) => <div className="editable-check" key={item.id}><input className="check-toggle" type="checkbox" checked={item.checked} onChange={(e) => setDraft({ ...draft, checklist: draft.checklist.map((x) => x.id === item.id ? { ...x, checked: e.target.checked } : x) })} /><span>{i + 1}</span><input value={item.text} onChange={(e) => setDraft({ ...draft, checklist: draft.checklist.map((x) => x.id === item.id ? { ...x, text: e.target.value } : x) })} /><button className="tiny danger" type="button" onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter((x) => x.id !== item.id) })}>×</button></div>)}<button className="small" type="button" onClick={() => setDraft({ ...draft, checklist: [...draft.checklist, { id: crypto.randomUUID(), text: "", checked: false }] })}>+ Item</button></div>

      <div className="scenario-grid">{draft.scenarios.map((scenario) => <ScenarioEditor key={scenario.id} scenario={scenario} onChange={(next) => patchScenario(scenario.id, next)} />)}</div>

      <Field label="Plano comportamental: se eu sentir/começar a fazer X, então farei Y"><textarea rows={5} value={draft.behaviorPlan} onChange={(e) => setDraft({ ...draft, behaviorPlan: e.target.value })} placeholder="Ex.: Se eu perceber vontade de recuperar prejuízo imediatamente, não enviarei nova ordem; vou me afastar da tela por 5 minutos e reler o limite diário." /></Field>
      <AttachmentField disabled={isFrozen} value={draft.attachments} onChange={(attachments) => setDraft((current) => ({ ...current, attachments }))} title="Gráficos e imagens do planejamento" />
    </fieldset> : <>
      <ComparisonPanel plan={draft} />
      <div className="review-callout">Preencha esta parte <b>depois do pregão</b>. O planejamento congelado acima permanece intacto para permitir uma comparação honesta.</div>
      <div className="form-grid two">
        <Field label="O que o mercado efetivamente fez?"><textarea rows={7} value={draft.review.happened} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, happened: e.target.value } })} placeholder="Descreva a sequência do mercado, mudanças de contexto e os pontos que mais importaram." /></Field>
        <Field label="O que EU efetivamente fiz?"><textarea rows={7} value={draft.review.executionSummary} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, executionSummary: e.target.value } })} placeholder="Entradas, saídas, esperas, cancelamentos e decisões que você realmente tomou." /></Field>
        <Field label="Qual cenário predominou?"><select value={draft.review.observedScenario} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, observedScenario: e.target.value as PlanReview["observedScenario"] } })}><option value="">Selecione</option><option>A</option><option>B</option><option>C</option><option>Nenhum</option><option>Mistura</option></select></Field>
        <Field label="Você seguiu o plano?"><select value={draft.review.followedPlan} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, followedPlan: e.target.value as PlanReview["followedPlan"] } })}><option value="">Selecione</option><option>Sim</option><option>Parcialmente</option><option>Não</option><option>Não operei</option></select></Field>
        <Field label="Origem da execução" hint="Classifique se o que você executou estava previsto no plano."><select value={draft.review.executionOrigin} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, executionOrigin: e.target.value as PlanReview["executionOrigin"] } })}><option value="">Selecione</option><option>Planejada</option><option>Parcialmente planejada</option><option>Improvisada</option></select></Field>
        <Field label="Qualidade da leitura" hint="Avalie a leitura do mercado, independentemente do resultado financeiro."><select value={draft.review.readingQuality} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, readingQuality: Number(e.target.value) } })}><option value={0}>Não avaliada</option><option value={1}>1 — Muito fraca</option><option value={2}>2 — Fraca</option><option value={3}>3 — Adequada</option><option value={4}>4 — Boa</option><option value={5}>5 — Excelente</option></select></Field>
        <Field label="Qualidade da execução" hint="Avalie disciplina e execução, separadamente da qualidade da leitura."><select value={draft.review.executionQuality} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, executionQuality: Number(e.target.value) } })}><option value={0}>Não avaliada</option><option value={1}>1 — Muito fraca</option><option value={2}>2 — Fraca</option><option value={3}>3 — Adequada</option><option value={4}>4 — Boa</option><option value={5}>5 — Excelente</option></select></Field>
        <Field label="Desvios entre plano e execução"><textarea rows={5} value={draft.review.deviations} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, deviations: e.target.value } })} placeholder="O que você fez diferente do planejado? Por quê?" /></Field>
        <Field label="Resultado / observação de resultado"><input value={draft.review.result} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, result: e.target.value } })} placeholder="Ex.: +1,4R; -R$ 250; não operei" /></Field>
        <Field label="Principal aprendizado"><textarea rows={5} value={draft.review.lessons} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, lessons: e.target.value } })} placeholder="O que merece virar regra, ajuste de setup, checklist ou hipótese futura?" /></Field>
      </div>
      <div className="rule-violations panel-subsection">
        <h3>Regras violadas</h3>
        <p className="muted-text">Marque apenas regras que foram efetivamente descumpridas. Isso alimenta o histórico de recorrência.</p>
        {rules.length ? <div className="violation-grid">{rules.map((rule) => <label className="check" key={rule.id}><input type="checkbox" checked={draft.review.violatedRuleIds.includes(rule.id)} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, violatedRuleIds: e.target.checked ? [...draft.review.violatedRuleIds, rule.id] : draft.review.violatedRuleIds.filter((id) => id !== rule.id) } })} /> <span><b>{rule.title}</b> <small>({rule.category})</small></span></label>)}</div> : <div className="empty">Cadastre regras no Sistema de trade para registrar violações de forma estruturada.</div>}
      </div>
      <AttachmentField value={draft.review.attachments} onChange={(attachments) => setDraft((current) => ({ ...current, review: { ...current.review, attachments } }))} title="Gráficos e imagens do que aconteceu" />
      <label className="check"><input type="checkbox" checked={!!draft.review.reviewedAt} onChange={(e) => setDraft({ ...draft, review: { ...draft.review, reviewedAt: e.target.checked ? new Date().toISOString() : undefined } })} /> Marcar revisão como concluída</label>
    </>}

    <div className="actions sticky-actions">
      <button className="primary" onClick={() => persist(draft, section === "review" ? "Revisão salva." : "Rascunho salvo.")}>Salvar</button>
      {section === "plan" && !isFrozen && <button onClick={() => { const title = prompt(translateUi("Nome do template", activeLanguage), `${draft.asset || "Plano"} — ${draft.scenarios.find((scenario) => scenario.label === "A")?.title || "Template"}`); if (title?.trim()) { onCreateTemplate(templateFromPlan(draft, title.trim())); setNotice("Template de plano salvo."); } }}>Salvar como template</button>}
      <button onClick={() => { if (persist(draft, "Plano salvo.")) onClose(); }}>Salvar e fechar</button>
      <button onClick={closeWithoutSaving}>Fechar sem salvar mudanças atuais</button>
    </div>
  </div>;
}


function StudyEditor({ initial, assets, setups, onSave, onClose }: {
  initial: TradeStudy;
  assets: string[];
  setups: TradeSetup[];
  onSave: (study: TradeStudy) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TradeStudy>(() => structuredClone(initial));
  const [message, setMessage] = useState("");
  function patchScenario(id: string, next: Scenario) {
    setDraft((d) => ({ ...d, scenarios: d.scenarios.map((s) => s.id === id ? next : s) }));
  }

  function applySetup() {
    if (!draft.setupId) return;
    const setup = setups.find((s) => s.id === draft.setupId);
    if (!setup) return;
    const a = draft.scenarios.find((scenario) => scenario.label === "A");
    if (!a) return;
    const nextA: Scenario = {
      ...a,
      title: a.title || setup.title,
      trigger: setup.entryCriteria,
      confirmation: setup.confirmation,
      action: a.action || setup.description,
      invalidation: setup.invalidation,
      stop: setup.stopModel,
      targets: setup.targetModel,
      avoid: setup.avoid,
    };
    setDraft((d) => ({
      ...d,
      marketContext: d.marketContext || setup.marketContext,
      behaviorPlan: d.behaviorPlan || setup.behaviorNotes,
      scenarios: d.scenarios.map((scenario) => scenario.id === nextA.id ? nextA : scenario),
    }));
    setMessage("Setup aplicado ao estudo. Adapte os campos ao objetivo analítico.");
  }

  function closeWithoutSaving() {
    const changed = JSON.stringify(draft) !== JSON.stringify(initial);
    if (changed && !confirm(translateUi("Há alterações não salvas. Fechar mesmo assim?", activeLanguage))) return;
    onClose();
  }

  function save(close = false) {
    if (!draft.title.trim()) {
      setMessage("Informe um título para o estudo antes de salvar.");
      return;
    }
    const completedAt = draft.status === "completed" ? (draft.completedAt || new Date().toISOString()) : undefined;
    const next = { ...draft, completedAt, updatedAt: new Date().toISOString() };
    onSave(next);
    setDraft(next);
    setMessage("Estudo salvo.");
    if (close) onClose();
  }

  return <div className="panel plan-editor">
    <div className="editor-head">
      <div><span className="eyebrow">ESTUDO ANALÍTICO</span><h2>{draft.title || "Novo estudo"}</h2><p>Exercite leitura, formulação de hipóteses e tomada de decisão sem vincular o registro a uma operação futura.</p></div>
      <span className={`badge ${draft.status === "completed" ? "ok" : "warning"}`}>{draft.status === "completed" ? "Concluído" : "Em andamento"}</span>
    </div>

    {message && <div className="notice">{message}</div>}

    <div className="form-grid three">
      <Field label="Título do estudo"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ex.: Reações do WIN à VWAP após gap de alta" /></Field>
      <Field label="Data do estudo"><input type="date" value={draft.studyDate} onChange={(e) => setDraft({ ...draft, studyDate: e.target.value })} /></Field>
      <Field label="Data de mercado analisada (opcional)"><input type="date" value={draft.referenceDate} onChange={(e) => setDraft({ ...draft, referenceDate: e.target.value })} /></Field>
      <Field label="Ativo (opcional)"><input list="study-assets" value={draft.asset} onChange={(e) => setDraft({ ...draft, asset: e.target.value.toUpperCase() })} placeholder="Ex.: WINFUT" /><datalist id="study-assets">{assets.map((a) => <option key={a} value={a} />)}</datalist></Field>
      <Field label="Timeframe / recorte"><input value={draft.timeframe} onChange={(e) => setDraft({ ...draft, timeframe: e.target.value })} placeholder="Ex.: 2 min; abertura; 10 pregões" /></Field>
      <Field label="Viés / hipótese inicial"><select value={draft.bias} onChange={(e) => setDraft({ ...draft, bias: e.target.value as TradeStudy["bias"] })}><option>Alta</option><option>Baixa</option><option>Neutro</option></select></Field>
    </div>

    <div className="setup-apply">
      <Field label="Setup de referência (opcional)"><select value={draft.setupId ?? ""} onChange={(e) => setDraft({ ...draft, setupId: e.target.value || undefined })}><option value="">Nenhum setup</option>{setups.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
      <button onClick={applySetup} disabled={!draft.setupId}>Aplicar setup ao estudo</button>
    </div>

    <Field label="Pergunta / objetivo do estudo" hint="Defina o que você quer aprender, comparar ou testar antes de analisar os dados."><textarea rows={4} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} placeholder="Ex.: Quero entender como o preço costuma reagir quando perde a VWAP depois de uma abertura compradora." /></Field>

    <div className="form-grid two">
      <Field label="Contexto de mercado"><textarea rows={6} value={draft.marketContext} onChange={(e) => setDraft({ ...draft, marketContext: e.target.value })} placeholder="Tendência, localização, volatilidade, fluxo, correlações, abertura…" /></Field>
      <Field label="Níveis importantes"><textarea rows={6} value={draft.keyLevels} onChange={(e) => setDraft({ ...draft, keyLevels: e.target.value })} placeholder="VWAP, máxima/mínima, gaps, regiões de liquidez, suportes e resistências…" /></Field>
      <Field label="Eventos / fatores relevantes"><textarea rows={4} value={draft.macroEvents} onChange={(e) => setDraft({ ...draft, macroEvents: e.target.value })} placeholder="Eventos macro, horário, vencimentos, leilões ou qualquer fator que altere a leitura." /></Field>
      <Field label="Evidências contra minha hipótese / leitura"><textarea rows={4} value={draft.evidenceAgainstThesis} onChange={(e) => setDraft({ ...draft, evidenceAgainstThesis: e.target.value })} placeholder="Quais dados contradizem sua interpretação inicial?" /></Field>
    </div>

    <div className="scenario-grid">{draft.scenarios.map((scenario) => <ScenarioEditor key={scenario.id} scenario={scenario} onChange={(next) => patchScenario(scenario.id, next)} />)}</div>

    <Field label="Como eu agiria / plano de decisão" hint="Mesmo sem intenção de operar, descreva qual seria a decisão correta caso você estivesse diante desse contexto em tempo real."><textarea rows={5} value={draft.behaviorPlan} onChange={(e) => setDraft({ ...draft, behaviorPlan: e.target.value })} placeholder="Ex.: Eu esperaria confirmação; não anteciparia o rompimento; reduziria risco em volatilidade anormal…" /></Field>

    <div className="form-grid two">
      <Field label="Conclusão analítica"><textarea rows={6} value={draft.conclusion} onChange={(e) => setDraft({ ...draft, conclusion: e.target.value })} placeholder="O que a análise mostrou? A hipótese inicial se sustentou? Em quais condições?" /></Field>
      <Field label="Aprendizados e próximos estudos"><textarea rows={6} value={draft.lessons} onChange={(e) => setDraft({ ...draft, lessons: e.target.value })} placeholder="O que deve ser praticado, investigado novamente ou transformado em regra/setup?" /></Field>
    </div>

    <AttachmentField value={draft.attachments} onChange={(attachments) => setDraft((current) => ({ ...current, attachments }))} title="Gráficos e imagens do estudo" />

    <label className="check"><input type="checkbox" checked={draft.status === "completed"} onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "completed" : "draft", completedAt: e.target.checked ? (draft.completedAt || new Date().toISOString()) : undefined })} /> Marcar estudo como concluído</label>

    <div className="actions sticky-actions"><button className="primary" onClick={() => save(false)}>Salvar</button><button onClick={() => save(true)}>Salvar e fechar</button><button onClick={closeWithoutSaving}>Fechar sem salvar mudanças atuais</button></div>
  </div>;
}

function buildStudyText(study: TradeStudy) {
  const labels = activeLanguage === "en" ? {
    title: "ANALYTICAL STUDY", date: "Study date", reference: "Market date", asset: "Asset", timeframe: "Timeframe", bias: "Initial bias",
    objective: "QUESTION / OBJECTIVE", context: "MARKET CONTEXT", levels: "KEY LEVELS", events: "EVENTS / FACTORS",
    counter: "EVIDENCE AGAINST THE HYPOTHESIS", scenario: "SCENARIO", if: "If", confirmation: "Confirmation", action: "Decision",
    invalidation: "Invalidation", stop: "Stop / risk", targets: "Targets / management", avoid: "Avoid", behavior: "HOW I WOULD ACT",
    conclusion: "ANALYTICAL CONCLUSION", lessons: "LESSONS / NEXT STUDIES",
  } : activeLanguage === "es" ? {
    title: "ESTUDIO ANALÍTICO", date: "Fecha del estudio", reference: "Fecha de mercado", asset: "Activo", timeframe: "Timeframe", bias: "Sesgo inicial",
    objective: "PREGUNTA / OBJETIVO", context: "CONTEXTO DE MERCADO", levels: "NIVELES IMPORTANTES", events: "EVENTOS / FACTORES",
    counter: "EVIDENCIAS CONTRA LA HIPÓTESIS", scenario: "ESCENARIO", if: "Si", confirmation: "Confirmación", action: "Decisión",
    invalidation: "Invalidación", stop: "Stop / riesgo", targets: "Objetivos / gestión", avoid: "Evitar", behavior: "CÓMO ACTUARÍA",
    conclusion: "CONCLUSIÓN ANALÍTICA", lessons: "APRENDIZAJES / PRÓXIMOS ESTUDIOS",
  } : {
    title: "ESTUDO ANALÍTICO", date: "Data do estudo", reference: "Data de mercado", asset: "Ativo", timeframe: "Timeframe", bias: "Viés inicial",
    objective: "PERGUNTA / OBJETIVO", context: "CONTEXTO DE MERCADO", levels: "NÍVEIS IMPORTANTES", events: "EVENTOS / FATORES",
    counter: "EVIDÊNCIAS CONTRA A HIPÓTESE", scenario: "CENÁRIO", if: "Se", confirmation: "Confirmação", action: "Decisão",
    invalidation: "Invalidação", stop: "Stop / risco", targets: "Alvos / gestão", avoid: "Evitar", behavior: "COMO EU AGIRIA",
    conclusion: "CONCLUSÃO ANALÍTICA", lessons: "APRENDIZADOS / PRÓXIMOS ESTUDOS",
  };
  const scenarios = study.scenarios.map((scenario) => `${labels.scenario} ${scenario.label} — ${scenario.title}\n${labels.if}: ${scenario.trigger}\n${labels.confirmation}: ${scenario.confirmation}\n${labels.action}: ${scenario.action}\n${labels.invalidation}: ${scenario.invalidation}\n${labels.stop}: ${scenario.stop}\n${labels.targets}: ${scenario.targets}\n${labels.avoid}: ${scenario.avoid}`).join("\n\n");
  return `${labels.title} — ${study.title}\n${labels.date}: ${fmtDate(study.studyDate)}\n${labels.reference}: ${study.referenceDate ? fmtDate(study.referenceDate) : "—"}\n${labels.asset}: ${study.asset || "—"}\n${labels.timeframe}: ${study.timeframe || "—"}\n${labels.bias}: ${translateUi(study.bias, activeLanguage)}\n\n${labels.objective}\n${study.objective}\n\n${labels.context}\n${study.marketContext}\n\n${labels.levels}\n${study.keyLevels}\n\n${labels.events}\n${study.macroEvents}\n\n${labels.counter}\n${study.evidenceAgainstThesis}\n\n${scenarios}\n\n${labels.behavior}\n${study.behaviorPlan}\n\n${labels.conclusion}\n${study.conclusion}\n\n${labels.lessons}\n${study.lessons}\n`;
}

function StudiesPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [editing, setEditing] = useState<TradeStudy | null>(null);
  const [filter, setFilter] = useState("");
  const studies = useMemo(
    () => [...state.studies].filter((study) => {
      const query = filter.toLowerCase();
      return !query || study.title.toLowerCase().includes(query) || study.asset.toLowerCase().includes(query) || study.studyDate.includes(filter) || study.timeframe.toLowerCase().includes(query);
    }).sort((a, b) => b.studyDate.localeCompare(a.studyDate)),
    [state.studies, filter],
  );

  function persist(study: TradeStudy) {
    const savedStudy = { ...study, isDemo: false };
    setState((current) => ({
      ...current,
      studies: current.studies.some((x) => x.id === savedStudy.id) ? current.studies.map((x) => x.id === savedStudy.id ? savedStudy : x) : [savedStudy, ...current.studies],
    }));
    setEditing(savedStudy);
  }

  if (editing) return <section className="page"><StudyEditor initial={editing} assets={state.settings.assets} setups={state.setups} onSave={persist} onClose={() => setEditing(null)} /></section>;

  return <section className="page">
    <div className="page-heading"><div><span className="eyebrow">ANÁLISE DE MERCADO</span><h1>Estudos</h1><p>Analise contextos, níveis e cenários sem precisar vincular o estudo a uma operação futura.</p></div><button className="primary" onClick={() => setEditing(newStudy(state))}>+ Novo estudo</button></div>
    <div className="toolbar"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por título, ativo, timeframe ou data…" /><span>{studies.length} estudo(s)</span></div>
    <div className="plan-list">{studies.map((study) => <article className="plan-card" key={study.id}>
      <div className="plan-date"><strong>{fmtDate(study.studyDate)}</strong><span>{study.asset || "Estudo geral"}</span></div>
      <div className="plan-main">
        <div className="card-top"><div className="badges"><span className={`badge bias-${study.bias.toLowerCase()}`}>Viés {study.bias}</span>{study.timeframe && <span className="badge">{study.timeframe}</span>}{study.isDemo && <span className="badge demo">Exemplo</span>}</div><span className={`badge ${study.status === "completed" ? "ok" : "warning"}`}>{study.status === "completed" ? "Concluído" : "Em andamento"}</span></div>
        <h3>{study.title}</h3>
        <p>{study.objective || study.marketContext || "Objetivo ainda não descrito."}</p>
        {study.evidenceAgainstThesis && <div className="counter-mini"><b>Contra a hipótese:</b> {study.evidenceAgainstThesis}</div>}
        <div className="scenario-pills">{study.scenarios.map((scenario) => <span key={scenario.id}>{scenario.label}: {scenario.title || "não definido"}</span>)}</div>
      </div>
      <div className="vertical-actions"><button onClick={() => setEditing(structuredClone(study))}>Abrir / editar</button><button onClick={() => downloadText(`estudo-${study.asset || "geral"}-${study.studyDate}.txt`, buildStudyText(study))}>Exportar texto</button><button className="danger" onClick={() => { if (confirm(translateUi("Remover este estudo?", activeLanguage))) setState((current) => ({ ...current, studies: current.studies.filter((x) => x.id !== study.id) })); }}>Remover</button></div>
    </article>)}</div>
    {!studies.length && <div className="empty">Nenhum estudo encontrado. Crie um estudo para exercitar uma leitura de mercado, hipótese ou setup.</div>}
  </section>;
}

function PlansPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const [editing, setEditing] = useState<TradePlan | null>(null);
  const [filter, setFilter] = useState("");
  const plans = useMemo(
    () => [...state.plans].filter((p) => !filter || p.asset.toLowerCase().includes(filter.toLowerCase()) || p.tradingDate.includes(filter)).sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)),
    [state.plans, filter],
  );

  function persist(plan: TradePlan) {
    const savedPlan = { ...plan, isDemo: false };
    setState((s) => ({ ...s, plans: s.plans.some((x) => x.id === savedPlan.id) ? s.plans.map((x) => x.id === savedPlan.id ? savedPlan : x) : [savedPlan, ...s.plans] }));
    setEditing(savedPlan);
  }

  function saveTemplate(template: PlanTemplate) {
    setState((current) => ({ ...current, planTemplates: [template, ...current.planTemplates] }));
  }

  function createFromTemplate(template: PlanTemplate) {
    setEditing(planFromTemplate(state, template));
  }

  function duplicate(plan: TradePlan) {
    setEditing(duplicatePlan(plan));
  }

  if (editing) return <section className="page"><PlanEditor initial={editing} assets={state.settings.assets} setups={state.setups} rules={state.rules} onClose={() => setEditing(null)} onPersist={persist} onCreateTemplate={saveTemplate} /></section>;

  return <section className="page">
    <div className="page-heading"><div><span className="eyebrow">PREPARAÇÃO E REVISÃO</span><h1>Planos de trade</h1><p>Registre contexto, risco, cenários e ações antes do pregão. Depois, compare o plano com o mercado e sua execução.</p></div><button className="primary" onClick={() => setEditing(newPlan(state))}>+ Novo plano</button></div>
    {!!state.planTemplates.length && <div className="panel template-panel">
      <div className="panel-title"><div><span className="eyebrow">REUTILIZAR PREPARAÇÃO</span><h2>Modelos de plano</h2></div></div>
      <p className="muted-text">Use um template como ponto de partida. O novo plano continua sendo um rascunho independente e deve ser adaptado ao contexto do dia.</p>
      <div className="template-list">{state.planTemplates.map((template) => <div className="template-row" key={template.id}><div><b>{template.title}</b>{template.isDemo && <span className="badge demo">Exemplo</span>}<span>{template.asset || "Qualquer ativo"} • {template.setupId ? "com setup de referência" : "sem setup de referência"}</span></div><div className="actions"><button onClick={() => createFromTemplate(template)}>Criar plano</button><button className="danger" onClick={() => setState((current) => ({ ...current, planTemplates: current.planTemplates.filter((item) => item.id !== template.id) }))}>Remover</button></div></div>)}</div>
    </div>}
    <div className="toolbar"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por ativo ou data…" /><span>{plans.length} plano(s)</span></div>
    <div className="plan-list">{plans.map((p) => <article className="plan-card" key={p.id}>
      <div className="plan-date"><strong>{fmtDate(p.tradingDate)}</strong><span>{p.asset}</span></div>
      <div className="plan-main">
        <div className="card-top"><div className="badges"><span className={`badge bias-${p.bias.toLowerCase()}`}>Viés {p.bias}</span>{p.isDemo && <span className="badge demo">Exemplo</span>}<span className={`badge ${p.planStatus === "frozen" ? "locked" : "warning"}`}>{p.planStatus === "frozen" ? `Congelado v${p.versions.length}` : p.versions.length ? `Rascunho para v${p.versions.length + 1}` : "Rascunho sem versão"}</span><span className="badge">Preparação {planReadiness(p).score}%</span></div>{p.review.reviewedAt ? <span className="badge ok">Revisado</span> : <span className="badge">Aguardando revisão</span>}</div>
        <h3>{p.scenarios.find((s) => s.label === "A")?.title || "Plano sem título de cenário A"}</h3>
        <p>{p.marketContext || "Contexto ainda não descrito."}</p>
        {p.evidenceAgainstThesis && <div className="counter-mini"><b>Contra a tese:</b> {p.evidenceAgainstThesis}</div>}
        <div className="scenario-pills">{p.scenarios.map((s) => <span key={s.id}>{s.label}: {s.title || "não definido"}</span>)}</div>
      </div>
      <div className="vertical-actions"><button onClick={() => setEditing(structuredClone(p))}>Abrir / editar</button><button onClick={() => duplicate(p)}>Duplicar sem revisão</button><button onClick={() => downloadText(`plano-${p.asset}-${p.tradingDate}.txt`, buildPlanText(p, state.rules))}>Exportar texto</button><button className="danger" onClick={() => { if (confirm(translateUi("Remover este plano?", activeLanguage))) setState((s) => ({ ...s, plans: s.plans.filter((x) => x.id !== p.id) })); }}>Remover</button></div>
    </article>)}</div>
    {!plans.length && <div className="empty">Nenhum plano encontrado. Crie um plano para o próximo pregão.</div>}
  </section>;
}

function buildPlanText(p: TradePlan, rules: TradeRule[] = []) {
  const reference = latestFrozenVersion(p);
  const base = reference ?? currentReference(p);

  const labels = activeLanguage === "en" ? {
    frozen: "FROZEN VERSION",
    draft: "CURRENT DRAFT — NO FROZEN VERSION",
    title: "TRADE PLAN",
    bias: "Bias",
    conviction: "Declared conviction",
    changeMind: "I would change my mind if",
    preparation: "Preparation completeness",
    checklist: "PRE-MARKET CHECKLIST",
    maxRisk: "Maximum risk",
    maxTrades: "Maximum trades",
    context: "CONTEXT",
    levels: "LEVELS",
    events: "EVENTS",
    counter: "EVIDENCE AGAINST THE THESIS",
    noTrade: "DO NOT TRADE IF",
    scenario: "SCENARIO",
    if: "If",
    confirmation: "Confirmation",
    then: "Then",
    invalidation: "Invalidation",
    stop: "Stop/risk",
    targets: "Targets",
    avoid: "Avoid",
    behavior: "BEHAVIOR PLAN",
    market: "ACTUAL MARKET",
    execution: "MY EXECUTION",
    observed: "Observed scenario",
    followed: "Followed the plan",
    deviations: "Deviations",
    result: "Result",
    lessons: "Lesson",
    origin: "Execution origin",
    readingQuality: "Reading quality",
    executionQuality: "Execution quality",
    violatedRules: "Violated rules",
  } : activeLanguage === "es" ? {
    frozen: "VERSIÓN CONGELADA",
    draft: "BORRADOR ACTUAL — SIN VERSIÓN CONGELADA",
    title: "PLAN DE TRADING",
    bias: "Sesgo",
    conviction: "Convicción declarada",
    changeMind: "Cambiaría de opinión si",
    preparation: "Completitud de la preparación",
    checklist: "CHECKLIST PREMERCADO",
    maxRisk: "Riesgo máximo",
    maxTrades: "Máximo de operaciones",
    context: "CONTEXTO",
    levels: "NIVELES",
    events: "EVENTOS",
    counter: "EVIDENCIAS CONTRA LA TESIS",
    noTrade: "NO OPERAR SI",
    scenario: "ESCENARIO",
    if: "Si",
    confirmation: "Confirmación",
    then: "Entonces",
    invalidation: "Invalidación",
    stop: "Stop/riesgo",
    targets: "Objetivos",
    avoid: "Evitar",
    behavior: "PLAN CONDUCTUAL",
    market: "MERCADO REAL",
    execution: "MI EJECUCIÓN",
    observed: "Escenario observado",
    followed: "Seguí el plan",
    deviations: "Desviaciones",
    result: "Resultado",
    lessons: "Aprendizaje",
    origin: "Origen de la ejecución",
    readingQuality: "Calidad de la lectura",
    executionQuality: "Calidad de la ejecución",
    violatedRules: "Reglas violadas",
  } : {
    frozen: "VERSÃO CONGELADA",
    draft: "RASCUNHO ATUAL — SEM VERSÃO CONGELADA",
    title: "PLANO DE TRADE",
    bias: "Viés",
    conviction: "Convicção declarada",
    changeMind: "Mudaria de opinião se",
    preparation: "Completude da preparação",
    checklist: "CHECKLIST PRÉ-MERCADO",
    maxRisk: "Risco máximo",
    maxTrades: "Máximo de operações",
    context: "CONTEXTO",
    levels: "NÍVEIS",
    events: "EVENTOS",
    counter: "EVIDÊNCIAS CONTRA A TESE",
    noTrade: "NÃO OPERAR SE",
    scenario: "CENÁRIO",
    if: "Se",
    confirmation: "Confirmação",
    then: "Então",
    invalidation: "Invalidação",
    stop: "Stop/risco",
    targets: "Alvos",
    avoid: "Evitar",
    behavior: "PLANO COMPORTAMENTAL",
    market: "MERCADO REAL",
    execution: "MINHA EXECUÇÃO",
    observed: "Cenário observado",
    followed: "Seguiu o plano",
    deviations: "Desvios",
    result: "Resultado",
    lessons: "Aprendizado",
    origin: "Origem da execução",
    readingQuality: "Qualidade da leitura",
    executionQuality: "Qualidade da execução",
    violatedRules: "Regras violadas",
  };

  const source = reference ? `${labels.frozen} v${reference.version} — ${fmtDateTime(reference.frozenAt)}` : labels.draft;
  const scenarios = base.scenarios.map((s) => `${labels.scenario} ${s.label} — ${s.title}\n${labels.if}: ${s.trigger}\n${labels.confirmation}: ${s.confirmation}\n${labels.then}: ${s.action}\n${labels.invalidation}: ${s.invalidation}\n${labels.stop}: ${s.stop}\n${labels.targets}: ${s.targets}\n${labels.avoid}: ${s.avoid}`).join("\n\n");
  const localizedBias = translateUi(base.bias, activeLanguage);
  const localizedObserved = translateUi(p.review.observedScenario, activeLanguage);
  const localizedFollowed = translateUi(p.review.followedPlan, activeLanguage);
  const localizedConviction = base.thesisConviction ? translateUi(base.thesisConviction, activeLanguage) : "—";
  const localizedOrigin = translateUi(p.review.executionOrigin, activeLanguage);
  const checklist = base.checklist.map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.text}`).join("\n");
  const violatedRules = p.review.violatedRuleIds.map((id) => rules.find((rule) => rule.id === id)?.title || id).join(", ");

  return `${labels.title} — ${base.asset} — ${fmtDate(base.tradingDate)}\n${source}\n\n${labels.bias}: ${localizedBias}\n${labels.conviction}: ${localizedConviction}\n${labels.changeMind}: ${base.changeMindCondition}\n${labels.preparation}: ${base.readinessScore === undefined ? planReadiness(p).score : base.readinessScore}%\n${labels.maxRisk}: ${base.maxRisk}\n${labels.maxTrades}: ${base.maxTrades}\n\n${labels.context}\n${base.marketContext}\n\n${labels.levels}\n${base.keyLevels}\n\n${labels.events}\n${base.macroEvents}\n\n${labels.counter}\n${base.evidenceAgainstThesis}\n\n${labels.noTrade}\n${base.noTradeConditions}\n\n${labels.checklist}\n${checklist}\n\n${scenarios}\n\n${labels.behavior}\n${base.behaviorPlan}\n\n${labels.market}\n${p.review.happened}\n\n${labels.execution}\n${p.review.executionSummary}\n\n${labels.observed}: ${localizedObserved}\n${labels.followed}: ${localizedFollowed}\n${labels.origin}: ${localizedOrigin || "—"}\n${labels.readingQuality}: ${p.review.readingQuality || "—"}/5\n${labels.executionQuality}: ${p.review.executionQuality || "—"}/5\n${labels.violatedRules}: ${violatedRules || "—"}\n${labels.deviations}: ${p.review.deviations}\n${labels.result}: ${p.review.result}\n${labels.lessons}: ${p.review.lessons}\n`;
}


type GalleryItem = {
  id: string;
  src: string;
  name: string;
  source: string;
  date?: string;
};

function dataUrlToBlob(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Data URL de imagem inválido.");

  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = metadata.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
  const bytes = metadata.includes(";base64")
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));

  return new Blob([bytes], { type: mime });
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(activeLocale, { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(year, monthNumber - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function calendarCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const days = new Date(year, monthNumber, 0).getDate();
  const mondayFirst = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: mondayFirst }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function searchHaystack(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}


function normalizeImportKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function importedValue(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeImportKey(alias);
    const found = entries.find(([key]) => normalizeImportKey(key) === normalizedAlias);
    if (found && found[1] !== undefined && found[1] !== null) return String(found[1]).trim();
  }
  return "";
}

function journalTradeFromRow(row: Record<string, unknown>, source: string, state: AppState): JournalTrade | null {
  const tradingDate = normalizedTradeDate(importedValue(row, ["tradingDate", "tradeDate", "date", "data", "dataPregao"]));
  const asset = importedValue(row, ["asset", "ativo", "symbol", "ticker"]).toUpperCase();
  if (!tradingDate || !asset) return null;

  const rawScenario = importedValue(row, ["scenario", "cenario", "scenarioLabel"]).toUpperCase();
  const scenarioLabel: JournalTrade["scenarioLabel"] = rawScenario === "A" || rawScenario === "B" || rawScenario === "C" ? rawScenario : "";
  const requestedPlanId = importedValue(row, ["planId", "planoId"]);
  const requestedPlan = requestedPlanId ? state.plans.find((plan) => plan.id === requestedPlanId) : undefined;
  const candidates = state.plans.filter((plan) => plan.tradingDate === tradingDate && plan.asset.toUpperCase() === asset);
  const plan = requestedPlan ?? (candidates.length === 1 ? candidates[0] : undefined);

  return {
    id: crypto.randomUUID(),
    externalId: importedValue(row, ["externalId", "tradeId", "id", "codigo", "ticket"]),
    tradingDate,
    asset,
    side: importedValue(row, ["side", "direction", "lado", "direcao", "tipo"]),
    entryTime: importedValue(row, ["entryTime", "horaEntrada", "entradaHora", "openTime"]),
    exitTime: importedValue(row, ["exitTime", "horaSaida", "saidaHora", "closeTime"]),
    entryPrice: importedValue(row, ["entryPrice", "precoEntrada", "entrada", "openPrice"]),
    exitPrice: importedValue(row, ["exitPrice", "precoSaida", "saida", "closePrice"]),
    quantity: importedValue(row, ["quantity", "qty", "quantidade", "contratos"]),
    result: importedValue(row, ["result", "resultado", "pnl", "profit", "lucro"]),
    notes: importedValue(row, ["notes", "nota", "observacao", "observacoes", "comment"]),
    planId: plan?.id,
    sessionId: plan?.sessionId,
    scenarioLabel,
    importSource: source,
    importedAt: new Date().toISOString(),
  };
}

function parseJournalImport(text: string, source: string, state: AppState) {
  return parseJournalRows(text)
    .map((row) => journalTradeFromRow(row, source, state))
    .filter((trade): trade is JournalTrade => !!trade);
}

function journalTradeKey(trade: JournalTrade) {
  return trade.externalId
    ? `${trade.importSource}::${trade.externalId}`
    : [trade.tradingDate, trade.asset, trade.entryTime, trade.exitTime, trade.entryPrice, trade.exitPrice, trade.quantity, trade.result].join("::");
}

function journalExecutionSummary(trades: JournalTrade[]) {
  return trades.map((trade) => {
    const pieces = [trade.entryTime, trade.side, trade.quantity && `${trade.quantity}x`, trade.entryPrice && `@${trade.entryPrice}`].filter(Boolean).join(" ");
    const exit = [trade.exitTime, trade.exitPrice && `@${trade.exitPrice}`, trade.result].filter(Boolean).join(" ");
    return [pieces, exit].filter(Boolean).join(" → ");
  }).filter(Boolean).join("\n");
}

function tradeHasPreplannedScenario(trade: JournalTrade, plan?: TradePlan) {
  if (!plan || !trade.scenarioLabel) return false;
  const reference = latestFrozenVersion(plan);
  const scenarios = reference?.scenarios ?? plan.scenarios;
  const scenario = scenarios.find((item) => item.label === trade.scenarioLabel);
  return !!scenario && !!(scenario.title.trim() || scenario.trigger.trim() || scenario.action.trim());
}

function JournalIntegration({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseJournalImport(await file.text(), file.name, state);
      if (!parsed.length) {
        setMessage("Nenhum trade válido foi encontrado. O arquivo precisa conter ao menos data e ativo.");
        return;
      }
      const existing = new Set(state.journalTrades.map(journalTradeKey));
      const fresh = parsed.filter((trade) => !existing.has(journalTradeKey(trade)));
      if (!fresh.length) {
        setMessage("Nenhum trade novo foi importado; os registros identificáveis já existiam.");
        return;
      }

      setState((current) => {
        const byPlan = new Map<string, JournalTrade[]>();
        for (const trade of fresh) if (trade.planId) byPlan.set(trade.planId, [...(byPlan.get(trade.planId) || []), trade]);
        const plans = current.plans.map((plan) => {
          const imported = byPlan.get(plan.id);
          if (!imported?.length) return plan;
          const summary = journalExecutionSummary(imported);
          const results = imported.map((trade) => trade.result).filter(Boolean).join(" | ");
          return {
            ...plan,
            review: {
              ...plan.review,
              executionSummary: plan.review.executionSummary || summary,
              result: plan.review.result || results,
            },
          };
        });
        return { ...current, plans, journalTrades: [...fresh, ...current.journalTrades] };
      });
      const autoLinked = fresh.filter((trade) => !!trade.planId).length;
      setMessage(`${fresh.length} trade(s) importado(s). ${autoLinked} vinculado(s) automaticamente por data + ativo.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar o diário.");
    }
  }

  function patchTrade(id: string, patch: Partial<JournalTrade>) {
    setState((current) => ({ ...current, journalTrades: current.journalTrades.map((trade) => trade.id === id ? { ...trade, ...patch } : trade) }));
  }

  function linkPlan(trade: JournalTrade, planId: string) {
    const plan = state.plans.find((item) => item.id === planId);
    patchTrade(trade.id, { planId: plan?.id, sessionId: plan?.sessionId, scenarioLabel: plan ? trade.scenarioLabel : "" });
  }

  const realTrades = state.journalTrades.filter((trade) => !trade.isDemo);
  const linked = realTrades.filter((trade) => !!trade.planId).length;
  const unlinked = realTrades.length - linked;
  const scenarioIssues = realTrades.filter((trade) => !tradeHasPreplannedScenario(trade, state.plans.find((plan) => plan.id === trade.planId))).length;

  const reportPlans = state.plans.filter((plan) => !plan.isDemo && (realTrades.some((trade) => trade.planId === plan.id) || !!plan.review.executionSummary || !!plan.review.reviewedAt))
    .sort((a, b) => b.tradingDate.localeCompare(a.tradingDate));

  return <div className="panel journal-panel">
    <div className="history-section-title"><div><span className="eyebrow">INTEGRAÇÃO COM DIÁRIO</span><h2>Execuções importadas</h2></div><button className="primary" onClick={() => fileRef.current?.click()}>Importar JSON/CSV</button></div>
    <input ref={fileRef} hidden type="file" accept=".json,.csv,text/csv,application/json" onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
    <p className="muted-text">O importador aceita nomes de colunas comuns em português ou inglês. Data e ativo são obrigatórios. Quando existir exatamente um plano para a mesma data e ativo, o vínculo é criado automaticamente.</p>
    {message && <div className="notice">{message}</div>}

    <div className="journal-stats"><div><strong>{realTrades.length}</strong><span>trades importados</span></div><div><strong>{linked}</strong><span>vinculados a planos</span></div><div><strong>{unlinked}</strong><span>sem plano vinculado</span></div><div><strong>{scenarioIssues}</strong><span>sem cenário pré-planejado</span></div></div>

    {!!state.journalTrades.length && <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th>Data</th><th>Ativo</th><th>Execução</th><th>Resultado</th><th>Plano</th><th>Cenário</th><th></th></tr></thead><tbody>{state.journalTrades.slice(0, 100).map((trade) => {
      const linkedPlan = state.plans.find((plan) => plan.id === trade.planId);
      return <tr key={trade.id}><td>{fmtDate(trade.tradingDate)}</td><td><b>{trade.asset}</b>{trade.isDemo && <span className="badge demo">Exemplo</span>}<small>{trade.side}</small></td><td><span>{[trade.entryTime, trade.entryPrice].filter(Boolean).join(" @ ") || "—"}</span><small>{[trade.exitTime, trade.exitPrice].filter(Boolean).join(" @ ")}</small></td><td>{trade.result || "—"}</td><td><select value={trade.planId ?? ""} onChange={(e) => linkPlan(trade, e.target.value)}><option value="">Sem vínculo</option>{state.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.asset} • {fmtDate(plan.tradingDate)}</option>)}</select></td><td><select value={trade.scenarioLabel} disabled={!linkedPlan} onChange={(e) => patchTrade(trade.id, { scenarioLabel: e.target.value as JournalTrade["scenarioLabel"] })}><option value="">—</option><option>A</option><option>B</option><option>C</option></select>{linkedPlan && !tradeHasPreplannedScenario(trade, linkedPlan) && <small className="warning-text">Não corresponde a cenário previamente definido.</small>}</td><td><button className="tiny danger" onClick={() => setState((current) => ({ ...current, journalTrades: current.journalTrades.filter((item) => item.id !== trade.id) }))}>Remover</button></td></tr>;
    })}</tbody></table></div>}

    <div className="history-section-title journal-report-title"><div><span className="eyebrow">PROCESSO + RESULTADO</span><h3>Planejei × operei × registrei</h3></div></div>
    {reportPlans.length ? <div className="joint-report">{reportPlans.slice(0, 50).map((plan) => {
      const trades = state.journalTrades.filter((trade) => trade.planId === plan.id);
      const operated = !!plan.review.executionSummary || trades.length > 0;
      return <div className="joint-report-row" key={plan.id}><div><b>{fmtDate(plan.tradingDate)} • {plan.asset}</b><span>{state.setups.find((setup) => setup.id === plan.setupId)?.title || "Sem setup"}</span></div><span className="badge ok">Planejei</span><span className={`badge ${operated ? "ok" : ""}`}>{operated ? "Operei" : "Sem execução"}</span><span className={`badge ${trades.length ? "ok" : "warning"}`}>{trades.length ? `${trades.length} no diário` : "Sem registro importado"}</span><span>{plan.review.followedPlan || "—"}</span><span>{plan.review.readingQuality || "—"} / {plan.review.executionQuality || "—"}</span><b>{trades.map((trade) => trade.result).filter(Boolean).join(" | ") || plan.review.result || "—"}</b></div>;
    })}</div> : <div className="empty">Ainda não há planos revisados ou execuções importadas para o relatório conjunto.</div>}
  </div>;
}

function HistoryPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const currentMonth = isoDateLocal().slice(0, 7);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth);
  const [asset, setAsset] = useState("");
  const [setupId, setSetupId] = useState("");
  const [scenario, setScenario] = useState("");
  const [adherence, setAdherence] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [galleryPreview, setGalleryPreview] = useState<GalleryItem | null>(null);
  const [galleryPreviewUrl, setGalleryPreviewUrl] = useState("");

  const filteredPlans = useMemo(() => state.plans.filter((plan) => {
    if (plan.isDemo) return false;
    if (asset && plan.asset !== asset) return false;
    if (setupId && plan.setupId !== setupId) return false;
    if (scenario && plan.review.observedScenario !== scenario) return false;
    if (adherence && plan.review.followedPlan !== adherence) return false;
    if (dateFrom && plan.tradingDate < dateFrom) return false;
    if (dateTo && plan.tradingDate > dateTo) return false;
    return true;
  }), [state.plans, asset, setupId, scenario, adherence, dateFrom, dateTo]);

  const reviewedPlans = filteredPlans.filter((plan) => !!plan.review.reviewedAt);

  const setupStats = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; total: number; yes: number; partial: number; no: number }>();
    for (const plan of reviewedPlans) {
      const key = plan.setupId || "__none__";
      const title = plan.setupId ? state.setups.find((setup) => setup.id === plan.setupId)?.title || "Setup removido" : "Sem setup";
      const item = groups.get(key) || { id: key, title, total: 0, yes: 0, partial: 0, no: 0 };
      item.total += 1;
      if (plan.review.followedPlan === "Sim") item.yes += 1;
      else if (plan.review.followedPlan === "Parcialmente") item.partial += 1;
      else if (plan.review.followedPlan === "Não") item.no += 1;
      groups.set(key, item);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [reviewedPlans, state.setups]);

  const violationStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plan of reviewedPlans) {
      for (const id of plan.review.violatedRuleIds) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      title: state.rules.find((rule) => rule.id === id)?.title || "Regra removida",
      category: state.rules.find((rule) => rule.id === id)?.category || "Outro",
    })).sort((a, b) => b.count - a.count);
  }, [reviewedPlans, state.rules]);

  const originStats = useMemo(() => {
    const values = { planejada: 0, parcial: 0, improvisada: 0, naoClassificada: 0 };
    for (const plan of reviewedPlans) {
      if (plan.review.executionOrigin === "Planejada") values.planejada += 1;
      else if (plan.review.executionOrigin === "Parcialmente planejada") values.parcial += 1;
      else if (plan.review.executionOrigin === "Improvisada") values.improvisada += 1;
      else values.naoClassificada += 1;
    }
    return values;
  }, [reviewedPlans]);

  const qualityPlans = reviewedPlans.filter((plan) => plan.review.readingQuality > 0 || plan.review.executionQuality > 0);
  const readingAverage = avg(qualityPlans.map((plan) => plan.review.readingQuality).filter((value) => value > 0));
  const executionAverage = avg(qualityPlans.map((plan) => plan.review.executionQuality).filter((value) => value > 0));

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const items: Array<{ id: string; type: string; title: string; excerpt: string }> = [];
    for (const plan of state.plans) {
      const scenarioText = plan.scenarios.map((item) => Object.values(item).join(" ")).join(" ");
      const content = searchHaystack([plan.asset, plan.marketContext, plan.keyLevels, plan.macroEvents, plan.evidenceAgainstThesis, plan.changeMindCondition, plan.behaviorPlan, scenarioText, plan.review.happened, plan.review.executionSummary, plan.review.deviations, plan.review.lessons, plan.review.result]);
      if (content.includes(query)) items.push({ id: `plan-${plan.id}`, type: "Plano", title: `${plan.asset} • ${fmtDate(plan.tradingDate)}`, excerpt: plan.marketContext || plan.review.lessons || scenarioText });
    }
    for (const rule of state.rules) {
      const content = searchHaystack([rule.title, rule.category, rule.description, rule.rationale]);
      if (content.includes(query)) items.push({ id: `rule-${rule.id}`, type: "Regra", title: rule.title, excerpt: rule.description });
    }
    for (const setup of state.setups) {
      const content = searchHaystack([setup.title, setup.description, setup.marketContext, setup.entryCriteria, setup.confirmation, setup.invalidation, setup.stopModel, setup.targetModel, setup.avoid, setup.behaviorNotes]);
      if (content.includes(query)) items.push({ id: `setup-${setup.id}`, type: "Setup", title: setup.title, excerpt: setup.description || setup.marketContext });
    }
    return items.slice(0, 50);
  }, [search, state.plans, state.rules, state.setups]);

  useEffect(() => {
    if (!galleryPreview) {
      setGalleryPreviewUrl("");
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(dataUrlToBlob(galleryPreview.src));
      setGalleryPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } catch {
      setGalleryPreviewUrl("");
    }
  }, [galleryPreview]);

  const gallery = useMemo(() => {
    const items: GalleryItem[] = [];
    const seen = new Set<string>();
    const push = (attachment: Attachment, source: string, uniqueContext: string, date?: string) => {
      const key = `${uniqueContext}::${attachment.id || attachment.dataUrl}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ id: key, src: attachment.dataUrl, name: attachment.name, source, date });
    };
    state.plans.forEach((plan) => {
      plan.attachments.forEach((attachment) => push(attachment, `Plano • ${plan.asset}`, `plan-${plan.id}`, plan.tradingDate));
      plan.review.attachments.forEach((attachment) => push(attachment, `Revisão • ${plan.asset}`, `review-${plan.id}`, plan.tradingDate));
      plan.versions.forEach((version) => version.attachments.forEach((attachment) => push(
        attachment,
        `Plano congelado v${version.version} • ${plan.asset}`,
        `snapshot-${plan.id}-${version.id}`,
        plan.tradingDate,
      )));
    });
    state.studies.forEach((study) => study.attachments.forEach((attachment) => push(attachment, `Estudo • ${study.title}`, `study-${study.id}`, study.studyDate)));
    state.setups.forEach((setup) => setup.attachments.forEach((attachment) => push(attachment, `Setup • ${setup.title}`, `setup-${setup.id}`)));
    state.rules.forEach((rule) => rule.attachments.forEach((attachment) => push(attachment, `Regra • ${rule.title}`, `rule-${rule.id}`)));
    return items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [state.plans, state.studies, state.setups, state.rules]);

  const plansByDate = useMemo(() => {
    const map = new Map<string, TradePlan[]>();
    for (const plan of filteredPlans) map.set(plan.tradingDate, [...(map.get(plan.tradingDate) || []), plan]);
    return map;
  }, [filteredPlans]);

  const weekdays = activeLanguage === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : activeLanguage === "es"
      ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
      : ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return <section className="page history-page">
    <div className="page-heading"><div><span className="eyebrow">CONSULTA E MÉTRICAS</span><h1>Histórico</h1><p>Consulte revisões, aderência, execuções e métricas de preparação ao longo do tempo.</p></div></div>

    <div className="panel history-filters">
      <h2>Filtros</h2>
      <div className="history-filter-grid">
        <Field label="Ativo"><select value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">Todos</option>{[...new Set(state.plans.map((plan) => plan.asset))].sort().map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Setup"><select value={setupId} onChange={(e) => setSetupId(e.target.value)}><option value="">Todos</option>{state.setups.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Cenário observado"><select value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="">Todos</option><option>A</option><option>B</option><option>C</option><option>Nenhum</option><option>Mistura</option></select></Field>
        <Field label="Aderência"><select value={adherence} onChange={(e) => setAdherence(e.target.value)}><option value="">Todos</option><option>Sim</option><option>Parcialmente</option><option>Não</option><option>Não operei</option></select></Field>
        <Field label="De"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
        <Field label="Até"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
      </div>
      <div className="history-filter-foot"><span>{filteredPlans.length} plano(s) no recorte • {reviewedPlans.length} revisado(s)</span><button onClick={() => { setAsset(""); setSetupId(""); setScenario(""); setAdherence(""); setDateFrom(""); setDateTo(""); }}>Limpar filtros</button></div>
    </div>

    <div className="panel calendar-panel">
      <div className="history-section-title"><div><span className="eyebrow">CALENDÁRIO</span><h2>Pregões planejados e revisados</h2></div><div className="calendar-nav"><button onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}>‹</button><b>{monthLabel(calendarMonth)}</b><button onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}>›</button></div></div>
      <div className="calendar-grid">{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{calendarCells(calendarMonth).map((date, index) => {
        if (!date) return <div className="calendar-day empty-day" key={`empty-${index}`} />;
        const dayPlans = plansByDate.get(date) || [];
        return <div className={`calendar-day ${date === isoDateLocal() ? "today" : ""}`} key={date}><b>{Number(date.slice(-2))}</b><div>{dayPlans.map((plan) => <span className={`calendar-plan ${plan.review.reviewedAt ? "reviewed" : plan.planStatus === "frozen" ? "frozen" : ""}`} key={plan.id}>{plan.asset} {plan.review.reviewedAt ? "✓" : ""}</span>)}</div></div>;
      })}</div>
      <div className="calendar-legend"><span><i className="legend-dot reviewed"></i>Revisado</span><span><i className="legend-dot frozen"></i>Congelado</span><span><i className="legend-dot"></i>Rascunho</span></div>
    </div>

    <div className="history-metrics-grid">
      <div className="panel"><span className="eyebrow">ADERÊNCIA</span><h2>Por setup</h2>{setupStats.length ? <div className="metric-list">{setupStats.map((item) => <div className="metric-row" key={item.id}><div><b>{item.title}</b><span>{item.total} revisão(ões) • {item.partial} parcial(is) • {item.no} não</span></div><strong>{item.total ? Math.round(item.yes / item.total * 100) : 0}%</strong></div>)}</div> : <div className="empty">Ainda não há revisões suficientes neste recorte.</div>}</div>

      <div className="panel"><span className="eyebrow">DISCIPLINA</span><h2>Regras mais violadas</h2>{violationStats.length ? <div className="metric-list">{violationStats.map((item) => <div className="metric-row" key={item.id}><div><b>{item.title}</b><span>{item.category}</span></div><strong>{item.count}×</strong></div>)}</div> : <div className="empty">Nenhuma violação estruturada registrada neste recorte.</div>}</div>

      <div className="panel"><span className="eyebrow">ORIGEM DA EXECUÇÃO</span><h2>Planejado × improvisado</h2><div className="origin-grid"><div><strong>{originStats.planejada}</strong><span>Planejada</span></div><div><strong>{originStats.parcial}</strong><span>Parcial</span></div><div><strong>{originStats.improvisada}</strong><span>Improvisada</span></div><div><strong>{originStats.naoClassificada}</strong><span>Não classificada</span></div></div></div>

      <div className="panel"><span className="eyebrow">QUALIDADE</span><h2>Leitura × execução</h2><div className="quality-pair"><div><strong>{readingAverage ? readingAverage.toFixed(1) : "—"}</strong><span>leitura média / 5</span></div><div><strong>{executionAverage ? executionAverage.toFixed(1) : "—"}</strong><span>execução média / 5</span></div></div>{qualityPlans.length ? <div className="quality-history">{[...qualityPlans].sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)).slice(0, 12).map((plan) => <div key={plan.id}><span>{fmtDate(plan.tradingDate)} • {plan.asset}</span><b>{plan.review.readingQuality || "—"} / {plan.review.executionQuality || "—"}</b></div>)}</div> : <div className="empty">Avalie leitura e execução nas revisões para formar este histórico.</div>}</div>
    </div>

    <div className="panel history-search">
      <div className="history-section-title"><div><span className="eyebrow">BUSCA TEXTUAL</span><h2>Planos, regras e setups</h2></div><span>{searchResults.length} resultado(s)</span></div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquise contexto, erro, regra, setup, aprendizado, nível, cenário…" />
      {search.trim() ? (searchResults.length ? <div className="search-results">{searchResults.map((item) => <article key={item.id}><span className="badge">{item.type}</span><div><b>{item.title}</b><p>{item.excerpt || "Correspondência encontrada."}</p></div></article>)}</div> : <div className="empty">Nenhuma correspondência encontrada.</div>) : <p className="muted-text">Digite um termo para procurar em planos, revisões, regras e setups.</p>}
    </div>

    <div className="panel gallery-panel">
      <div className="history-section-title"><div><span className="eyebrow">GALERIA</span><h2>Imagens históricas</h2></div><span>{gallery.length} imagem(ns)</span></div>
      {gallery.length ? <div className="history-gallery">{gallery.map((item) => <figure key={item.id}><button type="button" className="gallery-preview-button" onClick={() => setGalleryPreview(item)}><img src={item.src} alt={item.name} /></button><figcaption><b>{item.source}</b><span>{item.date ? fmtDate(item.date) : item.name}</span></figcaption></figure>)}</div> : <div className="empty">Ainda não existem imagens para compor a galeria histórica.</div>}
    </div>

    {galleryPreview && <div className="gallery-modal" role="dialog" aria-modal="true" aria-label={galleryPreview.name} onClick={() => setGalleryPreview(null)}>
      <div className="gallery-modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="gallery-modal-head"><div><b>{galleryPreview.source}</b><span>{galleryPreview.date ? fmtDate(galleryPreview.date) : galleryPreview.name}</span></div><button type="button" onClick={() => setGalleryPreview(null)}>Fechar</button></div>
        <img src={galleryPreviewUrl || galleryPreview.src} alt={galleryPreview.name} />
      </div>
    </div>}

    <JournalIntegration state={state} setState={setState} />
  </section>;
}


function frozenReference(plan: TradePlan) {
  return latestFrozenVersion(plan) ?? currentReference(plan);
}

function TrainingPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const replayCandidates = useMemo(
    () => state.plans.filter((plan) => plan.versions.length > 0).sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)),
    [state.plans],
  );
  const lowAdherence = useMemo(
    () => state.plans.filter((plan) => !!plan.review.reviewedAt && (plan.review.followedPlan === "Parcialmente" || plan.review.followedPlan === "Não")).sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)),
    [state.plans],
  );

  const violationStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plan of state.plans) {
      if (plan.isDemo) continue;
      for (const ruleId of plan.review.violatedRuleIds) counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([ruleId, count]) => ({ ruleId, count, rule: state.rules.find((rule) => rule.id === ruleId) }))
      .filter((item) => !!item.rule)
      .sort((a, b) => b.count - a.count);
  }, [state.plans, state.rules]);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [trainingType, setTrainingType] = useState<TrainingRecord["type"]>("replay");
  const [decisionNow, setDecisionNow] = useState("");
  const [interpretationNow, setInterpretationNow] = useState("");
  const [comparisonNotes, setComparisonNotes] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [trainingMessage, setTrainingMessage] = useState("");

  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [errorDecision, setErrorDecision] = useState("");
  const [errorLesson, setErrorLesson] = useState("");

  const setupPlans = useMemo(
    () => state.plans.filter((plan) => !!plan.setupId && !!plan.review.reviewedAt).sort((a, b) => b.tradingDate.localeCompare(a.tradingDate)),
    [state.plans],
  );
  const [examplePlanId, setExamplePlanId] = useState("");
  const [exampleClass, setExampleClass] = useState<SetupExample["classification"]>("Correto");
  const [exampleNotes, setExampleNotes] = useState("");

  const selectedPlan = state.plans.find((plan) => plan.id === selectedPlanId);
  const reference = selectedPlan ? frozenReference(selectedPlan) : null;
  const selectedRule = state.rules.find((rule) => rule.id === selectedRuleId);

  function beginReplay(planId: string, type: TrainingRecord["type"] = "replay") {
    setSelectedPlanId(planId);
    setTrainingType(type);
    setDecisionNow("");
    setInterpretationNow("");
    setComparisonNotes("");
    setRevealed(false);
    setTrainingMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function revealOutcome() {
    if (!decisionNow.trim() || !interpretationNow.trim()) {
      setTrainingMessage("Registre primeiro sua decisão e sua interpretação atuais antes de revelar o que aconteceu.");
      return;
    }
    setRevealed(true);
    setTrainingMessage("");
  }

  function saveReplay() {
    if (!selectedPlan || !decisionNow.trim() || !interpretationNow.trim() || !revealed) return;
    const record: TrainingRecord = {
      id: crypto.randomUUID(),
      type: trainingType,
      planId: selectedPlan.id,
      setupId: selectedPlan.setupId,
      prompt: trainingType === "revisit"
        ? "Revisitar um plano com baixa aderência e formular a decisão que eu tomaria hoje."
        : "Reexaminar a preparação congelada sem conhecer o desfecho e registrar uma nova decisão.",
      decisionNow: decisionNow.trim(),
      interpretationNow: interpretationNow.trim(),
      comparisonNotes: comparisonNotes.trim(),
      createdAt: new Date().toISOString(),
      completedAt: revealed ? new Date().toISOString() : undefined,
    };
    setState((current) => ({ ...current, trainingRecords: [record, ...current.trainingRecords] }));
    setTrainingMessage("Exercício salvo no histórico de treinamento.");
  }

  function saveErrorExercise() {
    if (!selectedRule || !errorDecision.trim()) return;
    const record: TrainingRecord = {
      id: crypto.randomUUID(),
      type: "error",
      ruleId: selectedRule.id,
      prompt: `Como reconhecer e interromper uma nova violação da regra: ${selectedRule.title}?`,
      decisionNow: errorDecision.trim(),
      interpretationNow: selectedRule.rationale,
      comparisonNotes: errorLesson.trim(),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, trainingRecords: [record, ...current.trainingRecords] }));
    setErrorDecision("");
    setErrorLesson("");
  }

  function saveSetupExample() {
    const plan = state.plans.find((item) => item.id === examplePlanId);
    if (!plan?.setupId) return;
    const existing = state.setupExamples.find((item) => item.planId === plan.id && item.setupId === plan.setupId);
    const example: SetupExample = {
      id: existing?.id ?? crypto.randomUUID(),
      setupId: plan.setupId,
      planId: plan.id,
      classification: exampleClass,
      notes: exampleNotes.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    setState((current) => ({
      ...current,
      setupExamples: existing
        ? current.setupExamples.map((item) => item.id === example.id ? example : item)
        : [example, ...current.setupExamples],
    }));
    setExampleNotes("");
  }

  return <section className="page training-page">
    <div className="page-heading"><div><span className="eyebrow">TREINAMENTO DELIBERADO</span><h1>Treinamento de decisões</h1><p>Pratique a leitura de planos anteriores antes de rever o desfecho e treine a correção de erros recorrentes.</p></div></div>

    <div className="training-layout">
      <div className="panel replay-selector">
        <span className="eyebrow">REPLAY</span><h2>Escolha uma preparação congelada</h2>
        <p className="muted-text">O resultado do pregão fica oculto até você escrever sua decisão e interpretação atuais.</p>
        <select value={selectedPlanId} onChange={(e) => beginReplay(e.target.value, "replay")}>
          <option value="">Selecione um plano</option>
          {replayCandidates.map((plan) => <option key={plan.id} value={plan.id}>{fmtDate(plan.tradingDate)} • {plan.asset} • v{plan.versions.length}{plan.isDemo ? " • Exemplo" : ""}</option>)}
        </select>
        {!replayCandidates.length && <div className="empty">Congele planos antes do pregão para formar material de Replay.</div>}
      </div>

      <div className="panel">
        <span className="eyebrow">BAIXA ADERÊNCIA</span><h2>Planos para revisitar</h2>
        {lowAdherence.length ? <div className="training-list">{lowAdherence.slice(0, 10).map((plan) => <div key={plan.id}><div><b>{fmtDate(plan.tradingDate)} • {plan.asset}</b>{plan.isDemo && <span className="badge demo">Exemplo</span>}<span>{plan.review.followedPlan} • {state.setups.find((setup) => setup.id === plan.setupId)?.title || "Sem setup"}</span></div><button onClick={() => beginReplay(plan.id, "revisit")}>Revisitar</button></div>)}</div> : <div className="empty">Nenhum plano revisado com aderência parcial ou negativa.</div>}
      </div>
    </div>

    {selectedPlan && reference && <div className="panel replay-workspace">
      <div className="history-section-title"><div><span className="eyebrow">{trainingType === "revisit" ? "REVISITA" : "REPLAY SEM DESFECHO"}</span><h2>{selectedPlan.asset} • {fmtDate(selectedPlan.tradingDate)}</h2></div><span className="badge locked">v{reference.version} congelada</span></div>

      <div className="replay-frozen">
        <div><span>Viés original</span><b>{reference.bias}</b></div>
        <div><span>Convicção</span><b>{reference.thesisConviction || "—"}</b></div>
        <div className="wide"><span>Contexto que estava disponível</span><p>{reference.marketContext || "—"}</p></div>
        <div className="wide"><span>Níveis mapeados</span><p>{reference.keyLevels || "—"}</p></div>
        <div className="wide"><span>Contraprovas registradas</span><p>{reference.evidenceAgainstThesis || "—"}</p></div>
        <div className="wide"><span>O que faria mudar de opinião</span><p>{reference.changeMindCondition || "—"}</p></div>
      </div>

      <div className="replay-scenarios">{reference.scenarios.map((scenario) => <article key={scenario.id}><b>Cenário {scenario.label} — {scenario.title || "sem título"}</b><p><strong>Se:</strong> {scenario.trigger || "—"}</p><p><strong>Confirmação:</strong> {scenario.confirmation || "—"}</p><p><strong>Decisão prevista:</strong> {scenario.action || "—"}</p><p><strong>Invalidação:</strong> {scenario.invalidation || "—"}</p></article>)}</div>

      <div className="form-grid two">
        <Field label="Se eu estivesse diante desse contexto hoje, o que faria?"><textarea rows={6} value={decisionNow} onChange={(e) => setDecisionNow(e.target.value)} placeholder="Defina decisão, espera, gatilho, risco e aquilo que você conscientemente não faria." /></Field>
        <Field label="Como interpreto este contexto hoje?"><textarea rows={6} value={interpretationNow} onChange={(e) => setInterpretationNow(e.target.value)} placeholder="Registre sua leitura atual antes de conhecer novamente o desfecho." /></Field>
      </div>

      {!revealed ? <div className="replay-lock"><b>Desfecho oculto</b><span>Preencha os dois campos acima e só então revele o mercado real.</span><button className="primary" onClick={revealOutcome}>Revelar o que aconteceu</button></div> : <div className="replay-outcome">
        <span className="eyebrow">AGORA COMPARE</span><h3>O que realmente aconteceu naquele pregão</h3>
        <div className="comparison-grid">
          <article><h4>Mercado real</h4><p>{selectedPlan.review.happened || "Não registrado."}</p><p><b>Cenário observado:</b> {selectedPlan.review.observedScenario || "—"}</p></article>
          <article><h4>Execução original</h4><p>{selectedPlan.review.executionSummary || "Não registrada."}</p><p><b>Aderência:</b> {selectedPlan.review.followedPlan || "—"}</p></article>
          <article><h4>Aprendizado original</h4><p>{selectedPlan.review.lessons || "Não registrado."}</p><p><b>Desvios:</b> {selectedPlan.review.deviations || "—"}</p></article>
        </div>
        <Field label="O que mudou entre o que pensei naquela época e como interpreto agora?"><textarea rows={5} value={comparisonNotes} onChange={(e) => setComparisonNotes(e.target.value)} placeholder="Compare critérios, vieses, evidências ignoradas, qualidade da decisão e disciplina." /></Field>
      </div>}
      {trainingMessage && <div className="notice">{trainingMessage}</div>}
      <div className="actions"><button onClick={revealOutcome} disabled={revealed}>Revelar desfecho</button><button className="primary" onClick={saveReplay} disabled={!decisionNow.trim() || !interpretationNow.trim() || !revealed}>Salvar exercício</button></div>
    </div>}

    <div className="training-layout">
      <div className="panel">
        <span className="eyebrow">ERROS RECORRENTES</span><h2>Exercício baseado em regras violadas</h2>
        {violationStats.length ? <>
          <Field label="Regra para treinar"><select value={selectedRuleId} onChange={(e) => { setSelectedRuleId(e.target.value); setErrorDecision(""); setErrorLesson(""); }}><option value="">Selecione</option>{violationStats.map((item) => <option value={item.ruleId} key={item.ruleId}>{item.rule?.title} • {item.count}×</option>)}</select></Field>
          {selectedRule && <>
            <div className="training-prompt"><b>{selectedRule.title}</b><p>{selectedRule.description}</p>{selectedRule.rationale && <small>Por que existe: {selectedRule.rationale}</small>}</div>
            <Field label="Como reconhecerei o erro antes de repeti-lo?"><textarea rows={5} value={errorDecision} onChange={(e) => setErrorDecision(e.target.value)} placeholder="Descreva sinais de alerta e a resposta concreta que você executará." /></Field>
            <Field label="Exercício / regra de ação para a próxima ocorrência"><textarea rows={4} value={errorLesson} onChange={(e) => setErrorLesson(e.target.value)} placeholder="Ex.: ao perceber X, cancelo a ordem, afasto-me por 3 minutos e releio a regra." /></Field>
            <button className="primary" onClick={saveErrorExercise} disabled={!errorDecision.trim()}>Salvar exercício de correção</button>
          </>}
        </> : <div className="empty">Marque regras violadas nas revisões para que o sistema gere exercícios a partir dos seus próprios padrões.</div>}
      </div>

      <div className="panel">
        <span className="eyebrow">BIBLIOTECA PESSOAL</span><h2>Exemplos corretos e incorretos de setups</h2>
        {setupPlans.length ? <>
          <Field label="Plano revisado"><select value={examplePlanId} onChange={(e) => { const id = e.target.value; setExamplePlanId(id); const existing = state.setupExamples.find((item) => item.planId === id); setExampleClass(existing?.classification || "Correto"); setExampleNotes(existing?.notes || ""); }}><option value="">Selecione</option>{setupPlans.map((plan) => <option value={plan.id} key={plan.id}>{fmtDate(plan.tradingDate)} • {plan.asset} • {state.setups.find((setup) => setup.id === plan.setupId)?.title || "Setup removido"}</option>)}</select></Field>
          <Field label="Classificação"><select value={exampleClass} onChange={(e) => setExampleClass(e.target.value as SetupExample["classification"])}><option>Correto</option><option>Incorreto</option></select></Field>
          <Field label="Por que este é um exemplo útil?"><textarea rows={4} value={exampleNotes} onChange={(e) => setExampleNotes(e.target.value)} placeholder="Registre o que deve ser repetido ou evitado." /></Field>
          <button className="primary" onClick={saveSetupExample} disabled={!examplePlanId}>Salvar na biblioteca</button>
        </> : <div className="empty">Planos revisados com setup de referência aparecerão aqui.</div>}
      </div>
    </div>

    <div className="panel">
      <div className="history-section-title"><div><span className="eyebrow">EXEMPLOS POR SETUP</span><h2>Exemplos classificados</h2></div><span>{state.setupExamples.length} exemplo(s)</span></div>
      {state.setupExamples.length ? <div className="setup-example-grid">{state.setupExamples.map((example) => {
        const plan = state.plans.find((item) => item.id === example.planId);
        const setup = state.setups.find((item) => item.id === example.setupId);
        const images = plan ? [...plan.attachments, ...plan.review.attachments].slice(0, 3) : [];
        return <article key={example.id} className={`setup-example ${example.classification === "Correto" ? "correct" : "incorrect"}`}><div className="card-top"><div className="badges"><span className="badge">{setup?.title || "Setup removido"}</span>{example.isDemo && <span className="badge demo">Exemplo</span>}</div><span className={`badge ${example.classification === "Correto" ? "ok" : "warning"}`}>{example.classification}</span></div><h3>{plan ? `${fmtDate(plan.tradingDate)} • ${plan.asset}` : "Plano removido"}</h3><p>{example.notes || "Sem observações adicionais."}</p>{images.length > 0 && <div className="mini-images">{images.map((image) => <img key={image.id} src={image.dataUrl} alt={image.name} />)}</div>}<button className="tiny danger" onClick={() => setState((current) => ({ ...current, setupExamples: current.setupExamples.filter((item) => item.id !== example.id) }))}>Remover</button></article>;
      })}</div> : <div className="empty">Classifique exemplos revisados para construir sua biblioteca pessoal de execução.</div>}
    </div>

    <div className="panel training-history">
      <div className="history-section-title"><div><span className="eyebrow">HISTÓRICO DE TREINO</span><h2>Decisões revisitadas</h2></div><span>{state.trainingRecords.length} exercício(s)</span></div>
      {state.trainingRecords.length ? <div className="training-records">{state.trainingRecords.map((record) => {
        const plan = state.plans.find((item) => item.id === record.planId);
        const rule = state.rules.find((item) => item.id === record.ruleId);
        return <article key={record.id}><div className="training-record-head"><div><span className="badge">{record.type === "error" ? "Erro recorrente" : record.type === "revisit" ? "Revisita" : "Replay"}</span>{record.isDemo && <span className="badge demo">Exemplo</span>}<b>{plan ? `${fmtDate(plan.tradingDate)} • ${plan.asset}` : rule?.title || record.prompt}</b></div><button type="button" className="tiny danger" onClick={() => setState((current) => ({ ...current, trainingRecords: current.trainingRecords.filter((item) => item.id !== record.id) }))}>Remover</button></div><p><strong>Decisão/resposta:</strong> {record.decisionNow}</p>{record.interpretationNow && <p><strong>Interpretação:</strong> {record.interpretationNow}</p>}{record.comparisonNotes && <p><strong>Comparação/aprendizado:</strong> {record.comparisonNotes}</p>}<small>{fmtDateTime(record.createdAt)}</small></article>;
      })}</div> : <div className="empty">Os exercícios salvos aparecerão aqui para comparação longitudinal.</div>}
    </div>
  </section>;
}

function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <span className="info-tip">
    <button type="button" className="info-tip-trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>i</button>
    {open && <span className="info-tip-popover" role="note">{typeof children === "string" ? translateUi(children, activeLanguage) : children}</span>}
  </span>;
}

function SettingsPage({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [assetsText, setAssetsText] = useState(state.settings.assets.join(", "));
  const [message, setMessage] = useState("");

  const [desktopCurrentVersion, setDesktopCurrentVersion] = useState<string | null>(null);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateInfo | null>(null);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState("");
  const [desktopUpdateBusy, setDesktopUpdateBusy] = useState(false);
  const [desktopBackupDir, setDesktopBackupDir] = useState("");
  const [desktopStorageMessage, setDesktopStorageMessage] = useState("");
  const [desktopIntegrity, setDesktopIntegrity] = useState<DesktopIntegrityInfo | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    void Promise.all([
      desktopVersion().catch(() => null),
      getDesktopBackupDirectory().catch(() => null),
    ]).then(([version, backupDir]) => {
      setDesktopCurrentVersion(version);
      setDesktopBackupDir(backupDir ?? "");
    });
  }, []);

  async function checkForUpdate() {
    setDesktopUpdateBusy(true);
    setDesktopUpdateStatus("");
    try {
      const update = await checkDesktopUpdate();
      setDesktopUpdate(update);
      setDesktopUpdateStatus(update ? "Nova versão disponível." : "Você já está usando a versão mais recente.");
    } catch (error) {
      setDesktopUpdate(null);
      setDesktopUpdateStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDesktopUpdateBusy(false);
    }
  }

  async function installAvailableUpdate() {
    if (!desktopUpdate) return;
    setDesktopUpdateBusy(true);
    setDesktopUpdateStatus("Baixando e verificando a atualização…");
    try {
      await installDesktopUpdate(desktopUpdate.version);
      setDesktopUpdateStatus("Atualização instalada. O aplicativo poderá ser reiniciado para concluir a troca de versão.");
    } catch (error) {
      setDesktopUpdateStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDesktopUpdateBusy(false);
    }
  }

  async function chooseBackupFolder() {
    try {
      const selected = await chooseDesktopBackupDirectory();
      if (!selected) return;
      const saved = await setDesktopBackupDirectory(selected);
      setDesktopBackupDir(saved ?? selected);
      setDesktopStorageMessage("Pasta de backup atualizada. O próximo backup automático usará este local.");
    } catch (error) {
      setDesktopStorageMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createBackupNow() {
    try {
      const path = await createDesktopBackup();
      setDesktopStorageMessage(path ? `Backup criado em: ${path}` : "Não foi possível criar o backup.");
    } catch (error) {
      setDesktopStorageMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function verifyDesktopStorage() {
    try {
      const info = await checkDesktopIntegrity();
      setDesktopIntegrity(info);
      setDesktopStorageMessage(info?.message ?? "Verificação concluída.");
      if (info?.backupDirectory) setDesktopBackupDir(info.backupDirectory);
    } catch (error) {
      setDesktopIntegrity(null);
      setDesktopStorageMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function restoreBackupFile() {
    try {
      const path = await chooseDesktopBackupFile();
      if (!path) return;
      const preview = await previewDesktopBackup(path);
      if (!preview) return;
      const next = ensureDemoData(parseBackup(preview));
      if (!confirm(translateUi("Restaurar este backup substituirá os dados atuais do aplicativo. Deseja continuar?", activeLanguage))) return;
      const json = await restoreDesktopBackup(path);
      if (!json) return;
      setState(next);
      setAssetsText(next.settings.assets.join(", "));
      setDesktopStorageMessage("Backup restaurado com sucesso. Um ponto de restauração dos dados anteriores foi criado automaticamente. Recarregando a interface…");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setDesktopStorageMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const next = ensureDemoData(parseBackup(await file.text()));
      clearStorageLoadGuard();
      setState(next);
      setAssetsText(next.settings.assets.join(", "));
      setMessage("Backup importado com sucesso. Backups anteriores são migrados automaticamente para o schema atual.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao importar backup.");
    }
  }

  async function clearAllData() {
    if (!confirm(translateUi("Apagar todos os dados locais? Esta ação não pode ser desfeita.", activeLanguage))) return;

    try {
      if (isDesktopApp()) {
        const path = await createDesktopBackup();
        if (!path) throw new Error("Não foi possível criar o backup de segurança antes da limpeza.");
        setDesktopStorageMessage(`Backup de segurança criado em: ${path}`);
      }
      localStorage.removeItem(STORAGE_KEY);
      if (!isDesktopApp()) await clearWebAttachmentStore();
      clearStorageLoadGuard();
      const fresh = { ...initialState(), demoDataVersion: DEMO_DATA_VERSION };
      setState(fresh);
      setAssetsText(fresh.settings.assets.join(", "));
      setMessage("Dados locais apagados. No desktop, um backup de segurança foi criado antes da limpeza.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const settings = state.settings;
  const patch = (next: Partial<typeof settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...next } }));

  return <section className="page">
    <div className="page-heading"><div><span className="eyebrow">PREFERÊNCIAS E DADOS</span><h1>Configurações</h1><p>Os dados ficam localmente neste dispositivo. Use backups JSON para transportar ou restaurar regras, setups, planos, versões congeladas, revisões e imagens.</p></div></div>
    <div className="two-cols align-start">
      <div className="panel"><div className="panel-heading-with-info"><h2>Padrões de planejamento</h2><InfoTip label="Informações sobre os padrões de planejamento">Nesta área, defina os valores iniciais dos novos planos: ativos disponíveis, risco máximo e limite de operações. Eles são aplicados somente a planos criados depois; não alteram registros existentes. Nome do trader, tema, idioma e imagens são preferências gerais da aplicação.</InfoTip></div>
        <Field label="Nome do trader"><input value={settings.traderName} onChange={(e) => patch({ traderName: e.target.value })} placeholder="Opcional" /></Field>
        <Field label="Ativos disponíveis" hint="Separe os ativos por vírgula."><textarea rows={4} value={assetsText} onChange={(e) => setAssetsText(e.target.value)} onBlur={() => patch({ assets: assetsText.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></Field>
        <div className="form-grid two"><Field label="Risco máximo padrão"><input value={settings.defaultMaxRisk} onChange={(e) => patch({ defaultMaxRisk: e.target.value })} placeholder="Ex.: 2R" /></Field><Field label="Máx. de trades padrão"><input type="number" min={1} value={settings.defaultMaxTrades} onChange={(e) => patch({ defaultMaxTrades: Math.max(1, Number(e.target.value) || 1) })} /></Field></div>
        <Field label="Tema"><select value={settings.theme} onChange={(e) => patch({ theme: e.target.value as "dark" | "light" })}><option value="dark">Escuro</option><option value="light">Claro</option></select></Field>
        <Field label="Idioma da interface"><select value={settings.language} onChange={(e) => patch({ language: e.target.value as "pt-BR" | "en" | "es" })}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option></select></Field>
        <AttachmentField value={settings.attachments} onChange={(attachments) => patch({ attachments })} title="Imagens de referência geral" />
      </div>
      <div className="panel">
        <div className="desktop-update">
          <h2>Aplicativo desktop e atualizações</h2>
          {isDesktopApp() ? <>
            <p className="muted-text">Versão instalada: <b>{desktopCurrentVersion ?? "…"}</b></p>
            <div className="stack-actions">
              <button onClick={() => void checkForUpdate()} disabled={desktopUpdateBusy}>{desktopUpdateBusy ? "Verificando…" : "Verificar atualizações"}</button>
              {desktopUpdate && <button className="primary" onClick={() => void installAvailableUpdate()} disabled={desktopUpdateBusy}>Instalar versão {desktopUpdate.version}</button>}
            </div>
            {desktopUpdate?.notes && <div className="notice"><b>Notas da versão</b><br />{desktopUpdate.notes}</div>}
            {desktopUpdateStatus && <div className="notice">{desktopUpdateStatus}</div>}

            <div className="desktop-storage-panel">
              <h3>Armazenamento desktop</h3>
              <p className="muted-text">No aplicativo instalado, o SQLite é o armazenamento principal. Para levar dados de um navegador externo ao desktop, exporte e importe o backup JSON.</p>
              <div className="desktop-path"><span>Pasta de backups</span><code>{desktopBackupDir || "Carregando…"}</code></div>
              <p className="muted-text">Um backup automático é mantido por dia, com rotação dos 10 backups automáticos mais recentes. Antes de uma atualização ou restauração, o aplicativo cria um backup de segurança.</p>
              <div className="stack-actions">
                <button onClick={() => void chooseBackupFolder()}>Escolher pasta de backup</button>
                <button onClick={() => void createBackupNow()}>Criar backup agora</button>
                <button onClick={() => void verifyDesktopStorage()}>Verificar integridade</button>
                <button onClick={() => void restoreBackupFile()}>Restaurar backup do desktop</button>
              </div>
              {desktopIntegrity && <div className={`notice ${desktopIntegrity.ok ? "" : "error"}`}><b>{desktopIntegrity.ok ? "Integridade confirmada" : "Problema de integridade"}</b><br />{desktopIntegrity.message}</div>}
              {desktopStorageMessage && <div className="notice">{desktopStorageMessage}</div>}
            </div>
          </> : <p className="muted-text">Você está usando a versão web. O instalador Windows baseado em Tauri possui atualização automática integrada.</p>}
        </div>
        <h2>Backup e recuperação</h2><p className="muted-text">O JSON é o formato de recuperação completa. O schema v9 inclui planos, estudos, templates, execuções importadas, histórico estruturado, treinamento deliberado, biblioteca de setups, versões congeladas, preferência de idioma e imagens deduplicadas por ID. No uso normal, os binários ficam fora do estado principal: em arquivos no desktop e no IndexedDB na web.</p>
        <div className="stack-actions"><button className="primary" onClick={() => exportBackup(state)}>Exportar backup JSON</button><button onClick={() => fileRef.current?.click()}>Importar backup JSON</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} /></div>
        {message && <div className="notice">{message}</div>}
        <div className="danger-zone"><h3>Zona de risco</h3><p>Apaga os dados locais deste dispositivo. No aplicativo desktop, um backup de segurança é criado antes da limpeza.</p><button className="danger" onClick={() => void clearAllData()}>Apagar todos os dados</button></div>
      </div>
    </div>
  </section>;
}

export default function App() {
  const desktop = isDesktopApp();
  const [startupLoad] = useState(() => desktop ? loadStateResult() : { state: initialState() });
  const [state, setState] = useState<AppState>(() => startupLoad.state);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [saveError, setSaveError] = useState(desktop ? startupLoad.error ?? "" : "");
  const [desktopReady, setDesktopReady] = useState(() => !desktop);
  const [desktopLoadBlocked, setDesktopLoadBlocked] = useState(false);
  const [webReady, setWebReady] = useState(() => desktop);
  const [webLoadBlocked, setWebLoadBlocked] = useState(false);

  activeLanguage = state.settings.language;
  activeLocale = localeForLanguage(activeLanguage);
  setInterfaceLanguage(activeLanguage);
  const hasDemoItems = state.rules.some((item) => item.isDemo) || state.setups.some((item) => item.isDemo) || state.plans.some((item) => item.isDemo) || state.planTemplates.some((item) => item.isDemo) || state.studies.some((item) => item.isDemo) || state.journalTrades.some((item) => item.isDemo) || state.trainingRecords.some((item) => item.isDemo) || state.setupExamples.some((item) => item.isDemo);

  useEffect(() => {
    if (desktop) return;
    let active = true;

    void loadWebStatePayload()
      .then((json) => {
        if (!active) return;
        if (!json) {
          clearStorageLoadGuard();
          setState(ensureDemoData(initialState()));
          setSaveError("");
          setWebLoadBlocked(false);
          setWebReady(true);
          return;
        }

        const loaded = ensureDemoData(parseBackup(json));
        clearStorageLoadGuard();
        setState(loaded);
        setSaveError("");
        setWebLoadBlocked(false);
        setWebReady(true);
      })
      .catch((error) => {
        if (!active) return;
        const fallback = loadStateResult();
        setState(fallback.state);
        setWebLoadBlocked(true);
        setWebReady(false);
        setSaveError(`Modo protegido: os dados web não foram sobrescritos. ${error instanceof Error ? error.message : String(error)}`);
      });

    return () => { active = false; };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void loadDesktopState()
      .then(async (json) => {
        if (!active) return;

        if (json) {
          const loaded = ensureDemoData(parseBackup(json));
          setState(loaded);
          setSaveError("");
          setDesktopLoadBlocked(false);
          setDesktopReady(true);
          return;
        }

        if (startupLoad.error) {
          throw new Error(startupLoad.error);
        }

        const localState = ensureDemoData(startupLoad.state);
        const serialized = serializeState(localState);
        const result = await saveDesktopState(serialized, isoDateLocal());
        if (!active) return;
        setState(localState);
        setSaveError(result?.backupWarning ? `Dados salvos, mas o backup automático falhou: ${result.backupWarning}` : "");
        setDesktopLoadBlocked(false);
        setDesktopReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setDesktopLoadBlocked(true);
        setDesktopReady(false);
        setSaveError(`Modo protegido: os dados desktop não foram sobrescritos. ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => { active = false; };
  }, [startupLoad, desktop]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;

    if (desktop) {
      if (!desktopReady || desktopLoadBlocked) return;
      const timer = window.setTimeout(() => {
        const serialized = serializeState(state);
        void saveDesktopState(serialized, isoDateLocal())
          .then((result) => setSaveError(result?.backupWarning ? `Dados salvos, mas o backup automático falhou: ${result.backupWarning}` : ""))
          .catch((error) => setSaveError(error instanceof Error ? error.message : String(error)));
      }, 250);
      return () => window.clearTimeout(timer);
    }

    if (!webReady || webLoadBlocked) return;
    const timer = window.setTimeout(() => {
      const serialized = serializeState(state);
      void saveWebStateExternalized(serialized)
        .then(() => setSaveError(""))
        .catch((error) => setSaveError(error instanceof Error
          ? error.message
          : "O navegador não conseguiu salvar os dados. Exporte um backup antes de continuar."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state, desktopReady, desktopLoadBlocked, webReady, webLoadBlocked, desktop]);

  const nav: Array<[Tab, string, string]> = [
    ["dashboard", "Visão geral", "⌂"],
    ["system", "Sistema de trade", "◆"],
    ["plans", "Planos de trade", "▤"],
    ["studies", "Estudos", "▥"],
    ["history", "Histórico", "◫"],
    ["training", "Treinamento", "◎"],
    ["settings", "Configurações", "⚙"],
  ];

  return <div className="app-shell">
    <aside>
      <div className="brand"><div className="brand-mark"><img src="/trade-blueprint-mark.svg" alt="" /></div><div><strong>Trade Blueprint</strong><span>preparar • congelar • executar • revisar</span></div></div>
      <nav>{nav.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-foot"><span>Dados locais</span><b>schema v{state.schemaVersion}</b></div>
    </aside>
    <main>
      <header><div><span className="mobile-title">Trade Blueprint</span></div><div className="save-state"><span className={saveError ? "bad" : "good"}></span>{saveError || "Salvamento local automático"}</div></header>
      {hasDemoItems && <div className="demo-disclaimer">Itens marcados como <span className="badge demo">Exemplo</span> são fictícios e podem ser removidos individualmente.</div>}
      {saveError && (startupLoad.error || desktopLoadBlocked || webLoadBlocked) && <div className="storage-protection-banner"><div><b>Modo protegido de armazenamento</b><span>{saveError}</span></div><button onClick={() => setTab("settings")}>Abrir recuperação</button></div>}
      <div hidden={tab !== "dashboard"}><Dashboard state={state} onOpenPlans={() => setTab("plans")} onOpenSystem={() => setTab("system")} /></div>
      <div hidden={tab !== "system"}><SystemPage state={state} setState={setState} /></div>
      <div hidden={tab !== "plans"}><PlansPage state={state} setState={setState} /></div>
      <div hidden={tab !== "studies"}><StudiesPage state={state} setState={setState} /></div>
      <div hidden={tab !== "history"}><HistoryPage state={state} setState={setState} /></div>
      <div hidden={tab !== "training"}><TrainingPage state={state} setState={setState} /></div>
      <div hidden={tab !== "settings"}><SettingsPage state={state} setState={setState} /></div>
    </main>
  </div>;
}
