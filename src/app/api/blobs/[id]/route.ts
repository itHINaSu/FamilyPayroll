import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getImage } from "@/lib/images";
import { getSessionUser } from "@/lib/auth/session";
import { deviceForToken } from "@/lib/kiosk";

/**
 * Serves stored image derivatives.
 *
 * Behind auth: a household's photos of its children should not be readable by
 * anyone who guesses a URL. A paired kiosk counts as authorised — it needs the
 * avatars and goal photos it renders — but only through its device token.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await cookies();
  const kioskToken = store.get("fp_kiosk")?.value;

  const authorised =
    (await getSessionUser()) !== null ||
    (kioskToken ? deviceForToken(kioskToken) !== null : false);

  if (!authorised) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const image = getImage(id);
  if (!image) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes as Buffer), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.byteSize),
      // Content is immutable: a new upload creates a new row with a new id.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
