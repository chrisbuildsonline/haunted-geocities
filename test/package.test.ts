import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const root = join(import.meta.dir, "..");

/** name → bytes of every entry, read from the zip's central directory. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  const files = new Map<string, Buffer>();
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(data, data + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen;
  }
  return files;
}

describe("dist.zip (after bun run package)", () => {
  let files: Map<string, Buffer>;
  beforeAll(() => {
    const r = Bun.spawnSync(["bun", "run", "package"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`package failed:\n${r.stdout}\n${r.stderr}`);
    files = unzip(readFileSync(join(root, "dist.zip")));
  }, 120_000);

  test("has manifest.json at the zip root, plus the built scripts and popup", () => {
    expect([...files.keys()]).toEqual(expect.arrayContaining(["manifest.json", "background.js", "content.js", "popup.html"]));
    expect([...files.keys()].some((n) => n.startsWith("dist/"))).toBe(false);
  });

  test("its manifest is the shipping one: no host_permissions, no localhost", () => {
    const text = files.get("manifest.json")!.toString("utf8");
    expect("host_permissions" in JSON.parse(text)).toBe(false);
    expect(text).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  test("every stored CRC-32 matches an independent table-based computation", () => {
    const zip = readFileSync(join(root, "dist.zip"));
    const table = Array.from({ length: 256 }, (_, n) => {
      for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
      return n >>> 0;
    });
    const crc32 = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let p = zip.readUInt32LE(end + 16);
    let seen = 0;
    for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
      const nameLen = zip.readUInt16LE(p + 28);
      const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
      const stored = zip.readUInt32LE(p + 16);
      const local = zip.readUInt32LE(p + 42);
      expect(zip.readUInt32LE(local + 14)).toBe(stored); // local header agrees with the directory
      expect(stored).toBe(crc32(files.get(name)!));
      seen++;
      p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    }
    expect(seen).toBe(files.size);
  });

  test("its files are the files in dist/", () => {
    for (const [name, bytes] of files) expect(bytes.equals(readFileSync(join(root, "dist", name)))).toBe(true);
  });
});
