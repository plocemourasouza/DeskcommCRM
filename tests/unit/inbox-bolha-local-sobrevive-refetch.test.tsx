/**
 * A bolha otimista (pendente ou falha) vive SÓ no cache do cliente. Toda vez
 * que a lista é refeita — foco da janela, evento do Realtime, refetch de
 * segurança — a resposta do servidor substitui as páginas, e o servidor nunca
 * viu aquela bolha. Antes, ela sumia junto com o "Tentar de novo" e o arquivo.
 *
 * Aqui a lista REAL (`useMessagesRealtime`) e o envio REAL (`useSendMessage`)
 * dividem o mesmo `QueryClient`; só a rede, o upload e o canal são simulados.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/types/messaging";

const getMock = vi.fn();
const postMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a) },
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  uploadMedia: (...a: unknown[]) => uploadMock(...a),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: () => undefined }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: () => ({ status: "SUBSCRIBED", ultimaEntrega: { current: null } }),
}));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({
  useRefetchDeSeguranca: () => ({
    divergencias: 0,
    ultimaDivergencia: null,
    ultimaVerificacao: null,
  }),
}));
vi.mock("@/hooks/inbox/recargaDasConversas", () => ({
  agendarRecargaDasConversas: () => undefined,
}));

import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";

const CONV = "conv-1";
const KEY = ["messages", CONV];

function msg(id: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    conversation_id: CONV,
    direction: "outbound",
    status: "sent",
    type: "text",
    body: null,
    created_at: new Date().toISOString(),
    ...extra,
  } as unknown as Message;
}

const pagina = (data: Message[]) => ({ data, meta: { has_more: false, cursor: null } });

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => ({ lista: useMessagesRealtime(CONV), envio: useSendMessage() }), {
    wrapper,
  });
  // Lê o CACHE, não o resultado do observer: o observer só é notificado num
  // tique agendado, e a asserção logo depois de um `refetchQueries` leria o velho.
  const todas = () =>
    qc.getQueryData<InfiniteData<{ data: Message[] }>>(KEY)?.pages.flatMap((p) => p.data) ?? [];
  const ids = () => todas().map((m) => m.id);
  return { qc, view, ids, todas };
}

const falha = () => (m: Message) => m.id.startsWith("temp-") && m.status === "failed";

describe("bolha local sobrevive ao refetch da lista", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    uploadMock.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:previa"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("a bolha FALHA continua lá depois do refetch (foco / Realtime), com o arquivo para o retry", async () => {
    getMock.mockResolvedValue(pagina([msg("h1", { body: "antes" })]));
    uploadMock.mockRejectedValue(new Error("upload_failed"));
    const { qc, view, ids, todas } = setup();
    await waitFor(() => expect(ids()).toEqual(["h1"]));

    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    act(() => view.result.current.envio.mutate({ conversation_id: CONV, body: "legenda", file }));
    await waitFor(() => expect(todas().some(falha())).toBe(true));

    getMock.mockResolvedValue(
      pagina([msg("h1", { body: "antes" }), msg("h2", { direction: "inbound", body: "novo" })]),
    );
    await act(() => qc.refetchQueries({ queryKey: KEY, exact: true }));

    expect(ids().slice(0, 2)).toEqual(["h1", "h2"]);
    expect(todas().filter(falha())).toHaveLength(1);

    // e o "Tentar de novo" ainda tem o arquivo
    uploadMock.mockResolvedValue({
      storage_path: "o/c/a.png",
      media_mime: "image/png",
      media_size_bytes: 1,
      kind: "image",
    });
    postMock.mockResolvedValue({ data: msg("m9", { type: "image", body: "legenda" }) });
    getMock.mockResolvedValue(
      pagina([msg("h1"), msg("h2", { direction: "inbound" }), msg("m9", { type: "image" })]),
    );
    act(() => view.result.current.envio.retry(todas().find(falha())!.id));
    await waitFor(() => expect(ids()).toEqual(["h1", "h2", "m9"]));
    expect(uploadMock.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ file }));
  });

  it("a bolha PENDENTE sobrevive ao refetch que ainda não tem a cópia do servidor", async () => {
    getMock.mockResolvedValue(pagina([msg("h1")]));
    let respondePost!: (v: unknown) => void;
    postMock.mockReturnValue(new Promise((r) => (respondePost = r)));
    const { qc, view, ids, todas } = setup();
    await waitFor(() => expect(ids()).toEqual(["h1"]));

    act(() => view.result.current.envio.mutate({ conversation_id: CONV, body: "oi" }));
    await waitFor(() => expect(ids()).toHaveLength(2));
    await act(() => qc.refetchQueries({ queryKey: KEY, exact: true }));
    expect(todas().filter((m) => m.id.startsWith("temp-") && m.status === "queued")).toHaveLength(
      1,
    );

    getMock.mockResolvedValue(pagina([msg("h1"), msg("m1", { body: "oi" })]));
    await act(async () => respondePost({ data: msg("m1", { body: "oi" }) }));
    await waitFor(() => expect(ids()).toEqual(["h1", "m1"]));
  });

  it("quando a cópia do servidor chega pelo refetch, a pendente sai (sem bolha dobrada)", async () => {
    getMock.mockResolvedValue(pagina([msg("h1")]));
    postMock.mockReturnValue(new Promise(() => {}));
    const { qc, view, ids } = setup();
    await waitFor(() => expect(ids()).toEqual(["h1"]));

    act(() => view.result.current.envio.mutate({ conversation_id: CONV, body: "oi" }));
    await waitFor(() => expect(ids()).toHaveLength(2));
    // o Realtime viu o INSERT antes de o POST responder
    getMock.mockResolvedValue(pagina([msg("h1"), msg("m1", { body: "oi", status: "sending" })]));
    await act(() => qc.refetchQueries({ queryKey: KEY, exact: true }));
    expect(ids()).toEqual(["h1", "m1"]);
  });

  it("anexo enviado ANTES de a lista carregar: a bolha aparece, e a história entra junto quando chega", async () => {
    let respondeLista!: (v: unknown) => void;
    getMock.mockReturnValueOnce(new Promise((r) => (respondeLista = r)));
    uploadMock.mockRejectedValue(new Error("upload_failed"));
    const { view, ids, todas } = setup();

    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    act(() => view.result.current.envio.mutate({ conversation_id: CONV, body: "cedo", file }));
    await waitFor(() => expect(todas().some(falha())).toBe(true));

    await act(async () => respondeLista(pagina([msg("h1"), msg("h2")])));
    await waitFor(() => expect(ids().slice(0, 2)).toEqual(["h1", "h2"]));
    expect(todas().filter(falha())).toHaveLength(1);
  });
});
