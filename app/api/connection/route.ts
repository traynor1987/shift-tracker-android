/**
 * A zero-cost, same-origin connection probe for the installed PWA.
 *
 * It intentionally does not contact Google or any other external provider.
 * The service worker excludes this endpoint from its offline cache fallback,
 * so a successful response proves this device can currently reach the app.
 */
const health = () => new Response(null, {
  status: 204,
  headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
  },
});

export const GET = health;
export const HEAD = health;
