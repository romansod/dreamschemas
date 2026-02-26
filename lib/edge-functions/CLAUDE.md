# CLAUDE.md — lib/edge-functions/

## This is where the live edge function logic lives

`dynamic-seeder-template.ts` is a **TypeScript factory** (runs in Next.js, not Deno) that generates
the actual Supabase edge function code that gets deployed to users' projects.

## How it works

```
dynamic-seeder-template.ts
  └── exports generateDynamicSeederFunction(seedingLogic: SeedingLogic): string
        │
        └── called by app/api/seeding/create-function/route.ts
              │
              └── POSTs generated Deno code to Supabase Management API
                    │
                    └── deploys as "seed-data" on the user's Supabase project
```

The returned string is a complete Deno edge function. It receives schema-specific logic
injected via the `SeedingLogic` interface:
- `tableProcessors` — column matching with fuzzy string similarity
- `columnMappers` — type-aware value conversions (UUID, booleans, JSON, dates)
- `relationshipResolvers` — dynamic FK resolution from schema analysis
- `validationRules` — schema-aware row validation
- `constants` — AI-generated schema config and performance settings

## Do NOT confuse with

`supabase/functions/seed-data/index.ts` — this is a **static scaffold** that does NOT get deployed
during normal app usage. It exists as a reference/manual-deploy option only.

## When seeding is triggered

1. User clicks "Create Seeding Function" in the UI
2. `app/api/seeding/create-function/route.ts` generates + deploys via this template
3. User uploads CSV → `app/api/seeding/start/route.ts` calls the deployed edge function
4. SSE stream flows back through `hooks/use-seeding-stream.ts` to the UI

## Editing guidance

- All seeding behavior changes go here (batch logic, FK resolution, streaming, etc.)
- Changes here require re-deploying the edge function via the UI's "Create Seeding Function" step
- The generated function runs in **Deno** — do not use Node.js APIs inside the template string
