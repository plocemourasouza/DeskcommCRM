/**
 * Anexo na inbox: a bolha assume o feedback do envio — provado pela tela.
 *
 * Antes, o diálogo de prévia ficava aberto durante o upload e a pessoa não via
 * nada na conversa; um upload que falhava sumia com o arquivo. Agora:
 *   1. Enviar fecha o diálogo e a bolha aparece em < 300 ms, com o indicador
 *      "Enviando" (medido no navegador, `performance.now()`).
 *   2. Sucesso → a bolha troca o indicador pelo de "Enviada" (status do canal
 *      simulado na resposta; ver abaixo).
 *   3. Falha (500 forçado no POST /api/v1/messages por interceptação de rota)
 *      → a bolha vira "Falhou" + "Tentar de novo", e a retentativa reenvia o
 *      MESMO arquivo (mesmo nome e mesmo tamanho chegam de novo ao upload).
 *   4. Depois de um refetch (o que o Realtime dispara), a bolha falha NÃO some:
 *      ela vive só no cache do cliente, e o refetch não pode apagá-la.
 *
 * O que é simulado, e por quê: o WAHA não existe no ambiente fresco, então o
 * "Enviada" do caso 2 vem da resposta do servidor com `status` reescrito para
 * `sent` (a requisição REAL vai ao servidor; só o status do canal é simulado).
 * O upload em `/media` é real (Storage local).
 *
 * Fixtures: canal, contato e conversa da organização do `agent`, criados no
 * `beforeAll` e apagados no `afterAll`.
 */
import { randomInt, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { test, expect, type Page, type Route } from "./helpers/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

interface E2ECreds {
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const creds = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8")) as E2ECreds;
const EVIDENCIA = path.join(process.cwd(), "evidence", "inbox-anexo-feedback");
const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, { auth: { persistSession: false } });

const SUFIXO = randomUUID().slice(0, 8);
let orgId = "";
let canal = "";
let contato = "";
let conversa = "";

/** Um PNG de 1×1 válido — o upload real o aceita. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function evidencia(nome: string): string {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  return path.join(EVIDENCIA, nome);
}

async function insere(tabela: string, valores: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(tabela).insert(valores).select("id").single();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return (data as { id: string }).id;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.agent!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

/** Abre a conversa e espera a LISTA de mensagens chegar (o cache que a bolha otimista usa). */
async function abrirConversa(page: Page): Promise<void> {
  const lista = page.waitForResponse(
    (r) => r.url().includes(`/api/v1/conversations/${conversa}/messages`) && r.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.goto(`/app/inbox/${conversa}`);
  await lista;
  await page.waitForURL(new RegExp(`/app/inbox\\?id=${conversa}`), { timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible({ timeout: 30_000 });
}

/**
 * Escolhe o arquivo, preenche a legenda e clica Enviar NO NAVEGADOR, medindo
 * de lá o tempo do clique até a bolha nova com "Enviando" existir no DOM.
 */
async function enviarAnexoMedindo(page: Page, legenda: string): Promise<number> {
  await page.getByRole("button", { name: "Anexar" }).click();
  await page.locator('input[type="file"][accept^="image"]').setInputFiles({
    name: `print-${SUFIXO}.png`,
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Legenda").fill(legenda);
  const linha = await page.evaluate(async (texto) => {
    const enviar = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (b) => b.textContent?.trim() === "Enviar",
    );
    if (!enviar) throw new Error("botão Enviar do diálogo não encontrado");
    // Linha do tempo: cada estado da bolha (rótulos de status dentro dela), com o ms desde o clique.
    const estados: { t: number; status: string }[] = [];
    const status = () => {
      const b = [...document.querySelectorAll('[data-testid="message-bubble"]')].find((x) =>
        x.textContent?.includes(texto),
      );
      if (!b) return "ausente";
      const rotulos = [...b.querySelectorAll("[aria-label]")]
        .map((e) => e.getAttribute("aria-label"))
        .filter((r) => ["Enviando", "Enviada", "Entregue", "Lida"].includes(r ?? ""));
      const falhou = b.textContent?.includes("Falhou") ? ["Falhou"] : [];
      return [...rotulos, ...falhou].join("+") || "sem-status";
    };
    const comDialogo = () => {
      const base = status();
      return document.querySelector('[role="dialog"]') ? `${base}|dialogo` : base;
    };
    const t0 = performance.now();
    let ultimo = "";
    const registra = () => {
      const s = comDialogo();
      if (s !== ultimo) {
        ultimo = s;
        estados.push({ t: performance.now() - t0, status: s });
      }
    };
    const obs = new MutationObserver(registra);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    enviar.click();
    registra();
    await new Promise((ok) => setTimeout(ok, 4_000));
    obs.disconnect();
    return estados;
  }, legenda);
  console.info(`[inbox-anexo-feedback] linha do tempo da bolha ${legenda} = ${JSON.stringify(linha)}`);
  const pendente = linha.find((e) => e.status.includes("Enviando"));
  if (!pendente) throw new Error(`a bolha nunca mostrou 'Enviando': ${JSON.stringify(linha)}`);
  const ms = pendente.t;
  linhaDoUltimoEnvio = linha;
  const fechou = linha.find((e) => !e.status.includes("|dialogo"));
  if (!fechou) throw new Error(`o diálogo não fechou: ${JSON.stringify(linha)}`);
  console.info(`[inbox-anexo-feedback] clique→diálogo fechado = ${fechou.t.toFixed(1)}ms`);
  expect(fechou.t, "o diálogo levou ≥300ms para fechar").toBeLessThan(300);
  return ms;
}

let linhaDoUltimoEnvio: { t: number; status: string }[] = [];

function bolha(page: Page, legenda: string) {
  return page.getByTestId("message-bubble").filter({ hasText: legenda });
}

// Sem `serial`: cada caso cria e mede o seu envio; um vermelho não cala os outros.
test.describe.configure({ mode: "default" });

test.beforeAll(async () => {
  const { data, error } = await db
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", creds.users.agent!.id)
    .limit(1)
    .single();
  if (error || !data) throw new Error(`org do agent: ${error?.message ?? "sem vínculo"}`);
  orgId = (data as { organization_id: string }).organization_id;
  canal = await insere("channel_sessions", {
    organization_id: orgId,
    waha_session_name: `anexo-${SUFIXO}`,
    display_name: `Canal anexo ${SUFIXO}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  });
  contato = await insere("contacts", {
    organization_id: orgId,
    name: `Cliente Anexo ${SUFIXO}`,
    phone_number: `+5511${randomInt(100000000, 1000000000)}`,
  });
  conversa = await insere("conversations", {
    organization_id: orgId,
    contact_id: contato,
    channel_session_id: canal,
    status: "open",
    last_message_at: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  if (conversa) await db.from("conversations").delete().eq("id", conversa);
  if (contato) await db.from("contacts").delete().eq("id", contato);
  if (canal) await db.from("channel_sessions").delete().eq("id", canal);
});

test("(1+2) bolha em <300ms com 'Enviando', depois 'Enviada'", async ({ page }) => {
  await login(page);
  await abrirConversa(page);

  // Segura o upload real 1,5s para o estado pendente ser observável e medível.
  await page.route(`**/api/v1/conversations/${conversa}/media`, async (r: Route) => {
    await new Promise((ok) => setTimeout(ok, 1_500));
    await r.continue();
  });
  // A requisição REAL vai ao servidor; só o status do canal (sem WAHA) é simulado.
  await page.route("**/api/v1/messages", async (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    const real = await r.fetch();
    const corpo = (await real.json()) as { data?: Record<string, unknown> };
    if (corpo.data) corpo.data.status = "sent";
    await r.fulfill({ response: real, json: corpo });
  });

  const legenda = `ok-${SUFIXO}`;
  const ms = await enviarAnexoMedindo(page, legenda);
  console.info(`[inbox-anexo-feedback] clique→bolha pendente = ${ms.toFixed(1)}ms`);
  expect(ms, "a bolha pendente demorou ≥300ms para aparecer").toBeLessThan(300);
  await page.screenshot({ path: evidencia("1-depois-do-envio-claro.png") });
  // "Enviada" veio da resposta com status simulado; o refetch seguinte traz o
  // status REAL do canal (sem WAHA: `failed`). Por isso a prova do sucesso é a
  // linha do tempo: depois de "Enviando", a bolha passou por "Enviada".
  expect(
    linhaDoUltimoEnvio.some((e) => e.t > ms && e.status.includes("Enviada")),
    `depois de 'Enviando' a bolha não passou por 'Enviada': ${JSON.stringify(linhaDoUltimoEnvio)}`,
  ).toBe(true);
  fs.writeFileSync(evidencia("medidas.json"), JSON.stringify({ clique_ate_bolha_ms: ms }, null, 2));
});

test("(1b) anexo enviado ANTES de a lista carregar também ganha bolha pendente", async ({ page }) => {
  // Medido em 2026-10-12: VERMELHO, intermitente na versão sem espera e
  // determinístico aqui. `onMutate` (`useSendMessage.ts`) faz `cancelQueries` e
  // depois `setQueryData(old => old ? … : old)`: sem a página em cache não há
  // onde pôr a bolha, o diálogo já fechou, e — se o envio falha — o arquivo some
  // sem "Tentar de novo". Aqui a primeira leitura da lista é segurada 3s.
  await login(page);
  await page.route(`**/api/v1/conversations/${conversa}/messages**`, async (r: Route) => {
    if (r.request().method() === "GET") await new Promise((ok) => setTimeout(ok, 3_000));
    await r.continue();
  });
  await interceptarEnvio(page, () => true);
  await page.goto(`/app/inbox/${conversa}`);
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible({ timeout: 30_000 });
  const legenda = `cedo-${SUFIXO}`;
  const ms = await enviarAnexoMedindo(page, legenda);
  console.info(`[inbox-anexo-feedback] (1b) clique→bolha pendente = ${ms.toFixed(1)}ms`);
  await expect(bolha(page, legenda).getByText("Falhou")).toBeVisible({ timeout: 15_000 });
  await expect(bolha(page, legenda).getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

/** Intercepta o envio: 500 enquanto `falhar()` for verdade; depois, servidor real com status do canal simulado. */
async function interceptarEnvio(page: Page, falhar: () => boolean): Promise<void> {
  await page.route("**/api/v1/messages", async (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    if (falhar()) {
      return r.fulfill({
        status: 500,
        json: { error: { code: "internal_error", message: "Falha simulada", request_id: "e2e" } },
      });
    }
    const real = await r.fetch();
    const corpo = (await real.json()) as { data?: Record<string, unknown> };
    if (corpo.data) corpo.data.status = "sent";
    await r.fulfill({ response: real, json: corpo });
  });
}

test("(3) 500 no envio → 'Falhou' + 'Tentar de novo', e a retentativa sobe o MESMO arquivo", async ({ page }) => {
  await login(page);
  await abrirConversa(page);

  const uploads: { nome: string | null; tamanho: number }[] = [];
  await page.route(`**/api/v1/conversations/${conversa}/media`, async (r: Route) => {
    const corpo = r.request().postDataBuffer();
    const nome = corpo?.toString("latin1").match(/filename="([^"]+)"/)?.[1] ?? null;
    uploads.push({ nome, tamanho: corpo?.length ?? 0 });
    await r.continue();
  });
  let falhar = true;
  await interceptarEnvio(page, () => falhar);

  const legenda = `falha-${SUFIXO}`;
  await enviarAnexoMedindo(page, legenda);
  const alvo = bolha(page, legenda);
  await expect(alvo.getByText("Falhou")).toBeVisible({ timeout: 15_000 });
  const tentar = alvo.getByRole("button", { name: "Tentar de novo" });
  await expect(tentar).toBeVisible();
  for (const tema of ["light", "dark"] as const) {
    await page.evaluate((v) => document.documentElement.setAttribute("data-theme", v), tema);
    await page.screenshot({ path: evidencia(`3-falhou-${tema === "light" ? "claro" : "escuro"}.png`) });
  }
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

  falhar = false;
  // Sem WAHA no ambiente fresco o servidor grava a mensagem e o canal a marca
  // `failed` — então a prova da retentativa é a REQUISIÇÃO, não o tique: o POST
  // real volta 2xx, o arquivo subido é o mesmo, e sobra UMA bolha (sem duplicar).
  const reenvio = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/messages") && r.request().method() === "POST",
    { timeout: 15_000 },
  );
  await tentar.click();
  const resposta = await reenvio;
  expect(resposta.status(), "o reenvio não chegou ao servidor com sucesso").toBeLessThan(300);
  await expect(alvo.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("message-bubble").filter({ hasText: legenda })).toHaveCount(1);
  console.info(`[inbox-anexo-feedback] uploads = ${JSON.stringify(uploads)}`);
  expect(uploads.length, "a retentativa não subiu o arquivo de novo").toBe(2);
  expect(uploads[1]!.nome, "a retentativa subiu outro arquivo").toBe(uploads[0]!.nome);
  expect(uploads[1]!.tamanho, "a retentativa subiu outro conteúdo").toBe(uploads[0]!.tamanho);
  await page.screenshot({ path: evidencia("4-reenviada-claro.png") });
});

test("(4) a bolha falha SOBREVIVE a um refetch da lista (foco da janela / Realtime)", async ({ page }) => {
  // Medido em 2026-10-12: VERMELHO. A bolha falha vive só no cache do cliente;
  // `onSettled` não invalida quando falha (`useSendMessage.ts`), mas o
  // `refetchOnWindowFocus: true` e o invalidate do Realtime
  // (`useMessagesRealtime.ts`) trocam as páginas pelas do servidor, que nunca
  // viu a mensagem — e ela some, junto com o "Tentar de novo".
  await login(page);
  await abrirConversa(page);
  await interceptarEnvio(page, () => true);

  const legenda = `refetch-${SUFIXO}`;
  await enviarAnexoMedindo(page, legenda);
  const alvo = bolha(page, legenda);
  await expect(alvo.getByText("Falhou")).toBeVisible({ timeout: 15_000 });

  // A pessoa troca de aba e volta: o mesmo evento que dispara o refetch no foco.
  const refetch = page.waitForResponse(
    (r) => r.url().includes(`/api/v1/conversations/${conversa}/messages`) && r.request().method() === "GET",
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await refetch;
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: evidencia("5-depois-do-refetch-claro.png") });
  await expect(alvo.getByText("Falhou"), "a bolha falha sumiu depois do refetch").toBeVisible();
  await expect(alvo.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

test("(5) botão de ação anuncia aria-busy enquanto age (Tarefas › Atualizar)", async ({ page }) => {
  // O `Button loading` mais simples de alcançar numa instalação fresca. A
  // listagem é segurada 1,5s pela interceptação para o estado ser observável.
  await login(page);
  await page.route("**/api/v1/tasks**", async (r: Route) => {
    if (r.request().method() === "GET") await new Promise((ok) => setTimeout(ok, 1_500));
    await r.continue();
  });
  await page.goto("/app/tasks");
  const atualizar = page.getByRole("button", { name: "Atualizar" });
  // (a) carga inicial
  await expect(atualizar).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
  await expect(atualizar).toBeDisabled();
  await page.screenshot({ path: evidencia("6-atualizar-ocupado-carga-inicial.png") });
  await expect(atualizar).not.toHaveAttribute("aria-busy", "true", { timeout: 10_000 });
  // (b) o clique da pessoa — a ação que o botão nomeia
  const busy = await page.evaluate(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Atualizar")!;
    const visto: string[] = [];
    const obs = new MutationObserver(() => visto.push(String(b.getAttribute("aria-busy"))));
    obs.observe(b, { attributes: true, attributeFilter: ["aria-busy"] });
    b.click();
    await new Promise((ok) => setTimeout(ok, 1_000));
    obs.disconnect();
    return { visto, agora: b.getAttribute("aria-busy") };
  });
  console.info(`[inbox-anexo-feedback] Atualizar clicado → aria-busy ${JSON.stringify(busy)}`);
  expect(busy.visto, "o clique em Atualizar não marcou aria-busy enquanto recarregava").toContain("true");
});
