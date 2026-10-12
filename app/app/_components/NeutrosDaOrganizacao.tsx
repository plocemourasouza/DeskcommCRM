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
 * O cleanup devolve o que havia, entao sair de `/app` (logout navega por
 * client-side) volta a paleta da instalacao sem recarregar a pagina.
 * `useLayoutEffect` para trocar antes da pintura quando o JS ja chegou; o
 * primeiro byte do HTML ainda leva a paleta da instalacao (nao medido o flash).
 */
export function NeutrosDaOrganizacao({ neutros }: { readonly neutros: NeutrosDaMarca }) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.getAttribute("data-neutros");
    const valor = neutrosDeTexto(neutros);
    if (valor === "quente") raiz.removeAttribute("data-neutros");
    else raiz.setAttribute("data-neutros", valor);
    return () => {
      if (anterior === null) raiz.removeAttribute("data-neutros");
      else raiz.setAttribute("data-neutros", anterior);
    };
  }, [neutros]);
  return null;
}
