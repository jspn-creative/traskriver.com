# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**

- Bun built-in test runner (`bun:test`) — used in `packages/relay/src/state-machine.test.ts`
- Config: Not applicable — no `vitest.config.*` or `jest.config.*` in repo

**Assertion Library:**

- Expect-style API from `bun:test` (`expect`, `describe`, `it`)

**Run Commands:**

```bash
cd packages/relay && bun test    # Run relay unit tests (discovers *.test.ts)
```

```bash
bun check                          # Typecheck only (root); does not run tests
```

**Note:** `packages/relay/package.json` has no `test` script; invoke `bun test` from `packages/relay` (or path to file) explicitly.

**Web package:** No `*.test.*` or `*.spec.*` under `packages/web/src/` — frontend tests not present in tree.

**Shared package:** No test files detected under `packages/shared/`.

## Test File Organization

**Location:**

- Co-located with source: `state-machine.test.ts` next to `state-machine.ts` in `packages/relay/src/`

**Naming:**

- `*.test.ts` (Bun convention)

**Structure:**

```
packages/relay/src/
├── state-machine.ts
├── state-machine.test.ts
└── ...
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, it } from 'bun:test';
import { RelayStateMachine } from './state-machine';

describe('RelayStateMachine', () => {
	it('starts idle and validates transitions', () => {
		const machine = new RelayStateMachine();
		expect(machine.getState()).toBe('idle');
		expect(machine.transition('starting', 'demand detected')).toBe(true);
		// ...
	});
});
```

(Source: `packages/relay/src/state-machine.test.ts`)

**Patterns:**

- Single top-level `describe` per module under test
- Behavioral `it('...')` descriptions in sentence form
- Instantiate class under test, assert state and return values (no mocks in this file)

## Mocking

**Framework:** Not used in existing test — no `mock`, `spyOn`, or stub imports in `packages/relay/src/state-machine.test.ts`

**Patterns:**

```typescript
// Not applicable — current suite has no mocks
```

**What to Mock:**

- Not established in repo; for new tests, mock external I/O (network, filesystem, `platform.env`) at boundaries

**What NOT to Mock:**

- Pure domain logic (`RelayStateMachine`) — exercised directly in current example

## Fixtures and Factories

**Test Data:**

- Inline literals in the single test file (strings for transition reasons, no shared fixture folder)

**Location:**

- Not applicable — no `fixtures/` or `__fixtures__/` in packages

## Coverage

**Requirements:** None enforced — no `c8`, `istanbul`, or coverage scripts in `package.json` files

**View Coverage:**

```bash
# Not configured — add tooling if coverage becomes a requirement
```

## Test Types

**Unit Tests:**

- Scope: In-repo example covers relay state machine behavior only (`packages/relay/src/state-machine.test.ts`)

**Integration Tests:**

- Not detected in application packages

**E2E Tests:**

- Not used — no Playwright/Cypress dependencies in workspace `package.json` files

## Common Patterns

**Async Testing:**

```typescript
// Example from existing file uses sync it(); for async:
it('handles async case', async () => {
	const result = await someAsyncFn();
	expect(result).toBe(expected);
});
```

(Pattern inferred; current `state-machine.test.ts` is synchronous only.)

**Error Testing:**

```typescript
// Current file asserts boolean false from invalid transition:
expect(machine.transition('idle', 'invalid direct stop')).toBe(false);
```

---

_Testing analysis: 2026-04-09_
