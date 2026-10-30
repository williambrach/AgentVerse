import { HINTS } from './tools.ts';

/** One cast member in the rail. `asked` forces the check on the talking card. */
export interface CastCard {
  id: string; name: string; part: string;
  /** Classes for the portrait, e.g. `pip slot-1`, so the world's art and recoloured slots apply. */
  faceClass: string;
  state: 'talking' | 'asked' | 'new';
  asked?: boolean;
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

const svg = (path: string, size = 20, width = 2): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  notebook: '<path d="M6 3h12v18H6zM9 3v18M12 8h4M12 12h4"/>',
  board: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  cases: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  exportArrow: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
  verdict: '<path d="M4 4h16v12H4zM8 20l2-4M16 20l-2-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
};

const iconButton = (id: string, label: string, path: string): string =>
  `<button type="button" class="hud-icon" id="${id}" title="${esc(label)}">${svg(path, 22)}<span class="sr-only">${esc(label)}</span></button>`;

/** The whole game screen: the world fills the window and the HUD floats over it. Dynamic parts are filled by main.ts. */
export function hudShell(v: { teamName: string; headline: string; topline: string }): string {
  return `<div id="station"></div><div class="hud-scrim" aria-hidden="true"></div>
    <header class="topbar">
      <div class="hud-panel case-panel">
        <a class="wordmark" href="/" aria-label="The Override home"><span class="banana-mark" id="world-icon"></span></a>
        <div class="case-text"><span class="hud-label" id="case-eyebrow">${esc(v.topline)}</span><h1 id="case-headline">${esc(v.headline)}</h1></div>
      </div>
      <div class="hud-panel world-panel"><span class="world-swatch" aria-hidden="true"></span><div class="hud-stack"><span class="hud-label">WORLD</span><span class="hud-value" id="world-name"></span></div></div>
      <div class="hud-panel timer-panel">${svg(ICONS.clock)}<span id="elapsed">0:00</span></div>
      <div class="hud-gap"></div>
      <button type="button" class="hud-panel team-panel" id="team-button" title="Change team">${svg(ICONS.team)}<span class="hud-stack"><span class="hud-label">TEAM</span><span class="team-name">${esc(v.teamName)}</span></span></button>
      <span class="coin-wrap"><span id="coin-counter" class="hud-panel coin-panel" tabindex="0" aria-describedby="coin-tip" hidden></span><span id="coin-tip" class="coin-tip" role="tooltip">${esc(HINTS.coins)}</span></span>
      <button type="button" class="hud-panel notebook-panel" id="notebook-button">${svg(ICONS.notebook)}<span>Notebook</span></button>
      <div class="hud-panel hud-icons">
        ${iconButton('leaderboard-button', 'Leaderboard', ICONS.board)}
        ${iconButton('restart-button', 'Reset session', ICONS.reset)}
        ${iconButton('reset-button', 'Cases', ICONS.cases)}
        ${iconButton('export-button', 'Export session', ICONS.exportArrow)}
      </div>
    </header>
    <div class="mode-strip"><div class="mode-strip-body"><span class="authored-label">AUTHORED DEMONSTRATION</span><span id="mode-badge" class="mode-badge"></span></div></div>
    <div class="hud-body">
      <div class="hud-rail">
        <nav class="room-nav" id="room-nav"></nav>
        <div class="toolbelt" id="toolbelt" role="group" aria-label="Arbiter tools"><span class="toolbelt-label" aria-hidden="true">ARBITER TOOLS</span><div class="toolbelt-cards" id="toolbelt-cards"></div></div>
        <button type="button" class="verdict-button" data-go="report">${svg(ICONS.verdict, 22)}<span class="hud-stack"><b>Make your verdict</b><small id="quick-progress"></small></span></button>
      </div>
      <aside class="dossier" aria-label="Conversation">
        <div class="dossier-top"><span id="notebook-section">Case briefing</span><button type="button" class="dossier-close" id="dialogue-close" aria-label="Close conversation">${svg(ICONS.close, 20)}</button></div>
        <div id="panel"></div>
      </aside>
    </div>
    <div id="movement-hint" class="movement-hint">WASD / ARROWS to walk · E to interact</div>
    <div id="toast" role="alert" hidden></div>
    <div id="overlay-root"></div>`;
}

/** One cast button in the rail. The portrait size comes from `--cell`, so the rail shares one rule with the dialogue and lineup. */
export function castCard(c: CastCard): string {
  const sub = c.state === 'talking' ? `${c.part} · talking` : c.state === 'new' ? `${c.part} · not asked` : c.part;
  const check = c.state === 'asked' || (c.state === 'talking' && c.asked === true);
  return `<button data-go="${esc(c.id)}" class="cast-card ${c.state}"${c.state === 'talking' ? ' aria-current="true"' : ''}>` +
    `<span class="cast-tile"><i class="monkey-face ${esc(c.faceClass)}"></i></span>` +
    `<span class="hud-stack cast-text"><b>${esc(c.name)}</b><small>${esc(sub)}</small></span>` +
    `<span class="interview-check" data-check="${esc(c.id)}">${check ? `<span role="img" aria-label="Asked">${svg(ICONS.check, 18, 3)}</span>` : ''}</span></button>`;
}
