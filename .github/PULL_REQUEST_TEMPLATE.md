## What and why

<!-- One or two sentences: what changes and the reason for it. -->

## How it was tested

- [ ] `pnpm verify:all` exits 0
- [ ] new or changed database rules have accepting and refusing pgTAP tests
- [ ] new pages or components checked in both themes and by keyboard

## Checklist

- [ ] schema changes are new migrations with `up` and `down`
- [ ] every new constraint, index and trigger is named
- [ ] generated docs regenerated where needed (`docs:catalog`, `docs:schema`, `docs:report`)
- [ ] no secrets, no `.env.local`
