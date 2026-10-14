"use client";

import { useT } from "@/hooks/i18n/useT";
import { RAIO_EM_PX, RAIOS_DA_MARCA, type RaioDaMarca } from "@/lib/branding/schema";

const ROTULO: Record<RaioDaMarca, string> = {
  suave: "Suave",
  padrao: "Padrão",
  arredondado: "Arredondado",
};

const DESCRICAO: Record<RaioDaMarca, string> = {
  suave: "Cantos quase retos, um visual mais sóbrio.",
  padrao: "Cantos levemente arredondados, o visual de sempre.",
  arredondado: "Cantos bem arredondados, um visual mais leve.",
};

/** `null` = a organização não escolheu e vale a escolha da instalação. */
export type EscolhaDeRaio = RaioDaMarca | null;

/**
 * O cartão de escolha dos cantos. Mesma anatomia de `SeletorDeNeutros`: radios
 * nativos num `fieldset` (setas do teclado e leitor de tela de graça), e a
 * opção "Usar o padrão da instalação" só quando `herdado` é passado.
 */
export function SeletorDeRaio({
  id,
  valor,
  onChange,
  herdado,
}: {
  /** Prefixo dos ids e do `name` dos radios — duas telas, dois grupos. */
  readonly id: string;
  readonly valor: EscolhaDeRaio;
  readonly onChange: (v: EscolhaDeRaio) => void;
  /** Presente só na tela da organização: o raio da instalação, que vale se ela não escolhe. */
  readonly herdado?: RaioDaMarca;
}) {
  const t = useT();
  const opcoes: readonly EscolhaDeRaio[] =
    herdado === undefined ? RAIOS_DA_MARCA : [null, ...RAIOS_DA_MARCA];
  const atual = valor ?? (herdado === undefined ? "padrao" : null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">{t("Cantos dos botões e cartões")}</legend>
      <p id={`${id}-ajuda`} className="text-xs text-text-muted">
        {t("O quanto os cantos de botões, campos e cartões são arredondados em todo o sistema.")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-describedby={`${id}-ajuda`}>
        {opcoes.map((opcao) => {
          const efetiva: RaioDaMarca = opcao ?? herdado ?? "padrao";
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
              {/* Amostra decorativa: o canto REAL (`lg`) da escolha, em tokens. */}
              <span
                aria-hidden="true"
                data-amostra-do-raio={efetiva}
                className="h-8 w-12 shrink-0 border border-border-strong bg-accent-soft"
                style={{ borderRadius: `${RAIO_EM_PX[efetiva].lg}px` }}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
