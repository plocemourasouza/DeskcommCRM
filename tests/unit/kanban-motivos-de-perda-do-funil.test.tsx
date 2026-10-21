/**
 * OS MOTIVOS DE PERDA QUE O FUNIL OFERECE — a janela tem de mostrar os DELES.
 *
 * ─── O defeito que esta cerca fecha ──────────────────────────────────────
 *
 * `settings.lost_reasons` é a lista que o operador cadastra em Funis, e o
 * servidor já a respeita: `fn_validate_lost_reason_required` aceita canônico ∪
 * cadastrado. A janela de perder, sozinha, renderizava sempre o padrão do
 * produto. Medido antes de escrever, na base 54530c9f:
 *
 *     grep -n "lost_reasons" components/kanban/LoseLeadDialog.tsx   # zero
 *
 * Consequência: quem cadastrou "Sem orçamento" não via o próprio motivo na
 * tela, digitava à mão ("Outro") e descobria no clique se o funil daquele card
 * aceitava — com 22023 para o que não aceitava.
 *
 * ─── O que cada caso mede ────────────────────────────────────────────────
 *
 * O primeiro caso é o defeito: a lista não é a do produto, é a do funil. O
 * segundo prova que o motivo escolhido CHEGA no endpoint, com o texto dele. O
 * terceiro é o "Outro": vazio grava `other`, e com detalhe livre grava `other`
 * E leva o detalhe à parte — nunca o detalhe como motivo, que o trigger recusa
 * (medido em 2026-10-21: era o beco sem saída da tela). O quarto é a volta: sem nada
 * cadastrado, o padrão do produto e o `other` vazio continuam como sempre
 * foram — a correção não pode ter consertado um caso quebrando o outro.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoseLeadDialog } from "@/components/kanban/LoseLeadDialog";
import { chaveDoQuadro } from "@/hooks/kanban/useBoard";
import { CANONICAL_LOST_REASONS } from "@/lib/schemas/leads";
import { motivoEscolhidoNaPerda, motivosDoFunil } from "@/lib/leads/motivos-de-perda-do-funil";
import { MOTIVO_DA_TRANSFERENCIA } from "@/lib/leads/motivo-da-perda";
import type { BoardData } from "@/lib/kanban/types";

const { apiPost } = vi.hoisted(() => ({
  // `unknown[]` nos parâmetros de propósito: o mock é chamado com dois argumentos
  // (rota e corpo) e um `vi.fn()` sem parâmetro nenhum reprova o typecheck (TS2554).
  apiPost: vi.fn(async (..._args: unknown[]) => ({ data: {} })),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => apiPost(...(args as [string, unknown])),
    patch: vi.fn(async () => ({ data: {} })),
    get: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/kanban/local-echo", () => ({
  marcarEcoLocal: vi.fn(),
  liberarEcoLocal: vi.fn(),
  ehEcoLocal: () => false,
}));

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
}

const PIL = "funil-da-918";
const LEAD = "lead-da-918";

afterEach(() => {
  cleanup();
  apiPost.mockClear();
});

/** Um cliente novo por caso: cache compartilhada entre casos esconderia o defeito. */
function comFunil(settings: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // A MESMA chave que `useBoard` usa. Escrevendo a literal aqui, mudar a chave do
  // quadro deixaria o hook devolvendo `[]` — a janela voltaria ao padrão do
  // produto, o defeito da #918 — com estes casos verdes.
  qc.setQueryData(chaveDoQuadro(PIL), { pipeline: { settings } } as unknown as BoardData);
  return qc;
}

function abrir(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <LoseLeadDialog open onOpenChange={() => {}} leadId={LEAD} pipelineId={PIL} />
    </QueryClientProvider>,
  );
}

/** Pelas VALUES, não pelos rótulos: o valor é o contrato com o servidor. */
const valuesDosMotivos = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('input[name="lost-reason"]')).map((r) => r.value);

const radio = (valor: string) =>
  document.querySelector<HTMLInputElement>(`input[name="lost-reason"][value="${valor}"]`)!;

const confirmar = () => screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement;

describe("motivos de perda configurados no funil", () => {
  it("oferece os CADASTRADOS no funil e some com o padrão do produto", () => {
    abrir(comFunil({ lost_reasons: ["Sem orçamento", "Fora do perfil"] }));

    expect(valuesDosMotivos()).toEqual(["Sem orçamento", "Fora do perfil", "other"]);
    // O padrão do produto não pode sobrar: motivo que o funil não tem é 22023 na cara do operador.
    expect(screen.queryByText("Falha no pagamento")).toBeNull();
  });

  it("grava o motivo do funil escolhido, com o texto dele", async () => {
    abrir(comFunil({ lost_reasons: ["Sem orçamento", "Fora do perfil"] }));

    fireEvent.click(radio("Fora do perfil"));
    fireEvent.click(confirmar());

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, {
      lost_reason: "Fora do perfil",
    });
  });

  it("⭐ com funil configurado, 'Outro' SEM detalhe grava `other` — o escape que o servidor aceita", async () => {
    // `other` é CANÔNICO (`v_canonical` em `fn_validate_lost_reason_required`),
    // então o trigger o aceita em qualquer funil. Exigir o detalhe aqui fazia da
    // opção um beco sem saída: os únicos textos aceitos eram os rádios ao lado, e
    // cadastrar um motivo novo é admin-only — um `agent` com uma perda fora da
    // lista não tinha ação correta nenhuma.
    abrir(comFunil({ lost_reasons: ["Sem orçamento"] }));

    fireEvent.click(radio("other"));
    expect(confirmar().disabled).toBe(false);

    fireEvent.click(confirmar());
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, { lost_reason: "other" });
  });

  it("⭐ 2026-10-21: com funil configurado, 'Outro' + detalhe livre GRAVA `other` e leva o detalhe junto", async () => {
    // O defeito medido: o detalhe digitado ia COMO `lost_reason`, e o trigger
    // `fn_validate_lost_reason_required` só aceita canônico ∪ cadastrado — então
    // todo texto livre era recusado ("Esse motivo de perda não está na lista…") e
    // o "Confirmar" ficava desligado. "Outro" com detalhe era beco sem saída em
    // todo funil. Agora o motivo é o canônico `other` (que o trigger aceita em
    // qualquer funil) e o detalhe viaja à parte, para a linha da timeline.
    abrir(comFunil({ lost_reasons: ["Sem orçamento"] }));

    fireEvent.click(radio("other"));
    const detalhe = screen.getByLabelText(/Detalhe \(opcional\)/);
    fireEvent.change(detalhe, { target: { value: "  Contato de teste  " } });

    expect(confirmar().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(confirmar());
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, {
      lost_reason: "other",
      lost_reason_detail: "Contato de teste",
    });
  });

  it("sem funil configurado, 'Outro' + detalhe livre também grava `other` com o detalhe (crm.fabrasoftware.com.br)", async () => {
    // O caso de produção: "Lead optou em outra solução" num funil sem cadastro.
    // Antes era recusado na tela; o servidor nunca o aceitaria como motivo.
    abrir(comFunil({}));

    fireEvent.click(radio("other"));
    fireEvent.change(screen.getByLabelText(/Detalhe \(opcional\)/), {
      target: { value: "Lead optou em outra solução" },
    });
    expect(confirmar().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(confirmar());
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, {
      lost_reason: "other",
      lost_reason_detail: "Lead optou em outra solução",
    });
  });

  it("detalhe IGUAL a um motivo cadastrado grava o próprio motivo (sem detalhe à parte)", async () => {
    abrir(comFunil({ lost_reasons: ["Sem orçamento"] }));

    fireEvent.click(radio("other"));
    fireEvent.change(screen.getByLabelText(/Detalhe \(opcional\)/), {
      target: { value: "Sem orçamento" },
    });
    fireEvent.click(confirmar());
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, {
      lost_reason: "Sem orçamento",
    });
  });

  it("modo LOTE: 'Outro' + detalhe entrega `other` E o detalhe a quem chamou", async () => {
    const onConfirm = vi.fn(async (..._args: unknown[]) => undefined);
    const qc = comFunil({ lost_reasons: ["Sem orçamento"] });
    render(
      <QueryClientProvider client={qc}>
        <LoseLeadDialog open onOpenChange={() => {}} pipelineId={PIL} onConfirm={onConfirm} />
      </QueryClientProvider>,
    );

    fireEvent.click(radio("other"));
    fireEvent.change(screen.getByLabelText(/Detalhe \(opcional\)/), {
      target: { value: "Contato de teste" },
    });
    fireEvent.click(confirmar());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith("other", "Contato de teste");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("com funil configurado, 'Outro' diz ONDE se cadastra um motivo novo", () => {
    // Beco sem saída: a tela oferece "Outro", recusa todo texto que não seja um
    // motivo já cadastrado, e sem esta frase não diz onde se cadastra um novo.
    abrir(comFunil({ lost_reasons: ["Sem orçamento"] }));
    fireEvent.click(radio("other"));
    expect(screen.getByText(/cadastre em Configurações/)).toBeTruthy();
  });

  it("sem funil configurado a frase NÃO aparece antes de digitar — nada a corrigir ainda", () => {
    abrir(comFunil({}));
    fireEvent.click(radio("other"));
    expect(screen.queryByText(/cadastre em Configurações/)).toBeNull();
  });

  it("sem funil configurado, o padrão do produto e o 'other' vazio continuam valendo", async () => {
    abrir(comFunil({}));
    expect(valuesDosMotivos()).toEqual(
      CANONICAL_LOST_REASONS.filter((motivo) => motivo !== MOTIVO_DA_TRANSFERENCIA),
    );

    fireEvent.click(radio("other"));
    expect(confirmar().disabled).toBe(false);
    fireEvent.click(confirmar());

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(`/api/v1/leads/${LEAD}/lose`, { lost_reason: "other" });
  });

  it("funil com lista VAZIA cai no padrão — nunca numa janela sem motivo nenhum", () => {
    abrir(comFunil({ lost_reasons: [] }));
    expect(valuesDosMotivos()).toEqual(
      CANONICAL_LOST_REASONS.filter((motivo) => motivo !== MOTIVO_DA_TRANSFERENCIA),
    );
  });

  it("⭐ o motivo de SISTEMA não é oferecido — nem sem funil configurado, nem com ele cadastrado", () => {
    // `moved_to_another_pipeline` é canônico, então o trigger o aceita e ele
    // aparecia na lista. Só que a 0266 o EXCLUI de `fn_attendant_metrics` e
    // `fn_atrito_metrics`: oferecido na janela, ele é o caminho de um clique para
    // tirar uma perda comercial real da contagem — e o motivo gravado parece
    // legítimo para quem audita depois. Quem TRANSFERE continua gravando este
    // motivo pelo caminho da troca de funil; quem está PERDENDO o negócio não o
    // escolhe aqui.
    abrir(comFunil({}));
    expect(valuesDosMotivos()).not.toContain(MOTIVO_DA_TRANSFERENCIA);
    // O rótulo que o dava por legítimo na tela também não pode aparecer.
    expect(screen.queryByText("Levado para outro funil")).toBeNull();

    cleanup();
    // Cadastrado NO FUNIL também não volta: a exclusão da métrica no banco é
    // incondicional, então a lista do operador não pode reintroduzir o atalho.
    abrir(comFunil({ lost_reasons: [MOTIVO_DA_TRANSFERENCIA, "Sem orçamento"] }));
    expect(valuesDosMotivos()).toEqual(["Sem orçamento", "other"]);
  });
});

describe("motivosDoFunil (a régua da leitura)", () => {
  it("mantém o texto como está no banco e deduplica ignorando espaços", () => {
    // O valor OFERECIDO é o que vai para `lost_reason`, e o trigger o compara por
    // igualdade EXATA com o que está no jsonb. Aparar aqui faria a janela mostrar
    // um rótulo que o banco recusa com 22023 — a classe de defeito que este
    // arquivo fecha. O dedupe segue ignorando espaço nas pontas.
    expect(
      motivosDoFunil({ lost_reasons: ["  Sem orçamento  ", "Sem orçamento", "", "Fora do perfil"] }),
    ).toEqual(["  Sem orçamento  ", "Fora do perfil"]);
  });

  it("a chave do quadro não pode voltar a ser literal em lugar nenhum", () => {
    // MEDIDO, e contra a minha previsão: trocar o corpo de `chaveDoQuadro` NÃO
    // deixa este arquivo vermelho — 9 verdes —, porque o hook e o teste passaram
    // a ler pela MESMA função e mudam juntos. É o desfecho certo: a divergência
    // deixou de ser possível, em vez de passar a ser detectada.
    //
    // O que continua possível é alguém RE-ESCREVER a literal num dos lados, e aí
    // o hook volta a devolver `[]` em silêncio — a janela cai no padrão do
    // produto, que é o defeito da #918. É essa regressão que este caso pega.
    const raiz = process.cwd();
    for (const arquivo of [
      "hooks/kanban/useMotivosDePerdaDoFunil.ts",
      "tests/unit/kanban-motivos-de-perda-do-funil.test.tsx",
    ]) {
      expect(readFileSync(join(raiz, arquivo), "utf8"), arquivo).toContain("chaveDoQuadro(");
    }
    // A literal só é cobrada no HOOK: este arquivo cita `chaveDoQuadro` e nomeia
    // a literal antiga no próprio texto do caso, e cobrá-la aqui seria o teste
    // reprovando a si mesmo.
    const hook = readFileSync(join(raiz, "hooks/kanban/useMotivosDePerdaDoFunil.ts"), "utf8");
    expect(hook.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")).not.toContain('"board"');
  });

  it("lixo no settings vira lista vazia, não motivo na tela", () => {
    expect(motivosDoFunil(null)).toEqual([]);
    expect(motivosDoFunil({})).toEqual([]);
    expect(motivosDoFunil({ lost_reasons: "Sem orçamento" })).toEqual([]);
  });
});

describe("motivoEscolhidoNaPerda (o que a janela grava)", () => {
  const cadastrados = ["Sem orçamento"];
  it("motivo da lista vai como está; 'Outro' vazio vale `other`", () => {
    expect(
      motivoEscolhidoNaPerda({
        escolhido: "Sem orçamento",
        textoOutro: "",
        motivosCadastrados: cadastrados,
      }),
    ).toEqual({ lostReason: "Sem orçamento" });
    expect(
      motivoEscolhidoNaPerda({
        escolhido: "other",
        textoOutro: "   ",
        motivosCadastrados: cadastrados,
      }),
    ).toEqual({ lostReason: "other" });
  });

  it("'Outro' com texto livre NUNCA vira motivo: `other` + detalhe", () => {
    expect(
      motivoEscolhidoNaPerda({
        escolhido: "other",
        textoOutro: " Contato de teste ",
        motivosCadastrados: cadastrados,
      }),
    ).toEqual({ lostReason: "other", detalhe: "Contato de teste" });
    expect(
      motivoEscolhidoNaPerda({
        escolhido: "other",
        textoOutro: "Contato de teste",
        motivosCadastrados: [],
      }),
    ).toEqual({ lostReason: "other", detalhe: "Contato de teste" });
  });

  it("o motivo de SISTEMA digitado no detalhe não vira atalho para fora da métrica", () => {
    expect(
      motivoEscolhidoNaPerda({
        escolhido: "other",
        textoOutro: MOTIVO_DA_TRANSFERENCIA,
        motivosCadastrados: [],
      }),
    ).toEqual({ lostReason: "other", detalhe: MOTIVO_DA_TRANSFERENCIA });
  });
});
