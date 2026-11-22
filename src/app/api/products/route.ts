import { NextResponse, type NextRequest } from "next/server";
import { parseCatalogQuery, queryProducts } from "@/features/catalog/catalog-service";
import { getStockedProducts } from "@/features/catalog/server";
import { handleRouteError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/products?q=&category=&minPrice=&maxPrice=&inStock=1&sort=&page= */
export async function GET(request: NextRequest) {
  try {
    const query = parseCatalogQuery(Object.fromEntries(request.nextUrl.searchParams));
    const stocked = await getStockedProducts();
    return NextResponse.json(queryProducts(query, stocked));
  } catch (error) {
    return handleRouteError(error);
  }
}
