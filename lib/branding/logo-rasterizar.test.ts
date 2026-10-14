// @vitest-environment node
/**
 * O rasterizador de SVG do logo — o SVG entra, só PNG sai, e tudo o que faria
 * o librsvg sair da caixa é recusado ANTES de ele ver o arquivo.
 *
 * Cada guarda tem um caso que a prova com um SVG que, sem a guarda, seria
 * renderizado (ou tentaria buscar recurso externo). O controle positivo (SVG
 * limpo vira PNG) impede que "tudo recusado" passe por segurança.
 */
import { describe, expect, it } from "vitest";

import { TAMANHO_MAXIMO_DO_LOGO } from "./logo";
import { farejarTipo } from "./logo-arquivo";
import { rasterizarSvg } from "./logo-rasterizar";

const enc = (s: string) => new TextEncoder().encode(s);
const LIMPO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
  '<rect width="200" height="100" fill="#0a7"/><circle cx="50" cy="50" r="30" fill="#fff"/></svg>';

async function recusa(svg: string) {
  const r = await rasterizarSvg(enc(svg));
  expect(r.ok, "o SVG hostil foi rasterizado").toBe(false);
  return r;
}

describe("rasterizarSvg — caminho limpo", () => {
  it("SVG limpo vira PNG (assinatura de bytes) de até 512 KB e até 800 px de largura", async () => {
    const r = await rasterizarSvg(enc(LIMPO));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(farejarTipo(r.png)).toBe("image/png");
    expect(r.png.byteLength).toBeLessThanOrEqual(TAMANHO_MAXIMO_DO_LOGO);
    expect(r.largura).toBeLessThanOrEqual(800);
    expect(r.largura).toBeGreaterThan(0);
  });

  it("aceita declaração XML, comentário e href interno (#) e data:image/png", async () => {
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?><!-- logo --><svg xmlns="http://www.w3.org/2000/svg" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" width="50" height="50"><defs><rect id="a" width="50" height="50"/></defs>' +
      '<use xlink:href="#a" fill="url(#g)"/></svg>';
    const r = await rasterizarSvg(enc(svg));
    expect(r.ok).toBe(true);
  });

  it("DOCTYPE simples (sem subconjunto interno) é aceito e removido", async () => {
    const r = await rasterizarSvg(
      enc(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${LIMPO}`),
    );
    expect(r.ok).toBe(true);
  });

  it("ampliando um SVG minúsculo, a saída fica nítida (não é 1 pixel esticado)", async () => {
    const r = await rasterizarSvg(
      enc('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.largura).toBeGreaterThanOrEqual(100);
  });
});

describe("rasterizarSvg — guardas (cada uma devolve invalido)", () => {
  it("<script>", async () => {
    const r = await recusa(LIMPO.replace("<rect", '<script>fetch("/x")</script><rect'));
    expect(r.ok === false && r.motivo).toBe("invalido");
  });
  it("<script> com prefixo de namespace e caixa trocada", async () => {
    await recusa(LIMPO.replace("<rect", '<s:ScRiPt xmlns:s="http://www.w3.org/2000/svg">1</s:ScRiPt><rect'));
  });
  it("atributo de evento on*=", async () => {
    await recusa(LIMPO.replace("<rect", '<rect onload="alert(1)"'));
  });
  it("<foreignObject>", async () => {
    await recusa(LIMPO.replace("<rect", "<foreignObject><div>x</div></foreignObject><rect"));
  });
  it.each([
    ["http", "http://evil.test/a.png"],
    ["https", "https://evil.test/a.png"],
    ["file", "file:///etc/passwd"],
    ["protocolo relativo", "//evil.test/a.png"],
    ["caminho relativo/local", "../../etc/passwd"],
    ["javascript", "javascript:alert(1)"],
    ["data:image/svg+xml (aninhado)", "data:image/svg+xml;base64,PHN2Zy8+"],
    ["http com char ref numérica", "&#104;ttp://evil.test/a.png"],
    ["http com espaço antes", "  http://evil.test/a.png"],
  ])("href externo: %s", async (_n, alvo) => {
    await recusa(LIMPO.replace("<rect", `<image href="${alvo}" width="9" height="9"/><rect`));
    await recusa(
      LIMPO.replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ').replace(
        "<rect",
        `<image xlink:href='${alvo}' width="9" height="9"/><rect`,
      ),
    );
  });
  it("href sem aspas (XML inválido que um parser leniente engoliria)", async () => {
    await recusa(LIMPO.replace("<rect", "<image href=http://evil.test/a.png/><rect"));
  });
  it("url() externo no estilo e @import", async () => {
    await recusa(LIMPO.replace("<rect", '<rect style="fill:url(http://evil.test/p)"'));
    await recusa(LIMPO.replace("<rect", "<style>@import url(//evil.test/x.css);</style><rect"));
  });
  it("<!ENTITY (XXE)", async () => {
    await recusa(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
    );
  });
  it("billion laughs (entidades aninhadas)", async () => {
    await recusa(
      '<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><text>&c;</text></svg>',
    );
  });
  it("DOCTYPE com subconjunto interno [ ]", async () => {
    await recusa(`<!DOCTYPE svg [ ]>${LIMPO}`);
  });
  it("xml-stylesheet (processing instruction que busca recurso)", async () => {
    await recusa(`<?xml-stylesheet href="http://evil.test/a.css"?>${LIMPO}`);
  });
  it("bomba de pixels: width/height enormes", async () => {
    const r = await recusa('<svg xmlns="http://www.w3.org/2000/svg" width="1000000" height="1000000"><rect width="1" height="1"/></svg>');
    expect(r.ok === false && r.motivo).toBe("invalido");
  });
  it("bomba de pixels: viewBox enorme sem width/height", async () => {
    await recusa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90000000 90000000"><rect width="1" height="1"/></svg>');
  });
  it("não é XML bem-formado", async () => {
    await recusa("<svg xmlns='http://www.w3.org/2000/svg'><rect></svg");
  });
  it("UTF-16 / bytes NUL (esconderiam as palavras das regexes)", async () => {
    const u16 = new Uint8Array([0xff, 0xfe, ...Array.from(LIMPO).flatMap((c) => [c.charCodeAt(0), 0])]);
    const r = await rasterizarSvg(u16);
    expect(r.ok).toBe(false);
  });
  it("conteúdo que não começa por '<' (poliglota) não chega ao sharp", async () => {
    await recusa(`%PDF-1.4\n${LIMPO}`);
  });
  it("SVG vazio de desenho: sem dimensões legíveis", async () => {
    await recusa('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
});

/**
 * Desvios que uma regex sobre TEXTO não enxerga e o parser enxerga. O librsvg
 * os barrou na revisão — e a defesa não pode depender disso: cada caso tem de ser
 * recusado pelo filtro, ANTES do sharp (a frase do catch do sharp não serve).
 */
describe("rasterizarSvg — desvios do filtro textual (recusa antes do sharp)", () => {
  async function recusaNoFiltro(svg: string) {
    const r = await recusa(svg);
    expect(r.ok === false && r.detalhe, "chegou ao sharp: o filtro deixou passar").not.toBe(
      "não foi possível desenhar o SVG",
    );
  }
  it("href real escondido depois de um falso href dentro do valor de outro atributo", async () => {
    await recusaNoFiltro(
      LIMPO.replace("<rect", `<image x=" href='#a" href='file:///etc/passwd' width="9" height="9"/><rect`),
    );
  });
  it("url() escrito com escape CSS (u\\72 l)", async () => {
    await recusaNoFiltro(LIMPO.replace("<rect", '<rect style="fill:u\\72 l(&quot;http://evil.test/p&quot;)"'));
  });
  it("@import escrito com escape CSS (@\\69mport)", async () => {
    await recusaNoFiltro(LIMPO.replace("<rect", '<style>@\\69mport "http://evil.test/x.css";</style><rect'));
  });
});

/**
 * Ruído (feTurbulence) num retângulo de 800×800 é PNG incomprimível: com o
 * esforço máximo de compressão ele queimava ~12 s de CPU por upload, prendendo
 * o pool do libuv para todas as organizações. O caso tem de terminar rápido e
 * cair na regra de tamanho — nunca no teto de tempo.
 */
describe("rasterizarSvg — custo limitado", () => {
  const RUIDO =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">' +
    '<filter id="f" x="-10" width="20"><feTurbulence baseFrequency="0.9" numOctaves="4"/></filter>' +
    '<rect width="800" height="800" filter="url(#f)"/></svg>';

  it("ruído incomprimível termina em menos de 2 s e é recusado pelo tamanho", async () => {
    const inicio = performance.now();
    const r = await rasterizarSvg(enc(RUIDO));
    const decorrido = performance.now() - inicio;
    expect(r.ok === false && r.motivo).toBe("grande_demais");
    expect(decorrido).toBeLessThan(2000);
  }, 60_000);
});
