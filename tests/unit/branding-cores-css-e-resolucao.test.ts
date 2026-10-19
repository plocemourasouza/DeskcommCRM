import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { coresDaBarraDoNavegador } from "@/lib/branding/barra-do-navegador";
import {
  ALIASES_DAS_CORES,
  cssDaMarca,
  cssDasCores,
  ESCOPO_DA_INSTALACAO,
  ESCOPO_DA_ORGANIZACAO,
  ESCOPO_DAS_CORES_DA_INSTALACAO,
  ESCOPO_DAS_CORES_DA_ORGANIZACAO,
} from "@/lib/branding/css";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import {
  camadaDaInstalacao,
  camadaDaOrganizacao,
  camadaDoAmbiente,
  conferirCoresDaPilha,
  resolverMarca,
} from "@/lib/branding/resolve";
import { ESCOPO_DO_TEMA_DA_ORGANIZACAO } from "@/lib/extensions/tema";

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

// ── Especificidade, medida (só as formas que estes seletores usam) ───────────

type Esp = [number, number, number];

/** (ids, classes/atributos/pseudo-classes, tipos). `:not()`/`:has()` contam o argumento. */
function especificidade(seletor: string): Esp {
  let s = seletor;
  const total: Esp = [0, 0, 0];
  const somar = (e: Esp) => {
    total[0] += e[0];
    total[1] += e[1];
    total[2] += e[2];
  };
  // Pseudo-classes funcionais: somam o argumento mais específico, e saem do texto.
  for (;;) {
    const m = /:(not|has|is|where)\(/.exec(s);
    if (!m) break;
    let prof = 1;
    let j = m.index + m[0].length;
    while (j < s.length && prof > 0) {
      if (s[j] === "(") prof += 1;
      else if (s[j] === ")") prof -= 1;
      j += 1;
    }
    const arg = s.slice(m.index + m[0].length, j - 1);
    if (m[1] !== "where") {
      const partes = arg.split(",").map((a) => especificidade(a.trim()));
      somar(partes.reduce((a, b) => (comparar(a, b) >= 0 ? a : b)));
    }
    s = s.slice(0, m.index) + " " + s.slice(j);
  }
  total[1] += (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, " ");
  total[1] += (s.match(/:[a-z-]+/g) ?? []).length;
  s = s.replace(/:[a-z-]+/g, " ");
  total[1] += (s.match(/\.[a-z-]+/gi) ?? []).length;
  total[0] += (s.match(/#[a-z-]+/gi) ?? []).length;
  total[2] += (s.match(/(^|[\s>+~])[a-z]+/gi) ?? []).length;
  return total;
}

function comparar(a: Esp, b: Esp): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Todo seletor do globals.css cujo bloco declara alguma cor do tema. */
function seletoresQueDeclaramCores(): string[] {
  const limpo = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const saida: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of limpo.matchAll(re)) {
    // Só DECLARAÇÃO de cor do tema (`--color-bg: …`), nunca uso (`var(--color-bg)`).
    if (/(?:^|[;\s])--color-(?:bg|surface|text|border|success|warning|error|info)[a-z-]*\s*:/.test(m[2] ?? "")) {
      for (const s of (m[1] ?? "").split(",")) saida.push(s.trim());
    }
  }
  return saida.filter((s) => !s.startsWith("@"));
}

describe("a especificidade das cores vence os blocos de neutros do globals.css", () => {
  it("o globals.css de hoje: medido, e o teto é (0,3,0)", () => {
    const max = seletoresQueDeclaramCores()
      .map(especificidade)
      .reduce((a, b) => (comparar(a, b) >= 0 ? a : b));
    expect(max).toEqual([0, 3, 0]);
  });

  it("todo seletor das cores da INSTALAÇÃO supera o teto do globals.css", () => {
    for (const [seletor] of ESCOPO_DAS_CORES_DA_INSTALACAO) {
      expect(comparar(especificidade(seletor), [0, 3, 0]), seletor).toBeGreaterThan(0);
    }
  });

  it("na subárvore (mesmo elemento), a empresa vence a instalação", () => {
    const sub = (escopo: readonly (readonly [string, string])[]) =>
      escopo.filter(([s]) => /\s\[data-theme="(dark|light)"\]$/.test(s)).map(([s]) => especificidade(s));
    const inst = sub(ESCOPO_DAS_CORES_DA_INSTALACAO);
    const org = sub(ESCOPO_DAS_CORES_DA_ORGANIZACAO);
    expect(inst).toHaveLength(2);
    expect(org).toHaveLength(2);
    for (const o of org) for (const i of inst) expect(comparar(o, i)).toBeGreaterThan(0);
  });
});

describe("as duas metades da guarda de superfície", () => {
  const SUPERFICIES = ["--color-bg", "--color-surface", "--color-surface-elevated"];

  it("o caminho da MARCA (accent) continua sem declarar superfície, nos dois escopos", () => {
    const cor = resolverMarca([camadaDoAmbiente({ APP_ACCENT_HEX: "#2563eb" })], REGUA_DO_PRODUTO).cor;
    for (const escopo of [ESCOPO_DA_INSTALACAO, ESCOPO_DA_ORGANIZACAO]) {
      const { css } = cssDaMarca(cor, escopo);
      for (const s of SUPERFICIES) expect(css ?? "", s).not.toContain(`${s}:`);
    }
  });

  it("o caminho das CORES declara superfície — só ele, e só o que foi escolhido", () => {
    const { css } = cssDasCores({ claro: { bg: "#ffffff" }, escuro: { surface: "#101010" } }, "instalacao");
    expect(css).toContain("--color-bg: #ffffff;");
    expect(css).toContain("--color-surface: #101010;");
    expect(css).not.toContain("--color-text:");
  });
});

describe("cssDasCores", () => {
  it("vazio não emite nada", () => {
    expect(cssDasCores({}, "instalacao")).toEqual({ css: null, motivos: [] });
    expect(cssDasCores({ claro: {} }, "organizacao")).toEqual({ css: null, motivos: [] });
  });

  it("o tema escuro escolhido vale também na subárvore escura, e o claro na clara", () => {
    const { css } = cssDasCores({ claro: { bg: "#fefefe" }, escuro: { bg: "#010101" } }, "instalacao");
    for (const [seletor, tema] of ESCOPO_DAS_CORES_DA_INSTALACAO) {
      const bloco = css?.split(`${seletor} {`)[1]?.split("}")[0] ?? "";
      expect(bloco, seletor).toContain(tema === "claro" ? "#fefefe" : "#010101");
    }
  });

  it("o claro NUNCA vaza para o escuro: o seletor claro exclui o tema escuro", () => {
    const [claro] = ESCOPO_DAS_CORES_DA_INSTALACAO;
    expect(claro?.[1]).toBe("claro");
    expect(claro?.[0]).toContain(':not([data-theme="dark"])');
  });

  it("os apelidos do shadcn seguem as cores — a empresa pinta no <body>", () => {
    // `--background: var(--color-bg)` é resolvido onde é DECLARADO. No <html>
    // isso já basta; no <body> (escopo da empresa) o apelido herdado viria
    // computado com o fundo de cima. Por isso o bloco reemite os apelidos.
    // Só os apelidos do `:root` — os de componente (`--xy-*` do React Flow) são
    // declarados no próprio elemento e resolvem lá, com o valor que herdaram.
    const raiz = /\n:root \{([^}]*)\}/.exec(CSS.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
    const doGlobals = new Map<string, string>();
    for (const m of raiz.matchAll(/^\s*(--[a-z-]+):\s*(var\(--color-[a-z-]+\));/gm)) {
      const [, nome, valor] = m;
      if (!nome || !valor || nome.startsWith("--color-")) continue;
      if (/--color-(bg|surface|surface-elevated|text|text-muted|text-subtle|border|border-strong|success|warning|error|info)(-bg|-fg)?\)/.test(valor)) {
        doGlobals.set(nome, valor);
      }
    }
    expect(doGlobals.size).toBeGreaterThanOrEqual(13);
    expect(new Map(ALIASES_DAS_CORES)).toEqual(doGlobals);
    const { css } = cssDasCores({ claro: { bg: "#ffffff" } }, "organizacao");
    for (const [nome, valor] of doGlobals) expect(css).toContain(`${nome}: ${valor};`);
  });

  it("tema de extensão escolhido vence: as cores da empresa se recolhem onde ele vale", () => {
    expect(ESCOPO_DO_TEMA_DA_ORGANIZACAO[0][0]).toBe("body:has([data-tema-extensao])");
    for (const [seletor] of ESCOPO_DAS_CORES_DA_ORGANIZACAO) {
      expect(seletor).toContain(":not(:has([data-tema-extensao]))");
    }
  });

  it("valor fora da forma é recusado inteiro (nunca CSS parcial)", () => {
    const r = cssDasCores({ claro: { bg: "#ffffff; } body { x" } } as never, "instalacao");
    expect(r.css).toBeNull();
    expect(r.motivos[0]?.codigo).toBe("valor_fora_da_allowlist");
    expect(cssDasCores({ claro: { bg: "</style>" } } as never, "organizacao").css).toBeNull();
    expect(cssDasCores({ claro: { "x;}": "#ffffff" } } as never, "organizacao").css).toBeNull();
  });
});

describe("o resolvedor", () => {
  const LEGIVEL = { claro: { bg: "#ffffff", text: "#000000" } };

  it("empresa > instalação > padrão, por token, com a origem", () => {
    const m = resolverMarca(
      [
        camadaDaOrganizacao({ cores: { claro: { bg: "#ffffff" } } }),
        camadaDaInstalacao({ cores: { claro: { bg: "#fbfbfb", text: "#000000" } } }),
      ],
      REGUA_DO_PRODUTO,
    );
    expect(m.cores).toEqual({ claro: { bg: "#ffffff", text: "#000000" } });
    expect(m.origens.cores).toBe("organizacao");
    const so = resolverMarca([camadaDaInstalacao({ cores: LEGIVEL })], REGUA_DO_PRODUTO);
    expect(so.origens.cores).toBe("banco");
    expect(resolverMarca([], REGUA_DO_PRODUTO).origens.cores).toBe("padrao");
  });

  it("NUNCA lança com lixo gravado — descarta e segue", () => {
    for (const lixo of [null, 3, "x", [], { claro: "x" }, { claro: { bg: 1 } }, { escuro: { bg: "#FFF" } }]) {
      const m = resolverMarca([camadaDaInstalacao({ cores: lixo as never })], REGUA_DO_PRODUTO);
      expect(m.cores).toEqual({});
    }
  });

  it("camada que ficou ilegível é deixada de lado, com motivo — a de baixo segue", () => {
    // A instalação mudou por baixo da empresa: o texto secundário que a empresa
    // gravou passou a sumir no cartão novo. A empresa perde as cores DELA; as
    // da instalação (que passam sozinhas) continuam.
    const m = resolverMarca(
      [
        camadaDaOrganizacao({ cores: { escuro: { "text-muted": "#4a4840" } } }),
        camadaDaInstalacao({ cores: LEGIVEL }),
      ],
      REGUA_DO_PRODUTO,
    );
    expect(m.cores).toEqual(LEGIVEL);
    expect(m.origens.cores).toBe("banco");
    const motivo = m.motivos.find((x) => x.codigo === "cores_sem_contraste");
    expect(motivo?.origem).toBe("organizacao");
    expect(motivo?.detalhe ?? "").not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("a caminhada da marca é refeita sobre o fundo escolhido", () => {
    const sem = resolverMarca([camadaDoAmbiente({ APP_ACCENT_HEX: "#2563eb" })], REGUA_DO_PRODUTO);
    const com = resolverMarca(
      [
        // Superfícies mais ESCURAS que as de fábrica: legíveis (a trava aprova),
        // e o contraste da cor da marca contra o fundo muda.
        camadaDaInstalacao({ cores: { escuro: { bg: "#0a0a08", surface: "#12110d", "surface-elevated": "#1a1914" } } }),
        camadaDoAmbiente({ APP_ACCENT_HEX: "#2563eb" }),
      ],
      REGUA_DO_PRODUTO,
    );
    expect(com.cores.escuro?.bg).toBe("#0a0a08");
    // Os pares que a caminhada mediu são contra o fundo NOVO: a razão do papel
    // da marca sobre o fundo muda. Medir contra o fundo de fábrica seria a
    // trava aprovando uma tela que não existe.
    const razao = (m: typeof sem) =>
      m.cor?.derivada?.escuro.pares.find((p) => p.papel === "--color-accent" && p.superficie === "--color-bg")
        ?.razao;
    expect(razao(com)).toBeDefined();
    expect(razao(com)).not.toBeCloseTo(razao(sem) ?? 0, 2);
  });

  it("conferirCoresDaPilha é a mesma trava que a action usa", () => {
    expect(conferirCoresDaPilha([camadaDaInstalacao({ cores: LEGIVEL })], REGUA_DO_PRODUTO).passa).toBe(true);
    const r = conferirCoresDaPilha(
      [camadaDaOrganizacao({ cores: { escuro: { "text-muted": "#4a4840" } } })],
      REGUA_DO_PRODUTO,
    );
    expect(r.passa).toBe(false);
    expect(r.reprovas[0]).toMatchObject({ tema: "escuro" });
  });
});

describe("a barra do navegador segue o fundo escolhido", () => {
  it("sem cores, o produto; com fundo escolhido, o fundo", () => {
    expect(coresDaBarraDoNavegador(REGUA_DO_PRODUTO).map((c) => c.color)).toEqual(["#faf9f6", "#161510"]);
    expect(
      coresDaBarraDoNavegador(REGUA_DO_PRODUTO, { escuro: { bg: "#000000" } }).map((c) => c.color),
    ).toEqual(["#faf9f6", "#000000"]);
  });
});
