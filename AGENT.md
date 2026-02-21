# Digit Project - AI Agent Guidelines

This document provides instructions and guidelines for AI agents working on the `digit` repository.

## 🏗️ Project Overview
- **Framework:** Angular 19 (Standalone Components)
- **Language:** TypeScript
- **Styling:** SASS (.sass)
- **Rendering:** Server-Side Rendering (SSR) is enabled.
- **Key Libraries:** `rxjs`, `zone.js`, `express` (for SSR).

## 🧑‍💻 Architecture & Conventions

### 1. Standalone Components
- The project strictly uses **Angular Standalone Components**. Do not generate or use `NgModule`.
- Ensure all necessary dependencies (CommonModule, other components, pipes, directives) are explicitly added to the `imports` array of the `@Component` decorator.
- Use `standalone: true` in all components, directives, and pipes.

### 2. Angular 19 Control Flow & Features
- Use the modern built-in control flow (`@if`, `@for`, `@switch`, `@empty`) in templates instead of legacy structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`).
- For new reactive state, prefer Angular **Signals** (`signal`, `computed`, `effect`) over RxJS `BehaviorSubject` where appropriate, to simplify state management and improve performance.
- Use RxJS primarily for event streams and complex asynchronous operations.

### 3. Routing & Guards
- Define routes using the modern functional approach.
- Prefer functional guards (`CanActivateFn`) and resolvers over class-based guards/resolvers.

### 4. Styling
- Only use SASS (`.sass`) for component styling.
- Keep styles scoped within the component using `styleUrl`.
- Reusable styles should be placed appropriately in the global style files.

### 5. Type Safety & TypeScript
- Write strict, strongly-typed TypeScript code.
- Avoid using `any`. Instead, define proper interfaces or types.
- Enable `strict` mode rules implicitly where possible. Handle nullability explicitly (e.g., using optional chaining `?.` or nullish coalescing `??`).

### 6. Code Style & Readability
- Keep components small and focused on a single responsibility. Delegate complex logic to services.
- Ensure services are provided in the root where possible (`@Injectable({ providedIn: 'root' })`).
- Group imports logically (Angular core, third-party libraries, local components/services).

### 7. Server-Side Rendering (SSR)
- Be mindful of SSR when writing code. Avoid direct DOM manipulation (like `document`, `window`, etc.) in the component class without checking if the code is running in the browser.
- Use `afterRender` or `afterNextRender` for browser-only APIs if necessary, or inject `PLATFORM_ID` and use `isPlatformBrowser()`.

## 🛠️ Typical Scripts
- `npm start` / `npm run start` - Starts the development server.
- `npm run build` - Builds the application for production.
- `npm run test` - Runs unit tests via Karma/Jasmine.
- `npm run serve:ssr:digit` - Starts the Server-Side Rendering server.

---
**Note to AI:** By adhering to these guidelines, you ensure that the codebase remains modern, maintainable, and aligned with the latest Angular standards.
