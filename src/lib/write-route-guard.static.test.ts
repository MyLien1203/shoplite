// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROUTE_RE = /^route\.(ts|js)$/;
const WRITE_METHODS = ["POST", "PATCH", "PUT", "DELETE"];
const HANDLER_RE = /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=/g;
const GUARD_RE = /\bparseWriteRequest\(/;

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

type WriteScan = { checked: string[]; missing: string[] };

/** Quét từng handler ghi (POST/PATCH/PUT/DELETE) trong mọi route dưới `appDir`. */
function scanWriteRoutes(appDir: string): WriteScan {
  const files: string[] = [];
  walk(appDir, files);
  const checked: string[] = [];
  const missing: string[] = [];
  for (const file of files.filter((f) => ROUTE_RE.test(path.basename(f))).sort()) {
    checked.push(file);
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const declarations = [...source.matchAll(HANDLER_RE)].map((m) => ({
      name: m[1] ?? m[2],
      start: m.index ?? 0,
    }));
    const mentionsWrite = WRITE_METHODS.some((m) => new RegExp(`\\b${m}\\b`).test(source));
    if (mentionsWrite && !declarations.some((d) => WRITE_METHODS.includes(d.name))) {
      missing.push(`${file}#không nhận diện được handler ghi`);
    }
    declarations.forEach((declaration, index) => {
      if (!WRITE_METHODS.includes(declaration.name)) return;
      const end = declarations[index + 1]?.start ?? source.length;
      if (!GUARD_RE.test(source.slice(declaration.start, end))) {
        missing.push(`${file}#${declaration.name}`);
      }
    });
  }
  return { checked, missing };
}

describe("mọi handler ghi trong route gọi parseWriteRequest", () => {
  it("mã thật: không handler nào thiếu guard", () => {
    const appDir = path.resolve(__dirname, "../app");
    const { checked, missing } = scanWriteRoutes(appDir);
    const normalized = checked.map((f) => f.split(path.sep).join("/"));
    for (const expected of [
      "orders/[id]/route.ts",
      "orders/route.ts",
      "orders/lookup/route.ts",
      "staff/login/route.ts",
      "staff/logout/route.ts",
    ]) {
      expect(normalized.some((f) => f.endsWith(`api/${expected}`))).toBe(true);
    }
    expect(missing).toEqual([]);
  });
});

describe("scanWriteRoutes (ca âm trên thư mục tạm)", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function build(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "write-guard-"));
    tmpDirs.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return root;
  }

  it("handler có guard thì qua; GET không bị đòi", () => {
    const root = build({
      "api/a/route.ts":
        "export async function GET() {}\nexport async function POST(r) { await parseWriteRequest(r, {}); }",
      "api/b/route.ts": "export const DELETE = async (r) => { await parseWriteRequest(r, {}); };",
    });
    const { checked, missing } = scanWriteRoutes(root);
    expect(checked).toHaveLength(2);
    expect(missing).toEqual([]);
  });

  it("handler thiếu guard bị nêu đường dẫn", () => {
    const root = build({ "api/a/route.ts": "export async function PUT() {}" });
    expect(scanWriteRoutes(root).missing).toEqual([`${path.join(root, "api/a/route.ts")}#PUT`]);
  });

  it("route chỉ có GET không bị đòi guard", () => {
    const root = build({ "api/a/route.ts": "export async function GET() {}" });
    expect(scanWriteRoutes(root).missing).toEqual([]);
  });

  it("guard chỉ trong chú thích không tính", () => {
    const root = build({
      "api/a/route.ts": "// parseWriteRequest(\nexport async function POST() {}",
      "api/b/route.ts": "export async function PATCH() { /* parseWriteRequest( */ }",
    });
    expect(scanWriteRoutes(root).missing).toHaveLength(2);
  });

  it("tên dài hơn như myparseWriteRequest( không tính", () => {
    const root = build({
      "api/a/route.ts": "export async function POST(r) { await myparseWriteRequest(r); }",
    });
    expect(scanWriteRoutes(root).missing).toHaveLength(1);
  });

  it("nhiều handler mà chỉ một có guard thì handler thiếu bị bắt", () => {
    const root = build({
      "api/a/route.ts": [
        "export async function GET() {}",
        "export async function PATCH(r) { await parseWriteRequest(r, {}); }",
        "export async function DELETE() {}",
      ].join("\n"),
    });
    expect(scanWriteRoutes(root).missing).toEqual([`${path.join(root, "api/a/route.ts")}#DELETE`]);
  });

  it("dạng export { handler as POST } không nhận diện được thì bị báo", () => {
    const root = build({
      "api/a/route.ts":
        "async function handler(r) { await parseWriteRequest(r, {}); }\nexport { handler as POST };",
    });
    expect(scanWriteRoutes(root).missing).toEqual([
      `${path.join(root, "api/a/route.ts")}#không nhận diện được handler ghi`,
    ]);
  });

  it("guard của handler trước không che handler sau (khai báo const)", () => {
    const root = build({
      "api/a/route.ts": [
        "export const POST = async (r) => { await parseWriteRequest(r, {}); };",
        "export const PUT = async () => {};",
      ].join("\n"),
    });
    expect(scanWriteRoutes(root).missing).toEqual([`${path.join(root, "api/a/route.ts")}#PUT`]);
  });
});
