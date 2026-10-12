"use client";
import { useCallback } from "react";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { uploadMedia } from "@/hooks/inbox/useUploadMedia";
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

/**
 * Envios que a tela já mostrou como bolha otimista, por id da bolha. Módulo, não
 * estado do hook: quem toca "Tentar de novo" (o fio) não é quem enviou (o
 * composer). Some no sucesso e no retry.
 */
const ENVIOS_EM_VOO = new Map<string, SendArgs>();

function tipoPelaMime(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function soltarPrevia(url: string | null | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

interface MessagesPage {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

export function useSendMessage() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: SendArgs) => {
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
    },
    onMutate: async (args) => {
      if (!args.file && (args.media_storage_path || args.media_url || args.type === "contact")) {
        return {};
      }

      const queryKey = ["messages", args.conversation_id];
      await qc.cancelQueries({ queryKey });

      const tempId = `temp-${randomId()}`;
      ENVIOS_EM_VOO.set(tempId, args);
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

      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (old) => {
        if (!old) return old;
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
    onSuccess: (result, args, context) => {
      const real = result.data;
      if (context?.tempId) ENVIOS_EM_VOO.delete(context.tempId);
      soltarPrevia(context?.previa);
      const queryKey = ["messages", args.conversation_id];
      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (old) => {
        if (!old || old.pages.length === 0) return old;
        // O Realtime pode ter buscado a mensagem real antes da resposta do
        // POST. Remover ambas as cópias antes de inseri-la evita duplicação.
        const pages = old.pages.map((page) => ({
          ...page,
          data: page.data.filter((m) => m.id !== context?.tempId && m.id !== real.id),
        }));
        pages[0] = { ...pages[0]!, data: [...pages[0]!.data, real] };
        return { ...old, pages };
      });
    },
    onError: (err, args, context) => {
      if (context?.tempId) {
        // A bolha NÃO some: vira `failed` e oferece "Tentar de novo". Sumir com
        // ela era perder o que a pessoa acabou de escrever ou anexar.
        qc.setQueryData<InfiniteData<MessagesPage>>(["messages", args.conversation_id], (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  data: page.data.map((m) =>
                    m.id === context.tempId
                      ? {
                          ...m,
                          status: "failed",
                          error_message: err instanceof Error ? err.message : null,
                        }
                      : m,
                  ),
                })),
              }
            : old,
        );
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

  /** "Tentar de novo": tira a bolha falha e reenvia o MESMO envio (arquivo incluso). */
  const { mutate } = mutation;
  const retry = useCallback(
    (tempId: string) => {
      const args = ENVIOS_EM_VOO.get(tempId);
      if (!args) return;
      ENVIOS_EM_VOO.delete(tempId);
      qc.setQueryData<InfiniteData<MessagesPage>>(["messages", args.conversation_id], (old) => {
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

  return { ...mutation, retry };
}
