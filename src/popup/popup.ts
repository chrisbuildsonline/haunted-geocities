import "./styles.css";
import { createPlayer } from "../audio/sound";
import { mountPopup } from "./app";

// One player for the popup document: the Haunt click's whoosh. Muted until the Sound effects switch is on.
const player = createPlayer({ storage: chrome.storage, createContext: () => new AudioContext() });
addEventListener("pagehide", () => player.dispose());

void mountPopup(document.getElementById("app")!, chrome, location.search, { play: player.play });
