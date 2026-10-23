import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AcaoAfirmadaForm } from "./_acao-afirmada-form";

/** O cartão do modo da trava de ação afirmada: mostra o modo atual e salva o escolhido. */

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ data: { modo: "bloquear" } }) });
});

describe("Trava de ação afirmada — cartão", () => {
  it("mostra o modo atual marcado e o Salvar começa travado", () => {
    render(<AcaoAfirmadaForm initial="observar" />);
    expect(screen.getByTestId("acao-afirmada-observar")).toBeChecked();
    expect(screen.getByTestId("acao-afirmada-bloquear")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("escolher bloquear e salvar manda o PATCH com o modo", async () => {
    render(<AcaoAfirmadaForm initial="observar" />);
    fireEvent.click(screen.getByTestId("acao-afirmada-bloquear"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const [url, init] = fetcher.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toContain("/api/v1/settings/acao-afirmada");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ modo: "bloquear" });
  });
});
