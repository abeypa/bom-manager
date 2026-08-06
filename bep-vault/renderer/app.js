/* global vault */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const fmtBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const daysAgo = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

// ── Navigation ───────────────────────────────────────────────────
$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

function showScreen(name) {
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.screen === name));
  $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === `screen-${name}`));
  if (name === 'dashboard') loadDashboard();
  if (name === 'backups') loadBackups();
  if (name === 'archive') loadArchiveScreen();
  if (name === 'settings') loadSettings();
}

// ── Progress overlay ─────────────────────────────────────────────
let progressOpen = false;

function openProgress(title) {
  progressOpen = true;
  $('#progress-title').textContent = title;
  $('#progress-log').textContent = '';
  $('#progress-spinner').classList.remove('hidden');
  $('#progress-close-btn').classList.add('hidden');
  $('#progress-overlay').classList.remove('hidden');
}

function appendProgress(message) {
  if (!progressOpen) return;
  const logEl = $('#progress-log');
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function finishProgress(ok, error) {
  $('#progress-spinner').classList.add('hidden');
  $('#progress-close-btn').classList.remove('hidden');
  if (!ok) appendProgress(`\n❌ FAILED: ${error}`);
  else appendProgress('\n✅ Done.');
}

$('#progress-close-btn').addEventListener('click', () => {
  progressOpen = false;
  $('#progress-overlay').classList.add('hidden');
  loadDashboard();
});

vault.onProgress((message) => appendProgress(message));
vault.onOperationDone(({ ok, error }) => { if (progressOpen) finishProgress(ok, error); });

async function runWithProgress(title, fn) {
  openProgress(title);
  try {
    await fn();
  } catch (error) {
    finishProgress(false, error.message || String(error));
  }
}

// ── Generic modal ────────────────────────────────────────────────
function openModal(html) {
  $('#modal-dialog').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-dialog').innerHTML = '';
}
$('#modal-overlay').addEventListener('click', (event) => {
  if (event.target === $('#modal-overlay')) closeModal();
});

// ── Dashboard ────────────────────────────────────────────────────
async function loadDashboard() {
  const overview = await vault.getOverview();

  $('#setup-banner').classList.toggle('hidden', overview.configured);

  const banner = $('#health-banner');
  const last = overview.lastFullBackup;
  const age = last ? daysAgo(last.createdAt) : null;
  if (!overview.configured) {
    banner.classList.add('hidden');
  } else if (age === null) {
    banner.className = 'banner banner-danger';
    banner.textContent = 'No full backup found yet. Run your first backup now.';
    banner.classList.remove('hidden');
  } else if (age > 7) {
    banner.className = 'banner banner-warn';
    banner.textContent = `Your last full backup is ${age} day(s) old. Consider running one now.`;
    banner.classList.remove('hidden');
  } else {
    banner.className = 'banner banner-ok';
    banner.textContent = `Backups are healthy — last full backup ${age === 0 ? 'today' : `${age} day(s) ago`}.`;
    banner.classList.remove('hidden');
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const schedule = overview.schedule;
  const scheduleText = schedule.enabled
    ? `${dayNames[schedule.dayOfWeek]} ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
    : 'Off';

  $('#dashboard-cards').innerHTML = `
    <div class="card ${age === null ? 'bad' : age > 7 ? 'warn' : 'good'}">
      <div class="card-label">Last full backup</div>
      <div class="card-value">${age === null ? 'Never' : age === 0 ? 'Today' : `${age}d ago`}</div>
      <div class="card-sub">${last ? fmtDate(last.createdAt) : 'Run one from Quick actions'}</div>
    </div>
    <div class="card">
      <div class="card-label">Backups on disk</div>
      <div class="card-value">${overview.backupCount}</div>
      <div class="card-sub">full + incremental</div>
    </div>
    <div class="card">
      <div class="card-label">Archived projects</div>
      <div class="card-value">${overview.archiveCount}</div>
      <div class="card-sub">.bepvault files</div>
    </div>
    <div class="card">
      <div class="card-label">Auto backup</div>
      <div class="card-value" style="font-size:16px; margin-top:10px;">${scheduleText}</div>
      <div class="card-sub">${schedule.enabled ? 'weekly, while app is running' : 'enable in Settings'}</div>
    </div>
  `;
}

$('#goto-settings-btn').addEventListener('click', () => showScreen('settings'));
$('#dash-backup-btn').addEventListener('click', () => runWithProgress('Running full backup…', () => vault.runFullBackup()));
$('#dash-incremental-btn').addEventListener('click', () => runWithProgress('Running incremental backup…', () => vault.runIncrementalBackup()));
$('#dash-open-folder-btn').addEventListener('click', () => vault.openBackupFolder());

$('#refresh-tables-btn').addEventListener('click', async () => {
  $('#table-counts').textContent = 'Loading…';
  try {
    const counts = await vault.getTableCounts();
    $('#table-counts').innerHTML = counts
      .map((row) => `<div class="count-row"><span>${escapeHtml(row.table)}</span><b>${row.count}</b></div>`)
      .join('');
  } catch (error) {
    $('#table-counts').textContent = `Could not load: ${error.message}`;
  }
});

// ── Backups screen ───────────────────────────────────────────────
async function loadBackups() {
  const backups = await vault.listBackups();
  const tbody = $('#backups-tbody');
  if (!backups.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">No backups yet. Click "Full Backup Now" to create the first one.</td></tr>';
    return;
  }
  tbody.innerHTML = backups.map((backup, index) => `
    <tr>
      <td><span class="row-title">${fmtDate(backup.createdAt)}</span><div class="row-sub">${escapeHtml(backup.name)}</div></td>
      <td><span class="badge ${backup.type === 'full' ? 'blue' : ''}">${backup.type}</span></td>
      <td>${fmtBytes(backup.sizeBytes)}</td>
      <td>${backup.storageIncluded ? '<span class="badge green">DB + files</span>' : '<span class="badge">DB only</span>'}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn btn-sm" data-open-backup="${index}">Open</button>
        <button class="btn btn-sm btn-danger" data-restore-backup="${index}">Restore…</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-open-backup]').forEach((btn) => {
    btn.addEventListener('click', () => vault.openBackupFolder(backups[Number(btn.dataset.openBackup)].dir));
  });
  tbody.querySelectorAll('[data-restore-backup]').forEach((btn) => {
    btn.addEventListener('click', () => confirmRestoreBackup(backups[Number(btn.dataset.restoreBackup)]));
  });
}

function confirmRestoreBackup(backup) {
  const isFull = backup.type === 'full';
  openModal(`
    <h2>⚠️ Restore ${backup.type} backup</h2>
    <div class="banner banner-danger">
      ${isFull
        ? '<b>This REPLACES the entire live database</b> with the backup from ' + fmtDate(backup.createdAt) + '. Everything entered after that date will be LOST.'
        : 'This re-applies changed rows from the incremental backup of ' + fmtDate(backup.createdAt) + ' on top of the current database.'}
    </div>
    <dl class="kv">
      <dt>Backup</dt><dd>${escapeHtml(backup.name)}</dd>
      <dt>Type</dt><dd>${backup.type}</dd>
      <dt>Size</dt><dd>${fmtBytes(backup.sizeBytes)}</dd>
      <dt>Files included</dt><dd>${backup.storageIncluded ? 'Yes (database + storage files)' : 'Database only'}</dd>
    </dl>
    <p style="font-size:13px;">Type <b>RESTORE</b> to confirm:</p>
    <input class="confirm-input" id="restore-confirm-input" autocomplete="off" />
    <div class="actions-row right">
      <button class="btn" id="restore-cancel-btn">Cancel</button>
      <button class="btn btn-danger" id="restore-go-btn" disabled>Restore now</button>
    </div>
  `);

  const input = $('#restore-confirm-input');
  const goBtn = $('#restore-go-btn');
  input.addEventListener('input', () => { goBtn.disabled = input.value.trim() !== 'RESTORE'; });
  $('#restore-cancel-btn').addEventListener('click', closeModal);
  goBtn.addEventListener('click', () => {
    closeModal();
    runWithProgress(`Restoring ${backup.type} backup…`, () => vault.restoreBackup({ backupDir: backup.dir }));
  });
}

$('#run-full-btn').addEventListener('click', () => runWithProgress('Running full backup…', async () => { await vault.runFullBackup(); loadBackups(); }));
$('#run-incremental-btn').addEventListener('click', () => runWithProgress('Running incremental backup…', async () => { await vault.runIncrementalBackup(); loadBackups(); }));
$('#open-backups-btn').addEventListener('click', () => vault.openBackupFolder());

// ── Archive screen ───────────────────────────────────────────────
async function loadArchiveScreen() {
  loadProjects();
  loadArchives();
}

async function loadProjects() {
  const tbody = $('#projects-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
  try {
    const projects = await vault.listProjects();
    if (!projects.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No projects in the live database.</td></tr>';
      return;
    }
    tbody.innerHTML = projects.map((project, index) => `
      <tr>
        <td>${escapeHtml(project.project_number)}</td>
        <td class="row-title">${escapeHtml(project.project_name)}</td>
        <td>${escapeHtml(project.customer || '—')}</td>
        <td><span class="badge ${project.status === 'completed' ? 'green' : 'blue'}">${escapeHtml(project.status)}</span></td>
        <td>${project.po_count}</td>
        <td style="text-align:right;"><button class="btn btn-sm" data-archive-project="${index}">Archive…</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-archive-project]').forEach((btn) => {
      btn.addEventListener('click', () => startArchiveWizard(projects[Number(btn.dataset.archiveProject)]));
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Could not load projects: ${escapeHtml(error.message)}</td></tr>`;
  }
}

async function startArchiveWizard(project) {
  openModal(`
    <h2>Archive ${escapeHtml(project.project_number)} — ${escapeHtml(project.project_name)}</h2>
    <p class="muted">Analysing what will be archived…</p>
    <div class="spinner"></div>
  `);

  let preview;
  try {
    preview = await vault.previewArchive(project.id);
  } catch (error) {
    openModal(`
      <h2>Cannot archive</h2>
      <div class="banner banner-danger">${escapeHtml(error.message)}</div>
      <div class="actions-row right"><button class="btn" onclick="document.querySelector('#modal-overlay').classList.add('hidden')">Close</button></div>
    `);
    return;
  }

  const overview = await vault.getOverview();
  const lastAge = overview.lastFullBackup ? daysAgo(overview.lastFullBackup.createdAt) : null;
  const backupFresh = lastAge !== null && lastAge < 1;

  const countRows = Object.entries(preview.counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `<div class="count-row"><span>${escapeHtml(table)}</span><b>${count}</b></div>`)
    .join('');

  const sharedHtml = preview.sharedPOs.length
    ? `<div class="banner banner-warn">These POs are shared with other projects and will <b>stay in the live database</b>: ${preview.sharedPOs.map((po) => escapeHtml(po.po_number)).join(', ')}</div>`
    : '';

  const blockersHtml = preview.blockers.length
    ? `<div class="banner banner-danger"><b>Cannot archive:</b><br>${preview.blockers.map(escapeHtml).join('<br>')}</div>`
    : '';

  const notesHtml = preview.notes.length
    ? `<ul class="plain muted">${preview.notes.map((note) => `<li>• ${escapeHtml(note)}</li>`).join('')}</ul>`
    : '';

  openModal(`
    <h2>Archive ${escapeHtml(project.project_number)} — ${escapeHtml(project.project_name)}</h2>
    ${blockersHtml}
    <p style="font-size:13px; margin-bottom:8px;">This will export the following to a single <b>.bepvault</b> file and then <b>remove it from the live database</b>:</p>
    <div class="table-counts" style="margin-bottom:8px;">${countRows}</div>
    <p class="muted">${preview.storageFileCount} attached file(s) (PDFs, images) will be included in the archive.</p>
    ${sharedHtml}
    ${notesHtml}
    ${backupFresh
      ? '<div class="banner banner-ok">A full backup from the last 24 hours exists. Safe to proceed.</div>'
      : `<div class="banner banner-warn">No recent full backup (last one: ${lastAge === null ? 'never' : `${lastAge} day(s) ago`}). <button class="btn btn-sm btn-primary" id="wizard-backup-btn">Run full backup first</button></div>`}
    <label class="checkbox" style="display:flex; gap:8px; align-items:center; font-size:13px; margin-top:10px;">
      <input type="checkbox" id="wizard-delete-cloud" /> Also delete the attached files from cloud storage (they stay inside the archive file)
    </label>
    <p style="font-size:13px; margin-top:12px;">Type the project number <b>${escapeHtml(project.project_number)}</b> to confirm:</p>
    <input class="confirm-input" id="wizard-confirm-input" autocomplete="off" />
    <div class="actions-row right">
      <button class="btn" id="wizard-cancel-btn">Cancel</button>
      <button class="btn btn-danger" id="wizard-go-btn" disabled>Archive &amp; remove from live DB</button>
    </div>
  `);

  const input = $('#wizard-confirm-input');
  const goBtn = $('#wizard-go-btn');
  const canProceed = () => !preview.blockers.length && input.value.trim() === String(project.project_number);
  input.addEventListener('input', () => { goBtn.disabled = !canProceed(); });
  $('#wizard-cancel-btn').addEventListener('click', closeModal);
  const backupBtn = $('#wizard-backup-btn');
  if (backupBtn) {
    backupBtn.addEventListener('click', () => {
      closeModal();
      runWithProgress('Running full backup…', () => vault.runFullBackup());
    });
  }
  goBtn.addEventListener('click', () => {
    const deleteCloudFiles = $('#wizard-delete-cloud').checked;
    closeModal();
    runWithProgress(`Archiving project ${project.project_number}…`, async () => {
      await vault.runArchive({ projectId: project.id, deleteCloudFiles });
      loadArchiveScreen();
    });
  });
}

async function loadArchives() {
  const tbody = $('#archives-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
  const archives = await vault.listArchives();
  if (!archives.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">No archived projects yet.</td></tr>';
    return;
  }
  tbody.innerHTML = archives.map((entry, index) => {
    if (entry.error) {
      return `<tr><td colspan="5" class="muted">⚠️ ${escapeHtml(entry.name)} — ${escapeHtml(entry.error)}</td></tr>`;
    }
    const totalRows = Object.values(entry.tables).reduce((sum, count) => sum + count, 0);
    return `
      <tr>
        <td><span class="row-title">${escapeHtml(entry.project.project_number)} — ${escapeHtml(entry.project.project_name)}</span>
            <div class="row-sub">${escapeHtml(entry.name)}</div></td>
        <td>${fmtDate(entry.createdAt)}</td>
        <td>${fmtBytes(entry.sizeBytes)}</td>
        <td><div class="row-sub">${totalRows} rows · ${entry.tables.purchase_orders || 0} POs · ${entry.storageFileCount} files</div></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-sm" data-archive-details="${index}">Details</button>
          <button class="btn btn-sm" data-archive-copy="${index}">Copy to…</button>
          <button class="btn btn-sm btn-primary" data-archive-restore="${index}">Restore…</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-archive-details]').forEach((btn) => {
    btn.addEventListener('click', () => showArchiveDetails(archives[Number(btn.dataset.archiveDetails)]));
  });
  tbody.querySelectorAll('[data-archive-copy]').forEach((btn) => {
    btn.addEventListener('click', () => vault.copyArchive(archives[Number(btn.dataset.archiveCopy)].file));
  });
  tbody.querySelectorAll('[data-archive-restore]').forEach((btn) => {
    btn.addEventListener('click', () => confirmRestoreArchive(archives[Number(btn.dataset.archiveRestore)]));
  });
}

function showArchiveDetails(entry) {
  const rows = Object.entries(entry.tables)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `<div class="count-row"><span>${escapeHtml(table)}</span><b>${count}</b></div>`)
    .join('');
  const shared = (entry.sharedPOsExcluded || []).length
    ? `<div class="banner banner-warn">POs left in live DB (shared): ${entry.sharedPOsExcluded.map((po) => escapeHtml(po.po_number)).join(', ')}</div>`
    : '';
  openModal(`
    <h2>${escapeHtml(entry.project.project_number)} — ${escapeHtml(entry.project.project_name)}</h2>
    <dl class="kv">
      <dt>Archived on</dt><dd>${fmtDate(entry.createdAt)}</dd>
      <dt>File</dt><dd style="word-break:break-all;">${escapeHtml(entry.file)}</dd>
      <dt>Size</dt><dd>${fmtBytes(entry.sizeBytes)}</dd>
      <dt>Attached files</dt><dd>${entry.storageFileCount}</dd>
    </dl>
    <div class="table-counts">${rows}</div>
    ${shared}
    <div class="actions-row right"><button class="btn" id="details-close-btn">Close</button></div>
  `);
  $('#details-close-btn').addEventListener('click', closeModal);
}

function confirmRestoreArchive(entry) {
  openModal(`
    <h2>Restore archived project</h2>
    <div class="banner banner-info">
      This puts <b>${escapeHtml(entry.project.project_number)} — ${escapeHtml(entry.project.project_name)}</b> back into the live database exactly as it was archived, including its POs and attached files.
    </div>
    <p style="font-size:13px;">Type <b>RESTORE</b> to confirm:</p>
    <input class="confirm-input" id="arch-restore-input" autocomplete="off" />
    <div class="actions-row right">
      <button class="btn" id="arch-restore-cancel">Cancel</button>
      <button class="btn btn-primary" id="arch-restore-go" disabled>Restore project</button>
    </div>
  `);
  const input = $('#arch-restore-input');
  const goBtn = $('#arch-restore-go');
  input.addEventListener('input', () => { goBtn.disabled = input.value.trim() !== 'RESTORE'; });
  $('#arch-restore-cancel').addEventListener('click', closeModal);
  goBtn.addEventListener('click', () => {
    closeModal();
    runWithProgress(`Restoring ${entry.project.project_number}…`, async () => {
      await vault.restoreArchive(entry.file);
      loadArchiveScreen();
    });
  });
}

$('#refresh-projects-btn').addEventListener('click', loadProjects);
$('#open-archives-btn').addEventListener('click', () => vault.openArchiveFolder());
$('#import-archive-btn').addEventListener('click', async () => {
  const result = await vault.importArchive();
  if (result.imported) loadArchives();
});

// ── Settings ─────────────────────────────────────────────────────
async function loadSettings() {
  const { settings, hasLegacyEnv } = await vault.getSettings();
  $('#import-env-banner').classList.toggle('hidden', !hasLegacyEnv);

  $('#set-db-host').value = settings.db.host || '';
  $('#set-db-port').value = settings.db.port || 5432;
  $('#set-db-name').value = settings.db.name || 'postgres';
  $('#set-db-user').value = settings.db.user || 'postgres';
  $('#set-db-password').value = settings.db.password || '';
  $('#set-s3-key').value = settings.storage.accessKeyId || '';
  $('#set-s3-secret').value = settings.storage.secretAccessKey || '';
  $('#set-s3-region').value = settings.storage.region || '';
  $('#set-s3-endpoint').value = settings.storage.endpoint || '';
  $('#set-backup-root').value = settings.backupRoot || '';
  $('#set-archive-root').value = settings.archiveRoot || '';
  $('#set-pg-bin').value = settings.pgBinDir || '';
  $('#set-sched-enabled').checked = Boolean(settings.schedule.enabled);
  $('#set-sched-day').value = String(settings.schedule.dayOfWeek);
  $('#set-sched-time').value = `${String(settings.schedule.hour).padStart(2, '0')}:${String(settings.schedule.minute).padStart(2, '0')}`;
  $('#set-retention-full').value = settings.retention.full;
  $('#set-retention-incr').value = settings.retention.incremental;
  $('#set-autostart').checked = Boolean(settings.startWithWindows);
}

async function gatherSettings() {
  const { settings } = await vault.getSettings();
  const [hour, minute] = ($('#set-sched-time').value || '10:00').split(':').map(Number);
  return {
    ...settings,
    db: {
      host: $('#set-db-host').value.trim(),
      port: Number($('#set-db-port').value) || 5432,
      name: $('#set-db-name').value.trim() || 'postgres',
      user: $('#set-db-user').value.trim() || 'postgres',
      password: $('#set-db-password').value,
    },
    storage: {
      accessKeyId: $('#set-s3-key').value.trim(),
      secretAccessKey: $('#set-s3-secret').value,
      region: $('#set-s3-region').value.trim() || 'ap-northeast-2',
      endpoint: $('#set-s3-endpoint').value.trim(),
    },
    backupRoot: $('#set-backup-root').value.trim(),
    archiveRoot: $('#set-archive-root').value.trim(),
    pgBinDir: $('#set-pg-bin').value.trim(),
    retention: {
      full: Number($('#set-retention-full').value) || 5,
      incremental: Number($('#set-retention-incr').value) || 20,
    },
    schedule: {
      ...settings.schedule,
      enabled: $('#set-sched-enabled').checked,
      dayOfWeek: Number($('#set-sched-day').value),
      hour: hour || 10,
      minute: minute || 0,
    },
    startWithWindows: $('#set-autostart').checked,
  };
}

$('#save-settings-btn').addEventListener('click', async () => {
  const settings = await gatherSettings();
  await vault.saveSettings(settings);
  $('#save-result').textContent = '✅ Saved';
  setTimeout(() => { $('#save-result').textContent = ''; }, 3000);
});

$('#test-connection-btn').addEventListener('click', async () => {
  $('#test-result').textContent = 'Testing…';
  const settings = await gatherSettings();
  await vault.saveSettings(settings);
  const result = await vault.testConnection();
  const dbPart = result.db.ok ? `✅ Database OK (${result.db.database})` : `❌ ${result.db.error}`;
  const toolsPart = result.tools.ok ? '✅ PostgreSQL tools found' : '⚠️ pg_dump/psql not found — set the PostgreSQL bin folder below';
  $('#test-result').textContent = `${dbPart} · ${toolsPart}`;
});

$('#import-env-btn').addEventListener('click', async () => {
  await vault.importEnv();
  await loadSettings();
  $('#save-result').textContent = '✅ Imported from .env';
});

$$('[data-pick]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const folder = await vault.pickFolder('Choose folder');
    if (folder) $(`#${btn.dataset.pick}`).value = folder;
  });
});

// ── Log viewer ───────────────────────────────────────────────────
$('#show-log-btn').addEventListener('click', async () => {
  $('#log-content').textContent = (await vault.readLog()) || 'No activity yet.';
  $('#log-overlay').classList.remove('hidden');
  const el = $('#log-content');
  el.scrollTop = el.scrollHeight;
});
$('#log-close-btn').addEventListener('click', () => $('#log-overlay').classList.add('hidden'));

// ── Boot ─────────────────────────────────────────────────────────
loadDashboard();
