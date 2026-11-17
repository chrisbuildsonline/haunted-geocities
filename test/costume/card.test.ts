// A card opened from a sprite docked in the bottom strip: placed above the strip, inside the viewport,
// and focus goes back to the sprite when it closes.
import { expect, test } from "bun:test";
import { closeCard, openCard } from "../../src/content/costume/card";
import type { CompanyHit } from "../../src/data/types";
import { domRect, fakeLayout, setup } from "./helpers";

const criteo: CompanyHit = { company: "Criteo", count: 3, domains: ["criteo.com"], categories: ["Advertising"], fingerprinting: 0 };

function docked(left: number) {
  const { win, doc } = setup({ width: 375 });
  fakeLayout(win as never, { hud: 80, graveyard: 88 });
  const cards = doc.createElement("div");
  const sprite = doc.createElement("button");
  doc.body.append(cards, sprite);
  // the strip's top is 800 - 8 - 80 - 4 - 88 = 620; the sprite stands in its stones row
  sprite.getBoundingClientRect = () => domRect({ left, right: left + 48, top: 640, bottom: 694 });
  const bounds = { top: 48, bottom: 620 };
  const card = openCard(cards, criteo, sprite, { exorcised: false, send() {}, bounds, reduced: true });
  return { doc, cards, sprite, card, bounds };
}

test("card from a docked sprite is placed above the strip inside bounds", () => {
  for (const left of [18, 375 - 18 - 48]) {
    const { card, bounds } = docked(left);
    const x = parseFloat(card.style.left);
    const y = parseFloat(card.style.top);
    expect({ left, above: y + card.offsetHeight <= bounds.bottom - 8 }).toEqual({ left, above: true });
    expect(y).toBeGreaterThanOrEqual(bounds.top + 8);
    expect(x).toBeGreaterThanOrEqual(8);
    expect(x + 248 + 4).toBeLessThanOrEqual(375 - 8); // the 4px hard shadow stays 8px off the edge too
  }
});

test("focus returns to the docked sprite on close", () => {
  const { doc, cards, sprite, card } = docked(18);
  expect(card.contains(doc.activeElement)).toBe(true);
  closeCard(cards);
  expect(doc.activeElement).toBe(sprite);
});
