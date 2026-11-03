---
inclusion: always
---

# Accessibility & Motion: Haunted GeoCities

The costume is decorative and must not block or harm the usability of the underlying page.

## Motion

- Honour `prefers-reduced-motion`: disable marquees, floating animations, and other non-essential motion when the user prefers reduced motion.
- No flashing, blinking, or strobing faster than **3 Hz**.
- Ghosts and decorations may drift slowly; never jarring or rapid movement.

## Keyboard

- All costume controls (popup buttons, Exorcise actions, audio toggle) must be keyboard reachable.
- Visible focus indicators on all interactive overlay elements.

## Contrast & Text

- HUD and overlay text must meet **4.5:1** contrast ratio against its background.

## Audio

- Audio is **muted by default**.
- Sound plays only after an explicit user gesture (e.g. toggling audio on in the popup).
- No background music or ambient audio without user opt-in.
