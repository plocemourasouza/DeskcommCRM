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
- `10-cores-ilegiveis-bloqueadas.png` — cores do tema: o admin da empresa põe o texto principal do
  claro em `#f2f2f0`. A trava lista os três pares do claro com a razão contra o piso ("Texto principal
  sobre Fundo da página (tema claro): 1,1 de 4,5 …", 1,1 sobre Cartões, 1,0 sobre Áreas em destaque),
  nenhum par do escuro, e o Salvar fica desligado. A amostra pinta `rgb(242, 242, 240)` sobre
  `rgb(250, 249, 246)` — 1,06:1 medido no navegador. Recarregar: campo vazio, trava "passa", e nenhuma
  organização tem `settings.branding.cores` no banco.
- `11-previa-cores-legiveis.png`, `11-empresa-cores-claro.png`, `11-empresa-cores-escuro.png` e
  `11-cores-medidas.json` — fundo/cartões/texto próprios nos dois modos (claro `#eef4fb`/`#f8fbff`/
  `#0f2340`, escuro `#0d141d`/`#151e2a`/`#e8eef6`). A prévia pinta os três antes de salvar; depois de
  salvar, o `<body>` e um cartão de `/app` resolvem exatamente esses valores nos dois temas (texto sobre
  página 14,21:1 no claro e 15,85:1 no escuro), e o banco guarda o mesmo objeto. "Voltar todas as cores
  do tema ao padrão" + Salvar apaga a chave e devolve os valores medidos antes (`rgb(250, 249, 246)` /
  `rgb(22, 21, 16)` de fundo).
- `12-servidor-recusa.png` — o formulário é submetido com o Salvar desligado (`requestSubmit()`, como
  quem tira o `disabled` no DevTools), com o texto ilegível e um nome novo: a Server Action responde
  `{"ok":false,"error":"cores_sem_contraste","details":[…"--color-text"…]}`, o toast de recusa aparece,
  nunca "Marca salva", e o `settings.branding` de todas as organizações fica igual (nem as cores, nem o
  nome).
- `13-empresa-herda-instalacao.png` — o dono põe o fundo do claro em `#f1f6ee` em Admin › Marca; a
  empresa sem cores próprias pinta `rgb(241, 246, 238)` no `<body>` de `/app`, o escuro não muda, e o
  campo da empresa mostra `#f1f6ee` como placeholder (herdado). Voltar ao padrão na instalação devolve
  o fundo de fábrica.
