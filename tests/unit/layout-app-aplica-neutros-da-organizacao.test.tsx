import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

import { NeutrosDaOrganizacao } from "@/app/app/_components/NeutrosDaOrganizacao";

const estado = vi.hoisted(() => ({ marca: null as unknown }));

vi.mock("@/lib/channels/health", () => ({ listarConexoesCaidas: async () => [] }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { onboarded_at: "2026-01-01", status: "active", settings: null },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "user-1", idioma: "pt-BR", is_platform_admin: false, support: null, organizations: [] }),
  resolveActiveOrg: async () => ({ orgId: "org-1", role: "admin", interface_settings: null }),
  isMfaEnrolled: async () => true,
  requiresMfa: async () => false,
}));
vi.mock("@/lib/auth/vinculo-revogado", () => ({ acessoFoiRevogado: async () => false }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => ({}) }));
vi.mock("@/lib/branding/organizacao", () => ({ resolverMarcaDaOrganizacao: () => estado.marca }));

function achar(no: ReactNode, alvo: unknown): ReactElement | null {
  if (Array.isArray(no)) {
    for (const f of no) {
      const r = achar(f, alvo);
      if (r) return r;
    }
    return null;
  }
  if (!no || typeof no !== "object" || !("props" in no)) return null;
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (el.type === alvo) return el;
  return achar(el.props.children, alvo);
}

const BASE = { name: "Deskcomm", logoUrl: null, cor: null };

/**
 * /app so liga o override quando a ORGANIZACAO escolheu: sem escolha, o atributo
 * do <html> (instalacao) ja vale e montar o componente seria ruido.
 */
describe("layout de /app — neutros da organizacao", () => {
  beforeEach(() => {
    estado.marca = null;
  });

  it("organizacao escolheu: monta NeutrosDaOrganizacao com o valor resolvido", async () => {
    estado.marca = { ...BASE, neutros: "frio", origens: { nome: "p", logoUrl: "p", cor: "p", neutros: "organizacao" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, NeutrosDaOrganizacao)?.props).toMatchObject({ neutros: "frio" });
  });

  it("organizacao herdou: nao monta", async () => {
    estado.marca = { ...BASE, neutros: "cinza", origens: { nome: "p", logoUrl: "p", cor: "p", neutros: "banco" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, NeutrosDaOrganizacao)).toBeNull();
  });
});
