/**
 * As CORES DO TEMA da marca — e a TRAVA de contraste que as guarda.
 *
 * ── A decisão que este arquivo materializa (dono do produto, 2026-10-15) ─────
 *
 * Até aqui a regra era "a marca nunca move o fundo da página": a cor do cliente
 * só andava na rampa do accent, e as superfícies eram do produto. A decisão
 * nova libera a instalação e a empresa para escolher fundo, cartões, textos,
 * bordas e as cores de aviso, cada tema separado, LIVREMENTE — com uma condição:
 * o Salvar é BLOQUEADO enquanto algum par pintado ficar abaixo do piso (texto
 * 4,5 · componente 3,0, os `PISOS` de `contraste.ts`). Liberdade de escolher o
 * fundo não inclui liberdade de deixar um texto que ninguém lê.
 *
 * ── Por que a trava REFAZ a caminhada do accent ──────────────────────────────
 *
 * A cor da marca é medida CONTRA as superfícies: `escolherAccent` anda a rampa
 * até todo papel caber no piso sobre `--color-bg` & cia. Trocar o fundo e medir
 * o accent contra o fundo de fábrica seria aprovar uma tela que não existe. Por
 * isso `reguaComCores` troca as superfícies DENTRO da régua, e a mesma
 * `derivarMarca` roda sobre ela — a régua é uma só, as superfícies é que mudam.
 *
 * ── Os pares que a trava mede, e os três tokens que ela NÃO mede ─────────────
 *
 * Mede: texto principal e secundário contra as três superfícies; o texto de
 * cada aviso (`-fg`) contra as superfícies e contra o próprio fundo do aviso
 * (`-bg`, composto sobre cada superfície quando translúcido); a cor de cada
 * aviso como componente (3,0) contra as superfícies; e todos os papéis da marca
 * que a régua extrai do `globals.css` (botão, texto do botão, foco, seleção).
 *
 * NÃO mede `text-subtle`, `border` e `border-strong` contra piso nenhum, e isso é
 * medido, não preguiça: o PRÓPRIO produto os pinta abaixo do piso (no escuro de
 * fábrica, `text-subtle` dá 2,33 sobre a área em destaque; `border` dá 1,15 a
 * 1,40 em qualquer tema). São o nível apagado (dica, campo desativado) e a linha
 * divisória — decoração, não informação. Medi-los travaria o Salvar de quem não
 * mexeu em nada. Continuam editáveis; a tela diz que não entram na trava.
 *
 * Tudo aqui é função pura (servidor e navegador): a tela roda a MESMA trava ao
 * vivo, e a server action a roda de novo, porque tela não é fronteira.
 */

import {
  derivarMarca,
  lerCorCss,
  luminanciaRelativa,
  medirPares,
  PISOS,
  razaoDeContraste,
  type Regua,
  type Tema,
  type TemaDaRegua,
  type TipoDePapel,
} from "./contraste";
import { CORES_PADRAO } from "./cores-padrao";
import { compor, normalizarHex } from "./rampa";
import type {
  CoresDeUmTema,
  CoresDoTema,
  NeutrosDaMarca,
  TokenDeCorDoTema,
} from "./schema";

const TEMAS: readonly Tema[] = ["claro", "escuro"];
const BASES = ["bg", "surface", "surface-elevated"] as const;
const AVISOS = ["success", "warning", "error", "info"] as const;

/** Um par medido pela trava, além dos papéis da marca que vêm da régua. */
export type ParDasCores = {
  readonly papel: string;
  readonly tipo: TipoDePapel;
  /** `"superficies"` = contra as três bases; senão, o token do fundo próprio. */
  readonly contra: "superficies" | TokenDeCorDoTema;
};

export const PARES_DAS_CORES: readonly ParDasCores[] = [
  { papel: "--color-text", tipo: "texto", contra: "superficies" },
  { papel: "--color-text-muted", tipo: "texto", contra: "superficies" },
  ...AVISOS.flatMap((a): ParDasCores[] => [
    { papel: `--color-${a}-fg`, tipo: "texto", contra: "superficies" },
    { papel: `--color-${a}-fg`, tipo: "texto", contra: `${a}-bg` },
    { papel: `--color-${a}`, tipo: "componente", contra: "superficies" },
  ]),
];

/** Uma reprova da trava. Forma, nunca identidade: nenhum hex sai daqui. */
export type ReprovaDeCor = {
  readonly papel: string;
  readonly superficie: string;
  readonly tema: Tema;
  readonly razao: number;
  readonly piso: number;
  /** A frente é mais clara que o fundo? Decide "clareie"/"escureça" na frase. */
  readonly frenteMaisClara?: boolean;
};

export type ConferenciaDasCores = {
  readonly passa: boolean;
  readonly reprovas: readonly ReprovaDeCor[];
  /** Quantos pares foram medidos — a guarda de vacuidade. */
  readonly pares: number;
};

/** Camada de cima vence TOKEN A TOKEN; o que ela não define desce. */
export function empilharCores(cima: CoresDoTema, baixo: CoresDoTema): CoresDoTema {
  const saida: CoresDoTema = {};
  for (const tema of TEMAS) {
    const junto: CoresDeUmTema = { ...(baixo[tema] ?? {}), ...(cima[tema] ?? {}) };
    if (Object.keys(junto).length > 0) saida[tema] = junto;
  }
  return saida;
}

/** O valor que cada token vai pintar: o escolhido, senão o de fábrica do preset. */
export function valoresEfetivos(
  neutros: NeutrosDaMarca,
  cores: CoresDoTema,
): Record<Tema, Record<TokenDeCorDoTema, string>> {
  const padrao = CORES_PADRAO[neutros];
  return {
    claro: { ...padrao.claro, ...(cores.claro ?? {}) },
    escuro: { ...padrao.escuro, ...(cores.escuro ?? {}) },
  };
}

function temSuperficie(cores: CoresDoTema): boolean {
  return TEMAS.some((t) => BASES.some((b) => cores[t]?.[b] !== undefined));
}

/**
 * A régua com as superfícies escolhidas no lugar das de fábrica.
 *
 * Cores que não mexem em superfície devolvem A MESMA régua: a derivação é
 * cacheada por IDENTIDADE de régua (`resolve.ts`), e um objeto novo a cada
 * render anularia o cache — além de mudar o pixel de quem não pediu nada. A
 * régua nova também é guardada (FIFO, teto pequeno), pelo mesmo motivo.
 */
const REGUAS_COM_CORES = new WeakMap<Regua, Map<string, Regua>>();
const TETO_DE_REGUAS = 32;

export function reguaComCores(regua: Regua, cores: CoresDoTema): Regua {
  if (!temSuperficie(cores)) return regua;
  const chave = TEMAS.map((t) => BASES.map((b) => cores[t]?.[b] ?? "").join(",")).join("|");
  let porChave = REGUAS_COM_CORES.get(regua);
  if (!porChave) {
    porChave = new Map();
    REGUAS_COM_CORES.set(regua, porChave);
  }
  const guardada = porChave.get(chave);
  if (guardada) return guardada;
  const trocar = (tema: TemaDaRegua, escolhidas: CoresDeUmTema | undefined): TemaDaRegua => ({
    ...tema,
    base: tema.base.map((b) => {
      const token = b.chave.slice("--color-".length) as TokenDeCorDoTema;
      const hex = escolhidas?.[token];
      return hex ? { chave: b.chave, hex: normalizarHex(hex) } : b;
    }),
  });
  const nova: Regua = {
    ...regua,
    claro: trocar(regua.claro, cores.claro),
    escuro: trocar(regua.escuro, cores.escuro),
  };
  porChave.set(chave, nova);
  if (porChave.size > TETO_DE_REGUAS) {
    const maisAntiga = porChave.keys().next().value;
    if (maisAntiga !== undefined) porChave.delete(maisAntiga);
  }
  return nova;
}

type Medida = {
  readonly papel: string;
  readonly superficie: string;
  readonly tema: Tema;
  readonly razao: number;
  readonly piso: number;
  readonly frenteMaisClara: boolean;
};

function medida(
  papel: string,
  superficie: string,
  tema: Tema,
  frente: string,
  fundo: string,
  tipo: TipoDePapel,
): Medida {
  return {
    papel,
    superficie,
    tema,
    razao: razaoDeContraste(frente, fundo),
    piso: PISOS[tipo],
    frenteMaisClara: luminanciaRelativa(frente) > luminanciaRelativa(fundo),
  };
}

/** Todos os pares de um tema, medidos — aprovados e reprovados. */
function medirTema(
  tema: Tema,
  valores: Record<TokenDeCorDoTema, string>,
  reguaDoTema: TemaDaRegua,
  paresDaMarca: readonly { papel: string; superficie: string; razao: number; piso: number }[],
): Medida[] {
  const saida: Medida[] = [];
  const bases = reguaDoTema.base; // já com as superfícies escolhidas
  const hexDe = (token: TokenDeCorDoTema) => lerCorCss(valores[token]);

  for (const par of PARES_DAS_CORES) {
    const frente = hexDe(par.papel.slice("--color-".length) as TokenDeCorDoTema);
    if (!frente) continue;
    if (par.contra === "superficies") {
      for (const b of bases) {
        const cor = frente.alfa >= 1 ? frente.hex : compor(frente.hex, frente.alfa, b.hex);
        saida.push(medida(par.papel, b.chave, tema, cor, b.hex, par.tipo));
      }
      continue;
    }
    const fundo = hexDe(par.contra);
    if (!fundo) continue;
    // Fundo translúcido é N fundos, um por superfície: o aviso sobre o cartão é
    // outro pixel que o aviso sobre a página.
    const alvos =
      fundo.alfa >= 1
        ? [{ chave: `--color-${par.contra}`, hex: fundo.hex }]
        : bases.map((b) => ({
            chave: `--color-${par.contra}@${b.chave}`,
            hex: compor(fundo.hex, fundo.alfa, b.hex),
          }));
    for (const alvo of alvos) {
      saida.push(medida(par.papel, alvo.chave, tema, frente.hex, alvo.hex, par.tipo));
    }
  }

  for (const p of paresDaMarca) {
    saida.push({ ...p, tema, frenteMaisClara: tema === "escuro" });
  }
  return saida;
}

function medirTudo(
  regua: Regua,
  neutros: NeutrosDaMarca,
  cores: CoresDoTema,
  sementes: { readonly claro: string | null; readonly escuro: string | null },
): Medida[] {
  const reguaComAs = reguaComCores(regua, cores);
  const valores = valoresEfetivos(neutros, cores);
  return TEMAS.flatMap((tema) => {
    const semente = sementes[tema];
    let paresDaMarca: ReturnType<typeof medirPares>;
    try {
      paresDaMarca = semente
        ? [...derivarMarca(semente, reguaComAs)[tema].pares]
        : medirPares(reguaComAs[tema], reguaComAs.rampaDoProduto, 0);
    } catch {
      // Semente que nem deriva: o resolvedor já a recusa e a tela pinta o
      // produto — medir a escala do produto é medir o que aparece.
      paresDaMarca = medirPares(reguaComAs[tema], reguaComAs.rampaDoProduto, 0);
    }
    return medirTema(tema, valores[tema], reguaComAs[tema], paresDaMarca);
  });
}

/**
 * ── O piso de cada par: "o produto, nunca pior" ────────────────────────────
 *
 * Medido ao escrever esta trava: o PRÓPRIO produto entrega um par abaixo do
 * piso — `--color-text-muted` sobre `--color-surface-elevated` no tema escuro dá
 * 4,44 (quente e cinza) e 4,47 (frio), contra 4,5. Uma trava com piso cego
 * bloquearia o Salvar de quem não mexeu em nada. A régua é a mesma de
 * `reconciliarSemanticas` (`contraste.ts`): o piso de cada par é o MENOR entre o
 * piso oficial e o que o produto de fábrica já entrega naquele par, sob o mesmo
 * preset de neutros. A marca pode escolher o que quiser, desde que não deixe a
 * tela PIOR do que o produto a entrega. O par que o produto deixa abaixo é
 * dívida do design system, não da marca, e fica registrado aqui.
 */
const PADRAO_POR_REGUA = new WeakMap<Regua, Map<string, number>>();

function razoesDeFabrica(regua: Regua, neutros: NeutrosDaMarca): Map<string, number> {
  const guardada = PADRAO_POR_REGUA.get(regua);
  if (guardada) return guardada;
  const mapa = new Map<string, number>();
  for (const m of medirTudo(regua, neutros, {}, { claro: null, escuro: null })) {
    mapa.set(`${m.tema}|${m.papel}|${m.superficie}`, m.razao);
  }
  PADRAO_POR_REGUA.set(regua, mapa);
  return mapa;
}

/** Folga de arredondamento: a razão de fábrica tem de passar contra ela mesma. */
const FOLGA = 1e-9;

/**
 * A TRAVA. Recebe a pilha já empilhada (`cores`) e as sementes que de fato
 * pintam cada tema (`null` = a escala do produto, sem caminhada — é o que a tela
 * pinta quando nenhuma marca configurou cor).
 *
 * Nunca lança: roda no render (resolvedor) e no teclado (tela).
 */
export function conferirCores(entrada: {
  readonly regua: Regua;
  readonly neutros: NeutrosDaMarca;
  readonly cores: CoresDoTema;
  readonly sementes: { readonly claro: string | null; readonly escuro: string | null };
}): ConferenciaDasCores {
  const fabrica = razoesDeFabrica(entrada.regua, entrada.neutros);
  const medidas = medirTudo(entrada.regua, entrada.neutros, entrada.cores, entrada.sementes);
  const reprovas: ReprovaDeCor[] = [];
  for (const m of medidas) {
    const deFabrica = fabrica.get(`${m.tema}|${m.papel}|${m.superficie}`);
    const piso = deFabrica === undefined ? m.piso : Math.min(m.piso, deFabrica);
    if (m.razao + FOLGA >= piso) continue;
    reprovas.push({ ...m, piso });
  }
  return { passa: reprovas.length === 0, reprovas, pares: medidas.length };
}
