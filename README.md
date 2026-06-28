# Makina

A visual editor, converter, and simulator for **NFAs** and **DFAs** — finite automata. Draw states and transitions on an infinite canvas, simulate input strings step-by-step, and (soon) convert between NFA ⇄ DFA, minimize, build from regex, and run test suites.

Built as a client-only Angular SPA. No backend, no accounts, no telemetry.

---

## Quick start

```bash
npm install
npm start
```

Open `http://localhost:4200`. Your work autosaves to localStorage (per browser).

## Scripts

| Command           | Does                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `npm start`       | Dev server with hot reload                                            |
| `npm run build`   | Production build to `dist/automata-studio/browser/`                   |
| `npm test`        | Vitest unit tests (algorithms are well-covered; components are thin)  |
| `npm run deploy`  | Wraps `deploy.sh` (S3 + Cloudflare). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## What's in this repo

- **Visual canvas** — states/transitions drawn as SVG, drag, zoom, marquee select, undo/redo
- **Simulation** — step through an input string and watch active states light up
- **Algorithms** — Thompson construction, subset construction, Hopcroft minimization, DFA→regex (state elimination)
- **Multiple workspaces** — open multiple windows; URL hash carries the workspace ID
- **Light/dark themes** — follows OS preference on first load, then sticky

## Documentation

- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — how to use the editor (tools, shortcuts, workflows)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — codebase layout, state model, conventions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — S3 + Cloudflare runbook

## Tech stack

| | |
| --- | --- |
| Framework | Angular 21 (standalone components, signals) |
| Build | `@angular/build:application` |
| Styles | SCSS + Tailwind v4 (utility classes); paper/ink palette |
| Tests | Vitest |
| Hosting | S3 static website behind Cloudflare (free tier) |

## Status

Prototype. Convert / Regex / Tests / Library tabs are locked with a "soon" badge — the code exists and works, but they're hidden until polish is done. To unlock one for development, remove `locked: true` from the matching row in [src/app/features/editor/inspector/inspector.component.ts](src/app/features/editor/inspector/inspector.component.ts).
