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
 * Limpeza: o `afterAll` devolve as duas camadas ao padrão pelo service role,
 * tocando só as linhas que esta spec escreveu (raio, barra lateral, densidade, fonte).
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
    } as never)
    .eq("id", 1);
  if (e1) throw new Error(`reset da instalação: ${e1.message}`);
  for (const chave of ["raio", "barra_lateral", "densidade", "fonte"] as const) {
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
