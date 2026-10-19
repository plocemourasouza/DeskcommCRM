import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A TRAVA de contraste nas duas server actions de marca.
 *
 * A tela roda a mesma função pura e desabilita o "Salvar" — mas tela não é
 * fronteira: um POST direto na action chega aqui sem passar por ela. Quem
 * decide é o servidor, contra a pilha RESOLVIDA (a empresa sobre a instalação
 * de hoje), e recusa com o par que falhou.
 */

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  headers: vi.fn(),
  escritaDeAdminOuRecusa: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  invalidar: vi.fn(),
  marcaDaInstalacao: vi.fn(),
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
  mfaEmDivida: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/env", () => ({ env: { APP_ACCENT_HEX: undefined, APP_NAME: undefined } }));
vi.mock("@/lib/auth/escritaDeAdminOuRecusa", () => ({
  escritaDeAdminOuRecusa: mocks.escritaDeAdminOuRecusa,
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: mocks.loadAuthUser,
  resolveActiveOrg: mocks.resolveActiveOrg,
  mfaEmDivida: mocks.mfaEmDivida,
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/branding/instalacao", () => ({
  invalidarMarcaDaInstalacao: mocks.invalidar,
  marcaDaInstalacao: mocks.marcaDaInstalacao,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ upsert: mocks.upsert }), rpc: mocks.rpc }),
}));

import { updateBranding } from "./updateBranding";
import { updateMarcaDaOrganizacao } from "./updateMarcaDaOrganizacao";

const USER = { id: "00000000-0000-4000-8000-000000000001", support: null };
const INSTALACAO = {
  app_name: null,
  logo_url: null,
  accent_hex: null,
  accent_dark_hex: null,
  show_powered_by: true,
};
const ORG = { app_name: "Acme", accent_hex: null, accent_dark_hex: null, neutros: null };

/** Texto secundário que some no cartão escuro: 4a4840 sobre 1d1c17. */
const ILEGIVEL = { escuro: { "text-muted": "#4a4840" } } as const;
const LEGIVEL = { claro: { bg: "#ffffff", text: "#000000" } } as const;

describe("updateBranding — cores do tema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.escritaDeAdminOuRecusa.mockResolvedValue({ ok: true, ctx: { user: USER } });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.marcaDaInstalacao.mockResolvedValue(null);
  });

  it("cores legíveis gravam na coluna", async () => {
    const r = await updateBranding({ ...INSTALACAO, cores: LEGIVEL });
    expect(r).toEqual({ ok: true });
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({ id: 1, cores: LEGIVEL });
  });

  it("par sem contraste é RECUSADO com o par que falhou, e nada é gravado", async () => {
    const r = await updateBranding({ ...INSTALACAO, cores: ILEGIVEL });
    expect(r).toMatchObject({ ok: false, error: "cores_sem_contraste" });
    const details = (r as { details: Array<Record<string, unknown>> }).details;
    expect(details).toContainEqual(
      expect.objectContaining({
        papel: "--color-text-muted",
        superficie: "--color-surface",
        tema: "escuro",
        piso: 4.5,
      }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a trava mede com a cor da marca enviada: a caminhada é refeita sobre o fundo novo", async () => {
    // Fundo verde-médio no claro: a cor do produto (sem marca) se perde nele.
    const r = await updateBranding({ ...INSTALACAO, cores: { claro: { bg: "#6f8a66" } } });
    expect(r).toMatchObject({ ok: false, error: "cores_sem_contraste" });
  });

  it("forma fora da allowlist é validation_failed antes de tudo", async () => {
    const r = await updateBranding({ ...INSTALACAO, cores: { claro: { bg: "#FFFFFF" } } as never });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sem cores na entrada, NÃO toca a coluna (preserva o gravado)", async () => {
    await updateBranding(INSTALACAO);
    expect("cores" in (mocks.upsert.mock.calls[0]?.[0] ?? {})).toBe(false);
  });
});

describe("updateMarcaDaOrganizacao — cores do tema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.loadAuthUser.mockResolvedValue(USER);
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-1", role: "admin" });
    mocks.mfaEmDivida.mockResolvedValue(false);
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    mocks.marcaDaInstalacao.mockResolvedValue(null);
  });

  const marca = () => mocks.rpc.mock.calls[0]?.[1].p_marca as Record<string, unknown>;

  it("cores legíveis vão para a RPC", async () => {
    const r = await updateMarcaDaOrganizacao({ ...ORG, cores: LEGIVEL });
    expect(r).toEqual({ ok: true });
    expect(marca()).toMatchObject({ cores: LEGIVEL });
  });

  it("par sem contraste é recusado com o par — a RPC nem é chamada", async () => {
    const r = await updateMarcaDaOrganizacao({ ...ORG, cores: ILEGIVEL });
    expect(r).toMatchObject({ ok: false, error: "cores_sem_contraste" });
    expect((r as { details: unknown[] }).details.length).toBeGreaterThan(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a trava inclui a camada da INSTALAÇÃO de hoje", async () => {
    // A instalação acinzentou o cartão do tema claro (#eeeeee — passa sozinha,
    // com todo papel do produto acima do piso); a empresa só mexe no texto
    // principal (#6d6d6d): contra as superfícies do PRODUTO ele passa (4,66 no
    // pior caso), mas sobre o cartão da instalação dá 4,46 — abaixo de 4,5.
    // Uma trava que medisse a empresa sozinha deixaria passar.
    mocks.marcaDaInstalacao.mockResolvedValue({
      app_name: null,
      accent_hex: null,
      cores: { claro: { surface: "#eeeeee" } },
    });
    const sozinha = await updateMarcaDaOrganizacao({ ...ORG, cores: { claro: { text: "#6d6d6d" } } });
    expect(sozinha).toMatchObject({ ok: false, error: "cores_sem_contraste" });
    expect((sozinha as { details: Array<Record<string, unknown>> }).details).toContainEqual(
      expect.objectContaining({ papel: "--color-text", superficie: "--color-surface", tema: "claro" }),
    );
    // Controle: sem a camada da instalação, a mesma escolha passa.
    mocks.marcaDaInstalacao.mockResolvedValue(null);
    expect(
      await updateMarcaDaOrganizacao({ ...ORG, cores: { claro: { text: "#6d6d6d" } } }),
    ).toEqual({ ok: true });
  });

  it("null = herdar: a chave vai como null (a pilha sem as cores da empresa passa)", async () => {
    const r = await updateMarcaDaOrganizacao({ ...ORG, cores: null });
    expect(r).toEqual({ ok: true });
    expect(marca()).toMatchObject({ cores: null });
  });

  it("ausente = não mexa: a chave não vai", async () => {
    await updateMarcaDaOrganizacao(ORG);
    expect("cores" in marca()).toBe(false);
  });

  it("'limpar tudo' só limpa quando as cores também vêm vazias", async () => {
    const vazio = { app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null };
    await updateMarcaDaOrganizacao({
      ...vazio,
      raio: null,
      barra_lateral: null,
      densidade: null,
      fonte: null,
      cores: LEGIVEL,
    });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).not.toBeNull();
    mocks.rpc.mockClear();
    await updateMarcaDaOrganizacao({
      ...vazio,
      raio: null,
      barra_lateral: null,
      densidade: null,
      fonte: null,
      cores: null,
    });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).toBeNull();
  });
});
