// @vitest-environment node
/**
 * Rasterização é serial no processo inteiro: um SVG caro de uma organização não
 * pode multiplicar-se em N desenhos simultâneos que esgotam o pool de threads de
 * todas as outras. A prova observa o `sharp` de verdade por um espião que conta
 * operações EM VOO — nunca relógio —, então "nunca em paralelo" é contagem, não
 * palpite de tempo.
 */
import type { Sharp } from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  emVoo: 0,
  maximo: 0,
  aberturas: 0,
  portao: null as Promise<void> | null,
}));

vi.mock("sharp", async (importOriginal) => {
  const real = (await importOriginal<{ default: (...a: unknown[]) => Sharp }>()).default;
  const espiao = (...args: unknown[]): Sharp => {
    const s = real(...args);
    const alvo = s as unknown as Record<"metadata" | "toBuffer", (...a: unknown[]) => Promise<unknown>>;
    for (const metodo of ["metadata", "toBuffer"] as const) {
      const original = alvo[metodo].bind(s);
      alvo[metodo] = async (...a: unknown[]) => {
        if (metodo === "metadata") estado.aberturas++;
        estado.emVoo++;
        estado.maximo = Math.max(estado.maximo, estado.emVoo);
        try {
          if (estado.portao) await estado.portao;
          return await original(...a);
        } finally {
          estado.emVoo--;
        }
      };
    }
    return s;
  };
  return { default: espiao };
});

const { rasterizarSvg, ESPERA_MAXIMA_NA_FILA } = await import("./logo-rasterizar");

const enc = (s: string) => new TextEncoder().encode(s);
const LIMPO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
  '<rect width="200" height="100" fill="#0a7"/></svg>';

afterEach(() => {
  estado.emVoo = 0;
  estado.maximo = 0;
  estado.aberturas = 0;
  estado.portao = null;
  vi.restoreAllMocks();
});

describe("rasterizarSvg — uma rasterização por vez no processo", () => {
  it("duas chamadas simultâneas nunca desenham em paralelo, e as duas terminam", async () => {
    const [a, b] = await Promise.all([rasterizarSvg(enc(LIMPO)), rasterizarSvg(enc(LIMPO))]);
    expect(a.ok && b.ok).toBe(true);
    expect(estado.aberturas).toBe(2);
    expect(estado.maximo, "duas operações do sharp ao mesmo tempo").toBe(1);
  });

  it("além da fila, a chamada é recusada na hora, sem tocar o sharp", async () => {
    const aceitas = 1 + ESPERA_MAXIMA_NA_FILA;
    const resultados = await Promise.all(
      Array.from({ length: aceitas + 2 }, () => rasterizarSvg(enc(LIMPO))),
    );
    expect(resultados.filter((r) => r.ok)).toHaveLength(aceitas);
    expect(resultados.filter((r) => !r.ok && r.motivo === "invalido")).toHaveLength(2);
    expect(estado.aberturas).toBe(aceitas);
    expect(estado.maximo).toBe(1);
  });

  it("quem esperou além do prazo não desenha quando chega a vez", async () => {
    let abrir!: () => void;
    estado.portao = new Promise<void>((r) => (abrir = r));
    const primeira = rasterizarSvg(enc(LIMPO));
    const segunda = rasterizarSvg(enc(LIMPO));
    // A primeira já está DENTRO do sharp; o prazo da segunda vence enquanto ela desenha.
    await vi.waitFor(() => expect(estado.emVoo).toBe(1));
    const agora = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(agora + 60_000);
    abrir();
    estado.portao = null;
    const [a, b] = await Promise.all([primeira, segunda]);
    expect(a.ok).toBe(true);
    expect(b.ok === false && b.motivo).toBe("invalido");
    expect(estado.aberturas).toBe(1);
  });
});
