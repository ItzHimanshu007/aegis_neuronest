# shared/schema

Generated TypeScript types live here (`pnpm gen:types`), produced from `/shared/schema/*.schema.json`.
Do not hand-edit `payload.v2.d.ts` / `plan.v2.d.ts` — edit the JSON Schema and regenerate.

`tokens.ts` is hand-written and is the single source of truth for `TOKEN_PATTERN` (AGENTS.md
invariant 3), mirrored in `server/app/schemas/tokens.py`.
