const fileInputFolder = document.querySelector('#file-input');
const fileInputFiles = document.querySelector('#file-input-files');
const dropZone = document.querySelector('#drop-zone');
const pickDirectBtn = document.querySelector('#pick-direct-btn');
const pickFilesBtn = document.querySelector('#pick-files-btn');
const prefixInput = document.querySelector('#prefix');
const sortOrder = document.querySelector('#sort-order');
const includeDate = document.querySelector('#include-date');
const prepareButton = document.querySelector('#prepare-button');
const previewBody = document.querySelector('#preview-body');
const fileCount = document.querySelector('#file-count');
const statusText = document.querySelector('#status-text');
const progressContainer = document.querySelector('#progress-container');
const progressBar = document.querySelector('#progress-bar');
const directRenameBtn = document.querySelector('#direct-rename-button');
const zipBtn = document.querySelector('#zip-button');
const singleBtn = document.querySelector('#single-button');

let selectedFiles = []; // Array of { file, handle, originalName }
let renamePlan = [];     // Array of { file, handle, oldName, newName, customEdited }
let currentDirHandle = null;
let isBusy = false;

const IGNORED_FILENAMES = new Set([
  'bulk_file_renamer.py',
  'index.html',
  'style.css',
  'app.js',
  'jszip.min.js',
  'rename-plan.csv'
]);

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

const formatDate = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${y}${m}${d}`;
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function updateProgress(percent, text) {
  if (percent !== null && percent !== undefined) {
    progressContainer.style.display = 'block';
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  } else {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }
  if (text) {
    statusText.textContent = text;
  }
}

function setBusy(busy, message = '') {
  isBusy = busy;
  [directRenameBtn, zipBtn, singleBtn, prepareButton, pickDirectBtn, pickFilesBtn].forEach((btn) => {
    if (btn) btn.disabled = busy || selectedFiles.length === 0;
  });
  if (message) {
    statusText.textContent = message;
  }
}

function buildPlan(resetCustom = false) {
  if (selectedFiles.length === 0) {
    renamePlan = [];
    renderPlan();
    return;
  }

  // Preserve any custom edited names if not resetting
  const customMap = new Map();
  if (!resetCustom) {
    renamePlan.forEach((item) => {
      if (item.customEdited) {
        customMap.set(item.oldName, item.newName);
      }
    });
  }

  const sorted = [...selectedFiles].sort((a, b) => {
    if (sortOrder.value === 'date') return b.file.lastModified - a.file.lastModified;
    if (sortOrder.value === 'size') return b.file.size - a.file.size;
    return a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const prefix = prefixInput.value.trim() || 'Dokumen';

  renamePlan = sorted.map((entry, index) => {
    const fileName = entry.file.name;
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex !== -1 ? fileName.slice(dotIndex) : '';
    const date = includeDate.checked ? `_${formatDate(new Date(entry.file.lastModified))}` : '';
    const defaultNewName = `${prefix}_${String(index + 1).padStart(3, '0')}${date}${extension}`;

    const newName = customMap.has(fileName) ? customMap.get(fileName) : defaultNewName;
    const isCustom = customMap.has(fileName);

    return {
      file: entry.file,
      handle: entry.handle || null,
      oldName: fileName,
      newName: newName,
      customEdited: isCustom
    };
  });

  renderPlan();
}

function renderPlan() {
  fileCount.textContent = `${renamePlan.length} file`;

  if (renamePlan.length === 0) {
    previewBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">Pilih folder atau file untuk melihat daftar perubahan nama di sini.</td>
      </tr>
    `;
    directRenameBtn.disabled = true;
    zipBtn.disabled = true;
    singleBtn.disabled = true;
    statusText.textContent = 'Belum ada file yang dipilih.';
    updateProgress(null);
    return;
  }

  previewBody.innerHTML = renamePlan.map((item, index) => `
    <tr>
      <td>${String(index + 1).padStart(2, '0')}</td>
      <td><strong>${escapeHtml(item.oldName)}</strong></td>
      <td class="arrow">→</td>
      <td>
        <input
          type="text"
          class="name-edit-input"
          data-index="${index}"
          value="${escapeHtml(item.newName)}"
          title="Klik untuk mengubah nama file ini secara manual"
        />
      </td>
      <td>${formatSize(item.file.size)}</td>
    </tr>
  `).join('');

  directRenameBtn.disabled = false;
  zipBtn.disabled = false;
  singleBtn.disabled = false;

  const modeInfo = currentDirHandle
    ? `📁 Folder aktif: "${currentDirHandle.name}". Siap di-rename langsung di disk.`
    : `📄 ${renamePlan.length} file siap di-rename atau diunduh.`;

  statusText.textContent = modeInfo;
}

// Allow user to manually edit newName for any file in the table
previewBody.addEventListener('input', (event) => {
  if (event.target.classList.contains('name-edit-input')) {
    const index = parseInt(event.target.dataset.index, 10);
    if (renamePlan[index]) {
      renamePlan[index].newName = event.target.value.trim();
      renamePlan[index].customEdited = true;
    }
  }
});

// Pick Folder Directly using File System Access API
async function handlePickDirectFolder() {
  if (!('showDirectoryPicker' in window)) {
    alert(
      'Fitur rename langsung di folder memerlukan browser yang mendukung File System Access API (seperti Google Chrome atau Microsoft Edge).\n\nSilakan gunakan tombol "Pilih File Biasa" untuk mengunggah dan mengunduh file yang sudah direname.'
    );
    fileInputFolder.click();
    return;
  }

  try {
    currentDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const entries = [];

    for await (const [name, handle] of currentDirHandle.entries()) {
      if (handle.kind === 'file') {
        if (IGNORED_FILENAMES.has(name) || name.startsWith('.')) continue;
        const file = await handle.getFile();
        entries.push({ file, handle, originalName: name });
      }
    }

    if (entries.length === 0) {
      alert(`Tidak ada file yang dapat di-rename di folder "${currentDirHandle.name}".`);
      return;
    }

    selectedFiles = entries;
    buildPlan(true);
    document.querySelector('#preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      alert('Gagal membuka folder: ' + err.message);
    }
  }
}

// Receive files from standard input or drop
function receiveFileList(files) {
  const filtered = [...files].filter((f) => !IGNORED_FILENAMES.has(f.name) && !f.name.startsWith('.'));
  if (filtered.length === 0) {
    alert('Tidak ada file yang valid untuk diproses.');
    return;
  }
  selectedFiles = filtered.map((file) => ({
    file,
    handle: null,
    originalName: file.name
  }));
  currentDirHandle = null;
  buildPlan(true);
  document.querySelector('#preview-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Direct Rename on Disk
async function executeDirectRename() {
  if (renamePlan.length === 0 || isBusy) return;

  // If user didn't pick via showDirectoryPicker initially, ask them to select the folder now
  if (!currentDirHandle) {
    if (!('showDirectoryPicker' in window)) {
      alert(
        'Ganti nama langsung di folder memerlukan browser Google Chrome atau Microsoft Edge.\n\nAnda dapat mengunduh semua file yang sudah direname dengan tombol "Unduh Semua (.zip)".'
      );
      return;
    }

    const wantSelect = confirm(
      'Untuk mengubah nama file langsung di komputer Anda, silakan pilih folder tempat file-file tersebut berada pada dialog berikutnya. Lanjutkan?'
    );
    if (!wantSelect) return;

    try {
      currentDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      return; // User cancelled
    }
  }

  const confirmMsg = `PERINGATAN:\nAnda akan mengubah nama ${renamePlan.length} file secara langsung di folder "${currentDirHandle.name}".\n\nApakah Anda yakin ingin melanjutkan?`;
  if (!confirm(confirmMsg)) return;

  setBusy(true, 'Memulai proses rename file di folder...');
  let successCount = 0;
  let failCount = 0;
  const total = renamePlan.length;

  try {
    // Phase 1: Rename files that change to temporary unique names to avoid any name collision
    const tempRenameTasks = [];
    for (let i = 0; i < total; i++) {
      const item = renamePlan[i];
      if (item.oldName === item.newName) continue;

      updateProgress(((i + 1) / (total * 2)) * 100, `Menyiapkan (${i + 1}/${total}): ${item.oldName}...`);

      let handle = item.handle;
      if (!handle) {
        try {
          handle = await currentDirHandle.getFileHandle(item.oldName);
        } catch (e) {
          console.warn(`File ${item.oldName} tidak ditemukan di folder.`);
          failCount++;
          continue;
        }
      }

      const tempName = `__tmp_renamer_${Date.now()}_${i}_${item.oldName}`;
      if (typeof handle.move === 'function') {
        await handle.move(tempName);
        tempRenameTasks.push({ item, handle, tempName });
      } else {
        const fileData = await handle.getFile();
        const tempHandle = await currentDirHandle.getFileHandle(tempName, { create: true });
        const writable = await tempHandle.createWritable();
        await writable.write(await fileData.arrayBuffer());
        await writable.close();
        await currentDirHandle.removeEntry(item.oldName);
        tempRenameTasks.push({ item, handle: tempHandle, tempName });
      }
    }

    // Phase 2: Rename from temporary names to final newName
    for (let i = 0; i < tempRenameTasks.length; i++) {
      const { item, handle, tempName } = tempRenameTasks[i];
      const percent = 50 + (((i + 1) / (tempRenameTasks.length * 2)) * 100);
      updateProgress(percent, `Mengubah nama (${i + 1}/${tempRenameTasks.length}): ${item.newName}...`);

      try {
        if (typeof handle.move === 'function') {
          await handle.move(item.newName);
        } else {
          const fileData = await handle.getFile();
          const newHandle = await currentDirHandle.getFileHandle(item.newName, { create: true });
          const writable = await newHandle.createWritable();
          await writable.write(await fileData.arrayBuffer());
          await writable.close();
          await currentDirHandle.removeEntry(tempName);
          item.handle = newHandle;
        }

        // Update the file and oldName references
        item.oldName = item.newName;
        item.customEdited = false;
        successCount++;
      } catch (err) {
        console.error(`Gagal merename ke ${item.newName}:`, err);
        failCount++;
      }
    }

    // Reload files from directory to refresh internal state
    const refreshedEntries = [];
    for await (const [name, handle] of currentDirHandle.entries()) {
      if (handle.kind === 'file') {
        if (IGNORED_FILENAMES.has(name) || name.startsWith('.')) continue;
        const file = await handle.getFile();
        refreshedEntries.push({ file, handle, originalName: name });
      }
    }
    selectedFiles = refreshedEntries;
    buildPlan(true);

    updateProgress(100, `✅ Sukses! ${successCount} file berhasil di-rename langsung di folder "${currentDirHandle.name}".`);
    alert(`Sukses! ${successCount} file berhasil di-rename langsung di foldermu!` + (failCount > 0 ? ` (${failCount} gagal)` : ''));
  } catch (err) {
    console.error(err);
    alert('Terjadi error saat merename: ' + err.message);
    updateProgress(null, `⚠️ Error: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

// Download All Files as a ZIP archive
async function executeZipDownload() {
  if (renamePlan.length === 0 || isBusy) return;

  if (typeof JSZip === 'undefined') {
    alert('Library JSZip belum termuat. Periksa file jszip.min.js.');
    return;
  }

  setBusy(true, 'Sedang mengompres file ke format ZIP...');
  try {
    const zip = new JSZip();
    renamePlan.forEach((item) => {
      zip.file(item.newName, item.file);
    });

    const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      updateProgress(metadata.percent, `Mengompres file: ${Math.round(metadata.percent)}%...`);
    });

    const prefix = prefixInput.value.trim() || 'Dokumen';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${prefix}_Hasil_Rename.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    updateProgress(100, `✅ File ZIP berhasil diunduh! Berisi ${renamePlan.length} file dengan nama baru.`);
  } catch (err) {
    console.error(err);
    alert('Gagal mengunduh ZIP: ' + err.message);
    updateProgress(null, `⚠️ Error ZIP: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

// Download Each File Individually
async function executeIndividualDownload() {
  if (renamePlan.length === 0 || isBusy) return;

  const count = renamePlan.length;
  if (count > 10) {
    const ok = confirm(`Anda akan mengunduh ${count} file satu per satu. Browser mungkin akan meminta izin pengunduhan ganda. Lanjutkan?`);
    if (!ok) return;
  }

  setBusy(true, 'Sedang mengunduh file...');
  try {
    for (let i = 0; i < count; i++) {
      const item = renamePlan[i];
      const percent = Math.round(((i + 1) / count) * 100);
      updateProgress(percent, `Mengunduh (${i + 1}/${count}): ${item.newName}...`);

      const link = document.createElement('a');
      link.href = URL.createObjectURL(item.file);
      link.download = item.newName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      if (i < count - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    updateProgress(100, `✅ Berhasil mengunduh ${count} file dengan nama baru!`);
  } catch (err) {
    console.error(err);
    alert('Gagal mengunduh: ' + err.message);
    updateProgress(null, `⚠️ Error unduh: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

// Event Listeners
pickDirectBtn.addEventListener('click', handlePickDirectFolder);
pickFilesBtn.addEventListener('click', () => fileInputFiles.click());

fileInputFolder.addEventListener('change', (e) => receiveFileList(e.target.files));
fileInputFiles.addEventListener('change', (e) => receiveFileList(e.target.files));

// Drag and Drop
['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
  });
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files) {
    receiveFileList(e.dataTransfer.files);
  }
});

// Controls
prepareButton.addEventListener('click', () => buildPlan(true));
prefixInput.addEventListener('input', () => buildPlan(false));
sortOrder.addEventListener('change', () => buildPlan(false));
includeDate.addEventListener('change', () => buildPlan(false));

// Action Buttons
directRenameBtn.addEventListener('click', executeDirectRename);
zipBtn.addEventListener('click', executeZipDownload);
singleBtn.addEventListener('click', executeIndividualDownload);