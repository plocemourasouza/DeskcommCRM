/**
 * O "+" da inbox manda VÁRIOS arquivos de uma vez — provado pela tela.
 *
 * A pessoa abre o "+", escolhe duas fotos no seletor do sistema (aqui,
 * `setInputFiles` com dois arquivos no input de Fotos e vídeos), escreve uma
 * legenda e clica Enviar. Medido:
 *   1. O diálogo de prévia lista as duas, na ordem da escolha.
 *   2. Enviar fecha o diálogo e o fio ganha DUAS bolhas, na ordem da escolha,
 *      com a legenda só na primeira. A ordem é medida pela PRÓPRIA imagem na
 *      bolha (`naturalWidth`: a primeira foto tem 120 px de largura, a segunda 160),
 *      não por rótulo que o teste escreve.
 *   3. As requisições confirmam: o POST de cada arquivo sai em sequência, e só
 *      o primeiro leva `body`.
 *   4. Se o envio do primeiro falha, o segundo NÃO sai e a bolha dele explica
 *      por quê ("Não saiu porque o arquivo anterior falhou.").
 *
 * O que é simulado, e por quê: sem WAHA no ambiente fresco, o caso de sucesso
 * reescreve só o `status` da resposta para `sent` (a requisição REAL vai ao
 * servidor, o upload em `/media` é real no Storage local); o caso de falha
 * responde 500 ao POST /api/v1/messages por interceptação.
 *
 * Fixtures: canal, contato e conversa da organização do `agent`, criados no
 * `beforeAll` e apagados no `afterAll` — como em `inbox-anexo-feedback.spec.ts`.
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
const EVIDENCIA = path.join(process.cwd(), "evidence", "inbox-varios-anexos");
const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, { auth: { persistSession: false } });

const SUFIXO = randomUUID().slice(0, 8);
let orgId = "";
let canal = "";
let contato = "";
let conversa = "";

/** Duas fotos PNG válidas e DISTINGUÍVEIS pela largura: 120×80 (vermelha) e 160×120 (azul). */
const FOTO_1 = {
  name: `primeira-${SUFIXO}.png`,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAgklEQVR42u3QMQ0AAAgDsMmZfz2IwQXhaFIFzbQciALRohEtWrQF0aIRLVq0BdGiES1aNKJFI1q0aESLRrRo0YgWjWjRohEtGtGiRSNaNKJFi0a0aESLFo1o0YgWLRrRohEtWjSiRSNatGhEi0a0aNGIFo1o0aIRLRrRokUjWjSi/1hmuvSGJLSncgAAAABJRU5ErkJggg==",
    "base64",
  ),
};
const FOTO_2 = {
  name: `segunda-${SUFIXO}.png`,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAAAzklEQVR42u3RAQ0AAAjDsMtBDv6DGHw8TaZgzeypuFgAWIAFWIAFWIAFGLAAC7AAC7AACzBgARZgARZgARZgAQYswAIswAIswAIMWIAFWIAFWIAFGLAAC7AAC7AAC7AAAxZgARZgARZgAQYswAIswAIswAIM2AXAAizAAizAAizAgAVYgAVYgAVYgAELsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAgAVYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmDALjT30fShzqoIEYkAAAAASUVORK5CYII=",
    "base64",
  ),
};

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
}

/** "+" → Fotos e vídeos com as DUAS fotos → legenda → Enviar. Devolve o diálogo (já fechado). */
async function escolherDuasEEnviar(page: Page, legenda: string, foto: string): Promise<void> {
  await page.getByRole("button", { name: "Anexar" }).click();
  await page.locator('input[type="file"][accept^="image"]').setInputFiles([FOTO_1, FOTO_2]);
  const dialogo = page.getByRole("dialog", { name: "Enviar anexo" });
  await expect(dialogo).toBeVisible();
  // A capa e a miniatura, na ordem da escolha, medidas pela imagem que carregou.
  const larguras = await dialogo.locator("img").evaluateAll(async (imgs) => {
    await Promise.all(
      (imgs as HTMLImageElement[]).map((i) => (i.complete ? null : new Promise((ok) => (i.onload = ok)))),
    );
    return (imgs as HTMLImageElement[]).map((i) => ({ alt: i.alt, largura: i.naturalWidth }));
  });
  expect(larguras).toEqual([
    { alt: FOTO_1.name, largura: 120 },
    { alt: FOTO_2.name, largura: 160 },
  ]);
  await dialogo.getByLabel("Legenda").fill(legenda);
  await page.screenshot({ path: evidencia(foto) });
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 5_000 });
}

/** As duas bolhas da leva: a da legenda e a IMEDIATAMENTE seguinte no fio. */
async function bolhasDaLeva(page: Page, legenda: string) {
  const todas = page.getByTestId("message-bubble");
  await expect(todas.filter({ hasText: legenda })).toHaveCount(1, { timeout: 15_000 });
  const textos = await todas.allTextContents();
  const i = textos.findIndex((t) => t.includes(legenda));
  expect(i, "a bolha da legenda não está no fio").toBeGreaterThanOrEqual(0);
  expect(textos.length, "falta a bolha seguinte à da legenda").toBeGreaterThan(i + 1);
  return { primeira: todas.nth(i), segunda: todas.nth(i + 1), textos: [textos[i]!, textos[i + 1]!] };
}

/** Largura natural da imagem dentro da bolha (rola até ela: a imagem é `loading="lazy"`). */
async function larguraDaImagem(bolha: ReturnType<Page["getByTestId"]>): Promise<number> {
  await bolha.scrollIntoViewIfNeeded();
  const img = bolha.locator("img").first();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  return img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
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
    waha_session_name: `varios-${SUFIXO}`,
    display_name: `Canal vários anexos ${SUFIXO}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  });
  contato = await insere("contacts", {
    organization_id: orgId,
    name: `Cliente Vários ${SUFIXO}`,
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

test("(1) duas fotos pelo \"+\": duas bolhas na ordem da escolha, legenda só na primeira", async ({ page }) => {
  await login(page);
  await abrirConversa(page);

  const envios: { body: unknown; media_size_bytes: unknown }[] = [];
  await page.route("**/api/v1/messages", async (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    const pedido = r.request().postDataJSON() as { body?: unknown; media_size_bytes?: unknown };
    envios.push({ body: pedido.body ?? null, media_size_bytes: pedido.media_size_bytes ?? null });
    const real = await r.fetch();
    const corpo = (await real.json()) as { data?: Record<string, unknown> };
    if (corpo.data) corpo.data.status = "sent";
    await r.fulfill({ response: real, json: corpo });
  });

  const legenda = `duas-${SUFIXO}`;
  await escolherDuasEEnviar(page, legenda, "1-dialogo-com-as-duas.png");

  const { primeira, segunda, textos } = await bolhasDaLeva(page, legenda);
  expect(textos[1], "a legenda apareceu também na segunda bolha").not.toContain(legenda);
  expect(await larguraDaImagem(primeira), "a primeira bolha não é a primeira foto").toBe(120);
  expect(await larguraDaImagem(segunda), "a segunda bolha não é a segunda foto").toBe(160);
  await expect.poll(() => envios.length, { timeout: 15_000 }).toBe(2);
  console.info(`[inbox-varios-anexos] envios = ${JSON.stringify(envios)}`);
  expect(envios[0]!.body).toBe(legenda);
  expect(envios[1]!.body).toBeNull();
  expect(envios[0]!.media_size_bytes).toBe(FOTO_1.buffer.length);
  expect(envios[1]!.media_size_bytes).toBe(FOTO_2.buffer.length);
  await segunda.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidencia("2-duas-bolhas-na-ordem.png") });
});

test("(2) o primeiro falha: o segundo não sai e a bolha dele diz por quê", async ({ page }) => {
  await login(page);
  await abrirConversa(page);

  let posts = 0;
  await page.route("**/api/v1/messages", async (r: Route) => {
    if (r.request().method() !== "POST") return r.continue();
    posts += 1;
    return r.fulfill({
      status: 500,
      json: { error: { code: "internal_error", message: "Falha simulada", request_id: "e2e" } },
    });
  });

  const legenda = `falha-${SUFIXO}`;
  await escolherDuasEEnviar(page, legenda, "3-dialogo-antes-da-falha.png");

  const { primeira, segunda, textos } = await bolhasDaLeva(page, legenda);
  expect(textos[1]).not.toContain(legenda);
  await expect(primeira.getByText("Falhou")).toBeVisible({ timeout: 15_000 });
  await expect(segunda.getByText("Falhou")).toBeVisible({ timeout: 15_000 });
  await expect(primeira.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await expect(segunda.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  expect(await larguraDaImagem(primeira)).toBe(120);
  expect(await larguraDaImagem(segunda)).toBe(160);
  expect(posts, "o segundo arquivo saiu depois de o primeiro falhar").toBe(1);

  await segunda.getByText("Falhou").hover();
  await expect(page.getByRole("tooltip")).toContainText("Não saiu porque o arquivo anterior falhou.");
  await page.screenshot({ path: evidencia("4-segunda-nao-saiu.png") });
});
