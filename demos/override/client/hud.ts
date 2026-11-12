import { escape as esc, svg as baseSvg } from './html.ts';
import { t } from './text.ts';

/** One cast member in the rail. `asked` forces the check on the talking card. */
export interface CastCard {
  id: string; name: string; part: string;
  /** Classes for the portrait, e.g. `pip slot-1`, so the world's art and recoloured slots apply. */
  faceClass: string;
  state: 'talking' | 'asked' | 'new';
  asked?: boolean;
}

const svg = (path: string, size = 20, width = 2): string => baseSvg(path, size, width);

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

/** `label` is already HTML-safe (from t()). */
const iconButton = (id: string, label: string, path: string): string =>
  `<button type="button" class="hud-icon" id="${id}" title="${label}">${svg(path, 22)}<span class="sr-only">${label}</span></button>`;

/** The whole game screen: the world fills the window and the HUD floats over it. Dynamic parts are filled by main.ts. */
export function hudShell(v: { teamName: string; headline: string; topline: string }): string {
  return `<div id="station"></div><div id="roundtable" hidden></div><div class="hud-scrim" aria-hidden="true"></div>
    <header class="topbar">
      <div class="hud-panel case-panel">
        <a class="wordmark" href="/" aria-label="${t('hud.homeLabel')}"><span class="banana-mark" id="world-icon"></span></a>
        <div class="case-text"><span class="hud-label" id="case-eyebrow">${esc(v.topline)}</span><h1 id="case-headline">${esc(v.headline)}</h1></div>
      </div>
      <div class="hud-panel world-panel"><span class="world-swatch" aria-hidden="true"></span><div class="hud-stack"><span class="hud-label">${t('hud.world')}</span><span class="hud-value" id="world-name"></span></div></div>
      <div class="hud-panel timer-panel">${svg(ICONS.clock)}<span id="elapsed">0:00</span></div>
      <div class="hud-gap"></div>
      <button type="button" class="hud-panel team-panel" id="team-button" title="${t('hud.teamTitle')}">${svg(ICONS.team)}<span class="hud-stack"><span class="hud-label">${t('hud.team')}</span><span class="team-name">${esc(v.teamName)}</span></span></button>
      <span class="coin-wrap"><span id="coin-counter" class="hud-panel coin-panel" tabindex="0" aria-describedby="coin-tip" hidden></span><span id="coin-tip" class="coin-tip" role="tooltip">${t('tools.hint.coins')}</span></span>
      <button type="button" class="hud-panel notebook-panel" id="notebook-button">${svg(ICONS.notebook)}<span>${t('hud.notebook')}</span></button>
      <div class="hud-panel hud-icons">
        ${iconButton('leaderboard-button', t('hud.leaderboard'), ICONS.board)}
        ${iconButton('restart-button', t('hud.restart'), ICONS.reset)}
        ${iconButton('reset-button', t('hud.cases'), ICONS.cases)}
        ${iconButton('export-button', t('hud.export'), ICONS.exportArrow)}
      </div>
    </header>
    <div class="mode-strip"><div class="mode-strip-body"><span id="mode-badge" class="mode-badge"></span></div></div>
    <div class="hud-body">
      <div class="hud-rail">
        <nav class="room-nav" id="room-nav"></nav>
        <div class="toolbelt" id="toolbelt" role="group" aria-label="${t('hud.toolsAria')}"><span class="toolbelt-label" aria-hidden="true">${t('hud.toolsLabel')}</span><div class="toolbelt-cards" id="toolbelt-cards"></div></div>
        <button type="button" class="verdict-button" data-go="report">${svg(ICONS.verdict, 22)}<span class="hud-stack"><b>${t('hud.verdict')}</b><small id="quick-progress"></small></span></button>
      </div>
      <aside class="dossier" aria-label="${t('hud.conversation')}">
        <div class="dossier-top"><span id="notebook-section">${t('hud.briefing')}</span><button type="button" class="dossier-close" id="dialogue-close" aria-label="${t('hud.closeConversation')}">${svg(ICONS.close, 20)}</button></div>
        <div id="panel"></div>
      </aside>
    </div>
    <div id="movement-hint" class="movement-hint">${t('hud.movement')}</div>
    <div id="toast" role="alert" hidden></div>
    <div id="overlay-root"></div>`;
}

/** One cast button in the rail. The portrait size comes from `--cell`, so the rail shares one rule with the dialogue and lineup. */
export function castCard(c: CastCard): string {
  // A dealt part's name is hidden while the game is open: then the line is only the state.
  const bare = (line: string) => (c.part ? line : line.replace(/^\s*·\s*/, ''));
  const sub = c.state === 'talking' ? bare(t('hud.talking', { part: c.part })) : c.state === 'new' ? bare(t('hud.notAsked', { part: c.part })) : esc(c.part);
  const check = c.state === 'asked' || (c.state === 'talking' && c.asked === true);
  return `<button data-go="${esc(c.id)}" class="cast-card ${c.state}"${c.state === 'talking' ? ' aria-current="true"' : ''}>` +
    `<span class="cast-tile"><i class="monkey-face ${esc(c.faceClass)}"></i></span>` +
    `<span class="hud-stack cast-text"><b>${esc(c.name)}</b><small>${sub}</small></span>` +
    `<span class="interview-check" data-check="${esc(c.id)}">${check ? `<span role="img" aria-label="${t('hud.asked')}">${svg(ICONS.check, 18, 3)}</span>` : ''}</span></button>`;
}
