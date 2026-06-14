![PrivatePad project cover](./public/project-cover.png)

<h1 align="center">🔐 PrivatePad</h1>

<p align="center">
  <strong>Zero-knowledge encrypted online notepad</strong>
</p>

<p align="center">
  Notes are encrypted in the browser before they are stored. The server stores only ciphertext and minimal metadata.
</p>

<p align="center">
  <span>🔒 No login</span> ·
  <span>🧠 Browser-side encryption</span> ·
  <span>🗄️ Ciphertext-only storage</span>
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Encrypted_Storage-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
</p>

PrivatePad is inspired by ProtectedText: open a custom note slug, enter a password locally, write your notes, and save.

## About

PrivatePad is built for simple private writing without accounts, logins, or recovery flows. A user can visit a custom URL such as `/my-note`, unlock or create the note with a password, edit the note in a browser-only plaintext editor, and save it as encrypted ciphertext.

The core privacy rule is simple: plaintext note content and raw passwords never leave the browser.

## Features

- Custom slug-based notes
- Browser-side password unlock/create flow
- Client-side encryption and decryption with the Web Crypto API
- Tabbed plaintext editor stored inside one encrypted notebook payload
- Save status states for idle, unsaved, saving, saved, failed, and conflict cases
- Revision-based conflict detection for safer concurrent saves
- Local lock action to remove plaintext from the visible editor UI
- Hard delete flow with confirmation and revision protection
- Light/dark theme support with local-only theme preference
- Production security headers and Content Security Policy support

## Zero-Knowledge Security Model

PrivatePad is designed so the server cannot read note contents.

The browser handles:

- Raw password input
- Password-based key derivation
- Plaintext note content
- Encryption and decryption

The server stores only:

- Slug
- Ciphertext
- Salt and IV
- Public crypto metadata
- Revision number
- Created and updated timestamps

The server must not receive plaintext notes, raw passwords, derived keys, password verifiers, tab labels, tab counts, or active-tab state outside the encrypted payload.

> If a password is forgotten, the note cannot be recovered. This is an intentional part of the zero-knowledge model.

## Tech Stack

- [Next.js](https://nextjs.org/) App Router
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [PostgreSQL](https://www.postgresql.org/)
- [Drizzle ORM](https://orm.drizzle.team/)
- Web Crypto API
- [Vitest](https://vitest.dev/)

## Getting Started

### Prerequisites

- Node.js
- pnpm
- PostgreSQL database

### Installation

Install dependencies:

```bash
pnpm install
```

Create an environment file and provide a PostgreSQL connection string:

```env
DATABASE_URL="postgres://user:password@localhost:5432/privatepad"
```

Run database migrations:

```bash
pnpm db:migrate
```

Start the development server:

```bash
pnpm dev
```

Open the app at:

```txt
http://localhost:3000
```

## Environment Variables

| Variable       | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string used by Drizzle runtime and migrations. |

## Available Scripts

| Script             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Start the development server.                     |
| `pnpm build`       | Create a production build.                        |
| `pnpm start`       | Start the production server.                      |
| `pnpm lint`        | Run ESLint.                                       |
| `pnpm typecheck`   | Run TypeScript checks.                            |
| `pnpm test`        | Run the Vitest test suite.                        |
| `pnpm db:generate` | Generate Drizzle migrations after schema changes. |
| `pnpm db:migrate`  | Apply database migrations.                        |

## Project Structure

```txt
app/                 Next.js App Router pages and API routes
components/          UI components and note editor experience
db/                  Drizzle database schema and client
drizzle/             SQL migrations
lib/crypto/          Browser-side encryption helpers
lib/notes/           Note contracts, notebook helpers, and repository logic
lib/rate-limit/      In-process request rate limiting
lib/security/        Production CSP and security header helpers
lib/validation/      Shared slug validation
public/              Static assets, including the project cover
```

## Deployment Notes

PrivatePad requires PostgreSQL for durable note persistence.

For public production use, the supported deployment mode is one Node/Next.js app process behind a trusted HTTPS/TLS reverse proxy. The proxy should terminate or enforce HTTPS and sanitize forwarding headers used by rate limiting, such as `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip`.

Clustered workers, multi-instance deployments, direct-public `next start`, Vercel/edge runtime deployments, and uncoordinated reverse-proxy setups need additional shared, provider, edge, or proxy-level rate limiting before public release.

## Quality Checks

The project includes checks for linting, type safety, tests, and production builds:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Current Scope

PrivatePad v1 intentionally keeps the product small and auditable.

Not included in this version:

- No accounts or login
- No email or password recovery
- No note sharing or permissions
- No billing or subscriptions
- No rich text editor
- No file attachments
- No mobile app
- No collaborative editing

## Portfolio Summary

PrivatePad demonstrates a privacy-first web application architecture with browser-side cryptography, strict API boundaries, encrypted database persistence, App Router routing, PostgreSQL storage, and security-focused deployment planning.
