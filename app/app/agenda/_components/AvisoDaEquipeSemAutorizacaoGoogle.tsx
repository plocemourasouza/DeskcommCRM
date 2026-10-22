"use client";

import { useT } from "@/hooks/i18n/useT";
import { Warning } from "@/lib/ui/icons";

import type { Pessoa } from "@/components/agenda/tipos";

/**
 * A agenda Google de OUTRA pessoa perdeu a autorização.
 *
 * O cartão da conexão só fala de quem está logado. Mas a conexão de uma colega
 * que expirou faz os compromissos dela pararem de ir ao Google sem que ninguém
 * veja — e quem gerencia lê essas linhas pela RLS
 * (`calendar_connections_dono_ou_manager_read`). Sem este aviso, o único
 * sinal era a colega reparar sozinha.
 *
 * Sem pronome de gênero de propósito: o nome vem do cadastro e o texto não
 * adivinha como a pessoa se chama.
 */
export function AvisoDaEquipeSemAutorizacaoGoogle({
  donosIds,
  pessoas,
}: {
  donosIds: string[];
  pessoas: Pessoa[];
}) {
  const t = useT();
  const ids = [...new Set(donosIds)];
  if (ids.length === 0) return null;

  const nomes = ids.map((id) => pessoas.find((p) => p.id === id)?.nome ?? t("uma pessoa da equipe"));
  const lista = [...new Set(nomes)].join(", ");

  return (
    <div
      data-testid="aviso-equipe-sem-autorizacao-google"
      role="status"
      className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-bg p-3"
    >
      <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-4 text-text-muted">
        <span className="text-sm font-semibold text-text">
          {t("A agenda Google de {nomes} perdeu a autorização").replace("{nomes}", lista)}
        </span>
        {": "}
        {t("os compromissos de {nomes} não chegam ao Google até a conexão ser refeita.").replace("{nomes}", lista)}
      </p>
    </div>
  );
}
