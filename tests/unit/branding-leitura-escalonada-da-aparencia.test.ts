/**
 * CÓDIGO NOVO SOBRE BANCO ANTIGO: a leitura da marca da instalação cai por
 * degraus, e faltar UMA coluna de aparência nunca leva as outras embora.
 *
 *   1. todas as colunas;
 *   2. sem `cores` (banco na 0706, ainda sem a 0707);
 *   3. sem `cores` e `fonte` (banco na 0705, ainda sem a 0706);
 *   4. sem `cores`, `fonte` e `densidade` (banco na 0704, ainda sem a 0705);
 *   5. sem `cores`, `raio`, `barra_lateral`, `densidade` e `fonte` (anterior à 0704).
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
  it("banco em dia: uma ida, com densidade, fonte e cores", async () => {
    await ler();
    expect(banco.pedidos).toHaveLength(1);
    expect(banco.pedidos[0]).toContain("densidade");
    expect(banco.pedidos[0]).toContain("fonte");
    expect(banco.pedidos[0]).toContain("cores");
  });

  it("sem a coluna cores (0706 sem 0707): segunda ida mantém fonte, densidade, raio e barra", async () => {
    banco.ausentes = ["cores"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(2);
    expect(banco.pedidos[1]).not.toContain("cores");
    expect(banco.pedidos[1]).toContain("raio, barra_lateral, densidade, fonte");
  });

  it("sem cores e fonte (0705 sem 0706): terceira ida mantém raio, barra e densidade", async () => {
    banco.ausentes = ["cores", "fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(3);
    expect(banco.pedidos[2]).not.toMatch(/fonte|cores/);
    expect(banco.pedidos[2]).toContain("raio, barra_lateral, densidade");
  });

  it("sem cores, fonte e densidade (0704 sem 0705): quarta ida mantém raio e barra", async () => {
    banco.ausentes = ["cores", "densidade", "fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(4);
    expect(banco.pedidos[3]).not.toMatch(/densidade|fonte|cores/);
    expect(banco.pedidos[3]).toContain("raio, barra_lateral");
  });

  it("banco anterior à 0704: quinta ida sem nenhuma das cinco", async () => {
    banco.ausentes = ["cores", "densidade", "raio", "barra_lateral", "fonte"];
    const linha = await ler();
    expect(linha?.app_name).toBe("Revenda");
    expect(banco.pedidos).toHaveLength(5);
    expect(banco.pedidos[4]).not.toMatch(/densidade|raio|barra_lateral|fonte|cores/);
  });

  it("42703 de coluna que NÃO é de aparência não vira fallback silencioso infinito", async () => {
    banco.ausentes = ["app_name"];
    const linha = await ler();
    expect(linha).toBeNull();
    expect(banco.pedidos).toHaveLength(5);
  });
});
