import { neutrosDeTexto, raioDeTexto, type NeutrosDaMarca, type RaioDaMarca } from "./schema";

/** A aparencia que vira atributo no `<html>`: neutros (`data-neutros`) e raio (`data-raio`). */
export type AparenciaDoHtml = {
  readonly neutros: NeutrosDaMarca;
  readonly raio: RaioDaMarca;
};

/**
 * O script inline que o layout de `/app` emite para ligar a aparencia da
 * ORGANIZACAO (neutros e raio) no `<html>` antes da primeira pintura.
 *
 * Sem ele, o HTML do servidor so trazia a aparencia da instalacao (o layout raiz
 * nao conhece a organizacao) e a troca esperava a hidratacao: medido 112–144 ms
 * com a paleta errada (`evidence/marca-neutros/flash.json`). O script roda no
 * parse, como o `THEME_INIT_SCRIPT` do layout raiz; `AparenciaDaOrganizacao`
 * segue cuidando da navegacao pelo cliente, onde script inline nao executa.
 *
 * Cada valor passa pelo parser de vocabulario fechado (`neutrosDeTexto`,
 * `raioDeTexto`), que so devolve um dos literais — o texto do script nunca
 * carrega nada vindo do banco. O padrao de cada eixo e a AUSENCIA do atributo.
 */
export function scriptDaAparencia(aparencia: AparenciaDoHtml): string {
  const neutros = neutrosDeTexto(aparencia.neutros);
  const raio = raioDeTexto(aparencia.raio);
  const acaoNeutros =
    neutros === "quente"
      ? "r.removeAttribute('data-neutros')"
      : `r.setAttribute('data-neutros','${neutros}')`;
  const acaoRaio =
    raio === "padrao"
      ? "r.removeAttribute('data-raio')"
      : `r.setAttribute('data-raio','${raio}')`;
  return `(function(){var r=document.documentElement;${acaoNeutros};${acaoRaio};})();`;
}
