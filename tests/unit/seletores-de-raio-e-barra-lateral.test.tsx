import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SeletorDeRaio } from "@/components/branding/SeletorDeRaio";
import { SeletorDeBarraLateral } from "@/components/branding/SeletorDeBarraLateral";
import { SeletorDeDensidade } from "@/components/branding/SeletorDeDensidade";

afterEach(cleanup);

describe("SeletorDeRaio", () => {
  it("instalação (sem herdado): três opções, sem 'usar o padrão da instalação'", () => {
    render(<SeletorDeRaio id="raio" valor="padrao" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByLabelText(/Usar o padrão da instalação/)).toBeNull();
    expect((screen.getByLabelText(/^Padrão/) as HTMLInputElement).checked).toBe(true);
  });

  it("organização: quatro opções, e null marca 'usar o padrão da instalação'", () => {
    render(<SeletorDeRaio id="raio" valor={null} onChange={() => {}} herdado="suave" />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect((screen.getByLabelText(/Usar o padrão da instalação/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Hoje: Suave/)).toBeInTheDocument();
  });

  it("emite o valor escolhido e null ao escolher herdar", () => {
    const onChange = vi.fn();
    render(<SeletorDeRaio id="raio" valor="padrao" onChange={onChange} herdado="padrao" />);
    fireEvent.click(screen.getByLabelText(/^Arredondado/));
    expect(onChange).toHaveBeenLastCalledWith("arredondado");
    fireEvent.click(screen.getByLabelText(/Usar o padrão da instalação/));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("a11y: grupo nomeado, radios do mesmo name (teclado nativo) e amostra decorativa com o raio real", () => {
    const { container } = render(<SeletorDeRaio id="raio" valor="padrao" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: /Cantos/ })).toBeInTheDocument();
    const nomes = new Set(screen.getAllByRole("radio").map((r) => r.getAttribute("name")));
    expect(nomes).toEqual(new Set(["raio"]));
    const amostras = container.querySelectorAll<HTMLElement>("[data-amostra-do-raio]");
    expect(amostras).toHaveLength(3);
    for (const a of amostras) expect(a.getAttribute("aria-hidden")).toBe("true");
    const suave = container.querySelector<HTMLElement>('[data-amostra-do-raio="suave"]')!;
    expect(suave.style.borderRadius).toBe("6px"); // o `lg` do suave
  });
});

describe("SeletorDeBarraLateral", () => {
  it("instalação: duas opções; organização: três", () => {
    render(<SeletorDeBarraLateral id="barra" valor="padrao" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    cleanup();
    render(<SeletorDeBarraLateral id="barra" valor={null} onChange={() => {}} herdado="escura" />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect((screen.getByLabelText(/Usar o padrão da instalação/) as HTMLInputElement).checked).toBe(true);
  });

  it("emite escura, padrao e null", () => {
    const onChange = vi.fn();
    render(<SeletorDeBarraLateral id="barra" valor="padrao" onChange={onChange} herdado="padrao" />);
    fireEvent.click(screen.getByLabelText(/Sempre escura/));
    expect(onChange).toHaveBeenLastCalledWith("escura");
    fireEvent.click(screen.getByLabelText(/Usar o padrão da instalação/));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("amostra: a escura leva data-theme=dark, a padrão não; sem cor fixa", () => {
    const { container } = render(<SeletorDeBarraLateral id="barra" valor="padrao" onChange={() => {}} />);
    const escura = container.querySelector('[data-amostra-da-barra="escura"]')!;
    const padrao = container.querySelector('[data-amostra-da-barra="padrao"]')!;
    expect(escura.getAttribute("data-theme")).toBe("dark");
    expect(padrao.hasAttribute("data-theme")).toBe(false);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|bg-black|bg-white/i);
  });
});

describe("SeletorDeDensidade", () => {
  it("instalação: três opções sem herdar; organização: quatro, e null marca herdar", () => {
    render(<SeletorDeDensidade id="densidade" valor="aerada" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByLabelText(/Usar o padrão da instalação/)).toBeNull();
    expect((screen.getByLabelText(/^Aerada/) as HTMLInputElement).checked).toBe(true);
    cleanup();
    render(<SeletorDeDensidade id="densidade" valor={null} onChange={() => {}} herdado="compacta" />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect((screen.getByLabelText(/Usar o padrão da instalação/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Hoje: Compacta/)).toBeInTheDocument();
  });

  it("emite o valor escolhido e null ao herdar", () => {
    const onChange = vi.fn();
    render(<SeletorDeDensidade id="densidade" valor="aerada" onChange={onChange} herdado="aerada" />);
    fireEvent.click(screen.getByLabelText(/^Compacta/));
    expect(onChange).toHaveBeenLastCalledWith("compacta");
    fireEvent.click(screen.getByLabelText(/Usar o padrão da instalação/));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("a11y: grupo nomeado, radios do mesmo name, amostra decorativa com três barras na altura de linha da escolha", () => {
    const { container } = render(<SeletorDeDensidade id="densidade" valor="aerada" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: /Densidade/ })).toBeInTheDocument();
    expect(new Set(screen.getAllByRole("radio").map((r) => r.getAttribute("name")))).toEqual(new Set(["densidade"]));
    const amostras = container.querySelectorAll<HTMLElement>("[data-amostra-da-densidade]");
    expect(amostras).toHaveLength(3);
    for (const a of amostras) {
      expect(a.getAttribute("aria-hidden")).toBe("true");
      expect(a.children).toHaveLength(3);
    }
    const alturas = (d: string) =>
      [...container.querySelector(`[data-amostra-da-densidade="${d}"]`)!.children].map((c) => (c as HTMLElement).style.height);
    expect(alturas("aerada")).toEqual(["20px", "20px", "20px"]); // linhaH 40 / 2
    expect(alturas("compacta")).toEqual(["16px", "16px", "16px"]); // linhaH 32 / 2
  });
});
