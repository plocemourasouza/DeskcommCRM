/**
 * Neutros escolhíveis (quente/cinza/frio) — provado PELA TELA, medido por
 * ferramenta (`getComputedStyle`), nas duas camadas e nas duas aparências.
 *
 * O que a jornada prova:
 *   1. Sem escolha, a cara é a de sempre (`quente`): o `<html>` não carrega
 *      `data-neutros` e `--color-bg` / `--color-surface` são os do `:root`.
 *   2. O dono do servidor escolhe `cinza` em Admin › Marca → o `<html>` passa a
 *      levar `data-neutros="cinza"` já no HTML do servidor, e os tokens mudam
 *      no claro E no escuro.
 *   3. O admin da empresa escolhe `frio` em Configurações › Marca → dentro de
 *      `/app` a escolha da empresa vence a da instalação.
 *   4. SEM FLASH: o layout de /app emite um script inline que troca o atributo
 *      no parse (`lib/branding/script-dos-neutros.ts`). A spec registra cada
 *      quadro pintado e exige zero quadros com a paleta da instalação.
 *
 * Limpeza: o caso final devolve as duas camadas ao padrão PELA TELA.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { test, expect, type Page } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin, loginComoDono, type CredsE2E } from "./helpers/login-admin";

test.describe.configure({ mode: "serial" });

const EVIDENCIA = path.join(process.cwd(), "evidence", "marca-neutros");

function evidencia(nome: string): string {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  return path.join(EVIDENCIA, nome);
}

/** Valores esperados, tirados de `app/globals.css` (claro / escuro). */
const ESPERADO = {
  quente: {
    claro: { bg: "#faf9f6", surface: "#ffffff", pintado: "rgb(250, 249, 246)" },
    escuro: { bg: "#161510", surface: "#1d1c17", pintado: "rgb(22, 21, 16)" },
  },
  cinza: {
    claro: { bg: "#f9f9f9", surface: "#ffffff", pintado: "rgb(249, 249, 249)" },
    escuro: { bg: "#151515", surface: "#1c1c1c", pintado: "rgb(21, 21, 21)" },
  },
  frio: {
    claro: { bg: "#f5faff", surface: "#ffffff", pintado: "rgb(245, 250, 255)" },
    escuro: { bg: "#12151a", surface: "#191c21", pintado: "rgb(18, 21, 26)" },
  },
} as const;

type Preset = keyof typeof ESPERADO;
type Aparencia = "claro" | "escuro";

interface Medida {
  atributo: string | null;
  tema: string | null;
  bodyBg: string;
  tokenBg: string;
  tokenSurface: string;
  tokenBgNoBody: string;
}

/**
 * Mede no navegador: o atributo, o tema, o fundo PINTADO do `<body>` e os dois
 * tokens como o `<html>` e o `<body>` os resolvem (`getPropertyValue`, em hex).
 */
async function medir(page: Page): Promise<Medida> {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    const doHtml = getComputedStyle(raiz);
    // O CSS de produção é minificado (`#ffffff` → `#fff`): normaliza para 6 dígitos.
    const hex = (v: string) => {
      const t = v.trim().toLowerCase();
      return /^#[0-9a-f]{3}$/.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : t;
    };
    const doBody = getComputedStyle(document.body);
    return {
      atributo: raiz.getAttribute("data-neutros"),
      tema: raiz.getAttribute("data-theme"),
      bodyBg: doBody.backgroundColor,
      tokenBg: hex(doHtml.getPropertyValue("--color-bg")),
      tokenSurface: hex(doHtml.getPropertyValue("--color-surface")),
      tokenBgNoBody: hex(doBody.getPropertyValue("--color-bg")),
    };
  });
}

async function emAparencia(page: Page, aparencia: Aparencia, url: string): Promise<void> {
  // O tema vem do `localStorage` (`deskcomm-theme`) lido pelo script de init do
  // `<html>`; gravar ali e recarregar é o que o seletor de tema da tela faz.
  await page.evaluate((v) => localStorage.setItem("deskcomm-theme", v), aparencia === "escuro" ? "dark" : "light");
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("data-theme", aparencia === "escuro" ? "dark" : "light");
}

async function afirmarPaleta(page: Page, preset: Preset, aparencia: Aparencia, onde: string): Promise<Medida> {
  const m = await medir(page);
  const e = ESPERADO[preset][aparencia];
  console.info(`[marca-neutros] ${onde} ${preset}/${aparencia} → ${JSON.stringify(m)}`);
  expect(m.atributo, `${onde}: atributo data-neutros`).toBe(preset === "quente" ? null : preset);
  expect(m.tokenBg, `${onde}: --color-bg (${preset}/${aparencia})`).toBe(e.bg);
  expect(m.tokenSurface, `${onde}: --color-surface (${preset}/${aparencia})`).toBe(e.surface);
  expect(m.tokenBgNoBody, `${onde}: --color-bg resolvido no <body>`).toBe(e.bg);
  expect(m.bodyBg, `${onde}: o <body> pinta o --color-bg`).toBe(e.pintado);
  return m;
}

async function salvarNeutrosDaInstalacao(page: Page, preset: Preset): Promise<void> {
  await page.goto("/admin/marca");
  await page.locator(`#neutros-${preset}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Marca salva/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function salvarNeutrosDaEmpresa(page: Page, escolha: Preset | "herdar"): Promise<void> {
  await page.goto("/app/settings/marca");
  await page.locator(`#org-neutros-${escolha}`).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Marca salva/i })).toBeVisible({
    timeout: 15_000,
  });
}

let creds: CredsE2E;

test.beforeAll(() => {
  // Promove `dono` a platform admin (o painel da INSTALAÇÃO é só dele) e revoga
  // a promoção do `admin` — o mesmo seed idempotente de `marca-logo.spec.ts`.
  execFileSync("npx", ["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  creds = lerCreds();
});

/**
 * "Ausente" = NUNCA escolhido: a instalação no default da coluna (`quente`) e
 * nenhuma organização com `settings.branding.neutros`. Sem isto, uma rodada
 * vermelha anterior (que não chegou à limpeza do caso 4) deixaria o caso 1
 * medindo o resto dela — medido: `data-neutros="frio"` na 2ª rodada.
 */
test.beforeAll(async () => {
  const c = credenciaisSupabaseDeTeste();
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const { error: e1 } = await db.from("platform_branding").update({ neutros: "quente" } as never).eq("id", 1);
  if (e1) throw new Error(`reset da instalação: ${e1.message}`);
  // Só quem gravou `neutros` — nunca "todas" (cerca e2e-nao-escolhe-a-primeira-linha).
  const { data: orgs, error: e2 } = await db
    .from("organizations")
    .select("id, settings")
    .filter("settings->branding->>neutros", "not.is", null);
  if (e2) throw new Error(`leitura das organizações: ${e2.message}`);
  for (const o of (orgs ?? []) as { id: string; settings: Record<string, unknown> | null }[]) {
    const branding = (o.settings?.branding ?? null) as Record<string, unknown> | null;
    if (!branding) continue;
    const { neutros: _fora, ...resto } = branding;
    const { error } = await db
      .from("organizations")
      .update({ settings: { ...o.settings, branding: resto } } as never)
      .eq("id", o.id);
    if (error) throw new Error(`reset da organização ${o.id}: ${error.message}`);
  }
});

test("(1) sem escolha, a cara é a de sempre (quente) — claro e escuro", async ({ page, browser }) => {
  // A instalação volta ao default PELA TELA: o `beforeAll` já o gravou no banco,
  // mas a marca da instalação é memo do processo (TTL 30s, `instalacao.ts`) e o
  // health check do webServer a aqueceu antes do `beforeAll`. Só a Server Action
  // invalida o memo. `quente` é o default da coluna (not null) — é o "ausente".
  const dono = await browser.newPage();
  creds = await loginComoDono(dono, creds);
  await salvarNeutrosDaInstalacao(dono, "quente");
  await dono.close();

  creds = await loginComoAdmin(page, creds);
  for (const aparencia of ["claro", "escuro"] as const) {
    await emAparencia(page, aparencia, "/app/inbox");
    await afirmarPaleta(page, "quente", aparencia, "padrão");
    await page.screenshot({ path: evidencia(`1-quente-${aparencia}.png`), fullPage: true });
  }
});

test("(2) o dono escolhe CINZA na instalação → HTML do servidor já sai cinza", async ({ page }) => {
  creds = await loginComoDono(page, creds);
  await salvarNeutrosDaInstalacao(page, "cinza");

  // HTML do SERVIDOR, antes de qualquer JS: o atributo tem de estar lá.
  const html = await (await page.request.get("/login")).text();
  expect(html, "o <html> do servidor não leva data-neutros=cinza").toMatch(/<html[^>]*data-neutros="cinza"/);

  for (const aparencia of ["claro", "escuro"] as const) {
    await emAparencia(page, aparencia, "/admin/marca");
    await afirmarPaleta(page, "cinza", aparencia, "instalação");
    await page.screenshot({ path: evidencia(`2-instalacao-cinza-${aparencia}.png`), fullPage: true });
  }
});

test("(3) a empresa escolhe FRIO → em /app vence a da instalação, sem flash", async ({ page }) => {
  creds = await loginComoAdmin(page, creds);
  await salvarNeutrosDaEmpresa(page, "frio");

  for (const aparencia of ["claro", "escuro"] as const) {
    await emAparencia(page, aparencia, "/app/inbox");
    await afirmarPaleta(page, "frio", aparencia, "empresa");
    await page.screenshot({ path: evidencia(`3-empresa-frio-${aparencia}.png`), fullPage: true });
  }

  // ── O FLASH, medido ────────────────────────────────────────────────────────
  // Um observador instalado ANTES de qualquer script da página registra cada
  // troca de `data-neutros` com `performance.now()`, e um laço de rAF registra
  // a cor pintada do body a cada quadro. O que se reporta: quantos ms e quantos
  // quadros o body pintou com a paleta da INSTALAÇÃO antes da da empresa.
  await page.addInitScript(() => {
    const w = window as unknown as { __neutros: { t: number; v: string | null }[]; __quadros: { t: number; bg: string }[] };
    // O init script roda ANTES de o `<html>` existir: observa o documento todo
    // e registra cada valor NOVO de `data-neutros` (inclusive o do parser).
    w.__quadros = [];
    w.__neutros = [];
    const atual = () => document.documentElement?.getAttribute("data-neutros") ?? null;
    let ultimo: string | null | undefined;
    const registra = () => {
      if (!document.documentElement) return;
      const v = atual();
      if (v !== ultimo) {
        ultimo = v;
        w.__neutros.push({ t: performance.now(), v });
      }
    };
    new MutationObserver(registra).observe(document, {
      attributes: true,
      attributeFilter: ["data-neutros"],
      childList: true,
      subtree: true,
    });
    const laco = () => {
      if (document.body) w.__quadros.push({ t: performance.now(), bg: getComputedStyle(document.body).backgroundColor });
      if (performance.now() < 5_000) requestAnimationFrame(laco);
    };
    requestAnimationFrame(laco);
  });
  await emAparencia(page, "claro", "/app/inbox");
  await page.waitForFunction(() => performance.now() > 5_000);
  const flash = await page.evaluate(() => {
    const w = window as unknown as { __neutros: { t: number; v: string | null }[]; __quadros: { t: number; bg: string }[] };
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    return { trocas: w.__neutros, quadros: w.__quadros, fcp };
  });
  const frio = ESPERADO.frio.claro.pintado;
  const errados = flash.quadros.filter((q) => q.bg !== frio && q.bg !== "rgba(0, 0, 0, 0)");
  const primeiroFrio = flash.quadros.find((q) => q.bg === frio)?.t ?? null;
  const resumo = {
    fcp_ms: flash.fcp,
    trocas: flash.trocas.map((x) => `${x.v}@${x.t.toFixed(1)}ms`),
    quadros_com_paleta_errada: errados.length,
    primeiro_quadro_frio_ms: primeiroFrio,
    janela_do_flash_ms: errados.length ? (errados[errados.length - 1]!.t - errados[0]!.t).toFixed(1) : "0",
  };
  console.info(`[marca-neutros] FLASH ${JSON.stringify(resumo)}`);
  fs.writeFileSync(evidencia("flash.json"), JSON.stringify(resumo, null, 2));
  expect(flash.quadros.at(-1)?.bg, "o body não terminou na paleta da empresa").toBe(frio);
  // Zero quadros com a paleta da instalação: o layout de /app emite o
  // `scriptDosNeutros` no HTML, e a troca acontece no parse, antes da primeira
  // pintura. Antes dele, medido 112–144 ms (4–5 quadros) de paleta errada.
  expect(errados, `o body pintou ${errados.length} quadro(s) com outra paleta antes da da empresa`).toEqual([]);
});

test("(4) limpeza pela tela: empresa herda, instalação volta a quente", async ({ page, browser }) => {
  // Dois logins com TOTP: o helper espera a PRÓXIMA janela de 30 s quando o
  // código já foi usado (medido: 18,4 s num só login), e os 30 s padrão do
  // caso estouravam com todos os passos verdes.
  test.setTimeout(90_000);
  creds = await loginComoAdmin(page, creds);
  await salvarNeutrosDaEmpresa(page, "herdar");
  const outra = await browser.newPage();
  creds = await loginComoDono(outra, creds);
  await salvarNeutrosDaInstalacao(outra, "quente");
  await emAparencia(outra, "claro", "/admin/marca");
  await afirmarPaleta(outra, "quente", "claro", "depois da limpeza");
  await outra.close();
});
