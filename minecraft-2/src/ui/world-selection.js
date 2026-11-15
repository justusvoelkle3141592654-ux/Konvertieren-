// Weltauswahl (Einzelspieler): Liste der Spielstände, neue Welt, laden, umbenennen,
// löschen, Spielmodus und Schwierigkeit ändern.
import { DIFFICULTIES, DIFFICULTY_LABELS, GAME_MODE_LABELS, GAME_MODES } from '../config.js';
import { button, cycleButton, formatDate, formatDuration, h, openDialog, toggleButton } from './ui-kit.js';

const MAX_NAME = 32;

export function buildWorldSelection(app) {
  let worlds = [];
  let selectedId = null;
  const previewUrls = new Map();

  const listEl = h('div', { class: 'world-list' });
  const hintEl = h('div', { class: 'label', style: { minHeight: '14px', textAlign: 'center', marginTop: '6px' } });

  const btnLoad = button('Welt laden', () => loadSelected(), { wide: false });
  const btnNew = button('Neue Welt...', () => openCreateDialog());
  const btnRename = button('Umbenennen...', () => openRenameDialog());
  const btnDelete = button('Löschen...', () => openDeleteDialog(), { danger: true });
  const btnMode = button('Spielmodus', () => toggleMode());
  const btnDifficulty = button('Schwierigkeit', () => cycleDifficulty());
  const btnBack = button('Zurück', () => app.screens.back('title'));

  const selectedMeta = () => worlds.find((w) => w.id === selectedId) || null;

  function setHint(text) {
    hintEl.textContent = text || '';
  }

  function previewUrl(meta) {
    if (!meta.preview) return null;
    const cached = previewUrls.get(meta.id);
    if (cached && cached.stamp === meta.lastPlayed) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(meta.preview);
    previewUrls.set(meta.id, { url, stamp: meta.lastPlayed });
    return url;
  }

  function updateButtons() {
    const meta = selectedMeta();
    btnLoad.disabled = !meta;
    btnRename.disabled = !meta;
    btnDelete.disabled = !meta;
    btnMode.disabled = !meta;
    btnDifficulty.disabled = !meta;
    btnMode.textContent = meta ? `Spielmodus: ${GAME_MODE_LABELS[meta.mode] ?? meta.mode}` : 'Spielmodus';
    btnDifficulty.textContent = meta ? `Schwierigkeit: ${DIFFICULTY_LABELS[meta.difficulty] ?? meta.difficulty}` : 'Schwierigkeit';
  }

  function render() {
    listEl.replaceChildren();
    if (!worlds.length) {
      listEl.append(h('div', { class: 'empty-hint' }, 'Noch keine Welten vorhanden.', h('br'), 'Erstelle eine neue Welt, um zu beginnen.'));
    }
    for (const meta of worlds) {
      const preview = previewUrl(meta);
      const entry = h(
        'div',
        {
          class: `world-entry${meta.id === selectedId ? ' selected' : ''}`,
          dataset: { worldId: meta.id },
          onclick: () => {
            selectedId = meta.id;
            render();
          },
          ondblclick: () => {
            selectedId = meta.id;
            loadSelected();
          },
        },
        h('div', { class: 'world-preview', style: preview ? { backgroundImage: `url(${preview})` } : { backgroundImage: 'linear-gradient(#78a7ff, #3d6fc4)' } }),
        h(
          'div',
          { class: 'world-meta' },
          h('div', { class: 'name', text: meta.name }),
          h('div', { class: 'info', text: `${GAME_MODE_LABELS[meta.mode] ?? meta.mode} · ${DIFFICULTY_LABELS[meta.difficulty] ?? meta.difficulty}` }),
          h('div', { class: 'info', text: `Seed: ${meta.seedText || meta.seed}` }),
          h('div', { class: 'info', text: `Zuletzt: ${formatDate(meta.lastPlayed)} · ${formatDuration(meta.playTime || 0)}` })
        )
      );
      listEl.append(entry);
    }
    updateButtons();
  }

  async function refresh() {
    try {
      worlds = await app.listWorlds();
      if (selectedId && !worlds.some((w) => w.id === selectedId)) selectedId = null;
    } catch (err) {
      worlds = [];
      setHint(`Speicher nicht verfügbar: ${err.message}`);
    }
    render();
  }

  function loadSelected() {
    const meta = selectedMeta();
    if (meta) app.loadWorld(meta.id);
  }

  async function toggleMode() {
    const meta = selectedMeta();
    if (!meta) return;
    const next = GAME_MODES[(GAME_MODES.indexOf(meta.mode) + 1) % GAME_MODES.length];
    await app.updateWorld(meta.id, { mode: next });
    await refresh();
  }

  async function cycleDifficulty() {
    const meta = selectedMeta();
    if (!meta) return;
    const next = DIFFICULTIES[(DIFFICULTIES.indexOf(meta.difficulty) + 1) % DIFFICULTIES.length];
    await app.updateWorld(meta.id, { difficulty: next });
    await refresh();
  }

  function openCreateDialog() {
    const state = { mode: 'survival', difficulty: 'normal', structures: true, flat: false };
    const nameInput = h('input', { class: 'mc-input', type: 'text', maxlength: MAX_NAME, value: 'Neue Welt', 'aria-label': 'Weltname' });
    const seedInput = h('input', { class: 'mc-input', type: 'text', maxlength: 40, placeholder: 'leer = zufällig', 'aria-label': 'Seed' });
    const error = h('div', { class: 'label', style: { color: '#b00000', minHeight: '12px' } });
    const extra = h(
      'div',
      { class: 'stack', style: { width: '100%', marginTop: '6px' } },
      toggleButton({ label: 'Strukturen', value: state.structures, onChange: (v) => (state.structures = v) }),
      cycleButton({ label: 'Welttyp', values: ['standard', 'flach'], value: 'standard', format: (v) => (v === 'flach' ? 'Flach' : 'Standard'), onChange: (v) => (state.flat = v === 'flach') })
    );
    const extraWrap = h('div', { class: 'hidden' }, extra);
    const moreBtn = button('Weitere Weltoptionen ▾', () => {
      const open = extraWrap.classList.toggle('hidden') === false;
      moreBtn.textContent = open ? 'Weitere Weltoptionen ▴' : 'Weitere Weltoptionen ▾';
    }, { wide: true });

    let modeBtn;
    let diffBtn;
    modeBtn = cycleButton({
      label: 'Spielmodus',
      values: GAME_MODES,
      value: state.mode,
      format: (v) => GAME_MODE_LABELS[v],
      onChange: (v) => (state.mode = v),
      width: 'wide',
    });
    diffBtn = cycleButton({
      label: 'Schwierigkeit',
      values: DIFFICULTIES,
      value: state.difficulty,
      format: (v) => DIFFICULTY_LABELS[v],
      onChange: (v) => (state.difficulty = v),
      width: 'wide',
    });

    const dialog = openDialog(app.uiRoot, {
      title: 'Neue Welt',
      width: 380,
      body: [
        h('div', { class: 'label' }, 'Weltname'),
        nameInput,
        h('div', { class: 'label' }, 'Seed (Zahl oder Text)'),
        seedInput,
        h('div', { class: 'stack', style: { marginTop: '6px' } }, modeBtn, diffBtn),
        h('div', { class: 'stack' }, moreBtn, extraWrap),
        error,
      ],
      buttons: [
        button('Welt erstellen', async () => {
          const name = nameInput.value.trim();
          if (!name) {
            error.textContent = 'Bitte einen Weltnamen eingeben.';
            return;
          }
          if (name.length > MAX_NAME) {
            error.textContent = `Der Name darf höchstens ${MAX_NAME} Zeichen haben.`;
            return;
          }
          dialog.close();
          const meta = await app.createWorld({
            name,
            seedText: seedInput.value.trim(),
            mode: state.mode,
            difficulty: state.difficulty,
            structures: state.structures,
            generator: state.flat ? 'flat' : 'default',
          });
          await app.loadWorld(meta.id);
        }, { wide: true }),
        button('Abbrechen', () => dialog.close(), { wide: true }),
      ],
    });
    nameInput.focus();
    nameInput.select();
  }

  function openRenameDialog() {
    const meta = selectedMeta();
    if (!meta) return;
    const input = h('input', { class: 'mc-input', type: 'text', maxlength: MAX_NAME, value: meta.name });
    const error = h('div', { class: 'label', style: { color: '#b00000', minHeight: '12px' } });
    const dialog = openDialog(app.uiRoot, {
      title: 'Welt umbenennen',
      width: 340,
      body: [h('div', { class: 'label' }, 'Neuer Name'), input, error],
      buttons: [
        button('Fertig', async () => {
          const name = input.value.trim();
          if (!name) {
            error.textContent = 'Der Name darf nicht leer sein.';
            return;
          }
          await app.updateWorld(meta.id, { name });
          dialog.close();
          await refresh();
        }, { wide: true }),
        button('Abbrechen', () => dialog.close(), { wide: true }),
      ],
    });
    input.focus();
    input.select();
  }

  function openDeleteDialog() {
    const meta = selectedMeta();
    if (!meta) return;
    const dialog = openDialog(app.uiRoot, {
      title: 'Welt löschen?',
      width: 340,
      body: [h('p', {}, `Die Welt „${meta.name}“ wird dauerhaft gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.`)],
      buttons: [
        button('Endgültig löschen', async () => {
          dialog.close();
          await app.deleteWorld(meta.id);
          selectedId = null;
          await refresh();
        }, { wide: true, danger: true }),
        button('Abbrechen', () => dialog.close(), { wide: true }),
      ],
    });
  }

  const element = h(
    'div',
    { class: 'screen dirt-bg' },
    h('h1', { class: 'title', style: { marginTop: '18px', fontSize: '14px' } }, 'Einzelspieler'),
    listEl,
    hintEl,
    h(
      'div',
      { class: 'btn-row', style: { width: '420px', marginTop: '10px' } },
      btnLoad,
      btnNew,
      btnRename,
      btnDelete,
      btnMode,
      btnDifficulty
    ),
    h('div', { class: 'btn-row', style: { marginTop: '8px' } }, btnBack)
  );

  return {
    element,
    async onShow() {
      selectedId = null;
      await refresh();
    },
  };
}
