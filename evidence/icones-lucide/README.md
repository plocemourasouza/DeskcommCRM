# Ícones Lucide — antes e depois

Troca da iconografia de Phosphor (duotone/regular/bold/fill misturados) para Lucide, feita só no barril `lib/ui/icons.ts`. Os nomes exportados não mudaram.

Capturas em `next build` + `next start`, banco fresco do `baseline.sql`, login real do admin, 1280×800 @2x. Esquerda: `main` 0c05ca348. Direita: esta branch.

- `inbox-antes-depois.png`
- `contatos-antes-depois.png`
- `configuracoes-antes-depois.png`

Medido com `document.querySelectorAll("svg")` em cada tela (svgs com a classe `lucide` / total):

| Tela | antes | depois |
|---|---|---|
| Inbox | 0 / 38 | 37 / 38 |
| Contatos | 0 / 40 | 39 / 40 |
| Configurações | 0 / 55 | 54 / 55 |

Espessuras de traço presentes depois: `2` (regular/duotone), `2.5` (bold/fill), `1.25` (thin).
