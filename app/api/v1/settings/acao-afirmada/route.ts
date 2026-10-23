/**
 * GET /api/v1/settings/acao-afirmada — o modo da trava de ação afirmada.
 * PATCH /api/v1/settings/acao-afirmada — grava (manager+).
 *
 * A porta faltava: `organizations.settings.agente.acao_afirmada_modo` só mudava
 * por SQL. A regra (e o padrão `observar`) mora em
 * `lib/agent-engine/guardrails/acao-afirmada.ts`; aqui só se grava o modo.
 * Mesma forma de `settings/assinatura`.
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { z } from "zod";

import {
  MODOS_DA_ACAO_AFIRMADA,
  lerModoDaAcaoAfirmada,
} from "@/lib/agent-engine/guardrails/acao-afirmada";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const entradaSchema = z.object({ modo: z.enum(MODOS_DA_ACAO_AFIRMADA) }).strict();

async function lerSettings(orgId: string) {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return { error };
  return { settings: ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown> };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "agent_claimed_action_mode" });
  if (!authz.ok) return authz.response;

  const lido = await lerSettings(authz.org.orgId);
  if ("error" in lido) return fail("internal_error", lido.error?.message ?? "", 500, { requestId });
  return ok({ modo: lerModoDaAcaoAfirmada(lido.settings) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "agent_claimed_action_mode" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = entradaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { modo } = parsed.data;

  const lido = await lerSettings(authz.org.orgId);
  if ("error" in lido) return fail("internal_error", lido.error?.message ?? "", 500, { requestId });

  const de = lerModoDaAcaoAfirmada(lido.settings);
  const agenteAtual =
    lido.settings.agente && typeof lido.settings.agente === "object" && !Array.isArray(lido.settings.agente)
      ? (lido.settings.agente as Record<string, unknown>)
      : {};

  // Cliente admin: RLS de `organizations` só deixa platform admin escrever.
  const { error } = await createAdminClient()
    .from("organizations")
    .update({ settings: { ...lido.settings, agente: { ...agenteAtual, acao_afirmada_modo: modo } } })
    .eq("id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "settings.acao_afirmada_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { de, para: modo },
  });

  return ok({ modo }, { requestId });
}
