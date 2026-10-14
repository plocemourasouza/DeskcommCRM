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
 * Limpeza: o `afterAll` devolve as duas camadas ao padrão pelo service role,
 * tocando só as linhas que esta spec escreveu.
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

async function salvarDaInstalacao(page: Page, raio: keyof typeof MD, barra: "padrao" | "escura"): Promise<void> {
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
    .update({ raio: "padrao", barra_lateral: "padrao" } as never)
    .eq("id", 1);
  if (e1) throw new Error(`reset da instalação: ${e1.message}`);
  for (const chave of ["raio", "barra_lateral"] as const) {
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
    await page.screenshot({ path: evidencia(`1-padrao-${tema === "light" ? "claro" : "escuro"}.png`), fullPage: true });
  }
});

test("(2) o dono escolhe SUAVE → o HTML do servidor já sai suave e os cantos medem 4px", async ({ page }) => {
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
  const token = await previa.evaluate((el) => getComputedStyle(el).getPropertyValue("--radius-md").trim());
  // Os elementos têm `transition: all` (reset global): o canto ANIMA até o valor
  // novo, então o botão da amostra é medido quando assenta, não no 1º quadro.
  const cantoDaAmostra = () =>
    previa.evaluate((el) => getComputedStyle(el.querySelector("span")!).borderTopLeftRadius);
  await expect.poll(cantoDaAmostra, { message: "a amostra de botão da prévia (rounded-md)" }).toBe(MD.arredondado);
  console.info(`[marca-aparencia] prévia antes de salvar → ${JSON.stringify({ token, canto: await cantoDaAmostra() })}`);
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

test("(4) barra lateral ESCURA com a página CLARA — desktop e gaveta do celular", async ({ page }) => {
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
    expect(m.imgs.some((i) => i.visivel), "alguma <img> de logo visível na barra").toBe(true);
  } else {
    const nome = m.preenchimentos.filter((p) => (p.classe ?? "").includes("dark:fill-[#f5f4ef]"));
    expect(nome.length, "o logo do produto tem a variante escura do nome").toBeGreaterThan(0);
    for (const n of nome) expect(n.fill, "o nome do logo pinta a cor da variante escura").toBe("rgb(245, 244, 239)");
  }

  const contraste = await contrasteDoItemAtivo(page);
  console.info(`[marca-aparencia] contraste do item ativo → ${JSON.stringify(contraste)}`);
  expect(contraste.razao, "texto do item ativo contra o fundo, WCAG AA").toBeGreaterThanOrEqual(4.5);
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
    const w = window as unknown as { __trocas: { t: number; v: string | null }[]; __quadros: Quadro[] };
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
    janela_do_flash_ms: errados.length ? (errados[errados.length - 1]!.t - errados[0]!.t).toFixed(1) : "0",
  };
  console.info(`[marca-aparencia] FLASH ${JSON.stringify(resumo)}`);
  fs.writeFileSync(evidencia("flash.json"), JSON.stringify(resumo, null, 2));
  expect(flash.quadros.length, "o laço mediu quadros").toBeGreaterThan(0);
  expect(flash.quadros.at(-1)?.tokenMd, "terminou no raio da empresa").toBe(MD.arredondado);
  expect(errados, `${errados.length} quadro(s) pintaram o raio da instalação`).toEqual([]);
});
