import type { InfiniteData } from "@tanstack/react-query";

import type { Message } from "@/lib/types/messaging";

/**
 * Bolhas LOCAIS: as mensagens otimistas que a tela mostra antes (ou em vez) de
 * o servidor ter a linha — pendentes (`queued`/`sending`) e falhas à espera de
 * "Tentar de novo". Elas vivem só no cache do cliente; o servidor nunca as viu.
 *
 * Por isso toda escrita da lista passa por `mesclarBolhasLocais` (é o
 * `structuralSharing` da query em `useMessagesRealtime`): o refetch do foco, o
 * do Realtime e o de segurança trocam as páginas pelas do servidor, e sem a
 * mescla a bolha sumia — com ela o "Tentar de novo" e o arquivo.
 */

export interface PaginaDeMensagens {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

/**
 * Quem ainda é DONO de cada bolha local, por id. Só o que está aqui é
 * preservado: o envio tira o id ANTES de trocar a bolha pela mensagem real ou
 * de reenviar, e assim a mescla nunca ressuscita uma bolha removida de propósito.
 */
const DONOS = new Map<string, unknown>();

export function registrarBolhaLocal<T>(id: string, envio: T): void {
  DONOS.set(id, envio);
}

export function envioDaBolhaLocal<T>(id: string): T | undefined {
  return DONOS.get(id) as T | undefined;
}

export function esquecerBolhaLocal(id: string): void {
  DONOS.delete(id);
}

const STATUS_LOCAIS = new Set(["queued", "sending", "failed"]);
const STATUS_PENDENTES = new Set(["queued", "sending"]);

function ehBolhaLocal(m: Message): boolean {
  return m.id.startsWith("temp-") && STATUS_LOCAIS.has(m.status) && DONOS.has(m.id);
}

/**
 * A cópia do servidor de uma bolha PENDENTE: mensagem de saída que chegou
 * NESTA escrita (não estava na lista anterior), do mesmo tipo e com o mesmo
 * texto. O Realtime pode trazer a linha antes de o POST responder; sem isto a
 * conversa mostraria a bolha dobrada até a resposta. A falha não é casada: o
 * envio dela já terminou, e só "Tentar de novo" a resolve.
 */
function ehCopiaDoServidor(local: Message, m: Message, idsAnteriores: Set<string>): boolean {
  return (
    !m.id.startsWith("temp-") &&
    !idsAnteriores.has(m.id) &&
    m.direction === "outbound" &&
    m.type === local.type &&
    (m.body ?? null) === (local.body ?? null)
  );
}

export function mesclarBolhasLocais(
  anterior: InfiniteData<PaginaDeMensagens> | undefined,
  nova: InfiniteData<PaginaDeMensagens> | undefined,
): InfiniteData<PaginaDeMensagens> | undefined {
  if (!anterior || !nova) return nova;
  const locais = anterior.pages.flatMap((p) => p.data).filter(ehBolhaLocal);
  if (locais.length === 0) return nova;

  const idsNovos = new Set(nova.pages.flatMap((p) => p.data.map((m) => m.id)));
  const idsAnteriores = new Set(anterior.pages.flatMap((p) => p.data.map((m) => m.id)));
  const casadas = new Set<string>();
  const preservar = locais.filter((local) => {
    if (idsNovos.has(local.id)) return false;
    if (!STATUS_PENDENTES.has(local.status)) return true;
    const copia = nova.pages
      .flatMap((p) => p.data)
      .find((m) => !casadas.has(m.id) && ehCopiaDoServidor(local, m, idsAnteriores));
    if (!copia) return true;
    casadas.add(copia.id);
    return false;
  });
  if (preservar.length === 0) return nova;

  // A primeira página é a das mensagens mais recentes; é nela que a bolha nasce.
  const [primeira, ...resto] = nova.pages;
  return {
    ...nova,
    pages: [
      { ...(primeira ?? { data: [] }), data: [...(primeira?.data ?? []), ...preservar] },
      ...resto,
    ],
    pageParams: nova.pages.length > 0 ? nova.pageParams : [undefined],
  };
}
