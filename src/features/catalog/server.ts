import { products } from "@/data/products";
import { effectiveStock } from "@/features/inventory/effective-stock";
import { getStoreGateway } from "@/features/store/server";
import type { StoreGateway } from "@/features/store/store-gateway";
import type { Product } from "./types";

/** Phủ tồn `inventory` lên catalog; trả đối tượng mới, không đổi catalog đầu vào. Khóa thừa bị bỏ qua. */
export function overlayStock(catalog: Product[], inventory: Record<string, number>): Product[] {
  return catalog.map((product) => ({ ...product, stock: effectiveStock(inventory, product) }));
}

/** Catalog tĩnh kèm tồn thực từ store; store lỗi thì ném nguyên, không rơi về tồn tĩnh. */
export async function getStockedProducts(
  store: Pick<StoreGateway, "read"> = getStoreGateway(),
): Promise<Product[]> {
  const { inventory } = await store.read();
  return overlayStock(products, inventory);
}
