# karaoke-type

Type along to song lyrics in sync with the music (inspired by memetrollsXD/karaoketype, with permission). Based on Rutger505-Org/nextjs-template: same stack, CI/K3s deploy, branch/PR rules and pitfalls, see that repo's AGENTS.md.

- Songs: pipeline + data live in the private repo Rutger505-Org/karaoke-type-songs (its docs/songs.md), published to `cdn.rutgerpronk.com/karaoke/`; app reads that catalog server-side, schema = zod in `src/lib/catalog.ts`
- Prod `https://karaoke-type.rutgerpronk.com`, previews `https://pr-<N>.karaoke-type.rutgerpronk.com`
- Nothing copyrighted (lyrics, audio) and no song pipeline/download tooling in this public repo; README/docs stay high level about where songs come from
- Song requests: `/request` (anonymous allowed) → `song_request` table + Discord ping (`DISCORD_WEBHOOK_URL`, repo secret). Triage on `/admin`; adding the song is manual (compile + publish in karaoke-type-songs, then mark added)
- Admins: `admin_email` whitelist (seeded with rutger.pronk11@gmail.com in migration 0005), managed on `/admin`. Admin = whitelisted AND `emailVerified` (magic link), so a password sign-up with someone else's address never gets admin. Magic-link sign-up only for whitelisted emails (check in `sendMagicLink`, other unknown emails silently get no mail)
- Display names: public on leaderboards, never show emails there. Rules + fallback `player-<id>` in `src/lib/display-name.ts`; set on `/account` (`account.setName`), Better Auth `databaseHooks` validate names set via its own endpoints. Magic-link sign-ups have no name: every sign-in lands on `/auth/continue`, which sends nameless users to `/account` first
- Discord: server-only (`src/server/discord.ts`); internal tRPC errors are reported from the route handler. No client-side reporting (was an open server action relaying to the webhook)
