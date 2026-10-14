import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

import { AparenciaDaOrganizacao } from "@/app/app/_components/AparenciaDaOrganizacao";
import { scriptDaAparencia } from "@/lib/branding/script-da-aparencia";

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

const BASE = { name: "Deskcomm", logoUrl: null, cor: null, raio: "padrao", barraLateral: "padrao" };
const PADRAO_ORIGENS = { nome: "p", logoUrl: "p", cor: "p", raio: "padrao", barraLateral: "padrao" };

/**
 * /app so liga o override quando a ORGANIZACAO escolheu: sem escolha, o atributo
 * do <html> (instalacao) ja vale e montar o componente seria ruido.
 */
describe("layout de /app — aparencia da organizacao", () => {
  beforeEach(() => {
    estado.marca = null;
    estado.instalacao = {};
  });

  it("organizacao escolheu: monta AparenciaDaOrganizacao com o valor resolvido", async () => {
    estado.marca = { ...BASE, neutros: "frio", origens: { ...PADRAO_ORIGENS, neutros: "organizacao" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, AparenciaDaOrganizacao)?.props).toMatchObject({ aparencia: { neutros: "frio", raio: "padrao" } });
  });

  it("organizacao escolheu: o HTML do servidor ja leva o script que troca antes da pintura", async () => {
    estado.marca = { ...BASE, neutros: "frio", origens: { ...PADRAO_ORIGENS, neutros: "organizacao" } };
    estado.instalacao = { neutros: "cinza" };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    const script = acharOnde(arvore, (el) => el.type === "script");
    const html = (script?.props as { dangerouslySetInnerHTML?: { __html: string } } | undefined)
      ?.dangerouslySetInnerHTML?.__html;
    expect(html).toBe(scriptDaAparencia({ neutros: "frio", raio: "padrao" }));
    // A limpeza devolve a da INSTALACAO, nao o atributo que o script ja trocou.
    expect(achar(arvore, AparenciaDaOrganizacao)?.props).toMatchObject({
      aparencia: { neutros: "frio", raio: "padrao" },
      instalacao: { neutros: "cinza", raio: "padrao" },
    });
  });

  it("organizacao herdou: nao monta", async () => {
    estado.marca = { ...BASE, neutros: "cinza", origens: { ...PADRAO_ORIGENS, neutros: "banco" } };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    expect(achar(arvore, AparenciaDaOrganizacao)).toBeNull();
    expect(acharOnde(arvore, (el) => el.type === "script")).toBeNull();
  });

  it("so o RAIO veio da organizacao: monta, e o script leva o raio e os neutros em vigor", async () => {
    estado.marca = {
      ...BASE,
      neutros: "cinza",
      raio: "suave",
      origens: { ...PADRAO_ORIGENS, neutros: "banco", raio: "organizacao" },
    };
    estado.instalacao = { neutros: "cinza", raio: "arredondado" };
    const { default: AppLayout } = await import("@/app/app/layout");
    const arvore = await AppLayout({ children: null });
    const script = acharOnde(arvore, (el) => el.type === "script");
    const html = (script?.props as { dangerouslySetInnerHTML?: { __html: string } } | undefined)
      ?.dangerouslySetInnerHTML?.__html;
    expect(html).toBe(scriptDaAparencia({ neutros: "cinza", raio: "suave" }));
    expect(achar(arvore, AparenciaDaOrganizacao)?.props).toMatchObject({
      aparencia: { neutros: "cinza", raio: "suave" },
      instalacao: { neutros: "cinza", raio: "arredondado" },
    });
  });
});
