/**
 * `page.tsx` PASSA cantos e menu lateral ao formulário.
 *
 * Já aconteceu de a página esquecer `logo_dark_path` e a prévia mostrar a coisa
 * errada sem erro. O tipo obriga (campos obrigatórios); este teste prova o VALOR.
 */
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ settings: null as unknown, linha: null as unknown }));

vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "u", idioma: "pt-BR", is_platform_admin: false, support: null }),
  resolveActiveOrg: async () => ({ orgId: "org-1", role: "admin" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { settings: estado.settings, country: "BR" } }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => estado.linha }));

function achar(no: ReactNode, nome: string): ReactElement | null {
  if (Array.isArray(no)) {
    for (const f of no) {
      const r = achar(f, nome);
      if (r) return r;
    }
    return null;
  }
  if (!no || typeof no !== "object" || !("props" in no)) return null;
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function" && el.type.name === nome) return el;
  return achar(el.props.children, nome);
}

describe("Configurações › Marca (organização) — page.tsx", () => {
  it("passa raio e barra_lateral gravados e os da instalação", async () => {
    estado.settings = { branding: { raio: "arredondado", barra_lateral: "escura" } };
    estado.linha = { raio: "suave", barra_lateral: "padrao" };
    const { default: Pagina } = await import("@/app/app/settings/marca/page");
    const form = achar(await Pagina(), "FormularioDaMarcaDaOrganizacao");
    const props = form?.props as { gravada: Record<string, unknown>; instalacao: Record<string, unknown> };
    expect(props.gravada).toMatchObject({ raio: "arredondado", barra_lateral: "escura" });
    expect(props.instalacao).toMatchObject({ raio: "suave", barra_lateral: "padrao" });
  });

  it("sem nada gravado: null (herda), nunca undefined", async () => {
    estado.settings = null;
    estado.linha = null;
    const { default: Pagina } = await import("@/app/app/settings/marca/page");
    const form = achar(await Pagina(), "FormularioDaMarcaDaOrganizacao");
    const props = form?.props as { gravada: Record<string, unknown>; instalacao: Record<string, unknown> };
    expect(props.gravada.raio).toBeNull();
    expect(props.gravada.barra_lateral).toBeNull();
    expect(props.instalacao.raio).toBeNull();
    expect(props.instalacao.barra_lateral).toBeNull();
  });
});
