# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains all TypeScript source code. Key areas include `routes/` (API endpoints), `services/` (business logic), `providers/` (DeepL/Google integration), `db/` (migrations/queries), and `utils/` (shared helpers).
- `src/__tests__/` holds Jest tests (e.g., `validation.test.ts`).
- `scripts/` contains operational scripts such as `download-model.sh` for fastText.
- `docker/` and `docker-compose.yml` define local infra (PostgreSQL, app runtime).
- Build artifacts compile to `dist/`.

## Build, Test, and Development Commands
- `npm run dev` starts the API in watch mode via `ts-node-dev`.
- `npm run build` compiles TypeScript to `dist/`.
- `npm start` runs the compiled server from `dist/index.js`.
- `npm test` runs Jest once; `npm run test:watch` keeps tests running.
- `npm run test:coverage` generates coverage reports in `coverage/`.
- `npm run lint` and `npm run format` enforce code quality.
- `npm run migrate` applies database migrations.
- `npm run download-model` fetches the fastText language model.

## Coding Style & Naming Conventions
- TypeScript with `strict` enabled (see `tsconfig.json`).
- Indentation follows the formatter (Prettier); run `npm run format` before pushing.
- ESLint enforces style in `src/**/*.ts`.
- Prefer clear, domain-driven names (e.g., `normalizeText`, `TranslationProvider`).

## Testing Guidelines
- Jest with `ts-jest` is configured in `jest.config.js`.
- Tests live under `src/__tests__/` and use `*.test.ts` naming.
- Add tests for new providers, validation rules, and pipeline changes.

## Commit & Pull Request Guidelines
- Recent commits follow a Conventional Commit style like `feat: ...`. Keep messages short and scoped.
- PRs should include: a clear summary, test results (`npm test`), and any relevant configuration changes (e.g., `.env` updates or new migrations).

## Architecture Overview
- Express API in `src/app.ts` exposes `/v1/normalize` and `/v1/normalize/batch` routes with API key auth middleware.
- The normalization pipeline detects language (fastText), applies glossary preservation, translates via provider adapters, and records usage.
- Providers live in `src/providers/`, while orchestration sits in `src/services/`.

## Configuration & Secrets
- Runtime config is provided via `.env` (see `.env.example`).
- Never commit API keys or cloud credentials; use `DEEPL_API_KEY` and `GOOGLE_APPLICATION_CREDENTIALS` locally.
