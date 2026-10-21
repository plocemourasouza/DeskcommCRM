"use client";
import { useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLoseLead } from "@/hooks/kanban/useUpdateLead";
import { useMotivosDePerdaDoFunil } from "@/hooks/kanban/useMotivosDePerdaDoFunil";
import { rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import { OUTRO, motivoEscolhidoNaPerda, opcoesDeMotivoDePerda } from "@/lib/leads/motivos-de-perda-do-funil";

interface LoseLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  /**
   * Modo CARD: perde UM negócio pela rota individual (`/leads/{id}/lose`).
   * Ausente no modo lote.
   */
  leadId?: string;
  /**
   * Modo LOTE (#2484 F2): recebe o motivo escolhido e quem chamou decide a
   * escrita — a `leads/bulk` que já sabe decidir o motivo da perda (#917). O
   * diálogo é o MESMO do card: uma segunda janela de motivo seria a mesma
   * pergunta com duas respostas possíveis, e o funil passaria a ter duas listas.
   *
   * `detalhe` só vem em "Outro motivo" com texto livre: o motivo é `other` e o
   * texto vai à parte (`params.lost_reason_detail`) — ver `motivoEscolhidoNaPerda`.
   */
  onConfirm?: (lostReason: string, detalhe?: string) => void | Promise<void>;
  /**
   * Modo LOTE: quem chamou informa se a escrita em lote está em voo. Este
   * diálogo não conhece a mutação de lote (`useBulkAction`) — então não pode
   * perguntar `isPending` a ela; sem este sinal o botão "Confirmar" ficaria
   * clicável durante a escrita e um segundo clique dobraria o lote.
   */
  submitting?: boolean;
  /** Depois de a perda gravar — para quem mora fora do quadro (ex.: painel da conversa) recarregar o que mostra. */
  onPerdido?: () => void;
  /** Motivos do funil quando o quadro não está em cache (painel da conversa); sem isto, lê do cache do quadro. */
  motivos?: string[];
}

const MAX_LEN = 500;

export function LoseLeadDialog({
  open,
  onOpenChange,
  leadId,
  pipelineId,
  onConfirm,
  submitting = false,
  onPerdido,
  motivos,
}: LoseLeadDialogProps) {
  const t = useT();
  const [reasonCode, setReasonCode] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const mutation = useLoseLead(pipelineId);
  // O diálogo vale para os DOIS modos: a escrita individual (card) ou a do
  // chamador (lote). "em voo" é a mutação individual OU o sinal externo.
  const emVoo = mutation.isPending || submitting;

  // O funil deste card manda na lista: o que ele tem cadastrado substitui o
  // padrão do produto — ver lib/leads/motivos-de-perda-do-funil.ts.
  const doQuadro = useMotivosDePerdaDoFunil(pipelineId);
  const cadastrados = motivos ?? doQuadro;
  const opcoes = useMemo(() => opcoesDeMotivoDePerda(cadastrados), [cadastrados]);
  const funilConfigurado = cadastrados.length > 0;

  // "OUTRO" GRAVA SEMPRE `other` — vazio ou com detalhe, funil configurado ou não.
  //
  // ⚠️ `other` É CANÔNICO. `fn_validate_lost_reason_required` aceita
  // `v_canonical ∪ settings.lost_reasons`, e `v_canonical` traz `'other'`
  // (supabase/baseline.sql, `fn_validate_lost_reason_required`) — o servidor
  // aceita este valor em QUALQUER funil. E cadastrar um motivo novo é admin-only
  // (`app/actions/settings/updatePipelineConfig.ts`), então "Outro" é a saída de
  // quem tem uma perda fora da lista: ela não pode ter beco.
  //
  // ⚠️ O DETALHE NÃO É MOTIVO (2026-10-21). Até aqui o texto digitado ia COMO
  // `lost_reason`, e o trigger só aceita canônico ∪ cadastrado: todo texto livre
  // era recusado — primeiro com 22023 depois do clique (reproduzido em
  // crm.fabrasoftware.com.br com "Lead optou em outra solução"), depois na tela,
  // com o "Confirmar" desligado e a frase "Esse motivo de perda não está na
  // lista…" (a #918 trocou o erro tardio por uma recusa precoce, mas recusa
  // continuava sendo). "Outro motivo" com detalhe era beco sem saída em TODO
  // funil — e um usuário real bateu nele em 2026-10-21.
  //
  // Agora o motivo é `other` e o detalhe viaja à parte (`lost_reason_detail`),
  // para a linha da timeline e o audit da perda. Se o texto JÁ é um motivo
  // aceito (um rótulo cadastrado), ele mesmo é o motivo — a perda conta no lugar
  // certo do relatório. A decisão mora em `motivoEscolhidoNaPerda`.
  const escolha = reasonCode
    ? motivoEscolhidoNaPerda({
        escolhido: reasonCode,
        textoOutro: otherText,
        motivosCadastrados: cadastrados,
      })
    : null;
  const finalReason = escolha?.lostReason ?? "";
  const disabled =
    !reasonCode ||
    finalReason.length === 0 ||
    finalReason.length > MAX_LEN ||
    emVoo;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      // Modo LOTE (#2484 F2): o motivo vai para quem chamou, que escreve pela
      // `leads/bulk`. Modo CARD: a rota individual. Sem `leadId` NEM `onConfirm`
      // não há escrita nenhuma a fazer — o `disabled` já cobre o caso de uso,
      // e este guarda evita um clique pendurado em arranjo inválido.
      const detalhe = escolha?.detalhe;
      if (onConfirm) {
        await (detalhe ? onConfirm(finalReason, detalhe) : onConfirm(finalReason));
      } else if (leadId) {
        await mutation.mutateAsync({ leadId, lostReason: finalReason, lostReasonDetail: detalhe });
      } else {
        return;
      }
      setReasonCode("");
      setOtherText("");
      onOpenChange(false);
      onPerdido?.();
    } catch {
      // error already toasted
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Marcar como perdido")}</DialogTitle>
          <DialogDescription>
            {t("Informe o motivo. Essa informação ajuda a melhorar o funil.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Label>{t("Motivo")}</Label>
          <div className="grid grid-cols-1 gap-1.5">
            {opcoes.map((opcao) => (
              <label
                key={opcao.valor}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <input
                  type="radio"
                  name="lost-reason"
                  value={opcao.valor}
                  checked={reasonCode === opcao.valor}
                  onChange={(e) => setReasonCode(e.target.value)}
                />
                <span>{opcao.doFunil ? opcao.valor : t(rotuloDoMotivoDePerda(opcao.valor))}</span>
              </label>
            ))}
          </div>
          {reasonCode === OUTRO && (
            <div className="grid gap-1.5">
              <Label htmlFor="lost-reason-other">
                {t("Detalhe (opcional)")}
              </Label>
              <Textarea
                id="lost-reason-other"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder={t("Ex: Cliente desistiu por X motivo")}
                maxLength={MAX_LEN}
                rows={3}
              />
              <div className="text-right text-[11px] text-muted-foreground tabular-nums">
                {otherText.length}/{MAX_LEN}
              </div>
              {/*
                Com funil configurado é dica permanente (mostra assim que
                "Outro" é escolhido): o detalhe fica na linha do tempo do
                negócio, mas o relatório de perdas agrupa por MOTIVO — e o motivo
                aqui é "Outro". Quem quer a perda contada com as próprias
                palavras precisa cadastrá-la como motivo do funil.
              */}
              {funilConfigurado && (
                <p className="text-xs text-muted-foreground">
                  {t("Para usar um motivo que não está aqui, cadastre em Configurações › Funis.")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={emVoo}
          >
            {t("Cancelar")}
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {emVoo ? t("Salvando...") : t("Confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
