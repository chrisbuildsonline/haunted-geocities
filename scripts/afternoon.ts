// A fixed-offset IANA zone where it is 15:xx at `now`, so a capture never lands in the witching hour
// (local 00:00-00:59, design/DESIGN.md "Secrets"), whatever the machine's clock says.
// Etc/GMT signs are inverted: Etc/GMT-3 is UTC+3.
export function afternoonZone(now = new Date()): string {
  let off = (15 - now.getUTCHours() + 24) % 24;
  if (off > 14) off -= 24;
  return off === 0 ? "UTC" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`;
}
