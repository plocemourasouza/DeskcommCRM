# Logo SVG rasterizado no servidor — prova em tela

Lastro do caso (5) de `tests/e2e/marca-logo.spec.ts`, num build de produção com banco fresco
aplicado do `baseline.sql` e os envios opcionais ausentes. A spec roda 10/10.

As outras imagens que a spec grava nesta pasta (casos 1–4, 6, tamanhos e ícone) já eram
produzidas antes desta entrega, não provam nada novo e ficam fora do versionamento.

## O que cada arquivo prova

- `5-svg-limpo-aceito-claro.png` — um SVG limpo sobe por Configurações › Marca, o aviso
  "logo atualizado" aparece e a barra lateral mostra o logo. A spec confere que o caminho gravado
  termina em `.png`, que o bucket serve `image/png` e que o objeto servido não contém `<svg`:
  o vetor nunca chega ao storage.
- `5-svg-limpo-aceito-escuro.png` — a mesma barra no tema escuro, depois da mesma subida.
- `5-svg-com-script-recusado.png` — um SVG com `<script>`, com nome e `Content-Type` dizendo
  "png", é recusado pelos bytes com `logo_svg_invalido` (415). O aviso de recusa aparece e o logo
  aceito antes continua na barra.
