"use client";

import type { CSSProperties } from "react";

import { AmostraDaBarra } from "@/components/branding/SeletorDeBarraLateral";
import { useT } from "@/hooks/i18n/useT";
import {
  estiloDaDensidade,
  estiloDoRaio,
  type BarraLateralDaMarca,
  type DensidadeDaMarca,
  type RaioDaMarca,
} from "@/lib/branding/schema";

/**
 * A prévia dos cantos, da densidade e do menu lateral ANTES de salvar.
 *
 * Os blocos de raio do `globals.css` são `:root[data-raio=...]` e a prévia não
 * vive na raiz, então o raio escolhido entra como as quatro custom properties
 * `--radius-*` INLINE no contêiner (`estiloDoRaio`): `rounded-md` & cia. dos
 * filhos resolvem `var(--radius-md)` no próprio elemento e herdam o valor daqui.
 * A densidade entra do mesmo jeito (`estiloDaDensidade`, de `DENSIDADE_EM_PX`):
 * as amostras usam `h-(--controle-h)` & cia., as mesmas variáveis dos
 * primitivos, então o botão e o campo da prévia têm a altura que a escolha dá.
 * Só formas decorativas — nada aqui é controle, e nada recebe foco.
 */
export function PreviaDaAparencia({
  raio,
  densidade,
  barraLateral,
}: {
  readonly raio: RaioDaMarca;
  readonly densidade: DensidadeDaMarca;
  readonly barraLateral: BarraLateralDaMarca;
}) {
  const t = useT();
  return (
    <div className="space-y-2" data-previa-da-aparencia>
      <p className="text-sm font-medium text-text">{t("Como vai ficar")}</p>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background p-4">
        <div
          data-previa-do-raio={raio}
          data-previa-da-densidade={densidade}
          style={{ ...estiloDoRaio(raio), ...estiloDaDensidade(densidade) } as CSSProperties}
          aria-hidden="true"
          className="flex flex-1 flex-wrap items-center gap-3"
        >
          <span data-amostra-botao className="h-(--controle-h) w-24 rounded-md bg-accent" />
          <span
            data-amostra-campo
            className="h-(--campo-h) w-32 rounded-md border border-border-strong bg-surface"
          />
          <span className="h-14 w-24 rounded-xl border border-border bg-card" />
        </div>
        <div data-previa-da-barra className="shrink-0">
          <AmostraDaBarra barra={barraLateral} />
        </div>
      </div>
      <p className="text-xs text-text-muted">
        {t("Uma amostra de botão, campo, cartão e menu lateral com as escolhas acima.")}
      </p>
    </div>
  );
}
