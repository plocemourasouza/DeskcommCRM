/**
 * A regua de contraste na hora de SALVAR os neutros.
 *
 * A cor da marca e derivada contra os neutros que vao aparecer (`resolverMarca`
 * escolhe a regua do preset). Quando nenhum tom da escala alcanca o piso sobre
 * aquelas superficies o motor emite `accent_sem_contraste_possivel` e pinta
 * assim mesmo — o que serve a uma instalacao existente, mas nao a uma ESCOLHA
 * nova: quem escolhe a paleta tem de saber, antes de gravar, que a cor dele nao
 * le sobre ela. Esta funcao e pura e a UNICA que decide; o formulario a roda
 * para avisar e a Server Action a roda para recusar (o cliente nao e fronteira).
 *
 * Nos tres presets atuais nenhuma semente reprova (medido em
 * `branding-contraste.test.ts`), entao a recusa e uma rede, nao um caminho comum.
 */

import type { Regua, Tema } from "./contraste";
import { reguaDoProduto } from "./regua-do-produto";
import { resolverMarca } from "./resolve";
import { envelopeDeSemente, type NeutrosDaMarca } from "./schema";

export type ContrasteNosNeutros =
  | { readonly ok: true }
  | { readonly ok: false; readonly temas: readonly Tema[] };

export function aprovarContrasteNosNeutros(
  entrada: {
    readonly accent: string | null;
    readonly accentEscuro: string | null;
    readonly neutros: NeutrosDaMarca;
  },
  regua: Regua = reguaDoProduto(entrada.neutros),
): ContrasteNosNeutros {
  const accent = (entrada.accent ?? "").trim();
  if (accent.length === 0) return { ok: true };
  const escuro = (entrada.accentEscuro ?? "").trim();
  // `neutros` fica de fora da camada de proposito: a regua ja e a do preset, e a
  // regua injetada (teste) nao pode ser trocada de volta pela do produto.
  const marca = resolverMarca(
    [
      {
        origem: "tela",
        cor: envelopeDeSemente(accent),
        ...(escuro.length > 0 ? { corEscura: envelopeDeSemente(escuro) } : {}),
      },
    ],
    regua,
  );
  const temas = new Set<Tema>();
  for (const m of marca.motivos) {
    if (m.codigo === "accent_sem_contraste_possivel" && m.tema) temas.add(m.tema);
  }
  return temas.size === 0 ? { ok: true } : { ok: false, temas: [...temas] };
}
