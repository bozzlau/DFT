# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + React + TypeScript app named `fourier-audio-lab`.
Source files live in `src/`:

- `src/main.tsx` mounts the React app.
- `src/App.tsx` contains the audio analysis experience and Web Audio logic.
- `src/WaveDesk.tsx` contains the Fourier wave synthesis workspace.
- `src/styles.css` defines the global visual system and responsive layout.
- `src/vite-env.d.ts` provides Vite type declarations.

Static entry files are `index.html` and `vite.config.ts`. Production output is generated into `dist/`; treat it as build output, not the primary editing target.

## Build, Test, and Development Commands

- `npm install` installs project dependencies from `package-lock.json`.
- `npm run dev` starts Vite on `127.0.0.1` for local development.
- `npm run build` runs TypeScript checking with `tsc`, then creates the production bundle with Vite.
- `npm run preview` serves the built `dist/` output locally for final inspection.

There is currently no dedicated test script. Use `npm run build` as the minimum verification step before handing off changes.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Keep component names in `PascalCase` (`WaveDesk`), helper functions in `camelCase` (`drawSpectrum`), and constants in `UPPER_SNAKE_CASE` when they represent fixed configuration (`FFT_SIZE`). Prefer explicit local types for structured data, as seen with `Spectrum`, `Band`, and `WaveComponent`.

The existing code uses two-space indentation, double quotes for imports/strings, semicolons, and CSS custom properties for shared colors. Follow the current file style rather than introducing a new formatter configuration.

## Testing Guidelines

No test framework is configured yet. For changes to parsing, FFT, canvas drawing, or Web Audio behavior, add focused tests only after introducing an agreed test runner such as Vitest. Until then, manually verify the affected UI flows in the browser and run `npm run build`.

## Commit & Pull Request Guidelines

Git history currently contains one concise imperative-style commit: `Archive wave synthesis desk`. Keep future commit messages short, specific, and action-oriented, for example `Add spectrum band controls`.

Pull requests should include a brief summary, verification steps, and screenshots or screen recordings for visible UI changes. Link related issues when available and call out any limitations, browser API assumptions, or missing tests.

## Agent-Specific Instructions

Answer in Chinese when collaborating in this workspace. Do not batch-delete files or directories; if deletion is necessary, remove only one explicit file path at a time and ask before any broader cleanup.
