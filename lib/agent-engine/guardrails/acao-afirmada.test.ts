import { describe, expect, it } from "vitest";

import {
  FERRAMENTAS_QUE_COMPROVAM,
  RESPOSTA_HONESTA_DA_ACAO,
  acoesNaoComprovadas,
  comprovantesDoResultado,
  detectarAcoesAfirmadas,
  lerModoDaAcaoAfirmada,
  registrarComprovantes,
} from "./acao-afirmada";

/**
 * O DETECTOR de ação afirmada e o PREDICADO de sucesso. O gate, a cadeia real, a
 * fiação no turno e o fail-safe estão em `tests/unit/gate-acao-nao-executada.test.ts`.
 *
 * As frases que DEVEM ser pegas abrem com a medida em produção (2026-10-22): o
 * cliente mandou o e-mail, o agente não tinha ferramenta para gravá-lo e respondeu
 * "Anotado, Willian! E-mail registrado. 👍".
 */

const nada = { comprovantes: [] as string[], casoAberto: false, temCompromissoFuturo: false };

describe("detectarAcoesAfirmadas — o que o texto AFIRMA ter feito", () => {
  it.each([
    ["Anotado, Willian! E-mail registrado. 👍", "dado_gravado"],
    ["Anotei seu e-mail aqui, obrigado!", "dado_gravado"],
    ["Cadastro atualizado com sucesso.", "dado_gravado"],
    ["Pronto, salvei seu contato.", "dado_gravado"],
    ["Prontinho, já agendei para segunda às 15h", "agendamento"],
    ["Marquei sua consulta para amanhã às 9h.", "agendamento"],
    ["Seu horário está confirmado para segunda às 15h.", "agendamento"],
    ["Remarquei sua reunião para quinta.", "remarcacao"],
    ["Cancelei sua reunião", "cancelamento"],
    ["Desmarquei o seu horário de amanhã.", "cancelamento"],
    ["Convite enviado para seu e-mail", "convite"],
    ["Te incluí no convite da reunião.", "convite"],
    ["O convite vai chegar no seu e-mail.", "convite"],
    ["Já passei para a equipe, logo te chamam", "equipe_acionada"],
    ["Encaminhei seu pedido para o financeiro.", "equipe_acionada"],
    ["Já avisei a equipe sobre o seu caso.", "equipe_acionada"],
    ["Movi sua proposta para a próxima etapa.", "funil"],
    ["Atualizei seu pedido aqui.", "funil"],
  ])("pega: %s", (frase, categoria) => {
    expect(detectarAcoesAfirmadas(frase).map((a) => a.categoria)).toContain(categoria);
  });

  it("nomes que o prompt usa para a retaguarda contam como equipe ('já avisei o Paulo')", () => {
    expect(detectarAcoesAfirmadas("Já avisei o Paulo, ele te responde.").map((a) => a.categoria)).toEqual([]);
    expect(
      detectarAcoesAfirmadas("Já avisei o Paulo, ele te responde.", { alvosHumanos: ["Paulo"] }).map(
        (a) => a.categoria,
      ),
    ).toContain("equipe_acionada");
  });

  it.each([
    "Anotado!",
    "Perfeito, obrigado pela informação.",
    "Posso agendar para segunda?",
    "Vou agendar para segunda às 15h e já te confirmo.",
    "Quer que eu marque para amanhã?",
    "Seu e-mail está cadastrado?",
    "Ainda não agendei nada, me diga o melhor dia.",
    "Se você confirmar, fica agendado para segunda.",
    "Registrei aqui o que você contou.",
    "Vou passar para a equipe.",
    "O valor está confirmado: R$ 120.",
  ])("NÃO pega: %s", (frase) => {
    expect(detectarAcoesAfirmadas(frase)).toEqual([]);
  });
});

describe("acoesNaoComprovadas — afirmou sem a ferramenta ter feito", () => {
  it("o caso medido em produção é pego sem ferramenta nenhuma", () => {
    expect(acoesNaoComprovadas("Anotado, Willian! E-mail registrado. 👍", nada)).toEqual(["dado_gravado"]);
  });

  it.each([
    ["Anotado, Willian! E-mail registrado. 👍", "crm_add_contact_to_appointment_invite"],
    ["Prontinho, já agendei para segunda às 15h", "crm_book_appointment"],
    ["Prontinho, já agendei para segunda às 15h", "crm_find_and_book_appointment"],
    ["Cancelei sua reunião", "crm_cancel_appointment"],
    ["Convite enviado para seu e-mail", "crm_add_contact_to_appointment_invite"],
    ["Já passei para a equipe, logo te chamam", "open_human_case"],
    ["Já passei para a equipe, logo te chamam", "request_human_handoff"],
    ["Movi sua proposta para a próxima etapa.", "crm_move_lead_stage"],
  ])("passa com a ferramenta certa: %s + %s", (frase, ferramenta) => {
    expect(acoesNaoComprovadas(frase, { ...nada, comprovantes: [ferramenta] })).toEqual([]);
  });

  it("ferramenta de OUTRA categoria não comprova ('agendei' + só consultou horários)", () => {
    expect(
      acoesNaoComprovadas("Prontinho, já agendei para segunda às 15h", {
        ...nada,
        comprovantes: ["crm_find_free_slots"],
      }),
    ).toEqual(["agendamento"]);
  });

  it("PROPOSTA de campo não é gravação: crm_propose_contact_field não comprova 'e-mail registrado'", () => {
    for (const lista of Object.values(FERRAMENTAS_QUE_COMPROVAM)) {
      expect(lista).not.toContain("crm_propose_contact_field");
    }
    expect(
      acoesNaoComprovadas("E-mail registrado!", { ...nada, comprovantes: ["crm_propose_contact_field"] }),
    ).toEqual(["dado_gravado"]);
  });

  it("caso humano JÁ aberto comprova 'passei para a equipe'", () => {
    expect(acoesNaoComprovadas("Já passei para a equipe.", { ...nada, casoAberto: true })).toEqual([]);
  });

  it("compromisso futuro já existente comprova a forma de ESTADO, não a de primeira pessoa", () => {
    const comCompromisso = { ...nada, temCompromissoFuturo: true };
    expect(acoesNaoComprovadas("Sua reunião está confirmada para segunda às 15h.", comCompromisso)).toEqual([]);
    expect(acoesNaoComprovadas("Prontinho, já agendei para segunda às 15h", comCompromisso)).toEqual([
      "agendamento",
    ]);
  });
});

describe("comprovantesDoResultado — o predicado de sucesso", () => {
  it("retorno comum, sem marca de erro, comprova a própria ferramenta", () => {
    expect(comprovantesDoResultado("crm_cancel_appointment", { cancelado: true, compromisso: {} })).toEqual([
      "crm_cancel_appointment",
    ]);
    expect(comprovantesDoResultado("open_human_case", { ok: true, case_id: "c1" })).toEqual(["open_human_case"]);
  });

  it.each([
    ["ok:false", { ok: false, error: { code: "x", message: "y" } }],
    ["error", { error: "Role insufficient" }],
    ["permitido:false", { permitido: false, motivo: "outro_contato" }],
    ["resultado_incerto", { error: "x", resultado_incerto: true }],
    ["marcado:false", { marcado: false, motivo: "agenda_conflito", mensagem: "m" }],
    ["cancelado:false", { cancelado: false, motivo: "not_found", mensagem: "m" }],
    ["incluido_no_convite:false", { email_gravado: false, incluido_no_convite: false, motivo: "sem_compromisso" }],
    ["proposta_criada:false", { proposta_criada: false, motivo: "x" }],
    ["criada:false", { criada: false }],
    ["nulo", null],
    ["indefinido", undefined],
  ])("chamada que FALHOU não comprova (%s)", (_rotulo, resultado) => {
    expect(comprovantesDoResultado("crm_book_appointment", resultado)).toEqual([]);
  });

  it("convite recusado MAS e-mail gravado: comprova o dado, não o convite", () => {
    const r = { email_gravado: true, incluido_no_convite: false, motivo: "sem_compromisso" };
    const comprovantes = comprovantesDoResultado("crm_add_contact_to_appointment_invite", r);
    expect(acoesNaoComprovadas("E-mail registrado!", { ...nada, comprovantes })).toEqual([]);
    expect(acoesNaoComprovadas("Convite enviado para seu e-mail.", { ...nada, comprovantes })).toEqual(["convite"]);
  });

  it("na prévia a escrita vira proposta — e a prévia julga como a produção julgaria", () => {
    expect(
      comprovantesDoResultado("crm_book_appointment", { ok: true, status: "proposal_only", message: "m" }),
    ).toEqual(["crm_book_appointment"]);
  });
});

describe("lerModoDaAcaoAfirmada — o knob da organização", () => {
  it("ausente, nulo ou inválido = observar (o padrão seguro)", () => {
    expect(lerModoDaAcaoAfirmada(null)).toBe("observar");
    expect(lerModoDaAcaoAfirmada({})).toBe("observar");
    expect(lerModoDaAcaoAfirmada({ agente: { acao_afirmada_modo: "vetar" } })).toBe("observar");
    expect(lerModoDaAcaoAfirmada({ agente: "x" })).toBe("observar");
  });

  it("bloquear só quando escrito", () => {
    expect(lerModoDaAcaoAfirmada({ agente: { acao_afirmada_modo: "bloquear" } })).toBe("bloquear");
  });
});

describe("registrarComprovantes — o que as ferramentas do turno comprovaram", () => {
  it("registra pelo RETORNO de cada execução, e não altera o retorno", async () => {
    const destino: string[] = [];
    const tools = registrarComprovantes(
      {
        crm_book_appointment: { description: "x", execute: async () => ({ marcado: false, motivo: "conflito" }) },
        crm_cancel_appointment: { description: "y", execute: async () => ({ cancelado: true }) },
        sem_execute: { description: "z" },
      },
      destino,
    );
    expect(await tools.crm_book_appointment.execute()).toEqual({ marcado: false, motivo: "conflito" });
    expect(destino).toEqual([]);
    expect(await tools.crm_cancel_appointment.execute()).toEqual({ cancelado: true });
    expect(destino).toEqual(["crm_cancel_appointment"]);
    expect(tools.sem_execute).toEqual({ description: "z" });
  });

  it("execução que LANÇA não comprova, e o erro sobe intacto", async () => {
    const destino: string[] = [];
    const tools = registrarComprovantes(
      { crm_book_appointment: { execute: async () => { throw new Error("boom"); } } },
      destino,
    );
    await expect(tools.crm_book_appointment.execute()).rejects.toThrow("boom");
    expect(destino).toEqual([]);
  });
});

describe("a resposta honesta do fail-safe não afirma ação nenhuma", () => {
  it("passa pelo detector sem nada a comprovar", () => {
    expect(detectarAcoesAfirmadas(RESPOSTA_HONESTA_DA_ACAO)).toEqual([]);
  });
});
