/**
 * CÓDIGO NOVO SOBRE BANCO ANTIGO: a leitura da marca da instalação cai por
 * degraus, e faltar UMA coluna de aparência nunca leva as outras embora.
 *
 *   1. todas as colunas;
 *   2. sem `fonte` (banco na 0675, ainda sem a 0676);
 *   3. sem `fonte` e `densidade` (banco na 0674, ainda sem a 0675);
 *   4. sem `raio`, `barra_lateral`, `densidade` e `fonte` (banco anterior à 0674).
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
  it("banco em dia: uma ida, com densidade e fonte", async () => {
    await ler();
    expect(banco.pedidos).toHaveLength(1);
    expect(banco.pedidos[0]).toContain("densidade");
    expect(banco.pedidos[0]).toContain("fonte");
  });

  it("sem a coluna fonte (0675 sem 0676): segunda ida mantém raio, barra e densidade", async () => {
    banco.ausentes = ["fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(2);
    expect(banco.pedidos[1]).not.toContain("fonte");
    expect(banco.pedidos[1]).toContain("raio, barra_lateral, densidade");
  });

  it("sem fonte e densidade (0674 sem 0675): terceira ida mantém raio e barra", async () => {
    banco.ausentes = ["densidade", "fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(3);
    expect(banco.pedidos[2]).not.toMatch(/densidade|fonte/);
    expect(banco.pedidos[2]).toContain("raio, barra_lateral");
  });

  it("banco anterior à 0674: quarta ida sem nenhuma das quatro", async () => {
    banco.ausentes = ["densidade", "raio", "barra_lateral", "fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(4);
    expect(banco.pedidos[3]).not.toMatch(/densidade|raio|barra_lateral|fonte/);
  });

  it("42703 de coluna que NÃO é de aparência não vira fallback silencioso infinito", async () => {
    banco.ausentes = ["app_name"];
    const linha = await ler();
    expect(linha).toBeNull();
    expect(banco.pedidos).toHaveLength(4);
  });
});
