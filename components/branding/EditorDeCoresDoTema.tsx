"use client";

import { useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import type { ConferenciaDasCores } from "@/lib/branding/cores-do-tema";
import { lerCorCss } from "@/lib/branding/contraste";
import { ALIASES_DAS_CORES } from "@/lib/branding/css";
import { frasesDasReprovas, NOME_DO_PAPEL } from "@/lib/branding/linguagem";
import { ehHexValido, normalizarHex } from "@/lib/branding/rampa";
import type {
  CoresDeUmTema,
  CoresDoTema,
  TemaDasCores,
  TokenDeCorDoTema,
} from "@/lib/branding/schema";

type Valores = Record<TemaDasCores, Record<TokenDeCorDoTema, string>>;

/** As linhas da tabela, agrupadas como quem olha a tela pensa nelas. */
const GRUPOS: readonly { readonly titulo: string; readonly tokens: readonly TokenDeCorDoTema[] }[] = [
  { titulo: "Superfícies", tokens: ["bg", "surface", "surface-elevated"] },
  { titulo: "Textos", tokens: ["text", "text-muted", "text-subtle"] },
  { titulo: "Bordas", tokens: ["border", "border-strong"] },
  {
    titulo: "Avisos",
    tokens: [
      "success",
      "success-bg",
      "success-fg",
      "warning",
      "warning-bg",
      "warning-fg",
      "error",
      "error-bg",
      "error-fg",
      "info",
      "info-bg",
      "info-fg",
    ],
  },
];

const TEMAS: readonly TemaDasCores[] = ["claro", "escuro"];

/** Um hex que o `<input type="color">` aceita, a partir de qualquer cor CSS do tema. */
function hexDoSeletor(valor: string): string {
  return lerCorCss(valor)?.hex ?? "#808080";
}

/**
 * O que um rascunho digitado significa: vazio = "volte ao herdado", hex válido
 * (#rgb ou #rrggbb, qualquer caixa) = a cor normalizada, resto = inválido.
 */
function lerRascunho(texto: string): { valido: boolean; hex: string | null } {
  const limpo = texto.trim();
  if (limpo.length === 0) return { valido: true, hex: null };
  if (!ehHexValido(limpo)) return { valido: false, hex: null };
  return { valido: true, hex: normalizarHex(limpo).toLowerCase() };
}

/**
 * As variáveis do tema INLINE numa amostra: todas as vinte (o que a trava
 * mediu, não só o que foi escolhido) mais os apelidos do shadcn, que precisam
 * ser redeclarados para resolver contra os valores daqui.
 */
function estiloDaAmostra(
  valores: Record<TokenDeCorDoTema, string>,
  accent: { readonly accent: string; readonly accentFg: string } | null,
): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [token, valor] of Object.entries(valores)) vars[`--color-${token}`] = valor;
  for (const [nome, valor] of ALIASES_DAS_CORES) vars[nome] = valor;
  if (accent) {
    vars["--color-accent"] = accent.accent;
    vars["--color-accent-fg"] = accent.accentFg;
  }
  return vars as CSSProperties;
}

/**
 * Uma amostra de UM tema com as cores do formulário: página, cartão, área em
 * destaque, os três textos, as bordas, o botão e os quatro avisos. É
 * `data-theme` de verdade (a subárvore pega o resto dos tokens do tema certo)
 * com as cores daqui por cima, inline.
 */
function AmostraDasCores({
  tema,
  valores,
  accent,
}: {
  readonly tema: TemaDasCores;
  readonly valores: Record<TokenDeCorDoTema, string>;
  readonly accent: { readonly accent: string; readonly accentFg: string } | null;
}) {
  const t = useT();
  return (
    <div
      data-previa-das-cores={tema}
      data-theme={tema === "escuro" ? "dark" : "light"}
      aria-hidden="true"
      style={estiloDaAmostra(valores, accent)}
      className="space-y-2 rounded-lg border border-border bg-bg p-3"
    >
      <div className="space-y-2 rounded-md border border-border bg-surface p-3">
        <p className="text-sm font-semibold text-text">{t("Quem atende bem, vende melhor.")}</p>
        <p className="text-xs text-text-muted">{t("Texto secundário")}</p>
        <p className="text-xs text-text-subtle">{t("Texto apagado")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium"
            style={{ color: "var(--color-accent-fg)" }}
          >
            {t("Salvar")}
          </span>
          <span className="rounded-md border border-border-strong bg-surface-elevated px-2 py-1 text-xs text-text">
            {t("Áreas em destaque")}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(["success", "warning", "error", "info"] as const).map((aviso) => (
          <span
            key={aviso}
            className="rounded-sm px-2 py-1 text-xs font-medium"
            style={{
              backgroundColor: `var(--color-${aviso}-bg)`,
              color: `var(--color-${aviso}-fg)`,
              borderLeft: `3px solid var(--color-${aviso})`,
            }}
          >
            {t(NOME_DO_PAPEL[`--color-${aviso}`] ?? "")}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * "Cores do tema": o fundo, os cartões, os textos, as bordas e as cores de
 * aviso, separados por tema — editáveis LIVREMENTE, com a trava de contraste
 * ao lado (decisão do dono do produto, 2026-10-15).
 *
 * O componente não decide nada sobre contraste: quem mede é `conferirCores`,
 * no formulário (a MESMA função que a server action roda de novo). Aqui só se
 * mostra a lista do que falhou e se devolve a escolha, com a informação de que
 * há um rascunho inválido — o formulário desliga o Salvar nos dois casos.
 *
 * `<details>` nativo para recolher: teclado e leitor de tela sem nada a mais.
 * Abre sozinho quando a camada já tem cor escolhida ou quando algo reprova.
 */
export function EditorDeCoresDoTema({
  id,
  valor,
  onChange,
  herdadas,
  origemDoHerdado,
  efetivas,
  accent,
  conferencia,
}: {
  readonly id: string;
  /** O que ESTA camada escolheu — esparso. */
  readonly valor: CoresDoTema;
  /** `rascunhoValido=false` = há um campo com texto que não é cor. */
  readonly onChange: (cores: CoresDoTema, rascunhoValido: boolean) => void;
  /** O que vale sem esta camada, token a token — vira o placeholder. */
  readonly herdadas: Valores;
  /** De onde vem o herdado, já em português ("de quem instalou o sistema"). */
  readonly origemDoHerdado: string;
  /** O que vai pintar, token a token — o que a amostra mostra e a trava mede. */
  readonly efetivas: Valores;
  readonly accent: Record<TemaDasCores, { accent: string; accentFg: string }> | null;
  readonly conferencia: ConferenciaDasCores;
}) {
  const t = useT();
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const temEscolha = TEMAS.some((tema) => Object.keys(valor[tema] ?? {}).length > 0);
  const frases = frasesDasReprovas(conferencia.reprovas, t);

  function aplicar(tema: TemaDasCores, token: TokenDeCorDoTema, texto: string) {
    const chave = `${tema}|${token}`;
    const proximos = { ...rascunhos, [chave]: texto };
    setRascunhos(proximos);
    const lido = lerRascunho(texto);
    const doTema: CoresDeUmTema = { ...(valor[tema] ?? {}) };
    if (lido.valido) {
      if (lido.hex === null) delete doTema[token];
      else doTema[token] = lido.hex;
    }
    const novo: CoresDoTema = { ...valor, [tema]: doTema };
    if (Object.keys(doTema).length === 0) delete novo[tema];
    const todosValidos = Object.values(proximos).every((r) => lerRascunho(r).valido);
    onChange(novo, todosValidos);
  }

  function voltarTudo() {
    setRascunhos({});
    onChange({}, true);
  }

  return (
    <details id={id} open={temEscolha || !conferencia.passa} className="group space-y-4">
      <summary className="cursor-pointer list-none text-base font-semibold tracking-tight text-text">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        {t("Cores do tema")}
      </summary>

      <p className="text-sm text-text-muted">
        {t(
          "Escolha o fundo, os cartões, os textos, as bordas e as cores de aviso, separados para o modo claro e o escuro. Campo vazio usa a cor",
        )}{" "}
        {origemDoHerdado}.{" "}
        {t(
          "Se alguma combinação ficar difícil de ler, o sistema mostra qual é e não deixa salvar até ajustar.",
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {TEMAS.map((tema) => (
          <section key={tema} aria-labelledby={`${id}-${tema}`} className="space-y-3">
            <h3 id={`${id}-${tema}`} className="text-sm font-semibold text-text">
              {tema === "claro" ? t("Modo claro") : t("Modo escuro")}
            </h3>
            <AmostraDasCores tema={tema} valores={efetivas[tema]} accent={accent?.[tema] ?? null} />
            {GRUPOS.map((grupo) => (
              <fieldset key={grupo.titulo} className="space-y-1.5">
                <legend className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                  {t(grupo.titulo)}
                </legend>
                {grupo.tokens.map((token) => {
                  const chave = `${tema}|${token}`;
                  const escolhido = valor[tema]?.[token];
                  const texto = rascunhos[chave] ?? escolhido ?? "";
                  const valido = lerRascunho(texto).valido;
                  const herdado = herdadas[tema][token];
                  const nome = t(NOME_DO_PAPEL[`--color-${token}`] ?? token);
                  const campo = `${id}-${tema}-${token}`;
                  return (
                    <div
                      key={token}
                      data-cor-do-tema={`${tema}:${token}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <label
                        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-sm border border-border-strong"
                        style={{ backgroundColor: efetivas[tema][token] }}
                      >
                        <span className="sr-only">
                          {t("Escolher a cor visualmente")}: {nome}
                        </span>
                        <input
                          type="color"
                          value={hexDoSeletor(escolhido ?? herdado)}
                          onChange={(e) => aplicar(tema, token, e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                      <label htmlFor={campo} className="min-w-32 flex-1 text-sm text-text">
                        {nome}
                      </label>
                      <Input
                        id={campo}
                        value={texto}
                        onChange={(e) => aplicar(tema, token, e.target.value)}
                        placeholder={herdado}
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={!valido}
                        className="h-8 w-28 font-mono text-xs"
                      />
                      {escolhido !== undefined || (rascunhos[chave] ?? "").length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => aplicar(tema, token, "")}
                        >
                          {t("Voltar ao padrão")}
                        </Button>
                      ) : null}
                      {!valido ? (
                        <span className="basis-full text-xs text-error-fg">
                          {t("Use um código de cor como #7a5cd6.")}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </section>
        ))}
      </div>

      <div role="status" aria-live="polite" data-trava-das-cores={conferencia.passa ? "passa" : "reprova"}>
        {conferencia.passa ? (
          <p className="text-sm text-text-muted">
            {t("Todas as combinações de texto e fundo estão fáceis de ler, nos dois modos.")}
          </p>
        ) : (
          <div className="space-y-1.5 rounded-md border border-error bg-error-bg p-3">
            <p className="text-sm font-semibold text-error-fg">
              {t("Não dá para salvar ainda: estas combinações ficam difíceis de ler.")}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-error-fg">
              {frases.map((frase) => (
                <li key={frase}>{frase}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-xs text-text-muted">
          {t(
            "Texto apagado e bordas não entram nessa conta: o próprio sistema os usa bem suaves, só para separar e sugerir.",
          )}
        </p>
      </div>

      {temEscolha ? (
        <Button type="button" variant="outline" size="sm" onClick={voltarTudo}>
          {t("Voltar todas as cores do tema ao padrão")}
        </Button>
      ) : null}
    </details>
  );
}
