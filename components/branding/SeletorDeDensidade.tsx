"use client";

import { useT } from "@/hooks/i18n/useT";
import {
  DENSIDADE_EM_PX,
  DENSIDADES_DA_MARCA,
  type DensidadeDaMarca,
} from "@/lib/branding/schema";

const ROTULO: Record<DensidadeDaMarca, string> = {
  aerada: "Aerada",
  equilibrada: "Equilibrada",
  compacta: "Compacta",
};

const DESCRICAO: Record<DensidadeDaMarca, string> = {
  aerada: "Controles e linhas com bastante respiro, o visual de sempre.",
  equilibrada: "Um pouco mais de informação por tela, sem apertar.",
  compacta: "Linhas e campos mais baixos, para quem trabalha com muitos dados.",
};

/** `null` = a organização não escolheu e vale a escolha da instalação. */
export type EscolhaDeDensidade = DensidadeDaMarca | null;

/**
 * O cartão de escolha da densidade. Mesma anatomia de `SeletorDeRaio`: radios
 * nativos num `fieldset` (setas do teclado e leitor de tela de graça), e a
 * opção "Usar o padrão da instalação" só quando `herdado` é passado.
 */
export function SeletorDeDensidade({
  id,
  valor,
  onChange,
  herdado,
}: {
  /** Prefixo dos ids e do `name` dos radios — duas telas, dois grupos. */
  readonly id: string;
  readonly valor: EscolhaDeDensidade;
  readonly onChange: (v: EscolhaDeDensidade) => void;
  /** Presente só na tela da organização: a densidade da instalação, que vale se ela não escolhe. */
  readonly herdado?: DensidadeDaMarca;
}) {
  const t = useT();
  const opcoes: readonly EscolhaDeDensidade[] =
    herdado === undefined ? DENSIDADES_DA_MARCA : [null, ...DENSIDADES_DA_MARCA];
  const atual = valor ?? (herdado === undefined ? "aerada" : null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">{t("Densidade da tela")}</legend>
      <p id={`${id}-ajuda`} className="text-xs text-text-muted">
        {t(
          "O quanto de espaço têm botões, campos, tabelas e o menu lateral. Vale em computador; no celular e no tablet o tamanho de toque não muda.",
        )}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-describedby={`${id}-ajuda`}>
        {opcoes.map((opcao) => {
          const efetiva: DensidadeDaMarca = opcao ?? herdado ?? "aerada";
          const rotulo = opcao === null ? t("Usar o padrão da instalação") : t(ROTULO[opcao]);
          const descricao =
            opcao === null ? `${t("Hoje: ")}${t(ROTULO[efetiva])}` : t(DESCRICAO[opcao]);
          const marcado = atual === opcao;
          const chave = opcao ?? "herdar";
          const linha = DENSIDADE_EM_PX[efetiva].linhaH;
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
              {/* Amostra decorativa: três linhas empilhadas na ALTURA de linha da escolha. */}
              <span
                aria-hidden="true"
                data-amostra-da-densidade={efetiva}
                className="flex w-12 shrink-0 flex-col gap-0.5"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="block rounded-sm bg-accent-soft"
                    style={{ height: `${linha / 2}px` }}
                  />
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
