export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorkers } = await import("./lib/workers");
    startWorkers();
    const { scheduleStorefrontWarmup } = await import("./lib/storefront/warmup");
    scheduleStorefrontWarmup();
  }
}
