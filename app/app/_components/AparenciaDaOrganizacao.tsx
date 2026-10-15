"use client";

import { useLayoutEffect } from "react";

import { densidadeDeTexto, fonteDeTexto, neutrosDeTexto, raioDeTexto } from "@/lib/branding/schema";
import type { AparenciaDoHtml } from "@/lib/branding/script-da-aparencia";

/**
 * Liga a aparencia ESCOLHIDA PELA ORGANIZACAO (neutros, raio, densidade e fonte) no `<html>`
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
  const { neutros, raio, densidade, fonte } = aparencia;
  const {
    neutros: neutrosBase,
    raio: raioBase,
    densidade: densidadeBase,
    fonte: fonteBase,
  } = instalacao;
  useLayoutEffect(() => {
    const html = document.documentElement;
    aplicar(html, {
      neutros: neutrosDeTexto(neutros),
      raio: raioDeTexto(raio),
      densidade: densidadeDeTexto(densidade),
      fonte: fonteDeTexto(fonte),
    });
    return () =>
      aplicar(html, {
        neutros: neutrosDeTexto(neutrosBase),
        raio: raioDeTexto(raioBase),
        densidade: densidadeDeTexto(densidadeBase),
        fonte: fonteDeTexto(fonteBase),
      });
  }, [neutros, raio, densidade, fonte, neutrosBase, raioBase, densidadeBase, fonteBase]);
  return null;
}

function aplicar(html: HTMLElement, { neutros, raio, densidade, fonte }: AparenciaDoHtml): void {
  if (neutros === "quente") html.removeAttribute("data-neutros");
  else html.setAttribute("data-neutros", neutros);
  if (raio === "padrao") html.removeAttribute("data-raio");
  else html.setAttribute("data-raio", raio);
  if (densidade === "aerada") html.removeAttribute("data-densidade");
  else html.setAttribute("data-densidade", densidade);
  if (fonte === "atkinson") html.removeAttribute("data-fonte");
  else html.setAttribute("data-fonte", fonte);
}
