/**
 * Aparência da marca — cantos (`raio`) e barra lateral (`barra_lateral`) —
 * provada PELA TELA, medida por ferramenta (`getComputedStyle`,
 * `getBoundingClientRect`), nunca a olho.
 *
 * A jornada:
 *   1. Sem escolha: `--radius-md` = 8px, o `<html>` não leva `data-raio`, a barra
 *      lateral não leva `data-theme`.
 *   2. O dono do servidor escolhe `suave` em Admin › Marca: o HTML que o servidor
 *      envia já leva `data-raio="suave"` e os cantos medem 4px.
 *   3. O admin da empresa escolhe `arredondado`: a prévia mostra 12px ANTES de
 *      salvar; depois de salvar e recarregar, /app mede 12px (a empresa vence a
 *      instalação). "Usar o padrão da instalação" devolve os 4px.
 *   4. A empresa escolhe barra lateral `escura` com a página CLARA: o `<aside>`
 *      leva `data-theme="dark"`, pinta a superfície escura, o conteúdo continua
 *      claro, o logo é a variante escura, o item ativo passa em contraste 4,5:1;
 *      e a gaveta do celular também.
 *   5. SEM FLASH: empresa `arredondado` sobre instalação `suave` — nenhum quadro
 *      pintado com o raio da instalação.
 *
 *   6. A instalação escolhe densidade `equilibrada`: o HTML do servidor já leva
 *      `data-densidade`, o Button padrão mede 32px e o Input 38px.
 *   7. A empresa escolhe `compacta` (vence a instalação): a prévia mostra o
 *      controle compacto ANTES de salvar; depois de salvar, Button 30px, Input
 *      36px e o item da barra lateral encolhe. Com ponteiro de TOQUE a
 *      sobrescrita não vale (volta aos 36/40px da aerada). "Usar o padrão da
 *      instalação" devolve os 32px.
 *   8. A empresa escolhe fonte `fraunces`: o corpo resolve Fraunces e o arquivo
 *      dela é baixado; com a escolha desfeita, num navegador de cache frio,
 *      só Atkinson e Plex Mono são baixadas — nenhuma das seis extras.
 *   9. SEM FLASH de densidade e fonte: empresa compacta+fraunces sobre
 *      instalação equilibrada+atkinson — zero quadros com o valor errado.
 *
 *  10. Cores do tema, combinação ILEGÍVEL: o admin da empresa põe o texto
 *      principal quase da cor do fundo; a lista da trava nomeia o par com a
 *      razão medida, o Salvar fica desligado, e recarregar prova que nada foi
 *      gravado (nenhuma organização tem `settings.branding.cores`).
 *  11. Combinação LEGÍVEL: fundo, cartões e texto próprios no claro e no
 *      escuro; a prévia pinta antes de salvar; depois de salvar, `/app` resolve
 *      os valores escolhidos no `<body>` e num cartão, nos dois temas; "Voltar
 *      todas as cores do tema ao padrão" devolve os valores medidos antes.
 *  12. O SERVIDOR é a fronteira: o formulário é submetido com o Salvar
 *      desligado (`requestSubmit`, que ignora o botão) e a action recusa com
 *      `cores_sem_contraste`; o `settings.branding` fica byte a byte igual.
 *  13. A instalação escolhe o fundo do claro em Admin › Marca; a empresa sem
 *      cores herda (o `<body>` de `/app` pinta a cor, o escuro não muda, o
 *      campo da empresa mostra a cor herdada como placeholder).
 *
 * Limpeza: o `afterAll` devolve as duas camadas ao padrão pelo service role,
 * tocando só as linhas que esta spec escreveu (raio, barra lateral, densidade,
 * fonte, cores do tema).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { test, expect, type Page } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin, loginComoDono, type CredsE2E } from "./helpers/login-admin";

test.describe.configure({ mode: "serial", timeout: 150_000 });

const EVIDENCIA = path.join(process.cwd(), "evidence", "marca-aparencia");

function evidencia(nome: string): string {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  return path.join(EVIDENCIA, nome);
}

/** Valores de `RAIO_EM_PX` (lib/branding/schema.ts) para o `--radius-md`. */
const MD = { suave: "4px", padrao: "8px", arredondado: "12px" } as const;
/** `rounded-sm` do `Button`: `--radius-sm`. */
const SM = { suave: "2px", padrao: "4px", arredondado: "6px" } as const;

const TOAST_SALVO = /Marca salva/i;

let creds: CredsE2E;

async function esperarToast(page: Page): Promise<void> {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: TOAST_SALVO })).toBeVisible({
    timeout: 15_000,
  });
}

async function salvarDaInstalacao(
  page: Page,
  raio: keyof typeof MD,
  barra: "padrao" | "escura",
): Promise<void> {
  await page.goto("/admin/marca");
  await page.locator(`#raio-${raio}`).check();
  await page.locator(`#barra-lateral-${barra}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);
}

async function salvarDaEmpresa(
  page: Page,
  raio: keyof typeof MD | "herdar",
  barra: "padrao" | "escura" | "herdar",
): Promise<void> {
  await page.goto("/app/settings/marca");
  await page.locator(`#org-raio-${raio}`).check();
  await page.locator(`#org-barra-lateral-${barra}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);
}

async function emTema(page: Page, tema: "light" | "dark", url: string): Promise<void> {
  await page.evaluate((v) => localStorage.setItem("deskcomm-theme", v), tema);
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

/** O que o `<html>` declara e o que um controle REAL de /app pinta. */
async function medirCantos(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    // Item de navegação ativo da barra lateral: `rounded-md` (token --radius-md).
    const ativo = document.querySelector<HTMLElement>("aside a[aria-current='page']");
    return {
      atributo: html.getAttribute("data-raio"),
      tokenMd: getComputedStyle(html).getPropertyValue("--radius-md").trim(),
      raioDoItemAtivo: ativo ? getComputedStyle(ativo).borderTopLeftRadius : null,
    };
  });
}

/** O botão Salvar da tela de Marca (shadcn `Button`, `rounded-sm`). */
async function raioDoBotaoSalvar(page: Page): Promise<string> {
  return page
    .getByRole("button", { name: "Salvar", exact: true })
    .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
}

test.beforeAll(() => {
  execFileSync("npx", ["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  creds = lerCreds();
});

/**
 * Devolve as duas camadas ao padrão pelo service role, só nas linhas que esta
 * spec escreve: a linha única `platform_branding` (id 1) e as organizações que
 * têm `raio` ou `barra_lateral` em `settings.branding` — nunca "todas".
 */
async function limpar(): Promise<void> {
  const c = credenciaisSupabaseDeTeste();
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const { error: e1 } = await db
    .from("platform_branding")
    .update({
      raio: "padrao",
      barra_lateral: "padrao",
      densidade: "aerada",
      fonte: "atkinson",
      cores: {},
    } as never)
    .eq("id", 1);
  if (e1) throw new Error(`reset da instalação: ${e1.message}`);
  for (const chave of ["raio", "barra_lateral", "densidade", "fonte", "cores"] as const) {
    const { data, error } = await db
      .from("organizations")
      .select("id, settings")
      .filter(`settings->branding->>${chave}`, "not.is", null);
    if (error) throw new Error(`leitura das organizações (${chave}): ${error.message}`);
    for (const o of (data ?? []) as { id: string; settings: Record<string, unknown> | null }[]) {
      const branding = (o.settings?.branding ?? null) as Record<string, unknown> | null;
      if (!branding) continue;
      const { [chave]: _fora, ...resto } = branding;
      const { error: e2 } = await db
        .from("organizations")
        .update({ settings: { ...o.settings, branding: resto } } as never)
        .eq("id", o.id);
      if (e2) throw new Error(`reset da organização ${o.id}: ${e2.message}`);
    }
  }
}

test.beforeAll(limpar);
test.afterAll(limpar);

test("(1) sem escolha: cantos de 8px e barra lateral sem data-theme — claro e escuro", async ({
  page,
  browser,
}) => {
  // A marca da instalação é memo do processo (TTL 30s); só a Server Action o
  // invalida. O `beforeAll` gravou o padrão no banco — a tela confirma.
  const dono = await browser.newPage();
  creds = await loginComoDono(dono, creds);
  await salvarDaInstalacao(dono, "padrao", "padrao");
  await dono.close();

  creds = await loginComoAdmin(page, creds);
  for (const tema of ["light", "dark"] as const) {
    await emTema(page, tema, "/app/inbox");
    const m = await medirCantos(page);
    const barra = await page.locator("aside").first().getAttribute("data-theme");
    console.info(`[marca-aparencia] padrão/${tema} → ${JSON.stringify({ ...m, barra })}`);
    expect(m.atributo, "sem escolha o <html> não leva data-raio").toBeNull();
    expect(m.tokenMd).toBe(MD.padrao);
    expect(m.raioDoItemAtivo, "item de navegação (rounded-md)").toBe(MD.padrao);
    expect(barra, "sem escolha a barra não leva data-theme").toBeNull();
    await page.screenshot({
      path: evidencia(`1-padrao-${tema === "light" ? "claro" : "escuro"}.png`),
      fullPage: true,
    });
  }
});

test("(2) o dono escolhe SUAVE → o HTML do servidor já sai suave e os cantos medem 4px", async ({
  page,
}) => {
  creds = await loginComoDono(page, creds);
  await salvarDaInstalacao(page, "suave", "padrao");

  // HTML do SERVIDOR, antes de qualquer JS.
  const html = await (await page.request.get("/login")).text();
  expect(html, "o <html> do servidor leva data-raio=suave").toMatch(/<html[^>]*data-raio="suave"/);

  // O dono também é admin da empresa semeada: /app prova o controle real.
  await page.goto("/app/inbox");
  const m = await medirCantos(page);
  console.info(`[marca-aparencia] instalação suave → ${JSON.stringify(m)}`);
  expect(m.atributo).toBe("suave");
  expect(m.tokenMd).toBe(MD.suave);
  expect(m.raioDoItemAtivo).toBe(MD.suave);

  await page.goto("/admin/marca");
  const salvar = await raioDoBotaoSalvar(page);
  console.info(`[marca-aparencia] botão Salvar (rounded-sm) em suave → ${salvar}`);
  expect(salvar).toBe(SM.suave);
  await page.screenshot({ path: evidencia("2-instalacao-suave.png"), fullPage: true });
});

test("(3) a empresa escolhe ARREDONDADO: prévia antes de salvar, vence a instalação, herdar volta", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  await page.goto("/app/settings/marca");

  // Prévia ANTES de salvar: clica na opção e mede a amostra, sem tocar em Salvar.
  await page.locator("#org-raio-arredondado").check();
  const previa = page.locator("[data-previa-do-raio]");
  await expect(previa).toHaveAttribute("data-previa-do-raio", "arredondado");
  const token = await previa.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--radius-md").trim(),
  );
  // Os elementos têm `transition: all` (reset global): o canto ANIMA até o valor
  // novo, então o botão da amostra é medido quando assenta, não no 1º quadro.
  const cantoDaAmostra = () =>
    previa.evaluate((el) => getComputedStyle(el.querySelector("span")!).borderTopLeftRadius);
  await expect
    .poll(cantoDaAmostra, { message: "a amostra de botão da prévia (rounded-md)" })
    .toBe(MD.arredondado);
  console.info(
    `[marca-aparencia] prévia antes de salvar → ${JSON.stringify({ token, canto: await cantoDaAmostra() })}`,
  );
  expect(token).toBe(MD.arredondado);
  await page.screenshot({ path: evidencia("3-previa-arredondado.png"), fullPage: true });

  await page.locator("#org-barra-lateral-herdar").check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);

  await page.goto("/app/inbox");
  const depois = await medirCantos(page);
  console.info(`[marca-aparencia] empresa arredondado → ${JSON.stringify(depois)}`);
  expect(depois.atributo, "a empresa vence a instalação (suave)").toBe("arredondado");
  expect(depois.tokenMd).toBe(MD.arredondado);
  expect(depois.raioDoItemAtivo).toBe(MD.arredondado);
  await page.screenshot({ path: evidencia("3-empresa-arredondado.png"), fullPage: true });

  // "Usar o padrão da instalação" → volta aos 4px da instalação (suave).
  await salvarDaEmpresa(page, "herdar", "herdar");
  await page.goto("/app/inbox");
  const volta = await medirCantos(page);
  console.info(`[marca-aparencia] empresa herdar → ${JSON.stringify(volta)}`);
  expect(volta.atributo).toBe("suave");
  expect(volta.tokenMd).toBe(MD.suave);
  expect(volta.raioDoItemAtivo).toBe(MD.suave);
});

interface ContrasteEmPagina {
  readonly razao: number;
  readonly texto: string;
  readonly fundo: string;
}

/** Razão de contraste WCAG entre cor do texto e fundo do item ATIVO, medida na página. */
async function contrasteDoItemAtivo(page: Page): Promise<ContrasteEmPagina> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("aside a[aria-current='page']")!;
    const css = getComputedStyle(el);
    // O canvas normaliza qualquer sintaxe de cor (oklch, color-mix) para RGBA.
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (cor: string): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const a = lum(rgb(css.color));
    const b = lum(rgb(css.backgroundColor));
    const [claro, escuro] = a > b ? [a, b] : [b, a];
    return {
      razao: (claro + 0.05) / (escuro + 0.05),
      texto: css.color,
      fundo: css.backgroundColor,
    };
  });
}

test("(4) barra lateral ESCURA com a página CLARA — desktop e gaveta do celular", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  await salvarDaEmpresa(page, "herdar", "escura");

  await emTema(page, "light", "/app/inbox");

  const aside = page.locator("aside").first();
  await expect(aside).toHaveAttribute("data-theme", "dark");

  // A superfície escura de referência vem do próprio CSS: uma sonda
  // `data-theme="dark"` pintada com `--color-surface` (o token escuro do globals), e o
  // fundo claro de referência é o do `<body>` da página.
  const m = await page.evaluate(() => {
    const barra = document.querySelector("aside")!;
    const sonda = document.createElement("div");
    sonda.setAttribute("data-theme", "dark");
    sonda.style.backgroundColor = "var(--color-surface)";
    document.body.appendChild(sonda);
    const superficieEscura = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    const main = document.querySelector("main");
    return {
      temaDaPagina: document.documentElement.getAttribute("data-theme"),
      fundoDaBarra: getComputedStyle(barra).backgroundColor,
      superficieEscura,
      fundoDoBody: getComputedStyle(document.body).backgroundColor,
      fundoDoMain: main ? getComputedStyle(main).backgroundColor : null,
      colorScheme: getComputedStyle(barra).colorScheme,
      // O logo do produto: o nome é um <path/text> com `dark:fill-[#f5f4ef]`
      // (variante escura) contra `fill-[#1c1c16]`/`#1c1a16` (variante clara).
      preenchimentos: Array.from(barra.querySelectorAll<SVGElement>("svg [class*='fill-']")).map(
        (e) => ({ classe: e.getAttribute("class"), fill: getComputedStyle(e).fill }),
      ),
      imgs: Array.from(barra.querySelectorAll("img")).map((i) => ({
        alt: i.alt,
        visivel: getComputedStyle(i).display !== "none",
      })),
    };
  });
  console.info(`[marca-aparencia] barra escura → ${JSON.stringify(m)}`);
  expect(m.temaDaPagina, "a página continua clara").toBe("light");
  expect(m.fundoDaBarra, "a barra pinta a superfície escura").toBe(m.superficieEscura);
  expect(m.fundoDoBody, "o conteúdo da página continua claro").not.toBe(m.superficieEscura);
  expect(m.colorScheme).toContain("dark");

  // Logo: variante escura (texto claro) quando o logo é o do produto; se a
  // empresa tiver arte própria, a <img> visível é a escura (sem `dark:hidden`).
  if (m.imgs.length > 0) {
    expect(
      m.imgs.some((i) => i.visivel),
      "alguma <img> de logo visível na barra",
    ).toBe(true);
  } else {
    const nome = m.preenchimentos.filter((p) => (p.classe ?? "").includes("dark:fill-[#f5f4ef]"));
    expect(nome.length, "o logo do produto tem a variante escura do nome").toBeGreaterThan(0);
    for (const n of nome)
      expect(n.fill, "o nome do logo pinta a cor da variante escura").toBe("rgb(245, 244, 239)");
  }

  const contraste = await contrasteDoItemAtivo(page);
  console.info(`[marca-aparencia] contraste do item ativo → ${JSON.stringify(contraste)}`);
  expect(contraste.razao, "texto do item ativo contra o fundo, WCAG AA").toBeGreaterThanOrEqual(
    4.5,
  );
  await page.screenshot({ path: evidencia("4-barra-escura-pagina-clara.png"), fullPage: true });

  // Celular: a gaveta também é escura.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/inbox");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  const gaveta = page.getByRole("dialog");
  await expect(gaveta).toBeVisible();
  await expect(gaveta).toHaveAttribute("data-theme", "dark");
  const g = await gaveta.evaluate((el) => ({
    fundo: getComputedStyle(el).backgroundColor,
    largura: el.getBoundingClientRect().width,
    temaDaPagina: document.documentElement.getAttribute("data-theme"),
  }));
  console.info(`[marca-aparencia] gaveta do celular → ${JSON.stringify(g)}`);
  expect(g.temaDaPagina).toBe("light");
  expect(g.fundo, "a gaveta pinta a superfície escura").toBe(m.superficieEscura);
  await page.screenshot({ path: evidencia("4-gaveta-escura-celular.png") });
});

test("(5) sem flash: empresa ARREDONDADO sobre instalação SUAVE — zero quadros com o raio errado", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  await salvarDaEmpresa(page, "arredondado", "herdar");

  await page.addInitScript(() => {
    type Quadro = { t: number; raio: string | null; tokenMd: string };
    const w = window as unknown as {
      __trocas: { t: number; v: string | null }[];
      __quadros: Quadro[];
    };
    w.__trocas = [];
    w.__quadros = [];
    let ultimo: string | null | undefined;
    const registra = () => {
      if (!document.documentElement) return;
      const v = document.documentElement.getAttribute("data-raio");
      if (v !== ultimo) {
        ultimo = v;
        w.__trocas.push({ t: performance.now(), v });
      }
    };
    new MutationObserver(registra).observe(document, {
      attributes: true,
      attributeFilter: ["data-raio"],
      childList: true,
      subtree: true,
    });
    const laco = () => {
      if (document.body) {
        const html = document.documentElement;
        w.__quadros.push({
          t: performance.now(),
          raio: html.getAttribute("data-raio"),
          tokenMd: getComputedStyle(html).getPropertyValue("--radius-md").trim(),
        });
      }
      if (performance.now() < 5_000) requestAnimationFrame(laco);
    };
    requestAnimationFrame(laco);
  });
  await emTema(page, "light", "/app/inbox");
  await page.waitForFunction(() => performance.now() > 5_000);
  const flash = await page.evaluate(() => {
    const w = window as unknown as {
      __trocas: { t: number; v: string | null }[];
      __quadros: { t: number; raio: string | null; tokenMd: string }[];
    };
    return {
      trocas: w.__trocas,
      quadros: w.__quadros,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    };
  });
  const errados = flash.quadros.filter((q) => q.tokenMd !== MD.arredondado);
  const resumo = {
    fcp_ms: flash.fcp,
    trocas: flash.trocas.map((x) => `${x.v}@${x.t.toFixed(1)}ms`),
    quadros_medidos: flash.quadros.length,
    quadros_com_raio_errado: errados.length,
    janela_do_flash_ms: errados.length
      ? (errados[errados.length - 1]!.t - errados[0]!.t).toFixed(1)
      : "0",
  };
  console.info(`[marca-aparencia] FLASH ${JSON.stringify(resumo)}`);
  fs.writeFileSync(evidencia("flash.json"), JSON.stringify(resumo, null, 2));
  expect(flash.quadros.length, "o laço mediu quadros").toBeGreaterThan(0);
  expect(flash.quadros.at(-1)?.tokenMd, "terminou no raio da empresa").toBe(MD.arredondado);
  expect(errados, `${errados.length} quadro(s) pintaram o raio da instalação`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Densidade e fonte
// ─────────────────────────────────────────────────────────────────────────────

type Densidade = "aerada" | "equilibrada" | "compacta";
type Fonte =
  "atkinson" | "manrope" | "jakarta" | "plex-sans" | "bricolage" | "fraunces" | "source-serif";

/** Valores de `DENSIDADE_EM_PX` (lib/branding/schema.ts) que um controle REAL pinta no desktop. */
const CONTROLE = {
  aerada: { botao: 36, campo: 40 },
  equilibrada: { botao: 32, campo: 38 },
  compacta: { botao: 30, campo: 36 },
} as const satisfies Record<Densidade, { botao: number; campo: number }>;

/** Medidas de densidade registradas entre os casos 6 e 7 (a barra lateral é comparada). */
const medidasDeDensidade: Record<string, unknown> = {};

async function escolherNaInstalacao(
  page: Page,
  escolha: { densidade?: Densidade; fonte?: Fonte },
): Promise<void> {
  await page.goto("/admin/marca");
  if (escolha.densidade) await page.locator(`#densidade-${escolha.densidade}`).check();
  if (escolha.fonte) await page.locator(`#fonte-${escolha.fonte}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);
}

async function escolherNaEmpresa(
  page: Page,
  escolha: { densidade?: Densidade | "herdar"; fonte?: Fonte | "herdar" },
): Promise<void> {
  await page.goto("/app/settings/marca");
  if (escolha.densidade) await page.locator(`#org-densidade-${escolha.densidade}`).check();
  if (escolha.fonte) await page.locator(`#org-fonte-${escolha.fonte}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);
}

/** Alturas de um Button `default` (Salvar) e de um Input real, na tela em que estiver. */
async function controlesDaPagina(page: Page) {
  return page.evaluate(() => {
    const botao = [...document.querySelectorAll<HTMLElement>("main button[type='submit']")].find(
      (b) => b.textContent?.trim() === "Salvar",
    );
    const campo = document.querySelector<HTMLElement>("#org_app_name");
    return {
      botao: botao ? botao.getBoundingClientRect().height : null,
      campo: campo ? campo.getBoundingClientRect().height : null,
      atributo: document.documentElement.getAttribute("data-densidade"),
      ponteiroFino: matchMedia("(pointer: fine)").matches,
      larguraDaJanela: window.innerWidth,
    };
  });
}

/** Altura do item de navegação ativo da barra lateral (`py-(--nav-py)`). */
async function alturaDoItemDeNavegacao(page: Page): Promise<number> {
  await page.goto("/app/inbox");
  const item = page.locator("aside a[aria-current='page']").first();
  await expect(item).toBeVisible();
  return item.evaluate((el) => el.getBoundingClientRect().height);
}

test("(6) a instalação escolhe EQUILIBRADA: o HTML do servidor já sai equilibrado, botão 32px e campo 38px", async ({
  page,
  browser,
}) => {
  const dono = await browser.newPage();
  creds = await loginComoDono(dono, creds);
  await escolherNaInstalacao(dono, { densidade: "equilibrada" });
  await dono.close();

  const html = await (await page.request.get("/login")).text();
  expect(html, "o <html> do servidor leva data-densidade=equilibrada").toMatch(
    /<html[^>]*data-densidade="equilibrada"/,
  );

  creds = await loginComoAdmin(page, creds);
  // Os controles têm `transition: all`: mede-se quando assenta, não no 1º quadro.
  await page.goto("/app/settings/marca");
  await expect
    .poll(
      async () => {
        const m = await controlesDaPagina(page);
        return { botao: m.botao, campo: m.campo };
      },
      { message: "Button default e Input da instalação equilibrada" },
    )
    .toEqual(CONTROLE.equilibrada);
  const controles = await controlesDaPagina(page);
  const nav = await alturaDoItemDeNavegacao(page);
  medidasDeDensidade["6_instalacao_equilibrada"] = { ...controles, itemDeNavegacao: nav };
  console.info(
    `[marca-aparencia] instalação equilibrada → ${JSON.stringify({ ...controles, nav })}`,
  );
  expect(controles.atributo).toBe("equilibrada");
  expect(controles.ponteiroFino, "o runner tem ponteiro fino (mouse)").toBe(true);
  await page.goto("/app/settings/marca");
  await page.screenshot({ path: evidencia("6-instalacao-equilibrada.png"), fullPage: true });
});

test("(7) a empresa escolhe COMPACTA: prévia antes de salvar, vence a instalação, toque não encolhe, herdar volta", async ({
  page,
  browser,
  baseURL,
}) => {
  creds = await loginComoAdmin(page, creds);
  await page.goto("/app/settings/marca");

  // Prévia ANTES de salvar.
  await page.locator("#org-densidade-compacta").check();
  const previa = page.locator("[data-previa-da-densidade]");
  await expect(previa).toHaveAttribute("data-previa-da-densidade", "compacta");
  const amostra = () =>
    previa.evaluate((el) => ({
      botao: el.querySelector<HTMLElement>("[data-amostra-botao]")!.getBoundingClientRect().height,
      campo: el.querySelector<HTMLElement>("[data-amostra-campo]")!.getBoundingClientRect().height,
    }));
  await expect
    .poll(amostra, { message: "amostra de botão e campo da prévia compacta" })
    .toEqual(CONTROLE.compacta);
  console.info(
    `[marca-aparencia] prévia compacta antes de salvar → ${JSON.stringify(await amostra())}`,
  );

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);

  await page.goto("/app/settings/marca");
  await expect
    .poll(
      async () => {
        const m = await controlesDaPagina(page);
        return { botao: m.botao, campo: m.campo };
      },
      { message: "Button default e Input da empresa compacta" },
    )
    .toEqual(CONTROLE.compacta);
  const controles = await controlesDaPagina(page);
  expect(controles.atributo, "a empresa vence a instalação (equilibrada)").toBe("compacta");
  const nav = await alturaDoItemDeNavegacao(page);
  const navEquilibrada = (
    medidasDeDensidade["6_instalacao_equilibrada"] as { itemDeNavegacao: number }
  ).itemDeNavegacao;
  medidasDeDensidade["7_empresa_compacta"] = { ...controles, itemDeNavegacao: nav };
  console.info(
    `[marca-aparencia] empresa compacta → ${JSON.stringify({ ...controles, nav, navEquilibrada })}`,
  );
  expect(nav, "o item da barra lateral encolhe (equilibrada → compacta)").toBeLessThan(
    navEquilibrada,
  );
  expect(navEquilibrada - nav, "py 3px → 2px = 2px no total").toBe(2);
  await page.goto("/app/settings/marca");
  await page.screenshot({ path: evidencia("7-empresa-compacta.png"), fullPage: true });

  // Ponteiro de TOQUE (viewport largo, para isolar o ponteiro do breakpoint): a
  // sobrescrita vive em `@media (pointer: fine)`, então o controle volta ao tamanho da aerada.
  const toque = await browser.newContext({
    baseURL: baseURL ?? undefined,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const p = await toque.newPage();
    await loginComoAdmin(p, creds);
    await p.goto("/app/settings/marca");
    await expect
      .poll(
        async () => {
          const m = await controlesDaPagina(p);
          return { botao: m.botao, campo: m.campo };
        },
        { message: "com toque o controle compacto NÃO encolhe" },
      )
      .toEqual(CONTROLE.aerada);
    const t = await controlesDaPagina(p);
    medidasDeDensidade["7_toque_compacta"] = t;
    console.info(`[marca-aparencia] toque + compacta → ${JSON.stringify(t)}`);
    expect(t.atributo, "o atributo continua compacta; é a sobrescrita que não vale").toBe(
      "compacta",
    );
    expect(t.ponteiroFino, "precondição: ponteiro grosso").toBe(false);
    expect(
      t.larguraDaJanela,
      "precondição: acima do breakpoint lg (1024px)",
    ).toBeGreaterThanOrEqual(1024);
    await p.screenshot({ path: evidencia("7-toque-compacta.png"), fullPage: true });
  } finally {
    await toque.close();
  }

  // "Usar o padrão da instalação" → volta aos 32px da instalação (equilibrada).
  await escolherNaEmpresa(page, { densidade: "herdar" });
  await page.goto("/app/settings/marca");
  await expect
    .poll(
      async () => {
        const m = await controlesDaPagina(page);
        return { botao: m.botao, campo: m.campo };
      },
      { message: "herdar devolve a densidade da instalação" },
    )
    .toEqual(CONTROLE.equilibrada);
  expect((await controlesDaPagina(page)).atributo).toBe("equilibrada");
  fs.writeFileSync(
    evidencia("densidade-medidas.json"),
    JSON.stringify(medidasDeDensidade, null, 2),
  );
});

/** De qual família é um arquivo woff2 (o nome do arquivo carrega a família). */
const FAMILIAS: readonly (readonly [string, RegExp])[] = [
  ["atkinson", /atkinson/],
  ["plex-mono", /ibm_plex_mono/],
  ["plex-sans", /ibm_plex_sans/],
  ["manrope", /manrope/],
  ["jakarta", /plus_jakarta/],
  ["bricolage", /bricolage/],
  ["fraunces", /fraunces/],
  ["source-serif", /source_serif/],
  ["jetbrains", /jetbrains/],
];
const EXTRAS = [
  "manrope",
  "jakarta",
  "plex-sans",
  "bricolage",
  "fraunces",
  "source-serif",
] as const;

function familiaDoArquivo(arquivo: string): string {
  return FAMILIAS.find(([, re]) => re.test(arquivo))?.[0] ?? `desconhecida:${arquivo}`;
}

/** Contexto de cache frio: loga, abre `/app/contacts` e devolve os woff2 que o navegador baixou. */
async function fontesBaixadasEmCacheFrio(
  browser: import("@playwright/test").Browser,
  baseURL: string | undefined,
  aoFinal: (page: Page) => Promise<void>,
): Promise<{ arquivos: string[]; familias: string[] }> {
  const contexto = await browser.newContext({ baseURL: baseURL ?? undefined });
  try {
    const p = await contexto.newPage();
    const arquivos = new Set<string>();
    // Antes do login: a lista cobre a jornada inteira, não só a última página.
    p.on("response", (r) => {
      const u = new URL(r.url());
      if (u.pathname.endsWith(".woff2")) arquivos.add(path.basename(u.pathname));
    });
    await loginComoAdmin(p, creds);
    await p.goto("/app/contacts");
    await p.waitForLoadState("load");
    await p.evaluate(() => document.fonts.ready);
    // Fonte descoberta por um layout posterior começa a baixar depois: assenta e confirma de novo.
    await p.waitForTimeout(1_000);
    await p.evaluate(() => document.fonts.ready);
    await aoFinal(p);
    const lista = [...arquivos].sort();
    return { arquivos: lista, familias: [...new Set(lista.map(familiaDoArquivo))].sort() };
  } finally {
    await contexto.close();
  }
}

test("(8) a empresa escolhe FRAUNCES: o corpo resolve Fraunces e só o arquivo dela é baixado; desfeito, só Atkinson e Plex Mono", async ({
  page,
  browser,
  baseURL,
}) => {
  creds = await loginComoAdmin(page, creds);
  await page.goto("/app/settings/marca");

  // Prévia ANTES de salvar.
  await page.locator("#org-fonte-fraunces").check();
  const previaDaFonte = page.locator("[data-previa-da-fonte]");
  await expect(previaDaFonte).toHaveAttribute("data-previa-da-fonte", "fraunces");
  const familiaDaPrevia = await previaDaFonte.evaluate((el) => getComputedStyle(el).fontFamily);
  console.info(`[marca-aparencia] prévia fraunces antes de salvar → ${familiaDaPrevia}`);
  expect(familiaDaPrevia.toLowerCase()).toMatch(/^"?fraunces/);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await esperarToast(page);

  let corpo = "";
  let rotulo = "";
  const comFraunces = await fontesBaixadasEmCacheFrio(browser, baseURL, async (p) => {
    const m = await p.evaluate(() => ({
      corpo: getComputedStyle(document.body).fontFamily,
      atributo: document.documentElement.getAttribute("data-fonte"),
      carregada: document.fonts.check("16px fraunces"),
    }));
    corpo = m.corpo;
    rotulo = `${m.atributo}/${m.carregada}`;
    expect(m.atributo).toBe("fraunces");
    expect(m.carregada, "document.fonts diz que a Fraunces está carregada").toBe(true);
    await p.screenshot({ path: evidencia("8-fonte-fraunces.png"), fullPage: true });
  });
  console.info(`[marca-aparencia] fraunces → ${JSON.stringify({ corpo, rotulo, ...comFraunces })}`);
  expect(corpo.toLowerCase(), "o corpo resolve Fraunces primeiro").toMatch(/^"?fraunces/);
  expect(comFraunces.familias, "o arquivo da Fraunces foi baixado").toContain("fraunces");

  // Escolha desfeita (volta a herdar → Atkinson da instalação): só Atkinson e Plex Mono.
  await escolherNaEmpresa(page, { fonte: "herdar" });
  const padrao = await fontesBaixadasEmCacheFrio(browser, baseURL, async (p) => {
    const m = await p.evaluate(() => ({
      corpo: getComputedStyle(document.body).fontFamily,
      atributo: document.documentElement.getAttribute("data-fonte"),
    }));
    expect(m.atributo, "a fonte padrão é a AUSÊNCIA do atributo").toBeNull();
    expect(m.corpo.toLowerCase()).toMatch(/^"?atkinson/);
  });
  console.info(`[marca-aparencia] fonte padrão (atkinson) → ${JSON.stringify(padrao)}`);
  fs.writeFileSync(
    evidencia("fontes-baixadas.json"),
    JSON.stringify({ empresa_fraunces: comFraunces, empresa_herdar_atkinson: padrao }, null, 2),
  );
  const extrasBaixadas = padrao.familias.filter((f) => (EXTRAS as readonly string[]).includes(f));
  expect(extrasBaixadas, "nenhuma das seis fontes extras é baixada com o padrão").toEqual([]);
  expect(padrao.familias, "a Atkinson (padrão) foi baixada").toContain("atkinson");
  expect(padrao.familias, "nada além de Atkinson e Plex Mono").toEqual(
    padrao.familias.filter((f) => f === "atkinson" || f === "plex-mono"),
  );
});

test("(9) sem flash: empresa COMPACTA+FRAUNCES sobre instalação EQUILIBRADA+ATKINSON — zero quadros com o valor errado", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  const servidor = await (await page.request.get("/login")).text();
  expect(servidor, "precondição: a instalação segue equilibrada").toMatch(
    /<html[^>]*data-densidade="equilibrada"/,
  );
  await escolherNaEmpresa(page, { densidade: "compacta", fonte: "fraunces" });

  await page.addInitScript(() => {
    type Quadro = {
      t: number;
      densidade: string | null;
      fonte: string | null;
      controleH: string;
      fontUi: string;
    };
    type Troca = { t: number; v: string | null };
    const w = window as unknown as {
      __trocas: { densidade: Troca[]; fonte: Troca[] };
      __quadros: Quadro[];
    };
    w.__trocas = { densidade: [], fonte: [] };
    w.__quadros = [];
    const ultimo: Record<"densidade" | "fonte", string | null | undefined> = {
      densidade: undefined,
      fonte: undefined,
    };
    const registra = () => {
      if (!document.documentElement) return;
      for (const eixo of ["densidade", "fonte"] as const) {
        const v = document.documentElement.getAttribute(`data-${eixo}`);
        if (v !== ultimo[eixo]) {
          ultimo[eixo] = v;
          w.__trocas[eixo].push({ t: performance.now(), v });
        }
      }
    };
    new MutationObserver(registra).observe(document, {
      attributes: true,
      attributeFilter: ["data-densidade", "data-fonte"],
      childList: true,
      subtree: true,
    });
    const laco = () => {
      if (document.body) {
        const html = document.documentElement;
        const estilo = getComputedStyle(html);
        w.__quadros.push({
          t: performance.now(),
          densidade: html.getAttribute("data-densidade"),
          fonte: html.getAttribute("data-fonte"),
          controleH: estilo.getPropertyValue("--controle-h").trim(),
          fontUi: estilo.getPropertyValue("--font-ui").trim(),
        });
      }
      if (performance.now() < 5_000) requestAnimationFrame(laco);
    };
    requestAnimationFrame(laco);
  });
  await emTema(page, "light", "/app/inbox");
  await page.waitForFunction(() => performance.now() > 5_000);
  const flash = await page.evaluate(() => {
    const w = window as unknown as {
      __trocas: {
        densidade: { t: number; v: string | null }[];
        fonte: { t: number; v: string | null }[];
      };
      __quadros: {
        t: number;
        densidade: string | null;
        fonte: string | null;
        controleH: string;
        fontUi: string;
      }[];
    };
    return {
      trocas: w.__trocas,
      quadros: w.__quadros,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    };
  });
  const densidadeErrada = flash.quadros.filter(
    (q) => q.densidade !== "compacta" || q.controleH !== "30px",
  );
  const fonteErrada = flash.quadros.filter(
    (q) => q.fonte !== "fraunces" || !/^var\(--fonte-fraunces\)|fraunces/i.test(q.fontUi),
  );
  const janela = (qs: typeof flash.quadros) =>
    qs.length ? (qs[qs.length - 1]!.t - qs[0]!.t).toFixed(1) : "0";
  const resumo = {
    fcp_ms: flash.fcp,
    trocas_densidade: flash.trocas.densidade.map((x) => `${x.v}@${x.t.toFixed(1)}ms`),
    trocas_fonte: flash.trocas.fonte.map((x) => `${x.v}@${x.t.toFixed(1)}ms`),
    quadros_medidos: flash.quadros.length,
    quadros_com_densidade_errada: densidadeErrada.length,
    quadros_com_fonte_errada: fonteErrada.length,
    janela_do_flash_densidade_ms: janela(densidadeErrada),
    janela_do_flash_fonte_ms: janela(fonteErrada),
  };
  console.info(`[marca-aparencia] FLASH densidade+fonte ${JSON.stringify(resumo)}`);
  fs.writeFileSync(evidencia("flash-densidade-fonte.json"), JSON.stringify(resumo, null, 2));
  expect(flash.quadros.length, "o laço mediu quadros").toBeGreaterThan(0);
  expect(flash.quadros.at(-1)?.densidade, "terminou na densidade da empresa").toBe("compacta");
  expect(flash.quadros.at(-1)?.fonte, "terminou na fonte da empresa").toBe("fraunces");
  expect(
    densidadeErrada,
    `${densidadeErrada.length} quadro(s) pintaram a densidade da instalação`,
  ).toEqual([]);
  expect(fonteErrada, `${fonteErrada.length} quadro(s) pintaram a fonte da instalação`).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cores do tema e a trava de contraste
// ─────────────────────────────────────────────────────────────────────────────

/** Texto principal quase igual ao fundo do claro: 1,06 sobre a página (piso 4,5). */
const TEXTO_ILEGIVEL = "#f2f2f0";

/** Escolha legível: as três cores que se medem no `<body>` e num cartão. */
const LEGIVEL = {
  claro: { bg: "#eef4fb", surface: "#f8fbff", text: "#0f2340" },
  escuro: { bg: "#0d141d", surface: "#151e2a", text: "#e8eef6" },
} as const;

/** Fundo do claro escolhido pela INSTALAÇÃO no caso 13. */
const FUNDO_DA_INSTALACAO = "#f1f6ee";

function rgbDe(hex: string): string {
  const h = hex.replace("#", "");
  const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
}

/** Razão de contraste WCAG entre duas cores `rgb(...)` que o `getComputedStyle` devolveu. */
function razaoWcag(a: string, b: string): number {
  const lum = (cor: string) => {
    const [r, g, bl] = (cor.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const c = [r ?? 0, g ?? 0, bl ?? 0].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [x, y] = [lum(a), lum(b)];
  const [claro, escuro] = x > y ? [x, y] : [y, x];
  return (claro + 0.05) / (escuro + 0.05);
}

function bancoDeServico() {
  const c = credenciaisSupabaseDeTeste();
  return createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
}

/** Organizações com `settings.branding.cores` gravado — o que a trava deixou passar. */
async function orgsComCores(): Promise<{ id: string; cores: unknown }[]> {
  const { data, error } = await bancoDeServico()
    .from("organizations")
    .select("id, settings")
    .filter("settings->branding->>cores", "not.is", null);
  if (error) throw new Error(`leitura das cores das organizações: ${error.message}`);
  return (
    (data ?? []) as { id: string; settings: { branding?: { cores?: unknown } } | null }[]
  ).map((o) => ({ id: o.id, cores: o.settings?.branding?.cores }));
}

/** Abre o `<details>` "Cores do tema" (fechado quando a camada não tem escolha). */
async function abrirCoresDoTema(page: Page, id: string): Promise<void> {
  const details = page.locator(`details#${id}`);
  await expect(details).toBeAttached();
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
  await expect(details).toHaveJSProperty("open", true);
}

/** O que a página pinta: `<body>` (página) e o primeiro cartão (`Card`) dentro do `<main>`. */
async function coresPintadas(page: Page) {
  return page.evaluate(() => {
    const corpo = getComputedStyle(document.body);
    const cartao = document.querySelector<HTMLElement>("main div.rounded-lg.border.bg-surface");
    return {
      tema: document.documentElement.getAttribute("data-theme"),
      fundoDaPagina: corpo.backgroundColor,
      textoDaPagina: corpo.color,
      fundoDoCartao: cartao ? getComputedStyle(cartao).backgroundColor : null,
      textoDoCartao: cartao ? getComputedStyle(cartao).color : null,
    };
  });
}

type CoresPintadas = Awaited<ReturnType<typeof coresPintadas>>;

/** Mede quando assenta (a cor pode animar numa transição) e devolve a medida estável. */
async function coresAssentadas(
  page: Page,
  esperado: Partial<Omit<CoresPintadas, "tema">>,
  mensagem: string,
): Promise<CoresPintadas> {
  await expect
    .poll(
      async () => {
        const m = await coresPintadas(page);
        return Object.fromEntries(
          Object.keys(esperado).map((k) => [k, m[k as keyof CoresPintadas]]),
        );
      },
      { message: mensagem },
    )
    .toEqual(esperado);
  return coresPintadas(page);
}

/** O que a amostra de UM tema pinta: o fundo dela, o cartão de dentro e o texto principal. */
async function amostraDasCores(page: Page, tema: "claro" | "escuro") {
  return page.locator(`[data-previa-das-cores="${tema}"]`).evaluate((el) => {
    const cartao = el.firstElementChild as HTMLElement;
    const texto = cartao.querySelector("p") as HTMLElement;
    return {
      fundoDaPagina: getComputedStyle(el).backgroundColor,
      fundoDoCartao: getComputedStyle(cartao).backgroundColor,
      textoPrincipal: getComputedStyle(texto).color,
    };
  });
}

const BOTAO_SALVAR = { name: "Salvar", exact: true } as const;

test("(10) cores do tema ILEGÍVEIS: a trava nomeia o par, o Salvar desliga e nada é gravado", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  expect(await orgsComCores(), "precondição: nenhuma organização com cores").toEqual([]);

  await page.goto("/app/settings/marca");
  await abrirCoresDoTema(page, "org-cores-do-tema");
  const trava = page.locator("[data-trava-das-cores]");
  await expect(trava, "precondição: sem escolha, a trava passa").toHaveAttribute(
    "data-trava-das-cores",
    "passa",
  );
  const salvar = page.getByRole("button", BOTAO_SALVAR);
  await expect(salvar).toBeEnabled();

  await page.locator("#org-cores-do-tema-claro-text").fill(TEXTO_ILEGIVEL);

  await expect(trava).toHaveAttribute("data-trava-das-cores", "reprova");
  const itens = trava.locator("li");
  const frases = await itens.allTextContents();
  console.info(`[marca-aparencia] trava reprova → ${JSON.stringify(frases)}`);
  expect(frases, "a lista nomeia o par, o tema e a razão contra o piso").toContain(
    "Texto principal sobre Fundo da página (tema claro): 1,1 de 4,5 — escureça texto principal ou clareie fundo da página.",
  );
  expect(frases.some((f) => f.startsWith("Texto principal sobre Cartões (tema claro)"))).toBe(true);
  expect(
    frases.every((f) => f.includes("(tema claro)")),
    "só o claro foi mexido — nenhum par do escuro reprova",
  ).toBe(true);
  await expect(salvar, "o Salvar desliga enquanto algum par reprova").toBeDisabled();

  // O contraste que a amostra REALMENTE pinta, medido no navegador.
  const amostra = await amostraDasCores(page, "claro");
  const razaoNaAmostra = razaoWcag(amostra.textoPrincipal, amostra.fundoDaPagina);
  console.info(
    `[marca-aparencia] amostra ilegível → ${JSON.stringify({ ...amostra, razaoNaAmostra })}`,
  );
  expect(amostra.textoPrincipal, "a prévia pinta o texto escolhido").toBe(rgbDe(TEXTO_ILEGIVEL));
  expect(razaoNaAmostra).toBeLessThan(4.5);
  await page.screenshot({ path: evidencia("10-cores-ilegiveis-bloqueadas.png"), fullPage: true });

  // Recarregar descarta o rascunho: nada foi gravado.
  await page.reload();
  await abrirCoresDoTema(page, "org-cores-do-tema");
  await expect(page.locator("#org-cores-do-tema-claro-text")).toHaveValue("");
  await expect(trava).toHaveAttribute("data-trava-das-cores", "passa");
  expect(await orgsComCores(), "o banco não recebeu cor nenhuma").toEqual([]);
});

test("(11) cores do tema LEGÍVEIS: prévia antes de salvar, /app pinta nos dois temas, voltar ao padrão restaura", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);

  // O que /app pinta SEM escolha — é o que "voltar ao padrão" tem de devolver.
  const antes: Record<"light" | "dark", CoresPintadas> = {} as never;
  for (const tema of ["light", "dark"] as const) {
    await emTema(page, tema, "/app/settings/marca");
    antes[tema] = await coresPintadas(page);
  }
  console.info(`[marca-aparencia] cores de fábrica → ${JSON.stringify(antes)}`);
  expect(antes.light.fundoDaPagina).not.toBe(rgbDe(LEGIVEL.claro.bg));
  expect(antes.dark.fundoDaPagina).not.toBe(rgbDe(LEGIVEL.escuro.bg));

  await emTema(page, "light", "/app/settings/marca");
  await abrirCoresDoTema(page, "org-cores-do-tema");
  for (const tema of ["claro", "escuro"] as const) {
    for (const [token, hex] of Object.entries(LEGIVEL[tema])) {
      await page.locator(`#org-cores-do-tema-${tema}-${token}`).fill(hex);
    }
  }
  await expect(page.locator("[data-trava-das-cores]")).toHaveAttribute(
    "data-trava-das-cores",
    "passa",
  );

  // Prévia ANTES de salvar, nos dois temas.
  for (const tema of ["claro", "escuro"] as const) {
    const esperado = {
      fundoDaPagina: rgbDe(LEGIVEL[tema].bg),
      fundoDoCartao: rgbDe(LEGIVEL[tema].surface),
      textoPrincipal: rgbDe(LEGIVEL[tema].text),
    };
    await expect
      .poll(() => amostraDasCores(page, tema), { message: `amostra do ${tema} antes de salvar` })
      .toEqual(esperado);
    console.info(
      `[marca-aparencia] prévia ${tema} → ${JSON.stringify({ ...esperado, razaoTextoCartao: razaoWcag(esperado.textoPrincipal, esperado.fundoDoCartao).toFixed(2) })}`,
    );
  }
  await page.screenshot({ path: evidencia("11-previa-cores-legiveis.png"), fullPage: true });

  const salvar = page.getByRole("button", BOTAO_SALVAR);
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await esperarToast(page);

  const gravadas = await orgsComCores();
  console.info(`[marca-aparencia] gravado → ${JSON.stringify(gravadas)}`);
  expect(gravadas).toHaveLength(1);
  expect(gravadas[0]!.cores, "o banco guarda exatamente o que a tela escolheu").toEqual(LEGIVEL);

  // Depois de salvar e recarregar: /app resolve as cores escolhidas, nos dois temas.
  const medidas: Record<string, unknown> = { antes };
  for (const [tema, chave] of [
    ["light", "claro"],
    ["dark", "escuro"],
  ] as const) {
    await emTema(page, tema, "/app/settings/marca");
    const m = await coresAssentadas(
      page,
      {
        fundoDaPagina: rgbDe(LEGIVEL[chave].bg),
        textoDaPagina: rgbDe(LEGIVEL[chave].text),
        fundoDoCartao: rgbDe(LEGIVEL[chave].surface),
        textoDoCartao: rgbDe(LEGIVEL[chave].text),
      },
      `/app pinta as cores da empresa no ${chave}`,
    );
    medidas[chave] = {
      ...m,
      razaoTextoPagina: razaoWcag(m.textoDaPagina, m.fundoDaPagina).toFixed(2),
      razaoTextoCartao: razaoWcag(m.textoDoCartao!, m.fundoDoCartao!).toFixed(2),
    };
    console.info(`[marca-aparencia] /app ${chave} salvo → ${JSON.stringify(medidas[chave])}`);
    expect(m.tema).toBe(tema);
    await page.screenshot({
      path: evidencia(`11-empresa-cores-${chave}.png`),
      fullPage: true,
    });
  }
  // Outra tela de /app, sem cartão: a página toda pinta, não só a de Marca.
  await emTema(page, "light", "/app/inbox");
  await coresAssentadas(
    page,
    { fundoDaPagina: rgbDe(LEGIVEL.claro.bg), textoDaPagina: rgbDe(LEGIVEL.claro.text) },
    "/app/inbox também pinta as cores da empresa",
  );

  // "Voltar todas as cores do tema ao padrão" → Salvar → os valores de antes.
  await emTema(page, "light", "/app/settings/marca");
  await abrirCoresDoTema(page, "org-cores-do-tema");
  await expect(page.locator("#org-cores-do-tema-claro-bg")).toHaveValue(LEGIVEL.claro.bg);
  await page.getByRole("button", { name: "Voltar todas as cores do tema ao padrão" }).click();
  await expect(page.locator("#org-cores-do-tema-claro-bg")).toHaveValue("");
  await page.getByRole("button", BOTAO_SALVAR).click();
  await esperarToast(page);
  expect(await orgsComCores(), "herdar apaga a chave no banco").toEqual([]);

  for (const tema of ["light", "dark"] as const) {
    await emTema(page, tema, "/app/settings/marca");
    const { tema: _t, ...esperado } = antes[tema];
    const m = await coresAssentadas(page, esperado, `voltar ao padrão devolve o ${tema} de antes`);
    medidas[`restaurado_${tema}`] = m;
  }
  fs.writeFileSync(evidencia("11-cores-medidas.json"), JSON.stringify(medidas, null, 2));
});

test("(12) o SERVIDOR é a fronteira: submissão com o Salvar desligado é recusada com cores_sem_contraste", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);
  await page.goto("/app/settings/marca");

  const db = bancoDeServico();
  const lerBranding = async () => {
    const { data, error } = await db
      .from("organizations")
      .select("id, settings")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      id: (o as { id: string }).id,
      branding: (o as { settings: { branding?: unknown } | null }).settings?.branding ?? null,
    }));
  };
  const antes = await lerBranding();

  await abrirCoresDoTema(page, "org-cores-do-tema");
  await page.locator("#org-cores-do-tema-claro-text").fill(TEXTO_ILEGIVEL);
  // Um campo legítimo junto: a recusa tem de ser da GRAVAÇÃO inteira, não só das cores.
  await page.locator("#org_app_name").fill("Empresa Que Burlou a Tela");
  const salvar = page.getByRole("button", BOTAO_SALVAR);
  await expect(salvar).toBeDisabled();

  // A tela não é fronteira: `requestSubmit()` sem submitter dispara o submit do
  // formulário sem passar pelo botão desligado, como um usuário que remove o
  // `disabled` no DevTools. O handler do formulário chama a Server Action.
  //
  // A resposta da action é lida pelo `route.fetch()`: a resposta é em fluxo (RSC)
  // e o corpo pelo `waitForResponse` some do buffer do CDP ("No data found").
  let corpoDaAction: string | null = null;
  await page.route("**/app/settings/marca", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || req.headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    const r = await route.fetch();
    const corpo = await r.text();
    corpoDaAction = corpo;
    await route.fulfill({ response: r, body: corpo });
  });
  await page
    .locator("form:has(#org-cores-do-tema)")
    .evaluate((f) => (f as HTMLFormElement).requestSubmit());
  await expect
    .poll(() => corpoDaAction, { message: "a Server Action foi chamada", timeout: 15_000 })
    .not.toBeNull();
  const corpo = corpoDaAction ?? "";
  const recusa = corpo.match(/"error":"([a-z_]+)"/)?.[1] ?? null;
  console.info(
    `[marca-aparencia] action com par ilegível → ${JSON.stringify({ recusa, trecho: corpo.slice(0, 400) })}`,
  );
  expect(recusa, "a action recusa no servidor").toBe("cores_sem_contraste");
  expect(corpo, "a recusa diz o par").toContain("--color-text");

  await expect(
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /Alguma combinação de cores ficou difícil de ler/ }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: TOAST_SALVO }),
    "nunca 'salvo'",
  ).toHaveCount(0);
  await page.screenshot({ path: evidencia("12-servidor-recusa.png"), fullPage: true });

  const depois = await lerBranding();
  expect(depois, "nenhuma organização mudou — nem as cores, nem o nome").toEqual(antes);
  expect(await orgsComCores()).toEqual([]);
});

test("(13) a INSTALAÇÃO escolhe o fundo do claro: a empresa sem cores herda", async ({
  page,
  browser,
}) => {
  creds = await loginComoAdmin(page, creds);
  const antes: Record<"light" | "dark", CoresPintadas> = {} as never;
  for (const tema of ["light", "dark"] as const) {
    await emTema(page, tema, "/app/inbox");
    antes[tema] = await coresPintadas(page);
  }

  const dono = await browser.newPage();
  try {
    creds = await loginComoDono(dono, creds);
    await dono.goto("/admin/marca");
    await abrirCoresDoTema(dono, "cores-do-tema");
    await dono.locator("#cores-do-tema-claro-bg").fill(FUNDO_DA_INSTALACAO);
    await expect(dono.locator("[data-trava-das-cores]")).toHaveAttribute(
      "data-trava-das-cores",
      "passa",
    );
    await dono.getByRole("button", BOTAO_SALVAR).click();
    await esperarToast(dono);

    expect(await orgsComCores(), "precondição: a empresa não tem cores próprias").toEqual([]);
    await emTema(page, "light", "/app/inbox");
    const claro = await coresAssentadas(
      page,
      { fundoDaPagina: rgbDe(FUNDO_DA_INSTALACAO), textoDaPagina: antes.light.textoDaPagina },
      "a empresa herda o fundo da instalação",
    );
    await page.screenshot({ path: evidencia("13-empresa-herda-instalacao.png"), fullPage: true });
    await emTema(page, "dark", "/app/inbox");
    const { tema: _t, ...escuroDeAntes } = antes.dark;
    const escuro = await coresAssentadas(page, escuroDeAntes, "o escuro não foi tocado");
    console.info(`[marca-aparencia] herança da instalação → ${JSON.stringify({ claro, escuro })}`);

    // A tela da empresa mostra a cor herdada como placeholder do campo vazio.
    await emTema(page, "light", "/app/settings/marca");
    await abrirCoresDoTema(page, "org-cores-do-tema");
    const campo = page.locator("#org-cores-do-tema-claro-bg");
    await expect(campo).toHaveValue("");
    await expect(campo).toHaveAttribute("placeholder", FUNDO_DA_INSTALACAO);
  } finally {
    // A marca da instalação é memo do processo: só a Server Action o invalida,
    // então a devolução ao padrão passa pela tela, não pelo service role.
    await dono.goto("/admin/marca");
    await abrirCoresDoTema(dono, "cores-do-tema");
    const voltar = dono.getByRole("button", { name: "Voltar todas as cores do tema ao padrão" });
    if (await voltar.isVisible()) {
      await voltar.click();
      await dono.getByRole("button", BOTAO_SALVAR).click();
      await esperarToast(dono);
    }
    await dono.close();
  }

  await emTema(page, "light", "/app/inbox");
  const { tema: _t, ...claroDeAntes } = antes.light;
  await coresAssentadas(page, claroDeAntes, "voltar ao padrão na instalação devolve o claro");
});
