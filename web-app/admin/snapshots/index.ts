// ============================================
// FUSION AI — Snapshots Page
// Wipe, reload, upload/download snapshot operations.
// ============================================

import { getDbAdapter } from '../../../api/api';
import { seedData } from '../../../api/seed';
import { $, showToast, iconTrash, iconDownload, iconUpload, iconDatabase, iconInfo, html, setHtml, SafeHtml } from '../../site/script';

const BANNER_ID = 'empty-banner';

async function updateEmptyBanner(root: HTMLElement): Promise<void> {
  const users = await getDbAdapter().users.getAll();
  const existing = document.getElementById(BANNER_ID);
  if (users.length === 0) {
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = BANNER_ID;
      banner.className = 'card';
      banner.style.cssText = 'padding:1rem 1.25rem;display:flex;align-items:center;gap:0.75rem;grid-column:1/-1;background:hsl(var(--primary)/0.06);border:1px solid hsl(var(--primary)/0.2)';
      setHtml(banner, html`<span style="color:hsl(var(--primary));flex-shrink:0">${iconInfo(20)}</span>
        <p class="text-sm" style="margin:0">Your database is empty. Load mock data or upload a snapshot to get started.</p>`);
      root.prepend(banner);
    }
  } else {
    existing?.remove();
  }
}

export async function init(): Promise<void> {
  const root = $('#snapshots-content');
  if (!root) return;

  setHtml(root, html`
    <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(var(--success)/0.1);display:flex;align-items:center;justify-content:center;color:hsl(var(--success))">${iconDownload(20)}</div>
        <div>
          <h3 class="text-sm font-semibold">Download Snapshot</h3>
          <p class="text-xs text-muted">Download snapshot</p>
        </div>
      </div>
      <button class="btn btn-outline" id="download-btn" style="border-color:hsl(var(--success));color:hsl(var(--success))">Download Snapshot</button>
    </div>

    <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(var(--success)/0.1);display:flex;align-items:center;justify-content:center;color:hsl(var(--success))">${iconUpload(20)}</div>
        <div>
          <h3 class="text-sm font-semibold">Upload Snapshot</h3>
          <p class="text-xs text-muted">Load data from snapshot file</p>
        </div>
      </div>
      <label class="btn btn-outline" style="cursor:pointer;text-align:center;border-color:hsl(var(--success));color:hsl(var(--success))">
        Upload Snapshot
        <input type="file" accept=".json" id="upload-input" style="display:none" />
      </label>
    </div>

    <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(var(--warning)/0.1);display:flex;align-items:center;justify-content:center;color:hsl(var(--warning))">${iconDatabase(20)}</div>
        <div>
          <h3 class="text-sm font-semibold">Wipe and Load Mock Data</h3>
          <p class="text-xs text-muted">Wipe and load mock data</p>
        </div>
      </div>
      <button class="btn btn-outline" id="reload-btn" style="border-color:hsl(var(--warning));color:hsl(var(--warning))">Wipe and Load Mock Data</button>
    </div>

    <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:2.5rem;height:2.5rem;border-radius:0.5rem;background:hsl(var(--error)/0.1);display:flex;align-items:center;justify-content:center;color:hsl(var(--error))">${iconTrash(20)}</div>
        <div>
          <h3 class="text-sm font-semibold">Create Pristine Environment</h3>
          <p class="text-xs text-muted">Create a pristine environment</p>
        </div>
      </div>
      <button class="btn btn-outline" id="wipe-btn" style="border-color:hsl(var(--error));color:hsl(var(--error))">Create Pristine Environment</button>
    </div>
  `);

  // Show empty-state banner if DB has no data
  await updateEmptyBanner(root);

  // Create Pristine Environment
  $('#wipe-btn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to create a pristine environment? All existing data will be removed. This cannot be undone.')) return;
    try {
      const db = getDbAdapter();
      await db.wipeAllData();
      await db.createSchema();
      window.location.href = '../../core/dashboard/index.html';
    } catch (e) {
      showToast('Failed to create pristine environment.', 'error');
    }
  });

  // Wipe and load mock data
  $('#reload-btn')?.addEventListener('click', async () => {
    try {
      const db = getDbAdapter();
      await db.wipeAllData();
      await db.createSchema();
      await seedData(db);
      await db.flush();
      window.location.href = '../../core/dashboard/index.html';
    } catch (e) {
      showToast('Failed to load mock data.', 'error');
    }
  });

  // Upload snapshot
  const importInput = document.getElementById('upload-input') as HTMLInputElement | null;
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const db = getDbAdapter();
      await db.wipeAllData();
      await db.importSnapshot(text);
      await db.flush();
      window.location.href = '../../core/dashboard/index.html';
    } catch (e) {
      showToast('Failed to upload snapshot. Check file format.', 'error');
    }
    importInput.value = '';
  });

  // Download snapshot
  $('#download-btn')?.addEventListener('click', async () => {
    try {
      const json = await getDbAdapter().exportSnapshot();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      const date = new Date().toISOString().split('T')[0];
      downloadLink.download = `fusion-ai-snapshot-${date}.json`;
      downloadLink.click();
      URL.revokeObjectURL(url);
      showToast('Snapshot downloaded successfully.', 'success');
    } catch (e) {
      showToast('Failed to download snapshot.', 'error');
    }
  });
}
