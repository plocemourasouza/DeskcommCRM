# O "+" da inbox manda vários arquivos — prova em tela

Lastro de `tests/e2e/inbox-varios-anexos.spec.ts`, num build de produção (`pnpm e2e:build`) servido
na porta 3107 contra a pilha Supabase isolada `e2e-wt`, banco aplicado do `baseline.sql`, envs
opcionais ausentes (sem WAHA, sem Redis). Rodado duas vezes seguidas, **2/2 nas duas**
(`run1.txt`, `run2.txt`).

    pnpm exec tsx scripts/seed-e2e-credentials.ts
    E2E_PORT=3107 pnpm exec playwright test tests/e2e/inbox-varios-anexos.spec.ts --reporter=list

As duas fotos de teste são distinguíveis pela largura natural (120 px vermelha, 160 px azul): a
ordem é medida pela imagem que carregou em cada bolha (`naturalWidth`), não por um rótulo.

- `1-dialogo-com-as-duas.png` — "+" → Fotos e vídeos com as duas escolhidas de uma vez: o diálogo
  mostra a vermelha como capa e a azul como miniatura, na ordem da escolha, com a legenda.
- `2-duas-bolhas-na-ordem.png` — depois de Enviar: o diálogo fechou, o fio tem as duas bolhas (a
  da legenda com 120 px, a seguinte com 160 px e sem legenda; a imagem mostra a segunda, rolada
  até ela). Os dois POST /api/v1/messages saíram nessa ordem, com `body` só no primeiro. O
  "Falhou" no fim é o status real do canal depois do refetch: não há WAHA neste ambiente.
- `3-dialogo-antes-da-falha.png` e `4-segunda-nao-saiu.png` — o POST do primeiro arquivo recebe
  500 por interceptação: as duas bolhas ficam "Falhou" com "Tentar de novo", só **um** POST saiu,
  e a segunda bolha explica "Não saiu porque o arquivo anterior falhou." (tooltip do "Falhou").
