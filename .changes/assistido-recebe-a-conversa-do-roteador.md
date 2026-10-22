---
impacto: nada_mudou
secao: corrigido
titulo: Quando o roteador passa a conversa para um agente assistido, o rascunho sai em vez de travar
---
Numa conversa que estava com um agente automático (por exemplo, o agente de reserva do roteador), se o roteador escolhia um agente em modo assistido, a mensagem do cliente ficava sem rascunho e sem resposta: o turno tentava cinco vezes e morria com `reply_agent_stale`, e a escolha do roteador nem aparecia no histórico de decisões. Agora a conversa passa para o agente escolhido antes do rascunho, o rascunho aparece para aprovação e a decisão do roteador fica registrada. Vale também para o follow-up e para a troca entre dois agentes assistidos. Nada a fazer na atualização.
