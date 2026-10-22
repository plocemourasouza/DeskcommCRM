/**
 * O ELO ATÉ O GOOGLE de `crm_add_contact_to_appointment_invite`.
 *
 * A ferramenta põe o e-mail do cliente em `guest_email` de um compromisso JÁ
 * publicado. Isto prova que essa escrita é suficiente para o Google receber o
 * cliente como participante — sem reabrir a decisão do dono (doc 36) de que o
 * e-mail da FICHA sozinho não convida compromisso antigo:
 *
 *   - `guest_email` muda a projeção local (grupo `guest`), e `compare` decide
 *     `publish` — é o mesmo caminho de quem digita um convidado na tela;
 *   - o `delta` leva o cliente em `attendees` UMA vez, mesmo com o e-mail da
 *     ficha igual ao convidado (o Google recusa o evento com e-mail repetido);
 *   - depois de publicado, o remoto relido converge: não há reenvio em laço.
 */
import { describe, expect, it } from "vitest";

import {
  checkpoint,
  comConviteDaFicha,
  compare,
  delta,
  localProjection,
  remoteProjection,
} from "@/lib/agenda/google/sync-model";
import type { AgendamentoParaGoogle } from "@/lib/agenda/google/evento";

const CLIENTE = "cliente@exemplo.com.br";

const publicado: AgendamentoParaGoogle & { guest_email: string | null } = {
  id: "a",
  organization_id: "o",
  title: "Reunião",
  starts_at: "2026-10-26T18:00:00Z",
  ends_at: "2026-10-26T19:00:00Z",
  time_zone: "America/Sao_Paulo",
  status: "confirmed",
  location_kind: "in_person",
  guest_email: null,
};
/** No Google, só com o organizador — o contato não tinha e-mail quando publicou. */
const evento = {
  id: "remote",
  etag: "e1",
  summary: "Reunião",
  start: { dateTime: publicado.starts_at, timeZone: publicado.time_zone },
  end: { dateTime: publicado.ends_at },
  attendees: [{ email: "dono@empresa.com", organizer: true }],
};
const local0 = localProjection(publicado);
const base = checkpoint(null, local0, remoteProjection(evento, local0, null), ["title", "description", "location", "guest"], true);

describe("cliente no convite pelo agente — guest_email leva ao Google", () => {
  it("controle: sem a escrita, o compromisso parado continua convergido (doc 36)", () => {
    const d = comConviteDaFicha(compare(base, local0, remoteProjection(evento, local0, base)), {
      temEmail: true,
      eventoJaTemOEmail: false,
      cancelado: false,
    });
    expect(d.kind).toBe("converged");
  });

  it("com guest_email = e-mail do cliente: publish com o grupo guest e o cliente em attendees uma vez", () => {
    const comCliente = { ...publicado, guest_email: CLIENTE };
    const local = localProjection(comCliente);
    const d = comConviteDaFicha(compare(base, local, remoteProjection(evento, local, base)), {
      temEmail: true,
      eventoJaTemOEmail: false,
      cancelado: false,
    });
    expect(d.kind).toBe("publish");
    expect(d.groups).toContain("guest");

    const corpo = delta(
      { ...comCliente, contact_email: CLIENTE, contact_nome: "Cliente" },
      evento,
      base,
      d.groups,
      d.shared,
    ) as { attendees?: Array<{ email?: string; organizer?: boolean }> };
    const emails = (corpo.attendees ?? []).map((p) => p.email?.toLowerCase());
    expect(emails.filter((e) => e === CLIENTE)).toHaveLength(1);
    // O organizador continua no evento.
    expect(emails).toContain("dono@empresa.com");
  });

  it("depois de publicado, o remoto relido converge — nada de reenviar em laço", () => {
    const comCliente = { ...publicado, guest_email: CLIENTE };
    const local = localProjection(comCliente);
    const depois = {
      ...evento,
      etag: "e2",
      attendees: [...evento.attendees, { email: CLIENTE, responseStatus: "needsAction" }],
    };
    const remoto = remoteProjection(depois, local, base);
    const novaBase = checkpoint(base, local, remoto, ["guest"], false);
    const d = comConviteDaFicha(compare(novaBase, local, remoteProjection(depois, local, novaBase)), {
      temEmail: true,
      eventoJaTemOEmail: true,
      cancelado: false,
    });
    expect(d.kind).toBe("converged");
  });
});
