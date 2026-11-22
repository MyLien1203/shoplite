// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const PAGE_RE = /^page\.(ts|tsx|js|jsx)$/;
const ROUTE_RE = /^route\.(ts|js)$/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function walk(dir: string, found: string[], top = true): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!(top && entry.name === "login")) walk(full, found, false);
    } else {
      found.push(full);
    }
  }
}

type GuardScan = { checked: string[]; missing: string[] };

/** Quét page dưới app/staff và route dưới app/api/staff (bỏ thư mục login). */
function scanStaffGuards(appDir: string): GuardScan {
  const checked: string[] = [];
  const missing: string[] = [];
  const targets: Array<{ dir: string; match: RegExp; call: RegExp }> = [
    { dir: path.join(appDir, "staff"), match: PAGE_RE, call: /\brequireStaffPage\(/ },
    { dir: path.join(appDir, "api", "staff"), match: ROUTE_RE, call: /\brequireStaffApi\(/ },
  ];
  for (const { dir, match, call } of targets) {
    const files: string[] = [];
    walk(dir, files);
    for (const file of files.filter((f) => match.test(path.basename(f))).sort()) {
      checked.push(file);
      if (!call.test(stripComments(fs.readFileSync(file, "utf8")))) {
        missing.push(file);
      }
    }
  }
  return { checked, missing };
}

describe("mọi trang/route nhân viên tự gọi guard", () => {
  it("mã thật: không file nào thiếu guard", () => {
    const appDir = path.resolve(__dirname, "../../app");
    const { checked, missing } = scanStaffGuards(appDir);
    expect(
      checked.some((f) => f.split(path.sep).join("/").endsWith("api/staff/logout/route.ts")),
    ).toBe(true);
    expect(missing).toEqual([]);
  });
});

describe("scanStaffGuards (ca âm trên thư mục tạm)", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function build(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "staff-guard-"));
    tmpDirs.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return root;
  }

  it("file có guard đúng loại thì qua; login bị bỏ", () => {
    const root = build({
      "staff/orders/page.tsx": "await requireStaffPage();",
      "api/staff/x/route.ts": "await requireStaffApi();",
      "staff/login/page.tsx": "export default null;",
      "api/staff/login/route.ts": "export {};",
    });
    const { checked, missing } = scanStaffGuards(root);
    expect(checked).toHaveLength(2);
    expect(missing).toEqual([]);
  });

  it("trang thiếu guard bị nêu đường dẫn", () => {
    const root = build({ "staff/orders/page.tsx": "export default null;" });
    expect(scanStaffGuards(root).missing).toEqual([path.join(root, "staff/orders/page.tsx")]);
  });

  it("route thiếu guard bị nêu", () => {
    const root = build({ "api/staff/x/route.ts": "export {};" });
    expect(scanStaffGuards(root).missing).toHaveLength(1);
  });

  it("guard chỉ trong chú thích không tính", () => {
    const root = build({
      "staff/a/page.tsx": "// await requireStaffPage();\nexport default null;",
      "staff/b/page.tsx": "/* requireStaffPage() */ export default null;",
    });
    expect(scanStaffGuards(root).missing).toHaveLength(2);
  });

  it("guard chỉ trong layout thì page vẫn thiếu", () => {
    const root = build({
      "staff/layout.tsx": "await requireStaffPage();",
      "staff/page.tsx": "export default null;",
    });
    const { checked, missing } = scanStaffGuards(root);
    expect(checked).toHaveLength(1);
    expect(missing).toHaveLength(1);
  });

  it("thư mục login lồng sâu không được miễn", () => {
    const root = build({
      "staff/orders/login/page.tsx": "export default null;",
      "staff/login/page.tsx": "export default null;",
    });
    expect(scanStaffGuards(root).missing).toEqual([path.join(root, "staff/orders/login/page.tsx")]);
  });

  it("tên dài hơn như myrequireStaffPage không tính", () => {
    const root = build({
      "staff/a/page.tsx": "await myrequireStaffPage();",
      "api/staff/b/route.ts": "await myrequireStaffApi();",
    });
    expect(scanStaffGuards(root).missing).toHaveLength(2);
  });

  it("trang gọi requireStaffApi hoặc route gọi requireStaffPage thì sai loại", () => {
    const root = build({
      "staff/a/page.tsx": "await requireStaffApi();",
      "api/staff/b/route.ts": "await requireStaffPage();",
    });
    expect(scanStaffGuards(root).missing).toHaveLength(2);
  });
});
