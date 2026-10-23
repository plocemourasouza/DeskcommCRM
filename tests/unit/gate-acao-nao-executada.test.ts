import fs from "node:fs";
import path from "node:path";

import type pg from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  BEFORE_SEND_GATES,
  acaoNaoExecutadaGate,
  agendaStallGate,
  disclosureGate,
  evaluateBeforeSend,
  runBeforeSend,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";
import {
  MAX_VETOS_DE_ACAO_NAO_EXECUTADA,
  decidirFailSafeDaAcaoAfirmada,
} from "@/lib/agent-engine/guardrails/acao-afirmada";
import type { Logger } from "@/lib/agent-engine/obs/logger";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";

/**
 * O GATE `acao_nao_executada`: o agente não pode dizer ao cliente que FEZ algo
 * ("e-mail registrado", "agendei", "cancelei", "passei para a equipe") sem que a
 * ferramenta tenha feito com sucesso neste turno. O detector tem os casos dele em
 * `lib/agent-engine/guardrails/acao-afirmada.test.ts`; aqui: gate, cadeia real,
 * fiação no turno e o fail-safe.
 */
function baseCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    now: new Date("2026-10-22T12:00:00Z"),
    body: "",
    optedOut: false,
    provider: "waha",
    pacing: {
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 0, numberActivatedAt: null },
      crmDailyLimit: null,
    },
    spinning: { knobs: SPINNING_DEFAULTS, window: [] },
    promise: { table: null },
    semanticPromise: null,
    disclosure: { template: null, isFirstOutbound: false, mode: "inject" },
    lgpd: null,
    casesEnabled: false,
    hasOpenCase: false,
    openedCaseThisTurn: false,
    ...overrides,
  };
}

const WILLIAN = "Anotado, Willian! E-mail registrado. 👍";
const armado = (modo: "observar" | "bloquear", comprovantes: string[] = []) => ({
  acaoAfirmada: { modo, comprovantes, temCompromissoFuturo: false },
});

describe("acaoNaoExecutadaGate", () => {
  it("bloquear: veta o caso medido em produção, ensinando o que fazer", () => {
    const v = acaoNaoExecutadaGate.evaluate(baseCtx({ body: WILLIAN, ...armado("bloquear") }));
    expect(v.pass).toBe(false);
    if (v.pass) throw new Error("inalcançável");
    expect(v.code).toBe("acao_nao_executada");
    expect(v.reason).toMatch(/sem que a ferramenta tenha feito isso neste turno/);
    expect(v.reason).toMatch(/Chame a ferramenta e responda com base no retorno dela/);
    expect(v.detail).toEqual({ categorias: "dado_gravado" });
  });

  it.each([
    "Prontinho, já agendei para segunda às 15h",
    "Cancelei sua reunião",
    "Convite enviado para seu e-mail",
    "Já passei para a equipe, logo te chamam",
  ])("bloquear: veta sem ferramenta — %s", (body) => {
    expect(acaoNaoExecutadaGate.evaluate(baseCtx({ body, ...armado("bloquear") })).pass).toBe(false);
  });

  it("bloquear: passa quando a ferramenta comprovou", () => {
    const v = acaoNaoExecutadaGate.evaluate(
      baseCtx({ body: "Prontinho, já agendei para segunda às 15h", ...armado("bloquear", ["crm_book_appointment"]) }),
    );
    expect(v).toEqual({ pass: true });
  });

  it("observar: NUNCA veta, e deixa a observação no trace — só a categoria, nunca o texto", () => {
    const v = acaoNaoExecutadaGate.evaluate(baseCtx({ body: WILLIAN, ...armado("observar") }));
    expect(v.pass).toBe(true);
    if (!v.pass) throw new Error("inalcançável");
    expect(v.observacao).toEqual({ code: "acao_nao_executada_observada", detail: { categorias: "dado_gravado" } });
    expect(JSON.stringify(v)).not.toMatch(/Willian|registrado/);
  });

  it("observar: sem afirmação, passa sem observação", () => {
    expect(acaoNaoExecutadaGate.evaluate(baseCtx({ body: "Anotado!", ...armado("observar") }))).toEqual({
      pass: true,
    });
  });

  it("DESARMADO (campo ausente) é no-op — follow-up, template e resposta aprovada não sentem nada", () => {
    expect(acaoNaoExecutadaGate.evaluate(baseCtx({ body: WILLIAN }))).toEqual({ pass: true });
  });

  it("caso aberto (antes ou neste turno) comprova 'passei para a equipe'", () => {
    const body = "Já passei para a equipe, logo te chamam";
    expect(acaoNaoExecutadaGate.evaluate(baseCtx({ body, hasOpenCase: true, ...armado("bloquear") })).pass).toBe(true);
    expect(
      acaoNaoExecutadaGate.evaluate(baseCtx({ body, openedCaseThisTurn: true, ...armado("bloquear") })).pass,
    ).toBe(true);
  });

  it("os nomes da retaguarda do prompt valem como equipe", () => {
    const body = "Já avisei o Paulo, ele te responde.";
    const v = acaoNaoExecutadaGate.evaluate(
      baseCtx({ body, humanPromiseExtraTargets: ["Paulo"], ...armado("bloquear") }),
    );
    expect(v.pass).toBe(false);
  });
});

describe("posição na cadeia", () => {
  it("está na cadeia global, depois do agenda_stall e antes do disclosure", () => {
    const nomes = BEFORE_SEND_GATES.map((g) => g.name);
    expect(BEFORE_SEND_GATES).toContain(acaoNaoExecutadaGate);
    expect(nomes.indexOf("acao_nao_executada")).toBe(nomes.indexOf(agendaStallGate.name) + 1);
    expect(nomes.indexOf("acao_nao_executada")).toBe(nomes.indexOf(disclosureGate.name) - 1);
  });

  it("o agenda_stall veta primeiro o que é dele — nunca dois vetos na mesma tentativa", () => {
    const r = evaluateBeforeSend(
      baseCtx({
        body: "Seu horário está confirmado para amanhã às 9h.",
        agenda: { active: true, ferramentas: ["crm_book_appointment"], toolCalledThisTurn: false },
        ...armado("bloquear"),
      }),
    );
    expect(r.veto?.gate).toBe("agenda_stall");
    expect(r.trace).toContainEqual({ gate: "acao_nao_executada", verdict: "skipped" });
  });

  it("a ferramenta de agenda chamada e FALHA: o agenda_stall deixa passar, este pega", () => {
    // agenda_stall aceita "chamou" mesmo que a chamada tenha falhado; este gate
    // só aceita comprovante — e marcado:false não comprova.
    const r = evaluateBeforeSend(
      baseCtx({
        body: "Prontinho, já agendei para segunda às 15h",
        agenda: { active: true, ferramentas: ["crm_book_appointment"], toolCalledThisTurn: true },
        ...armado("bloquear", []),
      }),
    );
    expect(r.veto?.gate).toBe("acao_nao_executada");
  });

  it("observar: a observação chega ao trace com código e categoria", () => {
    const r = evaluateBeforeSend(baseCtx({ body: WILLIAN, ...armado("observar") }));
    expect(r.veto).toBeNull();
    expect(r.trace).toContainEqual({
      gate: "acao_nao_executada",
      verdict: "pass",
      code: "acao_nao_executada_observada",
      detail: { categorias: "dado_gravado" },
    });
  });
});

const COMERCIAL = new Date("2026-07-28T13:00:00Z"); // 10h BRT, terça — dentro da janela

function chamaCadeiaReal(modo: "observar" | "bloquear") {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  const inserts = vi.fn().mockResolvedValue({ rows: [{ id: "trace-1" }] });
  const pool = { connect: vi.fn().mockResolvedValue(client), query: inserts } as unknown as pg.Pool;
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const send = vi.fn().mockResolvedValue({ kind: "sent", idempotencyKey: "k", messageId: "m" });
  return {
    inserts,
    send,
    run: runBeforeSend({
      pool,
      log,
      tenantId: "00000000-0000-4000-8000-000000000001",
      leadId: "00000000-0000-4000-8000-000000000002",
      jobId: "00000000-0000-4000-8000-000000000003",
      channelSessionId: "00000000-0000-4000-8000-000000000004",
      body: WILLIAN,
      optedOutThisTurn: false,
      crmDailyLimit: null,
      now: COMERCIAL,
      rng: () => 0,
      sleep: async () => {},
      acaoAfirmada: { modo, comprovantes: [], temCompromissoFuturo: false },
      send,
    }),
  };
}

describe("a cadeia REAL", () => {
  it("bloquear: não envia, e o veto vai para before_send_traces", async () => {
    const { run, send, inserts } = chamaCadeiaReal("bloquear");
    const r = await run;
    expect(r.status).toBe("vetoed");
    if (r.status !== "vetoed") throw new Error("inalcançável");
    expect(r.gate).toBe("acao_nao_executada");
    expect(send).not.toHaveBeenCalled();
    expect(String(inserts.mock.calls[0]?.[0] ?? "")).toMatch(/insert into before_send_traces/);
  });

  it("observar: envia o MESMO corpo, e a observação fica no trace persistido", async () => {
    const { run, send, inserts } = chamaCadeiaReal("observar");
    const r = await run;
    expect(r.status).toBe("sent");
    expect(send).toHaveBeenCalledWith(WILLIAN);
    const traceGravado = String(inserts.mock.calls[0]?.[1]?.[4] ?? "");
    expect(traceGravado).toMatch(/acao_nao_executada_observada/);
    expect(traceGravado).not.toMatch(/Willian/);
  });
});

describe("fail-safe (camada 3) — só no modo bloquear", () => {
  it("1º veto ensina; deixa ao menos uma chance de reescrita", () => {
    expect(MAX_VETOS_DE_ACAO_NAO_EXECUTADA).toBeGreaterThanOrEqual(2);
    expect(decidirFailSafeDaAcaoAfirmada({ vetos: 1, casosLigados: true, casoAberto: false })).toBe("ensinar");
  });

  it("2º veto com casos ligados e sem caso: abre caso e responde com honestidade", () => {
    expect(decidirFailSafeDaAcaoAfirmada({ vetos: 2, casosLigados: true, casoAberto: false })).toBe(
      "abrir_caso_e_responder",
    );
  });

  it("2º veto sem casos (ou com caso já aberto): continua barrando, com ensino mais duro", () => {
    expect(decidirFailSafeDaAcaoAfirmada({ vetos: 2, casosLigados: false, casoAberto: false })).toBe(
      "ensinar_sem_afirmar",
    );
    expect(decidirFailSafeDaAcaoAfirmada({ vetos: 3, casosLigados: true, casoAberto: true })).toBe(
      "ensinar_sem_afirmar",
    );
  });
});

/**
 * FIAÇÃO — asserção sobre a FONTE, como em `gate-afirmacao-clinica.test.ts`: o turno
 * não tem seam isolável. Guarda de ligação, não prova ponta a ponta.
 */
const FONTE_INBOUND = fs.readFileSync(path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");
const FONTE_FOLLOWUP = fs.readFileSync(path.join(process.cwd(), "lib/agent-engine/agent/followup-turn.ts"), "utf8");
const FONTE_PREVIEW = fs.readFileSync(path.join(process.cwd(), "lib/agent-engine/agent/preview.ts"), "utf8");

function corpoDoSendMessage(): string {
  const i = FONTE_INBOUND.indexOf("send_message: tool({");
  const j = FONTE_INBOUND.indexOf("update_lead_state: tool({", i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return FONTE_INBOUND.slice(i, j);
}

describe("fiação no turno", () => {
  it("send_message arma o gate com o modo da organização e os comprovantes do turno", () => {
    const corpo = corpoDoSendMessage();
    expect(corpo).toMatch(/acaoAfirmada:\s*\{/);
    expect(corpo).toMatch(/modo:\s*modoDaAcaoAfirmada/);
    expect(corpo).toMatch(/comprovantes:\s*\[\.\.\.comprovantesDoTurno\]/);
  });

  it("os comprovantes nascem do RESULTADO de cada ferramenta, não da decisão de chamá-la", () => {
    // `registrarComprovantes` (coberto em `acao-afirmada.test.ts`) envolve as tools POR
    // FORA do disjuntor: chamada barrada por ele volta `ok: false` e não comprova.
    expect(FONTE_INBOUND).toMatch(/registrarComprovantes\(\s*wrapToolsWithBreaker\(/);
  });

  it("o fail-safe mora no send_message e só abre caso pela decisão pura", () => {
    const corpo = corpoDoSendMessage();
    expect(corpo).toMatch(/chain\.code === CODIGO_ACAO_NAO_EXECUTADA/);
    expect(corpo).toMatch(/decidirFailSafeDaAcaoAfirmada\(/);
    const bloco = corpo.slice(corpo.indexOf("chain.code === CODIGO_ACAO_NAO_EXECUTADA"));
    expect(bloco.slice(0, bloco.indexOf("internal_vocabulary_leak"))).toMatch(/openCase\(/);
  });

  it("o follow-up determinístico NÃO arma — lá o veto seria drop silencioso", () => {
    expect(FONTE_FOLLOWUP).not.toMatch(/acaoAfirmada/);
  });

  it("send_template NÃO arma", () => {
    const i = FONTE_INBOUND.indexOf("send_template: tool({");
    const j = FONTE_INBOUND.indexOf("search_knowledge: tool({", i);
    expect(FONTE_INBOUND.slice(i, j)).not.toMatch(/acaoAfirmada/);
  });

  it("a prévia arma igual ao turno real, com o modo da organização", () => {
    expect(FONTE_PREVIEW).toMatch(/lerModoDaAcaoAfirmadaDaOrg/);
    expect(FONTE_PREVIEW).toMatch(/acaoAfirmada:/);
  });
});
