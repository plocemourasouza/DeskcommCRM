# O fio rola até a bolha que a pessoa acabou de enviar — prova em tela

Lastro de `tests/e2e/inbox-rola-ate-o-envio.spec.ts` (build de produção na porta 3107, pilha Supabase
isolada `e2e-wt`, banco do `baseline.sql`, sem WAHA nem Redis). A conversa é semeada com 30
mensagens de texto para o fio ser mais alto que a janela. Toda medida é de `getBoundingClientRect`
da bolha contra o retângulo do scroller do fio, e de `scrollTop/scrollHeight/clientHeight`.

## Antes da correção (`antes-da-correcao.txt`) — 2 vermelhos de 2

- Anexo com o upload em 500: scroller de 253 a 541, bolha "Falhou" de **516 a 797**; o fio ficou
  **268px** aquém do fim (`scrollTop` 2013 de 2569−288). O "Tentar de novo" estava fora da tela.
- Texto com o envio em 500: com a bolha ainda `queued` ela estava à vista (71px de altura, 11px do
  fim); ao falhar ela ganha a linha "Falhou · Tentar de novo" (**91px**) e o fio ficou **31px**
  aquém do fim, com a base da bolha em 562 num scroller que termina em 543.

Causa: o fio só decidia rolar quando CHEGAVA item, e a guarda de 120px media a distância depois de
o item entrar. Crescimento de quem já estava no fio não disparava nada, e item novo mais alto que
120px parecia "usuário lendo o histórico".

## Depois (`run1.txt`, `run2.txt`) — 2/2 nas duas rodadas

- `1-anexo-falhou.png` — bolha de 255 a 536 dentro de 253–541, 7px do fim, "Tentar de novo" à vista.
- `2-texto-falhou.png` — bolha de 447 a 538 dentro de 253–543, 7px do fim.

A regra nova vale para quem estava seguindo o fim; quem rolou para cima para ler o histórico não é
puxado de volta (`tests/unit/chat-thread-segue-o-fim-quando-a-bolha-cresce.test.tsx`).
