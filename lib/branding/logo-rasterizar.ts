import "server-only";

/**
 * SVG → PNG para o logo. O SVG NUNCA é gravado: entra aqui, é PARSEADO como XML,
 * a árvore é filtrada, a árvore aprovada é reserializada, desenhada pelo `sharp`
 * (librsvg), e só o PNG resultante sai.
 *
 * ── Por que isto é seguro onde "aceitar SVG" não era ─────────────────────────
 *
 * O risco do SVG é ele ser SERVIDO: aberto direto do endereço da imagem, ele
 * executa `<script>`. Rasterizado no upload, o que vai para o bucket é um PNG —
 * sem script, sem referência, sem nada a executar. O risco que sobra mudou de
 * lugar: é o SERVIDOR decodificando bytes de quem sobe. Por isso o desenho só
 * acontece depois de recusar, NA ÁRVORE, tudo o que faria o librsvg sair da caixa:
 *
 *  - `<script>`, `<foreignObject>`, `<iframe>` e afins, e atributo `on*` — execução/HTML;
 *  - `href` em qualquer prefixo (`xlink:`, `x:`…) que não aponte para `#id` do
 *    próprio arquivo ou para `data:image/(png|jpeg|gif|webp)`; `url()` com o mesmo
 *    critério, `@import`/`@font-face`/`image()`/`image-set()`/`src()` — em `<style>`
 *    E em todo valor de atributo, DEPOIS de desfazer escapes CSS (`u\72 l(` é
 *    `url(`). É o que transformaria o upload em SSRF/leitura de arquivo local (o
 *    librsvg resolve `file:` e `http:`);
 *  - DOCTYPE com subconjunto interno e entidade — XXE e "billion laughs";
 *  - processing instruction (`<?xml-stylesheet?>`), `xml:base`, animação de `href`;
 *  - bytes NUL / não UTF-8; conteúdo que não começa por `<` (poliglota que o
 *    libvips tomaria por PDF/TIFF); raiz que não é `<svg>`;
 *  - bomba de pixels — `limitInputPixels` no sharp, mais a conferência da
 *    dimensão ANTES de pedir o desenho.
 *
 * Por que parser e não regex: uma regex sobre texto lê o `href` que está DENTRO
 * do valor de outro atributo (`x=" href='#a"`) e não o que o XML entrega. O
 * parser é `@xmldom/xmldom` (JS puro, sem dependências), em modo estrito: aviso,
 * erro ou entidade desconhecida viram recusa. E o sharp recebe a árvore
 * REserializada, não os bytes originais — o que o librsvg desenha é exatamente o
 * que foi conferido, sem diferença entre dois parsers para explorar.
 *
 * ── Custo: um desenho por vez no processo ────────────────────────────────────
 *
 * O trabalho do libvips não é cancelável daqui: `TETO_DE_TEMPO_MS` encerra a
 * ESPERA de quem chamou, não a CPU. Duas contenções reais:
 *
 *  - compressão PNG padrão (nível 6, sem `effort`): ruído (`feTurbulence`) em
 *    800×800 levava ~11 s por degrau no esforço máximo; no nível 6, ~50 ms, e o
 *    PNG grande demais cai na regra de 512 KB em vez de ocupar a CPU;
 *  - fila de UM no processo inteiro: rasterizações são encadeadas numa promessa,
 *    no máximo `ESPERA_MAXIMA_NA_FILA` esperam atrás da que desenha, e a que
 *    excede isso é recusada na hora (a frase genérica). Quem chega à vez depois
 *    do próprio prazo não desenha — a pessoa já recebeu o erro. A vaga só é
 *    liberada quando o sharp TERMINA, nunca quando o teto de tempo dispara:
 *    liberar no teto deixaria o próximo desenhar em paralelo com o anterior.
 *
 * Resíduo aceito: um único SVG cujo DESENHO (não a compressão) seja caro ainda
 * ocupa uma thread pelo tempo dele — mas só uma, e o limite de elementos do
 * librsvg segue valendo.
 */

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type {
  Document as DocumentoXml,
  DocumentType as DoctypeXml,
  Element as ElementoXml,
  Node as NoXml,
} from "@xmldom/xmldom";
import sharp from "sharp";

import { logger } from "@/lib/logger";

import { TAMANHO_MAXIMO_DO_LOGO } from "./logo";

export type ResultadoDaRasterizacao =
  | { ok: true; png: Uint8Array<ArrayBuffer>; largura: number; altura: number }
  | { ok: false; motivo: "invalido" | "grande_demais"; detalhe: string };

/** Lado máximo (px) da saída: largura E altura cabem em 800. */
const LADO_MAXIMO = 800;
/** Escada de largura quando o PNG não cabe em 512 KB (espelha `ajustarLogo`). */
const ESCADA = [800, 640, 512, 400];
/** Pixels que o SVG pode DECLARAR a 72 dpi (≈ 4000×4000). */
const LIMITE_DE_PIXELS = 16_000_000;
/** Densidade máxima — SVG de 1×1 não vira 800 px por densidade infinita. */
const DENSIDADE_MAXIMA = 2400;
const DENSIDADE_BASE = 72;
const TETO_DE_TEMPO_MS = 8000;
/** Rasterizações que podem ESPERAR atrás da que está desenhando. */
export const ESPERA_MAXIMA_NA_FILA = 2;

const invalido = (detalhe: string): ResultadoDaRasterizacao => ({ ok: false, motivo: "invalido", detalhe });

function safeChar(cp: number): string {
  return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "\uFFFD";
}

const REFERENCIA_PERMITIDA = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;
const ELEMENTO_PROIBIDO =
  /^(script|foreignobject|iframe|embed|object|link|handler|listener|audio|video|canvas)$/;
const CSS_QUE_BUSCA = /@import|@font-face|(?<![\w-])(?:-webkit-)?(?:image-set|image|src)\s*\(/i;

/** Desfaz escapes CSS: `\72 ` vira `r`, `\@` vira `@`. Comentários ficam: tirá-los esconderia `url(` entre strings. */
function desescaparCss(css: string): string {
  return css
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/\\([\s\S])/g, "$1");
}

/** Recusa de um trecho que o librsvg pode ler como CSS (estilo ou valor de atributo). */
function recusaDoCss(bruto: string): string | null {
  const css = desescaparCss(bruto);
  if (CSS_QUE_BUSCA.test(css)) return "CSS que busca recurso";
  for (const m of css.matchAll(/url\s*\(\s*([^)]*)\)/gi)) {
    const alvo = (m[1] ?? "").trim().replace(/^["']|["']$/g, "").trim();
    if (!REFERENCIA_PERMITIDA.test(alvo)) return "url() externo";
  }
  return null;
}

function recusaDoElemento(el: ElementoXml): string | null {
  const nome = (el.localName ?? el.nodeName).toLowerCase();
  if (ELEMENTO_PROIBIDO.test(nome)) return "elemento ativo ou HTML";
  if (nome === "style") {
    const recusa = recusaDoCss(el.textContent ?? "");
    if (recusa) return recusa;
  }
  for (const attr of Array.from(el.attributes)) {
    const local = (attr.localName ?? attr.name).toLowerCase();
    const valor = attr.value;
    if (local.startsWith("on")) return "atributo de evento";
    if (attr.name.toLowerCase() === "xml:base") return "xml:base";
    if (local === "href" && !REFERENCIA_PERMITIDA.test(valor.trim())) return "href externo";
    if (local === "attributename" && /(^|:)href$/i.test(valor.trim())) return "animação de href";
    const recusa = recusaDoCss(valor);
    if (recusa) return recusa;
  }
  return null;
}

/** Percorre a árvore inteira; devolve o motivo da primeira recusa. */
function recusaDaArvore(doc: DocumentoXml): string | null {
  for (const no of Array.from(doc.childNodes)) {
    if (no.nodeType === no.DOCUMENT_TYPE_NODE) {
      if ((no as DoctypeXml).internalSubset !== "") return "DOCTYPE com subconjunto interno";
    } else if (no.nodeType === no.PROCESSING_INSTRUCTION_NODE && no.nodeName !== "xml") {
      return "processing instruction";
    }
  }
  const raiz = doc.documentElement;
  if (!raiz || (raiz.localName ?? raiz.nodeName).toLowerCase() !== "svg") return "raiz não é <svg>";
  const pilha: NoXml[] = [raiz];
  for (let no = pilha.pop(); no; no = pilha.pop()) {
    if (no.nodeType === no.ELEMENT_NODE) {
      const recusa = recusaDoElemento(no as ElementoXml);
      if (recusa) return recusa;
    } else if (no.nodeType === no.PROCESSING_INSTRUCTION_NODE) {
      return "processing instruction";
    } else if (no.nodeType === no.ENTITY_REFERENCE_NODE) {
      return "entidade";
    }
    pilha.push(...Array.from(no.childNodes));
  }
  return null;
}

/** Texto aprovado pronto para o sharp, ou o motivo da recusa. Lança se não for UTF-8. */
function normalizar(bytes: Uint8Array): { texto: string } | { recusa: string } {
  if (bytes.includes(0)) return { recusa: "bytes NUL" };
  let texto = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(0, 3).join() === "239,187,191" ? bytes.subarray(3) : bytes,
  );
  texto = texto.replace(/^\s+/, "");
  if (!texto.startsWith("<")) return { recusa: "não começa por '<'" };
  const declarada = /^<\?xml[^>]*\sencoding\s*=\s*["']([^"']+)["']/i.exec(texto);
  if (declarada && !/^(utf-?8|us-ascii|ascii)$/i.test(declarada[1] ?? "")) return { recusa: "codificação não UTF-8" };

  let doc: DocumentoXml;
  try {
    // Estrito: qualquer aviso do parser (atributo sem aspas, entidade desconhecida…) é recusa.
    doc = new DOMParser({
      onError: (_nivel, mensagem) => {
        throw new Error(mensagem);
      },
    }).parseFromString(texto, "image/svg+xml");
  } catch {
    return { recusa: "não é XML bem-formado" };
  }
  const recusa = recusaDaArvore(doc);
  if (recusa) return { recusa };
  // Só a raiz segue: DOCTYPE, declaração e comentários de fora ficam para trás.
  return { texto: new XMLSerializer().serializeToString(doc.documentElement as ElementoXml) };
}

async function comTeto<T>(trabalho: Promise<T>): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeita) => {
    relogio = setTimeout(() => rejeita(new Error("tempo esgotado")), TETO_DE_TEMPO_MS);
  });
  try {
    return await Promise.race([trabalho, estouro]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/** Fim da fila: a próxima rasterização só começa quando esta promessa assenta. */
let cauda: Promise<void> = Promise.resolve();
/** Desenhando + esperando. */
let ocupacao = 0;
const liberar = () => {
  ocupacao--;
};

/** Põe o desenho na fila de um; recusa na hora quando a espera já está cheia. */
function naFila<T>(trabalho: () => Promise<T>): Promise<T> {
  if (ocupacao > ESPERA_MAXIMA_NA_FILA) return Promise.reject(new Error("fila de rasterização cheia"));
  ocupacao++;
  const prazo = Date.now() + TETO_DE_TEMPO_MS;
  const vez = cauda.then(() => {
    if (Date.now() >= prazo) throw new Error("prazo vencido na fila");
    return trabalho();
  });
  cauda = vez.then(liberar, liberar);
  return vez;
}

export async function rasterizarSvg(bytes: Uint8Array): Promise<ResultadoDaRasterizacao> {
  let normal: ReturnType<typeof normalizar>;
  try {
    normal = normalizar(bytes);
  } catch {
    return invalido("não é UTF-8");
  }
  if ("recusa" in normal) return invalido(normal.recusa);
  const entrada = Buffer.from(normal.texto, "utf-8");

  try {
    return await comTeto(naFila(() => desenhar(entrada)));
  } catch (erro) {
    // Mensagem do sharp/libvips (ou da fila) só no log; a pessoa recebe a frase da rota.
    logger.warn("[marca/logo] svg não rasterizado", {
      action: "marca.logo.rasterizar",
      error: erro instanceof Error ? erro.message.slice(0, 200) : "desconhecido",
    });
    return invalido("não foi possível desenhar o SVG");
  }
}

async function desenhar(entrada: Buffer): Promise<ResultadoDaRasterizacao> {
  const abrir = (density: number) =>
    sharp(entrada, { density, limitInputPixels: LIMITE_DE_PIXELS, failOn: "error" });

  const { width, height } = await abrir(DENSIDADE_BASE).metadata();
  if (!width || !height) return invalido("SVG sem dimensões");
  if (width * height > LIMITE_DE_PIXELS) return invalido("dimensões grandes demais");

  const escala = Math.min(LADO_MAXIMO / width, LADO_MAXIMO / height);
  const densidade = Math.min(DENSIDADE_MAXIMA, Math.max(1, Math.round(DENSIDADE_BASE * escala)));

  const base = await abrir(densidade).png().toBuffer(); // já em ≤ ~800 px; limite de pixels vale
  for (const largura of ESCADA) {
    const { data, info } = await sharp(base)
      .resize({ width: largura, height: LADO_MAXIMO, fit: "inside" })
      .png({ compressionLevel: 6 }) // padrão: o esforço máximo custava ~11 s em ruído
      .toBuffer({ resolveWithObject: true });
    if (data.byteLength <= TAMANHO_MAXIMO_DO_LOGO) {
      return { ok: true, png: new Uint8Array(data), largura: info.width, altura: info.height };
    }
  }
  return { ok: false, motivo: "grande_demais", detalhe: "PNG acima do teto mesmo reduzido" };
}
