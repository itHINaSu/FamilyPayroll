import { vi } from "vitest";

/**
 * `server-only` is a Next.js build-time guard with no runtime implementation.
 * Every module in the service layer imports it, so it is stubbed once here
 * rather than in each test file.
 */
vi.mock("server-only", () => ({}));
