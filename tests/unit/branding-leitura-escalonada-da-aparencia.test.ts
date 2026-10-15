/**
 * CÓDIGO NOVO SOBRE BANCO ANTIGO: a leitura da marca da instalação cai por
 * degraus, e faltar UMA coluna de aparência nunca leva as outras embora.
 *
 *   1. todas as colunas;
 *   2. sem `densidade` (banco na 0671, ainda sem a 0674);
 *   3. sem `raio`, `barra_lateral` e `densidade` (banco anterior à 0671).
 *
 * O dublê do cliente é o mesmo do `branding-memo-da-instalacao`: o que se mede
 * é a lista de colunas pedida em cada ida e o que sobra da linha.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({
  pedidos: [] as string[],
  /** Colunas que o banco "não tem": pedir qualquer uma delas dá 42703. */
  ausentes: [] as string[],
  linha: {} as Record<string, unknown>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (colunas: string) => ({
        eq: () => ({
          abortSignal: () => ({
            maybeSingle: async () => {
              banco.pedidos.push(colunas);
              const pedidas = colunas.split(",").map((c) => c.trim());
              if (pedidas.some((c) => banco.ausentes.includes(c))) {
                return { data: null, error: { code: "42703", message: "column does not exist" } };
              }
              return { data: banco.linha, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

const LINHA = {
  app_name: "Revenda",
  logo_url: null,
  logo_path: null,
  accent_hex: null,
  show_powered_by: true,
  seeded_from_env: false,
  fallback_at: null,
  fallback_reason: null,
};

async function ler() {
  vi.resetModules();
  const m = await import("@/lib/branding/instalacao");
  m.invalidarMarcaDaInstalacao();
  return m.marcaDaInstalacao();
}

beforeEach(() => {
  banco.pedidos = [];
  banco.ausentes = [];
  banco.linha = LINHA;
});

describe("leitura da marca da instalação sobre banco sem as colunas novas", () => {
  it("banco em dia: uma ida, com densidade", async () => {
    await ler();
    expect(banco.pedidos).toHaveLength(1);
    expect(banco.pedidos[0]).toContain("densidade");
  });

  it("sem a coluna densidade (0671 sem 0674): segunda ida mantém raio e barra", async () => {
    banco.ausentes = ["densidade"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(2);
    expect(banco.pedidos[1]).not.toContain("densidade");
    expect(banco.pedidos[1]).toContain("raio, barra_lateral");
  });

  it("banco anterior à 0671: terceira ida sem nenhuma das três", async () => {
    banco.ausentes = ["densidade", "raio", "barra_lateral"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(3);
    expect(banco.pedidos[2]).not.toMatch(/densidade|raio|barra_lateral/);
  });

  it("42703 de coluna que NÃO é de aparência não vira fallback silencioso infinito", async () => {
    banco.ausentes = ["app_name"];
    const linha = await ler();
    expect(linha).toBeNull();
    expect(banco.pedidos).toHaveLength(3);
  });
});
