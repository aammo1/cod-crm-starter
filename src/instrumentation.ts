export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeEnv, runtimeEnvWarnings } = await import("./lib/env");
    validateRuntimeEnv();
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { log } = await import("./lib/log");
      for (const warning of runtimeEnvWarnings()) log.warn("env.warning", { message: warning });
    }
    const { startWorkers } = await import("./lib/workers");
    startWorkers();
    const { scheduleStorefrontWarmup } = await import("./lib/storefront/warmup");
    scheduleStorefrontWarmup();
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./lib/log");
  const digest = (err as { digest?: unknown } | null)?.digest;
  log.error("request.error", {
    // Path only: the query string may carry tokens.
    route: context.routePath ?? request.path.split("?")[0],
    method: request.method,
    routeType: context.routeType,
    digest: typeof digest === "string" ? digest : undefined,
    message: err instanceof Error ? err.message : String(err),
  });
}
