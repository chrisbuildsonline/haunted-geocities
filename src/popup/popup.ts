import "./styles.css";
import { mountPopup } from "./app";

void mountPopup(document.getElementById("app")!, chrome, location.search);
