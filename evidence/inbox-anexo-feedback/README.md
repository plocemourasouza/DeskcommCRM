# Feedback de ação na inbox — prova em tela

Lastro de `tests/e2e/inbox-anexo-feedback.spec.ts` (5/5 em duas rodadas seguidas), num build de
produção com banco fresco aplicado do `baseline.sql` e os envios opcionais ausentes.

## O que cada arquivo prova

- `1-depois-do-envio-claro.png` + `medidas.json` — o anexo vira bolha na conversa logo depois do
  clique, com a prévia e o indicador de envio. `medidas.json` registra o tempo do clique até a
  bolha (`clique_ate_bolha_ms`); a spec exige menos de 300 ms.
- `3-falhou-claro.png` e `3-falhou-escuro.png` — com o envio respondendo 500, a bolha fica na
  conversa marcada como falha, com o botão **Tentar de novo**, nos dois temas.
- `4-reenviada-claro.png` — a retentativa sobe o mesmo arquivo e a bolha passa a enviada.
- `5-depois-do-refetch-claro.png` — a bolha que falhou continua na conversa depois de a lista ser
  buscada de novo (foco da janela), em vez de sumir.
- `6-atualizar-ocupado-carga-inicial.png` — em Tarefas, o botão **Atualizar** anuncia
  `aria-busy` e mostra o indicador enquanto a lista carrega.
