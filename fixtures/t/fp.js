// Stands in for a fingerprinting script. When the email field takes focus it draws text on a canvas
// and reads it back, renders audio offline, and probes 24 font families. Touches no page markup.
(() => {
const FONTS = [
  "Arial", "Verdana", "Helvetica", "Tahoma", "Trebuchet MS", "Times New Roman", "Georgia", "Garamond",
  "Courier New", "Brush Script MT", "Palatino", "Bookman", "Comic Sans MS", "Impact", "Lucida Console",
  "Lucida Sans", "Century Gothic", "Optima", "Futura", "Rockwell", "Candara", "Calibri", "Cambria", "Consolas",
];

window.fpDone = window.fpDone || 0;

document.getElementById("email").addEventListener(
  "focus",
  async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    ctx.font = "14px Arial";
    ctx.fillText("Cwm fjordbank glyphs vext quiz", 4, 24);
    ctx.getImageData(0, 0, 200, 40);
    canvas.toDataURL();

    const probe = document.createElement("canvas").getContext("2d");
    for (const family of FONTS) {
      probe.font = `16px "${family}", monospace`;
      probe.measureText("mmmmmmmmmmlli");
    }

    const audio = new OfflineAudioContext(1, 4410, 44100);
    const osc = audio.createOscillator();
    osc.connect(audio.destination);
    osc.start();
    await audio.startRendering();
    window.fpDone++;
  },
  { once: true },
);
})();
