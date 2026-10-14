/**
 * A régua do design system, congelada em módulo — a fonte da derivação em RUNTIME.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não um `readFileSync("app/globals.css")`:
 *
 * A imagem de produção é `output: "standalone"` (next.config.ts) e o Dockerfile
 * copia para o runner apenas `.next/standalone`, `.next/static` e `public/`. O
 * `app/globals.css` NÃO existe no contêiner que o self-hoster roda. Um
 * `readFileSync` no caminho de render do `app/layout.tsx` daria ENOENT — 500 em
 * todas as telas, na VPS de quem a feature existe para servir, e verde em dev,
 * em teste e na Vercel. É o mesmo modo de falha que `lib/branding.ts` documenta
 * para o `NEXT_PUBLIC_*`.
 *
 * A separação também é a certa conceitualmente: a RÉGUA é do produto e nasce
 * congelada no build; a COR é da instalação e só existe em runtime. Só a segunda
 * precisa ser lida do ambiente.
 *
 * ESTE ARQUIVO É GERADO. Não edite à mão: ele é o `extrairRegua()` aplicado ao
 * `app/globals.css`. `tests/unit/branding-regua-do-produto.test.ts` compara os
 * dois a cada run e imprime o literal novo na mensagem de falha — mexeu na
 * paleta, o teste reprova e entrega o texto para colar aqui.
 */

import type { Regua, TemaDaRegua } from "./contraste";
import type { Rampa } from "./rampa";
import type { NeutrosDaMarca } from "./schema";

export const REGUA_DO_PRODUTO: Regua = {
  rampaDoProduto: [
    "#f3f6f1",
    "#e4ebe0",
    "#c8d6c1",
    "#a4ba9a",
    "#82a077",
    "#67885d",
    "#506d48",
    "#41573b",
    "#374731",
    "#2f3c2b",
    "#171f15",
  ],
  claro: {
    nome: "claro",
    base: [
      {
        chave: "--color-bg",
        hex: "#faf9f6",
      },
      {
        chave: "--color-surface",
        hex: "#ffffff",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#f5f3ee",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "grau",
          indice: 1,
          alfa: 1,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "::selection/color",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 10,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 2,
            alfa: 1,
          },
        ],
      },
      {
        token: ":focus-visible/outline",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#5a8a5f",
      },
      {
        nome: "warning",
        hex: "#b07a2b",
      },
      {
        nome: "error",
        hex: "#a94a3c",
      },
      {
        nome: "info",
        hex: "#4a7a93",
      },
    ],
    neutros: [
      "#faf9f6",
      "#f3f1ec",
      "#e7e3da",
      "#d2cdbf",
      "#a9a395",
      "#7d786c",
      "#5d594f",
      "#46433b",
      "#2e2c26",
      "#1c1a16",
      "#0e0d0a",
    ],
    indices: {
      accent: 6,
      hover: 7,
      soft: 1,
    },
    alfaDoSoft: 1,
  },
  escuro: {
    nome: "escuro",
    base: [
      {
        chave: "--color-bg",
        hex: "#161510",
      },
      {
        chave: "--color-surface",
        hex: "#1d1c17",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#272620",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "literal",
          hex: "#82a077",
          alfa: 0.16,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 4,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 4,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 3,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: '[data-theme="dark"] ::selection/color',
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 0,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 7,
            alfa: 1,
          },
        ],
      },
      {
        token: '[data-theme="dark"] :focus-visible/outline-color',
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#82a077",
      },
      {
        nome: "warning",
        hex: "#d09455",
      },
      {
        nome: "error",
        hex: "#c87263",
      },
      {
        nome: "info",
        hex: "#7da9bf",
      },
    ],
    neutros: [
      "#f5f4ef",
      "#e6e4dc",
      "#bbb8ac",
      "#8e8b7f",
      "#605e54",
      "#444239",
      "#33312a",
      "#272620",
      "#1d1c17",
      "#161510",
      "#0c0b08",
    ],
    indices: {
      accent: 4,
      hover: 3,
      soft: null,
    },
    alfaDoSoft: 0.16,
  },
} as const;

/**
 * O que um preset de neutros troca na régua: as três superfícies e os onze neutros, por tema.
 * O resto (rampa, papéis, semânticas, índices) é do produto e não muda com o preset.
 * GERADO do `app/globals.css` por `extrairRegua(css, preset)`; o teste
 * `branding-contraste.test.ts` reprova se divergir e imprime o literal certo.
 */
type TrocaDoPreset = Pick<TemaDaRegua, "base" | "neutros">;

const PRESETS_DE_NEUTROS: Record<
  Exclude<NeutrosDaMarca, "quente">,
  { readonly claro: TrocaDoPreset; readonly escuro: TrocaDoPreset }
> = {
  cinza: {
    claro: {
      base: [
        { chave: "--color-bg", hex: "#f9f9f9" },
        { chave: "--color-surface", hex: "#ffffff" },
        { chave: "--color-surface-elevated", hex: "#f3f3f3" },
      ],
      neutros: [
        "#f9f9f9",
        "#f1f1f1",
        "#e3e3e3",
        "#cdcdcd",
        "#a3a3a3",
        "#787878",
        "#595959",
        "#434343",
        "#2c2c2c",
        "#1a1a1a",
        "#0d0d0d",
      ] as unknown as Rampa,
    },
    escuro: {
      base: [
        { chave: "--color-bg", hex: "#151515" },
        { chave: "--color-surface", hex: "#1c1c1c" },
        { chave: "--color-surface-elevated", hex: "#262626" },
      ],
      neutros: [
        "#f4f4f4",
        "#e4e4e4",
        "#b8b8b8",
        "#8b8b8b",
        "#5e5e5e",
        "#424242",
        "#313131",
        "#262626",
        "#1c1c1c",
        "#151515",
        "#0b0b0b",
      ] as unknown as Rampa,
    },
  },
  frio: {
    claro: {
      base: [
        { chave: "--color-bg", hex: "#f5faff" },
        { chave: "--color-surface", hex: "#ffffff" },
        { chave: "--color-surface-elevated", hex: "#eff4f9" },
      ],
      neutros: [
        "#f5faff",
        "#edf2f7",
        "#dde4ed",
        "#c4cedc",
        "#9aa5b3",
        "#707985",
        "#525a64",
        "#3e444c",
        "#282d32",
        "#171b1f",
        "#0a0d11",
      ] as unknown as Rampa,
    },
    escuro: {
      base: [
        { chave: "--color-bg", hex: "#12151a" },
        { chave: "--color-surface", hex: "#191c21" },
        { chave: "--color-surface-elevated", hex: "#22262c" },
      ],
      neutros: [
        "#f0f4fa",
        "#dee5ec",
        "#b0b9c5",
        "#838c98",
        "#575e68",
        "#3c424b",
        "#2c3138",
        "#22262c",
        "#191c21",
        "#12151a",
        "#090b0f",
      ] as unknown as Rampa,
    },
  },
};

/** A régua do produto sob um preset de neutros. `quente` é a régua de sempre. */
const REGUAS_POR_PRESET = new Map<Exclude<NeutrosDaMarca, "quente">, Regua>();

export function reguaDoProduto(neutros: NeutrosDaMarca): Regua {
  if (neutros === "quente") return REGUA_DO_PRODUTO;
  // Identidade estavel: a derivacao e cacheada POR REGUA (WeakMap em resolve.ts);
  // um objeto novo a cada chamada anularia o cache em todo render.
  const guardada = REGUAS_POR_PRESET.get(neutros);
  if (guardada) return guardada;
  const preset = PRESETS_DE_NEUTROS[neutros];
  const sobrepor = (tema: TemaDaRegua, p: TrocaDoPreset): TemaDaRegua => ({
    ...tema,
    base: p.base,
    neutros: p.neutros,
  });
  const regua: Regua = {
    ...REGUA_DO_PRODUTO,
    claro: sobrepor(REGUA_DO_PRODUTO.claro, preset.claro),
    escuro: sobrepor(REGUA_DO_PRODUTO.escuro, preset.escuro),
  };
  REGUAS_POR_PRESET.set(neutros, regua);
  return regua;
}
