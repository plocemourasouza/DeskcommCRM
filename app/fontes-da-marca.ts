import localFont from "next/font/local";

/**
 * As fontes que a MARCA pode escolher além da Atkinson (que `app/layout.tsx`
 * carrega, pré-carregada, por ser o padrão). Arquivos em `app/fonts/` — origem e
 * licença (SIL OFL 1.1) no README e no `OFL.txt` de lá.
 *
 * ⚠️ `preload: false` em todas, e é o que impede o padrão de pagar pelas outras:
 * sem ele o Next emite um `<link rel="preload">` por família no `<head>` de TODA
 * página, e quem nunca trocou de fonte baixaria seis woff2 que não usa. O
 * `next/font` só emite o `@font-face`; o navegador baixa o arquivo quando algum
 * elemento renderizado usa a família — ou seja, quando `:root[data-fonte=...]`
 * em `globals.css` aponta `--font-ui` para ela.
 *
 * Os módulos de `next/font` exigem opções literais e constantes de módulo, por
 * isso a repetição. As variáveis (`--fonte-*`) são as de `VARIAVEL_DA_FONTE` em
 * `lib/branding/schema.ts`; `tests/unit/fontes-da-marca-carregamento.test.ts`
 * reprova a divergência. A família se chama como a variável, então use sempre
 * a custom property, nunca o nome da fonte.
 *
 * As serifadas ajustam o fallback a Times New Roman (o padrão do `localFont` é
 * Arial, que deslocaria o texto na troca).
 */

const manrope = localFont({
  src: "./fonts/manrope-200-800-latin.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-manrope",
});

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-200-800-latin.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-jakarta",
});

const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-300-700-latin.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-plex-sans",
});

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-200-800-latin.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-bricolage",
});

// Os eixos opsz, SOFT e WONK vêm no próprio arquivo variável.
const fraunces = localFont({
  src: "./fonts/fraunces-100-900-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-fraunces",
  adjustFontFallback: "Times New Roman",
});

const sourceSerif = localFont({
  src: "./fonts/source-serif-4-200-900-latin.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--fonte-source-serif",
  adjustFontFallback: "Times New Roman",
});

/** As classes que o `<html>` recebe: cada uma só define a variável e o `@font-face`. */
export const CLASSES_DAS_FONTES_DA_MARCA = [
  manrope.variable,
  jakarta.variable,
  plexSans.variable,
  bricolage.variable,
  fraunces.variable,
  sourceSerif.variable,
].join(" ");
