/**
 * Barra lateral escura (`barraLateral: "escura"`): `data-theme="dark"` na raiz
 * da barra — o resto (tokens, troca de logo por `dark:`) vem do CSS. Com o
 * default, nenhum atributo: a saída é a de antes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import { GavetaDeNavegacao } from "@/components/shell/MobileSidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
};

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef, usePermission: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/inbox" }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({ ConnectionHealthDot: () => null }));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

afterEach(cleanup);

describe("Sidebar — barraLateral", () => {
  it("escura: a raiz <aside> leva data-theme=dark", () => {
    render(<Sidebar collapsed={false} barraLateral="escura" />);
    expect(document.querySelector("aside")?.getAttribute("data-theme")).toBe("dark");
  });

  it("padrão (omitido): nenhum data-theme", () => {
    render(<Sidebar collapsed={false} />);
    expect(document.querySelector("aside")?.hasAttribute("data-theme")).toBe(false);
  });

  it('"padrao" explícito é idêntico ao omitido, byte a byte', () => {
    const a = render(<Sidebar collapsed={false} />).container.innerHTML;
    cleanup();
    const b = render(<Sidebar collapsed={false} barraLateral="padrao" />).container.innerHTML;
    expect(b).toBe(a);
  });

  it("escura: o fundo e o texto vêm de tokens, nunca de cor fixa", () => {
    render(<Sidebar collapsed={false} barraLateral="escura" />);
    const cls = document.querySelector("aside")?.className ?? "";
    expect(cls).toMatch(/\bbg-card\b/);
    expect(cls).toMatch(/\btext-foreground\b/);
    expect(cls).not.toMatch(/#[0-9a-f]{3,8}|\[#|bg-black|bg-white/i);
  });
});

describe("Gaveta do celular — barraLateral", () => {
  it("escura: o conteúdo no portal leva data-theme=dark", async () => {
    const { getByRole } = render(<GavetaDeNavegacao barraLateral="escura" />);
    getByRole("button", { name: /Abrir navegação/i }).click();
    const dialogo = await vi.waitFor(() => {
      const el = document.querySelector('[role="dialog"]');
      if (!el) throw new Error("gaveta não abriu");
      return el;
    });
    expect(dialogo.getAttribute("data-theme")).toBe("dark");
  });

  it("padrão: o conteúdo no portal não leva data-theme", async () => {
    const { getByRole } = render(<GavetaDeNavegacao />);
    getByRole("button", { name: /Abrir navegação/i }).click();
    const dialogo = await vi.waitFor(() => {
      const el = document.querySelector('[role="dialog"]');
      if (!el) throw new Error("gaveta não abriu");
      return el;
    });
    expect(dialogo.hasAttribute("data-theme")).toBe(false);
  });
});
