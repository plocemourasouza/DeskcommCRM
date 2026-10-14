import { neutrosDeTexto, type NeutrosDaMarca } from "./schema";

/**
 * O script inline que o layout de `/app` emite para ligar os neutros da
 * ORGANIZACAO no `<html>` antes da primeira pintura.
 *
 * Sem ele, o HTML do servidor so trazia os neutros da instalacao (o layout raiz
 * nao conhece a organizacao) e a troca esperava a hidratacao: medido 112–144 ms
 * com a paleta errada (`evidence/marca-neutros/flash.json`). O script roda no
 * parse, como o `THEME_INIT_SCRIPT` do layout raiz; `NeutrosDaOrganizacao` segue
 * cuidando da navegacao pelo cliente, onde script inline nao executa.
 *
 * O valor passa por `neutrosDeTexto`, que so devolve um dos tres literais — o
 * texto do script nunca carrega nada vindo do banco.
 */
export function scriptDosNeutros(valor: NeutrosDaMarca): string {
  const neutros = neutrosDeTexto(valor);
  const acao =
    neutros === "quente"
      ? "r.removeAttribute('data-neutros')"
      : `r.setAttribute('data-neutros','${neutros}')`;
  return `(function(){var r=document.documentElement;${acao};})();`;
}
