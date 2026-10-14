import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  headers: vi.fn(),
  escritaDeAdminOuRecusa: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  invalidar: vi.fn(),
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
  mfaEmDivida: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/auth/escritaDeAdminOuRecusa", () => ({ escritaDeAdminOuRecusa: mocks.escritaDeAdminOuRecusa }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: mocks.loadAuthUser,
  resolveActiveOrg: mocks.resolveActiveOrg,
  mfaEmDivida: mocks.mfaEmDivida,
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/branding/instalacao", () => ({
  invalidarMarcaDaInstalacao: mocks.invalidar,
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
  accent_hex: "#2563eb",
  accent_dark_hex: null,
  show_powered_by: true,
};

describe("updateBranding — raio e barra lateral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.escritaDeAdminOuRecusa.mockResolvedValue({ ok: true, ctx: { user: USER } });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("grava as escolhas, invalida o memo e audita", async () => {
    const r = await updateBranding({ ...INSTALACAO, raio: "suave", barra_lateral: "escura" });
    expect(r).toEqual({ ok: true });
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({ id: 1, raio: "suave", barra_lateral: "escura" });
    expect(mocks.invalidar).toHaveBeenCalled();
    expect(mocks.audit.mock.calls[0]?.[0].metadata).toMatchObject({ raio: "suave", barra_lateral: "escura" });
  });

  it("sem elas na entrada, NAO toca as colunas (preserva o gravado)", async () => {
    await updateBranding(INSTALACAO);
    const linha = mocks.upsert.mock.calls[0]?.[0] ?? {};
    expect("raio" in linha).toBe(false);
    expect("barra_lateral" in linha).toBe(false);
  });

  it("valor fora do vocabulario e recusado antes de tudo", async () => {
    const r = await updateBranding({ ...INSTALACAO, raio: "quadrado" as never });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("updateMarcaDaOrganizacao — raio e barra lateral", () => {
  const ORG = { app_name: "Acme", accent_hex: null, accent_dark_hex: null, neutros: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.loadAuthUser.mockResolvedValue(USER);
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-1", role: "admin" });
    mocks.mfaEmDivida.mockResolvedValue(false);
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  const marca = () => mocks.rpc.mock.calls[0]?.[1].p_marca as Record<string, unknown>;

  it("grava as chaves quando escolhe", async () => {
    await updateMarcaDaOrganizacao({ ...ORG, raio: "arredondado", barra_lateral: "escura" });
    expect(marca()).toMatchObject({ raio: "arredondado", barra_lateral: "escura" });
  });

  it("salvar so o nome (campos ausentes) NAO manda as chaves — a RPC as preserva", async () => {
    await updateMarcaDaOrganizacao(ORG);
    expect(marca()).toMatchObject({ app_name: "Acme" });
    expect("raio" in marca()).toBe(false);
    expect("barra_lateral" in marca()).toBe(false);
  });

  it("herdar (null) manda null EXPLICITO — e como a RPC sabe que e para apagar", async () => {
    await updateMarcaDaOrganizacao({ ...ORG, raio: null, barra_lateral: null });
    expect(marca().raio).toBeNull();
    expect(marca().barra_lateral).toBeNull();
    expect("raio" in marca()).toBe(true);
  });

  it("tudo vazio SEM dizer raio/barra nao limpa a marca (limpar apagaria o que a tela nao enviou)", async () => {
    await updateMarcaDaOrganizacao({ app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).not.toBeNull();
    expect("raio" in marca()).toBe(false);
  });

  it("tudo vazio, raio e barra explicitamente null: limpa a marca inteira", async () => {
    await updateMarcaDaOrganizacao({
      app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null, raio: null, barra_lateral: null,
    });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).toBeNull();
  });

  it("so o raio ja e uma marca", async () => {
    await updateMarcaDaOrganizacao({ app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null, raio: "suave" });
    expect(marca()).toMatchObject({ raio: "suave" });
  });

  it("valor fora do vocabulario e recusado antes da RPC", async () => {
    const r = await updateMarcaDaOrganizacao({ ...ORG, barra_lateral: "azul" as never });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
