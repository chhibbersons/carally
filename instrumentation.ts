/** Runs once when the server boots: fail fast on bad environment variables (§10). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}
