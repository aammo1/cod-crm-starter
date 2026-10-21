// Per Node process, deliberately small for the shared storefront VPS.
const users = new Map<string, { startedAt: number; count: number; active: boolean }>();
let active = 0;

export function claimAssistantRequest(userId: string, now = Date.now()): (() => void) | null {
  for (const [id, state] of users) {
    if (!state.active && now - state.startedAt >= 3600000) users.delete(id);
  }
  const state = users.get(userId) ?? { startedAt: now, count: 0, active: false };
  if (state.active || active >= 2 || state.count >= 60) return null;
  state.active = true;
  state.count++;
  users.set(userId, state);
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active = false;
    active--;
  };
}
