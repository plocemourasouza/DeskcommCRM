import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";

/**
 * O FIO SEGUE O FIM QUANDO O QUE ESTÁ NO FIM CRESCE.
 *
 * Medido em 2026-10-19, pela tela (`tests/e2e/inbox-rola-ate-o-envio.spec.ts`):
 * quem está no fim da conversa envia um texto que falha — a bolha nasce com
 * 71px (`queued`) e, quando falha, ganha a linha "Falhou · Tentar de novo" e
 * passa a 91px. O fio, que tinha rolado até a bolha de 71px, fica 31px aquém
 * do fim e a linha do "Tentar de novo" sai da tela. Com um anexo é pior: a
 * bolha da imagem cresce depois de entrar e o fio ficou 268px aquém do fim.
 *
 * A causa: a decisão de rolar só roda quando CHEGA item (`items.length`), e a
 * guarda de distância mede DEPOIS de o item entrar. Crescimento de quem já
 * está no fio não dispara nada; e item novo mais alto que 120px parece, para
 * a guarda, "usuário lendo o histórico".
 *
 * A regra: quem estava no fim continua no fim quando o conteúdo cresce; quem
 * rolou para cima para ler o histórico não é arrancado de lá.
 */

const estado = vi.hoisted(() => ({ mensagens: [] as unknown[] }));

vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: [{ data: estado.mensagens }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/MessageBubble", () => ({ MessageBubble: () => <div /> }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

function mensagem(n: number): Message {
  return {
    id: `m-${n}`,
    sent_at: new Date(Date.UTC(2026, 9, 19, 12, n)).toISOString(),
    reply_to_message_id: null,
  } as unknown as Message;
}

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

/**
 * A geometria do fio, que o jsdom não tem — com os números medidos na tela:
 * scroller de 290px, conteúdo de 2359px, rolado até o fim (2058 + 290 = 2348,
 * 11px aquém: a bolha `queued` já à vista).
 */
const geo = { scrollHeight: 2359, scrollTop: 2058, clientHeight: 290 };
const originais = {
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
  scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop"),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};

/** ResizeObserver controlável: o teste decide quando o conteúdo "mudou de tamanho". */
const observados: { callback: ResizeObserverCallback; alvos: Element[] }[] = [];
const ROOriginal = globalThis.ResizeObserver;
class ROFalso {
  private registro: { callback: ResizeObserverCallback; alvos: Element[] };
  constructor(callback: ResizeObserverCallback) {
    this.registro = { callback, alvos: [] };
    observados.push(this.registro);
  }
  observe(alvo: Element) {
    this.registro.alvos.push(alvo);
  }
  unobserve() {}
  disconnect() {
    this.registro.alvos = [];
  }
}
function conteudoCresceu() {
  for (const r of observados)
    if (r.alvos.length) r.callback([], r as unknown as ResizeObserver);
}

const rolar = vi.fn();
const scrollIntoViewOriginal = Element.prototype.scrollIntoView;

describe("ChatThread: o fio segue o fim quando o conteúdo cresce", () => {
  beforeEach(() => {
    qc = new QueryClient();
    rolar.mockClear();
    observados.length = 0;
    geo.scrollHeight = 2359;
    geo.scrollTop = 2058;
    geo.clientHeight = 290;
    estado.mensagens = [mensagem(1), mensagem(2)];
    Element.prototype.scrollIntoView = rolar;
    globalThis.ResizeObserver = ROFalso as unknown as typeof ResizeObserver;
    for (const p of ["scrollHeight", "scrollTop", "clientHeight"] as const) {
      Object.defineProperty(HTMLElement.prototype, p, {
        configurable: true,
        get: () => geo[p],
        set: (v: number) => {
          geo[p] = v;
        },
      });
    }
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoViewOriginal;
    globalThis.ResizeObserver = ROOriginal;
    for (const [p, d] of Object.entries(originais)) {
      if (d) Object.defineProperty(HTMLElement.prototype, p, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[p];
    }
  });

  it("estava no fim e a última bolha cresceu 20px (queued → failed): rola até o fim de novo", () => {
    render(<ChatThread conversationId="c-1" />, { wrapper });
    rolar.mockClear();

    geo.scrollHeight = 2379; // + a linha "Falhou · Tentar de novo"
    conteudoCresceu();

    expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: "end" }));
  });

  it("item novo MAIS ALTO que 120px (a bolha de um anexo) chegando para quem está no fim: rola", () => {
    const { rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    rolar.mockClear();

    geo.scrollHeight = 2359 + 290;
    estado.mensagens = [mensagem(1), mensagem(2), mensagem(3)];
    rerender(<ChatThread conversationId="c-1" />);
    conteudoCresceu();

    expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: "end" }));
  });

  it("quem rolou para cima para ler o histórico NÃO é arrancado quando o conteúdo cresce", () => {
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    rolar.mockClear();

    geo.scrollTop = 900; // subiu ~1400px
    fireEvent.scroll(container.querySelector(".overflow-y-auto")!);
    geo.scrollHeight = 2379;
    conteudoCresceu();

    expect(rolar).not.toHaveBeenCalled();
  });

  it("quem subiu e VOLTOU ao fim passa a seguir o fim de novo", () => {
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    const scroller = container.querySelector(".overflow-y-auto")!;
    geo.scrollTop = 900;
    fireEvent.scroll(scroller);
    geo.scrollTop = 2069; // de volta ao fim
    fireEvent.scroll(scroller);
    rolar.mockClear();

    geo.scrollHeight = 2379;
    conteudoCresceu();

    expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: "end" }));
  });
});
