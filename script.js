/* =========================================================
   FIFA ARENA — lógica de la aplicación (Vanilla JS)
   ========================================================= */

const STORAGE_KEY = 'fifaArenaTournamentState';

let state = null;              // estado completo del torneo (persistido)
let tempPlayers = [];          // jugadores durante el setup: [{name, club}] (aún no guardado)
let selectedFormat = null;     // formato elegido durante el setup
let selectedMatchMode = 'single'; // 'single' | 'double' — solo ida vs ida y vuelta (liga/grupos)
let activeTabId = null;        // tab actualmente visible
let modalContext = null;       // info del partido que el modal está editando

/* =========================================================
   UTILIDADES
   ========================================================= */

function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Devuelve el nombre del jugador con una pequeña etiqueta de club/país debajo, si existe
function playerLabelHtml(name) {
  const club = state && state.playerClubs && state.playerClubs[name];
  return club ? `${escapeHtml(name)}<span class="p-club-tag">${escapeHtml(club)}</span>` : escapeHtml(name);
}

// Devuelve "Nombre (Club)" en texto plano, para usar en el modal (textContent)
function playerModalLabel(name) {
  const club = state && state.playerClubs && state.playerClubs[name];
  return club ? `${name} (${club})` : name;
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Orden de siembra clásico de torneos (1 vs N, 2 vs N-1 ... repartidos por mitades)
function seedOrder(n) {
  let seeds = [1];
  while (seeds.length < n) {
    const m = seeds.length * 2 + 1;
    const next = [];
    seeds.forEach(s => { next.push(s); next.push(m - s); });
    seeds = next;
  }
  return seeds;
}

function saveState() {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  try { state = raw ? JSON.parse(raw) : null; } catch (e) { state = null; }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
}

/* =========================================================
   TOASTS
   ========================================================= */

function showToast(message, duration = 4200) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadState();
  bindSetupEvents();
  bindModalEvents();
  bindTournamentHeaderEvents();

  if (state && state.status && state.status !== 'setup') {
    showTournamentScreen();
    renderAll();
  } else {
    showSetupScreen();
  }
}

function showSetupScreen() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('tournament-screen').classList.add('hidden');
}

function showTournamentScreen() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('tournament-screen').classList.remove('hidden');
}

/* =========================================================
   PANTALLA DE CONFIGURACIÓN — EVENTOS
   ========================================================= */

function bindSetupEvents() {
  const addBtn = document.getElementById('add-player-btn');
  const playerInput = document.getElementById('player-input');

  addBtn.addEventListener('click', addPlayersFromInput);
  playerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addPlayersFromInput(); }
  });

  document.getElementById('players-list').addEventListener('click', e => {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    tempPlayers.splice(idx, 1);
    renderPlayerChips();
  });

  document.querySelectorAll('.format-card').forEach(card => {
    card.addEventListener('click', () => selectFormat(card.dataset.format));
  });

  document.querySelectorAll('#match-mode-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMatchMode(btn.dataset.mode));
  });

  document.getElementById('start-tournament-btn').addEventListener('click', validateAndStart);
}

function selectMatchMode(mode) {
  selectedMatchMode = mode;
  document.querySelectorAll('#match-mode-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === mode);
  });
}

function addPlayersFromInput() {
  const input = document.getElementById('player-input');
  const clubInput = document.getElementById('player-club-input');
  const raw = input.value.trim();
  if (!raw) return;

  const names = raw.split(',').map(s => s.trim()).filter(Boolean);
  const clubRaw = clubInput.value.trim();
  // El club solo se asigna cuando se agrega UN jugador a la vez;
  // en listas pegadas con comas no aplica (no sabríamos a cuál asignarlo).
  const club = names.length === 1 ? clubRaw : '';

  names.forEach(name => {
    const exists = tempPlayers.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (!exists) tempPlayers.push({ name, club });
  });

  input.value = '';
  clubInput.value = '';
  input.focus();
  renderPlayerChips();
}

function renderPlayerChips() {
  const list = document.getElementById('players-list');
  const count = document.getElementById('player-count');

  list.innerHTML = tempPlayers.map((p, i) => `
    <div class="player-chip">
      <span>${escapeHtml(p.name)}</span>
      ${p.club ? `<span class="chip-club">${escapeHtml(p.club)}</span>` : ''}
      <button type="button" class="chip-remove" data-index="${i}" aria-label="Quitar jugador">&times;</button>
    </div>
  `).join('');

  count.textContent = `${tempPlayers.length} jugador${tempPlayers.length === 1 ? '' : 'es'} inscrito${tempPlayers.length === 1 ? '' : 's'}`;
}

function selectFormat(format) {
  selectedFormat = format;
  document.querySelectorAll('.format-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.format === format);
  });
  document.getElementById('groups-config').classList.toggle('hidden', format !== 'groups');
  // La modalidad ida/vuelta solo aplica a Mini Liga y a la fase de Grupos
  document.getElementById('match-mode-config').classList.toggle('hidden', format === 'knockout' || !format);
}

function showSetupWarning(message) {
  const warn = document.getElementById('setup-warning');
  warn.textContent = message;
  warn.classList.remove('hidden');
}

function hideSetupWarning() {
  document.getElementById('setup-warning').classList.add('hidden');
}

function validateAndStart() {
  hideSetupWarning();

  const nameInput = document.getElementById('player-input');
  if (nameInput.value.trim()) addPlayersFromInput();

  const tournamentName = document.getElementById('tournament-name').value.trim() || 'Torneo Sin Nombre';

  if (tempPlayers.length < 2) {
    showSetupWarning('Necesitas al menos 2 jugadores para iniciar el torneo.');
    return;
  }
  if (!selectedFormat) {
    showSetupWarning('Elige un formato de torneo para continuar.');
    return;
  }

  let config = { doubleRound: selectedFormat !== 'knockout' && selectedMatchMode === 'double' };

  if (selectedFormat === 'groups') {
    const playersPerGroup = Math.max(3, Number(document.getElementById('players-per-group').value) || 4);
    const qualifiersPerGroup = Math.max(1, Number(document.getElementById('qualifiers-per-group').value) || 2);

    if (tempPlayers.length < playersPerGroup * 2) {
      showSetupWarning(`Necesitas al menos ${playersPerGroup * 2} jugadores para formar 2 grupos de ${playersPerGroup}.`);
      return;
    }
    if (qualifiersPerGroup >= playersPerGroup) {
      showSetupWarning('Los clasificados por grupo deben ser menos que los jugadores por grupo.');
      return;
    }
    config.playersPerGroup = playersPerGroup;
    config.qualifiersPerGroup = qualifiersPerGroup;
  }

  createTournament(tournamentName, tempPlayers, selectedFormat, config);
}

/* =========================================================
   CREACIÓN DEL TORNEO
   ========================================================= */

function createTournament(name, playerEntries, format, config) {
  // playerEntries: [{name, club}]
  const playerClubs = {};
  playerEntries.forEach(p => { if (p.club) playerClubs[p.name] = p.club; });

  const shuffledPlayers = shuffle(playerEntries.map(p => p.name));

  state = {
    name,
    players: shuffledPlayers,
    playerClubs,
    format,           // 'league' | 'groups' | 'knockout'
    config,
    status: 'ongoing', // 'ongoing' | 'finished'
    phase: format === 'groups' ? 'groups' : (format === 'knockout' ? 'knockout' : 'league'),
    champion: null,
    runnerUp: null,
    third: null
  };

  if (format === 'league') {
    state.league = { matches: generarFixture(state.players, config.doubleRound) };
  }

  if (format === 'groups') {
    state.groups = buildGroups(state.players, config.playersPerGroup);
    state.groups.forEach(g => { g.matches = generarFixture(g.players, config.doubleRound); });
    state.knockout = null;
  }

  if (format === 'knockout') {
    state.knockout = buildKnockout(state.players);
    notifyByes(state.knockout, state.players.length);
  }

  saveState();
  showTournamentScreen();
  activeTabId = null;
  renderAll();
}

function notifyByes(knockout, totalPlayers) {
  const size = nextPowerOf2(totalPlayers);
  const byes = size - totalPlayers;
  if (byes > 0) {
    showToast(`⚠ ${totalPlayers} jugadores no forman potencia de 2. Se asignaron ${byes} BYE(s) automáticos (pase directo de ronda).`, 6000);
  }
}

// Genera todos los cruces posibles entre una lista de jugadores (round robin).
// Si doubleRound es true, genera además el partido de vuelta (local/visita invertidos).
function generarFixture(players, doubleRound) {
  const matches = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      matches.push({ id: uid(), p1: players[i], p2: players[j], s1: null, s2: null, played: false, leg: doubleRound ? 1 : null });
      if (doubleRound) {
        matches.push({ id: uid(), p1: players[j], p2: players[i], s1: null, s2: null, played: false, leg: 2 });
      }
    }
  }
  return matches;
}

function buildGroups(players, size) {
  const numGroups = Math.max(1, Math.ceil(players.length / size));
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const groups = [];
  for (let i = 0; i < numGroups; i++) {
    groups.push({ id: uid(), name: 'Grupo ' + (labels[i] || (i + 1)), players: [], matches: [] });
  }
  players.forEach((p, idx) => groups[idx % numGroups].players.push(p));
  return groups;
}

function emptyKnockoutMatch() {
  return { id: uid(), p1: null, p2: null, s1: null, s2: null, pen1: null, pen2: null, played: false, isBye: false, winner: null, loser: null };
}

// Construye el árbol completo de eliminación directa a partir de una lista ordenada de jugadores
function buildKnockout(orderedPlayers) {
  const size = nextPowerOf2(orderedPlayers.length);
  let byesLeft = size - orderedPlayers.length;

  const queue = orderedPlayers.slice();
  const firstRound = [];

  while (queue.length) {
    if (byesLeft > 0) {
      const p = queue.shift();
      firstRound.push({ id: uid(), p1: p, p2: null, s1: null, s2: null, pen1: null, pen2: null, played: true, isBye: true, winner: p, loser: null });
      byesLeft--;
    } else {
      const p1 = queue.shift();
      const p2 = queue.shift();
      firstRound.push({ id: uid(), p1, p2, s1: null, s2: null, pen1: null, pen2: null, played: false, isBye: false, winner: null, loser: null });
    }
  }

  const rounds = [firstRound];
  let count = firstRound.length;
  while (count > 1) {
    count = count / 2;
    const round = [];
    for (let i = 0; i < count; i++) round.push(emptyKnockoutMatch());
    rounds.push(round);
  }

  const bracket = {
    rounds,
    thirdPlace: size >= 4 ? emptyKnockoutMatch() : null,
    champion: null,
    runnerUp: null,
    third: null
  };

  // Propagar los BYEs de inmediato a la siguiente ronda
  firstRound.forEach((m, idx) => {
    if (m.isBye) propagateWinner(bracket, 0, idx, m.winner, null);
  });

  return bracket;
}

function roundLabel(numMatches) {
  if (numMatches === 1) return 'Final';
  if (numMatches === 2) return 'Semifinales';
  if (numMatches === 4) return 'Cuartos de Final';
  if (numMatches === 8) return 'Octavos de Final';
  if (numMatches === 16) return 'Dieciseisavos de Final';
  return `Ronda de ${numMatches * 2}`;
}

/* =========================================================
   PROPAGACIÓN DE RESULTADOS EN EL BRACKET
   ========================================================= */

function propagateWinner(bracket, roundIdx, matchIdx, winner, loser) {
  const rounds = bracket.rounds;
  const isSemifinal = rounds[roundIdx].length === 2;
  const nextRoundIdx = roundIdx + 1;

  if (nextRoundIdx < rounds.length) {
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const slot = matchIdx % 2 === 0 ? 'p1' : 'p2';
    rounds[nextRoundIdx][nextMatchIdx][slot] = winner;
  } else {
    bracket.champion = winner;
    bracket.runnerUp = loser;
  }

  if (isSemifinal && bracket.thirdPlace && loser) {
    const slot = matchIdx === 0 ? 'p1' : 'p2';
    bracket.thirdPlace[slot] = loser;
  }
}

// Comprueba si un partido de eliminatoria ya avanzó a una ronda que también tiene resultado (bloqueado para edición)
function isKnockoutMatchLocked(bracket, roundIdx, matchIdx) {
  const rounds = bracket.rounds;
  const nextRoundIdx = roundIdx + 1;
  if (nextRoundIdx < rounds.length) {
    const nextMatch = rounds[nextRoundIdx][Math.floor(matchIdx / 2)];
    if (nextMatch.played) return true;
  } else if (bracket.champion) {
    return true;
  }
  if (rounds[roundIdx].length === 2 && bracket.thirdPlace && bracket.thirdPlace.played) {
    return true;
  }
  return false;
}

/* =========================================================
   TABLA DE POSICIONES
   ========================================================= */

function computeTable(players, matches) {
  const table = {};
  players.forEach(p => { table[p] = { name: p, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 }; });

  matches.forEach(m => {
    if (!m.played) return;
    const t1 = table[m.p1], t2 = table[m.p2];
    if (!t1 || !t2) return;
    t1.pj++; t2.pj++;
    t1.gf += m.s1; t1.gc += m.s2;
    t2.gf += m.s2; t2.gc += m.s1;
    if (m.s1 > m.s2) { t1.pg++; t1.pts += 3; t2.pp++; }
    else if (m.s1 < m.s2) { t2.pg++; t2.pts += 3; t1.pp++; }
    else { t1.pe++; t2.pe++; t1.pts += 1; t2.pts += 1; }
  });

  Object.values(table).forEach(t => { t.dg = t.gf - t.gc; });

  return Object.values(table).sort((a, b) =>
    b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.name.localeCompare(b.name)
  );
}

/* =========================================================
   RENDER — ORQUESTADOR PRINCIPAL
   ========================================================= */

function renderAll() {
  if (!state) return;

  document.getElementById('tournament-title').textContent = state.name;
  document.getElementById('tournament-format-badge').textContent = formatDisplayName(state.format);

  const tabs = computeTabs();
  if (!activeTabId || !tabs.some(t => t.id === activeTabId)) {
    activeTabId = tabs[0] ? tabs[0].id : null;
  }

  renderTabsNav(tabs);
  renderTabContent();
}

function formatDisplayName(format) {
  if (format === 'league') return 'MINI LIGA';
  if (format === 'groups') return 'GRUPOS + ELIMINATORIA';
  if (format === 'knockout') return 'ELIMINACIÓN DIRECTA';
  return format.toUpperCase();
}

function computeTabs() {
  const tabs = [];
  if (state.format === 'league') {
    tabs.push({ id: 'table', label: '📊 Tabla' });
    tabs.push({ id: 'matches', label: '⚽ Partidos' });
  }
  if (state.format === 'groups') {
    tabs.push({ id: 'groups', label: '📊 Grupos' });
    if (state.knockout) tabs.push({ id: 'bracket', label: '🏆 Eliminatoria' });
  }
  if (state.format === 'knockout') {
    tabs.push({ id: 'bracket', label: '🏆 Bracket' });
  }
  if (state.status === 'finished') {
    tabs.push({ id: 'champion', label: '👑 Campeón' });
  }
  return tabs;
}

function renderTabsNav(tabs) {
  const nav = document.getElementById('tabs-nav');
  nav.innerHTML = tabs.map(t => `
    <button type="button" class="tab-btn ${t.id === activeTabId ? 'active' : ''}" data-tab="${t.id}" role="tab">${t.label}</button>
  `).join('');

  nav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTabId = btn.dataset.tab;
      renderAll();
    });
  });
}

function renderTabContent() {
  const container = document.getElementById('tab-content');
  container.innerHTML = '';

  if (!activeTabId) {
    container.innerHTML = `<p style="color:var(--text-dim)">No hay contenido disponible todavía.</p>`;
    return;
  }

  let html = '';
  if (activeTabId === 'table') html = renderLeaguePanel();
  else if (activeTabId === 'matches') html = renderLeagueMatchesPanel();
  else if (activeTabId === 'groups') html = renderGroupsPanel();
  else if (activeTabId === 'bracket') html = renderBracketPanel();
  else if (activeTabId === 'champion') html = renderChampionPanel();

  container.innerHTML = `<div class="tab-panel">${html}</div>`;
  bindTabContentEvents(container);

  if (activeTabId === 'champion') {
    launchConfetti();
  }
}

/* =========================================================
   RENDER — LIGA
   ========================================================= */

function renderLeaguePanel() {
  const table = computeTable(state.players, state.league.matches);
  return `
    <h2 class="section-title">Tabla de Posiciones</h2>
    ${renderStandingsTable(table, null)}
  `;
}

function renderLeagueMatchesPanel() {
  return `
    <h2 class="section-title">Partidos (${state.league.matches.filter(m => m.played).length}/${state.league.matches.length} jugados)</h2>
    ${renderMatchList(state.league.matches, { type: 'league' })}
  `;
}

function renderStandingsTable(table, qualifyCount) {
  return `
    <div class="standings-wrap">
      <table class="standings">
        <thead>
          <tr>
            <th>#</th><th>Jugador</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          ${table.map((t, i) => `
            <tr class="${qualifyCount && i < qualifyCount ? 'qualified' : ''}">
              <td class="rank-cell">${i + 1}</td>
              <td class="player-name">${playerLabelHtml(t.name)}</td>
              <td>${t.pj}</td><td>${t.pg}</td><td>${t.pe}</td><td>${t.pp}</td>
              <td>${t.gf}</td><td>${t.gc}</td><td>${t.dg > 0 ? '+' + t.dg : t.dg}</td>
              <td class="pts-cell">${t.pts}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${qualifyCount ? `<p class="standings-legend"><span class="dot-green">Clasifican a la fase eliminatoria</span></p>` : ''}
    </div>
  `;
}

function renderMatchList(matches, ctx) {
  if (!matches.length) return `<p style="color:var(--text-dim)">Sin partidos.</p>`;
  return `
    <div class="match-grid">
      ${matches.map(m => {
        const played = m.played;
        const w1 = played && m.s1 > m.s2;
        const w2 = played && m.s2 > m.s1;
        const scoreDisplay = played ? `${m.s1} - ${m.s2}` : 'vs';
        const attrs = `data-action="open-score" data-type="${ctx.type}" data-match-id="${m.id}" ${ctx.groupId ? `data-group-id="${ctx.groupId}"` : ''}`;
        const legTag = m.leg === 1 ? '<span class="leg-tag leg-ida">IDA</span>' : (m.leg === 2 ? '<span class="leg-tag leg-vuelta">VUELTA</span>' : '');
        return `
          <div class="match-card ${played ? 'played' : ''}">
            ${legTag}
            <div class="match-side ${w1 ? 'winner' : ''}"><span class="p-name">${playerLabelHtml(m.p1)}</span></div>
            <div class="match-score">${scoreDisplay}</div>
            <div class="match-side side-right ${w2 ? 'winner' : ''}"><span class="p-name">${playerLabelHtml(m.p2)}</span></div>
            <div class="match-action">
              <button type="button" class="btn ${played ? 'btn-secondary' : 'btn-primary'} btn-sm" ${attrs}>
                ${played ? 'Editar' : 'Registrar'}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* =========================================================
   RENDER — GRUPOS
   ========================================================= */

function renderGroupsPanel() {
  const qc = state.config.qualifiersPerGroup;
  let html = '';

  state.groups.forEach(g => {
    const table = computeTable(g.players, g.matches);
    html += `
      <div class="group-block">
        <h2 class="section-title">${escapeHtml(g.name)}</h2>
        ${renderStandingsTable(table, qc)}
        <div style="height:16px"></div>
        ${renderMatchList(g.matches, { type: 'group', groupId: g.id })}
      </div>
    `;
  });

  return html;
}

/* =========================================================
   RENDER — BRACKET
   ========================================================= */

function renderBracketPanel() {
  const bracket = state.knockout;
  if (!bracket) return `<p style="color:var(--text-dim)">La fase eliminatoria aún no se ha generado.</p>`;

  let notice = '';
  const hasByes = bracket.rounds[0].some(m => m.isBye);
  if (hasByes) {
    notice = `<p class="bracket-notice">⚠ El número de jugadores clasificados no era potencia de 2 — algunos avanzaron por BYE (pase directo).</p>`;
  }

  const roundsHtml = bracket.rounds.map((round, rIdx) => `
    <div class="bracket-round">
      <p class="bracket-round-title">${roundLabel(round.length)}</p>
      <div class="bracket-matches">
        ${round.map((m, mIdx) => renderBracketMatch(m, rIdx, mIdx, bracket)).join('')}
      </div>
    </div>
  `).join('');

  let thirdPlaceHtml = '';
  if (bracket.thirdPlace) {
    thirdPlaceHtml = `
      <div class="third-place-block">
        <p class="bracket-round-title">Tercer Puesto</p>
        <div class="bracket-matches" style="max-width:230px">
          ${renderBracketMatch(bracket.thirdPlace, -1, 0, bracket)}
        </div>
      </div>
    `;
  }

  return `
    <h2 class="section-title">Bracket del Torneo</h2>
    ${notice}
    <div class="bracket-scroll">
      <div class="bracket">${roundsHtml}</div>
    </div>
    ${thirdPlaceHtml}
  `;
}

function renderBracketMatch(m, roundIdx, matchIdx, bracket) {
  const isThird = roundIdx === -1;
  const bothKnown = m.p1 && m.p2;
  const decided = m.played;
  const winnerIsP1 = decided && m.winner === m.p1;
  const winnerIsP2 = decided && m.winner === m.p2;

  const scoreText = (score, pen) => {
    if (!decided) return '';
    let txt = String(score ?? 0);
    if (pen !== null && pen !== undefined) txt += ` (${pen})`;
    return txt;
  };

  let action = '';
  if (m.isBye) {
    action = `<div class="bm-action bye-label">BYE · PASE DIRECTO</div>`;
  } else if (bothKnown && !decided) {
    const attrs = isThird
      ? `data-action="open-score" data-type="thirdplace"`
      : `data-action="open-score" data-type="knockout" data-round-idx="${roundIdx}" data-match-idx="${matchIdx}"`;
    action = `<div class="bm-action"><button type="button" ${attrs}>REGISTRAR RESULTADO</button></div>`;
  } else if (bothKnown && decided) {
    const locked = isThird ? false : isKnockoutMatchLocked(bracket, roundIdx, matchIdx);
    if (!locked) {
      const attrs = isThird
        ? `data-action="open-score" data-type="thirdplace"`
        : `data-action="open-score" data-type="knockout" data-round-idx="${roundIdx}" data-match-idx="${matchIdx}"`;
      action = `<div class="bm-action"><button type="button" ${attrs}>EDITAR RESULTADO</button></div>`;
    }
  }

  return `
    <div class="bracket-match-wrap">
      <div class="bracket-match ${decided ? 'decided' : ''} ${m.isBye ? 'bye-match' : ''}">
        <div class="bm-player ${!m.p1 ? 'tbd' : ''} ${winnerIsP1 ? 'winner-row' : ''}">
          <span class="bm-name">${m.p1 ? escapeHtml(m.p1) : 'Por definir'}</span>
          <span class="bm-score">${scoreText(m.s1, m.pen1)}</span>
        </div>
        <div class="bm-player ${!m.p2 ? 'tbd' : ''} ${winnerIsP2 ? 'winner-row' : ''}">
          <span class="bm-name">${m.p2 ? escapeHtml(m.p2) : (m.isBye ? '— (BYE)' : 'Por definir')}</span>
          <span class="bm-score">${scoreText(m.s2, m.pen2)}</span>
        </div>
        ${action}
      </div>
    </div>
  `;
}

/* =========================================================
   RENDER — CAMPEÓN
   ========================================================= */

function renderChampionPanel() {
  const champion = state.champion;
  const runnerUp = state.runnerUp;
  const third = state.third;

  return `
    <div class="champion-wrap">
      <span class="champion-crown">👑</span>
      <p class="champion-eyebrow">CAMPEÓN DEL TORNEO</p>
      <h2 class="champion-name">${escapeHtml(champion || '—')}</h2>
      ${champion && state.playerClubs[champion] ? `<p class="champion-club">${escapeHtml(state.playerClubs[champion])}</p>` : ''}
      <p class="champion-sub">${escapeHtml(state.name)} ha llegado a su fin. ¡Felicidades!</p>

      <div class="podium">
        ${runnerUp ? `
        <div class="podium-step second">
          <span class="podium-medal">🥈</span>
          <span class="podium-name">${playerLabelHtml(runnerUp)}</span>
          <div class="podium-block">2°</div>
        </div>` : ''}

        <div class="podium-step first">
          <span class="podium-medal">🥇</span>
          <span class="podium-name">${champion ? playerLabelHtml(champion) : '—'}</span>
          <div class="podium-block">1°</div>
        </div>

        ${third ? `
        <div class="podium-step third">
          <span class="podium-medal">🥉</span>
          <span class="podium-name">${playerLabelHtml(third)}</span>
          <div class="podium-block">3°</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

/* =========================================================
   EVENTOS DE CONTENIDO DE TABS (delegación)
   ========================================================= */

function bindTabContentEvents(container) {
  container.querySelectorAll('[data-action="open-score"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (type === 'league') openScoreModalForLeague(btn.dataset.matchId);
      else if (type === 'group') openScoreModalForGroup(btn.dataset.groupId, btn.dataset.matchId);
      else if (type === 'knockout') openScoreModalForKnockout(Number(btn.dataset.roundIdx), Number(btn.dataset.matchIdx));
      else if (type === 'thirdplace') openScoreModalForThirdPlace();
    });
  });
}

/* =========================================================
   MODAL DE RESULTADO
   ========================================================= */

function bindModalEvents() {
  document.getElementById('close-score-modal').addEventListener('click', closeScoreModal);
  document.getElementById('score-modal').addEventListener('click', e => {
    if (e.target.id === 'score-modal') closeScoreModal();
  });
  document.getElementById('save-score-btn').addEventListener('click', handleSaveScore);
}

function openScoreModalBase({ label, p1, p2, s1, s2, pen1, pen2, showPenalty, type, extra }) {
  modalContext = { type, s1raw: s1, s2raw: s2, ...extra };

  document.getElementById('modal-round-label').textContent = label;
  document.getElementById('modal-p1-name').textContent = p1;
  document.getElementById('modal-p2-name').textContent = p2;
  document.getElementById('modal-p1-score').value = s1 ?? 0;
  document.getElementById('modal-p2-score').value = s2 ?? 0;
  document.getElementById('modal-p1-pen').value = pen1 ?? 0;
  document.getElementById('modal-p2-pen').value = pen2 ?? 0;

  document.getElementById('penalty-section').classList.toggle('hidden', !showPenalty);
  document.getElementById('modal-error').classList.add('hidden');

  document.getElementById('score-modal').classList.remove('hidden');
  document.getElementById('modal-p1-score').focus();
}

function openScoreModalForLeague(matchId) {
  const m = state.league.matches.find(x => x.id === matchId);
  if (!m) return;
  openScoreModalBase({
    label: m.leg === 1 ? 'MINI LIGA · IDA' : (m.leg === 2 ? 'MINI LIGA · VUELTA' : 'MINI LIGA'),
    p1: playerModalLabel(m.p1), p2: playerModalLabel(m.p2), s1: m.s1, s2: m.s2,
    showPenalty: false,
    type: 'league',
    extra: { matchId }
  });
}

function openScoreModalForGroup(groupId, matchId) {
  const g = state.groups.find(x => x.id === groupId);
  if (!g) return;
  const m = g.matches.find(x => x.id === matchId);
  if (!m) return;
  const legSuffix = m.leg === 1 ? ' · IDA' : (m.leg === 2 ? ' · VUELTA' : '');
  openScoreModalBase({
    label: g.name.toUpperCase() + legSuffix,
    p1: playerModalLabel(m.p1), p2: playerModalLabel(m.p2), s1: m.s1, s2: m.s2,
    showPenalty: false,
    type: 'group',
    extra: { groupId, matchId }
  });
}

function openScoreModalForKnockout(roundIdx, matchIdx) {
  const bracket = state.knockout;
  const m = bracket.rounds[roundIdx][matchIdx];
  if (!m || !m.p1 || !m.p2) return;
  openScoreModalBase({
    label: roundLabel(bracket.rounds[roundIdx].length).toUpperCase(),
    p1: playerModalLabel(m.p1), p2: playerModalLabel(m.p2), s1: m.s1, s2: m.s2, pen1: m.pen1, pen2: m.pen2,
    showPenalty: m.played && m.s1 === m.s2,
    type: 'knockout',
    extra: { roundIdx, matchIdx }
  });
}

function openScoreModalForThirdPlace() {
  const bracket = state.knockout;
  const m = bracket.thirdPlace;
  if (!m || !m.p1 || !m.p2) return;
  openScoreModalBase({
    label: 'TERCER PUESTO',
    p1: playerModalLabel(m.p1), p2: playerModalLabel(m.p2), s1: m.s1, s2: m.s2, pen1: m.pen1, pen2: m.pen2,
    showPenalty: m.played && m.s1 === m.s2,
    type: 'thirdplace',
    extra: {}
  });
}

function closeScoreModal() {
  document.getElementById('score-modal').classList.add('hidden');
  modalContext = null;
}

function showModalError(msg) {
  const err = document.getElementById('modal-error');
  err.textContent = msg;
  err.classList.remove('hidden');
}

function handleSaveScore() {
  if (!modalContext) return;

  const s1 = Number(document.getElementById('modal-p1-score').value);
  const s2 = Number(document.getElementById('modal-p2-score').value);

  if (Number.isNaN(s1) || Number.isNaN(s2) || s1 < 0 || s2 < 0) {
    showModalError('Ingresa marcadores válidos (números iguales o mayores a 0).');
    return;
  }

  const isKnockoutType = modalContext.type === 'knockout' || modalContext.type === 'thirdplace';
  const isDraw = s1 === s2;

  let pen1 = null, pen2 = null;
  if (isKnockoutType && isDraw) {
    document.getElementById('penalty-section').classList.remove('hidden');
    pen1 = Number(document.getElementById('modal-p1-pen').value);
    pen2 = Number(document.getElementById('modal-p2-pen').value);
    if (Number.isNaN(pen1) || Number.isNaN(pen2) || pen1 < 0 || pen2 < 0) {
      showModalError('Ingresa un marcador de penales válido.');
      return;
    }
    if (pen1 === pen2) {
      showModalError('Los penales no pueden terminar empatados. Ajusta el resultado.');
      return;
    }
  }

  if (modalContext.type === 'league') {
    saveLeagueMatch(modalContext.matchId, s1, s2);
  } else if (modalContext.type === 'group') {
    saveGroupMatch(modalContext.groupId, modalContext.matchId, s1, s2);
  } else if (modalContext.type === 'knockout') {
    saveKnockoutMatch(modalContext.roundIdx, modalContext.matchIdx, s1, s2, pen1, pen2);
  } else if (modalContext.type === 'thirdplace') {
    saveThirdPlaceMatch(s1, s2, pen1, pen2);
  }

  closeScoreModal();
  saveState();
  renderAll();
}

/* =========================================================
   GUARDADO DE RESULTADOS
   ========================================================= */

function saveLeagueMatch(matchId, s1, s2) {
  const m = state.league.matches.find(x => x.id === matchId);
  if (!m) return;
  m.s1 = s1; m.s2 = s2; m.played = true;
}

function saveGroupMatch(groupId, matchId, s1, s2) {
  const g = state.groups.find(x => x.id === groupId);
  if (!g) return;
  const m = g.matches.find(x => x.id === matchId);
  if (!m) return;
  m.s1 = s1; m.s2 = s2; m.played = true;

  checkGroupsPhaseComplete();
}

function checkGroupsPhaseComplete() {
  if (state.knockout) return; // ya generada
  const allDone = state.groups.every(g => g.matches.every(m => m.played));
  if (!allDone) return;

  const qc = state.config.qualifiersPerGroup;
  const ranked = [];
  const maxRank = qc;

  for (let rank = 0; rank < maxRank; rank++) {
    state.groups.forEach(g => {
      const table = computeTable(g.players, g.matches);
      if (table[rank]) ranked.push(table[rank].name);
    });
  }

  const size = nextPowerOf2(ranked.length);
  const order = seedOrder(size).filter(s => s <= ranked.length);
  const seededPlayers = order.map(seedNum => ranked[seedNum - 1]);

  state.knockout = buildKnockout(seededPlayers);
  state.phase = 'knockout';
  notifyByes(state.knockout, seededPlayers.length);
  showToast('🔥 ¡Fase de grupos completa! La fase eliminatoria fue generada.', 5500);
  activeTabId = 'bracket';
}

function determineWinnerLoser(m, s1, s2, pen1, pen2) {
  if (s1 > s2) return { winner: m.p1, loser: m.p2 };
  if (s2 > s1) return { winner: m.p2, loser: m.p1 };
  // empate -> definir por penales
  if (pen1 > pen2) return { winner: m.p1, loser: m.p2 };
  return { winner: m.p2, loser: m.p1 };
}

function saveKnockoutMatch(roundIdx, matchIdx, s1, s2, pen1, pen2) {
  const bracket = state.knockout;
  const m = bracket.rounds[roundIdx][matchIdx];
  if (!m) return;

  m.s1 = s1; m.s2 = s2; m.pen1 = pen1; m.pen2 = pen2; m.played = true;

  const { winner, loser } = determineWinnerLoser(m, s1, s2, pen1, pen2);
  m.winner = winner; m.loser = loser;

  propagateWinner(bracket, roundIdx, matchIdx, winner, loser);

  checkTournamentFinished();
}

function saveThirdPlaceMatch(s1, s2, pen1, pen2) {
  const bracket = state.knockout;
  const m = bracket.thirdPlace;
  if (!m) return;

  m.s1 = s1; m.s2 = s2; m.pen1 = pen1; m.pen2 = pen2; m.played = true;

  const { winner } = determineWinnerLoser(m, s1, s2, pen1, pen2);
  m.winner = winner;
  bracket.third = winner;

  checkTournamentFinished();
}

function checkTournamentFinished() {
  const bracket = state.knockout;
  if (!bracket || !bracket.champion) return;

  const thirdPending = bracket.thirdPlace && !bracket.thirdPlace.played;
  if (thirdPending) return; // esperar resultado del tercer puesto antes de cerrar

  state.status = 'finished';
  state.champion = bracket.champion;
  state.runnerUp = bracket.runnerUp;
  state.third = bracket.third || null;
  activeTabId = 'champion';
  showToast(`👑 ¡${bracket.champion} es el campeón del torneo!`, 6000);
}

/* =========================================================
   ENCABEZADO DEL TORNEO / RESET
   ========================================================= */

function bindTournamentHeaderEvents() {
  document.getElementById('reset-tournament-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('hidden');
  });
  document.getElementById('cancel-reset-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
  });
  document.getElementById('confirm-reset-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    resetTournament();
  });
  document.getElementById('confirm-modal').addEventListener('click', e => {
    if (e.target.id === 'confirm-modal') document.getElementById('confirm-modal').classList.add('hidden');
  });
}

function resetTournament() {
  clearState();
  tempPlayers = [];
  selectedFormat = null;
  selectedMatchMode = 'single';
  activeTabId = null;

  document.getElementById('tournament-name').value = '';
  document.getElementById('player-input').value = '';
  document.getElementById('player-club-input').value = '';
  document.getElementById('groups-config').classList.add('hidden');
  document.getElementById('match-mode-config').classList.add('hidden');
  document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#match-mode-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === 'single');
  });
  renderPlayerChips();
  hideSetupWarning();

  showSetupScreen();
}

/* =========================================================
   CONFETI (canvas nativo)
   ========================================================= */

let confettiRunning = false;

function launchConfetti() {
  if (confettiRunning) return;
  confettiRunning = true;

  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#8b3af7', '#00e5ff', '#39ff8a', '#ffcb3d', '#ff3860'];
  const pieces = [];
  const count = 140;

  for (let i = 0; i < count; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 2 + Math.random() * 3.5,
      drift: -1.5 + Math.random() * 3,
      rot: Math.random() * 360,
      rotSpeed: -8 + Math.random() * 16
    });
  }

  let frames = 0;
  const maxFrames = 260;

  function tick() {
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.y += p.speed;
      p.x += p.drift;
      p.rot += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frames < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiRunning = false;
    }
  }

  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  const canvas = document.getElementById('confetti-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});