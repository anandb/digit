# Digit - Application Context for AI Agents

This document provides a detailed overview of the **Digit** application to help AI agents understand its purpose, domain model, architecture, and coding conventions.

## 📌 Application Overview

**Digit** is an advanced, web-based diagram editor. Unlike simple flat-diagramming tools, Digit is built around **hierarchical and nested diagrams**. This means a user can create a diagram node, double-click it, and dive into a completely new "inner" diagram, allowing for unlimited nesting depth.

It allows users to visually model system architectures, flowcharts, network topologies, and data flows with precision and deep structure.

## 🧠 Core Domain Concepts

To work on Digit, you must understand its primary entities:

### 1. Elements (Nodes / Shapes)
- The primary building blocks of a diagram (Rectangles, Circles, SVGs, etc.).
- They can contain text, have specific dimensions, and maintain a style (colors, borders).
- **Nesting:** Every element can act as a container for an entirely new inner diagram.

### 2. Tendrils (Connection Points)
- Instead of simple rigid connection points, Digit uses "Tendrils."
- Tendrils are dynamic points attached to the border of an element.
- Users can add tendrils, drag them along the element's perimeter, and snap them to precise locations.
- **Exposed Tendrils:** Tendrils can be marked as "exposed," meaning they pass through the boundary of an inner diagram and are visible/connectable on the parent diagram level.

### 3. Edges (Connections)
- Edges connect two tendrils. They automatically route and update live as elements or tendrils move.
- Edges can have labels and different styles.

## 🏗️ Architecture & Component Structure

The application heavily relies on Angular and SVG for rendering.

### State Management (`DiagramService`)
- Centralized reactive state using RxJS and Angular Signals.
- Maintains the current diagram state, the hierarchical breadcrumb path (which level the user is currently viewing), and the 50-step undo/redo buffer.
- Handles logic for adding/moving elements, connecting tendrils, and saving/loading JSON data.

### Main Canvas (`DiagramCanvasComponent`)
- The core interactive surface of the application.
- Renders elements and edges using SVG (`<svg>`) for crisp scaling.
- Handles complex pointer events for:
  - Dragging and dropping elements.
  - Multi-selection (Shift + Click).
  - Dragging tendrils along element perimeters.
  - Edge routing calculations.
- Detects double-clicks to drill down into nested diagrams.

### UI Components
- **`DiagramToolbarComponent`**: The sidebar providing tools to add new shapes, change styling (colors, stroke), and manage element properties.

## 💾 Data Persistence
- Diagrams are serialized and deserialized to/from JSON.
- The state includes both the root diagram and all nested child diagrams in a structured format.
- Sidebar preferences and local state may persist across sessions via browser storage.

## 🚀 Key Workflows for AI Agents

If tasked with adding features to Digit, keep these flows in mind:
1. **Adding a New Shape:** Update the `getCustomShapePoints` or equivalent logic in the canvas component to generate the correct SVG path data.
2. **Modifying Connections:** Tendril logic is complex. Ensure any changes to positioning respect the element's bounding box and border constraints.
3. **Hierarchy Changes:** When dealing with nested diagrams, always ensure you are querying or updating the *current active level* via the `DiagramService`, unless explicitly working with cross-level propagated tendrils.

## 🧑‍💻 Technical Architecture & Conventions

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
