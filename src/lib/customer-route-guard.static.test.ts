// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ENTRY_RE = /^(route\.(ts|js)|page\.(tsx|ts))$/;
const HANDLER_RE = /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=/g;
const LIST_CALL_RE = /\b(?:listOrders|listStaffOrders)\(/;
const STAFF_GUARD_RE = /\brequireStaffApi\(/;
const CUSTOMER_CALL_RE = /\borderService\s*\.\s*(?:placeOrder|getOrder|cancelByCustomer)\(/;
const VIEW_GUARD_RE = /\btoCustomerView\(/;

const toPosix = (p: string) => p.split(path.sep).join("/");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function walk(dir: string, found: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
}

type Unit = { file: string; name: string; code: string };

/** Mỗi `route` tách theo handler; mỗi `page` là một đơn vị cả file. */
function unitsOf(file: string, source: string): Unit[] {
  if (path.basename(file).startsWith("page.")) return [{ file, name: "page", code: source }];
  const declarations = [...source.matchAll(HANDLER_RE)].map((m) => ({
    name: m[1] ?? m[2],
    start: m.index ?? 0,
  }));
  if (declarations.length === 0) return [{ file, name: "route", code: source }];
  return declarations.map((d, i) => ({
    file,
    name: d.name,
    code: source.slice(d.start, declarations[i + 1]?.start ?? source.length),
  }));
}

function entries(appDir: string): { file: string; rel: string; source: string }[] {
  const files: string[] = [];
  walk(appDir, files);
  return files
    .filter((f) => ENTRY_RE.test(path.basename(f)))
    .sort()
    .map((file) => ({
      file,
      rel: toPosix(path.relative(appDir, file)),
      source: stripComments(fs.readFileSync(file, "utf8")),
    }));
}

const isStaffArea = (rel: string) => rel.startsWith("api/staff/") || rel.startsWith("staff/");
const isCustomerArea = (rel: string) => rel.startsWith("api/orders/") || rel.startsWith("orders/");

type Scan = { checked: string[]; violations: string[] };

/** (a) `listOrders(` chỉ ở `api/orders/route.ts` (kèm `requireStaffApi(`) và dưới khu nhân viên. */
function scanListRoutes(appDir: string): Scan {
  const checked: string[] = [];
  const violations: string[] = [];
  for (const { file, rel, source } of entries(appDir)) {
    if (isStaffArea(rel)) continue;
    checked.push(file);
    const allowed = rel === "api/orders/route.ts";
    if (!LIST_CALL_RE.test(source)) continue;
    if (!allowed) {
      violations.push(`${file}#listOrders ngoài allowlist`);
      continue;
    }
    for (const unit of unitsOf(file, source)) {
      if (LIST_CALL_RE.test(unit.code) && !STAFF_GUARD_RE.test(unit.code)) {
        violations.push(`${file}#${unit.name}`);
      }
    }
  }
  return { checked, violations };
}

/** (b) handler/trang phía Khách gọi placeOrder/getOrder/cancelByCustomer phải qua `toCustomerView(`. */
function scanCustomerRoutes(appDir: string): Scan {
  const checked: string[] = [];
  const violations: string[] = [];
  for (const { file, rel, source } of entries(appDir)) {
    if (isStaffArea(rel) || !isCustomerArea(rel)) continue;
    checked.push(file);
    for (const unit of unitsOf(file, source)) {
      if (CUSTOMER_CALL_RE.test(unit.code) && !VIEW_GUARD_RE.test(unit.code)) {
        violations.push(`${file}#${unit.name}`);
      }
    }
  }
  return { checked, violations };
}

const APP_DIR = path.resolve(__dirname, "../app");

describe("đường danh sách đơn chỉ dành cho nhân viên", () => {
  it("mã thật: listOrders( chỉ ở api/orders/route.ts (có requireStaffApi) và khu nhân viên", () => {
    const { checked, violations } = scanListRoutes(APP_DIR);
    expect(checked.map(toPosix).some((f) => f.endsWith("app/api/orders/route.ts"))).toBe(true);
    expect(violations).toEqual([]);
  });
});

describe("đường trả đơn cho Khách đều qua toCustomerView", () => {
  it("mã thật: mọi handler/trang phía Khách có toCustomerView(", () => {
    const { checked, violations } = scanCustomerRoutes(APP_DIR);
    const normalized = checked.map(toPosix);
    for (const expected of [
      "app/api/orders/route.ts",
      "app/api/orders/[id]/route.ts",
      "app/api/orders/lookup/route.ts",
      "app/orders/[id]/page.tsx",
    ]) {
      expect(normalized.some((f) => f.endsWith(expected))).toBe(true);
    }
    expect(violations).toEqual([]);
  });
});

describe("quét tĩnh (ca âm trên thư mục tạm)", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function build(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "customer-guard-"));
    tmpDirs.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return root;
  }
  const at = (root: string, rel: string) => path.join(root, rel);

  it("danh sách: handler có requireStaffApi( thì qua", () => {
    const root = build({
      "api/orders/route.ts":
        "export async function GET() { await requireStaffApi(); return orderService.listOrders(); }",
      "api/staff/orders/route.ts": "export async function GET() { return listOrders(); }",
    });
    expect(scanListRoutes(root).violations).toEqual([]);
  });

  it("danh sách: GET gọi listOrders( thiếu requireStaffApi( bị nêu đường dẫn", () => {
    const root = build({
      "api/orders/route.ts": "export async function GET() { return orderService.listOrders(); }",
    });
    expect(scanListRoutes(root).violations).toEqual([`${at(root, "api/orders/route.ts")}#GET`]);
  });

  it("danh sách: listStaffOrders( thiếu requireStaffApi( bị nêu tên, có thì qua", () => {
    const bad = build({
      "api/orders/route.ts":
        "export async function GET() { return orderService.listStaffOrders('all'); }",
    });
    expect(scanListRoutes(bad).violations).toEqual([`${at(bad, "api/orders/route.ts")}#GET`]);

    const outside = build({
      "api/other/route.ts":
        "export async function GET() { await requireStaffApi(); return orderService.listStaffOrders('all'); }",
    });
    expect(scanListRoutes(outside).violations).toEqual([
      `${at(outside, "api/other/route.ts")}#listOrders ngoài allowlist`,
    ]);

    const good = build({
      "api/orders/route.ts":
        "export async function GET() { await requireStaffApi(); return orderService.listStaffOrders('all'); }",
    });
    expect(scanListRoutes(good).violations).toEqual([]);
  });

  it("danh sách: guard chỉ trong chú thích không tính", () => {
    const root = build({
      "api/orders/route.ts":
        "// requireStaffApi(\nexport async function GET() { /* requireStaffApi( */ return listOrders(); }",
    });
    expect(scanListRoutes(root).violations).toHaveLength(1);
  });

  it("danh sách: tên dài hơn như myrequireStaffApi( không tính", () => {
    const root = build({
      "api/orders/route.ts":
        "export async function GET() { await myrequireStaffApi(); return listOrders(); }",
    });
    expect(scanListRoutes(root).violations).toHaveLength(1);
  });

  it("danh sách: nhiều handler mà chỉ một handler có guard thì handler thiếu bị bắt", () => {
    const root = build({
      "api/orders/route.ts": [
        "export async function GET() { await requireStaffApi(); return listOrders(); }",
        "export async function HEAD() { return listOrders(); }",
      ].join("\n"),
    });
    expect(scanListRoutes(root).violations).toEqual([`${at(root, "api/orders/route.ts")}#HEAD`]);
  });

  it("danh sách: listOrders( ở file ngoài allowlist bị bắt (route và trang)", () => {
    const root = build({
      "api/other/route.ts":
        "export async function GET() { await requireStaffApi(); return listOrders(); }",
      "orders/page.tsx": "export default async function P() { await listOrders(); return null; }",
    });
    expect(scanListRoutes(root).violations.sort()).toEqual(
      [
        `${at(root, "api/other/route.ts")}#listOrders ngoài allowlist`,
        `${at(root, "orders/page.tsx")}#listOrders ngoài allowlist`,
      ].sort(),
    );
  });

  it("Khách: handler có toCustomerView( thì qua", () => {
    const root = build({
      "api/orders/route.ts":
        "export async function POST() { return toCustomerView(await orderService.placeOrder({})); }",
      "orders/[id]/page.tsx":
        "async function f() { return toCustomerView(await orderService.getOrder('x')); }",
    });
    expect(scanCustomerRoutes(root).violations).toEqual([]);
  });

  it("Khách: trả placeOrder không qua toCustomerView( bị bắt", () => {
    const root = build({
      "api/orders/route.ts": "export async function POST() { return orderService.placeOrder({}); }",
    });
    expect(scanCustomerRoutes(root).violations).toEqual([
      `${at(root, "api/orders/route.ts")}#POST`,
    ]);
  });

  it("Khách: getOrder và cancelByCustomer thiếu toCustomerView( bị bắt", () => {
    const root = build({
      "api/orders/[id]/route.ts": [
        "export async function GET() { return orderService.getOrder('x'); }",
        "export async function PATCH() { return orderService.cancelByCustomer('x'); }",
      ].join("\n"),
      "orders/[id]/page.tsx":
        "export default async function P() { return orderService.getOrder('x'); }",
    });
    expect(scanCustomerRoutes(root).violations.sort()).toEqual(
      [
        `${at(root, "api/orders/[id]/route.ts")}#GET`,
        `${at(root, "api/orders/[id]/route.ts")}#PATCH`,
        `${at(root, "orders/[id]/page.tsx")}#page`,
      ].sort(),
    );
  });

  it("Khách: guard chỉ trong chú thích không tính", () => {
    const root = build({
      "api/orders/route.ts":
        "// toCustomerView(\nexport async function POST() { /* toCustomerView( */ return orderService.placeOrder({}); }",
    });
    expect(scanCustomerRoutes(root).violations).toHaveLength(1);
  });

  it("Khách: tên dài hơn như mytoCustomerView( không tính", () => {
    const root = build({
      "api/orders/route.ts":
        "export async function POST() { return mytoCustomerView(await orderService.placeOrder({})); }",
    });
    expect(scanCustomerRoutes(root).violations).toHaveLength(1);
  });

  it("Khách: nhiều handler mà chỉ một handler có toCustomerView( thì handler thiếu bị bắt", () => {
    const root = build({
      "api/orders/[id]/route.ts": [
        "export async function GET() { return toCustomerView(await orderService.getOrder('x')); }",
        "export async function PATCH() { return orderService.cancelByCustomer('x'); }",
      ].join("\n"),
    });
    expect(scanCustomerRoutes(root).violations).toEqual([
      `${at(root, "api/orders/[id]/route.ts")}#PATCH`,
    ]);
  });

  it("Khách: khu nhân viên và route ngoài orders không bị đòi", () => {
    const root = build({
      "api/staff/orders/route.ts":
        "export async function GET() { return orderService.getOrder('x'); }",
      "api/products/route.ts": "export async function GET() { return orderService.getOrder('x'); }",
    });
    const { checked, violations } = scanCustomerRoutes(root);
    expect(checked).toEqual([]);
    expect(violations).toEqual([]);
  });
});
