import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("é decorativo: aria-hidden e sem nome acessível", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Button loading", () => {
  it("loading: aria-busy, disabled e o nome acessível não muda", () => {
    render(<Button loading>Enviar</Button>);
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("loading: o spinner dentro do botão é aria-hidden", () => {
    render(<Button loading>Enviar</Button>);
    const svg = screen.getByRole("button", { name: "Enviar" }).querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("sem loading: sem aria-busy, habilitado e sem spinner", () => {
    render(<Button>Enviar</Button>);
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn.hasAttribute("aria-busy")).toBe(false);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.querySelector("svg")).toBeNull();
  });

  it("disabled explícito continua valendo com loading=false", () => {
    render(<Button disabled>Enviar</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
