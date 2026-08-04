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
- **OCR pipeline (default, client-side)**: `OcrService` (`ocr.service.ts`) wraps `tesseract.js`, lazily creating a single worker and exposing `extractText(image)`. `utils/bill-text-parser.ts`'s `parseBillText()` takes raw OCR text and heuristically regex-extracts date/quantity/rate/total/vendor — it's best-effort and designed to be corrected by the user, not authoritative. `MilkBillFormComponent` orchestrates: image select → OCR → parse → pre-fill form fields, tracking which fields were auto-filled (`autoFilledFields`) so the template can flag them as "detected" until the user edits them.
- **OCR pipeline (alternative, server-side)**: `OllamaOcrService` (`ollama-ocr.service.ts`) posts the image as `multipart/form-data` to `http://localhost:5257/api/ocr` (the `server/OcrOllamaApi` .NET project below), which runs it through a local Ollama vision model. Triggered manually via the "Re-scan with Ollama (server)" button in the form once an image is selected — it's not run automatically, and it reuses the same `parseBillText()` + `applyParsedText()` fill logic as the Tesseract path. Requires both `server/OcrOllamaApi` and Ollama itself to be running; if the API is unreachable the form falls back to showing an error and leaves fields as-is.
- **Model duplication gotcha**: there are two files defining `MilkBill`/`MilkBillDraft` — `features/milk-bill/milk-bill.model.ts` and `features/milk-bill/models/milk-bill.model.ts`. All current code imports from `./models/milk-bill.model` (the `models/` subfolder version); the top-level one is unused. When editing the model, update `models/milk-bill.model.ts` and check for actual imports before assuming the other file matters.
- Tesseract.js defaults to pulling worker/core/lang files from a CDN at runtime (fine for dev). For production/offline use it needs local worker/core/`eng.traineddata` files configured in `createWorker()` — see comment in `ocr.service.ts`.

## server/ (.NET — Ollama vision OCR)

`server/OcrOllama.slnx` ties together three .NET 9 projects. All of them talk to a locally running [Ollama](https://ollama.com) multimodal model (default `llava`) via its `/api/generate` endpoint.

- **`OcrOllama.Core`** — shared library. `OllamaVisionClient` (constructor takes an `HttpClient` whose `BaseAddress` is the Ollama host — the caller owns/configures/disposes it) exposes `ExtractTextAsync(model, prompt, imageBytes, ct)`. Request/response DTOs use a source-generated `JsonSerializerContext`.
- **`OcrOllamaConsole`** — CLI, independent of the Angular app. `dotnet run --project server/OcrOllamaConsole -- <image-path> [--model <name>] [--host <url>] [--prompt <text>]`. Creates its own `HttpClient` in `Program.cs`.
- **`OcrOllamaApi`** — ASP.NET Core minimal API that the Angular app calls. `dotnet run --project server/OcrOllamaApi` serves on `http://localhost:5257` by default (see `Properties/launchSettings.json`). Exposes `POST /api/ocr` (multipart form field `image`, optional `model`/`prompt` fields) → `{ "text": "..." }`. CORS is locked to a single allowed origin read from config (`Ollama:AllowedOrigin` in `appsettings.json`, default `http://localhost:4200`) — update that value (or `Ollama:Host` / `Ollama:Model`) rather than hardcoding elsewhere. Registers `OllamaVisionClient` via `AddHttpClient<T>` so `IHttpClientFactory` owns pooling/disposal.
- All three require Ollama running locally (`ollama serve`) with the target model pulled (`ollama pull llava`).
- The Angular app's `OllamaOcrService` (see above) is a manual, opt-in alternative to Tesseract.js — running the Angular dev server alone does **not** give you OCR unless `OcrOllamaApi` (and Ollama) are also running.
