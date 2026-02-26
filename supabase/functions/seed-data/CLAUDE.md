# CLAUDE.md — supabase/functions/seed-data/

## ⚠️ THIS FILE IS NOT WHAT GETS DEPLOYED

`index.ts` in this directory is a **static reference/scaffold** for the `seed-data` Supabase edge function.
It is **NOT** the file that gets deployed when a user seeds data through the app.

## What actually gets deployed

The **live** edge function is generated dynamically at runtime by:

**Template factory:** `lib/edge-functions/dynamic-seeder-template.ts`
- Exports `generateDynamicSeederFunction(seedingLogic: SeedingLogic): string`
- Returns the complete Deno function source as a string, with schema-specific logic injected

**Deployed by:** `app/api/seeding/create-function/route.ts`
- Analyzes the user's schema
- Calls `generateDynamicSeederFunction()` with schema-aware logic
- POSTs the generated code to the Supabase Management API under the slug `seed-data`
- The generated function is deployed to the **user's own Supabase project**, not this one

## When to edit this file vs. the template

| Goal | Edit this file | Edit template |
|------|---------------|---------------|
| Change the live seeding behavior | ❌ No effect | ✅ Yes |
| Manual deploy via `supabase functions deploy` | ✅ Yes | ❌ No |
| Fix a bug users hit during seeding | ❌ No effect | ✅ Yes |
| Update this as reference/documentation | ✅ OK | — |

## Summary

If you're fixing a seeding bug or improving seeding behavior:
→ **Edit `lib/edge-functions/dynamic-seeder-template.ts`**, not this file.
