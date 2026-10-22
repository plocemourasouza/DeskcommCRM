/**
 * O AGENTE PÕE O CLIENTE NO CONVITE DO GOOGLE (decisão do dono, 22/10/2026).
 *
 * O cenário: a reunião já está marcada e publicada no Google, o contato chegou
 * pelo WhatsApp SEM e-mail, alguém pede o e-mail na conversa e o cliente
 * responde. Até aqui o agente só podia PROPOR o e-mail (`crm_propose_contact_field`,
 * uma pessoa confirma depois) e nada levava o cliente ao convite — e, mesmo com
 * o e-mail na ficha, um evento já publicado não ganha participante sozinho
 * (doc 36: o e-mail da FICHA só acompanha uma alteração, para uma atualização
 * não disparar convite em massa).
 *
 * ═══ AS TRÊS SITUAÇÕES DA FICHA ═══
 *
 *  - SEM e-mail → grava (o cliente acabou de dizer, e não há o que perder).
 *  - MESMO e-mail → nada a gravar; segue para o convite.
 *  - OUTRO e-mail → NÃO sobrescreve: vira proposta que uma pessoa confirma, e o
 *    convite fica como está. Trocar um e-mail que já existe é decisão de gente.
 *
 * ═══ O CAMINHO ATÉ O GOOGLE (sem chamar o Google aqui) ═══
 *
 *  - compromisso AINDA NÃO publicado → nada a fazer: a primeira ida (POST) já
 *    monta os participantes com o e-mail da ficha (`participantesDoAgendamento`).
 *  - compromisso JÁ publicado → grava `guest_email` = o e-mail do cliente. É a
 *    coluna que o stamp SQL (`fn_google_projection_stamp`) enxerga: ela sobe a
 *    revisão local, o cron `agenda-google-push` pega o compromisso, e o `delta`
 *    leva o cliente em `attendees` uma vez só (o e-mail da ficha e o convidado
 *    são o mesmo, e a montagem não repete). É o mesmo efeito de alguém digitar o
 *    convidado na tela — e por isso não reabre o doc 36: é UM compromisso, que o
 *    cliente pediu, não uma varredura.
 *  - já há OUTRO convidado (o consultor, #2077) → não troca: a recusa diz que a
 *    equipe inclui pela tela.
 *
 * ⚠️ `ctx.supabase` É SERVICE ROLE: toda leitura filtra `ctx.organizationId`, e a
 * escrita da ficha passa por `patchContactHandler`, que filtra de novo, recusa
 * anonimizado (LGPD) e audita `contact.updated` com o par antes/depois.
 */
import { z } from "zod";

import { alterarAgendamentoHandler } from "@/app/api/v1/agenda/agendamentos/_handler";
import { patchContactHandler } from "@/app/api/v1/contacts/_handler";
import { ApiError } from "@/lib/api/types";
import { proporDadoDoContato } from "@/lib/contacts/proposta-de-dado";
import { rotuloLocal } from "@/lib/tempo/agora";
import type { McpContext, McpToolDefinition } from "@/lib/mcp/types";

/** Mesmo critério do CHECK `contacts_email_format`, além do `.email()` do zod. */
const FORMATO_DO_BANCO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emailValido = z.string().email().max(320);

/** Quantos compromissos futuros do contato a ferramenta considera sem `appointment_id`. */
const TETO_DE_COMPROMISSOS = 5;

type Compromisso = {
  id: string;
  status: string;
  starts_at: string;
  time_zone: string | null;
  owner_user_id: string | null;
  guest_email: string | null;
  google_event_id: string | null;
};

type DesfechoDoCompromisso = {
  appointment_id: string;
  quando?: string;
  incluido: boolean;
  motivo?: string;
};

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  contato_nao_encontrado: "não encontrei esse contato nesta conta. Nada foi gravado.",
  contato_anonimizado:
    "esse contato exerceu o direito de exclusão de dados; não é possível registrar o e-mail dele.",
  email_invalido:
    "o e-mail não tem um formato válido. Nada foi gravado — confirme o endereço com a pessoa.",
  email_nao_gravado:
    "não consegui gravar o e-mail na ficha agora (ele pode já estar em outro cadastro). Nada foi " +
    "incluído no convite: diga que a equipe confere e inclui.",
  sem_compromisso:
    "o e-mail ficou na ficha, mas este contato não tem compromisso futuro marcado — não há convite " +
    "para atualizar agora. O próximo agendamento já sai com o e-mail.",
  agenda_sem_google:
    "o e-mail ficou na ficha, mas a agenda de quem atende não está ligada ao Google: não há convite " +
    "a enviar. Não diga que o convite foi enviado.",
  convite_tem_outro_convidado:
    "o e-mail ficou na ficha, mas o convite desse compromisso já tem outro convidado e só uma " +
    "pessoa da equipe pode trocar. Não diga que o convite foi enviado; diga que a equipe inclui.",
};

function mensagemDoMotivo(motivo: string): string {
  return (
    MENSAGEM_POR_MOTIVO[motivo] ??
    "não consegui incluir no convite agora. Não diga que o convite foi enviado; diga que a equipe confere."
  );
}

async function compromissosAlvo(
  ctx: McpContext,
  contactId: string,
  appointmentId: string | undefined,
): Promise<Compromisso[]> {
  let q = ctx.supabase
    .from("calendar_appointments")
    .select("id,status,starts_at,time_zone,owner_user_id,guest_email,google_event_id")
    .eq("organization_id", ctx.organizationId)
    .eq("contact_id", contactId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString());
  if (appointmentId) q = q.eq("id", appointmentId);
  const { data, error } = await q.order("starts_at", { ascending: true }).limit(TETO_DE_COMPROMISSOS);
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []) as Compromisso[];
}

async function donoTemGoogle(ctx: McpContext, ownerUserId: string | null): Promise<boolean> {
  if (!ownerUserId) return false;
  const { data, error } = await ctx.supabase
    .from("calendar_connections")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", ownerUserId)
    .eq("status", "healthy")
    .limit(1);
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []).length > 0;
}

async function levarAoConvite(
  ctx: McpContext,
  c: Compromisso,
  email: string,
): Promise<DesfechoDoCompromisso> {
  const base: DesfechoDoCompromisso = {
    appointment_id: c.id,
    ...(c.time_zone ? { quando: rotuloLocal(new Date(c.starts_at), c.time_zone) } : {}),
    incluido: false,
  };

  // Ainda não foi ao Google: a primeira ida (POST) já leva o e-mail da ficha.
  if (!c.google_event_id) {
    return (await donoTemGoogle(ctx, c.owner_user_id))
      ? { ...base, incluido: true }
      : { ...base, motivo: "agenda_sem_google" };
  }

  const convidado = c.guest_email?.trim().toLowerCase() ?? "";
  if (convidado === email) return { ...base, incluido: true };
  if (convidado !== "") return { ...base, motivo: "convite_tem_outro_convidado" };

  try {
    await alterarAgendamentoHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      { id: c.id, guest_email: email },
    );
    return { ...base, incluido: true };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return { ...base, motivo: e.code };
  }
}

const shape = {
  contact_id: z.string().uuid().describe("o cliente desta conversa"),
  email: z
    .string()
    .min(3)
    .max(320)
    .describe("o e-mail exatamente como o cliente escreveu na conversa"),
  appointment_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "o compromisso cujo convite deve receber o cliente (de `crm_list_appointments`). Sem ele, vale " +
        "para os próximos compromissos marcados deste cliente.",
    ),
};

export const crmAddContactToAppointmentInvite: McpToolDefinition<typeof shape> = {
  name: "crm_add_contact_to_appointment_invite",
  description:
    "Grava o e-mail que o CLIENTE informou na conversa e o inclui no convite do Google Agenda do " +
    "compromisso dele. Use quando o cliente mandar o e-mail para receber o convite (por exemplo, " +
    "depois que alguém da equipe pediu). Se a ficha não tem e-mail, ele é gravado; se já tem o MESMO, " +
    "segue direto ao convite; se tem OUTRO, NADA é trocado — vira uma proposta que a equipe confirma, " +
    "e o convite fica com o e-mail que já estava. " +
    "O convite é enviado pela sincronização com o Google em instantes, não na hora: com " +
    "`incluido_no_convite: true` diga que o convite vai chegar no e-mail; com `false`, NÃO diga que " +
    "o convite foi enviado — siga a `mensagem`. Se o cliente não quiser dar e-mail, o compromisso " +
    "continua marcado do mesmo jeito: não insista.",
  inputSchema: shape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const recusa = (motivo: string, extra: Record<string, unknown> = {}) => ({
      email_gravado: false,
      incluido_no_convite: false,
      convite_enviado: false,
      motivo,
      mensagem: mensagemDoMotivo(motivo),
      ...extra,
    });

    const email = input.email.trim().toLowerCase();
    if (!emailValido.safeParse(email).success || !FORMATO_DO_BANCO.test(email)) {
      return recusa("email_invalido");
    }

    const { data: contato, error } = await ctx.supabase
      .from("contacts")
      .select("id,email,is_anonymized")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.contact_id)
      .maybeSingle();
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    if (!contato) return recusa("contato_nao_encontrado");
    const ficha = contato as { email: string | null; is_anonymized: boolean | null };
    if (ficha.is_anonymized === true) return recusa("contato_anonimizado");

    const atual = ficha.email?.trim().toLowerCase() ?? "";

    // OUTRO e-mail na ficha: trocar é decisão de gente. O convite fica com o atual.
    if (atual !== "" && atual !== email) {
      const p = await proporDadoDoContato(ctx.supabase, {
        organizationId: ctx.organizationId,
        contactId: input.contact_id,
        campo: "email",
        valor: email,
        trecho: input.email,
      });
      return {
        ...recusa("ficha_tem_outro_email"),
        proposta_criada: p.criada,
        mensagem:
          "a ficha deste cliente já tem OUTRO e-mail, e ele não foi trocado: o convite continua indo " +
          "para o e-mail que já estava. O novo ficou para uma pessoa da equipe confirmar. Não diga que " +
          "o convite foi para o e-mail novo.",
      };
    }

    let emailGravado = false;
    if (atual === "") {
      try {
        await patchContactHandler(
          ctx.supabase,
          { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
          input.contact_id,
          {
            email,
            // A base legal no mesmo ato, no formato que a confirmação de proposta
            // grava e que `lib/lgpd/export-collector.ts` lê (L-05, transacional:
            // o próprio cliente informou para receber o convite).
            consent: {
              transactional: {
                granted: true,
                granted_at: new Date().toISOString(),
                source: "informado pelo titular em atendimento para receber o convite da agenda",
              },
            },
          } as never,
        );
        emailGravado = true;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        if (e.code === "lgpd_anonymization_irreversible") return recusa("contato_anonimizado");
        if (e.code === "not_found") return recusa("contato_nao_encontrado");
        return recusa("email_nao_gravado");
      }
    }

    const alvos = await compromissosAlvo(ctx, input.contact_id, input.appointment_id);
    if (alvos.length === 0) {
      return { ...recusa("sem_compromisso"), email_gravado: emailGravado };
    }

    const compromissos: DesfechoDoCompromisso[] = [];
    for (const c of alvos) compromissos.push(await levarAoConvite(ctx, c, email));

    const incluido = compromissos.some((c) => c.incluido);
    if (!incluido) {
      const motivo = compromissos[0]?.motivo ?? "internal_error";
      return { ...recusa(motivo), email_gravado: emailGravado, compromissos };
    }
    return {
      email_gravado: emailGravado,
      incluido_no_convite: true,
      // O Google ainda não recebeu: quem envia é o cron de sincronização.
      convite_enviado: false,
      compromissos,
      mensagem:
        "o cliente foi incluído no convite e a sincronização com o Google envia o convite para o " +
        "e-mail dele em instantes. Diga que o convite vai chegar no e-mail — não que já chegou.",
    };
  },
};
