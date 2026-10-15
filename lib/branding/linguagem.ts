/**
 * O diagnóstico da marca traduzido para a língua de quem usa o sistema.
 *
 * ── Por que vive em `lib/branding/`, e não dentro de uma das telas ────────────
 *
 * Nasceu em `app/admin/(protected)/marca/_linguagem.ts`, para a tela da marca da
 * INSTALAÇÃO. Com a marca por ORGANIZAÇÃO passaram a existir duas telas que
 * traduzem os mesmos códigos do mesmo motor, e a alternativa — a tela do tenant
 * importar de dentro de `app/admin/` — seria o começo de duas linguagens
 * divergentes: a primeira frase acrescentada de um lado não chegaria ao outro, e
 * o mesmo estado do sistema passaria a ter duas explicações.
 *
 * ── Por que um módulo, e não frases soltas no JSX ─────────────────────────────
 *
 * O motor da marca (`lib/branding/`) fala em código: `accent_deslocado`,
 * `valor_fora_da_allowlist`, `marca_acromatica`. Quem lê estas telas é o dono de
 * uma VPS ou o admin de uma empresa — para eles "o accent foi deslocado" não é
 * informação, é ruído. A tradução mora aqui por duas razões que um `switch`
 * dentro do JSX não daria:
 *
 *  1. `TRADUCOES` é `Record<CodigoDaMarca, Traducao>`, e `CodigoDaMarca` é a
 *     UNIÃO dos três tipos de código que o motor emite. Código novo lá em cima
 *     REPROVA O TYPECHECK aqui — a tela não pode ficar muda sobre um estado que
 *     o motor passou a distinguir, que é exatamente como um alarme morre.
 *  2. o vocabulário proibido (rampa, stop, OKLCH, ΔE, token, WCAG) vira asserção
 *     de teste sobre um objeto — `tests/unit/marca-linguagem.test.ts` —, em vez
 *     de disciplina de quem escreve JSX às pressas. Uma guarda sobre um módulo
 *     cobre as duas telas; a mesma guarda por tela precisaria ser lembrada a
 *     cada tela nova.
 *
 * ── Por que `silencio` e `com_contexto` carregam um `porque` escrito ──────────
 *
 * Mesma regra da `MARCA_CONGELADA` de `tests/unit/branding.test.ts`: uma decisão
 * de NÃO mostrar algo precisa estar escrita, senão é indistinguível de
 * esquecimento — e a próxima pessoa "conserta" acrescentando ruído.
 */

import type { CodigoDeMotivo, Tema } from "@/lib/branding/contraste";
import type { CodigoDoCss } from "@/lib/branding/css";
import type { CodigoDaResolucao } from "@/lib/branding/resolve";

/** Todo código que o motor da marca sabe emitir, nas três camadas. */
export type CodigoDaMarca = CodigoDaResolucao | CodigoDeMotivo | CodigoDoCss;

export type Tom = "informativo" | "atencao" | "problema";

/** Uma linha pronta para a tela. Nunca carrega código, nunca carrega jargão. */
export type Aviso = { readonly tom: Tom; readonly texto: string };

export type Traducao =
  | { readonly modo: "frase"; readonly tom: Tom; readonly texto: string }
  /** A frase depende de contexto (tema, sentido, agrupamento) e é montada em `avisosDaMarca`. */
  | { readonly modo: "com_contexto"; readonly porque: string }
  /** Deliberadamente mudo — outra frase já cobre o mesmo fato. */
  | { readonly modo: "silencio"; readonly porque: string };

/** A mesma frase serve aos três códigos da serialização: para quem lê, o fato é um só. */
const BARRADO_NA_SEGURANCA =
  "A verificação de segurança barrou o resultado antes de ele chegar à tela, " +
  "e a marca não foi aplicada.";

export const TRADUCOES: Record<CodigoDaMarca, Traducao> = {
  // ── resolução: o que a camada de configuração achou do que estava gravado ──
  cor_ausente: {
    modo: "silencio",
    porque:
      "não é ajuste nem recusa — significa que aquela fonte não declara cor. A tela já diz 'nenhuma cor definida' no lugar certo, e repetir isso como aviso ensina a ignorar avisos",
  },
  envelope_malformado: {
    modo: "frase",
    tom: "problema",
    texto: "O valor gravado para a cor não está na forma que o sistema entende.",
  },
  semente_invalida: {
    modo: "frase",
    tom: "problema",
    texto: "A cor gravada não é um código de cor válido.",
  },
  formato_desconhecido: {
    modo: "frase",
    tom: "problema",
    texto: "A cor foi gravada por uma versão mais nova do sistema, e esta não sabe lê-la.",
  },
  algoritmo_desconhecido: {
    modo: "frase",
    tom: "informativo",
    texto:
      "A cor foi salva por outra versão do sistema. Ela continua valendo — esta versão " +
      "recalcula os tons a partir dela.",
  },
  papel_desconhecido: {
    modo: "frase",
    tom: "problema",
    texto:
      "Esta versão do sistema não sabe onde aplicar a cor gravada, então ela não pinta a interface.",
  },
  papel_nao_pinta: {
    modo: "frase",
    tom: "informativo",
    texto: "A cor está guardada só como identidade: ela aparece no logo, mas não pinta os botões.",
  },
  derivacao_falhou: {
    modo: "frase",
    tom: "problema",
    texto: "O cálculo dos tons a partir dessa cor não terminou.",
  },
  cor_escura_acromatica: {
    modo: "frase",
    tom: "atencao",
    texto:
      "A cor do modo escuro é um tom neutro (cinza, preto ou branco), e uma cor assim não " +
      "destaca nada na tela. No modo escuro, os botões seguem com a cor padrão do sistema.",
  },
  cores_sem_contraste: {
    modo: "frase",
    tom: "problema",
    texto:
      "As cores do tema escolhidas aqui deixaram algum texto difícil de ler sobre as cores que " +
      "vêm de quem instalou o sistema. Enquanto isso, a tela usa as cores de baixo — abra " +
      "\u201cCores do tema\u201d para ajustar.",
  },

  // ── derivação: o que o sistema fez com a cor para ela caber na interface ──
  marca_acromatica: {
    modo: "frase",
    tom: "atencao",
    texto:
      "Sua cor é um tom neutro (cinza, preto ou branco), e uma cor assim não destaca nada " +
      "na tela. Os botões seguem com a cor padrão do sistema, e a sua fica reservada ao logo.",
  },
  accent_deslocado: {
    modo: "com_contexto",
    porque:
      "a frase muda com o modo (claro ou escuro) e com o sentido do ajuste — 'um tom mais escuro' e 'um tom mais claro' são as duas respostas certas, em situações opostas",
  },
  accent_sem_contraste_possivel: {
    modo: "frase",
    tom: "problema",
    texto:
      "Não existe tom desta cor que deixe todos os elementos legíveis. Alguns detalhes — " +
      "como o contorno que marca o campo em foco — ficam difíceis de enxergar.",
  },
  semantica_deslocada: {
    modo: "com_contexto",
    porque:
      "as cores de alerta afetadas entram numa frase só; uma linha por cor e por modo daria até oito avisos dizendo o mesmo",
  },
  redundancia_nao_cromatica_necessaria: {
    modo: "com_contexto",
    porque:
      "é o caso extremo do anterior (não há afastamento possível) e entra na mesma frase agrupada",
  },

  // ── serialização: a última porta antes de a cor virar pixel ──
  nome_de_token_invalido: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  valor_fora_da_allowlist: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  saida_suspeita: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  token_nao_serializado: {
    modo: "silencio",
    porque:
      "é o outro lado do aviso sobre as cores de alerta, que já aparece agrupado; dizer o mesmo fato duas vezes só faz a lista crescer até ninguém ler",
  },
};

/** Como o dono da instalação chama cada cor de estado do sistema. */
const NOME_DA_COR_DE_ALERTA: Record<string, string> = {
  success: "sucesso",
  warning: "atenção",
  error: "erro",
  info: "informação",
};

function ehCodigoConhecido(codigo: string): codigo is CodigoDaMarca {
  return Object.hasOwn(TRADUCOES, codigo);
}

/** "a" · "a e b" · "a, b e c" */
function listar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1] ?? ""}`;
}

/**
 * Dedup por TEXTO, não por código: três códigos distintos da serialização dizem
 * a mesma frase de propósito, e `accent_sem_contraste_possivel` sai uma vez por
 * tema. Repetir a linha idêntica faria a lista parecer pior do que o problema é.
 */
function semRepetir(avisos: readonly Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return avisos.filter((a) => {
    if (vistos.has(a.texto)) return false;
    vistos.add(a.texto);
    return true;
  });
}

/** A forma mínima que as três camadas de motivo compartilham. */
export type MotivoLido = {
  readonly codigo: CodigoDaMarca;
  readonly tema?: Tema | null;
  readonly alvo?: string | null;
};

/**
 * Onde o tom dos botões caiu em relação à COR DA PESSOA, por modo.
 *
 * Positivo = mais escuro que a cor dela; negativo = mais claro; zero = é a cor
 * dela. `null` = a cor não está na escala mostrada — o caso da marca neutra, em
 * que a escala é a do produto e comparar com "a sua cor" não faria sentido.
 *
 * ── Por que NÃO é o deslocamento que o motor devolve ──────────────────────────
 *
 * `TokensDoTema.deslocamento` conta a partir do tom PADRÃO DAQUELE MODO, não da
 * cor da pessoa — e os dois modos partem de tons diferentes de propósito (o
 * escuro parte de um mais claro, para a cor não sumir no fundo). Usá-lo direto
 * produziu uma frase falsa, medida com `#f5c518`: o modo escuro anda +2 e a
 * frase dizia "um tom mais escuro da sua cor", quando o botão pousa EXATAMENTE
 * na cor dela. Quem lê a tela compara com a própria cor; a referência da frase
 * tem de ser a mesma que a do leitor.
 */
export type DistanciaAteSuaCor = {
  readonly claro: number | null;
  readonly escuro: number | null;
};

/**
 * A lista de frases que a tela mostra sob "o que o sistema fez com esta cor".
 *
 * Recebe os motivos JÁ EMITIDOS pelo motor, e não a cor: assim a tela nunca
 * conclui coisa diferente do que o sistema decidiu. A distância entra separada
 * porque o motivo carrega o TEMA, não o sentido — e sem o sentido a frase diria
 * "um tom diferente", que não explica nada.
 */
export function avisosDaMarca(
  motivos: readonly MotivoLido[],
  distancia: DistanciaAteSuaCor,
): Aviso[] {
  const avisos: Aviso[] = [];
  const coresDeAlerta = new Set<string>();
  let saiuDaSuaCor = false;

  /**
   * `null` nos dois modos significa que a cor da pessoa NÃO está na escala em
   * uso — a interface segue com a do produto. Toda frase que começa com "sua
   * cor" fica falsa aí, e a razão é a mesma nos dois casos que dependem disto:
   * MEDIDO com `#808080` e `#ffffff`, a derivação emite `semantica_deslocada`
   * porque o verde do PRODUTO colide com o verde de sucesso do PRODUTO — uma
   * propriedade da nossa paleta, que existia antes de a pessoa colar cor
   * nenhuma. Dizer "sua cor ficou parecida com sucesso" ali culpa quem não fez
   * nada, e manda procurar problema no lugar errado.
   */
  const suaCorPinta = distancia.claro !== null || distancia.escuro !== null;

  for (const motivo of motivos) {
    const traducao = TRADUCOES[motivo.codigo];
    if (traducao.modo === "silencio") continue;
    if (traducao.modo === "frase") {
      avisos.push({ tom: traducao.tom, texto: traducao.texto });
      continue;
    }

    if (motivo.codigo === "accent_deslocado") {
      const noEscuro = motivo.tema === "escuro";
      const degraus = noEscuro ? distancia.escuro : distancia.claro;
      // Ver `suaCorPinta`: comparar com "a sua cor" apontaria para uma cor que
      // não está em degrau nenhum da escala mostrada.
      if (degraus === null) continue;
      const modo = noEscuro ? "escuro" : "claro";
      if (degraus === 0) {
        // O sistema mexeu na escala, mas o botão pousou na cor dela. Dizer que
        // houve ajuste aqui assustaria sem motivo — e calar deixaria o modo sem
        // nenhuma frase, como se a tela não soubesse responder por ele.
        avisos.push({
          tom: "informativo",
          texto:
            `No modo ${modo}, os botões usam exatamente a sua cor — o sistema conferiu que o ` +
            `texto em cima dela fica legível.`,
        });
        continue;
      }
      saiuDaSuaCor = true;
      avisos.push({
        tom: "informativo",
        texto:
          `No modo ${modo}, os botões usam um tom ${degraus > 0 ? "mais escuro" : "mais claro"} ` +
          `que a sua cor — é o que mantém o texto em cima deles legível.`,
      });
      continue;
    }

    const nome = NOME_DA_COR_DE_ALERTA[motivo.alvo ?? ""];
    if (nome && suaCorPinta) coresDeAlerta.add(nome);
  }

  // Só quando o botão de fato NÃO é a cor dela: senão a frase consolaria de uma
  // perda que não houve, e frase de consolo desnecessária é o que faz alguém
  // procurar um problema que não existe.
  if (saiuDaSuaCor) {
    avisos.push({
      tom: "informativo",
      texto: "A sua cor original continua no logo e nos destaques.",
    });
  }
  if (coresDeAlerta.size > 0) {
    avisos.push({
      tom: "atencao",
      texto:
        `Sua cor ficou parecida com a que o sistema usa para indicar ` +
        `${listar([...coresDeAlerta].sort())}. Nesta versão ele ainda não afasta esses tons ` +
        `sozinho — vale conferir se os avisos continuam fáceis de distinguir.`,
    });
  }

  return semRepetir(avisos);
}

/**
 * Traduz `platform_branding.fallback_reason` — a coluna que diz por que a marca
 * PAROU de ser aplicada.
 *
 * O formato é o que `motivoDoFallback` grava: códigos separados por vírgula,
 * cada um podendo trazer `@alvo` colado. O alvo é nome de coisa interna
 * (`--color-accent`) e é descartado aqui de propósito: para quem lê, ele não
 * acrescenta nada e desfaz o resto da frase.
 *
 * Código desconhecido NÃO vira silêncio. O alarme está aceso — se esta versão
 * não sabe explicá-lo, ela diz isso, em vez de mostrar um bloco de alerta vazio
 * que parece defeito da tela.
 */
export function motivosDoFallback(motivo: string | null): Aviso[] {
  const avisos: Aviso[] = [];
  for (const parte of (motivo ?? "").split(",")) {
    const codigo = (parte.split("@")[0] ?? "").trim();
    if (codigo.length === 0) continue;
    const traducao = ehCodigoConhecido(codigo) ? TRADUCOES[codigo] : null;
    avisos.push(
      traducao?.modo === "frase"
        ? { tom: "problema", texto: traducao.texto }
        : {
            tom: "problema",
            texto:
              "O sistema recusou a cor gravada por um motivo que esta versão não sabe explicar.",
          },
    );
  }
  return semRepetir(avisos);
}

// ── As cores do tema: a frase de cada par que a trava reprovou ──────────────

/** O nome em português de cada papel ou superfície que a trava mede. */
export const NOME_DO_PAPEL: Readonly<Record<string, string>> = {
  "--color-bg": "Fundo da página",
  "--color-surface": "Cartões",
  "--color-surface-elevated": "Áreas em destaque",
  "--color-text": "Texto principal",
  "--color-text-muted": "Texto secundário",
  "--color-text-subtle": "Texto apagado",
  "--color-border": "Bordas",
  "--color-border-strong": "Bordas fortes",
  "--color-success": "Cor de sucesso",
  "--color-success-bg": "Fundo de sucesso",
  "--color-success-fg": "Texto de sucesso",
  "--color-warning": "Cor de atenção",
  "--color-warning-bg": "Fundo de atenção",
  "--color-warning-fg": "Texto de atenção",
  "--color-error": "Cor de erro",
  "--color-error-bg": "Fundo de erro",
  "--color-error-fg": "Texto de erro",
  "--color-info": "Cor informativa",
  "--color-info-bg": "Fundo informativo",
  "--color-info-fg": "Texto informativo",
  "--color-accent": "Cor dos botões",
  "--color-accent-fg": "Texto dos botões",
  "--color-accent-hover": "Botão sob o mouse",
  "--color-accent-soft": "Destaque suave",
  "--ring": "Contorno de foco",
};

/**
 * O nome de um papel da trava. Os papéis da marca chegam com o SELETOR do
 * `globals.css` (`::selection/color`, `[data-theme="dark"] :focus-visible/…`):
 * esses viram o que a pessoa vê, nunca o seletor.
 */
function nomeDoPapel(chave: string): string {
  const base = chave.split("@")[0] ?? chave;
  if (base.includes("::selection")) return "Texto selecionado";
  if (base.includes(":focus-visible")) return "Contorno de foco";
  return NOME_DO_PAPEL[base] ?? "Um elemento da tela";
}

function minuscula(nome: string): string {
  return nome.charAt(0).toLowerCase() + nome.slice(1);
}

function decimal(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** O par como a trava o devolve — a forma de `ReprovaDeCor` (`cores-do-tema.ts`). */
export type ReprovaLida = {
  readonly papel: string;
  readonly superficie: string;
  readonly tema: Tema;
  readonly razao: number;
  readonly piso: number;
  readonly frenteMaisClara?: boolean;
};

/**
 * O MOLDE da frase. É chave do dicionário (o espanhol tem o seu), e os nomes
 * entram traduzidos — tradução de frase montada por concatenação sairia em
 * português para quem lê espanhol, que é o modo de falha mudo do i18n.
 */
const MOLDE_DA_REPROVA =
  "{frente} sobre {fundo} ({tema}): {razao} de {piso} — {verbo_frente} {frente_min} ou {verbo_fundo} {fundo_min}.";

/**
 * Uma frase por par reprovado: o par, o tema, a razão contra o piso e o que
 * ajustar — "Texto secundário sobre Cartões (tema escuro): 3,1 de 4,5 —
 * clareie texto secundário ou escureça cartões."
 *
 * O sentido do conselho sai da própria medida: frente mais clara que o fundo
 * pede clarear a frente ou escurecer o fundo; o contrário, o contrário. Sem
 * código de cor: a frase pode ir para log e auditoria.
 */
export function frasesDasReprovas(
  reprovas: readonly ReprovaLida[],
  t: (texto: string) => string = (texto) => texto,
): string[] {
  const frases = reprovas.map((r) => {
    const frente = t(nomeDoPapel(r.papel));
    const fundo = t(nomeDoPapel(r.superficie));
    const clara = r.frenteMaisClara ?? r.tema === "escuro";
    const valores: Record<string, string> = {
      frente,
      fundo,
      tema: r.tema === "claro" ? t("tema claro") : t("tema escuro"),
      razao: decimal(r.razao),
      piso: decimal(r.piso),
      verbo_frente: clara ? t("clareie") : t("escureça"),
      verbo_fundo: clara ? t("escureça") : t("clareie"),
      frente_min: minuscula(frente),
      fundo_min: minuscula(fundo),
    };
    return t(MOLDE_DA_REPROVA).replace(/\{([a-z_]+)\}/g, (_, chave: string) => valores[chave] ?? "");
  });
  return [...new Set(frases)];
}
