---
impacto: capacidade_nova
secao: adicionado
titulo: Nova conferência anota quando o agente diz que fez algo que nenhuma ferramenta fez
---

O agente de IA não deveria dizer ao cliente "e-mail registrado", "agendei", "cancelei", "convite enviado" ou "já passei para a equipe" sem que uma ferramenta tenha de fato feito isso naquela resposta — e já disse, em atendimento real. A cadeia que confere cada mensagem antes de sair ganhou a conferência **"Não dizer que fez o que não foi feito"** (aparece em **Agente › Segurança**). Ela só conta como feito o que a ferramenta devolveu com sucesso: uma chamada que falhou, ou uma sugestão para a equipe confirmar, não conta. Nesta versão ela **só anota** (nenhuma mensagem é barrada) e a observação fica no registro de conferências de cada envio. Quem quiser que ela barre grava `"agente": {"acao_afirmada_modo": "bloquear"}` nas configurações da organização: o assistente passa a refazer a resposta e, se insistir, a equipe recebe um caso e o cliente ouve "Vou confirmar isso com a equipe e já te retorno.". Nada a fazer na atualização.
