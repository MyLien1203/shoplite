// @vitest-environment node
import { expect, it } from "vitest";

it("import module access không ném lỗi khi thiếu biến môi trường", async () => {
  await expect(import("./server")).resolves.toBeDefined();
  await expect(import("./actor")).resolves.toBeDefined();
});
