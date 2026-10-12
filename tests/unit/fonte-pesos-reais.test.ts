import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

// `font-medium` (500) e `font-semibold` (600) só viram peso de verdade se a
// fonte sans declara a FAIXA de pesos. Com 400 e 700 estáticos o navegador
// arredonda 500 para 400 e 600 para 700 — a UI inteira ficava "pesada".
describe("fonte sans declara pesos reais", () => {
  for (const arquivo of ["app/layout.tsx", "app/design/lib/fonts.ts"]) {
    it(`${arquivo}: Atkinson variável 200–800, sem os estáticos 400/700`, () => {
      const src = ler(arquivo);
      const bloco = src.slice(src.indexOf("const atkinson = localFont"), src.indexOf("variable: \"--font-atkinson\""));
      expect(bloco).toContain("atkinson-hyperlegible-next-200-800-latin-latin-ext.woff2");
      expect(bloco).toMatch(/weight:\s*"200 800"/);
      expect(bloco).not.toMatch(/atkinson-hyperlegible-(400|700)-/);
    });
  }

  it("o arquivo variável existe e a licença cita o projeto Next", () => {
    expect(fs.existsSync(path.join(RAIZ, "app/fonts/atkinson-hyperlegible-next-200-800-latin-latin-ext.woff2"))).toBe(true);
    expect(ler("app/fonts/OFL.txt")).toContain("Atkinson Hyperlegible Next Project Authors");
  });

  it("body não sintetiza negrito (só oblíquo) e não pede ss01 (a fonte não tem)", () => {
    const css = ler("app/globals.css");
    expect(css).toMatch(/font-synthesis:\s*style\s*;/);
    expect(css).not.toContain('"ss01"');
  });
});
