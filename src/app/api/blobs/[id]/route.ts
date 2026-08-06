import { NextResponse } from "next/server";

import { getImage } from "@/lib/images";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Serves stored image derivatives.
 *
 * Behind auth: a household's photos of its children should not be readable by
 * anyone who guesses a URL. Kiosk devices get their own access path in phase 5,
 * when device tokens start being issued.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSessionUser())) {
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
