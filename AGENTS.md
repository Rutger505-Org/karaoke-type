# karaoke-type

Type along to song lyrics in sync with the music (inspired by memetrollsXD/karaoketype, with permission). Based on Rutger505-Org/nextjs-template: same stack, CI/K3s deploy, branch/PR rules and pitfalls, see that repo's AGENTS.md.

- Songs: compiled offline by `tools/songc` (Python/uv, heavy steps via buildq) into the private repo Rutger505-Org/karaoke-type-songs, published to `cdn.rutgerpronk.com/karaoke/`; app reads that catalog server-side. Workflow + pitfalls: docs/songs.md
- Prod `https://karaoke-type.rutgerpronk.com`, previews `https://pr-<N>.karaoke-type.rutgerpronk.com`
- Nothing copyrighted (lyrics, audio) in this public repo: data repo + CDN only
