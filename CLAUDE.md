# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MilkApp is an Angular 19 standalone-component app for logging milk delivery bills. A user photographs/uploads a bill, the app runs client-side OCR (Tesseract.js) to auto-extract fields (date, quantity, rate, total, vendor), the user confirms/edits, and the record is persisted in the browser's IndexedDB. There is no backend — everything (including the bill image as a base64 data URL) lives in IndexedDB.

## Commands

- `npm start` / `ng serve` — run the dev server at `http://localhost:4200/`
- `ng build` — production build to `dist/milk-app` (dev build: `ng build --configuration development`)
- `npm test` / `ng test` — run unit tests via Karma/Jasmine (interactive Chrome runner)
- `ng generate component features/<feature>/<name>` — scaffold a new standalone component (schematics default to SCSS style)

There is no e2e test setup and no lint script configured in `package.json`.

## Architecture

- **Standalone components, no NgModules.** Bootstrapping is via `app.config.ts` (`provideRouter`, `provideZoneChangeDetection`), not a root module.
- **Routing is lazy and feature-scoped.** `app.routes.ts` lazy-loads `features/milk-bill/milk-bill.routes.ts` at path `''`, which in turn lazy-loads the list (`''`) and form (`'new'`) components individually via `loadComponent`. Follow this pattern when adding new features/routes: a per-feature `*.routes.ts` file, wired into `app.routes.ts` via `loadChildren`.
- **State management uses Angular signals**, not RxJS/NgRx. `MilkBillService` (`src/app/features/milk-bill/milk-bill.service.ts`) holds a `signal<MilkBill[]>` and exposes derived `computed()` views (`allBills` sorted by date desc, `totalSpent`, `isLoading`). Components read these signals directly in templates.
- **Persistence is a hand-rolled IndexedDB wrapper** inside `MilkBillService` — no storage library. One object store (`bills`) keyed by `id`, indexed by `billDate`. All bill records include the full image as a base64 `imageDataUrl`.
- **OCR pipeline**: `OcrService` (`ocr.service.ts`) wraps `tesseract.js`, lazily creating a single worker and exposing `extractText(image)`. `utils/bill-text-parser.ts`'s `parseBillText()` takes raw OCR text and heuristically regex-extracts date/quantity/rate/total/vendor — it's best-effort and designed to be corrected by the user, not authoritative. `MilkBillFormComponent` orchestrates: image select → OCR → parse → pre-fill form fields, tracking which fields were auto-filled (`autoFilledFields`) so the template can flag them as "detected" until the user edits them.
- **Model duplication gotcha**: there are two files defining `MilkBill`/`MilkBillDraft` — `features/milk-bill/milk-bill.model.ts` and `features/milk-bill/models/milk-bill.model.ts`. All current code imports from `./models/milk-bill.model` (the `models/` subfolder version); the top-level one is unused. When editing the model, update `models/milk-bill.model.ts` and check for actual imports before assuming the other file matters.
- Tesseract.js defaults to pulling worker/core/lang files from a CDN at runtime (fine for dev). For production/offline use it needs local worker/core/`eng.traineddata` files configured in `createWorker()` — see comment in `ocr.service.ts`.
