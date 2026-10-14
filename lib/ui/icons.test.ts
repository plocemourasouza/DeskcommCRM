import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import type { Icone } from "@/lib/ui/icons";

/**
 * O barril é a ÚNICA porta de ícone do produto (ADR-05), e por isso a troca de
 * biblioteca mora inteira nele: os nomes exportados ficam, a implementação vira
 * Lucide. Os 186 arquivos que importam daqui não mudam — e é isso que mantém o
 * fork mesclável com a `main` a cada versão.
 *
 * Exceção medida: o Lucide 1.x não tem logo de marca. As quatro marcas abaixo
 * seguem desenhadas pelo Phosphor, porque logo de terceiro não é ícone de UI.
 */
const MARCAS = new Set(["WhatsappLogo", "InstagramLogo", "MessengerLogo", "GoogleLogo"]);

async function exportados(): Promise<[string, Icone][]> {
  const mod = (await import("@/lib/ui/icons")) as unknown as Record<string, Icone>;
  return Object.entries(mod).filter(([nome]) => nome !== "default");
}

function svg(Icone: Icone, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(Icone, props));
}

describe("lib/ui/icons", () => {
  // O barril ainda importa o Phosphor (as marcas) — transform frio sob a suíte
  // paralela passa fácil dos 5s default do vitest.
  it("re-exporta ao menos 20 ícones", { timeout: 30_000 }, async () => {
    expect((await exportados()).length).toBeGreaterThanOrEqual(20);
  });

  it("todo ícone que não é marca é desenhado pelo Lucide", { timeout: 30_000 }, async () => {
    const foraDoLucide = (await exportados())
      .filter(([nome]) => !MARCAS.has(nome))
      .filter(([, Icone]) => !/class="lucide /.test(svg(Icone)))
      .map(([nome]) => nome);
    expect(foraDoLucide).toEqual([]);
  });

  it("as marcas existem e renderizam", { timeout: 30_000 }, async () => {
    const mod = Object.fromEntries(await exportados());
    for (const nome of MARCAS) {
      expect(mod[nome], nome).toBeDefined();
      expect(svg(mod[nome]!)).toMatch(/^<svg/);
    }
  });

  describe("`weight` (vocabulário do Phosphor) vira espessura de traço", () => {
    it.each([
      [undefined, "2"],
      ["regular", "2"],
      ["duotone", "2"],
      ["thin", "1.25"],
      ["light", "1.5"],
      ["bold", "2.5"],
      ["fill", "2.5"],
    ])("weight=%s → stroke-width=%s", async (weight, traco) => {
      const { Gear } = await import("@/lib/ui/icons");
      expect(svg(Gear, weight ? { weight } : {})).toContain(`stroke-width="${traco}"`);
    });

    it("strokeWidth explícito vence o weight", async () => {
      const { Gear } = await import("@/lib/ui/icons");
      expect(svg(Gear, { weight: "bold", strokeWidth: 1 })).toContain('stroke-width="1"');
    });

    it("o atributo `weight` não vaza para o DOM", async () => {
      const { Gear } = await import("@/lib/ui/icons");
      expect(svg(Gear, { weight: "bold" })).not.toContain("weight=");
    });
  });

  it("nenhum arquivo importa @phosphor-icons/react fora do barril", () => {
    const quem = execFileSync(
      "git",
      ["grep", "-lE", "from ['\"]@phosphor-icons/react", "--", "app", "components", "hooks", "lib"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => f !== "lib/ui/icons.ts");
    expect(quem).toEqual([]);
  });
});
