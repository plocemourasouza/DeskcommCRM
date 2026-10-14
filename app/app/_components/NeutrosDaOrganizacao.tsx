"use client";

import { useLayoutEffect } from "react";

import { neutrosDeTexto, type NeutrosDaMarca } from "@/lib/branding/schema";

/**
 * Liga os neutros ESCOLHIDOS PELA ORGANIZACAO no `<html>` enquanto a subarvore de
 * `/app` existe.
 *
 * Por que atributo no `<html>` e nao um bloco escopado como a cor: o preset
 * escuro casa em `[data-theme="dark"][data-neutros=...]` — os dois atributos no
 * MESMO elemento, e o tema vive no `<html>`. Um descendente nunca o ativaria. E
 * por que um componente aqui e nao o layout raiz: a organizacao so e conhecida
 * dentro de `/app` (o raiz serve tambem `/login`, que e da instalacao).
 *
 * O primeiro byte ja sai certo pelo `scriptDosNeutros` que o layout emite; este
 * efeito cobre a navegacao pelo cliente, onde script inline nao executa. O
 * cleanup devolve os neutros da INSTALACAO (logout navega por client-side e o
 * /login e da instalacao) — e nao o que havia no `<html>` na montagem, porque o
 * script do servidor ja o trocou para o da organizacao antes da hidratacao.
 */
export function NeutrosDaOrganizacao({
  neutros,
  instalacao,
}: {
  readonly neutros: NeutrosDaMarca;
  readonly instalacao: NeutrosDaMarca;
}) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    aplicar(raiz, neutrosDeTexto(neutros));
    return () => aplicar(raiz, neutrosDeTexto(instalacao));
  }, [neutros, instalacao]);
  return null;
}

function aplicar(raiz: HTMLElement, valor: NeutrosDaMarca): void {
  if (valor === "quente") raiz.removeAttribute("data-neutros");
  else raiz.setAttribute("data-neutros", valor);
}
