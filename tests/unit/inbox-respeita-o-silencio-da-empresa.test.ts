/**
 * Resposta humana pelo Inbox obedece `routing.manual_reply_silence_minutes`
 * da empresa: 0 = a IA não se cala; N = N minutos; ajuste ausente = os 5 min
 * de sempre (compatibilidade com quem nunca abriu a tela).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import { criarDubleDoHandler } from "@/tests/helpers/duble-do-handler";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const ctx: HandlerCtx = { organization_id: ORG, actor: { type: "user", id: USER }, requestId: "req-1" };

async function enviar(settings: Record<string, unknown>, silencioAtual: string | null = null) {
  vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
  vi.stubEnv("WAHA_API_KEY", "hash123");
  const { supabase, capturas } = criarDubleDoHandler({
    organizacao: { settings, status: "active" },
    conversation: {
      id: CONV,
      organization_id: ORG,
      contact_id: CONTACT,
      channel_session_id: SESSION,
      is_group: false,
      group_chat_id: null,
      bot_silenced_until: silencioAtual,
      contacts: { phone_number: "+5531999998888", wa_identity: null, is_blocked: false },
      channel_sessions: { provider: "waha", waha_session_name: "default", status: "WORKING", archived_at: null },
    },
  });
  const antes = Date.now();
  await sendMessageHandler(supabase, ctx, { conversation_id: CONV, type: "text", body: "oi" } as SendMessageInput);
  const patch = capturas.patches.conversations?.at(-1) ?? {};
  const ate = patch.bot_silenced_until as string | undefined;
  return { patch, minutos: ate ? (new Date(ate).getTime() - antes) / 60000 : null };
}

describe("Inbox × silêncio da empresa", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("0 minutos: a IA não é silenciada", async () => {
    const { patch } = await enviar({ routing: { manual_reply_silence_minutes: 0 } });
    expect(patch).not.toHaveProperty("bot_silenced_until");
  });

  it("30 minutos configurados: silencia por 30", async () => {
    const { minutos } = await enviar({ routing: { manual_reply_silence_minutes: 30 } });
    expect(minutos).toBeGreaterThan(29.9);
    expect(minutos).toBeLessThan(30.1);
  });

  it("ajuste nunca definido: mantém os 5 minutos de sempre", async () => {
    const { minutos } = await enviar({});
    expect(minutos).toBeGreaterThan(4.9);
    expect(minutos).toBeLessThan(5.1);
  });

  it("silêncio 'infinity' em curso não é encurtado", async () => {
    const { patch } = await enviar({ routing: { manual_reply_silence_minutes: 30 } }, "infinity");
    expect(patch).not.toHaveProperty("bot_silenced_until");
  });
});
