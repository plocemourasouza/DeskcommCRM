# Fontes versionadas

Os `.woff2` desta pasta são carregados por `next/font/local` em `app/layout.tsx`
e `app/design/lib/fonts.ts`. Eles substituem o `next/font/google`, que baixava
as fontes do Google **durante o `next build`** — e o build do CI falhava sempre
que essa busca falhava (`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`).
Com os arquivos aqui, o build não depende de rede para fonte.

Os arquivos são os **servidos pelo próprio Google Fonts**, sem nenhuma
alteração nossa — **exceto** o da Atkinson Hyperlegible Next, que é um subset feito por nós (abaixo). Família, pesos, eixos e cobertura de caracteres são os mesmos
que o `next/font/google` baixava.

| Arquivo | Família | Pesos | Cobertura | Origem (fonts.gstatic.com) |
|---|---|---|---|---|
| `atkinson-hyperlegible-next-200-800-latin-latin-ext.woff2` | Atkinson Hyperlegible Next | variável 200–800 (`wght`) | latin + latin-ext | fonte do projeto `googlefonts/atkinson-hyperlegible-next`, subset nosso (ver abaixo) |
| `ibm-plex-mono-{400,500}-latin-latin-ext.woff2` | IBM Plex Mono | 400, 500 | latin + latin-ext | `ibmplexmono/v20` |
| `bricolage-grotesque-200-800-latin.woff2` | Bricolage Grotesque | variável 200–800 | latin | `bricolagegrotesque/v9` |
| `plus-jakarta-sans-200-800-latin.woff2` | Plus Jakarta Sans | variável 200–800 | latin | `plusjakartasans/v12` |
| `fraunces-100-900-latin.woff2` | Fraunces | variável 100–900 + `opsz`, `SOFT`, `WONK` | latin | `fraunces/v38` |
| `manrope-200-800-latin.woff2` | Manrope | variável 200–800 | latin | `manrope/v20` |
| `source-serif-4-200-900-latin.woff2` | Source Serif 4 | variável 200–900 | latin | `sourceserif4/v14` |
| `ibm-plex-sans-300-700-latin.woff2` | IBM Plex Sans | variável, usada em 300–700 | latin | `ibmplexsans/v23` |
| `jetbrains-mono-100-800-latin.woff2` | JetBrains Mono | variável 100–800 | latin | `jetbrainsmono/v24` |

## Como baixar de novo

As fontes só-latin vêm da API CSS2 com o mesmo User-Agent que o `next/font/google`
usa (`node_modules/next/dist/compiled/@next/font/dist/google/fetch-resource.js`);
o bloco `/* latin */` da resposta aponta o arquivo:

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36'
curl -sA "$UA" 'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap'
```

As duas de latin + latin-ext vêm num arquivo só por peso: a API CSS antiga,
com um User-Agent sem suporte a `unicode-range`, devolve um `woff2` com os dois
subsets juntos (e sem hinting, como o do Chrome):

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:40.0) Gecko/20100101 Firefox/40.0'
curl -sA "$UA" 'https://fonts.googleapis.com/css?family=Atkinson+Hyperlegible:400,700|IBM+Plex+Mono:400,500&subset=latin,latin-ext&display=swap'
```

## Atkinson Hyperlegible Next (fonte sans do produto)

Variável de verdade (eixo `wght` 200–800), para que `font-medium` (500) e
`font-semibold` (600) sejam faces reais — com os antigos 400/700 estáticos o
navegador arredondava 500 para 400 e 600 para 700. O Google só serve latin e
latin-ext em arquivos separados, e o `next/font/local` não aceita
`unicode-range`; por isso o arquivo é o TTF variável do repositório do projeto
(`fonts/variable/AtkinsonHyperlegibleNext[wght].ttf`) reduzido a latin + latin-ext
com `fonttools`, mantendo todas as features OpenType da fonte:

```bash
pip install fonttools brotli
pyftsubset 'AtkinsonHyperlegibleNext[wght].ttf' --layout-features='*' --flavor=woff2 \
  --unicodes='U+0000-024F,U+0259,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1EFF,U+2000-206F,U+20A0-20C4,U+20AC,U+2113,U+2122,U+2191,U+2193,U+2212,U+2215,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD' \
  --output-file=atkinson-hyperlegible-next-200-800-latin-latin-ext.woff2
```

A fonte não tem `ss01` (só `tnum`, `pnum`, `frac`, `ccmp`, `locl`); o `body`
não o pede mais. Sem face itálica: `font-synthesis: style` mantém o oblíquo sintético (itálico semântico) e proíbe negrito falso.

## Quem usa

- **Atkinson Hyperlegible** (padrão) e **IBM Plex Mono**: `app/layout.tsx`, pré-carregadas.
- **Manrope, Plus Jakarta Sans, IBM Plex Sans, Bricolage Grotesque, Fraunces, Source Serif 4**:
  escolhíveis pela marca (Marca › Fonte). Declaradas em `app/fontes-da-marca.ts` com
  `preload: false` — o navegador só baixa o arquivo da família que estiver em uso.
  Acrescentar uma família é mudança de código: arquivo OFL aqui, entrada em `FONTES_DA_MARCA`
  (`lib/branding/schema.ts`), CHECK e RPC em migration, bloco `:root[data-fonte]` em `globals.css`.
- **JetBrains Mono**: só o laboratório de design (`app/design`).

## Licença

Todas as famílias são distribuídas sob a SIL Open Font License 1.1 — texto e
avisos de copyright em [`OFL.txt`](OFL.txt).
