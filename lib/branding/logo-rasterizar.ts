import "server-only";

/**
 * SVG → PNG para o logo. O SVG NUNCA é gravado: entra aqui, é validado como
 * TEXTO, é desenhado pelo `sharp` (librsvg) e só o PNG resultante sai.
 *
 * ── Por que isto é seguro onde "aceitar SVG" não era ─────────────────────────
 *
 * O risco do SVG é ele ser SERVIDO: aberto direto do endereço da imagem, ele
 * executa `<script>`. Rasterizado no upload, o que vai para o bucket é um PNG —
 * sem script, sem referência, sem nada a executar. O risco que sobra mudou de
 * lugar: é o SERVIDOR decodificando bytes de quem sobe. Por isso o desenho só
 * acontece depois de recusar, no texto, tudo o que faria o librsvg sair da caixa:
 *
 *  - `<script>`, `on*=`, `<foreignObject>`, `<iframe>` e afins — execução/HTML;
 *  - `href`/`xlink:href`/`url()`/`@import` que não apontem para `#id` do próprio
 *    arquivo ou para `data:image/(png|jpeg|gif|webp)` — é o que transformaria o
 *    upload em SSRF/leitura de arquivo local (o librsvg resolve `file:` e `http:`);
 *  - `<!ENTITY` e DOCTYPE com subconjunto interno — XXE e "billion laughs";
 *  - bytes NUL / não UTF-8 — escondem as palavras acima das regexes;
 *  - conteúdo que não começa por `<` — poliglota que o libvips tomaria por outro
 *    formato (PDF, TIFF…);
 *  - bomba de pixels — `limitInputPixels` no sharp, mais a conferência da
 *    dimensão ANTES de pedir o desenho.
 *
 * As regexes olham o texto DEPOIS de decodificar referências numéricas
 * (`&#104;ttp:` vira `http:`), porque o parser XML faria o mesmo. Uma regex sobre
 * texto não é um parser: o que ela não reconhece vira recusa (`invalido`), nunca
 * "deixa passar". O texto entregue ao sharp tem o DOCTYPE simples removido.
 *
 * Tempo: o sharp não tem timeout nativo; a espera é limitada por `TETO_DE_TEMPO_MS`.
 * Isso protege a RESPOSTA, não a CPU — o trabalho do libvips não é cancelável
 * daqui, e o limite de elementos do librsvg é a contenção real.
 */

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

const invalido = (detalhe: string): ResultadoDaRasterizacao => ({ ok: false, motivo: "invalido", detalhe });

function decodificarReferencias(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&sol;/gi, "/");
}

function safeChar(cp: number): string {
  return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "�";
}

const REFERENCIA_PERMITIDA = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;

/** Devolve o motivo da recusa, ou null quando o texto pode ir ao sharp. */
function recusaDoTexto(bruto: string): string | null {
  if (bruto.includes("\u0000")) return "bytes NUL";
  const texto = decodificarReferencias(bruto);

  const declarada = /^\s*<\?xml[^>]*\sencoding\s*=\s*["']([^"']+)["']/i.exec(texto);
  if (declarada && !/^(utf-?8|us-ascii|ascii)$/i.test(declarada[1] ?? "")) return "codificação não UTF-8";

  if (/<\s*(?:[\w.-]+:)?(script|foreignobject|iframe|embed|object|link|handler|listener|audio|video|canvas)[\s/>]/i.test(texto)) {
    return "elemento ativo ou HTML";
  }
  if (/<\?xml-stylesheet/i.test(texto)) return "xml-stylesheet";
  if (/<!ENTITY/i.test(texto)) return "entidade declarada";
  if (/<!DOCTYPE[^>]*\[/i.test(texto)) return "DOCTYPE com subconjunto interno";
  if (/[\s"'/]on[a-z]+\s*=/i.test(texto)) return "atributo de evento";
  if (/javascript\s*:/i.test(texto)) return "javascript:";
  if (/@import/i.test(texto)) return "@import";
  if (/attributeName\s*=\s*["']?\s*(?:[\w.-]+:)?href/i.test(texto)) return "animação de href";
  if (/xml:base\s*=/i.test(texto)) return "xml:base";

  // href sem aspas: XML inválido que um parser leniente aceitaria.
  if (/(?:^|[\s"'/])(?:[\w.-]+:)?href\s*=\s*[^"'\s]/i.test(texto)) return "href sem aspas";
  for (const m of texto.matchAll(/(?:^|[\s"'/])(?:[\w.-]+:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const alvo = (m[1] ?? m[2] ?? "").trim();
    if (!REFERENCIA_PERMITIDA.test(alvo)) return "href externo";
  }
  for (const m of texto.matchAll(/url\(\s*([^)]*)\)/gi)) {
    const alvo = (m[1] ?? "").trim().replace(/^["']|["']$/g, "").trim();
    if (!REFERENCIA_PERMITIDA.test(alvo)) return "url() externo";
  }
  return null;
}

function normalizar(bytes: Uint8Array): { texto: string } | { recusa: string } {
  let texto = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(0, 3).join() === "239,187,191" ? bytes.subarray(3) : bytes,
  );
  texto = texto.replace(/^\s+/, "");
  if (!texto.startsWith("<")) return { recusa: "não começa por '<'" };
  const recusa = recusaDoTexto(texto);
  if (recusa) return { recusa };
  // DOCTYPE simples (sem '[') não carrega nada que o desenho use: sai.
  return { texto: texto.replace(/<!DOCTYPE[^>[]*>/i, "") };
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
    return await comTeto(desenhar(entrada));
  } catch (erro) {
    // Mensagem do sharp/libvips só no log; a pessoa recebe a frase da rota.
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
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer({ resolveWithObject: true });
    if (data.byteLength <= TAMANHO_MAXIMO_DO_LOGO) {
      return { ok: true, png: new Uint8Array(data), largura: info.width, altura: info.height };
    }
  }
  return { ok: false, motivo: "grande_demais", detalhe: "PNG acima do teto mesmo reduzido" };
}
