/**
 * A porta do modo da trava de ação afirmada: `/api/v1/settings/acao-afirmada`.
 *
 * Prova o que a rota faz com o settings: grava `agente.acao_afirmada_modo` SEM
 * apagar as outras chaves do settings nem as outras chaves de `agente`, recusa
 * valor fora do vocabulário, leitura que falhou não vira gravação, e o papel
 * mínimo. A guarda de suporte é cobrada por `suporte-cobertura-de-efeitos.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const estado: { settings: Record<string, unknown>; erroDeLeitura: boolean; updates: unknown[] } = {
  settings: {},
  erroDeLeitura: false,
  updates: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            estado.erroDeLeitura
              ? { data: null, error: { message: "falhou" } }
              : { data: { settings: estado.settings }, error: null },
        }),
      }),
      update: (patch: { settings: Record<string, unknown> }) => ({
        eq: async () => {
          estado.updates.push(patch);
          estado.settings = patch.settings;
          return { error: null };
        },
      }),
    }),
  }),
}));

const { GET, PATCH } = await import("@/app/api/v1/settings/acao-afirmada/route");

function sessao(role: Role) {
  const user: AuthUser = {
    id: "22222222-2222-4222-8222-222222222222",
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[role] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

const patch = (corpo: unknown) =>
  PATCH(
    new NextRequest("http://localhost/api/v1/settings/acao-afirmada", {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  estado.settings = {
    routing: { mode: "round_robin" },
    agente: { outra_chave: { x: 1 }, acao_afirmada_modo: "observar" },
  };
  estado.erroDeLeitura = false;
  estado.updates = [];
  vi.mocked(audit).mockClear();
});

describe("/api/v1/settings/acao-afirmada", () => {
  it("GET sem a chave devolve o padrão: observar", async () => {
    sessao("manager");
    estado.settings = {};
    const corpo = await (await GET()).json();
    expect(corpo.data).toEqual({ modo: "observar" });
  });

  it("GET devolve o modo gravado", async () => {
    sessao("manager");
    estado.settings = { agente: { acao_afirmada_modo: "bloquear" } };
    expect((await (await GET()).json()).data).toEqual({ modo: "bloquear" });
  });

  it.each(["observar", "bloquear"] as const)(
    "PATCH aceita %s, preserva as outras chaves e as de `agente`, e audita antes/depois",
    async (modo) => {
      sessao("manager");
      estado.settings = {
        routing: { mode: "round_robin" },
        agente: { outra_chave: { x: 1 }, acao_afirmada_modo: modo === "bloquear" ? "observar" : "bloquear" },
      };
      const antes = (estado.settings.agente as { acao_afirmada_modo: string }).acao_afirmada_modo;
      const res = await patch({ modo });
      expect(res.status).toBe(200);
      expect(estado.settings).toEqual({
        routing: { mode: "round_robin" },
        agente: { outra_chave: { x: 1 }, acao_afirmada_modo: modo },
      });
      expect(vi.mocked(audit)).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "settings.acao_afirmada_updated",
          organizationId: ORG,
          metadata: { de: antes, para: modo },
        }),
      );
    },
  );

  it("PATCH cria `agente` quando o settings ainda não tem", async () => {
    sessao("manager");
    estado.settings = { routing: { mode: "manual" } };
    expect((await patch({ modo: "bloquear" })).status).toBe(200);
    expect(estado.settings).toEqual({ routing: { mode: "manual" }, agente: { acao_afirmada_modo: "bloquear" } });
  });

  it.each([
    ["valor fora do vocabulário", { modo: "desligar" }],
    ["sem o campo", {}],
    ["tipo errado", { modo: true }],
    ["corpo vazio", null],
  ])("PATCH recusa %s (422) e não grava", async (_rotulo, corpo) => {
    sessao("manager");
    expect((await patch(corpo)).status).toBe(422);
    expect(estado.updates).toHaveLength(0);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("leitura que falhou NÃO vira gravação (apagaria o settings inteiro)", async () => {
    sessao("manager");
    estado.erroDeLeitura = true;
    expect((await patch({ modo: "bloquear" })).status).toBe(500);
    expect(estado.updates).toHaveLength(0);
  });

  it("atendente (agent) não muda o modo da organização", async () => {
    sessao("agent");
    expect((await patch({ modo: "bloquear" })).status).toBe(403);
    expect(estado.updates).toHaveLength(0);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });
});
