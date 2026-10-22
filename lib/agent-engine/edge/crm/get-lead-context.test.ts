/**
 * `last_proposal` (N7) — o desfecho da última proposta com desfecho real no
 * contexto do turno, para o agente não oferecer de novo o que já foi recusado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLeadContext } from './get-lead-context';

// ─── last_proposal (N7) ─────────────────────────────────────────────────────

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

interface MundoOpts {
  /** Linhas que a query de crm_proposals devolve. `undefined` = a query lança. */
  propostas?: Array<Record<string, unknown>>;
  /** Linhas do histórico que a query de `messages` devolve (mais nova primeiro, como o SQL). */
  mensagens?: Array<Record<string, unknown>>;
}

function montarDb(opts: MundoOpts = {}) {
  const consultas: string[] = [];
  const db = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: vi.fn(async (sql: string, _params: any[]) => {
      consultas.push(sql);
      if (sql.includes("from contacts")) {
        return {
          rows: [{
            name: "Cliente", display_name: null, email: null, phone_number: "5511",
            tags: [], is_blocked: false, source: "whatsapp", consent: null, is_anonymized: false,
          }],
        };
      }
      if (sql.includes("crm_lead_activities")) return { rows: [] };
      if (sql.includes("from messages")) return { rows: opts.mensagens ?? [] };
      if (sql.includes("from demandas")) return { rows: [] };
      if (sql.includes("from crm_proposals")) {
        if (opts.propostas === undefined) throw new Error("relation crm_proposals does not exist");
        return { rows: opts.propostas };
      }
      // O contexto também pode consultar `crm_leads` — sem negócio aberto,
      // o que estes casos não medem.
      if (sql.includes("from crm_leads")) return { rows: [] };
      throw new Error(`query não mockada: ${sql.slice(0, 60)}`);
    }),
  };
  return { db, consultas };
}

const INPUT = { tenantId: TENANT_ID, leadId: CONTACT_ID, conversationId: "conv-1", fuso: "America/Sao_Paulo" };
const KNOBS = { historyLimit: 20, maxTokens: 1000 };

describe("getLeadContext — last_proposal (N7)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("negócio com proposta RECUSADA: last_proposal reflete status e motivo (N7)", async () => {
    const { db } = montarDb({
      propostas: [{ status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026 }],
    });
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context.last_proposal).toEqual({
        status: "recusada", total_cents: 50000, decision_reason: "Preço acima do orçamento", numero: 1, ano: 2026,
      });
    }
  });

  it("negócio SEM nenhuma proposta com desfecho: last_proposal é null", async () => {
    const { db, consultas } = montarDb({ propostas: [] });
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.context.last_proposal).toBeNull();
    // rascunho nunca é desfecho: a query só admite os 4 status com desfecho
    // real, no SQL (allowlist, não blocklist — status futuro não vaza).
    const sqlPropostas = consultas.find((s) => s.includes("from crm_proposals")) ?? "";
    expect(sqlPropostas).toMatch(/status in \('enviada', 'aceita', 'recusada', 'vencida'\)/);
  });

  it("query de crm_proposals falha: last_proposal null, o resto do contexto SEGUE montando (falha aberta)", async () => {
    const { db } = montarDb();
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context.last_proposal).toBeNull();
      expect(r.context.contact).toBeDefined();
    }
  });
});


// ─── autoria da fala: a equipe humana não é "nós" do agente ────────────────

function linhaDeMensagem(extra: Record<string, unknown>) {
  return {
    direction: "outbound", type: "text", body: "texto", media_url: null,
    media_storage_path: null, media_mime: null, media_derived_text: null,
    sent_at: new Date("2026-10-20T12:00:00Z"), sent_via: "ai", sent_by_user_id: null,
    ...extra,
  };
}

describe("getLeadContext — autor das mensagens outbound", () => {
  beforeEach(() => vi.restoreAllMocks());

  async function marcas(mensagens: Array<Record<string, unknown>>) {
    const { db } = montarDb({ propostas: [], mensagens });
    const r = await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    if (!r.ok) throw new Error("contexto não veio");
    return r.context.messages.map((m) => (m as { autor?: string }).autor);
  }

  it("o SQL do histórico pede sent_via e sent_by_user_id", async () => {
    const { db, consultas } = montarDb({ propostas: [], mensagens: [] });
    await getLeadContext(db as never, {} as never, INPUT, KNOBS);
    const sql = consultas.find((q) => q.includes("from messages"))!;
    expect(sql).toContain("sent_via");
    expect(sql).toContain("sent_by_user_id");
  });

  it("outbound de aparelho externo (humano no celular da empresa) vira autor 'equipe'", async () => {
    expect(await marcas([linhaDeMensagem({ sent_via: "external_device" })])).toEqual(["equipe"]);
  });

  it("outbound enviado por usuário no Inbox (sent_by_user_id) vira autor 'equipe'", async () => {
    expect(
      await marcas([linhaDeMensagem({ sent_via: "user", sent_by_user_id: "u-1" })]),
    ).toEqual(["equipe"]);
    // sent_by_user_id sozinho basta, qualquer que seja o canal gravado
    expect(
      await marcas([linhaDeMensagem({ sent_via: "crm", sent_by_user_id: "u-1" })]),
    ).toEqual(["equipe"]);
  });

  it("outbound da IA, automação e sistema continuam sem autor — a ausência de ai_actor_id não decide", async () => {
    expect(
      await marcas([
        linhaDeMensagem({ sent_via: "ai" }),
        linhaDeMensagem({ sent_via: "automation" }),
        linhaDeMensagem({ sent_via: "system" }),
      ]),
    ).toEqual([undefined, undefined, undefined]);
  });

  it("inbound nunca ganha autor, mesmo com sent_via estranho", async () => {
    expect(
      await marcas([linhaDeMensagem({ direction: "inbound", sent_via: "external_device" })]),
    ).toEqual([undefined]);
  });
});
