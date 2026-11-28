function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBudgetError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "budget" in error
    && (error as { budget?: boolean }).budget === true,
  );
}

/** One charge per network attempt, including a retry after 429, 5xx, or a dropped connection. */
export async function eachTmdbHttpAttempt(
  charge: () => Promise<void>,
  send: () => Promise<Response>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await charge();
    try {
      const response = await send();
      if (response.status !== 429 && response.status < 500) return response;
      lastStatus = response.status;
    } catch (error) {
      if (isBudgetError(error)) throw error;
      lastStatus = 0;
    }
    if (attempt < 2) await wait(Math.min(2000, 300 * (attempt + 1)));
  }
  throw Object.assign(
    new Error(lastStatus ? `TMDB ${lastStatus}` : "TMDB request failed"),
    { status: lastStatus || 504 },
  );
}
