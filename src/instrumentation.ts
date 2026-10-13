/**
 * Boot hook. Runs once when the server process starts, before it serves traffic.
 *
 * Importing the db module here forces migrations to run at startup rather than
 * lazily on the first request, so a container that comes up healthy is a
 * container whose schema is current.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initDatabase } = await import("@/db");
  const { getSessionSecret } = await import("@/lib/secrets");
  const { startScheduler } = await import("@/lib/scheduler");
  const { adoptOrphans } = await import("@/lib/adopt");

  initDatabase(); // opens the connection and runs migrations
  adoptOrphans(); // every expectation and bill gets a family entry in Setup
  getSessionSecret(); // generate-and-persist on first boot
  startScheduler();
}
