import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadResult = {
  storage_path: "org/conv/out-1.jpg",
  media_mime: "image/jpeg",
  media_size_bytes: 3,
  kind: "image" as const,
};
const uploadMock = vi.fn(async () => uploadResult);
const sendMock = vi.fn();
const sequenciaMock = vi.fn();

vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: uploadMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, enviarEmSequencia: sequenciaMock, isPending: false }),
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe("Composer + anexos", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    sendMock.mockClear();
    sequenciaMock.mockClear();
  });

  it("botão Anexar abre o menu com as duas opções", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
    expect(screen.getByText("Fotos e vídeos")).toBeInTheDocument();
    expect(screen.getByText("Documento")).toBeInTheDocument();
  });

  it("selecionar arquivo abre preview e enviar enfileira o envio otimista com o arquivo e a legenda", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
    const input = document.querySelector('input[accept^="image"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/legenda/i), { target: { value: "olha isso" } });
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await waitFor(() =>
      expect(sequenciaMock).toHaveBeenCalledWith([
        expect.objectContaining({ conversation_id: "conv-1", body: "olha isso", file }),
      ]),
    );
    // o upload agora acontece DENTRO do envio (hook), não mais no composer
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("o diálogo fecha assim que o envio é enfileirado (a bolha assume o feedback)", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
    const input = document.querySelector('input[accept^="image"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sequenciaMock).toHaveBeenCalledTimes(1);
  });
});

// A fixture exercita um atendente autorizado a consultar modelos de mensagem.
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));
