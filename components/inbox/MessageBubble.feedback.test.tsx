/** Estados de envio na bolha: pendente (queued/sending) e falha com "Tentar de novo". */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/lib/types/messaging";

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "temp-1",
    organization_id: "o",
    conversation_id: "c1",
    channel_session_id: "s",
    contact_id: "ct",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "queued",
    ack: null,
    error_code: null,
    error_message: null,
    body: "oi",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: null,
    sent_at: "2026-09-08T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    created_at: "2026-09-08T12:00:00.000Z",
    ...over,
  } as Message;
}

describe("MessageBubble — estado de envio", () => {
  it.each(["queued", "sending"])("%s mostra 'Enviando' (não fica mudo)", (status) => {
    render(<MessageBubble message={msg({ status })} />);
    expect(screen.getByLabelText("Enviando")).toBeInTheDocument();
  });

  it("enviada não mostra 'Enviando'", () => {
    render(<MessageBubble message={msg({ status: "sent" })} />);
    expect(screen.queryByLabelText("Enviando")).toBeNull();
  });

  it("failed com onTentarDeNovo mostra a ação e chama com a mensagem", () => {
    const onTentarDeNovo = vi.fn();
    const m = msg({ status: "failed", error_message: "x" });
    render(<MessageBubble message={m} onTentarDeNovo={onTentarDeNovo} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onTentarDeNovo).toHaveBeenCalledWith(m);
  });

  it("failed sem onTentarDeNovo não oferece a ação", () => {
    render(<MessageBubble message={msg({ status: "failed" })} />);
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("mídia otimista mostra a prévia local, sem ir buscar /messages/temp-…/media", () => {
    const { container } = render(
      <MessageBubble
        message={msg({
          type: "image",
          media_url: "blob:preview-1",
          media_mime: "image/jpeg",
          body: null,
          metadata: { _optimistic: true, _local_preview: true },
        })}
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:preview-1");
  });
});
