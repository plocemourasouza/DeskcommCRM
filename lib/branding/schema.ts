/**
 * A FORMA do que se grava para a cor de uma instalação — o envelope.
 *
 * Este arquivo tem três exceções deliberadas à convenção do repo. Cada uma está
 * escrita aqui com o porquê porque as três parecem descuido de fora, e a próxima
 * sessão "consertaria" por consistência.
 *
 * ── 1. `.catchall(z.unknown())`, e não `.strict()` ─────────────────────────────
 *
 * O kit self-host coloca código VELHO sobre schema NOVO por construção: o
 * `update.sh` aplica o baseline ANTES de puxar a imagem, e o rollback do
 * `agent.sh` reverte só o `APP_IMAGE` — o dado gravado pela versão nova continua
 * lá. Com `.strict()`, uma chave desconhecida faz o parse LANÇAR; e como o
 * resolvedor é chamado no `app/layout.tsx`, um throw ali é 500 em TODAS as telas
 * do produto. Uma chave que não entendemos é informação que não usamos, nunca
 * motivo para derrubar a instalação inteira.
 *
 * ── 2. O envelope `{ format, algo }` nasce agora, sem tela que o use ───────────
 *
 * Não é especulação: é a única superfície do sistema que atravessa INSTALAÇÕES e
 * VERSÕES, e retrofit é impossível. Sem o envelope, no dia em que a primeira
 * linha versionada aparecer, TODA linha já existente vira "algo desconhecido" —
 * indistinguível de lixo, porque não há campo onde dizer de que versão ela é.
 *
 *   `format` = versão da FORMA do dado (o que os campos significam).
 *   `algo`   = versão do ALGORITMO de derivação (como a semente vira rampa).
 *
 * São eixos independentes de propósito, e a regra de quando mexer em cada um é o
 * que faz o degrade do rollback ser correto:
 *
 *   - Campo novo, opcional, que o leitor velho pode ignorar → NÃO bump nada; ele
 *     entra pelo `.catchall` e o leitor velho segue funcionando.
 *   - Melhoria no gerador (curva, clamp, piso) → bump `algo`. O leitor velho
 *     continua derivando com o algoritmo DELE, que é o certo: o dado gravado é a
 *     entrada, não a saída.
 *   - `semente_hex`/`papel_da_semente` deixarem de significar o que significam →
 *     bump `format`. Aí o leitor velho NÃO pode adivinhar, e cair no padrão do
 *     produto é a resposta segura.
 *
 * ── 3. Guarda ENTRADA, nunca SAÍDA ────────────────────────────────────────────
 *
 * O que se grava é `{ semente_hex, papel_da_semente }` — jamais os 11 stops
 * derivados, jamais os tokens por tema. Guardar a saída congelaria cada
 * instalação no gerador do dia em que ela foi configurada: uma correção de
 * contraste (e `lib/branding/contraste.ts` existe exatamente para isso) nunca
 * alcançaria quem já tinha configurado. Guardando a entrada, a melhoria chega a
 * todo mundo no primeiro deploy.
 */

import { z } from "zod";

import { ehHexValido, normalizarHex } from "./rampa";

/** Versão da FORMA do dado. Ver regra de bump no cabeçalho. */
export const FORMATO_ATUAL = 1;

/** Versão do ALGORITMO de derivação. Ver regra de bump no cabeçalho. */
export const ALGORITMO_ATUAL = 1;

/**
 * O papel que a semente exerce. `accent` pinta o produto; `marca` mantém o hex
 * só como identidade (logo, selo, cabeçalho de e-mail) sem tocar na interface.
 *
 * O campo é `string` no esquema, e não `z.enum`, DE PROPÓSITO: um papel novo
 * gravado por uma versão futura não pode invalidar o envelope inteiro. Quem
 * decide o que fazer com um papel desconhecido é o resolvedor, que tem onde
 * registrar o motivo — o esquema aqui só descreve forma.
 */
export const PAPEIS_DA_SEMENTE = ["accent", "marca"] as const;
export type PapelDaSemente = (typeof PAPEIS_DA_SEMENTE)[number];

export function ehPapelConhecido(papel: string): papel is PapelDaSemente {
  return (PAPEIS_DA_SEMENTE as readonly string[]).includes(papel);
}

/**
 * A paleta de neutros (superficie, texto, borda): `quente` e o greige de sempre
 * (default), `cinza` e neutro puro, `frio` e azulado. Vocabulario fechado no
 * CHECK `platform_branding_neutros` e em `fn_definir_marca_da_organizacao`
 * (migration 0650); o invariante vocabulario-banco-x-typescript cobre a igualdade.
 */
export const NEUTROS_DA_MARCA = ["quente", "cinza", "frio"] as const;
export type NeutrosDaMarca = (typeof NEUTROS_DA_MARCA)[number];

/**
 * Le um valor de fonte nao confiavel (coluna, jsonb, form) como neutros. Fora do
 * vocabulario vira `quente` — o visual de sempre — e NUNCA lanca: isto roda no
 * layout que embrulha o produto inteiro.
 */
export function neutrosDeTexto(valor: unknown): NeutrosDaMarca {
  return typeof valor === "string" && (NEUTROS_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as NeutrosDaMarca)
    : "quente";
}

/** O valor so quando ele e do vocabulario; `null` quando a fonte nao escolheu (ou escreveu lixo). */
export function neutrosEscolhidos(valor: unknown): NeutrosDaMarca | null {
  return typeof valor === "string" && (NEUTROS_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as NeutrosDaMarca)
    : null;
}

/**
 * O raio dos cantos (`--radius-sm..xl`): `padrao` e o de sempre, `suave` aperta
 * (nunca chega a zero) e `arredondado` folga. Independe do tema. Vocabulario
 * fechado no CHECK `platform_branding_raio` e em `fn_definir_marca_da_organizacao`
 * (migration 0687); o invariante vocabulario-banco-x-typescript cobre a igualdade.
 */
export const RAIOS_DA_MARCA = ["suave", "padrao", "arredondado"] as const;
export type RaioDaMarca = (typeof RAIOS_DA_MARCA)[number];

/**
 * Os quatro raios em px de cada escolha. Espelho de `app/globals.css` (`:root` e
 * `:root[data-raio=...]`) para a PREVIA do formulario, que nao pode usar o
 * atributo no `<html>`. `tests/unit/raio-da-marca-x-globals.test.ts` reprova a
 * divergencia entre os dois lados.
 */
export const RAIO_EM_PX: Record<RaioDaMarca, { sm: number; md: number; lg: number; xl: number }> = {
  suave: { sm: 2, md: 4, lg: 6, xl: 10 },
  padrao: { sm: 4, md: 8, lg: 12, xl: 16 },
  arredondado: { sm: 6, md: 12, lg: 16, xl: 24 },
};

/** As quatro custom properties do raio, prontas para `style` (previa). */
export function estiloDoRaio(raio: RaioDaMarca): Record<`--radius-${"sm" | "md" | "lg" | "xl"}`, string> {
  const r = RAIO_EM_PX[raio];
  return {
    "--radius-sm": `${r.sm}px`,
    "--radius-md": `${r.md}px`,
    "--radius-lg": `${r.lg}px`,
    "--radius-xl": `${r.xl}px`,
  };
}

/** Fora do vocabulario vira `padrao` e NUNCA lanca (roda no layout raiz). */
export function raioDeTexto(valor: unknown): RaioDaMarca {
  return raioEscolhido(valor) ?? "padrao";
}

/** O valor so quando ele e do vocabulario; `null` quando a fonte nao escolheu (ou escreveu lixo). */
export function raioEscolhido(valor: unknown): RaioDaMarca | null {
  return typeof valor === "string" && (RAIOS_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as RaioDaMarca)
    : null;
}

/**
 * A barra lateral: `padrao` acompanha o tema, `escura` e sempre escura. CHECK
 * `platform_branding_barra_lateral` e a mesma guarda da funcao (migration 0687).
 */
export const BARRAS_LATERAIS_DA_MARCA = ["padrao", "escura"] as const;
export type BarraLateralDaMarca = (typeof BARRAS_LATERAIS_DA_MARCA)[number];

/** Fora do vocabulario vira `padrao` e NUNCA lanca. */
export function barraLateralDeTexto(valor: unknown): BarraLateralDaMarca {
  return barraLateralEscolhida(valor) ?? "padrao";
}

/** O valor so quando ele e do vocabulario; `null` quando a fonte nao escolheu. */
export function barraLateralEscolhida(valor: unknown): BarraLateralDaMarca | null {
  return typeof valor === "string" && (BARRAS_LATERAIS_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as BarraLateralDaMarca)
    : null;
}

/**
 * A densidade dos controles: `aerada` e o visual de hoje, `equilibrada` e
 * `compacta` apertam a altura de botoes, campos, linhas de tabela e itens do menu
 * lateral. Vocabulario fechado no CHECK `platform_branding_densidade` e em
 * `fn_definir_marca_da_organizacao` (migration 0688); o invariante
 * vocabulario-banco-x-typescript cobre a igualdade.
 */
export const DENSIDADES_DA_MARCA = ["aerada", "equilibrada", "compacta"] as const;
export type DensidadeDaMarca = (typeof DENSIDADES_DA_MARCA)[number];

/** Nome da custom property de cada medida da densidade (as que `app/globals.css` declara). */
export const VARIAVEIS_DA_DENSIDADE = {
  controleH: "--controle-h",
  controleHSm: "--controle-h-sm",
  campoH: "--campo-h",
  linhaH: "--linha-h",
  linhaPy: "--linha-py",
  navPy: "--nav-py",
} as const;
export type MedidaDaDensidade = keyof typeof VARIAVEIS_DA_DENSIDADE;

/**
 * As medidas em px de cada escolha. Espelho de `app/globals.css` (`:root` e os
 * `:root[data-densidade=...]` sob `@media (pointer: fine)`) para a PREVIA dos
 * formularios. O piso do campo (36px) e 2 de borda + 16 de padding vertical + a
 * linha de 14px: abaixo disso o texto do input e cortado. `aerada` e o pixel que os primitivos tinham antes das variaveis.
 * `tests/unit/densidade-da-marca-x-globals.test.ts` reprova a divergencia.
 */
export const DENSIDADE_EM_PX: Record<DensidadeDaMarca, Record<MedidaDaDensidade, number>> = {
  aerada: { controleH: 36, controleHSm: 32, campoH: 40, linhaH: 40, linhaPy: 8, navPy: 4 },
  equilibrada: { controleH: 32, controleHSm: 28, campoH: 38, linhaH: 36, linhaPy: 6, navPy: 3 },
  compacta: { controleH: 30, controleHSm: 26, campoH: 36, linhaH: 32, linhaPy: 4, navPy: 2 },
};

/** As custom properties da densidade, prontas para `style` (previa). */
export function estiloDaDensidade(densidade: DensidadeDaMarca): Record<string, string> {
  const medidas = DENSIDADE_EM_PX[densidade];
  return Object.fromEntries(
    (Object.keys(VARIAVEIS_DA_DENSIDADE) as MedidaDaDensidade[]).map((k) => [
      VARIAVEIS_DA_DENSIDADE[k],
      `${medidas[k]}px`,
    ]),
  );
}

/** Fora do vocabulario vira `aerada` e NUNCA lanca (roda no layout raiz). */
export function densidadeDeTexto(valor: unknown): DensidadeDaMarca {
  return densidadeEscolhida(valor) ?? "aerada";
}

/** O valor so quando ele e do vocabulario; `null` quando a fonte nao escolheu. */
export function densidadeEscolhida(valor: unknown): DensidadeDaMarca | null {
  return typeof valor === "string" && (DENSIDADES_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as DensidadeDaMarca)
    : null;
}

/**
 * A fonte da interface: `atkinson` e a de sempre (e o default do banco), as
 * outras seis sao familias OFL versionadas em `app/fonts/`. Vocabulario fechado
 * no CHECK `platform_branding_fonte` e em `fn_definir_marca_da_organizacao`
 * (migration 0689); o invariante vocabulario-banco-x-typescript cobre a
 * igualdade. O primeiro item e o padrao.
 */
export const FONTES_DA_MARCA = [
  "atkinson",
  "manrope",
  "jakarta",
  "plex-sans",
  "bricolage",
  "fraunces",
  "source-serif",
] as const;
export type FonteDaMarca = (typeof FONTES_DA_MARCA)[number];

/** O nome da familia como a pessoa o conhece (nome proprio: nao se traduz). */
export const NOMES_DAS_FONTES: Record<FonteDaMarca, string> = {
  atkinson: "Atkinson Hyperlegible",
  manrope: "Manrope",
  jakarta: "Plus Jakarta Sans",
  "plex-sans": "IBM Plex Sans",
  bricolage: "Bricolage Grotesque",
  fraunces: "Fraunces",
  "source-serif": "Source Serif 4",
};

/** As familias com serifa: fecham a pilha em `serif` em vez de `sans-serif`. */
export const SERIFADAS_DA_MARCA: readonly FonteDaMarca[] = ["fraunces", "source-serif"];

/**
 * A custom property que o `next/font` define no `<html>` para cada familia
 * (`app/layout.tsx` para a Atkinson, `app/fontes-da-marca.ts` para as outras).
 * Os nomes sao dos arquivos de fonte: `globals.css` os cita em `:root[data-fonte]`.
 */
export const VARIAVEL_DA_FONTE: Record<FonteDaMarca, string> = {
  atkinson: "--font-atkinson",
  manrope: "--fonte-manrope",
  jakarta: "--fonte-jakarta",
  "plex-sans": "--fonte-plex-sans",
  bricolage: "--fonte-bricolage",
  fraunces: "--fonte-fraunces",
  "source-serif": "--fonte-source-serif",
};

const FALLBACK_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FALLBACK_SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

/**
 * A pilha `font-family` de cada escolha. Espelho de `app/globals.css` (`--font-ui`
 * no `:root` e nos `:root[data-fonte=...]`) para a PREVIA e as amostras dos
 * formularios; `tests/unit/fonte-da-marca-x-globals.test.ts` reprova a divergencia.
 * A da Atkinson e, byte a byte, o `font-family` que o `body` tinha antes.
 */
export function pilhaDaFonte(fonte: FonteDaMarca): string {
  const fallback = SERIFADAS_DA_MARCA.includes(fonte) ? FALLBACK_SERIF : FALLBACK_SANS;
  return `var(${VARIAVEL_DA_FONTE[fonte]}), ${fallback}`;
}

/** `--font-ui` pronto para `style` (previa e amostras): `font-sans` nos filhos a le. */
export function estiloDaFonte(fonte: FonteDaMarca): Record<string, string> {
  return { "--font-ui": pilhaDaFonte(fonte) };
}

/** Fora do vocabulario vira `atkinson` e NUNCA lanca (roda no layout raiz). */
export function fonteDeTexto(valor: unknown): FonteDaMarca {
  return fonteEscolhida(valor) ?? "atkinson";
}

/** O valor so quando ele e do vocabulario; `null` quando a fonte nao escolheu. */
export function fonteEscolhida(valor: unknown): FonteDaMarca | null {
  return typeof valor === "string" && (FONTES_DA_MARCA as readonly string[]).includes(valor)
    ? (valor as FonteDaMarca)
    : null;
}

// ── As cores do tema (migration 0690) ────────────────────────────────────────

/**
 * As cores do tema que a marca pode mudar — lista FECHADA, a mesma nos dois temas,
 * sem o prefixo `--color-`. Decisão do dono do produto (2026-10-15): a instalação e
 * a empresa podem mudar fundo, cartões, textos, bordas e as cores de aviso, cada
 * tema separado, LIVREMENTE — e a trava de contraste (`cores-do-tema.ts`) barra o
 * Salvar quando algum par pintado fica abaixo do piso.
 *
 * Cada nome existe no `:root` e no `[data-theme="dark"]` do `app/globals.css`
 * (`tests/unit/branding-cores-do-tema.test.ts` reprova token inventado ou sumido).
 * A MESMA lista mora na função SQL `fn_definir_marca_da_organizacao` (0690):
 * mudar aqui sem mudar lá faz a RPC recusar o que a tela aceita.
 */
export const TOKENS_DE_COR_DO_TEMA = [
  "bg",
  "surface",
  "surface-elevated",
  "text",
  "text-muted",
  "text-subtle",
  "border",
  "border-strong",
  "success",
  "success-bg",
  "success-fg",
  "warning",
  "warning-bg",
  "warning-fg",
  "error",
  "error-bg",
  "error-fg",
  "info",
  "info-bg",
  "info-fg",
] as const;
export type TokenDeCorDoTema = (typeof TOKENS_DE_COR_DO_TEMA)[number];
export type TemaDasCores = "claro" | "escuro";
export type CoresDeUmTema = Partial<Record<TokenDeCorDoTema, string>>;
/** Esparso: só o que foi escolhido. Token ausente desce para a camada de baixo. */
export type CoresDoTema = Partial<Record<TemaDasCores, CoresDeUmTema>>;

/** `#rrggbb` minúsculo — o mesmo `^#[0-9a-f]{6}$` da função SQL. */
export const HEX_DA_COR_DO_TEMA = /^#[0-9a-f]{6}$/;

const esquemaDeUmTema = z.partialRecord(
  z.enum(TOKENS_DE_COR_DO_TEMA),
  z.string().regex(HEX_DA_COR_DO_TEMA, { message: "Use uma cor no formato #rrggbb" }),
);

/**
 * A forma ESTRITA, de ESCRITA (server action, tela). Chave fora da lista é recusa:
 * aqui não há código velho a proteger, há a porta do que vira CSS.
 */
export const esquemaDasCoresDoTema = z.strictObject({
  claro: esquemaDeUmTema.optional(),
  escuro: esquemaDeUmTema.optional(),
});

function lerUmTema(cru: unknown): CoresDeUmTema | null {
  if (typeof cru !== "object" || cru === null || Array.isArray(cru)) return null;
  const saida: CoresDeUmTema = {};
  for (const token of TOKENS_DE_COR_DO_TEMA) {
    const valor = (cru as Record<string, unknown>)[token];
    if (typeof valor === "string" && HEX_DA_COR_DO_TEMA.test(valor)) saida[token] = valor;
  }
  return Object.keys(saida).length > 0 ? saida : null;
}

/**
 * A leitura DEFENSIVA, de LEITURA (resolvedor, layout). Nunca lança: o que não
 * entende é descartado token a token — mesma régua do `.catchall` do envelope
 * (código velho sobre dado novo). `null` = a camada não escolheu cor nenhuma.
 */
export function coresDoTemaEscolhidas(cru: unknown): CoresDoTema | null {
  if (typeof cru !== "object" || cru === null || Array.isArray(cru)) return null;
  const claro = lerUmTema((cru as Record<string, unknown>).claro);
  const escuro = lerUmTema((cru as Record<string, unknown>).escuro);
  if (!claro && !escuro) return null;
  return { ...(claro ? { claro } : {}), ...(escuro ? { escuro } : {}) };
}

export const CAMINHO_DA_SEMENTE = "semente_hex";

export const esquemaDaCorDaMarca = z
  .object({
    format: z.number().int().min(1),
    algo: z.number().int().min(1),
    semente_hex: z
      .string()
      // O validador de hex é o do domínio (`lib/branding/rampa.ts`), não um
      // regex recém-escrito aqui: duas definições de "hex válido" divergem, e a
      // que perde é sempre a que ninguém está olhando.
      .refine(ehHexValido, { message: "semente_hex não é um hex de cor" }),
    papel_da_semente: z.string().min(1).default("accent"),
  })
  .catchall(z.unknown());

export type CorDaMarca = z.infer<typeof esquemaDaCorDaMarca>;

/**
 * Monta o envelope da versão de HOJE a partir de um hex cru.
 *
 * Nesta fase a fonte é o `.env` (`APP_ACCENT_HEX`), que é só um hex — o envelope
 * nasce aqui. Quando a tabela por organização entrar, ela grava o envelope
 * inteiro e este helper continua servindo o caminho do `.env`, que não deixa de
 * existir: é ele que pinta a tela de login, onde ainda não há organização.
 */
export function envelopeDeSemente(
  hex: string,
  papel: PapelDaSemente = "accent",
): CorDaMarca {
  const cru = hex.trim();
  return {
    format: FORMATO_ATUAL,
    algo: ALGORITMO_ATUAL,
    // Normaliza só o que JÁ é hex, e passa o resto adiante intacto. Chamar
    // `normalizarHex` em lixo LANÇA (rampa.ts o faz de propósito), e esta função
    // roda no caminho de render do `app/layout.tsx`. Quem recusa a semente e diz
    // o motivo é o resolvedor — aqui só se monta a forma.
    semente_hex: ehHexValido(cru) ? normalizarHex(cru) : cru,
    papel_da_semente: papel,
  };
}
