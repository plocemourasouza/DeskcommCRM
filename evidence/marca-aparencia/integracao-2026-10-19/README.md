# Cores do tema (casos 10–13) — reexecução depois da integração com a main (2026-10-19)

Reexecução dos casos 10–13 de `tests/e2e/marca-aparencia.spec.ts` na branch `feat/marca-aparencia`
depois do merge de `origin/main` (427126964, merge ed0287ab1), para provar que a integração não
regrediu as cores do tema. O que cada imagem prova está descrito em `../README.md`, nos itens de
mesmo nome; as desta reexecução são:

- `10-cores-ilegiveis-bloqueadas.png` — caso 10, a trava de contraste com o texto em `#f2f2f0`.
- `11-previa-cores-legiveis.png`, `11-empresa-cores-claro.png` e `11-empresa-cores-escuro.png` —
  caso 11, cores próprias na prévia e depois de salvar, nos dois temas.
- `12-servidor-recusa.png` — caso 12, a Server Action recusa o formulário com o Salvar desligado.
- `13-empresa-herda-instalacao.png` — caso 13, a empresa sem cores próprias herda as da instalação.

Resultado: **4/4 passaram, duas vezes seguidas** (`run1.log`: 4 passed 1,4 min; `run2.log`: 4 passed
1,6 min). `html-report-run1/` e `html-report-run2/` são os relatórios HTML do Playwright das duas
rodadas (cerca de 0,5 MB cada).

## Ambiente

Pilha Supabase isolada (project_id `e2e-wt`, API 56321, DB 56322) com banco fresco aplicado do
`supabase/baseline.sql` desta branch, build de produção (`pnpm e2e:build`) servido na porta 3107,
envs opcionais ausentes (os avisos `redis incr failed; falling back to in-memory` nos logs são isso).

    pnpm exec tsx scripts/seed-e2e-credentials.ts
    E2E_PORT=3107 pnpm exec playwright test tests/e2e/marca-aparencia.spec.ts -g "\((10|11|12|13)\) "
