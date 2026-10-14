/**
 * O botão "Atualizar" de Tarefas anuncia `aria-busy` pelo `loading` que o hook
 * entrega. Com `isLoading`, só a PRIMEIRA carga contava: o clique da pessoa —
 * a ação que o botão nomeia — recarregava em silêncio. O hook precisa dizer
 * "estou buscando" também no refetch, sem trocar a lista pelo esqueleto.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTasks } from "@/hooks/tasks/useTasks";

afterEach(() => vi.unstubAllGlobals());

describe("useTasks — atualizando", () => {
  it("o refetch pedido pela pessoa marca `atualizando`, e a lista não volta ao esqueleto", async () => {
    let solta: (() => void) | null = null;
    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        chamadas += 1;
        if (chamadas > 1) await new Promise<void>((ok) => (solta = ok));
        return new Response(JSON.stringify({ data: { tasks: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.atualizando).toBe(false);

    act(() => void result.current.recarregar());
    await waitFor(() => expect(result.current.atualizando).toBe(true));
    expect(result.current.carregando).toBe(false);

    await act(async () => solta?.());
    await waitFor(() => expect(result.current.atualizando).toBe(false));
  });
});
