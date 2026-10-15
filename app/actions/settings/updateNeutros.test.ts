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

describe("updateBranding — neutros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.escritaDeAdminOuRecusa.mockResolvedValue({ ok: true, ctx: { user: USER } });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("grava a escolha, invalida o memo e audita", async () => {
    const r = await updateBranding({ ...INSTALACAO, neutros: "frio" });
    expect(r).toEqual({ ok: true });
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({ id: 1, neutros: "frio" });
    expect(mocks.invalidar).toHaveBeenCalled();
    expect(mocks.audit.mock.calls[0]?.[0].metadata).toMatchObject({ neutros: "frio" });
  });

  it("sem neutros na entrada, NAO toca a coluna", async () => {
    const r = await updateBranding(INSTALACAO);
    expect(r).toEqual({ ok: true });
    expect("neutros" in (mocks.upsert.mock.calls[0]?.[0] ?? {})).toBe(false);
  });

  it("valor fora do vocabulario e recusado antes de tudo", async () => {
    const r = await updateBranding({ ...INSTALACAO, neutros: "verde" as never });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("updateMarcaDaOrganizacao — neutros", () => {
  const ORG = { app_name: null, accent_hex: "#2563eb", accent_dark_hex: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.loadAuthUser.mockResolvedValue(USER);
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-1", role: "admin" });
    mocks.mfaEmDivida.mockResolvedValue(false);
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  it("grava a chave quando escolhe", async () => {
    const r = await updateMarcaDaOrganizacao({ ...ORG, neutros: "frio" });
    expect(r).toEqual({ ok: true });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).toMatchObject({ neutros: "frio" });
  });

  it("herdar (null) OMITE a chave — o banco recusa 'neutros' nao-string", async () => {
    await updateMarcaDaOrganizacao({ ...ORG, neutros: null });
    expect("neutros" in mocks.rpc.mock.calls[0]?.[1].p_marca).toBe(false);
  });

  it("tudo vazio limpa a marca inteira", async () => {
    await updateMarcaDaOrganizacao({
      app_name: null, accent_hex: null, accent_dark_hex: null, neutros: null, raio: null, barra_lateral: null, densidade: null,
    });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).toBeNull();
  });

  it("so a escolha de neutros ja e uma marca (nao limpa)", async () => {
    await updateMarcaDaOrganizacao({ app_name: null, accent_hex: null, accent_dark_hex: null, neutros: "cinza" });
    expect(mocks.rpc.mock.calls[0]?.[1].p_marca).toMatchObject({ neutros: "cinza" });
  });
});
