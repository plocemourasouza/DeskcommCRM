# Cores do tema (casos 10–13) — reexecução depois da integração com a main (2026-10-19)

Reexecução dos casos 10–13 de `tests/e2e/marca-aparencia.spec.ts` na branch `feat/marca-aparencia`
depois do merge de `origin/main` (427126964, merge ed0287ab1), para provar que a integração não
regrediu as cores do tema. O que cada imagem prova está descrito em `../README.md` (mesmos nomes).

Resultado: **4/4 passaram, duas vezes seguidas** (`run1.log`: 4 passed 1,4 min; `run2.log`: 4 passed
1,6 min). `html-report-run1/` e `html-report-run2/` são os relatórios HTML do Playwright das duas
rodadas (cerca de 0,5 MB cada).

## Ambiente

Pilha Supabase isolada (project_id `e2e-wt`, API 56321, DB 56322) com banco fresco aplicado do
`supabase/baseline.sql` desta branch, build de produção (`pnpm e2e:build`) servido na porta 3107,
envs opcionais ausentes (os avisos `redis incr failed; falling back to in-memory` nos logs são isso).

    pnpm exec tsx scripts/seed-e2e-credentials.ts
    E2E_PORT=3107 pnpm exec playwright test tests/e2e/marca-aparencia.spec.ts -g "\((10|11|12|13)\) "
