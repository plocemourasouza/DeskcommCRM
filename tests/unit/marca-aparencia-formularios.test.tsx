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
  fonte: "manrope",
  cores: null,
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
        fonte: null,
        cores: null,
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
    // neutros, cantos, menu lateral, densidade, fonte: cantos e menu lateral
    fireEvent.click(herdar[herdar.length - 4]!);
    fireEvent.click(herdar[herdar.length - 3]!);
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
    fireEvent.click(herdar[herdar.length - 2]!); // neutros, cantos, menu lateral, densidade, fonte: o penúltimo
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
          neutros: "quente", raio: "padrao", barra_lateral: "padrao", densidade: "aerada", fonte: "atkinson", cores: {}, show_powered_by: true,
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

describe("formulário da organização — fonte", () => {
  it("intocada: o Salvar NÃO leva fonte (a RPC preserva a gravada)", async () => {
    pintarOrg({ fonte: "fraunces" });
    await salvar();
    expect("fonte" in (salvarOrg.mock.calls[0]![0] as Record<string, unknown>)).toBe(false);
  });

  it("escolher um valor envia só a fonte", async () => {
    pintarOrg();
    fireEvent.click(screen.getByLabelText(/^Fraunces/));
    await salvar();
    const enviado = salvarOrg.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado.fonte).toBe("fraunces");
    expect("densidade" in enviado).toBe(false);
  });

  it("'Usar o padrão da instalação' envia null", async () => {
    pintarOrg({ fonte: "fraunces" });
    const herdar = screen.getAllByLabelText(/Usar o padrão da instalação/);
    fireEvent.click(herdar[herdar.length - 1]!); // a fonte é o último seletor
    await salvar();
    expect((salvarOrg.mock.calls[0]![0] as Record<string, unknown>).fonte).toBeNull();
  });

  it("a prévia usa a fonte escolhida antes de salvar (e a herdada, se nada foi escolhido)", () => {
    const { container } = pintarOrg();
    const previa = () => container.querySelector<HTMLElement>("[data-previa-da-fonte]")!;
    expect(previa().getAttribute("data-previa-da-fonte")).toBe("manrope"); // herdada
    expect(previa().style.getPropertyValue("--font-ui")).toContain("var(--fonte-manrope)");
    fireEvent.click(screen.getByLabelText(/^Fraunces/));
    expect(previa().getAttribute("data-previa-da-fonte")).toBe("fraunces");
    expect(previa().style.getPropertyValue("--font-ui")).toContain("var(--fonte-fraunces)");
    expect(previa().style.getPropertyValue("--font-ui")).toContain("serif");
  });

  it("'De onde vem cada coisa' responde sobre a fonte", () => {
    pintarOrg({ fonte: "fraunces" });
    expect(screen.getByText("Fonte", { selector: "span" })).toBeInTheDocument();
  });
});

describe("formulário da instalação — fonte", () => {
  function pintar() {
    return render(
      <FormularioDaMarca
        gravada={{
          app_name: null, logo_url: null, logo_path: null, accent_hex: null, accent_dark_hex: null,
          neutros: "quente", raio: "padrao", barra_lateral: "padrao", densidade: "aerada", fonte: "atkinson", cores: {}, show_powered_by: true,
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

  it("sete opções, sem herdar, Atkinson marcada", () => {
    pintar();
    expect((screen.getByLabelText(/^Atkinson Hyperlegible/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/^Source Serif 4/)).toBeInTheDocument();
    expect(screen.getAllByRole("radio").filter((r) => r.getAttribute("name") === "fonte")).toHaveLength(7);
  });

  it("o Salvar leva a fonte escolhida; a prévia acompanha", async () => {
    const { container } = pintar();
    fireEvent.click(screen.getByLabelText(/^Plus Jakarta Sans/));
    expect(
      container.querySelector<HTMLElement>("[data-previa-da-fonte]")!.style.getPropertyValue("--font-ui"),
    ).toContain("var(--fonte-jakarta)");
    await salvar();
    expect(salvarInstalacao.mock.calls[0]![0]).toMatchObject({ fonte: "jakarta" });
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
          fonte: "atkinson",
          cores: {},
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

describe("cores do tema — os dois formulários", () => {
  function pintarInstalacao(cores = {}) {
    return render(
      <FormularioDaMarca
        gravada={{
          app_name: null, logo_url: null, logo_path: null, accent_hex: null, accent_dark_hex: null,
          neutros: "quente", raio: "padrao", barra_lateral: "padrao", densidade: "aerada", fonte: "atkinson", cores, show_powered_by: true,
        }}
        nomeEmVigor="Deskcomm"
        logoEmVigor={null}
        logoDoAmbiente={null}
        origens={{ nome: "padrao", logoUrl: "padrao", cor: "padrao", cores: "padrao" }}
        definidoNestaTela={false}
        fallbackEm={null}
        fallbackMotivo={null}
      />,
    );
  }
  const campo = (tema: "claro" | "escuro", token: string) =>
    document.querySelector<HTMLInputElement>(`[data-cor-do-tema="${tema}:${token}"] input[type="text"], [data-cor-do-tema="${tema}:${token}"] input:not([type="color"])`)!;
  const salvarBotao = () => screen.getByRole("button", { name: /^Salvar$/ }) as HTMLButtonElement;

  it("organização: cor legível vai para a action; intocadas não vão", async () => {
    pintarOrg();
    await salvar();
    expect("cores" in (salvarOrg.mock.calls[0]![0] as Record<string, unknown>)).toBe(false);
    salvarOrg.mockClear();
    fireEvent.change(campo("claro", "bg"), { target: { value: "#FFFFFF" } });
    await salvar();
    expect((salvarOrg.mock.calls[0]![0] as Record<string, unknown>).cores).toEqual({ claro: { bg: "#ffffff" } });
  });

  it("organização: par ilegível TRAVA o Salvar e nomeia o par em português", () => {
    pintarOrg();
    fireEvent.change(campo("escuro", "text-muted"), { target: { value: "#4a4840" } });
    expect(salvarBotao().disabled).toBe(true);
    expect(document.querySelector("[data-trava-das-cores]")?.getAttribute("data-trava-das-cores")).toBe("reprova");
    expect(
      screen.getByText(/Texto secundário sobre Cartões \(tema escuro\): [0-9],[0-9] de 4,5/),
    ).toBeInTheDocument();
    // Voltar ao padrão destrava.
    fireEvent.change(campo("escuro", "text-muted"), { target: { value: "" } });
    expect(salvarBotao().disabled).toBe(false);
  });

  it("organização: texto que não é cor também trava", () => {
    pintarOrg();
    fireEvent.change(campo("claro", "text"), { target: { value: "azul" } });
    expect(salvarBotao().disabled).toBe(true);
  });

  it("organização: gravadas, 'Voltar todas' envia null (herda tudo)", async () => {
    pintarOrg({ cores: { claro: { bg: "#ffffff" } } });
    fireEvent.click(screen.getByRole("button", { name: /Voltar todas as cores do tema ao padrão/ }));
    await salvar();
    expect((salvarOrg.mock.calls[0]![0] as Record<string, unknown>).cores).toBeNull();
  });

  it("organização: o placeholder é o herdado da instalação, token a token", () => {
    render(
      <FormularioDaMarcaDaOrganizacao
        gravada={{
          app_name: null, accent_hex: null, accent_dark_hex: null, logo_path: null, neutros: null,
          raio: null, barra_lateral: null, densidade: null, fonte: null, cores: null,
        }}
        instalacao={{ ...INSTALACAO, cores: { claro: { bg: "#fdfdfd" } } }}
        ambiente={{}}
        vocabulario={{ lei: "LGPD", rotuloNomeLegal: "Razão social" }}
      />,
    );
    expect(campo("claro", "bg").placeholder).toBe("#fdfdfd");
    expect(campo("claro", "surface").placeholder).toBe("#ffffff");
    expect(screen.getByText("Cores do tema", { selector: "span" })).toBeInTheDocument();
  });

  it("organização: a amostra aplica as cores inline, antes de salvar", () => {
    pintarOrg();
    fireEvent.change(campo("escuro", "surface"), { target: { value: "#101010" } });
    const amostra = document.querySelector<HTMLElement>('[data-previa-das-cores="escuro"]')!;
    expect(amostra.style.getPropertyValue("--color-surface")).toBe("#101010");
    expect(amostra.style.getPropertyValue("--card")).toBe("var(--color-surface)");
  });

  it("instalação: o Salvar leva o objeto inteiro; ilegível trava", async () => {
    pintarInstalacao({ claro: { text: "#000000" } });
    await salvar();
    expect(salvarInstalacao.mock.calls[0]![0]).toMatchObject({ cores: { claro: { text: "#000000" } } });
    fireEvent.change(campo("claro", "surface"), { target: { value: "#6f6f6f" } });
    expect(salvarBotao().disabled).toBe(true);
  });
});
