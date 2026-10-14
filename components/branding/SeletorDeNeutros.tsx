"use client";

import { reguaDoProduto } from "@/lib/branding/regua-do-produto";
import { NEUTROS_DA_MARCA, type NeutrosDaMarca } from "@/lib/branding/schema";
import { useT } from "@/hooks/i18n/useT";

/**
 * A escolha da paleta de neutros (fundo, superficie, texto e borda). Compartilhada
 * pelas duas telas de marca: a da instalacao nao tem "herdar", a da organizacao tem.
 *
 * Radios nativos num `fieldset`: teclado e leitor de tela de graca. A amostra de
 * cada opcao sai da MESMA regua que mede o contraste (`reguaDoProduto`), entao o
 * que a pessoa ve e o que o servidor vai validar — sem hex repetido aqui.
 */

const ROTULO: Record<NeutrosDaMarca, string> = {
  quente: "Quente (padrão)",
  cinza: "Cinza",
  frio: "Frio",
};

const DESCRICAO: Record<NeutrosDaMarca, string> = {
  quente: "Fundos e textos com um leve tom de areia, o visual de sempre.",
  cinza: "Cinza puro, sem puxar para nenhuma cor.",
  frio: "Cinza azulado, mais técnico e limpo.",
};

/** `null` = herdar (só a organização). */
export type EscolhaDeNeutros = NeutrosDaMarca | null;

export function SeletorDeNeutros({
  id,
  valor,
  onChange,
  herdado,
}: {
  /** Prefixo dos ids e do `name` dos radios — duas telas, dois grupos. */
  readonly id: string;
  readonly valor: EscolhaDeNeutros;
  readonly onChange: (v: EscolhaDeNeutros) => void;
  /**
   * Presente só na tela da organização: a paleta da instalação, que vale quando
   * ela não escolhe. Ausente = a tela da instalação, onde sempre há uma escolha.
   */
  readonly herdado?: NeutrosDaMarca;
}) {
  const t = useT();
  const opcoes: readonly EscolhaDeNeutros[] =
    herdado === undefined ? NEUTROS_DA_MARCA : [null, ...NEUTROS_DA_MARCA];
  const atual = valor ?? (herdado === undefined ? "quente" : null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">{t("Cores de fundo e texto")}</legend>
      <p id={`${id}-ajuda`} className="text-xs text-text-muted">
        {t("A paleta neutra do sistema: fundos, cartões, bordas e textos. A cor da marca vem por cima dela.")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-describedby={`${id}-ajuda`}>
        {opcoes.map((opcao) => {
          const efetiva: NeutrosDaMarca = opcao ?? herdado ?? "quente";
          const base = reguaDoProduto(efetiva).claro.base;
          const rotulo = opcao === null ? t("Usar a da instalação") : t(ROTULO[opcao]);
          const descricao =
            opcao === null
              ? `${t("Hoje: ")}${t(ROTULO[efetiva])}`
              : t(DESCRICAO[opcao]);
          const marcado = atual === opcao;
          return (
            <label
              key={opcao ?? "herdar"}
              htmlFor={`${id}-${opcao ?? "herdar"}`}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                marcado ? "border-accent bg-surface-elevated" : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                id={`${id}-${opcao ?? "herdar"}`}
                name={id}
                checked={marcado}
                onChange={() => onChange(opcao)}
                className="mt-1"
              />
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-text">{rotulo}</span>
                <span className="text-xs text-text-muted">{descricao}</span>
              </span>
              <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-sm border border-border">
                {base.map((b) => (
                  <span key={b.chave} className="h-6 w-4" style={{ backgroundColor: b.hex }} />
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
