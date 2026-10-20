# O "+" da inbox manda vários arquivos — prova em tela

Lastro de `tests/e2e/inbox-varios-anexos.spec.ts`, num build de produção (`pnpm e2e:build`) servido
na porta 3107 contra a pilha Supabase isolada `e2e-wt`, banco aplicado do `baseline.sql`, envs
opcionais ausentes (sem WAHA, sem Redis). Rodado duas vezes seguidas, **5/5 nas duas**
(`run1.txt`, `run2.txt`, 2026-10-20).

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
- `5-nota-dialogo-com-as-duas.png` e `6-duas-notas.png` — em "Nota interna", as mesmas duas fotos
  viram duas notas, na ordem da escolha (medido no banco pelo tamanho de cada anexo: 187 e 263
  bytes). Cada nota leva a legenda: é o comportamento herdado da `main`, diferente da resposta.
- `7-teto-de-cinco.png` — seis fotos pelo "+": o aviso "Dá para enviar até 5 arquivos de uma vez.
  Os demais ficaram de fora." aparece e o diálogo mostra só as cinco primeiras.
- `8-invalidos-fora-da-leva.png` — um PNG vazio e um `.exe` na mesma escolha que uma foto válida:
  cada inválido sai com aviso que o nomeia ("Arquivo vazio.", "Tipo de arquivo não suportado.") e a
  foto válida segue sozinha no diálogo.

## Entrega real pelo WhatsApp (2026-10-20)

Fora do ambiente isolado, na instalação local da :3001 com WAHA conectado, a leva de duas fotos foi
enviada pelo "+" às três conversas da lista de números de teste do canal (pré-lançamento). As seis
mensagens chegaram a `delivered` (duas a `read`), a primeira de cada leva sempre antes da segunda e
só ela com legenda; a ordem e a legenda foram conferidas nos aparelhos. Sem captura aqui: as
conversas são de números reais.
