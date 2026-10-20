import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O "+" do composer aceita VÁRIOS arquivos de uma vez — nos dois modos.
 *
 * O diálogo de prévia já sabia mostrar uma fila (#2526, resposta rápida com
 * imagens) e o envio já sabia mandar uma fila em sequência; só o "+" ainda
 * entregava um arquivo. Os casos abaixo medem o caminho que o operador usa:
 * o input do menu "+", com dois arquivos escolhidos no seletor do sistema.
 */

const sendMock = vi.fn();
const sequenciaMock = vi.fn();
const createNoteMock = vi.fn();
const uploadMock = vi.fn();
const { toastError, toastWarning } = vi.hoisted(() => ({ toastError: vi.fn(), toastWarning: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError, warning: toastWarning, success: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, enviarEmSequencia: sequenciaMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: createNoteMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));
// A fixture exercita um atendente autorizado a consultar modelos de mensagem.
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));

import { Composer } from "@/components/inbox/Composer";
import { MAXIMO_DE_MIDIAS } from "@/lib/templates/midias";

function renderComposer() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

function arquivo(nome: string, tipo: string, bytes = 3): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

/** Abre o "+" e escolhe os arquivos no input de fotos/vídeos (ou de documento). */
function escolher(files: File[], input: "midia" | "documento" = "midia") {
  fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
  const seletor = input === "midia" ? 'input[accept^="image"]' : 'input[accept^=".pdf"]';
  const el = document.querySelector(seletor) as HTMLInputElement;
  fireEvent.change(el, { target: { files } });
}

describe("Composer: o \"+\" aceita vários arquivos", () => {
  beforeEach(() => {
    for (const m of [sendMock, sequenciaMock, createNoteMock, uploadMock, toastError, toastWarning]) m.mockReset();
  });

  it("os dois inputs do \"+\" pedem vários arquivos ao seletor do sistema", () => {
    renderComposer();
    expect(document.querySelector('input[accept^="image"]')).toHaveAttribute("multiple");
    expect(document.querySelector('input[accept^=".pdf"]')).toHaveAttribute("multiple");
  });

  it("escolher 2 fotos abre o diálogo listando as duas, na ordem da escolha", async () => {
    renderComposer();
    escolher([arquivo("primeira.jpg", "image/jpeg"), arquivo("segunda.png", "image/png")]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByAltText("primeira.jpg")).toBeInTheDocument();
    expect(within(dialog).getByAltText("segunda.png")).toBeInTheDocument();
    // A capa é a primeira: é ela que leva a legenda.
    const imagens = within(dialog).getAllByRole("img");
    expect(imagens.map((i) => i.getAttribute("alt"))).toEqual(["primeira.jpg", "segunda.png"]);
  });

  it("RESPOSTA: Enviar chama enviarEmSequencia UMA vez, com as duas na ordem e a legenda só na primeira", async () => {
    renderComposer();
    const a = arquivo("primeira.jpg", "image/jpeg");
    const b = arquivo("segunda.pdf", "application/pdf");
    escolher([a, b]);

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/legenda/i), { target: { value: "olha as duas" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^enviar$/i }));

    await waitFor(() => expect(sequenciaMock).toHaveBeenCalledTimes(1));
    expect(sequenciaMock).toHaveBeenCalledWith([
      { conversation_id: "conv-1", body: "olha as duas", file: a },
      { conversation_id: "conv-1", body: undefined, file: b },
    ]);
    expect(sendMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("NOTA: as duas sobem como nota (upload + createNote), em ordem, cada uma com a legenda", async () => {
    uploadMock.mockImplementation(async ({ file }: { file: File }) => ({
      storage_path: `org-1/conv-1/note-${file.name}`,
      media_mime: file.type,
      media_size_bytes: file.size,
      kind: "image" as const,
    }));
    createNoteMock.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
    escolher([arquivo("print-1.png", "image/png"), arquivo("print-2.png", "image/png")]);

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/legenda/i), { target: { value: "prints do erro" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^enviar$/i }));

    await waitFor(() => expect(createNoteMock).toHaveBeenCalledTimes(2));
    expect(uploadMock.mock.calls.map(([arg]) => (arg as { file: File; destino: string }).file.name)).toEqual([
      "print-1.png",
      "print-2.png",
    ]);
    expect(uploadMock.mock.calls.every(([arg]) => (arg as { destino: string }).destino === "nota")).toBe(true);
    expect(createNoteMock.mock.calls.map(([p]) => (p as { body: string; anexo: { storage_path: string } }))).toEqual([
      expect.objectContaining({ body: "prints do erro", anexo: expect.objectContaining({ storage_path: "org-1/conv-1/note-print-1.png" }) }),
      expect.objectContaining({ body: "prints do erro", anexo: expect.objectContaining({ storage_path: "org-1/conv-1/note-print-2.png" }) }),
    ]);
    expect(sendMock).not.toHaveBeenCalled();
    expect(sequenciaMock).not.toHaveBeenCalled();
  });

  it("arquivo que o servidor recusaria (tipo, vazio, acima de 50MB) fica de fora com aviso; os válidos seguem", async () => {
    renderComposer();
    const boa = arquivo("boa.jpg", "image/jpeg");
    const executavel = arquivo("setup.exe", "application/x-msdownload");
    const vazia = arquivo("vazia.png", "image/png", 0);
    const gigante = arquivo("filme.mp4", "video/mp4");
    Object.defineProperty(gigante, "size", { value: 52_428_801 });
    escolher([executavel, boa, vazia, gigante]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual(["boa.jpg"]);
    expect(toastError).toHaveBeenCalledTimes(3);
    const avisos = toastError.mock.calls.map(([msg]) => String(msg));
    expect(avisos[0]).toContain("setup.exe");
    expect(avisos[0]).toContain("Tipo de arquivo não suportado.");
    expect(avisos[1]).toContain("vazia.png");
    expect(avisos[2]).toContain("filme.mp4");
    expect(avisos[2]).toContain("Arquivo acima de 50MB.");

    fireEvent.click(within(dialog).getByRole("button", { name: /^enviar$/i }));
    await waitFor(() =>
      expect(sequenciaMock).toHaveBeenCalledWith([{ conversation_id: "conv-1", body: undefined, file: boa }]),
    );
  });

  it("todos recusados: o diálogo nem abre", async () => {
    renderComposer();
    escolher([arquivo("a.exe", "application/x-msdownload")]);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    // Por NOME: o popover do "+" também é role=dialog e segue aberto no teste.
    expect(screen.queryByRole("dialog", { name: /enviar anexo/i })).toBeNull();
  });

  it(`acima de ${MAXIMO_DE_MIDIAS} arquivos: entram os ${MAXIMO_DE_MIDIAS} primeiros e o resto é avisado`, async () => {
    renderComposer();
    const files = Array.from({ length: MAXIMO_DE_MIDIAS + 2 }, (_, i) => arquivo(`f${i + 1}.jpg`, "image/jpeg"));
    escolher(files);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual(
      files.slice(0, MAXIMO_DE_MIDIAS).map((f) => f.name),
    );
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(String(toastWarning.mock.calls[0]?.[0])).toContain(String(MAXIMO_DE_MIDIAS));
  });

  it("documentos também vêm em lote pelo input de Documento", async () => {
    renderComposer();
    const a = arquivo("contrato.pdf", "application/pdf");
    const b = arquivo("planilha.csv", "text/csv");
    escolher([a, b], "documento");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("contrato.pdf")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^enviar$/i }));
    await waitFor(() =>
      expect(sequenciaMock).toHaveBeenCalledWith([
        { conversation_id: "conv-1", body: undefined, file: a },
        { conversation_id: "conv-1", body: undefined, file: b },
      ]),
    );
  });
});
