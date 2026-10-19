/**
 * Resposta rápida com imagem (#2526): a leva de imagens e a remoção de imagem
 * na prévia.
 *
 * O caso (1) nasceu como reprodução na triagem do PR #2704: num template com
 * 2 imagens, a 2ª falhava no upload e o operador clicava Enviar de novo. A 1ª
 * imagem saía DE NOVO, com a legenda — dois envios com o mesmo texto, o que a
 * issue proíbe ("falha no envio da mídia não causa duplicação do texto").
 *
 * Desde o envio otimista, a RESPOSTA não espera upload no diálogo: ele fecha na
 * hora e entrega a leva inteira ao `enviarEmSequencia`, cada arquivo com a sua
 * bolha. O retry deixou de ser "Enviar de novo" no diálogo e passou a ser o
 * "Tentar de novo" da bolha que falhou — que reenvia só ela, sem a legenda:
 * `tests/unit/use-send-message-sequencia.test.tsx`. Aqui fica o lado do
 * composer: legenda só na 1ª, nada de upload no composer, um envio por leva.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  falharNaChamada: 0,
  chamadas: 0,
}));

const uploadMock = vi.fn(async ({ file }: { file: File }) => {
  h.chamadas += 1;
  if (h.chamadas === h.falharNaChamada) throw new Error("upload_failed");
  return { storage_path: `org/conv/out-${file.name}`, media_mime: "image/jpeg", media_size_bytes: 3, kind: "image" as const };
});
const sendMock = vi.fn((_v: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const sequenciaMock = vi.fn();

vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, enviarEmSequencia: sequenciaMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({
    data: [
      {
        id: "tpl-1",
        title: "Catalogo",
        body: "Veja o modelo",
        shortcut: "cat",
        owner_user_id: null,
        midias: [
          { storage_path: "o/templates/tpl-1/a.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
          { storage_path: "o/templates/tpl-1/b.jpg", media_mime: "image/jpeg", media_size_bytes: 3 },
        ],
      },
    ],
  }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));

import { Composer } from "@/components/inbox/Composer";

async function escolherTemplate() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "/cat" } });
  fireEvent.click(await screen.findByText("Catalogo"));
  await screen.findByRole("dialog");
}

const enviar = () => fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));
type Envio = { body?: string; file: File };
const leva = () => (sequenciaMock.mock.calls[0]?.[0] ?? []) as Envio[];
const corpos = () => leva().map((e) => e.body);
const arquivos = () => leva().map((e) => e.file.name);

beforeEach(() => {
  h.chamadas = 0;
  h.falharNaChamada = 0;
  uploadMock.mockClear();
  sendMock.mockClear();
  sequenciaMock.mockClear();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  })) as never;
});

describe("resposta rápida com imagem — retry e remoção na prévia (#2526)", () => {
  it("(1) as 2 imagens saem numa leva só, legenda só na 1ª, e o diálogo fecha na hora", async () => {
    await escolherTemplate();

    enviar();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sequenciaMock).toHaveBeenCalledTimes(1);
    expect(arquivos()).toEqual(["a.jpg", "b.jpg"]);
    expect(corpos()).toEqual(["Veja o modelo", undefined]);
    // o upload é do hook, arquivo a arquivo — o composer não sobe nem envia nada
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("(2) remover a 1ª imagem na prévia: só a 2ª sai, levando a legenda", async () => {
    await escolherTemplate();

    fireEvent.click(screen.getAllByRole("button", { name: /remover imagem/i })[0]!);
    expect(screen.getAllByRole("button", { name: /remover imagem/i })).toHaveLength(1);
    enviar();

    await waitFor(() => expect(sequenciaMock).toHaveBeenCalledTimes(1));
    expect(arquivos()).toEqual(["b.jpg"]);
    expect(corpos()).toEqual(["Veja o modelo"]);
  });

  it("(3) remover todas: a prévia fecha e o texto volta para o campo, sem envio", async () => {
    await escolherTemplate();

    fireEvent.click(screen.getAllByRole("button", { name: /remover imagem/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /remover imagem/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Veja o modelo");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(sequenciaMock).not.toHaveBeenCalled();
  });
});
