/**
 * On-Demand ISR Revalidation API Route
 *
 * Called by the FastAPI backend (POST /api/track-shares/revalidate)
 * when song metadata changes. Purge the Vercel CDN cache for the
 * specific share page so the next visitor sees updated content.
 *
 * Security: this route should be protected with a secret token
 * in production (REVALIDATE_SECRET env var).
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug as string | undefined;

    // Verify revalidation secret in production
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.REVALIDATE_SECRET;
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const path = `/share/track/${encodeURIComponent(slug)}`;
    revalidatePath(path);

    return NextResponse.json({
      revalidated: true,
      path,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[revalidate] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
