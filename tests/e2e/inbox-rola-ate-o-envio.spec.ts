/**
 * O fio rola até a bolha que a própria pessoa acabou de enviar — provado pela tela.
 *
 * Medido em 2026-10-19 na prévia local: depois de enviar um anexo cujo upload
 * falhou, a bolha otimista (status `failed`) ficou em top=757px, abaixo da
 * dobra; a última bolha visível era a mensagem anterior. Quem envia não via o
 * "Falhou" nem o "Tentar de novo".
 *
 * Os casos medem, por `getBoundingClientRect` contra o retângulo do scroller,
 * se a bolha nova está DENTRO da área visível do fio depois do envio:
 *   1. anexo (imagem) com o upload em 500 — a bolha que motivou isto. Antes da
 *      correção: fio 268px aquém do fim, bolha de 516 a 797 num scroller que
 *      termina em 541;
 *   2. texto curto com o envio em 500. Antes da correção TAMBÉM ficava fora:
 *      a bolha nasce com 71px e, ao ganhar "Falhou · Tentar de novo", passa a
 *      91px — o fio ficava 31px aquém do fim (medido com a bolha ainda
 *      `queued` à vista, e a mesma bolha fora depois de falhar).
 *
 * Fixtures: canal, contato, conversa e 30 mensagens de texto (fio mais alto
 * que a janela, para haver o que rolar), da organização do `agent`, criados no
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
const EVIDENCIA = path.join(process.cwd(), "evidence", "inbox-rola-ate-o-envio");
const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, { auth: { persistSession: false } });

const SUFIXO = randomUUID().slice(0, 8);
let orgId = "";
let canal = "";
let contato = "";
let conversa = "";

/** PNG 160×120 válido: a bolha de imagem mede ~200px, acima da guarda de 120px do fio. */
const FOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAAzklEQVR42u3RAQ0AAAjDsMtBDv6DGHw8TaZgzeypuFgAWIAFWIAFWIAFGLAAC7AAC7AACzBgARZgARZgARZgAQYswAIswAIswAIMWIAFWIAFWIAFGLAAC7AAC7AAC7AAAxZgARZgARZgAQYswAIswAIswAIM2AXAAizAAizAAizAgAVYgAVYgAVYgAELsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAgAVYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmDALjT30fShzqoIEYkAAAAASUVORK5CYII=",
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

async function abrirConversa(page: Page): Promise<void> {
  const lista = page.waitForResponse(
    (r) => r.url().includes(`/api/v1/conversations/${conversa}/messages`) && r.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.goto(`/app/inbox/${conversa}`);
  await lista;
  await page.waitForURL(new RegExp(`/app/inbox\\?id=${conversa}`), { timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Mensagem" })).toBeVisible({ timeout: 30_000 });
  // A abertura ancora no fim: a última mensagem semeada está na tela.
  await expect(page.getByTestId("message-bubble").filter({ hasText: `semente 30 ${SUFIXO}` })).toBeInViewport({
    timeout: 15_000,
  });
}

interface Medida {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  distanciaDoFim: number;
  bolhaTopo: number;
  bolhaBase: number;
  scrollerTopo: number;
  scrollerBase: number;
  dentro: boolean;
}

/** Mede o scroller do fio e a bolha que contém `texto` (ou a última bolha, se `texto` for null). */
async function medir(page: Page, texto: string | null): Promise<Medida> {
  return page.evaluate((alvo) => {
    const bolhas = [...document.querySelectorAll<HTMLElement>('[data-testid="message-bubble"]')];
    const bolha = alvo ? bolhas.find((b) => b.textContent?.includes(alvo)) : bolhas.at(-1);
    if (!bolha) throw new Error(`bolha não encontrada: ${alvo}`);
    let sc: HTMLElement | null = bolha.parentElement;
    while (sc && !(getComputedStyle(sc).overflowY === "auto" && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
    if (!sc) throw new Error("scroller do fio não encontrado");
    const b = bolha.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    return {
      scrollTop: Math.round(sc.scrollTop),
      scrollHeight: sc.scrollHeight,
      clientHeight: sc.clientHeight,
      distanciaDoFim: Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight),
      bolhaTopo: Math.round(b.top),
      bolhaBase: Math.round(b.bottom),
      scrollerTopo: Math.round(s.top),
      scrollerBase: Math.round(s.bottom),
      dentro: b.top >= s.top - 1 && b.bottom <= s.bottom + 1,
    };
  }, texto);
}

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
    waha_session_name: `rola-${SUFIXO}`,
    display_name: `Canal rola ${SUFIXO}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  });
  contato = await insere("contacts", {
    organization_id: orgId,
    name: `Cliente Rola ${SUFIXO}`,
    phone_number: `+5511${randomInt(100000000, 1000000000)}`,
  });
  conversa = await insere("conversations", {
    organization_id: orgId,
    contact_id: contato,
    channel_session_id: canal,
    status: "open",
    last_message_at: new Date().toISOString(),
  });
  const agora = Date.now();
  const sementes = Array.from({ length: 30 }, (_, i) => {
    const quando = new Date(agora - (30 - i) * 60_000).toISOString();
    return {
      organization_id: orgId,
      conversation_id: conversa,
      channel_session_id: canal,
      contact_id: contato,
      type: "text",
      direction: i % 2 === 0 ? "inbound" : "outbound",
      status: i % 2 === 0 ? "received" : "sent",
      body: `semente ${i + 1} ${SUFIXO}`,
      external_id: `rola-${SUFIXO}-${i + 1}`,
      sent_at: quando,
      created_at: quando,
    };
  });
  const { error: erroMsgs } = await db.from("messages").insert(sementes);
  if (erroMsgs) throw new Error(`messages: ${erroMsgs.message}`);
});

test.afterAll(async () => {
  if (conversa) await db.from("messages").delete().eq("conversation_id", conversa);
  if (conversa) await db.from("conversations").delete().eq("id", conversa);
  if (contato) await db.from("contacts").delete().eq("id", contato);
  if (canal) await db.from("channel_sessions").delete().eq("id", canal);
});

test("(1) anexo com upload em 500: a bolha 'Falhou' fica à vista no fio", async ({ page }) => {
  await login(page);
  await abrirConversa(page);
  await page.route(`**/api/v1/conversations/${conversa}/media`, (r: Route) =>
    r.fulfill({ status: 500, json: { error: { code: "internal_error", message: "Falha simulada", request_id: "e2e" } } }),
  );
  const antes = await medir(page, null);

  const legenda = `anexo-${SUFIXO}`;
  await page.getByRole("button", { name: "Anexar" }).click();
  await page.locator('input[type="file"][accept^="image"]').setInputFiles({
    name: `foto-${SUFIXO}.png`,
    mimeType: "image/png",
    buffer: FOTO,
  });
  const dialogo = page.getByRole("dialog", { name: "Enviar anexo" });
  await dialogo.getByLabel("Legenda").fill(legenda);
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  const alvo = page.getByTestId("message-bubble").filter({ hasText: legenda });
  await expect(alvo.getByText("Falhou")).toBeAttached({ timeout: 15_000 });
  // Dá tempo à rolagem suave terminar antes de medir.
  await page.waitForTimeout(1_500);
  const depois = await medir(page, legenda);
  console.info(`[inbox-rola-ate-o-envio] (1) antes=${JSON.stringify(antes)} depois=${JSON.stringify(depois)}`);
  await page.screenshot({ path: evidencia("1-anexo-falhou.png") });
  expect(depois.dentro, `a bolha do anexo ficou fora da área visível do fio: ${JSON.stringify(depois)}`).toBe(true);
  await expect(alvo.getByRole("button", { name: "Tentar de novo" })).toBeInViewport();
});

test("(2) texto com envio em 500: a bolha que cresce ao falhar fica à vista", async ({ page }) => {
  await login(page);
  await abrirConversa(page);
  await page.route("**/api/v1/messages", async (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    return r.fulfill({ status: 500, json: { error: { code: "internal_error", message: "Falha simulada", request_id: "e2e" } } });
  });
  const texto = `texto-${SUFIXO}`;
  await page.getByRole("textbox", { name: "Mensagem" }).fill(texto);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const alvo = page.getByTestId("message-bubble").filter({ hasText: texto });
  await expect(alvo.getByText("Falhou")).toBeAttached({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  const depois = await medir(page, texto);
  console.info(`[inbox-rola-ate-o-envio] (2) depois=${JSON.stringify(depois)}`);
  await page.screenshot({ path: evidencia("2-texto-falhou.png") });
  expect(depois.dentro, `a bolha do texto ficou fora da área visível do fio: ${JSON.stringify(depois)}`).toBe(true);
});
