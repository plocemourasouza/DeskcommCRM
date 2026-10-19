/**
 * Vários anexos de RESPOSTA de uma vez (#2526 × envio otimista): a janela fecha
 * na hora, cada arquivo vira a sua bolha otimista e eles saem EM SEQUÊNCIA —
 * legenda só no primeiro. Se um falha, a bolha dele fica com "Tentar de novo"
 * e os seguintes NÃO saem: ficam `failed` também, cada um com o seu arquivo
 * guardado, para nada do que o atendente escolheu se perder em silêncio.
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
  return { view, list };
}

const arquivo = (nome: string) => new File([new Uint8Array([1])], nome, { type: "image/jpeg" });
const subido = (nome: string) => ({
  storage_path: `org/conv/${nome}`,
  media_mime: "image/jpeg",
  media_size_bytes: 1,
  kind: "image",
});
const real = (id: string): Message => ({ id, status: "sent", type: "image" }) as unknown as Message;

describe("useSendMessage — vários anexos em sequência", () => {
  beforeEach(() => {
    postMock.mockReset();
    uploadMock.mockReset();
    toastMock.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((f: File) => `blob:${f.name}`),
      revokeObjectURL: vi.fn(),
    });
  });

  it("as duas bolhas nascem juntas, na ordem, e a 2ª só sobe depois de a 1ª sair", async () => {
    let liberaPrimeiro!: (v: unknown) => void;
    postMock.mockImplementationOnce(() => new Promise((r) => (liberaPrimeiro = r)));
    postMock.mockResolvedValueOnce({ data: real("m2") });
    uploadMock.mockImplementation(async ({ file }: { file: File }) => subido(file.name));
    const { view, list } = setup();
    const a = arquivo("a.jpg");
    const b = arquivo("b.jpg");

    act(() =>
      view.result.current.enviarEmSequencia([
        { conversation_id: "conv-1", body: "legenda", file: a },
        { conversation_id: "conv-1", file: b },
      ]),
    );

    await waitFor(() => expect(list()).toHaveLength(2));
    expect(list().map((m) => m.media_url)).toEqual(["blob:a.jpg", "blob:b.jpg"]);
    expect(list().map((m) => m.body)).toEqual(["legenda", null]);
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    // a 1ª ainda não voltou: a 2ª não subiu
    expect(uploadMock).toHaveBeenCalledTimes(1);

    await act(async () => liberaPrimeiro({ data: real("m1") }));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual(["m1", "m2"]));
    expect(uploadMock.mock.calls.map(([v]) => (v as { file: File }).file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(postMock.mock.calls.map(([, corpo]) => (corpo as { body?: string }).body)).toEqual([
      "legenda",
      undefined,
    ]);
  });

  it("a 1ª falha: ela fica com 'Tentar de novo', a 2ª não sai, e só um aviso aparece", async () => {
    uploadMock.mockRejectedValueOnce(new Error("upload_failed"));
    const { view, list } = setup();

    act(() =>
      view.result.current.enviarEmSequencia([
        { conversation_id: "conv-1", body: "legenda", file: arquivo("a.jpg") },
        { conversation_id: "conv-1", file: arquivo("b.jpg") },
      ]),
    );

    await waitFor(() => expect(list().map((m) => m.status)).toEqual(["failed", "failed"]));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(postMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(list()[0]!.error_message).toBe("upload_failed");
    expect(list()[1]!.error_message).toBe("Não saiu porque o arquivo anterior falhou.");
  });

  it("'Tentar de novo' na 2ª reenvia só ela, sem legenda e sem esperar a 1ª", async () => {
    uploadMock.mockRejectedValueOnce(new Error("upload_failed"));
    uploadMock.mockResolvedValueOnce(subido("b.jpg"));
    postMock.mockResolvedValueOnce({ data: real("m2") });
    const { view, list } = setup();
    const b = arquivo("b.jpg");

    act(() =>
      view.result.current.enviarEmSequencia([
        { conversation_id: "conv-1", body: "legenda", file: arquivo("a.jpg") },
        { conversation_id: "conv-1", file: b },
      ]),
    );
    await waitFor(() => expect(list().map((m) => m.status)).toEqual(["failed", "failed"]));
    const [primeira, segunda] = list();

    act(() => view.result.current.retry(segunda!.id));
    await waitFor(() => expect(list().map((m) => m.id)).toEqual([primeira!.id, "m2"]));
    expect(uploadMock.mock.calls[1]![0]).toEqual(expect.objectContaining({ file: b }));
    expect(postMock).toHaveBeenCalledTimes(1);
    expect((postMock.mock.calls[0]![1] as { body?: string }).body).toBeUndefined();
    expect(list()[0]!.status).toBe("failed");
  });
});
