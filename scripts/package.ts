// Zips dist/ into dist.zip with manifest.json at the zip root. Usage: bun run package (builds first).
// No zip tool is needed: the Playwright image has none, so this writes the format with node:zlib.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const DOS_DATE = (1980 - 1980) * 512 + 1 * 32 + 1; // 1980-01-01: keeps the zip reproducible

const names = readdirSync(dist, { recursive: true })
  .map(String)
  .filter((n) => statSync(join(dist, n)).isFile())
  .sort();

const parts: Buffer[] = [];
const central: Buffer[] = [];
let offset = 0;
for (const name of names) {
  const data = readFileSync(join(dist, name));
  const packed = deflateRawSync(data);
  const nameBytes = Buffer.from(name.replaceAll("\\", "/"));
  const crc = Bun.hash.crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(nameBytes.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  head.copy(entry, 6, 4, 30); // the shared fields, from "version needed" on
  entry.writeUInt16LE(20, 4); // version made by
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBytes);
  parts.push(head, nameBytes, packed);
  offset += head.length + nameBytes.length + packed.length;
}
const centralBytes = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(centralBytes.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(join(root, "dist.zip"), Buffer.concat([...parts, centralBytes, end]));
console.log(`dist.zip: ${names.length} files`);
