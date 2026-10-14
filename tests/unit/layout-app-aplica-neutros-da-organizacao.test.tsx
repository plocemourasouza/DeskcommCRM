import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

import { NeutrosDaOrganizacao } from "@/app/app/_components/NeutrosDaOrganizacao";
import { scriptDosNeutros } from "@/lib/branding/script-dos-neutros";

const estado = vi.hoisted(() => ({ marca: null as unknown, instalacao: {} as unknown }));

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
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => estado.instalacao }));
vi.mock("@/lib/branding/organizacao", () => ({ resolverMarcaDaOrganizacao: () => estado.marca }));

function achar(no: ReactNode, alvo: unknown): ReactElement | null {
  return acharOnde(no, (el) => el.type === alvo);
}

function acharOnde(no: ReactNode, casa: (el: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(no)) {
    for (const f of no) {
      const r = acharOnde(f, casa);
      if (r) return r;
    }
    return null;
  }
  if (!no || typeof no !== "object" || !("props" in no)) return null;
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (casa(el)) return el;
  return acharOnde(el.props.children, casa);
}

const BASE = { name: "Deskcomm", logoUrl: null, cor: null };

/**
 * /app so liga o override quando a ORGANIZACAO escolheu: sem escolha, o atributo
 * do <html> (instalacao) ja vale e montar o componente seria ruido.
 */
describe("layout de /app — neutros da organizacao", () => {
  beforeEach(() => {
    estado.marca = null;
    estado.instalacao = {};
  });

  it("organizacao escolheu: monta NeutrosDaOrganizacao com o valor resolvido", async () => {
    estado.marca = { ...BASE, neutros: "frio", origens: { nome: "p", logoUrl: "p", cor: "p", neutros: "organizacao" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, NeutrosDaOrganizacao)?.props).toMatchObject({ neutros: "frio" });
  });

  it("organizacao escolheu: o HTML do servidor ja leva o script que troca antes da pintura", async () => {
    estado.marca = { ...BASE, neutros: "frio", origens: { nome: "p", logoUrl: "p", cor: "p", neutros: "organizacao" } };
    estado.instalacao = { neutros: "cinza" };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    const script = acharOnde(arvore, (el) => el.type === "script");
    const html = (script?.props as { dangerouslySetInnerHTML?: { __html: string } } | undefined)
      ?.dangerouslySetInnerHTML?.__html;
    expect(html).toBe(scriptDosNeutros("frio"));
    // A limpeza devolve a da INSTALACAO, nao o atributo que o script ja trocou.
    expect(achar(arvore, NeutrosDaOrganizacao)?.props).toMatchObject({ neutros: "frio", instalacao: "cinza" });
  });

  it("organizacao herdou: nao monta", async () => {
    estado.marca = { ...BASE, neutros: "cinza", origens: { nome: "p", logoUrl: "p", cor: "p", neutros: "banco" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, NeutrosDaOrganizacao)).toBeNull();
    expect(acharOnde(arvore, (el) => el.type === "script")).toBeNull();
  });
});
