/**
 * Feedback de envio: a mensagem aparece NA HORA como pendente, a mídia mostra a
 * prévia local enquanto sobe, e a falha deixa a bolha `failed` com o arquivo
 * guardado para "Tentar de novo".
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/types/messaging";

const postMock = vi.fn();
const uploadMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...a: unknown[]) => postMock(...a) } }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  uploadMedia: (...a: unknown[]) => uploadMock(...a),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: (e: unknown) => toastMock(e) }));

import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import type * as UploadMediaModule from "@/hooks/inbox/useUploadMedia";

interface Page {
  data: Message[];
}
const KEY = ["messages", "conv-1"];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData<InfiniteData<Page>>(KEY, { pages: [{ data: [] }], pageParams: [undefined] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useSendMessage(), { wrapper });
  const list = () => qc.getQueryData<InfiniteData<Page>>(KEY)!.pages[0]!.data;
  return { qc, view, list };
}

const real = (id: string): Message => ({ id, status: "sent", type: "image" }) as unknown as Message;

describe("useSendMessage — feedback de envio", () => {
  beforeEach(() => {
    postMock.mockReset();
    uploadMock.mockReset();
    toastMock.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview-1"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("texto entra como pendente (queued) antes da resposta do servidor", async () => {
    let resolve!: (v: unknown) => void;
    postMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { view, list } = setup();
    act(() => view.result.current.mutate({ conversation_id: "conv-1", body: "oi" }));
    await waitFor(() => expect(list()).toHaveLength(1));
    expect(list()[0]!.status).toBe("queued");
    await act(async () => resolve({ data: real("m1") }));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m1"]));
  });

  it("mídia: bolha otimista com a prévia local, sobe e envia, e a prévia é liberada ao assentar", async () => {
    let liberaUpload!: (v: unknown) => void;
    uploadMock.mockReturnValue(new Promise((r) => (liberaUpload = r)));
    postMock.mockResolvedValue({ data: real("m2") });
    const { view, list } = setup();
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    act(() => view.result.current.mutate({ conversation_id: "conv-1", type: "image", body: "legenda", file }));
    await waitFor(() => expect(list()).toHaveLength(1));
    expect(list()[0]!.media_url).toBe("blob:preview-1");
    expect(list()[0]!.type).toBe("image");
    expect(list()[0]!.status).toBe("queued");
    await act(async () =>
      liberaUpload({ storage_path: "org/conv/a.jpg", media_mime: "image/jpeg", media_size_bytes: 3, kind: "image" }),
    );
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m2"]));
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", file }));
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/messages",
      expect.objectContaining({ type: "image", media_storage_path: "org/conv/a.jpg", body: "legenda" }),
    );
    // o arquivo local nunca vai no corpo do POST
    expect(JSON.stringify(postMock.mock.calls[0]![1])).not.toContain("blob:");
    expect(postMock.mock.calls[0]![1]).not.toHaveProperty("file");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("falha do upload: a bolha vira failed (não some), com toast", async () => {
    uploadMock.mockRejectedValue(new Error("upload_failed"));
    const { view, list } = setup();
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    act(() => view.result.current.mutate({ conversation_id: "conv-1", type: "image", file }));
    await waitFor(() => expect(list()[0]?.status).toBe("failed"));
    expect(list()).toHaveLength(1);
    expect(postMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalled();
  });

  it("retry reenvia com o MESMO arquivo, troca a bolha falha por uma pendente e acaba enviada", async () => {
    uploadMock.mockRejectedValueOnce(new Error("upload_failed"));
    uploadMock.mockResolvedValueOnce({
      storage_path: "org/conv/a.jpg",
      media_mime: "image/jpeg",
      media_size_bytes: 1,
      kind: "image",
    });
    postMock.mockResolvedValue({ data: real("m3") });
    const { view, list } = setup();
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    act(() => view.result.current.mutate({ conversation_id: "conv-1", type: "image", file }));
    await waitFor(() => expect(list()[0]?.status).toBe("failed"));
    const failedId = list()[0]!.id;
    act(() => view.result.current.retry(failedId));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m3"]));
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls[1]![0]).toEqual(expect.objectContaining({ file }));
  });

  it("anexo de RESPOSTA sobe pela rota de MENSAGEM (`/media`), nunca pela de nota", async () => {
    // A guarda que o composer tinha (`destino: "mensagem"`) mudou de casa junto
    // com o upload: agora é o hook que sobe. Aqui o upload REAL roda, com o
    // `fetch` interceptado, e o que se mede é o endereço que ele pede — a
    // diferença entre o arquivo ir para o cliente e ir para a nota interna.
    // O `beforeEach` troca `URL` por um objeto sem construtor (para a prévia
    // local); o import real precisa do `URL` de verdade, e a prévia o reinstala.
    const urlFalso = globalThis.URL;
    vi.unstubAllGlobals();
    const real = await vi.importActual<typeof UploadMediaModule>("@/hooks/inbox/useUploadMedia");
    vi.stubGlobal("URL", urlFalso);
    uploadMock.mockImplementation((a: Parameters<typeof real.uploadMedia>[0]) => real.uploadMedia(a));
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { storage_path: "org/conv/a.jpg", media_mime: "image/jpeg", media_size_bytes: 1, kind: "image" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    postMock.mockResolvedValue({ data: { id: "m4", status: "sent", type: "image" } });
    const { view, list } = setup();
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    act(() => view.result.current.mutate({ conversation_id: "conv-1", file }));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m4"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/v1/conversations/conv-1/media");
    expect(uploadMock.mock.calls[0]![0]).not.toHaveProperty("destino", "nota");
    vi.unstubAllGlobals();
  });

  it("anexo enviado ANTES de a lista carregar ganha bolha, e a falha fica para 'Tentar de novo'", async () => {
    // Sem a página em cache, `onMutate` não tinha onde pôr a bolha: o diálogo
    // fechava, nada aparecia, e a falha perdia o arquivo de vez.
    uploadMock.mockRejectedValueOnce(new Error("upload_failed"));
    uploadMock.mockResolvedValueOnce({
      storage_path: "org/conv/a.jpg",
      media_mime: "image/jpeg",
      media_size_bytes: 1,
      kind: "image",
    });
    postMock.mockResolvedValue({ data: real("m5") });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useSendMessage(), { wrapper });
    const list = () => qc.getQueryData<InfiniteData<Page>>(KEY)?.pages[0]?.data ?? [];
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    act(() => view.result.current.mutate({ conversation_id: "conv-1", type: "image", file }));
    await waitFor(() => expect(list()[0]?.status).toBe("failed"));
    expect(list()).toHaveLength(1);
    act(() => view.result.current.retry(list()[0]!.id));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m5"]));
    expect(uploadMock.mock.calls[1]![0]).toEqual(expect.objectContaining({ file }));
  });

  it("retry de id desconhecido não faz nada", () => {
    const { view } = setup();
    act(() => view.result.current.retry("nao-existe"));
    expect(postMock).not.toHaveBeenCalled();
  });
});
