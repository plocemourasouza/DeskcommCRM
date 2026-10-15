/**
 * Cantos e menu lateral nos DOIS formulários de marca: o que vai no Salvar
 * (organização: valor / null / ausente; instalação: sempre o valor) e a prévia
 * que mostra a escolha antes de salvar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const salvarOrg = vi.fn(async (_: unknown) => ({ ok: true as const }));
const salvarInstalacao = vi.fn(async (_: unknown) => ({ ok: true as const }));
vi.mock("@/app/actions/settings/updateMarcaDaOrganizacao", () => ({
  updateMarcaDaOrganizacao: (x: unknown) => salvarOrg(x),
}));
vi.mock("@/app/actions/settings/updateBranding", () => ({
  updateBranding: (x: unknown) => salvarInstalacao(x),
}));

import { FormularioDaMarcaDaOrganizacao } from "@/app/app/settings/marca/_form";
import { FormularioDaMarca } from "@/app/admin/(protected)/marca/_form";

const INSTALACAO = {
  app_name: null,
  logo_url: null,
  logo_path: null,
  accent_hex: null,
  accent_dark_hex: null,
  neutros: null,
  raio: "suave",
  barra_lateral: "escura",
  densidade: "compacta",
};

function pintarOrg(gravada: Partial<Parameters<typeof FormularioDaMarcaDaOrganizacao>[0]["gravada"]> = {}) {
  return render(
    <FormularioDaMarcaDaOrganizacao
      gravada={{
        app_name: null,
        accent_hex: null,
        accent_dark_hex: null,
        logo_path: null,
        neutros: null,
        raio: null,
        barra_lateral: null,
        densidade: null,
        ...gravada,
      }}
      instalacao={INSTALACAO}
      ambiente={{}}
      vocabulario={{ lei: "LGPD", rotuloNomeLegal: "Razão social" }}
    />,
  );
}

async function salvar() {
  fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));
  await waitFor(() => expect(salvarOrg.mock.calls.length + salvarInstalacao.mock.calls.length).toBeGreaterThan(0));
}

beforeEach(() => {
  salvarOrg.mockClear();
  salvarInstalacao.mockClear();
});
afterEach(cleanup);

describe("formulário da organização — cantos e menu lateral", () => {
  it("intocados: o Salvar NÃO leva raio nem barra_lateral (a RPC preserva o gravado)", async () => {
    pintarOrg({ raio: "arredondado", barra_lateral: "escura" });
    await salvar();
    const enviado = salvarOrg.mock.calls[0]![0] as Record<string, unknown>;
    expect("raio" in enviado).toBe(false);
    expect("barra_lateral" in enviado).toBe(false);
  });

  it("escolher um valor envia só aquele campo", async () => {
    pintarOrg();
    fireEvent.click(screen.getByLabelText(/^Arredondado/));
    await salvar();
    const enviado = salvarOrg.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.raio).toBe("arredondado");
    expect("barra_lateral" in enviado).toBe(false);
  });

  it("'Usar o padrão da instalação' envia null (limpa a escolha gravada)", async () => {
    pintarOrg({ raio: "arredondado", barra_lateral: "escura" });
    const herdar = screen.getAllByLabelText(/Usar o padrão da instalação/);
    // neutros, cantos, menu lateral, densidade: cantos e menu lateral
    fireEvent.click(herdar[herdar.length - 3]!);
    fireEvent.click(herdar[herdar.length - 2]!);
    await salvar();
    const enviado = salvarOrg.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.raio).toBeNull();
    expect(enviado.barra_lateral).toBeNull();
  });

  it("a prévia leva as quatro custom properties do raio escolhido, antes de salvar", () => {
    const { container } = pintarOrg();
    const previa = () => container.querySelector<HTMLElement>("[data-previa-do-raio]")!;
    // herdando: vale o da instalação (suave)
    expect(previa().style.getPropertyValue("--radius-md")).toBe("4px");
    fireEvent.click(screen.getByLabelText(/^Arredondado/));
    expect(previa().style.getPropertyValue("--radius-sm")).toBe("6px");
    expect(previa().style.getPropertyValue("--radius-md")).toBe("12px");
    expect(previa().style.getPropertyValue("--radius-lg")).toBe("16px");
    expect(previa().style.getPropertyValue("--radius-xl")).toBe("24px");
  });

  it("a prévia do menu lateral fica escura conforme a escolha (e herda da instalação)", () => {
    const { container } = pintarOrg();
    const amostra = () => container.querySelector("[data-previa-da-barra] [data-amostra-da-barra]")!;
    expect(amostra().getAttribute("data-amostra-da-barra")).toBe("escura"); // herdada
    const marcar = screen.getAllByLabelText(/^Padrão/);
    fireEvent.click(marcar[marcar.length - 1]!); // barra lateral: Padrão
    expect(amostra().getAttribute("data-amostra-da-barra")).toBe("padrao");
  });

  it("'De onde vem cada coisa' responde sobre cantos e menu lateral", () => {
    pintarOrg({ raio: "suave" });
    expect(screen.getByText("Cantos")).toBeInTheDocument();
    expect(screen.getByText("Menu lateral", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("você definiu aqui").length).toBeGreaterThan(0);
  });
});

describe("formulário da organização — densidade", () => {
  it("intocada: o Salvar NÃO leva densidade (a RPC preserva a gravada)", async () => {
    pintarOrg({ densidade: "equilibrada" });
    await salvar();
    expect("densidade" in (salvarOrg.mock.calls[0]![0] as Record<string, unknown>)).toBe(false);
  });

  it("escolher um valor envia só a densidade", async () => {
    pintarOrg();
    fireEvent.click(screen.getByLabelText(/^Equilibrada/));
    await salvar();
    const enviado = salvarOrg.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.densidade).toBe("equilibrada");
    expect("raio" in enviado).toBe(false);
  });

  it("'Usar o padrão da instalação' envia null", async () => {
    pintarOrg({ densidade: "compacta" });
    const herdar = screen.getAllByLabelText(/Usar o padrão da instalação/);
    fireEvent.click(herdar[herdar.length - 1]!); // neutros, cantos, menu lateral, densidade: o último
    await salvar();
    expect((salvarOrg.mock.calls[0]![0] as Record<string, unknown>).densidade).toBeNull();
  });

  it("a prévia leva as variáveis da densidade escolhida, antes de salvar (e a herdada, se nada foi escolhido)", () => {
    const { container } = pintarOrg();
    const previa = () => container.querySelector<HTMLElement>("[data-previa-da-densidade]")!;
    expect(previa().getAttribute("data-previa-da-densidade")).toBe("compacta"); // herdada
    expect(previa().style.getPropertyValue("--controle-h")).toBe("30px");
    fireEvent.click(screen.getByLabelText(/^Aerada/));
    expect(previa().style.getPropertyValue("--controle-h")).toBe("36px");
    expect(previa().style.getPropertyValue("--campo-h")).toBe("40px");
    expect(previa().style.getPropertyValue("--linha-py")).toBe("8px");
  });

  it("'De onde vem cada coisa' responde sobre a densidade", () => {
    pintarOrg({ densidade: "compacta" });
    expect(screen.getByText("Densidade", { selector: "span" })).toBeInTheDocument();
  });
});

describe("formulário da instalação — densidade", () => {
  function pintar() {
    return render(
      <FormularioDaMarca
        gravada={{
          app_name: null, logo_url: null, logo_path: null, accent_hex: null, accent_dark_hex: null,
          neutros: "quente", raio: "padrao", barra_lateral: "padrao", densidade: "aerada", show_powered_by: true,
        }}
        nomeEmVigor="Deskcomm"
        logoEmVigor={null}
        logoDoAmbiente={null}
        origens={{ nome: "padrao", logoUrl: "padrao", cor: "padrao" }}
        definidoNestaTela={false}
        fallbackEm={null}
        fallbackMotivo={null}
      />,
    );
  }

  it("três opções, sem herdar, aerada marcada", () => {
    pintar();
    expect((screen.getByLabelText(/^Aerada/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/^Compacta/)).toBeInTheDocument();
  });

  it("o Salvar leva a densidade escolhida; a prévia acompanha", async () => {
    const { container } = pintar();
    fireEvent.click(screen.getByLabelText(/^Compacta/));
    expect(
      container.querySelector<HTMLElement>("[data-previa-da-densidade]")!.style.getPropertyValue("--controle-h"),
    ).toBe("30px");
    await salvar();
    expect(salvarInstalacao.mock.calls[0]![0]).toMatchObject({ densidade: "compacta" });
  });
});

describe("formulário da instalação — cantos e menu lateral", () => {
  function pintarInstalacao() {
    return render(
      <FormularioDaMarca
        gravada={{
          app_name: null,
          logo_url: null,
          logo_path: null,
          accent_hex: null,
          accent_dark_hex: null,
          neutros: "quente",
          raio: "padrao",
          barra_lateral: "padrao",
          densidade: "aerada",
          show_powered_by: true,
        }}
        nomeEmVigor="Deskcomm"
        logoEmVigor={null}
        logoDoAmbiente={null}
        origens={{ nome: "padrao", logoUrl: "padrao", cor: "padrao" }}
        definidoNestaTela={false}
        fallbackEm={null}
        fallbackMotivo={null}
      />,
    );
  }

  it("sem opção de herdar e com padrão marcado", () => {
    pintarInstalacao();
    expect(screen.queryAllByLabelText(/Usar o padrão da instalação/)).toHaveLength(0);
    expect((screen.getByLabelText(/^Sempre escura/) as HTMLInputElement).checked).toBe(false);
  });

  it("o Salvar leva raio e barra_lateral escolhidos", async () => {
    pintarInstalacao();
    fireEvent.click(screen.getByLabelText(/^Suave/));
    fireEvent.click(screen.getByLabelText(/^Sempre escura/));
    await salvar();
    expect(salvarInstalacao.mock.calls[0]![0]).toMatchObject({ raio: "suave", barra_lateral: "escura" });
  });
});
