"use client";
/**
 * Modo da trava de ação afirmada: a porta de `settings.agente.acao_afirmada_modo`.
 * Sem este cartão o modo só mudava por SQL. A regra mora em
 * `lib/agent-engine/guardrails/acao-afirmada.ts`; a gravação, em
 * `/api/v1/settings/acao-afirmada`.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

export type ModoDaAcaoAfirmadaTela = "observar" | "bloquear";

const OPCOES: ReadonlyArray<{ modo: ModoDaAcaoAfirmadaTela; titulo: string; corpo: string }> = [
  {
    modo: "observar",
    titulo: "Observar (padrão)",
    corpo:
      "A mensagem sai como o agente escreveu. O sistema só registra quando ele afirmou uma ação (gravar, agendar, cancelar, convidar, acionar a equipe) que nenhuma ferramenta fez.",
  },
  {
    modo: "bloquear",
    titulo: "Bloquear",
    corpo:
      "A mensagem é segurada e o agente precisa fazer a ação ou dizer a verdade. Se insistir, abre um caso para a equipe e o cliente recebe: “Vou confirmar isso com a equipe e já te retorno.”",
  },
];

export function AcaoAfirmadaForm({ initial }: { initial: ModoDaAcaoAfirmadaTela }) {
  const t = useT();
  const [modo, setModo] = useState(initial);
  const [salvo, setSalvo] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const sujo = modo !== salvo;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await apiClient.patch("/api/v1/settings/acao-afirmada", { modo });
        setSalvo(modo);
        toast.success(t("Configuração salva."));
      } catch (err) {
        toast.error(err instanceof Error ? t(err.message) : t("Não consegui salvar."));
      }
    });
  }

  return (
    <form onSubmit={salvar} className="flex max-w-3xl flex-col gap-4" data-testid="form-acao-afirmada">
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t("O agente diz que fez algo que não fez?")}</h2>
        </div>
        {OPCOES.map((o) => (
          <label key={o.modo} className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="acao-afirmada-modo"
              data-testid={`acao-afirmada-${o.modo}`}
              checked={modo === o.modo}
              disabled={isPending}
              onChange={() => setModo(o.modo)}
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">{t(o.titulo)}</span>
              <span className="block text-xs text-muted-foreground">{t(o.corpo)}</span>
            </span>
          </label>
        ))}
      </Card>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || !sujo}>
          {isPending ? t("Salvando…") : t("Salvar")}
        </Button>
        {sujo ? <span className="text-xs text-muted-foreground">{t("Há mudanças não salvas.")}</span> : null}
      </div>
    </form>
  );
}
