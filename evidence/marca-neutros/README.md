# Neutros da marca (quente, cinza, frio) — prova em tela

Lastro de `tests/e2e/marca-neutros.spec.ts`, num build de produção com banco fresco aplicado do
`baseline.sql` e os envios opcionais ausentes.

## O que cada arquivo prova

- `1-quente-claro.png` e `1-quente-escuro.png` — sem escolha nenhuma, a aparência é a de sempre
  (neutros quentes), nos dois temas.
- `2-instalacao-cinza-claro.png` e `2-instalacao-cinza-escuro.png` — o dono escolhe **cinza** na
  instalação e o HTML que o servidor envia já sai com os neutros cinza.
- `3-empresa-frio-claro.png` e `3-empresa-frio-escuro.png` — a empresa escolhe **frio**, e dentro
  de `/app` a escolha dela vence a da instalação.
- `flash.json` — medição quadro a quadro ao abrir `/app` com a empresa em **frio** sobre a
  instalação em **cinza**: zero quadros com a paleta errada. A troca acontece no parse do HTML,
  menos de 1 ms depois do atributo da instalação e antes da primeira pintura. Antes do script
  inline, a mesma medição dava 112–144 ms (4–5 quadros) com a paleta da instalação.
