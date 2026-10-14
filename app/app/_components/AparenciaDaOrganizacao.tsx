"use client";

import { useLayoutEffect } from "react";

import { neutrosDeTexto, raioDeTexto } from "@/lib/branding/schema";
import type { AparenciaDoHtml } from "@/lib/branding/script-da-aparencia";

/**
 * Liga a aparencia ESCOLHIDA PELA ORGANIZACAO (neutros e raio) no `<html>`
 * enquanto a subarvore de `/app` existe.
 *
 * Por que atributo no `<html>` e nao um bloco escopado como a cor: o preset
 * escuro dos neutros casa em `[data-theme="dark"][data-neutros=...]` — os dois
 * atributos no MESMO elemento, e o tema vive no `<html>`. Um descendente nunca o
 * ativaria; o raio segue o mesmo caminho para ser uma so peca. E por que um
 * componente aqui e nao o layout raiz: a organizacao so e conhecida dentro de
 * `/app` (o raiz serve tambem `/login`, que e da instalacao).
 *
 * O primeiro byte ja sai certo pelo `scriptDaAparencia` que o layout emite; este
 * efeito cobre a navegacao pelo cliente, onde script inline nao executa. O
 * cleanup devolve a aparencia da INSTALACAO (logout navega por client-side e o
 * /login e da instalacao) — e nao o que havia no `<html>` na montagem, porque o
 * script do servidor ja o trocou para o da organizacao antes da hidratacao.
 */
export function AparenciaDaOrganizacao({
  aparencia,
  instalacao,
}: {
  readonly aparencia: AparenciaDoHtml;
  readonly instalacao: AparenciaDoHtml;
}) {
  const { neutros, raio } = aparencia;
  const { neutros: neutrosBase, raio: raioBase } = instalacao;
  useLayoutEffect(() => {
    const html = document.documentElement;
    aplicar(html, { neutros: neutrosDeTexto(neutros), raio: raioDeTexto(raio) });
    return () => aplicar(html, { neutros: neutrosDeTexto(neutrosBase), raio: raioDeTexto(raioBase) });
  }, [neutros, raio, neutrosBase, raioBase]);
  return null;
}

function aplicar(html: HTMLElement, { neutros, raio }: AparenciaDoHtml): void {
  if (neutros === "quente") html.removeAttribute("data-neutros");
  else html.setAttribute("data-neutros", neutros);
  if (raio === "padrao") html.removeAttribute("data-raio");
  else html.setAttribute("data-raio", raio);
}
