import { WEB_APP_VERSION } from "@/lib/nativeBridge";

export function GET() {
  return Response.json(
    { webAppVersion: WEB_APP_VERSION },
    { headers: { "Cache-Control": "no-store, no-cache, max-age=0" } },
  );
}
