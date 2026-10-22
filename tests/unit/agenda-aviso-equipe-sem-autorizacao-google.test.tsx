/**
 * O AVISO DA EQUIPE — quando a agenda Google de OUTRA pessoa perdeu a
 * autorização. O cartão cobre a conexão de quem está logado; este cobre as
 * demais, que quem gerencia enxerga pela RLS
 * (`calendar_connections_dono_ou_manager_read`) e que antes ficavam mudas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AvisoDaEquipeSemAutorizacaoGoogle } from "@/app/app/agenda/_components/AvisoDaEquipeSemAutorizacaoGoogle";

afterEach(cleanup);

const pessoas = [
  { id: "u1", nome: "Ana Souza", trilha: 1 as const },
  { id: "u2", nome: "Bruno Lima", trilha: 2 as const },
];

describe("aviso da equipe sem autorização do Google", () => {
  it("nomeia quem perdeu a autorização", () => {
    render(<AvisoDaEquipeSemAutorizacaoGoogle donosIds={["u2"]} pessoas={pessoas} />);
    const aviso = screen.getByTestId("aviso-equipe-sem-autorizacao-google");
    expect(aviso.textContent).toContain("Bruno Lima");
    expect(aviso.textContent).toContain("os compromissos de Bruno Lima");
    expect(aviso.textContent).not.toContain("Ana Souza");
  });

  it("várias pessoas: nomeia todas, uma vez cada", () => {
    render(<AvisoDaEquipeSemAutorizacaoGoogle donosIds={["u1", "u2", "u1"]} pessoas={pessoas} />);
    const texto = screen.getByTestId("aviso-equipe-sem-autorizacao-google").textContent ?? "";
    expect(texto).toContain("Ana Souza, Bruno Lima");
    expect(texto).not.toContain("Ana Souza, Ana Souza");
  });

  it("ninguém com problema: não desenha nada", () => {
    const { container } = render(<AvisoDaEquipeSemAutorizacaoGoogle donosIds={[]} pessoas={pessoas} />);
    expect(container.innerHTML).toBe("");
  });

  it("dono que a lista de pessoas não conhece: não inventa nome, diz 'uma pessoa da equipe'", () => {
    render(<AvisoDaEquipeSemAutorizacaoGoogle donosIds={["u9"]} pessoas={pessoas} />);
    expect(screen.getByTestId("aviso-equipe-sem-autorizacao-google").textContent).toContain(
      "uma pessoa da equipe",
    );
  });
});
