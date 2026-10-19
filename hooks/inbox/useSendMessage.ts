"use client";
import { useCallback } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { uploadMedia } from "@/hooks/inbox/useUploadMedia";
import {
  envioDaBolhaLocal,
  esquecerBolhaLocal,
  registrarBolhaLocal,
  type PaginaDeMensagens,
} from "@/hooks/inbox/bolhasLocais";
import type { Message } from "@/lib/types/messaging";

interface SendArgs {
  conversation_id: string;
  body?: string;
  media_url?: string;
  media_mime?: string;
  media_storage_path?: string;
  media_size_bytes?: number;
  type?: string;
  /**
   * Definição aprovada — o caminho de volta quando a janela de 24h fechou. A
   * rota já aceitava estes campos; só o front nunca os mandava, então não havia
   * como disparar um modelo pelo inbox.
   */
  template_name?: string;
  template_language?: string;
  template_values?: Record<string, string>;
  /** A mensagem citada — id da NOSSA linha; o handler traduz para o do canal. */
  reply_to_message_id?: string;
  metadata?: Record<string, unknown>;
  /**
   * Mídia ainda LOCAL: o hook sobe o arquivo e só então manda a mensagem. A
   * bolha aparece na hora, com a prévia do próprio arquivo, e o arquivo fica
   * guardado em memória para o "Tentar de novo" se algo falhar.
   */
  file?: File | Blob;
  filename?: string;
}

function tipoPelaMime(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function soltarPrevia(url: string | null | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/** Sobe o arquivo LOCAL (se houver) e manda a mensagem — o mesmo POST de sempre. */
async function enviar(input: SendArgs) {
  const { file, filename, ...corpo } = input;
  if (!file) return apiClient.post<{ data: Message }>("/api/v1/messages", corpo);
  const uploaded = await uploadMedia({ conversationId: input.conversation_id, file, filename });
  return apiClient.post<{ data: Message }>("/api/v1/messages", {
    ...corpo,
    type: uploaded.kind,
    media_storage_path: uploaded.storage_path,
    media_mime: uploaded.media_mime,
    media_size_bytes: uploaded.media_size_bytes,
  });
}

/** O motivo da bolha que nem chegou a sair: a anterior da MESMA leva falhou. */
const MOTIVO_DA_FILA_INTERROMPIDA = "Não saiu porque o arquivo anterior falhou.";

interface BolhaCriada {
  tempId: string;
  previa: string | null;
}

export function useSendMessage() {
  const qc = useQueryClient();

  /** Põe a bolha pendente no fio e registra o envio dela para o "Tentar de novo". */
  const criarBolha = useCallback(
    (args: SendArgs): BolhaCriada => {
      const queryKey = ["messages", args.conversation_id];
      const tempId = `temp-${randomId()}`;
      registrarBolhaLocal(tempId, args);
      const previa = args.file ? URL.createObjectURL(args.file) : null;
      const mime = args.file?.type || null;
      const tempMsg: Message = {
        id: tempId,
        organization_id: "",
        conversation_id: args.conversation_id,
        channel_session_id: "",
        contact_id: "",
        external_id: null,
        type: args.type ?? (mime ? tipoPelaMime(mime) : "text"),
        direction: "outbound",
        status: "queued",
        ack: null,
        error_code: null,
        error_message: null,
        body: args.body ?? null,
        media_url: previa ?? args.media_url ?? null,
        media_mime: mime ?? args.media_mime ?? null,
        media_size_bytes: args.file?.size ?? null,
        media_storage_path: null,
        reply_to_message_id: args.reply_to_message_id ?? null,
        sent_via: "user",
        sent_by_user_id: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        metadata: {
          _optimistic: true,
          ...(args.file ? { _local_preview: true, _filename: args.filename ?? (args.file instanceof File ? args.file.name : null) } : {}),
        },
        // Mensagem que acaba de sair não foi editada nem apagada — mas os
        // campos precisam existir: sem eles o otimista não é do mesmo tipo do
        // que volta do servidor, e a bolha passaria a renderizar dois formatos.
        edited_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };

      qc.setQueryData<InfiniteData<PaginaDeMensagens>>(queryKey, (old) => {
        // Sem página em cache ainda: a bolha CRIA a forma, senão não teria onde
        // aparecer — e uma falha perderia o arquivo sem "Tentar de novo".
        if (!old) return { pages: [{ data: [tempMsg] }], pageParams: [undefined] };
        const pages = [...old.pages];
        if (pages.length > 0) {
          // A primeira página contém as mensagens mais recentes. As páginas
          // seguintes são carregadas para trás no histórico.
          const newest = pages[0]!;
          pages[0] = {
            ...newest,
            data: [...newest.data, tempMsg],
          };
        }
        return { ...old, pages };
      });

      return { tempId, previa };
    },
    [qc],
  );

  /**
   * Troca a bolha pela mensagem real NO LUGAR dela. Numa leva de vários anexos
   * as seguintes ainda estão pendentes logo abaixo; acrescentar a real no fim
   * a faria pular para depois delas até a leva terminar.
   */
  const assentar = useCallback(
    (conversationId: string, bolha: BolhaCriada | undefined, real: Message) => {
      if (bolha) esquecerBolhaLocal(bolha.tempId);
      soltarPrevia(bolha?.previa);
      qc.setQueryData<InfiniteData<PaginaDeMensagens>>(["messages", conversationId], (old) => {
        if (!old || old.pages.length === 0) return old;
        // O Realtime pode ter buscado a mensagem real antes da resposta do
        // POST. Remover essa cópia antes de pôr a real evita duplicação.
        let trocou = false;
        const pages = old.pages.map((page) => ({
          ...page,
          data: page.data.flatMap((m) => {
            if (m.id === real.id) return [];
            if (m.id !== bolha?.tempId) return [m];
            trocou = true;
            return [real];
          }),
        }));
        if (!trocou) pages[0] = { ...pages[0]!, data: [...pages[0]!.data, real] };
        return { ...old, pages };
      });
    },
    [qc],
  );

  /**
   * A bolha NÃO some: vira `failed` e oferece "Tentar de novo". Sumir com ela
   * era perder o que a pessoa acabou de escrever ou anexar.
   */
  const falhar = useCallback(
    (conversationId: string, tempId: string, motivo: string | null) => {
      qc.setQueryData<InfiniteData<PaginaDeMensagens>>(["messages", conversationId], (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                data: page.data.map((m) =>
                  m.id === tempId ? { ...m, status: "failed", error_message: motivo } : m,
                ),
              })),
            }
          : old,
      );
    },
    [qc],
  );

  const mutation = useMutation({
    mutationFn: enviar,
    onMutate: async (args): Promise<Partial<BolhaCriada>> => {
      if (!args.file && (args.media_storage_path || args.media_url || args.type === "contact")) {
        return {};
      }
      const queryKey = ["messages", args.conversation_id];
      // Com a lista já em cache, um refetch em voo não pode sobrescrever a bolha.
      // SEM a lista (anexo enviado antes de ela carregar), a primeira leitura não
      // é cancelada: cancelá-la deixaria a conversa só com a bolha, sem histórico.
      // Ela chega depois e passa pela mescla de `bolhasLocais`, que guarda a bolha.
      if (qc.getQueryData(queryKey)) await qc.cancelQueries({ queryKey });
      return criarBolha(args);
    },
    onSuccess: (result, args, context) => {
      assentar(
        args.conversation_id,
        context?.tempId ? { tempId: context.tempId, previa: context.previa ?? null } : undefined,
        result.data,
      );
    },
    onError: (err, args, context) => {
      if (context?.tempId) {
        falhar(args.conversation_id, context.tempId, err instanceof Error ? err.message : null);
      }
      showApiError(err);
    },
    onSettled: (_data, err, args, context) => {
      // Refazer a lista tiraria do ar a bolha falha — o servidor nunca a viu.
      if (!(err && context?.tempId)) {
        qc.invalidateQueries({ queryKey: ["messages", args.conversation_id] });
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  /**
   * Vários anexos de uma vez (#2526), com o mesmo feedback do envio único: todas
   * as bolhas entram no fio AGORA, na ordem escolhida, e saem UMA DE CADA VEZ —
   * a ordem em que chegam ao cliente é a da prévia. Quem chama decide a legenda
   * (só no primeiro).
   *
   * Uma falha INTERROMPE a leva: a bolha que falhou mostra o motivo, as
   * seguintes viram `failed` sem nunca terem subido — cada uma com o seu
   * arquivo guardado e o seu "Tentar de novo". Seguir mandando depois de uma
   * falha entregaria ao cliente o 3º arquivo sem o 2º, fora da ordem que o
   * atendente montou. Um aviso só: um toast por arquivo que nem tentou sair
   * repetiria a mesma notícia.
   *
   * Dispara e não devolve promessa, como o `mutate`: quem chama não espera a
   * leva — a janela fecha e as bolhas assumem o feedback.
   */
  const executarSequencia = useCallback(
    async (envios: SendArgs[]) => {
      const primeiro = envios[0];
      if (!primeiro) return;
      const queryKey = ["messages", primeiro.conversation_id];
      if (qc.getQueryData(queryKey)) await qc.cancelQueries({ queryKey });
      const bolhas = envios.map((args) => criarBolha(args));

      let falhou = false;
      for (const [indice, args] of envios.entries()) {
        const bolha = bolhas[indice]!;
        if (falhou) {
          falhar(args.conversation_id, bolha.tempId, MOTIVO_DA_FILA_INTERROMPIDA);
          continue;
        }
        try {
          const resultado = await enviar(args);
          assentar(args.conversation_id, bolha, resultado.data);
        } catch (err) {
          falhou = true;
          falhar(args.conversation_id, bolha.tempId, err instanceof Error ? err.message : null);
          showApiError(err);
        }
      }
      if (!falhou) qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    [qc, criarBolha, assentar, falhar],
  );
  const enviarEmSequencia = useCallback(
    (envios: SendArgs[]) => {
      void executarSequencia(envios);
    },
    [executarSequencia],
  );

  /** "Tentar de novo": tira a bolha falha e reenvia o MESMO envio (arquivo incluso). */
  const { mutate } = mutation;
  const retry = useCallback(
    (tempId: string) => {
      const args = envioDaBolhaLocal<SendArgs>(tempId);
      if (!args) return;
      esquecerBolhaLocal(tempId);
      qc.setQueryData<InfiniteData<PaginaDeMensagens>>(["messages", args.conversation_id], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.filter((m) => {
              if (m.id !== tempId) return true;
              soltarPrevia(m.media_url);
              return false;
            }),
          })),
        };
      });
      mutate(args);
    },
    [qc, mutate],
  );

  return { ...mutation, retry, enviarEmSequencia };
}
