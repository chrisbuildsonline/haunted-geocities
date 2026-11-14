import { describe, expect, test } from "bun:test";
import data from "../../src/data/neighborhoods.json";
import { fnv1a, normaliseHost, resolveNeighborhood } from "../../src/data/neighborhood";

const NAMES = data.neighborhoods.map((n) => n.name);
const entry = (name: string) => data.neighborhoods.find((n) => n.name === name)!;
const name = (host: string) => resolveNeighborhood(host).name;

/** Independent 32-bit FNV-1a, checked against published vectors below. */
const ref = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

describe("resolver: fixed addresses and normalisation", () => {
  test("module imports with no chrome global", async () => {
    expect((globalThis as { chrome?: unknown }).chrome).toBeUndefined();
    const mod = await import("../../src/data/neighborhood");
    expect(typeof mod.resolveNeighborhood).toBe("function");
    const src = await Bun.file(new URL("../../src/data/neighborhood.ts", import.meta.url)).text();
    expect(src).not.toMatch(/\bchrome\.|document|window|fetch\(|Date|Math\.random|performance/);
  });

  test("localhost is Heartland/Homestead/1998", () => {
    expect(resolveNeighborhood("localhost").address).toBe("Heartland/Homestead/1998");
  });

  test("app.localhost is Heartland/Homestead/1998", () => {
    expect(resolveNeighborhood("app.localhost").address).toBe("Heartland/Homestead/1998");
    expect(resolveNeighborhood("LOCALHOST.").address).toBe("Heartland/Homestead/1998");
  });

  test("127.0.0.1 is Area51/Hangar/1998", () => {
    expect(resolveNeighborhood("127.0.0.1").address).toBe("Area51/Hangar/1998");
    expect(resolveNeighborhood("192.168.10.200").address).toBe("Area51/Hangar/1998");
  });

  test("[::1] and ::1 are Area51/Hangar/1998", () => {
    expect(resolveNeighborhood("[::1]").address).toBe("Area51/Hangar/1998");
    expect(resolveNeighborhood("::1").address).toBe("Area51/Hangar/1998");
  });

  test("the fixed addresses carry the neighborhood tagline", () => {
    const local = resolveNeighborhood("localhost");
    expect(local).toEqual({ name: "Heartland", tagline: entry("Heartland").tagline, suburb: "Homestead", number: 1998, address: "Heartland/Homestead/1998" });
    const ip = resolveNeighborhood("10.0.0.1");
    expect(ip).toEqual({ name: "Area51", tagline: entry("Area51").tagline, suburb: "Hangar", number: 1998, address: "Area51/Hangar/1998" });
  });

  test("Example.COM., www.example.com and example.com give the same address", () => {
    const want = resolveNeighborhood("example.com");
    expect(resolveNeighborhood("Example.COM.")).toEqual(want);
    expect(resolveNeighborhood("www.example.com")).toEqual(want);
    expect(normaliseHost("WWW.Example.COM.")).toBe("example.com");
  });
});

describe("resolver: rules", () => {
  test("agency.gov is CapitolHill and school.edu is Athens", () => {
    expect(name("agency.gov")).toBe("CapitolHill");
    expect(name("base.mil")).toBe("CapitolHill");
    expect(name("school.edu")).toBe("Athens");
  });

  test("agency.gov.uk and school.edu.au match on the second-to-last label", () => {
    expect(name("agency.gov.uk")).toBe("CapitolHill");
    expect(name("school.edu.au")).toBe("Athens");
    expect(name("uni.ac.uk")).toBe("Athens");
    expect(name("site.co.jp")).toBe("Tokyo");
    expect(name("boulangerie.fr")).toBe("Paris");
    expect(name("anything.dev")).toBe("SiliconValley");
  });

  test("ac.jp is Athens, not Tokyo (rule order)", () => {
    expect(name("ac.jp")).toBe("Athens");
    expect(name("uni.ac.jp")).toBe("Athens");
  });

  test("shop.example.com, mybank.example.com and store.example.net are WallStreet", () => {
    for (const h of ["shop.example.com", "mybank.example.com", "store.example.net"]) expect([h, name(h)]).toEqual([h, "WallStreet"]);
  });

  test("game.example.com and play.example.org are TimesSquare", () => {
    for (const h of ["game.example.com", "play.example.org"]) expect([h, name(h)]).toEqual([h, "TimesSquare"]);
  });

  test("news.example.com, blog.example.org and write.example.net are SoHo", () => {
    for (const h of ["news.example.com", "blog.example.org", "write.example.net"]) expect([h, name(h)]).toEqual([h, "SoHo"]);
  });

  test("music.example.com and band.example.org are SunsetStrip", () => {
    for (const h of ["music.example.com", "band.example.org"]) expect([h, name(h)]).toEqual([h, "SunsetStrip"]);
  });

  test("code.example.com, dev.example.org and github.example.net are SiliconValley", () => {
    for (const h of ["code.example.com", "dev.example.org", "github.example.net"]) expect([h, name(h)]).toEqual([h, "SiliconValley"]);
  });

  test("pet.example.com, dogs.example.org and cat.example.net are Petsburgh", () => {
    for (const h of ["pet.example.com", "dogs.example.org", "cat.example.net"]) expect([h, name(h)]).toEqual([h, "Petsburgh"]);
  });

  test("cat does not fire on education.example.com", () => {
    const h = "education.example.com";
    // No rule matches: it lands where the hash puts it, whatever that is.
    expect(name(h)).toBe(NAMES[ref(h) % 16]!);
    expect(name("concat.example.com")).toBe(NAMES[ref("concat.example.com") % 16]!);
  });

  test("the last label is not a word: example.shop gets no word match", () => {
    expect(name("example.shop")).toBe(NAMES[ref("example.shop") % 16]!);
    expect(name("example.music")).toBe(NAMES[ref("example.music") % 16]!);
  });

  test("hyphenated labels are split: my-music-box.example.com is SunsetStrip", () => {
    expect(name("my-music-box.example.com")).toBe("SunsetStrip");
    expect(name("night-cat.example")).toBe("Petsburgh");
  });

  test("a tld rule beats a word rule: shop.example.gov is CapitolHill", () => {
    expect(name("shop.example.gov")).toBe("CapitolHill");
    expect(name("music.example.jp")).toBe("Tokyo");
  });

  test("long keywords match as prefix or suffix, plurals match whole", () => {
    expect(name("coffeeshop.example")).toBe("WallStreet");
    expect(name("bandcamp.example")).toBe("SunsetStrip");
    expect(name("cats.example")).toBe("Petsburgh");
    expect(name("petshop.example")).toBe("WallStreet");
  });
});

describe("resolver: hash fallback and address", () => {
  test("fnv1a is the 32-bit FNV-1a hash", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
    expect(ref("foobar")).toBe(0xbf9cf968);
  });

  test("a host with no rule gets the neighborhood at fnv1a mod 16", () => {
    for (const h of ["example.com", "qwzx.org", "intranet", "zzz.net", "wikipedia.org"]) {
      expect([h, name(h)]).toEqual([h, NAMES[ref(h) % 16]!]);
    }
  });

  test("the suburb comes from the neighborhood's own list", () => {
    for (const h of ["example.com", "shop.example.com", "agency.gov", "intranet"]) {
      const n = resolveNeighborhood(h);
      expect(entry(n.name).suburbs).toContain(n.suburb);
      expect(n.suburb).toBe(entry(n.name).suburbs[ref(`suburb:${h}`) % 4]!);
    }
  });

  test("the number is between 1000 and 9999", () => {
    for (const h of ["example.com", "a", "b.c", "agency.gov", "x".repeat(300)]) {
      const { number } = resolveNeighborhood(h);
      expect(Number.isInteger(number)).toBe(true);
      expect(number).toBeGreaterThanOrEqual(1000);
      expect(number).toBeLessThanOrEqual(9999);
      expect(number).toBe(1000 + ((ref(normaliseHost(h)) >>> 8) % 9000));
    }
  });

  test("the address is name/suburb/number", () => {
    const n = resolveNeighborhood("example.org");
    expect(n.address).toBe(`${n.name}/${n.suburb}/${n.number}`);
    expect(n.tagline).toBe(entry(n.name).tagline);
  });

  test("a rule-matched host also gets a hashed suburb and number", () => {
    const h = "shop.example.com";
    const n = resolveNeighborhood(h);
    expect(n.name).toBe("WallStreet");
    expect(n.suburb).toBe(entry("WallStreet").suburbs[ref(`suburb:${h}`) % 4]!);
    expect(n.number).toBe(1000 + ((ref(h) >>> 8) % 9000));
  });

  test("known hosts keep their address (a table of 6 hosts, so a change of hash is noticed)", () => {
    const table: Record<string, string> = {
      "example.com": "TimesSquare/Midway/7315",
      "example.org": "SiliconValley/Heights/7513",
      "taboola.com": "TimesSquare/Midway/5625",
      "haunt.example": "Athens/Lyceum/7275",
      "github.com": "SiliconValley/Sunnyvale/1976",
      "agency.gov": "CapitolHill/Embassy/2987",
    };
    expect(Object.fromEntries(Object.keys(table).map((h) => [h, resolveNeighborhood(h).address]))).toEqual(table);
  });

  test("SiliconValley/Heights/2049 is a valid address shape", () => {
    const shape = /^([A-Za-z0-9]+)\/([A-Za-z]{2,12})\/([1-9]\d{3})$/;
    const [, n, s] = "SiliconValley/Heights/2049".match(shape)!;
    expect(NAMES).toContain(n!);
    expect(entry(n!).suburbs).toContain(s!);
    expect(resolveNeighborhood("example.com").address).toMatch(shape);
  });
});

describe("resolver: total and deterministic", () => {
  test("the empty string resolves", () => {
    const n = resolveNeighborhood("");
    expect(n.name).toBe(NAMES[ref("") % 16]!);
    expect(n.address).toBe(`${n.name}/${n.suburb}/${n.number}`);
  });

  test("a 5000-character host resolves", () => {
    const n = resolveNeighborhood(`${"a".repeat(2500)}.${"b".repeat(2499)}`);
    expect(NAMES).toContain(n.name);
  });

  test("non-ASCII, spaces and slashes resolve", () => {
    for (const h of ["bücher.de", "日本.jp", "with space.com", "a/b/c", "😀.example", "  "]) expect(NAMES).toContain(name(h));
    expect(name("日本.jp")).toBe("Tokyo");
  });

  test("the same host gives equal results on two calls", () => {
    for (const h of ["example.com", "shop.example.com", "localhost", "", "日本.jp"]) expect(resolveNeighborhood(h)).toEqual(resolveNeighborhood(h));
  });

  test("never throws for a list of 20 odd inputs", () => {
    const odd = [
      "", ".", "..", "www.", "www", "-", "--.--", "a..b", ".example.com", "example.com..", "[", "]", ":", "1.2.3",
      "1.2.3.4.5", "999.999.999.999", "\u0000", "\ud800", "a".repeat(10000), "x-.-y.z",
    ];
    expect(odd).toHaveLength(20);
    for (const h of odd) {
      const n = resolveNeighborhood(h);
      expect(NAMES).toContain(n.name);
      expect(n.address).toBe(`${n.name}/${n.suburb}/${n.number}`);
    }
  });
});
