import { createLearningHandler } from "../../../../lib/learning-proxy.mjs";
import { getApiBase } from "../../../../lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request, { params }) {
  const { action } = await params;
  try {
    return await createLearningHandler({
      apiBase: process.env.COMMERCE_TRAINING_API_BASE || getApiBase(),
      allowedOrigins: (process.env.COMMERCE_TRAINING_ALLOWED_ORIGINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    })(request, action);
  } catch {
    return Response.json(
      { statusCode: 503, errorCode: "TRAINING_TEMPORARY" },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
}

export { handle as GET, handle as POST, handle as DELETE };
