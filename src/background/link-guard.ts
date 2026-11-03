// Hosts the cross-site link checker must never fetch: this machine and the local network.
// ponytail: a public hostname that resolves to a private IP at fetch time (DNS rebinding) is not caught here; the ceiling is accepted.

const NAMES = /(^|\.)(localhost|local|internal|lan|corp|home|intranet|home\.arpa)$/;

function privateV4([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}

/** The eight 16-bit groups of an IPv6 literal (no brackets), or null when it is not one. */
function groups(v6: string): number[] | null {
  let s = v6;
  const dotted = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) s = s.slice(0, dotted.index) + ((+dotted[1]! << 8) | +dotted[2]!).toString(16) + ":" + ((+dotted[3]! << 8) | +dotted[4]!).toString(16);
  const [head, tail, extra] = s.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  const all = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return all.length === 8 && all.every((g) => g >= 0 && g <= 0xffff) ? all : null;
}

/** True when `hostname` (as in URL.hostname, so IPv6 is bracketed) is a local or private-network host. An IP literal that does not parse is refused. */
export function refusedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.includes(":") || host.startsWith("[")) {
    const g = groups(host.replace(/^\[|\]$/g, ""));
    if (!g) return true;
    const v4 = (hi: number, lo: number) => privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6]!, g[7]!); // IPv4-mapped
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6]!, g[7]!); // NAT64
    if (g.slice(0, 7).every((x) => x === 0) && g[7]! <= 1) return true; // :: and ::1
    return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80; // fc00::/7, fe80::/10
  }
  if (/^[\d.]+$/.test(host)) {
    const parts = host.split(".");
    const octets = parts.map(Number);
    return parts.length !== 4 || octets.some((o) => !(o <= 255)) || privateV4(octets);
  }
  return !host.includes(".") || NAMES.test(host);
}
