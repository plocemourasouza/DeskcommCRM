# Aparência da marca (cantos, barra lateral, densidade e fonte) — prova em tela

Lastro de `tests/e2e/marca-aparencia.spec.ts`, num build de produção com banco fresco aplicado do
`baseline.sql` e os envios opcionais ausentes. Toda medida é de `getComputedStyle` /
`getBoundingClientRect`, nunca a olho.

## O que cada arquivo prova

- `1-padrao-claro.png` e `1-padrao-escuro.png` — sem escolha nenhuma: `--radius-md` resolve 8px,
  o item de navegação ativo (`rounded-md`) mede 8px, o `<html>` não leva `data-raio` e a barra
  lateral não leva `data-theme`.
- `2-instalacao-suave.png` — o dono do servidor escolhe **suave** em Admin › Marca: o HTML que o
  servidor envia já leva `data-raio="suave"`, `--radius-md` = 4px e o botão Salvar (`rounded-sm`) = 2px.
- `3-previa-arredondado.png` — a empresa clica em **arredondado** SEM salvar: a prévia já mede
  `--radius-md` = 12px e a amostra de botão pinta 12px.
- `3-empresa-arredondado.png` — depois de salvar e recarregar, `/app` mede 12px (a empresa vence a
  instalação em suave). "Usar o padrão da instalação" devolve os 4px (verificado no teste, sem imagem).
- `4-barra-escura-pagina-clara.png` — barra lateral **escura** com a página no tema claro: o `<aside>`
  leva `data-theme="dark"`, pinta a superfície escura (comparada com uma sonda `data-theme="dark"`),
  o fundo do `<body>` segue claro, o logotipo usa a variante escura e o item ativo tem contraste
  6,3:1 (mínimo 4,5:1).
- `4-gaveta-escura-celular.png` — a gaveta do celular (390x844) também leva `data-theme="dark"`.
- `flash.json` — medição quadro a quadro ao abrir `/app` com a empresa em **arredondado** sobre a
  instalação em **suave**: zero quadros com o raio da instalação; o atributo troca no parse, menos
  de 1 ms depois do da instalação, antes da primeira pintura.
- `6-instalacao-equilibrada.png` — o dono escolhe densidade **equilibrada** em Admin › Marca: o HTML do
  servidor já leva `data-densidade="equilibrada"`, o Button padrão (Salvar) mede 32px, o Input 38px e o
  item ativo da barra lateral 26px.
- `7-empresa-compacta.png` — a empresa escolhe **compacta** (vence a instalação): a prévia mede 30px/36px
  antes de salvar; depois de salvar e recarregar, Button 30px, Input 36px e item da barra 24px (2px menos
  que na equilibrada). "Usar o padrão da instalação" devolve 32px/38px.
- `7-toque-compacta.png` — o mesmo ajuste com ponteiro de TOQUE (`hasTouch`, janela 1280px para isolar o
  ponteiro do breakpoint): `(pointer: fine)` é falso, o atributo segue `compacta`, mas o controle volta a
  36px/40px — a sobrescrita não vale e o alvo de toque não encolhe.
- `densidade-medidas.json` — os números dos três casos acima, como medidos.
- `8-fonte-fraunces.png` — a empresa escolhe **fraunces**: o corpo resolve `fraunces` primeiro e
  `document.fonts` confirma a família carregada.
- `fontes-baixadas.json` — woff2 realmente baixados num navegador de cache frio, login incluído. Com
  Fraunces: Atkinson (a tela de login ainda é da instalação), Fraunces e Plex Mono. Com a escolha desfeita:
  só Atkinson e Plex Mono — nenhuma das seis fontes extras.
- `flash-densidade-fonte.json` — mesma medição quadro a quadro de `flash.json`, para empresa
  **compacta + fraunces** sobre instalação **equilibrada + atkinson**: zero quadros com a densidade ou a
  fonte da instalação; os atributos trocam no parse, menos de 1 ms depois dos da instalação.
