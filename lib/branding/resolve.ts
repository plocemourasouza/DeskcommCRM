/**
 * O resolvedor da marca — quem junta as camadas de configuração e NUNCA lança.
 *
 * "Nunca lança" não é zelo: este módulo é chamado no `app/layout.tsx`, que
 * embrulha o produto inteiro. Uma exceção aqui não deixa a marca feia — deixa
 * TODAS as telas em 500, inclusive o login, inclusive a tela onde o operador
 * corrigiria o valor que quebrou. O caminho degradado é sempre "o produto se
 * pinta com a cor dele", que é uma instalação funcionando.
 *
 * Isso NÃO é engolir erro (o repo proíbe, e com razão): toda recusa devolve um
 * `MotivoDaMarca` junto do resultado. O motivo é dado, não é log perdido —
 * quem o chama decide se o mostra, registra ou ignora.
 *
 * ── Para onde o motivo SAI (invariante 7 da doutrina Sistema Vivo) ────────────
 *
 * Nesta fase ele sai por dois lugares, e nenhum deles é um `return` que morre:
 *   (1) `app/layout.tsx` registra os motivos no logger estruturado, uma vez por
 *       resolução distinta (a derivação é memoizada, então não vira ruído por
 *       requisição);
 *   (2) o objeto atravessa inteiro para quem chamar.
 * Na fase seguinte, a tela de marca (`/app/settings/tenant/branding`, já
 * inventariada em `docs/design-system/screen-flow/03-screen-inventory.md:149`)
 * consome `motivos` como a lista de avisos ao lado do seletor de cor: é ali que
 * o revendedor descobre POR QUE o amarelo dele virou outro tom, em vez de
 * concluir que o produto está quebrado.
 */

import { resolveBranding, type Branding } from "@/lib/branding";

import { derivarMarca, type CodigoDeMotivo, type Marca, type Regua, type Tema } from "./contraste";
import { logoDaCamada } from "./logo";
import { normalizarHex } from "./rampa";
import {
  conferirCores,
  empilharCores,
  reguaComCores,
  type ConferenciaDasCores,
} from "./cores-do-tema";
import {
  ALGORITMO_ATUAL,
  ehPapelConhecido,
  envelopeDeSemente,
  esquemaDaCorDaMarca,
  FORMATO_ATUAL,
  barraLateralEscolhida,
  coresDoTemaEscolhidas,
  densidadeEscolhida,
  fonteEscolhida,
  neutrosEscolhidos,
  raioEscolhido,
  type BarraLateralDaMarca,
  type CoresDoTema,
  type DensidadeDaMarca,
  type FonteDaMarca,
  type NeutrosDaMarca,
  type RaioDaMarca,
  type PapelDaSemente,
} from "./schema";
import { REGUA_DO_PRODUTO, reguaDoProduto } from "./regua-do-produto";

/** Códigos que nascem da RESOLUÇÃO (os da derivação vêm de `contraste.ts`). */
export type CodigoDaResolucao =
  | "cor_ausente"
  | "envelope_malformado"
  | "semente_invalida"
  | "formato_desconhecido"
  | "algoritmo_desconhecido"
  | "papel_desconhecido"
  | "papel_nao_pinta"
  | "derivacao_falhou"
  /** A cor do TEMA ESCURO (#2482) é neutra: o escuro pinta com a escala do produto. */
  | "cor_escura_acromatica"
  /**
   * As cores do tema de uma camada (0707) deixam algum par abaixo do piso sobre a
   * pilha de HOJE — a instalação mudou por baixo da empresa. A camada perde as
   * cores dela (as de baixo valem) e a tela diz por quê.
   */
  | "cores_sem_contraste";

/**
 * Mesma disciplina do `Motivo` de `contraste.ts`: emite FORMA, nunca
 * IDENTIDADE. Nenhum campo carrega o hex da marca de ninguém — com a tabela por
 * organização (fase seguinte) esses motivos passam a conviver num log só, e a
 * cor de uma empresa não tem por que aparecer no diagnóstico de outra.
 */
export type MotivoDaMarca = {
  readonly codigo: CodigoDaResolucao | CodigoDeMotivo;
  /** Qual camada produziu o motivo (`env`, `organizacao`, …). */
  readonly origem: string;
  readonly tema: Tema | null;
  readonly alvo: string | null;
  readonly detalhe: string;
};

/**
 * Uma camada de configuração. Campos ausentes NÃO apagam a camada de baixo —
 * é isso que "precedência por campo" quer dizer: quem configurou só o logo
 * continua com o nome que já tinha.
 */
export type CamadaDeMarca = {
  readonly origem: string;
  readonly nome?: string | null;
  readonly logoUrl?: string | null;
  readonly logoDarkUrl?: string | null;
  /**
   * O envelope CRU, como veio da fonte — `unknown` de propósito: validar é
   * trabalho do resolvedor, e uma camada que já entregasse validado esconderia
   * de onde o dado inválido veio.
   */
  readonly cor?: unknown;
  /**
   * A cor da marca NO TEMA ESCURO (#2482) — o par, do jeito que `logoDarkUrl`
   * é o par de `logoUrl`. Envelope CRU, mesmo desenho de `cor`: mesma forma,
   * mesma validação, mesma `derivarMarca`. Ausente = os dois temas continuam
   * derivando da MESMA semente, que é o comportamento de sempre — e é por isso
   * que a chave Some do objeto resolvido quando ninguém a definiu.
   */
  readonly corEscura?: unknown;
  /**
   * A paleta de neutros desta camada. Valor FORA do vocabulario nao e guardado
   * por quem monta a camada (`neutrosEscolhidos`), entao ausente = "nao escolhi,
   * herde" — a mesma precedencia por campo de nome e logo.
   */
  readonly neutros?: NeutrosDaMarca | null;
  /** O raio dos cantos desta camada; mesma regra dos neutros (fora do vocabulario = nao escolhi). */
  readonly raio?: RaioDaMarca | null;
  /** A barra lateral desta camada; mesma regra. */
  readonly barraLateral?: BarraLateralDaMarca | null;
  /** A densidade desta camada; mesma regra. */
  readonly densidade?: DensidadeDaMarca | null;
  /** A fonte desta camada; mesma regra. */
  readonly fonte?: FonteDaMarca | null;
  /** As cores do tema escolhidas por ESTA camada (0707). Lidas defensivamente na resolução. */
  readonly cores?: unknown;
};

export type CorResolvida = {
  /** O hex do cliente, normalizado. Vai para `--color-brand` mesmo sem pintar. */
  readonly semente: string;
  readonly papel: PapelDaSemente | "desconhecido";
  /** Os tokens derivados. `null` quando a semente não pinta o produto. */
  readonly derivada: Marca | null;
  /**
   * A derivação da SEGUNDA semente (#2482) — só o bloco escuro a consome.
   *
   * A chave é ABSENTE (não `null`) quando não há segunda cor: `css.ts` lê
   * `cor.corEscura` e, sem a chave, segue exatamente o caminho de antes, byte a
   * byte. Uma instalação legada não ganha ramo nenhum — ganha ausência.
   */
  readonly corEscura?: { readonly semente: string; readonly derivada: Marca };
};

export type MarcaResolvida = Branding & {
  readonly cor: CorResolvida | null;
  /** A paleta de neutros em vigor (`quente` quando nenhuma camada escolheu). */
  readonly neutros: NeutrosDaMarca;
  /** O raio dos cantos em vigor (`padrao` quando nenhuma camada escolheu). */
  readonly raio: RaioDaMarca;
  /** A barra lateral em vigor (`padrao` quando nenhuma camada escolheu). */
  readonly barraLateral: BarraLateralDaMarca;
  /** A densidade em vigor (`aerada` quando nenhuma camada escolheu). */
  readonly densidade: DensidadeDaMarca;
  /** A fonte em vigor (`atkinson` quando nenhuma camada escolheu). */
  readonly fonte: FonteDaMarca;
  /**
   * As cores do tema em vigor (0707), por token, já empilhadas e já TRAVADAS:
   * toda camada que sobrou aqui passou na trava de contraste. `{}` = o produto.
   */
  readonly cores: CoresDoTema;
  /** De qual camada veio cada campo — o que torna a precedência auditável. */
  readonly origens: {
    readonly nome: string;
    readonly logoUrl: string;
    readonly logoDarkUrl?: string;
    readonly cor: string;
    readonly neutros: string;
    readonly raio: string;
    readonly barraLateral: string;
    readonly densidade: string;
    readonly fonte: string;
    /** A camada MAIS ALTA que contribuiu com alguma cor do tema (`padrao` sem nenhuma). */
    readonly cores: string;
    /** Só existe quando a MESMA camada que venceu a cor definiu a do escuro. */
    readonly corEscura?: string;
  };
  readonly motivos: readonly MotivoDaMarca[];
};

const PADRAO = "padrao";

/**
 * Tira qualquer hex de um texto livre antes de ele virar `detalhe`.
 *
 * A mensagem de exceção é o que torna uma falha diagnosticável — descartá-la
 * deixaria o registro completo por fora e inútil por dentro. Mas ela pode
 * conter o valor que a causou (`hexParaRgb` lança com o valor no texto), e a
 * regra de não vazar identidade vale para o caminho de erro também.
 */
function semIdentidade(texto: string): string {
  return texto.replace(/#[0-9a-fA-F]{3,8}/g, "#…");
}

/** O primeiro valor não-vazio, na ordem das camadas. `null` = ninguém definiu. */
function primeiroDefinido(
  camadas: readonly CamadaDeMarca[],
  ler: (c: CamadaDeMarca) => string | null | undefined,
): { valor: string; origem: string } | null {
  for (const camada of camadas) {
    const valor = (ler(camada) ?? "").trim();
    if (valor.length > 0) return { valor, origem: camada.origem };
  }
  return null;
}

/**
 * Cache da derivação, por régua e por semente.
 *
 * A derivação percorre até 21 deslocamentos × todos os pares × 2 temas, e o
 * `app/layout.tsx` a chamaria em TODA requisição para um valor que muda uma vez
 * por deploy. `WeakMap` na régua (e não um `Map` global por hex) porque teste e
 * preview passam réguas diferentes: cachear só pelo hex devolveria a marca de
 * uma régua ao chamador de outra. A chave externa é FRACA; o `Map` interno não
 * é, e é por isso que ele tem teto — ver `TETO_DE_SEMENTES`.
 */
const memoria = new WeakMap<Regua, Map<string, Marca>>();

/**
 * Quantas sementes distintas cada régua guarda.
 *
 * O comentário acima dizia, até esta fase, "1 nesta fase (o `.env`), uma por
 * organização na fase seguinte" — e ESTA é a fase seguinte: é ela que transforma
 * "uma semente por instalação" em "uma por organização". Um `Map` sem poda passa
 * a crescer com o número de empresas que abrem uma tela, num processo que a VPS
 * mantém vivo por semanas, e cada `Marca` carrega a rampa de 11 stops nos dois
 * temas mais os motivos. Entregar a camada da organização sem o teto seria criar
 * o vazamento e documentá-lo.
 *
 * 64, e não 8: o teto precisa ser maior que a quantidade de organizações que um
 * mesmo processo pinta em rajada, senão o cache vira despejo e a derivação volta
 * a rodar por requisição — que é exatamente o custo que ele existe para evitar.
 *
 * FIFO e não LRU, de propósito: LRU exige tocar a ordem a cada LEITURA (delete +
 * set), isto é, escrita no caminho de render mais quente do produto, para ganhar
 * pouco num cache cujo conteúdo muda uma vez por configuração. Quem cai fora é
 * rederivado no render seguinte — o custo do erro é uma derivação, não um bug.
 */
const TETO_DE_SEMENTES = 64;

function derivarComCache(semente: string, regua: Regua): Marca {
  let porSemente = memoria.get(regua);
  if (!porSemente) {
    porSemente = new Map();
    memoria.set(regua, porSemente);
  }
  const guardada = porSemente.get(semente);
  if (guardada) return guardada;
  const nova = derivarMarca(semente, regua);
  porSemente.set(semente, nova);
  if (porSemente.size > TETO_DE_SEMENTES) {
    // `Map` preserva a ordem de INSERÇÃO, então a primeira chave é a mais antiga.
    const maisAntiga = porSemente.keys().next().value;
    if (maisAntiga !== undefined) porSemente.delete(maisAntiga);
  }
  return nova;
}

/**
 * A SEGUNDA semente — a cor do tema escuro (#2482), da mesma camada que venceu
 * a cor principal.
 *
 * ── Por que ela NUNCA derruba a cor principal ───────────────────────────────
 *
 * A cor principal já está pintando o produto inteiro no ponto onde esta função
 * é chamada. Um hex torto aqui tem de custar o TEMA ESCURO, não o login, o
 * e-mail e a tela de erro: a ação é recusar a segunda semente e manter o
 * comportamento de antes (o escuro deriva do claro), com o motivo à mão — o
 * mesmo "falhar fechado na AÇÃO, aberto na INFORMAÇÃO" do resolvedor.
 *
 * `format`/`algo`/`papel` seguem a mesma régua do envelope principal
 * (`schema.ts`): forma de outra versão não se adivinha, e papel que não é
 * `accent` não pinta. Só que, aqui, "não pintar" significa "voltar à primeira
 * semente", não "sem marca nenhuma".
 *
 * Os motivos da derivação saem COM OS DA PRINCIPAL na mesma lista: a tela de
 * marca mostra o que o sistema ajustou, e com duas sementes ela tem de mostrar
 * as duas — é o critério 2 da issue ("com o motivo mostrado na tela").
 *
 * ── Só os motivos do ESCURO ─────────────────────────────────────────────────
 *
 * `derivarMarca` deriva os DOIS temas, mas esta semente só pinta o escuro. Os
 * motivos do claro dela descrevem um bloco que ela nunca pinta — e, medido com
 * `#1c261d` + `#d9ac62`, o `semantica_deslocada` do claro do âmbar fazia a
 * tela avisar "parecida com erro", cor que nada no produto chegou a usar.
 *
 * Semente neutra é o mesmo caso por outro lado: o escuro pinta com a escala do
 * PRODUTO, e os ajustes medidos ali são a paleta do produto contra ela mesma
 * (ver `suaCorPinta` em `linguagem.ts`). Sai um motivo só, com código próprio:
 * o `marca_acromatica` diz "a sua fica reservada ao logo", e isso é falso para
 * a cor principal, que segue pintando o claro.
 */
function derivarCorEscura(
  cru: unknown,
  origem: string,
  regua: Regua,
  motivos: MotivoDaMarca[],
): { semente: string; derivada: Marca } | null {
  const recusar = (codigo: CodigoDaResolucao, detalhe: string) => {
    motivos.push({ codigo, origem, tema: "escuro", alvo: "--color-accent", detalhe });
    return null;
  };
  if (cru === null || cru === undefined) return null;

  const lido = esquemaDaCorDaMarca.safeParse(cru);
  if (!lido.success) {
    const noHex = lido.error.issues.some((i) => i.path[0] === "semente_hex" && i.code === "custom");
    if (noHex) {
      return recusar(
        "semente_invalida",
        "a cor do tema escuro não é um hex de cor (#rgb ou #rrggbb); " +
          "o tema escuro continua derivando da cor principal",
      );
    }
    const campos = [...new Set(lido.error.issues.map((i) => i.path.join(".") || "(raiz)"))].sort();
    return recusar(
      "envelope_malformado",
      `a cor do tema escuro está fora da forma esperada (${campos.join(", ")}); ` +
        `o tema escuro continua derivando da cor principal`,
    );
  }

  const envelope = lido.data;
  if (envelope.format !== FORMATO_ATUAL) {
    return recusar(
      "formato_desconhecido",
      `formato ${envelope.format} não é o desta versão (${FORMATO_ATUAL}); ` +
        `o tema escuro continua derivando da cor principal`,
    );
  }
  if (envelope.algo !== ALGORITMO_ATUAL) {
    // Mesmo tratamento do envelope principal: a semente é ENTRADA, então esta
    // versão deriva com o algoritmo dela e anota — é o que faz rollback manter
    // a marca no ar.
    motivos.push({
      codigo: "algoritmo_desconhecido",
      origem,
      tema: "escuro",
      alvo: "--color-accent",
      detalhe: `a cor do tema escuro veio gravada na versão ${envelope.algo}; ` +
        `esta instalação deriva na ${ALGORITMO_ATUAL}`,
    });
  }
  if (!ehPapelConhecido(envelope.papel_da_semente) || envelope.papel_da_semente !== "accent") {
    return recusar(
      "papel_nao_pinta",
      "a cor do tema escuro foi configurada só como identidade; " +
        "o tema escuro continua derivando da cor principal",
    );
  }

  const semente = normalizarHex(envelope.semente_hex);
  try {
    const derivada = derivarComCache(semente, regua);
    if (derivada.origemDaRampa === "produto") {
      motivos.push({
        codigo: "cor_escura_acromatica",
        origem,
        tema: "escuro",
        alvo: "--color-accent",
        detalhe: "a cor do tema escuro é neutra; o tema escuro pinta com a escala do produto",
      });
      return { semente, derivada };
    }
    for (const m of derivada.motivos) {
      if (m.tema !== "escuro") continue;
      motivos.push({ codigo: m.codigo, origem, tema: m.tema, alvo: m.alvo, detalhe: m.detalhe });
    }
    return { semente, derivada };
  } catch (erro) {
    return recusar("derivacao_falhou", semIdentidade(erro instanceof Error ? erro.message : String(erro)));
  }
}

/**
 * Valida um envelope cru e, se ele pintar, deriva os tokens.
 *
 * Devolve `null` em `cor` quando a camada não tem nada a dizer sobre cor —
 * assim o chamador sabe que pode continuar descendo as camadas.
 */
function resolverCor(
  cru: unknown,
  origem: string,
  regua: Regua,
  cruEscura?: unknown,
): { cor: CorResolvida | null; motivos: MotivoDaMarca[] } {
  const motivos: MotivoDaMarca[] = [];
  const anotar = (codigo: CodigoDaResolucao, detalhe: string, alvo: string | null = null) => {
    motivos.push({ codigo, origem, tema: null, alvo, detalhe });
  };

  // Campo presente e vazio é anomalia (jsonb `{}`, `null` gravado); campo
  // AUSENTE é a instalação de fábrica e não merece aviso nenhum — avisar sobre o
  // caso normal ensina o operador a ignorar avisos.
  if (cru === null || (typeof cru === "object" && Object.keys(cru).length === 0)) {
    anotar("cor_ausente", "a camada declara cor, mas sem conteúdo");
    return { cor: null, motivos };
  }
  if (cru === undefined) return { cor: null, motivos };

  const lido = esquemaDaCorDaMarca.safeParse(cru);
  if (!lido.success) {
    // A distinção que importa para quem lê o diagnóstico: `semente_invalida` é
    // "o operador digitou uma cor errada" (o campo é string e não passou no
    // validador de hex — `code: "custom"`, do `.refine`); qualquer outra coisa,
    // inclusive campo AUSENTE ou de tipo errado no mesmo caminho, é forma do
    // envelope. Sem o `code`, um envelope sem `semente_hex` seria reportado como
    // cor mal digitada, e o operador iria procurar o erro no lugar errado.
    const noHex = lido.error.issues.some((i) => i.path[0] === "semente_hex" && i.code === "custom");
    if (noHex) {
      anotar("semente_invalida", "semente_hex não é um hex de cor (#rgb ou #rrggbb)");
    } else {
      const campos = [
        ...new Set(lido.error.issues.map((i) => i.path.join(".") || "(raiz)")),
      ].sort();
      anotar("envelope_malformado", `campos fora da forma esperada: ${campos.join(", ")}`);
    }
    return { cor: null, motivos };
  }

  const envelope = lido.data;

  // `format` governa o SIGNIFICADO dos campos. Se ele mudou, ler `semente_hex`
  // seria adivinhar — e o dano de pintar o produto inteiro com uma cor mal lida
  // é maior que o de não pintar. Cair no padrão do produto é a ação segura.
  if (envelope.format !== FORMATO_ATUAL) {
    anotar(
      "formato_desconhecido",
      `formato ${envelope.format} não é o desta versão (${FORMATO_ATUAL}); ` +
        `a cor do produto permanece`,
    );
    return { cor: null, motivos };
  }

  // `algo` é o oposto: o que se grava é ENTRADA, então esta versão sabe derivar
  // a partir dela mesmo que outra versão tenha gravado. Anotar e seguir é o
  // caminho certo — é justamente o que faz um rollback manter a marca no ar.
  if (envelope.algo !== ALGORITMO_ATUAL) {
    anotar(
      "algoritmo_desconhecido",
      `derivação gravada na versão ${envelope.algo}; esta instalação deriva na ` +
        `${ALGORITMO_ATUAL} e usa a semente como entrada`,
    );
  }

  const semente = normalizarHex(envelope.semente_hex);
  const papel = envelope.papel_da_semente;

  if (!ehPapelConhecido(papel)) {
    // Falhar fechado na AÇÃO (não pintar o produto com uma cor cujo alcance não
    // se entende) e aberto na INFORMAÇÃO (a identidade continua disponível em
    // `--color-brand`, que é inerte: nenhum componente muda de cor por ela).
    anotar(
      "papel_desconhecido",
      "papel da semente não é conhecido nesta versão; a cor não pinta a interface",
      "--color-brand",
    );
    return { cor: { semente, papel: "desconhecido", derivada: null }, motivos };
  }

  if (papel !== "accent") {
    anotar(
      "papel_nao_pinta",
      "a semente foi configurada só como identidade; a interface segue com a cor do produto",
      "--color-brand",
    );
    return { cor: { semente, papel, derivada: null }, motivos };
  }

  try {
    const derivada = derivarComCache(semente, regua);
    // A segunda semente SÓ entra depois de a principal ter pintado: sem accent
    // principal não existe bloco escuro para ela pendurar, e uma camada que
    // declara só a cor do escuro não tem o que a pintar.
    const motivosDoEscuro: MotivoDaMarca[] = [];
    const corEscura =
      cruEscura === undefined || cruEscura === null
        ? undefined
        : derivarCorEscura(cruEscura, origem, regua, motivosDoEscuro);
    for (const m of derivada.motivos) {
      // Com a segunda semente, o escuro deixa de derivar desta: os ajustes que
      // a principal faria no escuro descrevem um bloco que ela não pinta mais.
      if (corEscura && m.tema === "escuro") continue;
      motivos.push({ codigo: m.codigo, origem, tema: m.tema, alvo: m.alvo, detalhe: m.detalhe });
    }
    motivos.push(...motivosDoEscuro);
    return {
      cor: { semente, papel, derivada, ...(corEscura ? { corEscura } : {}) },
      motivos,
    };
  } catch (erro) {
    // Não é `catch` que silencia: o motivo sai com a mensagem real (sem o hex).
    // Existe porque a alternativa é a exceção subir até o layout e derrubar o
    // produto inteiro por causa de uma cor.
    anotar("derivacao_falhou", semIdentidade(erro instanceof Error ? erro.message : String(erro)));
    return { cor: { semente, papel, derivada: null }, motivos };
  }
}

/** A primeira camada (de cima) cuja cor pinta — o laço de sempre, contra uma régua. */
function resolverACor(
  camadas: readonly CamadaDeMarca[],
  regua: Regua,
): { cor: CorResolvida | null; origem: string; motivos: MotivoDaMarca[] } {
  const motivos: MotivoDaMarca[] = [];
  for (const camada of camadas) {
    if (!("cor" in camada)) continue;
    const tentativa = resolverCor(camada.cor, camada.origem, regua, camada.corEscura);
    motivos.push(...tentativa.motivos);
    if (tentativa.cor) return { cor: tentativa.cor, origem: camada.origem, motivos };
  }
  return { cor: null, origem: PADRAO, motivos };
}

/**
 * As sementes que de fato pintam cada tema. `null` = nenhuma derivação pinta
 * (sem cor, ou cor só de identidade): a tela fica com a escala do `globals.css`.
 * Semente neutra NÃO vira `null`: ela deriva sobre a escala do produto e a
 * caminhada ainda pode andar — é esse o pixel que `cssDaMarca` emite.
 */
function sementesQuePintam(cor: CorResolvida | null): {
  claro: string | null;
  escuro: string | null;
} {
  const claro = cor?.derivada ? cor.semente : null;
  return { claro, escuro: cor?.corEscura ? cor.corEscura.semente : claro };
}

/**
 * Empilha as cores do tema das camadas (a de cima vence token a token) passando
 * a TRAVA de baixo para cima: cada camada só entra se a pilha COM ela continua
 * legível. A que reprova é deixada de lado INTEIRA — nunca token a token, o que
 * produziria uma combinação que ninguém escolheu — e anota o motivo.
 *
 * De baixo para cima porque a pergunta é "esta camada, sobre o que existe hoje
 * embaixo dela, se lê?" — a mesma que a server action fez quando ela foi salva.
 * Se a de baixo mudou depois, quem perde é a de cima (a empresa), nunca a
 * instalação: o revendedor não fica refém das escolhas de um cliente.
 *
 * Nunca lança: `conferirCores` é pura e total, e o `try` é a rede para o caso
 * de ela deixar de ser — este código roda no `app/layout.tsx`.
 */
function travarCores(
  camadas: readonly CamadaDeMarca[],
  regua: Regua,
  neutros: NeutrosDaMarca,
  sementes: { claro: string | null; escuro: string | null },
): { cores: CoresDoTema; origem: string; motivos: MotivoDaMarca[] } {
  const motivos: MotivoDaMarca[] = [];
  let pilha: CoresDoTema = {};
  let origem = PADRAO;
  for (const camada of [...camadas].reverse()) {
    const escolhidas = coresDoTemaEscolhidas(camada.cores);
    if (!escolhidas) continue;
    const candidata = empilharCores(escolhidas, pilha);
    let conferencia: ConferenciaDasCores;
    try {
      conferencia = conferirCores({ regua, neutros, cores: candidata, sementes });
    } catch {
      conferencia = { passa: false, reprovas: [], pares: 0 };
    }
    if (!conferencia.passa) {
      const primeira = conferencia.reprovas[0];
      motivos.push({
        codigo: "cores_sem_contraste",
        origem: camada.origem,
        tema: primeira?.tema ?? null,
        alvo: primeira?.papel ?? null,
        detalhe:
          `${conferencia.reprovas.length} par(es) abaixo do piso sobre as camadas de baixo; ` +
          `as cores do tema desta camada ficam de lado`,
      });
      continue;
    }
    pilha = candidata;
    origem = camada.origem;
  }
  return { cores: pilha, origem, motivos };
}

/**
 * A trava das cores do tema sobre uma pilha de camadas — a pergunta que a
 * server action e a tela fazem ANTES de gravar.
 *
 * Diferente de `resolverMarca`, aqui nada é deixado de lado: as cores de todas
 * as camadas são empilhadas e medidas juntas, e a resposta é sim ou não, com os
 * pares. As sementes são as que a pilha pinta com essas cores no lugar.
 */
export function conferirCoresDaPilha(
  camadas: readonly CamadaDeMarca[],
  regua: Regua,
): ConferenciaDasCores {
  let pilha: CoresDoTema = {};
  for (const camada of [...camadas].reverse()) {
    const escolhidas = coresDoTemaEscolhidas(camada.cores);
    if (escolhidas) pilha = empilharCores(escolhidas, pilha);
  }
  let neutros: NeutrosDaMarca = "quente";
  for (const camada of camadas) {
    const escolhido = neutrosEscolhidos(camada.neutros);
    if (escolhido) {
      neutros = escolhido;
      break;
    }
  }
  const reguaDosNeutros = regua === REGUA_DO_PRODUTO ? reguaDoProduto(neutros) : regua;
  const { cor } = resolverACor(camadas, reguaComCores(reguaDosNeutros, pilha));
  return conferirCores({ regua: reguaDosNeutros, neutros, cores: pilha, sementes: sementesQuePintam(cor) });
}

/**
 * Junta as camadas, da MAIS específica para a MAIS genérica.
 *
 * O padrão do produto é o fundo implícito da pilha — não é uma camada que se
 * passa, é o que sobra quando ninguém definiu nada.
 *
 * Uma cor inválida numa camada de cima NÃO apaga a cor válida de baixo: ela é
 * anotada e a busca continua descendo. Numa instalação de revendedor, uma
 * organização que grava lixo tem de cair na marca do revendedor, não na nossa.
 */
export function resolverMarca(camadas: readonly CamadaDeMarca[], regua: Regua): MarcaResolvida {
  const nome = primeiroDefinido(camadas, (c) => c.nome);
  const logo = primeiroDefinido(camadas, (c) => c.logoUrl);
  const base = resolveBranding(nome?.valor, logo?.valor);
  // Uma camada com logo próprio encerra a herança do par: a empresa não pode
  // ganhar o logo escuro de OUTRA marca só porque enviou apenas o padrão.
  let logoEscuro: { valor: string; origem: string } | undefined;
  for (const camada of camadas) {
    const escuro = camada.logoDarkUrl?.trim();
    if (escuro) {
      logoEscuro = { valor: escuro, origem: camada.origem };
      break;
    }
    if (camada.logoUrl?.trim()) break;
  }

  let neutros: NeutrosDaMarca = "quente";
  let origemDosNeutros = PADRAO;
  for (const camada of camadas) {
    const escolhido = neutrosEscolhidos(camada.neutros);
    if (escolhido) {
      neutros = escolhido;
      origemDosNeutros = camada.origem;
      break;
    }
  }
  let raio: RaioDaMarca = "padrao";
  let origemDoRaio = PADRAO;
  for (const camada of camadas) {
    const escolhido = raioEscolhido(camada.raio);
    if (escolhido) {
      raio = escolhido;
      origemDoRaio = camada.origem;
      break;
    }
  }
  let barraLateral: BarraLateralDaMarca = "padrao";
  let origemDaBarra = PADRAO;
  for (const camada of camadas) {
    const escolhida = barraLateralEscolhida(camada.barraLateral);
    if (escolhida) {
      barraLateral = escolhida;
      origemDaBarra = camada.origem;
      break;
    }
  }
  let densidade: DensidadeDaMarca = "aerada";
  let origemDaDensidade = PADRAO;
  for (const camada of camadas) {
    const escolhida = densidadeEscolhida(camada.densidade);
    if (escolhida) {
      densidade = escolhida;
      origemDaDensidade = camada.origem;
      break;
    }
  }
  let fonte: FonteDaMarca = "atkinson";
  let origemDaFonte = PADRAO;
  for (const camada of camadas) {
    const escolhida = fonteEscolhida(camada.fonte);
    if (escolhida) {
      fonte = escolhida;
      origemDaFonte = camada.origem;
      break;
    }
  }
  // A cor e medida CONTRA os neutros que vao aparecer: o contraste do accent sobre
  // o fundo `frio` nao e o do `quente`. So a regua do PRODUTO ganha o preset — uma
  // regua injetada (teste, previa de outra regua) e do chamador e fica como veio.
  const reguaDosNeutros = regua === REGUA_DO_PRODUTO ? reguaDoProduto(neutros) : regua;

  const motivos: MotivoDaMarca[] = [];

  // A cor da marca é resolvida primeiro contra a régua dos NEUTROS: é ela que
  // diz quais sementes pintam cada tema, e a trava das cores precisa disso.
  const preliminar = resolverACor(camadas, reguaDosNeutros);
  const travadas = travarCores(camadas, reguaDosNeutros, neutros, sementesQuePintam(preliminar.cor));

  // Superfícies escolhidas mudam o chão da caminhada do accent: a cor da marca
  // é re-derivada SOBRE elas. Sem superfície escolhida a régua é a MESMA
  // (identidade), nada é recalculado e a saída é byte a byte a de antes.
  const reguaEfetiva = reguaComCores(reguaDosNeutros, travadas.cores);
  const final = reguaEfetiva === reguaDosNeutros ? preliminar : resolverACor(camadas, reguaEfetiva);
  motivos.push(...final.motivos, ...travadas.motivos);
  const cor = final.cor;
  const origemDaCor = final.origem;

  return {
    ...base,
    ...(logoEscuro ? { logoDarkUrl: logoEscuro.valor } : {}),
    cor,
    neutros,
    raio,
    barraLateral,
    densidade,
    fonte,
    cores: travadas.cores,
    origens: {
      nome: nome?.origem ?? PADRAO,
      logoUrl: logo?.origem ?? PADRAO,
      ...(logoEscuro ? { logoDarkUrl: logoEscuro.origem } : {}),
      cor: origemDaCor,
      neutros: origemDosNeutros,
      raio: origemDoRaio,
      barraLateral: origemDaBarra,
      densidade: origemDaDensidade,
      fonte: origemDaFonte,
      cores: travadas.origem,
      ...(cor?.corEscura ? { corEscura: origemDaCor } : {}),
    },
    motivos,
  };
}

/**
 * A forma da linha de `platform_branding` que o RESOLVEDOR precisa conhecer.
 *
 * Só os três campos que viram marca. `fallback_at`, `seeded_from_env` e
 * companhia são ESTADO da instalação e não entram aqui de propósito: o
 * resolvedor não decide nada com eles, e um tipo que carrega o que não usa vira
 * o lugar onde a próxima pessoa acrescenta lógica que não deveria existir aqui.
 * A linha completa vive em `lib/branding/instalacao.ts`.
 *
 * Campos opcionais para o mesmo motivo do `.catchall` do `schema.ts`: código
 * novo lendo linha velha (ou o contrário) não pode quebrar o layout.
 */
export type LinhaDaInstalacao = {
  readonly app_name?: string | null;
  readonly logo_url?: string | null;
  /**
   * O ARQUIVO subido pela tela, dentro do bucket `brand-logos`. Caminho, nunca
   * URL — a razão está no cabeçalho de `lib/branding/logo.ts` (DIRC-C: a URL é
   * função determinística do caminho, e gravá-la amarraria a marca ao host do
   * projeto Supabase de hoje).
   *
   * Convive com `logo_url` em vez de substituí-lo, e a ordem entre os dois é
   * `logoDaCamada`: o arquivo vence a URL colada. `logo_url` continua existindo
   * porque é a rede de rollback — o `agent.sh` reverte a IMAGEM, nunca o banco,
   * então uma instalação pode voltar a rodar código que não conhece esta coluna.
   */
  readonly logo_path?: string | null;
  readonly logo_dark_path?: string | null;
  /**
   * O ícone da aba subido pela tela (migration 0443). Não entra na camada de
   * marca: só o `<head>` o usa, lendo a linha crua em `app/layout.tsx`. Sem
   * arquivo, a aba segue com o ícone desenhado por `app/icon.tsx`.
   */
  readonly favicon_path?: string | null;
  readonly accent_hex?: string | null;
  /**
   * A cor do TEMA ESCURO (#2482), migration 0627. Opcional e `null` = a
   * instalação não definiu, e os dois temas derivam de `accent_hex` — que é o
   * caso de TODA linha gravada antes desta coluna.
   */
  readonly accent_dark_hex?: string | null;
  /** A paleta de neutros (migration 0650). Linha anterior a coluna: ausente = `quente`. */
  readonly neutros?: string | null;
  /** O raio dos cantos (migration 0704). Linha anterior a coluna: ausente = `padrao`. */
  readonly raio?: string | null;
  /** A barra lateral (migration 0704). Linha anterior a coluna: ausente = `padrao`. */
  readonly barra_lateral?: string | null;
  /** A densidade (migration 0705). Linha anterior a coluna: ausente = `aerada`. */
  readonly densidade?: string | null;
  /** A fonte (migration 0706). Linha anterior a coluna: ausente = `atkinson`. */
  readonly fonte?: string | null;
  /**
   * As cores do tema (migration 0707), jsonb `{claro?, escuro?}`. `unknown` de
   * propósito: o banco é lido sem confiança, e quem dá forma é
   * `coresDoTemaEscolhidas` — linha anterior à coluna: ausente = o produto.
   */
  readonly cores?: unknown;
};

/**
 * A camada do BANCO — a configuração viva da instalação, acima do `.env`.
 *
 * Fica ACIMA do ambiente na pilha porque é ela que o operador edita sem SSH.
 * O `.env` continua embaixo, e não é redundância: é a rede de segurança do
 * rollback. O `agent.sh` do kit, em falha de update, reverte só o `APP_IMAGE` —
 * não o schema e não o `git checkout` —, então o clone fica com CÓDIGO ANTIGO
 * sobre BANCO NOVO. Código antigo não conhece esta camada; com o `.env` intacto
 * ele degrada para o valor da instalação em vez de perder a marca.
 *
 * `null` (tabela ausente, banco fora do ar, linha ainda não semeada) devolve uma
 * camada que não fala de nada — e não uma camada que APAGA a de baixo. É a
 * diferença entre "o banco não respondeu" e "o operador limpou a marca".
 */
export function camadaDaInstalacao(linha: LinhaDaInstalacao | null): CamadaDeMarca {
  if (!linha) return { origem: "banco" };
  const hex = (linha.accent_hex ?? "").trim();
  // A cor do escuro é da MESMA camada que a do claro (#2482): o par se fecha
  // aqui, como o de logo — ver `logoDarkUrl` acima. Hex vazio não vira a chave.
  const hexEscuro = (linha.accent_dark_hex ?? "").trim();
  // O arquivo subido vence a URL colada, DENTRO desta camada — ver `logoDaCamada`.
  const logoUrl = logoDaCamada(linha.logo_path, linha.logo_url);
  const logoDarkUrl = logoDaCamada(linha.logo_dark_path, null);
  const neutros = neutrosEscolhidos(linha.neutros);
  const raio = raioEscolhido(linha.raio);
  const barraLateral = barraLateralEscolhida(linha.barra_lateral);
  const densidade = densidadeEscolhida(linha.densidade);
  const fonte = fonteEscolhida(linha.fonte);
  const cores = coresDoTemaEscolhidas(linha.cores);
  // Mesma regra do `.env`: campo vazio é ausência de configuração, não cor com
  // defeito. Sem isto, uma linha semeada de um `.env` sem cor emitiria
  // `cor_ausente` em toda instalação de fábrica — e aviso no caso normal ensina
  // o operador a ignorar avisos.
  if (hex.length === 0) {
    return {
      origem: "banco",
      nome: linha.app_name,
      logoUrl,
      ...(logoDarkUrl ? { logoDarkUrl } : {}),
      ...(neutros ? { neutros } : {}),
      ...(raio ? { raio } : {}),
      ...(barraLateral ? { barraLateral } : {}),
      ...(densidade ? { densidade } : {}),
      ...(fonte ? { fonte } : {}),
      ...(cores ? { cores } : {}),
    };
  }
  return {
    origem: "banco",
    nome: linha.app_name,
    logoUrl,
    ...(logoDarkUrl ? { logoDarkUrl } : {}),
    cor: envelopeDeSemente(hex),
    ...(hexEscuro.length > 0 ? { corEscura: envelopeDeSemente(hexEscuro) } : {}),
    ...(neutros ? { neutros } : {}),
      ...(raio ? { raio } : {}),
      ...(barraLateral ? { barraLateral } : {}),
      ...(densidade ? { densidade } : {}),
      ...(fonte ? { fonte } : {}),
      ...(cores ? { cores } : {}),
  };
}

/**
 * A camada do `.env` — a SEMENTE, e a que nunca deixa de existir.
 *
 * Mesmo quando a tabela por organização entrar, é esta camada que pinta o login,
 * o e-mail de convite e o erro 500: telas onde ainda não há organização
 * resolvida (6 dos 8 call sites de `lib/branding` já estão nessa situação).
 *
 * Recebe a fonte, não a procura: é o que permite testar a precedência sem mexer
 * em `process.env` — mesmo desenho de `resolveBranding` em `lib/branding.ts`.
 */
export function camadaDoAmbiente(fonte: {
  APP_NAME?: string;
  APP_LOGO_URL?: string;
  APP_ACCENT_HEX?: string;
}): CamadaDeMarca {
  const hex = (fonte.APP_ACCENT_HEX ?? "").trim();
  // Chave declarada e vazia (`APP_ACCENT_HEX=`) é o estado que o `install.sh`
  // deixa quando o operador não responde — o mesmo caso que `resolveBranding`
  // trata para o nome. Não é cor ausente com defeito, é instalação de fábrica:
  // a camada simplesmente não fala sobre cor.
  if (hex.length === 0) return { origem: "env", nome: fonte.APP_NAME, logoUrl: fonte.APP_LOGO_URL };
  return {
    origem: "env",
    nome: fonte.APP_NAME,
    logoUrl: fonte.APP_LOGO_URL,
    cor: envelopeDeSemente(hex),
  };
}

/**
 * O que fica gravado em `organizations.settings.branding` — a marca do cliente
 * final do revendedor, como o RESOLVEDOR precisa conhecer.
 *
 * Campos opcionais pelo mesmo motivo de `LinhaDaInstalacao` e do `.catchall` do
 * `schema.ts`: o kit self-host põe código VELHO sobre dado NOVO por construção
 * (o `update.sh` aplica o baseline antes de puxar a imagem, e o rollback do
 * `agent.sh` reverte só o `APP_IMAGE`). Um tipo que exigisse as chaves faria o
 * leitor velho quebrar num jsonb que o novo escreveu — e este código roda no
 * caminho de render.
 */
export type MarcaDaOrganizacao = {
  readonly app_name?: string | null;
  readonly accent_hex?: string | null;
  /**
   * O logo DESTA organização — caminho dentro de `brand-logos`, sob o prefixo do
   * próprio `organization_id`. Sem `logo_url` par: aqui não há herança de `.env`
   * a preservar (a chave `APP_LOGO_URL` é da instalação), então uma URL colada
   * por organização seria contrato novo sem consumidor. Quem não subiu arquivo
   * continua com o logo da instalação, pela precedência por campo.
   */
  readonly logo_path?: string | null;
  readonly logo_dark_path?: string | null;
  /**
   * A cor do TEMA ESCURO desta organização (#2482) — a chave `accent_dark_hex`
   * de `settings.branding`, sem coluna nova: o jsonb acolhe o campo pelo mesmo
   * motivo de `logo_dark_path` (kit self-host com código velho sobre dado novo).
   */
  readonly accent_dark_hex?: string | null;
  /** A paleta de neutros desta organizacao; ausente = herda da instalacao. */
  readonly neutros?: string | null;
  /** O raio desta organizacao; ausente = herda da instalacao. */
  readonly raio?: string | null;
  /** A barra lateral desta organizacao; ausente = herda da instalacao. */
  readonly barra_lateral?: string | null;
  /** A densidade desta organizacao; ausente = herda da instalacao. */
  readonly densidade?: string | null;
  /** A fonte desta organizacao; ausente = herda da instalacao. */
  readonly fonte?: string | null;
  /** As cores do tema desta organizacao (0707); ausente = herda token a token. */
  readonly cores?: unknown;
};

/**
 * A camada da ORGANIZAÇÃO — o cliente do revendedor, acima de tudo.
 *
 * Fica no TOPO da pilha porque é a marca que a empresa mostra para os próprios
 * atendentes; a da instalação continua embaixo e continua valendo campo a campo
 * (quem definiu só a cor mantém o nome do revendedor).
 *
 * `logoUrl` É PRODUZIDO AQUI — e esta linha é o produtor que faltava. Até a onda
 * anterior, `ActiveOrg.marca.logoUrl` (`lib/auth/types.ts`) e a condição
 * `origens.logoUrl === "organizacao"` (`app/app/layout.tsx`) existiam sem
 * ninguém do outro lado: o consumidor entrou antes do produtor, de propósito e
 * declarado, para que o upload por organização fosse só esta camada e não mais
 * uma passada pela casca inteira. `null` aqui é NEUTRO — `primeiroDefinido`
 * ignora valor vazio e desce para a instalação —, então a organização que não
 * subiu arquivo continua com o logo do revendedor.
 *
 * Hex vazio devolve camada SEM a chave `cor`, e não `cor: null`: medido em
 * `resolverCor` (:183-187), `null` emite `cor_ausente` e a chave AUSENTE desce
 * calada. Uma fábrica que devolvesse `?? null` acenderia aviso em TODA
 * organização que não configurou marca — o ruído que :180-182 diz querer evitar,
 * e que é como um operador aprende a ignorar aviso.
 *
 * Recebe a marca já lida, e não vai buscá-la: mesmo desenho de
 * `camadaDaInstalacao` e `camadaDoAmbiente`, e é o que permite testar a
 * precedência sem banco. Quem lê o jsonb é `lib/branding/organizacao.ts`.
 */
export function camadaDaOrganizacao(marca: MarcaDaOrganizacao | null): CamadaDeMarca {
  if (!marca) return { origem: "organizacao" };
  const hex = (marca.accent_hex ?? "").trim();
  const hexEscuro = (marca.accent_dark_hex ?? "").trim();
  const logoUrl = logoDaCamada(marca.logo_path, null);
  const logoDarkUrl = logoDaCamada(marca.logo_dark_path, null);
  const neutros = neutrosEscolhidos(marca.neutros);
  const raio = raioEscolhido(marca.raio);
  const barraLateral = barraLateralEscolhida(marca.barra_lateral);
  const densidade = densidadeEscolhida(marca.densidade);
  const fonte = fonteEscolhida(marca.fonte);
  const cores = coresDoTemaEscolhidas(marca.cores);
  if (hex.length === 0)
    return {
      origem: "organizacao",
      nome: marca.app_name,
      logoUrl,
      ...(logoDarkUrl ? { logoDarkUrl } : {}),
      ...(neutros ? { neutros } : {}),
      ...(raio ? { raio } : {}),
      ...(barraLateral ? { barraLateral } : {}),
      ...(densidade ? { densidade } : {}),
      ...(fonte ? { fonte } : {}),
      ...(cores ? { cores } : {}),
    };
  return {
    origem: "organizacao",
    nome: marca.app_name,
    logoUrl,
    ...(logoDarkUrl ? { logoDarkUrl } : {}),
    cor: envelopeDeSemente(hex),
    ...(hexEscuro.length > 0 ? { corEscura: envelopeDeSemente(hexEscuro) } : {}),
    ...(neutros ? { neutros } : {}),
      ...(raio ? { raio } : {}),
      ...(barraLateral ? { barraLateral } : {}),
      ...(densidade ? { densidade } : {}),
      ...(fonte ? { fonte } : {}),
      ...(cores ? { cores } : {}),
  };
}
