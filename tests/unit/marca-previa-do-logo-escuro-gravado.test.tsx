/**
 * O LOGO ESCURO GRAVADO CHEGA À PRÉVIA DE Configurações › Marca.
 *
 * O defeito: a página montava `gravada` e `instalacao` sem `logo_dark_path`.
 * O formulário remonta a pilha no navegador a partir dessas duas props, então
 * `resolvida.logoDarkUrl` saía sempre vazio — e o quadro "Aparência escura"
 * mostrava o logo CLARO na moldura branca, com a arte escura gravada no banco e
 * servida pela barra lateral. Para quem subiu o arquivo, o upload parecia não
 * ter pegado.
 *
 * Do lado da organização, `gravada.logo_dark_path` é obrigatório no tipo: a
 * página que esquecer o campo não compila. Do lado da instalação o campo é
 * opcional em `LinhaDaInstalacao` (código velho sobre banco novo), e por isso o
 * segundo caso só prova o formulário — a página precisa repassá-lo à mão.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FormularioDaMarcaDaOrganizacao } from "@/app/app/settings/marca/_form";
import { baseDoStorage, urlPublicaDoLogo } from "@/lib/branding/logo";
import type { LinhaDaInstalacao } from "@/lib/branding/resolve";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/settings/updateMarcaDaOrganizacao", () => ({
  updateMarcaDaOrganizacao: vi.fn(),
}));

type JanelaComEnv = { __PUBLIC_ENV__?: { NEXT_PUBLIC_SUPABASE_URL?: string } };
// No navegador a base do Storage vem do script injetado a cada requisição;
// sem ela `logoDaCamada` devolve null e NENHUM logo chega à prévia.
beforeEach(() => {
  (window as unknown as JanelaComEnv).__PUBLIC_ENV__ = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as JanelaComEnv).__PUBLIC_ENV__;
});

const ORG = "3a3be40f-d23b-4e41-aee7-fd27092db0d5";
const CLARO = `${ORG}/claro.png`;
const ESCURO = `${ORG}/escuro.png`;
const url = (caminho: string) => urlPublicaDoLogo(caminho, baseDoStorage());
const previa = (tema: "claro" | "escuro") =>
  document.querySelector<HTMLImageElement>(`[data-previa-do-logo='${tema}'] img`);

const SEM_MARCA_NA_INSTALACAO: LinhaDaInstalacao = {
  app_name: null,
  logo_url: null,
  logo_path: null,
  logo_dark_path: null,
  accent_hex: null,
  accent_dark_hex: null,
};

function formulario(
  gravada: { logo_path: string | null; logo_dark_path: string | null },
  instalacao = SEM_MARCA_NA_INSTALACAO,
) {
  return render(
    <FormularioDaMarcaDaOrganizacao
      gravada={{
        app_name: "oSystems",
        accent_hex: null,
        accent_dark_hex: null,
        ...gravada,
      }}
      instalacao={instalacao}
      ambiente={{}}
      vocabulario={{ lei: "LGPD", rotuloNomeLegal: "Razão social" }}
    />,
  );
}

describe("prévia do logo escuro em Configurações › Marca", () => {
  it("o logo escuro da ORGANIZAÇÃO aparece no quadro escuro, sem moldura branca", () => {
    formulario({ logo_path: CLARO, logo_dark_path: ESCURO });
    expect(previa("claro")?.src).toBe(url(CLARO));
    expect(previa("escuro")?.src).toBe(url(ESCURO));
    expect(previa("escuro")?.parentElement?.className).not.toContain("bg-white");
    expect(document.body.textContent).toContain("Remover logo escuro");
  });

  it("o logo escuro da INSTALAÇÃO aparece quando a organização não subiu logo", () => {
    formulario(
      { logo_path: null, logo_dark_path: null },
      {
        ...SEM_MARCA_NA_INSTALACAO,
        logo_path: "platform/claro.png",
        logo_dark_path: "platform/escuro.png",
      },
    );
    expect(previa("escuro")?.src).toBe(url("platform/escuro.png"));
  });
});
