/**
 * A PASSAGEM DE UM AGENTE AUTOMÁTICO PARA UM ASSISTIDO, NA MESMA CONVERSA.
 *
 * Medido numa instalação local em 2026-10-22 (conversa 95c459bd…): a conversa
 * estava aderida à Alice (automática, fallback do roteador); o roteador
 * escolheu o agente de Projetos (assistido) e o turno desviou para o rascunho.
 * `fn_reply_begin` recusa rascunho de agente diferente do aderido
 * (`reply_agent_stale`) — e a aderência ao novo agente, com a linha de
 * `ai_router_decisions`, só era gravada DEPOIS, no caminho automático, que o
 * assistido nunca alcança. Todo `inbound_turn` morria em 5 tentativas, o
 * cliente ficava sem resposta e a escolha do roteador não deixava rastro.
 *
 * O dublê de `generateReplyDraft` aplica a MESMA recusa do banco — lê a
 * aderência que o turno deixou gravada na hora em que o rascunho começa —,
 * para que o teste meça a ordem, não a presença de uma chamada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedAgentConfig } from '@/lib/agent-engine/agent/agent-config';

const estado = vi.hoisted(() => ({
  aderido: null as string | null,
  intencao: null as string | null,
  decisoes: [] as unknown[][],
  aderenciaNaHoraDoRascunho: [] as Array<string | null>,
}));

const mocks = vi.hoisted(() => ({
  router: vi.fn(), classify: vi.fn(), byId: vi.fn(), bySession: vi.fn(), conversationAgent: vi.fn(),
  operation: vi.fn(),
  // A recusa de `fn_reply_begin`: aderência a OUTRO agente ⇒ reply_agent_stale.
  draft: vi.fn(async (_pool: unknown, _deps: unknown, input: { agent: { agentId: string } }) => {
    estado.aderenciaNaHoraDoRascunho.push(estado.aderido);
    if (estado.aderido !== null && estado.aderido !== input.agent.agentId) {
      throw new Error('reply_agent_stale');
    }
    return { status: 'ready' };
  }),
  handoff: vi.fn(async () => false), elegibilidade: vi.fn(async (): Promise<unknown> => null),
  jev: vi.fn(() => ({ estado: Promise.resolve('desligada'), escolha: Promise.resolve(null), observar: vi.fn() })),
}));
vi.mock('@/lib/ai/decisao/roteador', () => ({ consultarJevNoRoteador: mocks.jev }));
vi.mock('@/lib/agent-engine/agent/router-config', () => ({ loadActiveRouter: mocks.router }));
vi.mock('@/lib/agent-engine/agent/intent-classifier', () => ({ classifyIntent: mocks.classify }));
vi.mock('@/lib/agent-engine/agent/agent-config', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  loadPublishedAgentConfigById: mocks.byId, loadPublishedAgentConfig: mocks.bySession,
  loadConversationAgentConfig: mocks.conversationAgent,
}));
vi.mock('@/lib/agent-engine/agent/reply-drafts', () => ({ generateReplyDraft: mocks.draft }));
vi.mock('@/lib/atendimento/fronteira-server', () => ({
  currentExecutionBoundary: () => undefined, setExecutionAgentOperation: mocks.operation,
  guardServiceEffect: vi.fn(),
}));
vi.mock('@/lib/agent-engine/agent/human-handoff', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), isLeadInHandoff: mocks.handoff,
}));
vi.mock('@/lib/agent-engine/guardrails/camadas-da-org', () => ({
  lerCamadasDaOrg: vi.fn(async () => ({})), camadaLigada: vi.fn(() => false),
}));
vi.mock('@/lib/agent-engine/agent/fuso-da-org', () => ({ fusoDaOrganizacao: vi.fn(async () => 'UTC') }));
vi.mock('@/lib/ai/elegibilidade/consulta-pg', () => ({ decidirElegibilidadeDaConversa: mocks.elegibilidade }));
vi.mock('@/lib/agent-engine/agent/turno-ja-respondido', () => ({
  ultimaInboundJaRespondida: vi.fn(async () => false),
  anotarUltimaInboundVista: vi.fn(async () => {}),
}));
vi.mock('@/lib/agent-engine/pacing/store', () => ({ loadChannelKnobs: vi.fn(async () => ({ knobs: {} })) }));
vi.mock('@/lib/agent-engine/pacing/engine', () => ({ janelaDeEnvioAberta: () => true, proximaAberturaDaJanela: vi.fn() }));
vi.mock('@/lib/agent-engine/pacing/aviso-de-janela', () => ({
  resolverAvisoDeJanela: vi.fn(async () => 0), avisarJanelaFechada: vi.fn(),
}));

import { createInboundTurnHandler, runAgentTurn, type InboundTurnDeps } from '@/lib/agent-engine/agent/inbound-turn';

const ids = {
  org: '12000000-0000-4000-8000-000000000001', contact: '12000000-0000-4000-8000-000000000002',
  conversation: '12000000-0000-4000-8000-000000000003', channel: '12000000-0000-4000-8000-000000000004',
  job: '12000000-0000-4000-8000-000000000005',
};
const job = {
  id: ids.job, organization_id: ids.org, contact_id: ids.contact, kind: 'inbound_turn',
  payload: { conversation_id: ids.conversation, contact_id: ids.contact, channel_session_id: ids.channel,
    inbound_message_id: '12000000-0000-4000-8000-000000000006', crm_event_id: '12000000-0000-4000-8000-000000000007' },
};
const deps = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  llmCfg: {}, crmCfg: {}, knobs: {},
} as unknown as InboundTurnDeps;

function agent(id: string, mode: 'automatic' | 'assisted') {
  return { agentId: id, versionId: `version-${id}`, operationRevision: '7', operationMode: mode,
    pausedAt: null, handoffKeywords: [] } as unknown as PublishedAgentConfig;
}

/**
 * Roteador como o da instalação medida: `ALICE` é o fallback (NÃO membro),
 * `PROJETOS` é membro com a intenção `orcamento`. `membroAderido` põe o agente
 * aderido também como membro, para o caso assistido → assistido.
 */
function cenario(opts: {
  aderido: PublishedAgentConfig | null;
  escolhido: PublishedAgentConfig;
  aderidoEMembro?: boolean;
}) {
  estado.aderido = opts.aderido?.agentId ?? null;
  estado.intencao = opts.aderido !== null && opts.aderidoEMembro ? 'suporte' : null;
  const members = [{ agentId: opts.escolhido.agentId, intentName: 'orcamento' }];
  if (opts.aderido !== null && opts.aderidoEMembro) members.push({ agentId: opts.aderido.agentId, intentName: 'suporte' });
  mocks.router.mockResolvedValue({ id: 'router-1', sticky: true, minConfidence: 0.6,
    fallbackAgentId: opts.aderidoEMembro ? null : (opts.aderido?.agentId ?? null), members });
  mocks.classify.mockResolvedValue({ intentName: 'orcamento', confidence: 0.92 });
  const todos = [opts.escolhido, ...(opts.aderido ? [opts.aderido] : [])];
  mocks.byId.mockImplementation(async (_db: unknown, _org: unknown, id: string) => todos.find(a => a.agentId === id) ?? null);
  mocks.bySession.mockResolvedValue(opts.aderido ?? opts.escolhido);
  mocks.conversationAgent.mockResolvedValue(opts.aderido ?? opts.escolhido);

  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (/update conversations\s+set active_ai_agent_id/.test(sql)) {
      expect(values.slice(0, 2)).toEqual([ids.org, ids.conversation]);
      estado.aderido = values[2] as string;
      estado.intencao = values[3] as string | null;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('insert into ai_router_decisions')) {
      estado.decisoes.push(values);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('id<>$3')) return { rows: [] };
    return { rows: [{ id: 'msg-1', active_ai_agent_id: estado.aderido, active_intent: estado.intencao,
      body: 'Quero um orçamento para um projeto novo', type: 'text' }] };
  });
  return { query };
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.decisoes = [];
  estado.aderenciaNaHoraDoRascunho = [];
  mocks.handoff.mockResolvedValue(false);
  mocks.elegibilidade.mockResolvedValue(null);
});

describe('a escolha do roteador por um agente assistido vale antes do rascunho', () => {
  it('automático aderido → roteador escolhe assistido: o rascunho sai pelo assistido, sem reply_agent_stale', async () => {
    const alice = agent('ALICE', 'automatic');
    const projetos = agent('PROJETOS', 'assisted');
    const pool = cenario({ aderido: alice, escolhido: projetos });

    await createInboundTurnHandler(deps)(job as never, pool as never, { workerId: 'worker' });

    expect(mocks.draft).toHaveBeenCalledOnce();
    expect(mocks.draft).toHaveBeenCalledWith(pool, deps, expect.objectContaining({ agent: projetos }));
    // A aderência JÁ era do assistido quando o rascunho começou.
    expect(estado.aderenciaNaHoraDoRascunho).toEqual(['PROJETOS']);
    expect(estado.intencao).toBe('orcamento');
    // A escolha deixa rastro — uma linha, não duas (um escritor só).
    expect(estado.decisoes).toHaveLength(1);
    expect(estado.decisoes[0]).toEqual([
      ids.org, 'router-1', ids.conversation, 'orcamento', 0.92, 'PROJETOS', 'classified', ids.job,
    ]);
    expect(mocks.operation).not.toHaveBeenCalled();
  });

  it('assistido aderido → roteador escolhe OUTRO assistido: a troca também vale antes do rascunho', async () => {
    const suporte = agent('SUPORTE', 'assisted');
    const projetos = agent('PROJETOS', 'assisted');
    const pool = cenario({ aderido: suporte, escolhido: projetos, aderidoEMembro: true });

    await createInboundTurnHandler(deps)(job as never, pool as never, { workerId: 'worker' });

    expect(estado.aderenciaNaHoraDoRascunho).toEqual(['PROJETOS']);
    expect(estado.decisoes).toHaveLength(1);
    expect(estado.decisoes[0]![5]).toBe('PROJETOS');
    expect(estado.decisoes[0]![6]).toBe('reclassified');
  });

  it('conversa sem aderência → roteador escolhe assistido: ela passa a aderir a ele', async () => {
    const projetos = agent('PROJETOS', 'assisted');
    const pool = cenario({ aderido: null, escolhido: projetos });

    await createInboundTurnHandler(deps)(job as never, pool as never, { workerId: 'worker' });

    expect(estado.aderenciaNaHoraDoRascunho).toEqual(['PROJETOS']);
    expect(estado.decisoes).toHaveLength(1);
  });

  // O outro ramo do assistido mora em `runAgentTurn` (follow-up): a mesma
  // escolha, a mesma ordem.
  it('follow-up: roteador resolve um assistido diferente do aderido → a aderência muda antes do rascunho', async () => {
    const projetos = agent('PROJETOS', 'assisted');
    const pool = cenario({ aderido: agent('ALICE', 'automatic'), escolhido: projetos });

    await runAgentTurn(deps, { ...job, kind: 'followup_turn', payload: {
      conversation_id: ids.conversation, contact_id: ids.contact } } as never, pool as never, { workerId: 'worker' }, {
      resolvedAgent: { config: projetos, routerId: 'router-1', intentName: 'orcamento', confidence: null, outcome: 'fallback' },
      channelSessionId: ids.channel,
      conversationId: ids.conversation,
      buildOpening: () => '',
    } as never);

    expect(mocks.draft).toHaveBeenCalledOnce();
    expect(estado.aderenciaNaHoraDoRascunho).toEqual(['PROJETOS']);
    expect(estado.decisoes).toHaveLength(1);
    expect(estado.decisoes[0]![5]).toBe('PROJETOS');
  });

  // Controle: lead em handoff não escolhe agente — e então nada é gravado.
  it('lead em handoff: nem aderência nem decisão são gravadas', async () => {
    mocks.handoff.mockResolvedValue(true);
    const pool = cenario({ aderido: agent('ALICE', 'automatic'), escolhido: agent('PROJETOS', 'assisted') });

    await createInboundTurnHandler(deps)(job as never, pool as never, { workerId: 'worker' });

    expect(mocks.draft).not.toHaveBeenCalled();
    expect(estado.aderido).toBe('ALICE');
    expect(estado.decisoes).toHaveLength(0);
  });
});
