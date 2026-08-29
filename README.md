# LibreLMS API

Strapi v5 backend for LibreLMS, a learning management system. Runs on
Postgres (Neon) with content-types and role-based access to come.

## Requirements

- Node >= 20 (<= 26)
- Bun (package manager)
- A Postgres database

## Setup

```bash
bun install
cp .env.example .env
```

Fill in the database credentials and generate the secrets:

```bash
openssl rand -base64 32   # repeat for each key/salt/secret in .env
```

## Development

```bash
bun run develop   # http://localhost:1337/admin
```

## Production

```bash
bun run build
bun run start
```

## Structure

- `config/` - Strapi configuration (database, server, plugins)
- `src/api/` - content-types and custom controllers/routes
- `src/extensions/` - plugin customizations
- `database/migrations/` - SQL migrations
