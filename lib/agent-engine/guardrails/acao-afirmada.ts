/**
 * AÇÃO AFIRMADA SEM FERRAMENTA — o agente diz ao cliente que FEZ algo que nenhuma
 * ferramenta fez neste turno.
 *
 * ═══ O que foi medido ═══
 *
 * Produção, 2026-10-22: o cliente mandou o e-mail; o agente não tinha ferramenta
 * para gravá-lo e respondeu "Anotado, Willian! E-mail registrado. 👍". Nada foi
 * registrado, e nenhuma conferência parou a frase. A mesma forma serve a
 * "agendei", "cancelei", "convite enviado", "passei para a equipe", "atualizei
 * seu cadastro": a frase afirma um efeito, e o efeito não existe.
 *
 * O `agendaStallGate` já cobria um pedaço (agenda), mas aceita a ferramenta
 * CHAMADA mesmo quando a chamada FALHOU (`marcado: false`). Aqui só vale o
 * COMPROVANTE: o retorno da ferramenta dizendo que fez.
 *
 * ═══ O que este módulo é ═══
 *
 * Puro (sem rede; a única leitura de banco é o knob, isolada no fim):
 *
 *  - `detectarAcoesAfirmadas` — regex em pt-BR, sem acento, só formas de ação
 *    CONCLUÍDA em primeira pessoa ("agendei") ou de estado ("está agendado").
 *    Pergunta, condicional ("se você confirmar…"), negação ("ainda não agendei")
 *    e futuro ("vou agendar") ficam de fora — promessa é de outros gates.
 *  - `FERRAMENTAS_QUE_COMPROVAM` — categoria → o que comprova.
 *  - `comprovantesDoResultado` — o predicado de sucesso, por formato de retorno.
 *  - `acoesNaoComprovadas` — o que o gate lê.
 *
 * ═══ Os dois modos (knob da organização) ═══
 *
 * `organizations.settings.agente.acao_afirmada_modo`: `observar` (padrão de
 * TODA organização — regex sem medição de falso positivo em produção não decide
 * nada sozinha) ou `bloquear`. A postura de `observar` é a da conferência de fato
 * (`factual-claim.ts`, estado `observando`): passa, e deixa o registro.
 */
import { z } from 'zod';

import type { Queryable } from '../queue/queue';

export const CATEGORIAS_DE_ACAO = [
  'dado_gravado',
  'agendamento',
  'remarcacao',
  'cancelamento',
  'convite',
  'equipe_acionada',
  'funil',
] as const;
export type CategoriaDeAcao = (typeof CATEGORIAS_DE_ACAO)[number];

/** Código do veto (modo `bloquear`) e da observação (modo `observar`) no trace. */
export const CODIGO_ACAO_NAO_EXECUTADA = 'acao_nao_executada';
export const CODIGO_ACAO_OBSERVADA = 'acao_nao_executada_observada';

/**
 * O que COMPROVA cada categoria. Nomes de ferramenta (catálogo MCP ou nativas do
 * turno) e, em um caso, um comprovante parcial (`<ferramenta>:email`).
 *
 * Decisões declaradas:
 *  - `crm_propose_contact_field` NÃO comprova nada: proposta não grava. "E-mail
 *    registrado" depois de uma proposta é exatamente a frase falsa que este gate
 *    existe para barrar — a ficha só muda quando a equipe confirma.
 *  - `save_lead_note` comprova `dado_gravado`: a nota é persistida e relida nos
 *    turnos seguintes. O defeito medido é "nada foi gravado em lugar nenhum".
 *  - `agendamento` aceita `crm_confirm_appointment` e a remarcação: "está
 *    confirmado para quinta" depois de remarcar é verdade.
 *  - `equipe_acionada` também é comprovada por caso humano já aberto (`casoAberto`).
 */
export const FERRAMENTAS_QUE_COMPROVAM: Readonly<Record<CategoriaDeAcao, readonly string[]>> = {
  dado_gravado: [
    'crm_add_contact_to_appointment_invite',
    'crm_add_contact_to_appointment_invite:email',
    'crm_update_lead',
    'crm_create_lead',
    'save_lead_note',
  ],
  agendamento: [
    'crm_book_appointment',
    'crm_find_and_book_appointment',
    'crm_confirm_appointment',
    'crm_reschedule_appointment',
  ],
  remarcacao: ['crm_reschedule_appointment'],
  cancelamento: ['crm_cancel_appointment', 'crm_cancel_followup'],
  convite: [
    'crm_add_contact_to_appointment_invite',
    'crm_book_appointment',
    'crm_find_and_book_appointment',
  ],
  equipe_acionada: [
    'open_human_case',
    'provide_case_update',
    'request_human_handoff',
    'crm_request_human_handoff',
    'crm_assign_conversation',
    'crm_add_case_note',
  ],
  funil: [
    'crm_update_lead',
    'crm_move_lead_stage',
    'crm_create_lead',
    'update_lead_state',
    'crm_draft_proposal',
    'crm_preparar_proposta',
    'crm_retomar_lead',
  ],
};

// ── O predicado de sucesso ──────────────────────────────────────────────────

/**
 * Chaves com que as ferramentas de negócio dizem "NÃO fiz" sem lançar
 * (`semDerrubarOTurno` em `lib/mcp/tools/agendamento.ts` devolve `{ marcado: false,
 * motivo }`, o convite devolve `incluido_no_convite: false`…). Qualquer uma delas
 * valendo `false` desfaz o sucesso.
 *
 * ⚠️ `convite_enviado` fica FORA de propósito: o convite do cliente devolve
 * `convite_enviado: false` SEMPRE, inclusive no sucesso — quem envia é a
 * sincronização com o Google, depois.
 */
const NEGATIVOS_DE_DOMINIO = [
  'marcado',
  'remarcado',
  'cancelado',
  'confirmado',
  'registrado',
  'agendado',
  'inscrito',
  'incluido',
  'incluido_no_convite',
  'proposta_criada',
  'criada',
  'criado',
] as const;

/**
 * O que UMA chamada de ferramenta comprovou, a partir do RETORNO dela.
 *
 * Sem retorno, retorno com `ok: false`, com `error`, com `permitido: false`
 * (recusa do handler), com `resultado_incerto` ou com uma das negativas de
 * domínio acima: nada. Qualquer outro objeto: a própria ferramenta.
 *
 * Um caso parcial explícito: o convite do cliente que foi RECUSADO (sem
 * compromisso) mas GRAVOU o e-mail na ficha (`email_gravado: true`) comprova o
 * dado, nunca o convite.
 *
 * Na prévia (Testar e rascunho assistido) toda escrita vira `status:
 * 'proposal_only'` — não executa. Ela conta como comprovante: a prévia existe para
 * mostrar o que a PRODUÇÃO faria, e lá a ferramenta teria executado. O preço:
 * se a escrita falharia em produção, a prévia não sabe.
 */
export function comprovantesDoResultado(nome: string, resultado: unknown): string[] {
  if (resultado === null || resultado === undefined) return [];
  if (typeof resultado !== 'object') return [nome];
  const r = resultado as Record<string, unknown>;
  const parciais =
    nome === 'crm_add_contact_to_appointment_invite' && r.email_gravado === true ? [`${nome}:email`] : [];
  const falhou =
    r.ok === false ||
    (r.error !== undefined && r.error !== null && r.error !== false) ||
    r.permitido === false ||
    r.resultado_incerto === true ||
    NEGATIVOS_DE_DOMINIO.some((k) => r[k] === false);
  return falhou ? parciais : [nome, ...parciais];
}

/**
 * Envolve cada ferramenta do turno para registrar, em `destino`, o que o RETORNO
 * dela comprovou. O retorno volta intacto; execução que lança não comprova nada.
 *
 * O turno aplica isto POR FORA do disjuntor de ferramentas (`tool-breaker.ts`):
 * uma chamada barrada por ele volta `ok: false` e, portanto, não comprova.
 */
export function registrarComprovantes<T extends Record<string, unknown>>(tools: T, destino: string[]): T {
  const saida: Record<string, unknown> = {};
  for (const [nome, def] of Object.entries(tools)) {
    const execute = (def as { execute?: unknown } | null)?.execute;
    if (typeof execute !== 'function') {
      saida[nome] = def;
      continue;
    }
    const original = execute as (...args: unknown[]) => unknown;
    saida[nome] = {
      ...(def as object),
      execute: async (...args: unknown[]) => {
        const resultado = await original.apply(def, args);
        destino.push(...comprovantesDoResultado(nome, resultado));
        return resultado;
      },
    };
  }
  return saida as T;
}

// ── O detector ──────────────────────────────────────────────────────────────

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const ATE = String.raw`[^.!?\n]{0,25}?`;
const NOME_DE_DADO = String.raw`(?:e-?mails?|telefones?|whats(?:app)?|numeros?|cpf|enderecos?|contatos?|cadastros?|dados|ficha)`;
const NOME_DE_AGENDA = String.raw`(?:agendamentos?|horarios?|consultas?|reuniao|reunioes|visitas?|sessao|sessoes|compromissos?|encaixes?|aulas?|avaliacao|demonstracao)`;
const TEMPO = String.raw`(?:amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|\bdia \d|\b\d{1,2}(?:h|:\d{2}|/\d{1,2}))`;
const NOME_DE_EQUIPE = String.raw`(?:equipe|time|setor|responsavel|atendentes?|gerente|especialistas?|consultor[a]?|humano|colegas?|financeiro|comercial|suporte|vendedor[a]?|analise|coordenador[a]?|recepcao)`;
const NOME_DE_NEGOCIO = String.raw`(?:propostas?|pedidos?|oportunidades?|negocios?|negociacao|orcamentos?|etapa|funil)`;

type Forma = 'primeira_pessoa' | 'estado';
interface Padrao {
  categoria: CategoriaDeAcao;
  forma: Forma;
  re: RegExp;
  /** A frase ainda precisa conter isto (ex.: um substantivo de agenda ou um horário). */
  exige?: RegExp;
}

const re = (s: string) => new RegExp(s, 'i');
const AGENDA_OU_TEMPO = re(String.raw`\b${NOME_DE_AGENDA}\b|${TEMPO}`);

const PADROES: readonly Padrao[] = [
  // dado gravado
  { categoria: 'dado_gravado', forma: 'estado', re: re(String.raw`\b${NOME_DE_DADO}\b${ATE}\b(?:registrad|anotad|salv|gravad|atualizad|cadastrad|alterad|adicionad)[oa]s?\b`) },
  { categoria: 'dado_gravado', forma: 'primeira_pessoa', re: re(String.raw`\b(?:registrei|anotei|salvei|gravei|atualizei|cadastrei|alterei|adicionei|coloquei)\b${ATE}\b${NOME_DE_DADO}\b`) },
  // agendamento
  { categoria: 'agendamento', forma: 'primeira_pessoa', re: re(String.raw`\b(?:agendei|marquei|reservei)\b|\bdeixei\s+(?:tudo\s+)?(?:agendad|marcad|reservad)[oa]s?\b`) },
  { categoria: 'agendamento', forma: 'primeira_pessoa', re: re(String.raw`\bconfirmei\b`), exige: AGENDA_OU_TEMPO },
  { categoria: 'agendamento', forma: 'estado', re: re(String.raw`\b(?:esta|estao|ficou|ficaram|foi|foram|segue)\s+(?:tudo\s+|ja\s+|devidamente\s+)?(?:agendad|marcad|reservad|confirmad)[oa]s?\b`), exige: AGENDA_OU_TEMPO },
  { categoria: 'agendamento', forma: 'estado', re: re(String.raw`^(?:(?:prontinho|pronto|perfeito|certo|otimo|feito)[,!]?\s+)?(?:agendad|marcad|reservad)[oa]s?\b`) },
  // remarcação
  { categoria: 'remarcacao', forma: 'primeira_pessoa', re: re(String.raw`\b(?:remarquei|reagendei)\b|\b(?:mudei|troquei)\b${ATE}\b${NOME_DE_AGENDA}\b`) },
  { categoria: 'remarcacao', forma: 'estado', re: re(String.raw`\b(?:esta|ficou|foi)\s+(?:ja\s+)?(?:remarcad|reagendad)[oa]s?\b`) },
  // cancelamento
  { categoria: 'cancelamento', forma: 'primeira_pessoa', re: re(String.raw`\b(?:cancelei|desmarquei)\b`) },
  { categoria: 'cancelamento', forma: 'estado', re: re(String.raw`\b(?:esta|ficou|foi|foram)\s+(?:ja\s+)?(?:cancelad|desmarcad)[oa]s?\b`), exige: re(String.raw`\b${NOME_DE_AGENDA}\b`) },
  // convite
  { categoria: 'convite', forma: 'estado', re: re(String.raw`\bconvites?\b${ATE}\b(?:enviad|mandad|disparad|encaminhad)[oa]s?\b`) },
  { categoria: 'convite', forma: 'primeira_pessoa', re: re(String.raw`\b(?:enviei|mandei|disparei|encaminhei|inclui|adicionei|coloquei)\b${ATE}\bconvites?\b`) },
  { categoria: 'convite', forma: 'estado', re: re(String.raw`\bconvites?\b[^.!?\n]{0,30}?\b(?:vai chegar|chega|chegara|vai para)\b`) },
  // equipe acionada
  { categoria: 'equipe_acionada', forma: 'primeira_pessoa', re: re(String.raw`\b(?:passei|encaminhei|repassei|transferi|enviei|mandei|levei|avisei|acionei|chamei|notifiquei|informei|comuniquei)\b[^.!?\n]{0,40}?\b${NOME_DE_EQUIPE}\b`) },
  { categoria: 'equipe_acionada', forma: 'primeira_pessoa', re: re(String.raw`\babri\b${ATE}\b(?:chamado|caso|ticket|solicitacao)\b`) },
  // funil
  { categoria: 'funil', forma: 'primeira_pessoa', re: re(String.raw`\b(?:movi|atualizei|alterei|criei|registrei|lancei|cadastrei|avancei)\b${ATE}\b${NOME_DE_NEGOCIO}\b`) },
  { categoria: 'funil', forma: 'estado', re: re(String.raw`\b${NOME_DE_NEGOCIO}\b${ATE}\b(?:esta|ficou|foi)\s+(?:ja\s+)?(?:atualizad|movid|criad|registrad|cadastrad|lancad)[oa]s?\b`) },
];

const FIM_DE_FRASE = /(?<=[.!?…])\s+|\n+/;
const CONDICIONAL = /^(?:se|caso|quando|assim que)\b/;
const NEGACAO_ANTES = /\b(?:nao|nunca|nem)\b[^.!?\n]{0,15}$/;

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AcaoAfirmada {
  categoria: CategoriaDeAcao;
  forma: Forma;
}

/**
 * As ações que o texto AFIRMA ter feito. `alvosHumanos` são os nomes que o prompt
 * usa para a retaguarda (`humanPromiseExtraTargets`): "já avisei o Paulo".
 */
export function detectarAcoesAfirmadas(
  body: string,
  opts: { alvosHumanos?: readonly string[] } = {},
): AcaoAfirmada[] {
  const alvos = (opts.alvosHumanos ?? [])
    .map((a) => semAcento(a).trim().toLowerCase())
    .filter((a) => a.length >= 2)
    .map(escapar);
  const padroes =
    alvos.length === 0
      ? PADROES
      : [
          ...PADROES,
          {
            categoria: 'equipe_acionada' as const,
            forma: 'primeira_pessoa' as const,
            re: re(
              String.raw`\b(?:passei|encaminhei|repassei|transferi|enviei|mandei|levei|avisei|acionei|chamei|notifiquei|informei|comuniquei)\b[^.!?\n]{0,40}?\b(?:${alvos.join('|')})\b`,
            ),
          },
        ];
  const achadas: AcaoAfirmada[] = [];
  for (const bruta of semAcento(body).toLowerCase().split(FIM_DE_FRASE)) {
    const frase = bruta.trim();
    if (frase === '' || frase.endsWith('?') || CONDICIONAL.test(frase)) continue;
    for (const p of padroes) {
      const m = p.re.exec(frase);
      if (m === null) continue;
      if (NEGACAO_ANTES.test(frase.slice(0, m.index))) continue;
      if (p.exige !== undefined && !p.exige.test(frase)) continue;
      if (!achadas.some((a) => a.categoria === p.categoria && a.forma === p.forma)) {
        achadas.push({ categoria: p.categoria, forma: p.forma });
      }
    }
  }
  return achadas;
}

export interface EvidenciaDoTurno {
  /** `comprovantesDoResultado` de cada ferramenta que rodou neste turno. */
  comprovantes: readonly string[];
  /** Há caso humano aberto (de antes ou deste turno). */
  casoAberto: boolean;
  /**
   * O contato já tem compromisso futuro. Comprova a forma de ESTADO do
   * agendamento ("sua reunião está confirmada para segunda") — é o agente
   * relendo o que existe. A de primeira pessoa ("agendei") continua exigindo a
   * ferramenta: dizer que fez agora é outra afirmação.
   */
  temCompromissoFuturo: boolean;
  alvosHumanos?: readonly string[];
}

/** As categorias afirmadas e NÃO comprovadas neste turno, na ordem de `CATEGORIAS_DE_ACAO`. */
export function acoesNaoComprovadas(body: string, ev: EvidenciaDoTurno): CategoriaDeAcao[] {
  const afirmadas = detectarAcoesAfirmadas(body, { alvosHumanos: ev.alvosHumanos });
  const falta = new Set<CategoriaDeAcao>();
  for (const a of afirmadas) {
    if (FERRAMENTAS_QUE_COMPROVAM[a.categoria].some((f) => ev.comprovantes.includes(f))) continue;
    if (a.categoria === 'equipe_acionada' && ev.casoAberto) continue;
    if (a.categoria === 'agendamento' && a.forma === 'estado' && ev.temCompromissoFuturo) continue;
    falta.add(a.categoria);
  }
  return CATEGORIAS_DE_ACAO.filter((c) => falta.has(c));
}

const ROTULO: Readonly<Record<CategoriaDeAcao, string>> = {
  dado_gravado: 'que registrou ou atualizou um dado do cliente',
  agendamento: 'que um horário foi agendado',
  remarcacao: 'que um horário foi remarcado',
  cancelamento: 'que algo foi cancelado',
  convite: 'que o convite foi enviado ou o cliente foi incluído nele',
  equipe_acionada: 'que a equipe foi acionada',
  funil: 'que o pedido, a proposta ou o negócio foi atualizado',
};

/** O erro de ENSINO devolvido ao modelo (modo `bloquear`). Só rótulos nossos, nunca a frase. */
export function renderVetoDeAcaoNaoExecutada(categorias: readonly CategoriaDeAcao[]): string {
  const oQue = categorias.map((c) => ROTULO[c]).join(' e ');
  return (
    `Você afirmou ${oQue} sem que a ferramenta tenha feito isso neste turno. ` +
    'Chame a ferramenta e responda com base no retorno dela, ou diga ao cliente o que de fato aconteceu.'
  );
}

// ── O fail-safe (camada 3, só em `bloquear`) ────────────────────────────────

/**
 * Vetos tolerados no turno antes do fail-safe. Mesmo degrau dos irmãos (caso
 * humano, afirmação clínica): o 1º ensina, o 2º decide.
 */
export const MAX_VETOS_DE_ACAO_NAO_EXECUTADA = 2;

/**
 * A resposta que sai no lugar da afirmação falsa quando o sistema abre o caso.
 * Promete só o que passa a ser verdade: há um caso, a equipe vai conferir.
 */
export const RESPOSTA_HONESTA_DA_ACAO = 'Vou confirmar isso com a equipe e já te retorno.';

export type PassoDoFailSafe = 'ensinar' | 'abrir_caso_e_responder' | 'ensinar_sem_afirmar';

/**
 * - abaixo do teto: ensina (o modelo reescreve ou chama a ferramenta);
 * - no teto, com casos ligados e nenhum caso aberto: o sistema abre um caso com o
 *   pedido do cliente e responde `RESPOSTA_HONESTA_DA_ACAO` pela cadeia normal;
 * - no teto sem casos (ou com caso já aberto, que não diz o que ESTE pedido é): a
 *   frase continua barrada, com um ensino que proíbe a afirmação. Nunca solta a
 *   frase falsa — não existe "melhor uma mentira que o silêncio" aqui.
 */
export function decidirFailSafeDaAcaoAfirmada(args: {
  vetos: number;
  casosLigados: boolean;
  casoAberto: boolean;
}): PassoDoFailSafe {
  if (args.vetos < MAX_VETOS_DE_ACAO_NAO_EXECUTADA) return 'ensinar';
  if (args.casosLigados && !args.casoAberto) return 'abrir_caso_e_responder';
  return 'ensinar_sem_afirmar';
}

export const ENSINO_SEM_AFIRMAR =
  'A mensagem continua barrada: ela afirma algo que nenhuma ferramenta fez neste turno. ' +
  'Não diga que foi feito. Diga ao cliente, em uma frase, o que de fato aconteceu — por exemplo, ' +
  'que você anotou o pedido para a equipe conferir — ou chame a ferramenta antes de responder.';

// ── O knob ──────────────────────────────────────────────────────────────────

export const MODOS_DA_ACAO_AFIRMADA = ['observar', 'bloquear'] as const;
export type ModoDaAcaoAfirmada = (typeof MODOS_DA_ACAO_AFIRMADA)[number];

const settingsSchema = z.object({
  agente: z.object({ acao_afirmada_modo: z.enum(MODOS_DA_ACAO_AFIRMADA) }),
});

/**
 * `organizations.settings.agente.acao_afirmada_modo`. Ausente, nulo, de outro
 * tipo ou fora do vocabulário = `observar` — o padrão seguro de toda organização.
 */
export function lerModoDaAcaoAfirmada(settings: unknown): ModoDaAcaoAfirmada {
  const r = settingsSchema.safeParse(settings);
  return r.success ? r.data.agente.acao_afirmada_modo : 'observar';
}

/**
 * Lê o knob da organização. Uma query por turno. Falha ABERTA para `observar`
 * (mesma régua de `lerCamadasDaOrg`): uma preferência de conferência não derruba
 * o atendimento.
 */
export async function lerModoDaAcaoAfirmadaDaOrg(
  db: Queryable,
  organizationId: string,
): Promise<ModoDaAcaoAfirmada> {
  try {
    const { rows } = await db.query<{ agente: unknown }>(
      `select settings->'agente' as agente from organizations where id = $1`,
      [organizationId],
    );
    return lerModoDaAcaoAfirmada({ agente: rows[0]?.agente });
  } catch {
    return 'observar';
  }
}
