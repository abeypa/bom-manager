const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { createClient, fetchForeignKeys } = require('./postgres');
const { createStorageClient, deleteObject, downloadObjectToFile, uploadFile } = require('./storage');
const { hasStorageCredentials } = require('./config');
const { ensureDir, timestampForPath } = require('./fs-utils');

const APP_MARKER = 'bep-vault-archive';
const ARCHIVE_FORMAT_VERSION = 1;
const DEFAULT_BUCKET = 'drawings';

// Deletion happens in this order (children first). Restore inserts in reverse.
// Tables absent from the database are skipped automatically.
const DELETE_ORDER = [
  'issue_comments',
  'issues',
  'work_item_updates',
  'pending_part_comments',
  'pending_parts',
  'supplier_assignments',
  'po_ingestion_lines',
  'po_ingestion_documents',
  'po_ingestion_batches',
  'stock_movements',
  'po_receipts',
  'po_payments',
  'purchase_order_attachments',
  'purchase_order_items',
  'purchase_orders',
  'project_documents',
  'project_parts',
  'project_subsections',
  'project_sections',
  'projects',
];

function q(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rowCount > 0;
}

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function primaryKeyColumn(client, table) {
  const result = await client.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY kcu.ordinal_position
    `,
    [table]
  );
  return result.rows.length === 1 ? result.rows[0].column_name : (result.rows[0] ? result.rows[0].column_name : null);
}

async function selectByIds(client, table, column, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    const result = await client.query(
      `SELECT * FROM public.${q(table)} WHERE ${q(column)} = ANY($1)`,
      [chunk]
    );
    rows.push(...result.rows);
  }
  return rows;
}

/**
 * Collect every row belonging to the project: the project itself, its BOM
 * structure, exclusively-owned POs and all dependent tracking rows.
 */
async function collectArchiveSet(client, projectId) {
  const warnings = [];

  const projectResult = await client.query('SELECT * FROM public.projects WHERE id = $1', [projectId]);
  if (!projectResult.rowCount) throw new Error(`Project #${projectId} not found.`);
  const project = projectResult.rows[0];

  const sections = (await client.query('SELECT * FROM public.project_sections WHERE project_id = $1', [projectId])).rows;
  const subsections = (await client.query('SELECT * FROM public.project_subsections WHERE project_id = $1', [projectId])).rows;

  // project_parts.project_section_id points at subsections in the live schema,
  // but resolve the actual FK target at runtime to be safe.
  const fks = await fetchForeignKeys(client);
  const partParentFk = fks.find(
    (fk) => fk.referencing_table === 'project_parts' && fk.referencing_column === 'project_section_id'
  );
  const partParentIds = partParentFk && partParentFk.referenced_table === 'project_sections'
    ? sections.map((row) => row.id)
    : subsections.map((row) => row.id);
  const projectParts = await selectByIds(client, 'project_parts', 'project_section_id', partParentIds);
  const partIds = projectParts.map((row) => row.id);

  // ── PO ownership: a PO is archivable only if every project it touches is this one ──
  const poCandidates = new Map();
  for (const row of (await client.query('SELECT * FROM public.purchase_orders WHERE project_id = $1', [projectId])).rows) {
    poCandidates.set(row.id, row);
  }
  const itemLinkedPoIds = partIds.length
    ? (await client.query(
        'SELECT DISTINCT purchase_order_id FROM public.purchase_order_items WHERE project_part_id = ANY($1)',
        [partIds]
      )).rows.map((row) => row.purchase_order_id)
    : [];
  for (const row of await selectByIds(client, 'purchase_orders', 'id', itemLinkedPoIds)) {
    if (!poCandidates.has(row.id)) poCandidates.set(row.id, row);
  }

  const candidateIds = Array.from(poCandidates.keys());
  const poProjectLinks = new Map(candidateIds.map((id) => [id, new Set()]));
  for (const [id, po] of poCandidates) {
    if (po.project_id) poProjectLinks.get(id).add(Number(po.project_id));
  }
  if (candidateIds.length) {
    const linkResult = await client.query(
      `
      SELECT poi.purchase_order_id, ps.project_id
      FROM public.purchase_order_items poi
      JOIN public.project_parts pp ON pp.id = poi.project_part_id
      JOIN public.project_subsections ps ON ps.id = pp.project_section_id
      WHERE poi.purchase_order_id = ANY($1) AND poi.project_part_id IS NOT NULL
      `,
      [candidateIds]
    );
    for (const row of linkResult.rows) {
      if (row.project_id) poProjectLinks.get(row.purchase_order_id).add(Number(row.project_id));
    }
  }

  const purchaseOrders = [];
  const sharedPOs = [];
  for (const [id, po] of poCandidates) {
    const touched = poProjectLinks.get(id);
    const others = Array.from(touched).filter((pid) => pid !== Number(projectId));
    if (others.length === 0) {
      purchaseOrders.push(po);
    } else {
      sharedPOs.push({ id: po.id, po_number: po.po_number, other_project_ids: others });
    }
  }
  const poIds = purchaseOrders.map((row) => row.id);

  // ── Dependent rows ──
  const tables = {
    projects: [project],
    project_sections: sections,
    project_subsections: subsections,
    project_parts: projectParts,
    purchase_orders: purchaseOrders,
    purchase_order_items: await selectByIds(client, 'purchase_order_items', 'purchase_order_id', poIds),
  };

  const poItemIds = tables.purchase_order_items.map((row) => row.id);

  for (const table of ['purchase_order_attachments', 'po_payments']) {
    if (await tableExists(client, table)) {
      tables[table] = await selectByIds(client, table, 'purchase_order_id', poIds);
    }
  }

  // po_receipts hang off PO line items, not the PO header.
  if (await tableExists(client, 'po_receipts')) {
    const columns = await tableColumns(client, 'po_receipts');
    if (columns.includes('po_line_item_id')) {
      tables.po_receipts = await selectByIds(client, 'po_receipts', 'po_line_item_id', poItemIds);
    } else if (columns.includes('purchase_order_id')) {
      tables.po_receipts = await selectByIds(client, 'po_receipts', 'purchase_order_id', poIds);
    }
  }

  // stock_movements: only rows FK-bound to this project need archiving;
  // text-only history columns (po_number, project_name) carry no constraint.
  if (await tableExists(client, 'stock_movements')) {
    const smFks = fks.filter((fk) => fk.referencing_table === 'stock_movements');
    const projectFk = smFks.find((fk) => fk.referenced_table === 'projects');
    const poFk = smFks.find((fk) => fk.referenced_table === 'purchase_orders');
    if (projectFk || poFk) {
      const seen = new Set();
      const rows = [];
      const collect = (list) => {
        for (const row of list) {
          if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
        }
      };
      if (projectFk) {
        collect((await client.query(`SELECT * FROM public.stock_movements WHERE ${q(projectFk.referencing_column)} = $1`, [projectId])).rows);
      }
      if (poFk) {
        collect(await selectByIds(client, 'stock_movements', poFk.referencing_column, poIds));
      }
      tables.stock_movements = rows;
    } else {
      warnings.push('Stock movement history stays in the live database (it has no hard link to this project).');
    }
  }

  if (await tableExists(client, 'pending_parts')) {
    const seen = new Set();
    const pendingParts = [];
    const collect = (rows) => {
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          pendingParts.push(row);
        }
      }
    };
    collect((await client.query('SELECT * FROM public.pending_parts WHERE project_id = $1', [projectId])).rows);
    collect(await selectByIds(client, 'pending_parts', 'project_part_id', partIds));
    tables.pending_parts = pendingParts;
    const pendingIds = pendingParts.map((row) => row.id);

    if (await tableExists(client, 'pending_part_comments')) {
      tables.pending_part_comments = await selectByIds(client, 'pending_part_comments', 'pending_part_id', pendingIds);
    }
    if (await tableExists(client, 'work_item_updates')) {
      tables.work_item_updates = await selectByIds(client, 'work_item_updates', 'work_item_id', pendingIds);
    }
  }

  if (await tableExists(client, 'supplier_assignments')) {
    tables.supplier_assignments = (await client.query('SELECT * FROM public.supplier_assignments WHERE project_id = $1', [projectId])).rows;
  }

  if (await tableExists(client, 'issues')) {
    const seen = new Set();
    const issues = [];
    const collect = (rows) => {
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          issues.push(row);
        }
      }
    };
    collect((await client.query('SELECT * FROM public.issues WHERE project_id = $1', [projectId])).rows);
    collect(await selectByIds(client, 'issues', 'purchase_order_id', poIds));
    collect(await selectByIds(client, 'issues', 'project_part_id', partIds));
    tables.issues = issues;
    if (await tableExists(client, 'issue_comments')) {
      tables.issue_comments = await selectByIds(client, 'issue_comments', 'issue_id', issues.map((row) => row.id));
    }
  }

  if (await tableExists(client, 'project_documents')) {
    tables.project_documents = (await client.query('SELECT * FROM public.project_documents WHERE project_id = $1', [projectId])).rows;
  }

  if (await tableExists(client, 'po_ingestion_batches')) {
    const batches = (await client.query('SELECT * FROM public.po_ingestion_batches WHERE project_id = $1', [projectId])).rows;
    tables.po_ingestion_batches = batches;
    const batchIds = batches.map((row) => row.id);
    if (await tableExists(client, 'po_ingestion_documents')) {
      tables.po_ingestion_documents = await selectByIds(client, 'po_ingestion_documents', 'batch_id', batchIds);
    }
    if (await tableExists(client, 'po_ingestion_lines')) {
      tables.po_ingestion_lines = await selectByIds(client, 'po_ingestion_lines', 'batch_id', batchIds);
    }
  }

  return { project, tables, sharedPOs, warnings, fks };
}

/**
 * Safety check: for every table we will delete from, look at what references it.
 * - Referencing table in our set → verify no rows OUTSIDE the collected set point at our rows.
 * - ON DELETE CASCADE from an unknown table → abort (would silently destroy unexported rows).
 * - ON DELETE SET NULL from an unknown table → allowed, reported.
 */
async function checkReferences(client, tables, fks) {
  const blockers = [];
  const notes = [];
  const collectedIds = {};
  const pkColumns = {};

  for (const [table, rows] of Object.entries(tables)) {
    const pk = await primaryKeyColumn(client, table);
    pkColumns[table] = pk;
    collectedIds[table] = new Set(rows.map((row) => String(row[pk])));
  }

  for (const [table, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    const pk = pkColumns[table];
    const ids = rows.map((row) => row[pk]);
    const referencing = fks.filter((fk) => fk.referenced_table === table && fk.referenced_column === pk);

    for (const fk of referencing) {
      const refPk = await primaryKeyColumn(client, fk.referencing_table);
      if (collectedIds[fk.referencing_table]) {
        // Covered table — make sure we didn't miss rows that reference what we delete.
        const result = await client.query(
          `SELECT ${q(refPk)} AS id FROM public.${q(fk.referencing_table)}
           WHERE ${q(fk.referencing_column)} = ANY($1) LIMIT 5000`,
          [ids]
        );
        const missed = result.rows.filter((row) => !collectedIds[fk.referencing_table].has(String(row.id)));
        if (missed.length) {
          if (fk.delete_rule === 'SET NULL') {
            notes.push(`${missed.length} row(s) in ${fk.referencing_table} reference archived rows and will have their link cleared (${fk.referencing_column}).`);
          } else {
            blockers.push(`${missed.length} row(s) in ${fk.referencing_table} reference archived ${table} rows but are not part of this archive (rule: ${fk.delete_rule}).`);
          }
        }
      } else {
        // Unknown table referencing something we delete.
        const result = await client.query(
          `SELECT COUNT(*)::int AS count FROM public.${q(fk.referencing_table)} WHERE ${q(fk.referencing_column)} = ANY($1)`,
          [ids]
        );
        const count = result.rows[0].count;
        if (!count) continue;
        if (fk.delete_rule === 'SET NULL') {
          notes.push(`${count} row(s) in ${fk.referencing_table} will have their ${fk.referencing_column} link cleared.`);
        } else if (fk.delete_rule === 'CASCADE') {
          blockers.push(`Unknown table "${fk.referencing_table}" has ${count} row(s) that would be silently deleted (CASCADE). Update BEP Vault before archiving.`);
        } else {
          blockers.push(`Table "${fk.referencing_table}" has ${count} row(s) referencing archived data and would block deletion (rule: ${fk.delete_rule}).`);
        }
      }
    }
  }

  return { blockers, notes };
}

/** Find storage file references (bucket keys) inside the exported rows. */
function collectStorageKeys(tables) {
  const keys = new Set();
  const pathPattern = /^(?:purchase_orders|projects|project_documents|documents|pending_parts|work_item|work_items|issues|attachments|sections)\/.+\.[A-Za-z0-9]{2,5}$/;
  const urlPattern = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?"']+)/;

  const visit = (value) => {
    if (typeof value === 'string') {
      const urlMatch = value.match(urlPattern);
      if (urlMatch) {
        keys.add(`${urlMatch[1]}/${decodeURIComponent(urlMatch[2])}`);
      } else if (pathPattern.test(value)) {
        keys.add(`${DEFAULT_BUCKET}/${value}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  for (const rows of Object.values(tables)) {
    for (const row of rows) visit(row);
  }

  return Array.from(keys).map((entry) => {
    const [bucket, ...rest] = entry.split('/');
    return { bucket, key: rest.join('/') };
  });
}

async function previewArchive(config, projectId) {
  const client = await createClient(config.database.connectConfig);
  try {
    const { project, tables, sharedPOs, warnings, fks } = await collectArchiveSet(client, projectId);
    const { blockers, notes } = await checkReferences(client, tables, fks);
    const storageFiles = collectStorageKeys(tables);
    return {
      project: {
        id: project.id,
        project_number: project.project_number,
        project_name: project.project_name,
        customer: project.customer,
        status: project.status,
      },
      counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
      sharedPOs,
      storageFileCount: storageFiles.length,
      blockers,
      notes: [...notes, ...warnings],
    };
  } finally {
    await client.end();
  }
}

async function archiveProject(config, projectId, { deleteCloudFiles = false } = {}, onProgress = () => {}) {
  const client = await createClient(config.database.connectConfig);
  try {
    onProgress('Collecting project data...');
    const { project, tables, sharedPOs, warnings, fks } = await collectArchiveSet(client, projectId);
    const { blockers, notes } = await checkReferences(client, tables, fks);
    if (blockers.length) {
      throw new Error(`Archive blocked:\n${blockers.join('\n')}`);
    }

    const totalRows = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
    onProgress(`Collected ${totalRows} rows across ${Object.keys(tables).length} tables.`);

    // ── Download storage files ──
    const storageFiles = collectStorageKeys(tables);
    const downloadedFiles = [];
    const missingFiles = [];
    const tempDir = path.join(config.archiveRoot, '.tmp', timestampForPath());
    ensureDir(tempDir);

    if (storageFiles.length && hasStorageCredentials(config)) {
      const storageClient = createStorageClient(config.storage);
      let done = 0;
      for (const file of storageFiles) {
        done += 1;
        onProgress(`Downloading file ${done}/${storageFiles.length}: ${file.key}`);
        const localPath = path.join(tempDir, 'storage', file.bucket, file.key);
        try {
          await downloadObjectToFile(storageClient, file.bucket, file.key, localPath);
          downloadedFiles.push({ ...file, localPath });
        } catch (error) {
          missingFiles.push({ ...file, error: error.name || error.message });
        }
      }
    } else if (storageFiles.length) {
      onProgress('Storage credentials not configured — archive will not include file attachments.');
    }

    // ── Build the .bepvault zip ──
    onProgress('Writing archive file...');
    const manifest = {
      app: APP_MARKER,
      formatVersion: ARCHIVE_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      project: {
        id: project.id,
        project_number: project.project_number,
        project_name: project.project_name,
        customer: project.customer,
        status: project.status,
      },
      tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
      sharedPOsExcluded: sharedPOs,
      storageFiles: downloadedFiles.map(({ bucket, key }) => ({ bucket, key })),
      storageFilesMissing: missingFiles,
      notes: [...notes, ...warnings],
    };

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    for (const [table, rows] of Object.entries(tables)) {
      zip.addFile(`tables/${table}.json`, Buffer.from(JSON.stringify(rows, null, 1), 'utf8'));
    }
    for (const file of downloadedFiles) {
      const keyDir = path.posix.dirname(file.key);
      const zipFolder = keyDir === '.' ? `storage/${file.bucket}` : `storage/${file.bucket}/${keyDir}`;
      zip.addLocalFile(file.localPath, zipFolder, path.posix.basename(file.key));
    }

    const safeName = String(project.project_name || 'project').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
    ensureDir(config.archiveRoot);
    const archivePath = path.join(config.archiveRoot, `${project.project_number}_${safeName}_${timestampForPath()}.bepvault`);
    zip.writeZip(archivePath);

    // ── Verify the archive is readable and counts match before deleting anything ──
    onProgress('Verifying archive...');
    const verifyZip = new AdmZip(archivePath);
    const verifyManifest = JSON.parse(verifyZip.readAsText('manifest.json'));
    for (const [table, rows] of Object.entries(tables)) {
      const stored = JSON.parse(verifyZip.readAsText(`tables/${table}.json`));
      if (!Array.isArray(stored) || stored.length !== rows.length || verifyManifest.tables[table] !== rows.length) {
        throw new Error(`Archive verification failed for table ${table}. Nothing was deleted.`);
      }
    }

    // ── Delete from live DB in one transaction ──
    onProgress('Removing project from live database...');
    await client.query('BEGIN');
    try {
      for (const table of DELETE_ORDER) {
        const rows = tables[table];
        if (!rows || !rows.length) continue;
        const pk = await primaryKeyColumn(client, table);
        const ids = rows.map((row) => row[pk]);
        let deleted = 0;
        for (let start = 0; start < ids.length; start += 500) {
          const chunk = ids.slice(start, start + 500);
          const result = await client.query(
            `DELETE FROM public.${q(table)} WHERE ${q(pk)} = ANY($1)`,
            [chunk]
          );
          deleted += result.rowCount;
        }
        if (deleted !== rows.length) {
          throw new Error(`Delete mismatch in ${table}: expected ${rows.length}, deleted ${deleted}. Rolling back.`);
        }
        onProgress(`Removed ${deleted} row(s) from ${table}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // ── Optional cloud file cleanup (after successful commit) ──
    if (deleteCloudFiles && downloadedFiles.length && hasStorageCredentials(config)) {
      const storageClient = createStorageClient(config.storage);
      let done = 0;
      for (const file of downloadedFiles) {
        done += 1;
        onProgress(`Deleting cloud file ${done}/${downloadedFiles.length}: ${file.key}`);
        try {
          await deleteObject(storageClient, file.bucket, file.key);
        } catch (error) {
          onProgress(`Could not delete ${file.key}: ${error.message}`);
        }
      }
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    onProgress(`Project archived to ${archivePath}`);
    return { archivePath, manifest };
  } finally {
    await client.end();
  }
}

function readArchiveManifest(archivePath) {
  const zip = new AdmZip(archivePath);
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  if (manifest.app !== APP_MARKER) {
    throw new Error('Not a BEP Vault archive file.');
  }
  return manifest;
}

function listArchives(archiveRoot) {
  if (!fs.existsSync(archiveRoot)) return [];
  const results = [];
  for (const entry of fs.readdirSync(archiveRoot)) {
    if (!entry.endsWith('.bepvault')) continue;
    const filePath = path.join(archiveRoot, entry);
    try {
      const manifest = readArchiveManifest(filePath);
      results.push({
        file: filePath,
        name: entry,
        sizeBytes: fs.statSync(filePath).size,
        createdAt: manifest.createdAt,
        project: manifest.project,
        tables: manifest.tables,
        sharedPOsExcluded: manifest.sharedPOsExcluded || [],
        storageFileCount: (manifest.storageFiles || []).length,
      });
    } catch (error) {
      results.push({ file: filePath, name: entry, error: error.message });
    }
  }
  return results.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function restoreArchive(config, archivePath, onProgress = () => {}) {
  const zip = new AdmZip(archivePath);
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  if (manifest.app !== APP_MARKER) throw new Error('Not a BEP Vault archive file.');

  const tables = {};
  for (const table of Object.keys(manifest.tables)) {
    tables[table] = JSON.parse(zip.readAsText(`tables/${table}.json`));
  }

  const client = await createClient(config.database.connectConfig);
  try {
    // ── Conflict pre-check ──
    onProgress('Checking for conflicts...');
    const conflicts = [];
    for (const [table, rows] of Object.entries(tables)) {
      if (!rows.length) continue;
      if (!(await tableExists(client, table))) {
        conflicts.push(`Table ${table} no longer exists in the database.`);
        continue;
      }
      const pk = await primaryKeyColumn(client, table);
      const ids = rows.map((row) => row[pk]);
      const result = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.${q(table)} WHERE ${q(pk)} = ANY($1)`,
        [ids]
      );
      if (result.rows[0].count > 0) {
        conflicts.push(`${result.rows[0].count} row(s) already exist in ${table} with the same IDs.`);
      }
    }
    const projectNumber = manifest.project.project_number;
    const numberCheck = await client.query('SELECT id FROM public.projects WHERE project_number = $1', [projectNumber]);
    if (numberCheck.rowCount) {
      conflicts.push(`A project with number ${projectNumber} already exists (id ${numberCheck.rows[0].id}).`);
    }
    if (conflicts.length) {
      throw new Error(`Cannot restore:\n${conflicts.join('\n')}`);
    }

    // ── Insert in reverse delete order (parents first), one transaction ──
    onProgress('Restoring rows...');
    const insertOrder = [...DELETE_ORDER].reverse();
    await client.query('BEGIN');
    try {
      for (const table of insertOrder) {
        const rows = tables[table];
        if (!rows || !rows.length) continue;
        for (let start = 0; start < rows.length; start += 200) {
          const chunk = rows.slice(start, start + 200);
          await client.query(
            `INSERT INTO public.${q(table)} SELECT * FROM jsonb_populate_recordset(NULL::public.${q(table)}, $1::jsonb)`,
            [JSON.stringify(chunk)]
          );
        }
        onProgress(`Restored ${rows.length} row(s) into ${table}`);
      }

      // ── Bump identity sequences so future inserts don't collide ──
      for (const table of Object.keys(tables)) {
        if (!tables[table].length) continue;
        const pk = await primaryKeyColumn(client, table);
        const seqResult = await client.query(`SELECT pg_get_serial_sequence('public.${q(table)}', $1) AS seq`, [pk]);
        const seq = seqResult.rows[0] && seqResult.rows[0].seq;
        if (!seq) continue;
        await client.query(`
          SELECT setval('${seq.replace(/'/g, "''")}', GREATEST(
            COALESCE((SELECT MAX(${q(pk)}) FROM public.${q(table)}), 1),
            (SELECT last_value FROM ${seq})
          ))
        `);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // ── Re-upload storage files ──
    const storageEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('storage/') && !entry.isDirectory);
    if (storageEntries.length && hasStorageCredentials(config)) {
      const storageClient = createStorageClient(config.storage);
      const tempDir = path.join(config.archiveRoot, '.tmp', `restore_${timestampForPath()}`);
      let done = 0;
      for (const entry of storageEntries) {
        done += 1;
        const relative = entry.entryName.slice('storage/'.length);
        const [bucket, ...rest] = relative.split('/');
        const key = rest.join('/');
        onProgress(`Uploading file ${done}/${storageEntries.length}: ${key}`);
        const localPath = path.join(tempDir, relative);
        ensureDir(path.dirname(localPath));
        fs.writeFileSync(localPath, entry.getData());
        try {
          await uploadFile(storageClient, bucket, key, localPath);
        } catch (error) {
          onProgress(`Could not upload ${key}: ${error.message}`);
        }
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    } else if (storageEntries.length) {
      onProgress('Storage credentials not configured — file attachments were not re-uploaded.');
    }

    onProgress(`Project ${manifest.project.project_number} restored successfully.`);
    return { manifest };
  } finally {
    await client.end();
  }
}

async function listProjects(config) {
  const client = await createClient(config.database.connectConfig);
  try {
    const result = await client.query(`
      SELECT p.id, p.project_number, p.project_name, p.customer, p.status,
             (SELECT COUNT(*)::int FROM public.purchase_orders po WHERE po.project_id = p.id) AS po_count,
             (SELECT COUNT(*)::int FROM public.project_subsections ps WHERE ps.project_id = p.id) AS subsection_count
      FROM public.projects p
      ORDER BY p.project_number
    `);
    return result.rows;
  } finally {
    await client.end();
  }
}

module.exports = {
  archiveProject,
  listArchives,
  listProjects,
  previewArchive,
  readArchiveManifest,
  restoreArchive,
};
