import { describe, expect, test } from "bun:test";
import { refusedHost } from "../../src/background/link-guard";

const host = (u: string) => new URL(u).hostname;

describe("refusedHost (requirements 19, 65)", () => {
  test.each(["localhost", "LOCALHOST", "app.localhost", "printer.local", "db.internal", "a.b.internal"])("refuses %s", (h) => {
    expect(refusedHost(h)).toBe(true);
  });
  test.each(["127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0"])(
    "refuses IPv4 %s",
    (h) => expect(refusedHost(h)).toBe(true),
  );
  test.each(["http://[::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[febf::1]/"])("refuses IPv6 %s", (u) => {
    expect(refusedHost(host(u))).toBe(true);
  });
  test.each(["http://[::ffff:127.0.0.1]/", "http://[::ffff:10.1.2.3]/", "http://[::ffff:192.168.0.9]/", "http://[::ffff:169.254.1.1]/"])(
    "refuses IPv4-mapped %s",
    (u) => expect(refusedHost(host(u))).toBe(true),
  );
  test.each(["example.com", "notlocalhost.com", "localhost.example.com", "internal.example.com", "8.8.8.8", "172.15.0.1", "172.32.0.1", "11.0.0.1", "192.169.0.1", "169.255.0.1", "2606:4700::1111", "fec0::1"])(
    "allows %s",
    (h) => expect(refusedHost(h)).toBe(false),
  );
  test("allows public IPv4-mapped and bracketed public IPv6", () => {
    expect(refusedHost(host("http://[::ffff:8.8.8.8]/"))).toBe(false);
    expect(refusedHost("[2606:4700::1111]")).toBe(false);
  });
  test.each(["router", "intranet", "nas", "printer.lan", "host.home.arpa", "wiki.corp", "tv.home", "portal.intranet"])("refuses private name %s", (h) => {
    expect(refusedHost(h)).toBe(true);
  });
  test.each(["100.64.0.1", "100.100.100.100", "100.127.255.255", "0.1.2.3", "0.255.255.255"])("refuses CGNAT / 0/8 %s", (h) => {
    expect(refusedHost(h)).toBe(true);
  });
  test.each(["100.63.255.255", "100.128.0.1"])("allows just outside CGNAT %s", (h) => {
    expect(refusedHost(h)).toBe(false);
  });
  test.each(["http://[64:ff9b::7f00:1]/", "http://[64:ff9b::a00:1]/", "http://[64:ff9b::c0a8:101]/", "http://[64:ff9b::127.0.0.1]/"])("refuses NAT64 of a private IPv4 %s", (u) => {
    expect(refusedHost(host(u))).toBe(true);
  });
  test("allows NAT64 of a public IPv4", () => {
    expect(refusedHost(host("http://[64:ff9b::808:808]/"))).toBe(false);
  });
  test.each(["[zzzz::1]", "[1:2:3:4:5:6:7:8:9]", "[1::2::3]", "[12345::1]", "1.2.3", "1.2.3.4.5", "999.1.1.1", "[]"])("fails closed on unparseable IP literal %s", (h) => {
    expect(refusedHost(h)).toBe(true);
  });
  test("a trailing dot does not slip through", () => {
    expect(refusedHost("localhost.")).toBe(true);
  });
});
