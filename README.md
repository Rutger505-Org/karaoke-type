# KaraokeType

A karaoke typing game: a song plays and its synced lyrics appear line by line. Type each line while it's being sung. Accuracy scores points, finishing a line perfectly before it ends earns a small bonus, and perfect lines in a row build a combo multiplier. Signed-in players get their best score on the per-song leaderboard.

Inspired by and made with permission of [memetrollsXD/karaoketype](https://github.com/memetrollsXD/karaoketype).

## How it works

- **Lyrics** come from [LRCLIB](https://lrclib.net) at runtime (server-side, cached for a day). No lyrics are stored in this repository.
- **Playback** uses the official [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) embed. The video's current time is the game clock.
- **Songs** are listed in [src/lib/songs.ts](src/lib/songs.ts): slug, YouTube id, LRCLIB lookup parameters and an optional `offsetMs` to line the lyrics up with the video.
- **Scoring** lives in [src/lib/scoring.ts](src/lib/scoring.ts): 10 points per correct character, −5 per wrong one, +50 (+ up to 25 for finishing early) for a line typed perfectly before its window ends, and perfect lines in a row multiply by 1 + 0.1 × combo (max 2×).

## Getting started

### Development

Copy the [.env.example](.env.example) file to a new file `.env` and fill in the variables.

```bash
cp .env.example .env
```

Run the database migration command:

```bash
bun db:migrate
```

Then start the development server:

```bash
bun dev
```

Run the unit tests:

```bash
bun test
```

### Deployment variables

#### Variables

- `APPLICATION_NAME` - Used as an identifier for multiple actions such as the Kubernetes deployment name and Terraform workspace.
- `BASE_DOMAIN` - Domain where to host the application. `main` is deployed to this domain; pull requests to `pr-<number>.<BASE_DOMAIN>`.
- `DEPLOYMENT_AUTH_EMAIL_FROM` - Display name shown as the sender of the magic link emails (e.g. `KaraokeType`). The actual sender address is taken from `AUTH_EMAIL_USER`; the `From` header is composed as `AUTH_EMAIL_FROM <AUTH_EMAIL_USER>`.

The following variables are configured at the organisation level and are inherited automatically — no action needed per repository.

- `DOCKERHUB_USERNAME` - Docker Hub username for pushing images.

#### Secrets

The following secrets must be configured per repository.

- `DEPLOYMENT_AUTH_SECRET` - Better Auth secret for encrypting JWTs (generate with `bunx auth secret --raw`).
- `DEPLOYMENT_DISCORD_WEBHOOK_URL` - Discord webhook URL for in-application alerts.

The following secrets are configured at the organisation level and are inherited automatically — no action needed per repository.

- `KUBECONFIG` - Kubernetes cluster config for deploying to the cluster.
- `TAILSCALE_OAUTH_CLIENT_ID` - Tailscale OAuth client ID used to connect the CI runner to the private cluster network.
- `TAILSCALE_OAUTH_SECRET` - Tailscale OAuth secret paired with the client ID above.
- `DOCKERHUB_TOKEN` - Docker Hub access token.
- `DEPLOYMENT_AUTH_EMAIL_HOST` - SMTP host (e.g. `smtp.gmail.com`).
- `DEPLOYMENT_AUTH_EMAIL_PORT` - SMTP port (e.g. `465`).
- `DEPLOYMENT_AUTH_EMAIL_USER` - SMTP username (for Gmail, this is your email address).
- `DEPLOYMENT_AUTH_EMAIL_PASSWORD` - SMTP password (for Gmail, use an App Password).

To use a different mail server in a repository, override these as repository **secrets** with the same name. A repository variable won't work: the organisation secret takes precedence over it (see [Deployments](#deployments)).

## Deployments

To pass additional environment variables to the running container, create a GitHub variable or secret and prefix the name with `DEPLOYMENT_`. The prefix is stripped before the value is injected into the container.

When a variable and a secret have the same name, the secret wins, including secrets inherited from the organisation. A repository secret overrides an organisation secret with the same name.

## Guides

### Database

#### Migrations

To create a new migration, run the following command:

```bash
bun db:generate -- --name "<migration-name>"
```

Then to run all migrations, run:

```bash
bun db:migrate
```

When migration is imperfect,
delete the migration file, delete the new snapshot file in the meta-folder and roll back the \_journal.json file.

When thats done you can run the migration command again.

#### Database in Kubernetes

You can copy the sqlite file over this command:

```bash
kubectl cp <namespace>/<pod-name>:/app/data/db.sqlite ./prod-db.sqlite
```

With k9s you can copy the pod name with `c`

Windows with Datagrip shows a warning locking issues will occur because of WSL.
Copy the file to your Windows filesystem with the following command:

```bash
kubectl cp <namespace>/<pod-name>:/app/data/db.sqlite  /mnt/c/Users/<user>/Documents/
```
