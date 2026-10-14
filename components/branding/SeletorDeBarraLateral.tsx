"use client";

import { useT } from "@/hooks/i18n/useT";
import {
  BARRAS_LATERAIS_DA_MARCA,
  type BarraLateralDaMarca,
} from "@/lib/branding/schema";

const ROTULO: Record<BarraLateralDaMarca, string> = {
  padrao: "Padrão",
  escura: "Sempre escura",
};

const DESCRICAO: Record<BarraLateralDaMarca, string> = {
  padrao: "O menu lateral acompanha o modo claro ou escuro.",
  escura: "O menu lateral fica escuro, mesmo no modo claro.",
};

/** `null` = a organização não escolheu e vale a escolha da instalação. */
export type EscolhaDeBarraLateral = BarraLateralDaMarca | null;

/** Mesma anatomia de `SeletorDeNeutros`; ver lá o porquê dos radios nativos. */
export function SeletorDeBarraLateral({
  id,
  valor,
  onChange,
  herdado,
}: {
  readonly id: string;
  readonly valor: EscolhaDeBarraLateral;
  readonly onChange: (v: EscolhaDeBarraLateral) => void;
  /** Presente só na tela da organização: a barra da instalação. */
  readonly herdado?: BarraLateralDaMarca;
}) {
  const t = useT();
  const opcoes: readonly EscolhaDeBarraLateral[] =
    herdado === undefined ? BARRAS_LATERAIS_DA_MARCA : [null, ...BARRAS_LATERAIS_DA_MARCA];
  const atual = valor ?? (herdado === undefined ? "padrao" : null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">{t("Menu lateral")}</legend>
      <p id={`${id}-ajuda`} className="text-xs text-text-muted">
        {t("Escolha se o menu lateral segue o modo claro ou escuro, ou se fica sempre escuro.")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-describedby={`${id}-ajuda`}>
        {opcoes.map((opcao) => {
          const efetiva: BarraLateralDaMarca = opcao ?? herdado ?? "padrao";
          const rotulo = opcao === null ? t("Usar o padrão da instalação") : t(ROTULO[opcao]);
          const descricao =
            opcao === null ? `${t("Hoje: ")}${t(ROTULO[efetiva])}` : t(DESCRICAO[opcao]);
          const marcado = atual === opcao;
          const chave = opcao ?? "herdar";
          return (
            <label
              key={chave}
              htmlFor={`${id}-${chave}`}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                marcado ? "border-accent bg-surface-elevated" : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                id={`${id}-${chave}`}
                name={id}
                checked={marcado}
                onChange={() => onChange(opcao)}
                className="mt-1"
              />
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-text">{rotulo}</span>
                <span className="text-xs text-text-muted">{descricao}</span>
              </span>
              <AmostraDaBarra barra={efetiva} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Um menu lateral em miniatura. A escura abre uma subárvore `data-theme="dark"`,
 * então `bg-card` e `bg-border` resolvem para os tokens ESCUROS sem nenhuma cor
 * escrita aqui — o mesmo mecanismo da barra de verdade.
 */
export function AmostraDaBarra({ barra }: { readonly barra: BarraLateralDaMarca }) {
  return (
    <span
      aria-hidden="true"
      data-amostra-da-barra={barra}
      {...(barra === "escura" ? { "data-theme": "dark" } : {})}
      className="flex h-10 w-14 shrink-0 gap-1 overflow-hidden rounded-sm border border-border bg-background"
    >
      <span className="flex w-5 flex-col gap-1 bg-card p-1">
        <span className="h-1 rounded-sm bg-accent" />
        <span className="h-1 rounded-sm bg-border-strong" />
        <span className="h-1 rounded-sm bg-border-strong" />
      </span>
    </span>
  );
}
