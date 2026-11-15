// Einstiegspunkt: Schriftart, Styles und Spiel starten.
import '@fontsource/press-start-2p/400.css';
import './styles/main.css';
import { Game } from './game.js';

function showFatal(message) {
  const root = document.getElementById('ui-root');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'screen dirt-bg';
  box.style.justifyContent = 'center';
  box.innerHTML = `<div class="panel" style="max-width:520px;line-height:1.8"><b>Minecraft 2 konnte nicht gestartet werden.</b><br><br>${message.replace(/[<>&]/g, '')}</div>`;
  root.append(box);
}

const game = new Game();
window.minecraft2 = game; // Zugriff für Tests und Fehlersuche (keine personenbezogenen Daten)

game.init().catch((err) => {
  console.error(err);
  showFatal(err?.message || String(err));
});
