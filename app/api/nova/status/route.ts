/** Server-only Nova configuration check. Never returns the API key or key material. */
export async function GET() {
  const configured = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  return Response.json({
    configured,
    ...(configured ? { model: process.env.OPENAI_ADDRESS_MODEL ?? "gpt-4.1-mini" } : { reason: "OPENAI_API_KEY_MISSING" }),
  }, { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
