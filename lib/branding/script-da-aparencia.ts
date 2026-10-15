import {
  densidadeDeTexto,
  neutrosDeTexto,
  raioDeTexto,
  type DensidadeDaMarca,
  type NeutrosDaMarca,
  type RaioDaMarca,
} from "./schema";

/** A aparencia que vira atributo no `<html>`: neutros (`data-neutros`), raio (`data-raio`) e densidade (`data-densidade`). */
export type AparenciaDoHtml = {
  readonly neutros: NeutrosDaMarca;
  readonly raio: RaioDaMarca;
  readonly densidade: DensidadeDaMarca;
};

/**
 * O script inline que o layout de `/app` emite para ligar a aparencia da
 * ORGANIZACAO (neutros, raio e densidade) no `<html>` antes da primeira pintura.
 *
 * Sem ele, o HTML do servidor so trazia a aparencia da instalacao (o layout raiz
 * nao conhece a organizacao) e a troca esperava a hidratacao: medido 112–144 ms
 * com a paleta errada (`evidence/marca-neutros/flash.json`). O script roda no
 * parse, como o `THEME_INIT_SCRIPT` do layout raiz; `AparenciaDaOrganizacao`
 * segue cuidando da navegacao pelo cliente, onde script inline nao executa.
 *
 * Cada valor passa pelo parser de vocabulario fechado (`neutrosDeTexto`,
 * `raioDeTexto`, `densidadeDeTexto`), que so devolve um dos literais — o texto do script nunca
 * carrega nada vindo do banco. O padrao de cada eixo e a AUSENCIA do atributo.
 */
export function scriptDaAparencia(aparencia: AparenciaDoHtml): string {
  const neutros = neutrosDeTexto(aparencia.neutros);
  const raio = raioDeTexto(aparencia.raio);
  const densidade = densidadeDeTexto(aparencia.densidade);
  const acaoNeutros =
    neutros === "quente"
      ? "r.removeAttribute('data-neutros')"
      : `r.setAttribute('data-neutros','${neutros}')`;
  const acaoRaio =
    raio === "padrao"
      ? "r.removeAttribute('data-raio')"
      : `r.setAttribute('data-raio','${raio}')`;
  const acaoDensidade =
    densidade === "aerada"
      ? "r.removeAttribute('data-densidade')"
      : `r.setAttribute('data-densidade','${densidade}')`;
  return `(function(){var r=document.documentElement;${acaoNeutros};${acaoRaio};${acaoDensidade};})();`;
}
