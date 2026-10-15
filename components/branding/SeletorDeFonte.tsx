"use client";

import { useT } from "@/hooks/i18n/useT";
import {
  FONTES_DA_MARCA,
  NOMES_DAS_FONTES,
  estiloDaFonte,
  type FonteDaMarca,
} from "@/lib/branding/schema";

const DESCRICAO: Record<FonteDaMarca, string> = {
  atkinson: "A de sempre, desenhada para ser fácil de ler.",
  manrope: "Geométrica e limpa, boa para telas com muitos números.",
  jakarta: "Moderna e amigável, com traços arredondados.",
  "plex-sans": "Técnica e sóbria, com ar de documento.",
  bricolage: "Com personalidade, para marcas que querem se destacar.",
  fraunces: "Serifada com um toque suave, mais editorial.",
  "source-serif": "Serifada clássica, pensada para leitura longa.",
};

/** `null` = a organização não escolheu e vale a escolha da instalação. */
export type EscolhaDeFonte = FonteDaMarca | null;

/**
 * O cartão de escolha da fonte. Mesma anatomia de `SeletorDeDensidade`: radios
 * nativos num `fieldset` (setas do teclado e leitor de tela de graça), e a
 * opção "Usar o padrão da instalação" só quando `herdado` é passado.
 *
 * Cada opção traz uma amostra de texto NA PRÓPRIA fonte: `--font-ui` inline
 * (`estiloDaFonte`) + `font-sans`, que lê essa variável. As famílias já estão
 * declaradas no `<html>` (`app/fontes-da-marca.ts`), então a amostra não custa
 * um pedido a mais além do arquivo da própria fonte, baixado quando a opção
 * aparece.
 */
export function SeletorDeFonte({
  id,
  valor,
  onChange,
  herdado,
}: {
  /** Prefixo dos ids e do `name` dos radios — duas telas, dois grupos. */
  readonly id: string;
  readonly valor: EscolhaDeFonte;
  readonly onChange: (v: EscolhaDeFonte) => void;
  /** Presente só na tela da organização: a fonte da instalação, que vale se ela não escolhe. */
  readonly herdado?: FonteDaMarca;
}) {
  const t = useT();
  const opcoes: readonly EscolhaDeFonte[] =
    herdado === undefined ? FONTES_DA_MARCA : [null, ...FONTES_DA_MARCA];
  const atual = valor ?? (herdado === undefined ? "atkinson" : null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">{t("Fonte da tela")}</legend>
      <p id={`${id}-ajuda`} className="text-xs text-text-muted">
        {t(
          "A família de letra de todo o sistema. As sete são livres para uso comercial (licença OFL) e só é baixada a que estiver em uso.",
        )}
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-describedby={`${id}-ajuda`}>
        {opcoes.map((opcao) => {
          const efetiva: FonteDaMarca = opcao ?? herdado ?? "atkinson";
          const rotulo = opcao === null ? t("Usar o padrão da instalação") : NOMES_DAS_FONTES[opcao];
          const descricao =
            opcao === null
              ? `${t("Hoje: ")}${NOMES_DAS_FONTES[efetiva]}`
              : t(DESCRICAO[opcao]);
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
                {/* Amostra decorativa, NA fonte da escolha. */}
                <span
                  aria-hidden="true"
                  data-amostra-da-fonte={efetiva}
                  style={estiloDaFonte(efetiva)}
                  className="font-sans text-base text-text"
                >
                  {t("Atendimento que acompanha o cliente.")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
