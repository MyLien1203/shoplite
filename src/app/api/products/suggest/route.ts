import { NextResponse, type NextRequest } from "next/server";
import { getStockedProducts } from "@/features/catalog/server";
import { getSuggestions } from "@/features/catalog/suggest-service";
import { handleRouteError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/products/suggest?q= -> { suggestions: [{ slug, name, price, inStock }] } */
export async function GET(request: NextRequest) {
  try {
    const result = getSuggestions(
      request.nextUrl.searchParams.get("q"),
      await getStockedProducts(),
    );
    if (!result.ok) return jsonError(400, "VALIDATION_ERROR", result.message);
    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    return handleRouteError(error);
  }
}
