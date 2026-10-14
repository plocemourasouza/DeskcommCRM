"use client";

import type { CSSProperties } from "react";

import { AmostraDaBarra } from "@/components/branding/SeletorDeBarraLateral";
import { useT } from "@/hooks/i18n/useT";
import {
  estiloDoRaio,
  type BarraLateralDaMarca,
  type RaioDaMarca,
} from "@/lib/branding/schema";

/**
 * A prévia dos cantos e do menu lateral ANTES de salvar.
 *
 * Os blocos de raio do `globals.css` são `:root[data-raio=...]` e a prévia não
 * vive na raiz, então o raio escolhido entra como as quatro custom properties
 * `--radius-*` INLINE no contêiner (`estiloDoRaio`): `rounded-md` & cia. dos
 * filhos resolvem `var(--radius-md)` no próprio elemento e herdam o valor daqui.
 * Só formas decorativas — nada aqui é controle, e nada recebe foco.
 */
export function PreviaDaAparencia({
  raio,
  barraLateral,
}: {
  readonly raio: RaioDaMarca;
  readonly barraLateral: BarraLateralDaMarca;
}) {
  const t = useT();
  return (
    <div className="space-y-2" data-previa-da-aparencia>
      <p className="text-sm font-medium text-text">{t("Como vai ficar")}</p>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background p-4">
        <div
          data-previa-do-raio={raio}
          style={estiloDoRaio(raio) as CSSProperties}
          aria-hidden="true"
          className="flex flex-1 flex-wrap items-center gap-3"
        >
          <span className="h-9 w-24 rounded-md bg-accent" />
          <span className="h-9 w-32 rounded-md border border-border-strong bg-surface" />
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
