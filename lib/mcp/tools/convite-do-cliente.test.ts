/**
 * O AGENTE PÕE O CLIENTE NO CONVITE DO GOOGLE (`crm_add_contact_to_appointment_invite`).
 *
 * O cenário que esta ferramenta existe para resolver: a reunião já está marcada
 * e publicada no Google, o contato chegou pelo WhatsApp SEM e-mail, alguém pede o
 * e-mail na conversa e o cliente responde. Antes, o agente só conseguia PROPOR o
 * e-mail (uma pessoa confirmava depois) e nada levava o cliente ao convite — o
 * evento já publicado só ganha participante quando muda (doc 36).
 *
 * Os casos cobrem as três situações da ficha (vazia, igual, diferente), as
 * recusas (outra organização, anonimizado, e-mail inválido) e o elo com o Google
 * (o compromisso publicado ganha `guest_email`, que é o que o stamp SQL enxerga).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  alterar: vi.fn(),
  patchContato: vi.fn(),
  propor: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/app/api/v1/agenda/agendamentos/_handler", () => ({
  alterarAgendamentoHandler: deps.alterar,
}));
vi.mock("@/app/api/v1/contacts/_handler", () => ({ patchContactHandler: deps.patchContato }));
vi.mock("@/lib/contacts/proposta-de-dado", () => ({ proporDadoDoContato: deps.propor }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));

import { crmAddContactToAppointmentInvite } from "./convite-do-cliente";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const DONO = "33333333-3333-4333-8333-333333333333";
const COMPROMISSO = "44444444-4444-4444-8444-444444444444";
const FUTURO = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

type Linha = Record<string, unknown>;

/** PostgREST de mentira: aplica os filtros que a ferramenta usa sobre linhas em memória. */
function bancoFalso(tabelas: Record<string, Linha[]>) {
  return {
    from(tabela: string) {
      let linhas = [...(tabelas[tabela] ?? [])];
      let teto = Infinity;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((linhas = linhas.filter((l) => l[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((linhas = linhas.filter((l) => vs.includes(l[c]))), q),
        gte: (c: string, v: string) => ((linhas = linhas.filter((l) => String(l[c]) >= v)), q),
        order: () => q,
        limit: (n: number) => ((teto = n), q),
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
        then: (ok: (r: { data: Linha[]; error: null }) => unknown) =>
          Promise.resolve({ data: linhas.slice(0, teto), error: null }).then(ok),
      };
      return q;
    },
  };
}

function contexto(tabelas: Record<string, Linha[]>) {
  return {
    supabase: bancoFalso(tabelas),
    organizationId: ORG,
    actor: { type: "ai_agent", id: "alice" },
    requestId: "req-1",
  } as never;
}

const contato = (over: Linha = {}): Linha => ({
  id: CONTATO,
  organization_id: ORG,
  email: null,
  is_anonymized: false,
  ...over,
});

const compromissoPublicado = (over: Linha = {}): Linha => ({
  id: COMPROMISSO,
  organization_id: ORG,
  contact_id: CONTATO,
  owner_user_id: DONO,
  status: "confirmed",
  starts_at: FUTURO,
  time_zone: "America/Sao_Paulo",
  guest_email: null,
  google_event_id: "evento-google-1",
  ...over,
});

const ENTRADA = { contact_id: CONTATO, email: "Cliente@Exemplo.com.br " } as never;

beforeEach(() => {
  vi.clearAllMocks();
  deps.alterar.mockResolvedValue({ id: COMPROMISSO, revision: 2 });
  deps.patchContato.mockResolvedValue({ id: CONTATO, email: "cliente@exemplo.com.br" });
  deps.propor.mockResolvedValue({ criada: true, id: "prop-1", valorAnterior: "antigo@exemplo.com" });
});

describe("crm_add_contact_to_appointment_invite", () => {
  it("ficha SEM e-mail: grava o e-mail e o compromisso publicado entra na fila do Google", async () => {
    const ctx = contexto({ contacts: [contato()], calendar_appointments: [compromissoPublicado()] });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    // A ficha recebe o e-mail normalizado, pelo caminho que já audita a edição.
    expect(deps.patchContato).toHaveBeenCalledTimes(1);
    const [, ctxDoPatch, idDoPatch, patch] = deps.patchContato.mock.calls[0]!;
    expect(ctxDoPatch).toMatchObject({ organization_id: ORG, actor: { type: "ai_agent" } });
    expect(idDoPatch).toBe(CONTATO);
    expect(patch).toMatchObject({ email: "cliente@exemplo.com.br" });
    expect((patch as Linha).consent).toBeDefined();

    // O compromisso publicado ganha `guest_email` = o e-mail do cliente: é a
    // coluna que o stamp SQL enxerga, então ela dispara a ida ao Google.
    expect(deps.alterar).toHaveBeenCalledTimes(1);
    expect(deps.alterar.mock.calls[0]![2]).toEqual({
      id: COMPROMISSO,
      guest_email: "cliente@exemplo.com.br",
    });

    expect(r.email_gravado).toBe(true);
    expect(r.incluido_no_convite).toBe(true);
    // Nunca afirmar que o convite JÁ saiu: quem envia é a sincronização.
    expect(r.convite_enviado).toBe(false);
    expect(String(r.mensagem)).toMatch(/sincroniza/);
  });

  it("ficha com o MESMO e-mail: não reescreve a ficha, mas leva o cliente ao convite", async () => {
    const ctx = contexto({
      contacts: [contato({ email: "cliente@exemplo.com.br" })],
      calendar_appointments: [compromissoPublicado()],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(deps.patchContato).not.toHaveBeenCalled();
    expect(deps.alterar).toHaveBeenCalledTimes(1);
    expect(r.email_gravado).toBe(false);
    expect(r.incluido_no_convite).toBe(true);
  });

  it("ficha com e-mail DIFERENTE: não sobrescreve, cria proposta e não mexe no convite", async () => {
    const ctx = contexto({
      contacts: [contato({ email: "antigo@exemplo.com" })],
      calendar_appointments: [compromissoPublicado()],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(deps.patchContato).not.toHaveBeenCalled();
    expect(deps.alterar).not.toHaveBeenCalled();
    expect(deps.propor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG, contactId: CONTATO, campo: "email" }),
    );
    expect(r.email_gravado).toBe(false);
    expect(r.incluido_no_convite).toBe(false);
    expect(r.motivo).toBe("ficha_tem_outro_email");
    expect(r.proposta_criada).toBe(true);
  });

  it("contato de OUTRA organização: recusa sem gravar nada", async () => {
    const ctx = contexto({
      contacts: [contato({ organization_id: OUTRA_ORG })],
      calendar_appointments: [compromissoPublicado({ organization_id: OUTRA_ORG })],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(r.motivo).toBe("contato_nao_encontrado");
    expect(r.incluido_no_convite).toBe(false);
    expect(deps.patchContato).not.toHaveBeenCalled();
    expect(deps.alterar).not.toHaveBeenCalled();
    expect(deps.propor).not.toHaveBeenCalled();
  });

  it("contato anonimizado: recusa sem gravar nada", async () => {
    const ctx = contexto({
      contacts: [contato({ is_anonymized: true })],
      calendar_appointments: [compromissoPublicado()],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(r.motivo).toBe("contato_anonimizado");
    expect(deps.patchContato).not.toHaveBeenCalled();
    expect(deps.alterar).not.toHaveBeenCalled();
  });

  it("e-mail inválido: recusa e pede para confirmar com a pessoa", async () => {
    const ctx = contexto({ contacts: [contato()], calendar_appointments: [compromissoPublicado()] });

    const r = (await crmAddContactToAppointmentInvite.handler(
      { contact_id: CONTATO, email: "cliente arroba exemplo" } as never,
      ctx,
    )) as Linha;

    expect(r.motivo).toBe("email_invalido");
    expect(r.incluido_no_convite).toBe(false);
    expect(deps.patchContato).not.toHaveBeenCalled();
  });

  it("compromisso ainda não publicado com agenda Google ligada: a 1ª ida já leva o e-mail da ficha", async () => {
    const ctx = contexto({
      contacts: [contato()],
      calendar_appointments: [compromissoPublicado({ google_event_id: null })],
      calendar_connections: [{ id: "con-1", organization_id: ORG, user_id: DONO, status: "healthy" }],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    // Não precisa de `guest_email`: o POST monta os participantes da ficha.
    expect(deps.alterar).not.toHaveBeenCalled();
    expect(r.email_gravado).toBe(true);
    expect(r.incluido_no_convite).toBe(true);
  });

  it("agenda do atendente sem Google: o e-mail fica na ficha e a resposta não promete convite", async () => {
    const ctx = contexto({
      contacts: [contato()],
      calendar_appointments: [compromissoPublicado({ google_event_id: null })],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(r.email_gravado).toBe(true);
    expect(r.incluido_no_convite).toBe(false);
    expect(r.motivo).toBe("agenda_sem_google");
  });

  it("compromisso publicado que já tem OUTRO convidado: não troca o convidado", async () => {
    const ctx = contexto({
      contacts: [contato()],
      calendar_appointments: [compromissoPublicado({ guest_email: "consultor@empresa.com" })],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(deps.alterar).not.toHaveBeenCalled();
    expect(r.email_gravado).toBe(true);
    expect(r.incluido_no_convite).toBe(false);
    expect(r.motivo).toBe("convite_tem_outro_convidado");
  });

  it("sem compromisso futuro: grava o e-mail e diz que o próximo agendamento já convida", async () => {
    const ctx = contexto({ contacts: [contato()], calendar_appointments: [] });

    const r = (await crmAddContactToAppointmentInvite.handler(ENTRADA, ctx)) as Linha;

    expect(r.email_gravado).toBe(true);
    expect(r.incluido_no_convite).toBe(false);
    expect(r.motivo).toBe("sem_compromisso");
  });

  it("appointment_id de outro contato não é alcançado", async () => {
    const ctx = contexto({
      contacts: [contato()],
      calendar_appointments: [compromissoPublicado({ contact_id: "55555555-5555-4555-8555-555555555555" })],
    });

    const r = (await crmAddContactToAppointmentInvite.handler(
      { contact_id: CONTATO, email: "cliente@exemplo.com.br", appointment_id: COMPROMISSO } as never,
      ctx,
    )) as Linha;

    expect(deps.alterar).not.toHaveBeenCalled();
    expect(r.incluido_no_convite).toBe(false);
    expect(r.motivo).toBe("sem_compromisso");
  });
});
