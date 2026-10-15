/**
 * A cor da barra do navegador (`<meta name="theme-color">`) — LIDA da régua.
 *
 * ─── Por que passou a ser dinâmico (migration 0677) ─────────────────────────
 *
 * Até as cores do tema, a marca não movia o fundo e `#faf9f6` / `#161510` eram a
 * cor certa da barra para qualquer marca — ler o banco no `viewport` seria pagar
 * uma consulta para devolver uma constante. Com a decisão de 2026-10-15 a
 * INSTALAÇÃO pode escolher o `--color-bg`, e a barra o acompanha: o layout raiz
 * usa `generateViewport()` sobre `marcaResolvida()`, que é memoizada por TTL (não
 * uma consulta por requisição). Sem cor escolhida, a saída é a de antes, byte a
 * byte. A empresa não entra: o `<head>` não sabe de qual empresa é quem olha.
 *
 * ─── O defeito que este módulo conserta é DUPLICAÇÃO ────────────────────────
 *
 * Os dois hexes estavam escritos em três lugares — `app/layout.tsx`,
 * `lib/branding/regua-do-produto.ts` e `app/globals.css` — sem nada os mantendo
 * em sincronia. No dia em que o fundo do produto mudasse, a barra do navegador
 * ficaria com a cor velha e nenhum gate reprovaria. Agora há uma fonte, e a
 * régua é gerada do `globals.css` por `branding-regua-do-produto.test.ts`.
 *
 * ─── Nunca lança ────────────────────────────────────────────────────────────
 *
 * Isto roda no `viewport` do layout raiz: uma exceção aqui é 500 em TODA tela.
 * Tema sem `--color-bg` na régua simplesmente não emite entrada, e o navegador
 * usa o padrão dele — degrada em vez de derrubar. Quem reprova nesse caso é
 * `tests/unit/branding-barra-do-navegador.test.ts`, no build, e não o usuário.
 */

import type { Regua, TemaDaRegua } from "./contraste";
import type { CoresDoTema } from "./schema";

/** O formato que `Viewport["themeColor"]` do Next aceita. */
export type CorDaBarra = { readonly media: string; readonly color: string };

/** A chave da superfície de fundo dentro de `TemaDaRegua.base`. */
const TOKEN_DE_FUNDO = "--color-bg";

function corDeFundo(tema: TemaDaRegua): string | undefined {
  return tema.base.find((t) => t.chave === TOKEN_DE_FUNDO)?.hex;
}

/**
 * As duas entradas de `theme-color`, na ordem claro → escuro.
 *
 * `flatMap` e não `map`: é o que descarta o tema sem cor sem precisar de `!`
 * num campo que o tipo do Next declara obrigatório — o cast que a doutrina
 * proíbe, e que aqui esconderia justamente a régua quebrada.
 */
/**
 * `cores` (0677): o fundo que a marca da INSTALAÇÃO escolheu, por tema, vence o
 * do preset — a barra do navegador acompanha o `--color-bg` que a página pinta.
 * Só a instalação: o `<meta name="theme-color">` sai de `generateViewport()` no
 * layout raiz, que não sabe de qual empresa é quem está olhando.
 */
export function coresDaBarraDoNavegador(regua: Regua, cores: CoresDoTema = {}): CorDaBarra[] {
  return (
    [
      ["(prefers-color-scheme: light)", cores.claro?.bg ?? corDeFundo(regua.claro)],
      ["(prefers-color-scheme: dark)", cores.escuro?.bg ?? corDeFundo(regua.escuro)],
    ] as const
  ).flatMap(([media, color]) => (color ? [{ media, color }] : []));
}
