/* =========================================================
   HMIS Med Auto — Web-based Admin Configuration & Template Editor
   ========================================================= */

(function () {
  'use strict';

  // ── Password Protection with SHA-256 Hash ──
  const AUTH_HASH = '2987546a0bf78966e343009f5de22c8715a172251c04fff5789ccfb6e6eb5424';

  async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const authScreen = document.getElementById('auth-screen');
  const authForm = document.getElementById('auth-form');
  const authPassword = document.getElementById('auth-password');
  const authErrorMsg = document.getElementById('auth-error-msg');
  const adminApp = document.getElementById('admin-app');

  function checkAuth() {
    if (sessionStorage.getItem('admin_authenticated') === 'true') {
      authScreen.style.display = 'none';
      adminApp.style.display = 'flex';
      initAdmin();
    } else {
      authScreen.style.display = 'flex';
      adminApp.style.display = 'none';
    }
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entered = authPassword.value;
    const computed = await sha256(entered);
    if (computed === AUTH_HASH) {
      sessionStorage.setItem('admin_authenticated', 'true');
      authErrorMsg.style.display = 'none';
      authScreen.style.display = 'none';
      adminApp.style.display = 'flex';
      initAdmin();
    } else {
      authErrorMsg.style.display = 'block';
      authPassword.value = '';
      authPassword.focus();
    }
  });

  document.getElementById('btn-lock')?.addEventListener('click', () => {
    sessionStorage.removeItem('admin_authenticated');
    window.location.reload();
  });

  // ── GitHub Configuration (Isolated & Configurable) ──
  function getGitHubConfig() {
    const owner = (localStorage.getItem('admin_gh_owner') || 'testgcahm').trim();
    const repo = (localStorage.getItem('admin_gh_repo') || 'ahm-hmis-med-auto-releases').trim();
    const branch = (localStorage.getItem('admin_gh_branch') || 'main').trim();

    const isMainDevRepo = repo.toLowerCase() === 'hmis-ahm-gmc';

    return {
      owner,
      repo,
      branch,
      fileMap: {
        'data/templates.json': isMainDevRepo ? 'vercel-public/data/templates.json' : 'data/templates.json',
        'version.json': isMainDevRepo ? 'vercel-public/version.json' : 'version.json'
      }
    };
  }

  // State
  let currentFileKey = 'data/templates.json';
  let currentFileSha = null;
  let currentJsonData = null;
  let isSaving = false;
  let selectedDeptKey = 'ENT';
  let selectedTemplateKey = 'ent_general_anesthesia';

  // Base64 UTF-8 Helpers
  function decodeBase64Utf8(base64) {
    const binaryString = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // DOM Elements
  const jsonEditor = document.getElementById('json-code-editor');
  const fileSelector = document.getElementById('file-selector');
  const connStatus = document.getElementById('conn-status');
  const shaStatus = document.getElementById('sha-status');
  const syntaxStatus = document.getElementById('syntax-status');
  const lastSavedStatus = document.getElementById('last-saved-status');
  const globalAlert = document.getElementById('global-alert');
  const globalAlertText = document.getElementById('global-alert-text');
  const btnCloseAlert = document.getElementById('btn-close-alert');

  const pillVisualMode = document.getElementById('pill-visual-mode');
  const pillCodeMode = document.getElementById('pill-code-mode');
  const visualEditorView = document.getElementById('visual-editor-view');
  const codeEditorView = document.getElementById('code-editor-view');
  const visualSaveBar = document.getElementById('visual-save-bar');

  // Token Modal
  const tokenModal = document.getElementById('token-modal');
  const btnTokenModal = document.getElementById('btn-token-modal');
  const btnCloseTokenModal = document.getElementById('btn-close-token-modal');
  const inputPatToken = document.getElementById('input-pat-token');
  const btnSaveToken = document.getElementById('btn-save-token');
  const btnClearToken = document.getElementById('btn-clear-token');

  // Alert Banner Helper
  function showAlert(msg, type = 'info') {
    globalAlert.className = 'alert-banner ' + type;
    globalAlertText.textContent = msg;
    globalAlert.style.display = 'flex';
  }

  btnCloseAlert?.addEventListener('click', () => {
    globalAlert.style.display = 'none';
  });

  // Theme Toggle
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  btnToggleTheme?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('admin_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });

  if (localStorage.getItem('admin_theme') === 'dark' ||
      (!localStorage.getItem('admin_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }

  // Token Management
  function getGitHubToken() {
    return localStorage.getItem('github_admin_pat') || '';
  }

  function updateTokenStatusBadge() {
    const token = getGitHubToken();
    if (token) {
      connStatus.className = 'status-badge connected';
      connStatus.textContent = '● Authenticated';
      btnTokenModal.textContent = '🔑 Token Saved';
    } else {
      connStatus.className = 'status-badge warning';
      connStatus.textContent = '○ Token Needed';
      btnTokenModal.textContent = '🔑 Set Token';
    }
  }

  btnTokenModal?.addEventListener('click', () => {
    const cfg = getGitHubConfig();
    const inputOwner = document.getElementById('input-gh-owner');
    const inputRepo = document.getElementById('input-gh-repo');
    const inputBranch = document.getElementById('input-gh-branch');

    if (inputOwner) inputOwner.value = cfg.owner;
    if (inputRepo) inputRepo.value = cfg.repo;
    if (inputBranch) inputBranch.value = cfg.branch;
    if (inputPatToken) inputPatToken.value = getGitHubToken();

    tokenModal.style.display = 'flex';
    inputPatToken.focus();
  });

  btnCloseTokenModal?.addEventListener('click', () => {
    tokenModal.style.display = 'none';
  });

  btnSaveToken?.addEventListener('click', () => {
    const tok = inputPatToken.value.trim();
    const owner = (document.getElementById('input-gh-owner')?.value || 'testgcahm').trim();
    const repo = (document.getElementById('input-gh-repo')?.value || 'ahm-hmis-med-auto-releases').trim();
    const branch = (document.getElementById('input-gh-branch')?.value || 'main').trim();

    localStorage.setItem('admin_gh_owner', owner);
    localStorage.setItem('admin_gh_repo', repo);
    localStorage.setItem('admin_gh_branch', branch);

    if (tok) {
      localStorage.setItem('github_admin_pat', tok);
      showAlert(`GitHub settings saved! Target: ${owner}/${repo} (${branch})`, 'success');
    } else {
      localStorage.removeItem('github_admin_pat');
      showAlert('GitHub settings saved! (No PAT set)', 'info');
    }
    updateTokenStatusBadge();
    tokenModal.style.display = 'none';
    loadFileContent(currentFileKey);
  });

  btnClearToken?.addEventListener('click', () => {
    localStorage.removeItem('github_admin_pat');
    localStorage.removeItem('admin_gh_owner');
    localStorage.removeItem('admin_gh_repo');
    localStorage.removeItem('admin_gh_branch');
    if (inputPatToken) inputPatToken.value = '';
    updateTokenStatusBadge();
    tokenModal.style.display = 'none';
    showAlert('GitHub Token & Settings reset to defaults.', 'info');
  });

  // View Switching
  function switchView(mode) {
    if (mode === 'visual') {
      pillVisualMode.classList.add('active');
      pillCodeMode.classList.remove('active');
      visualEditorView.style.display = 'flex';
      visualSaveBar.style.display = 'flex';
      codeEditorView.style.display = 'none';
      renderVisualEditor();
    } else {
      pillCodeMode.classList.add('active');
      pillVisualMode.classList.remove('active');
      codeEditorView.style.display = 'flex';
      visualEditorView.style.display = 'none';
      visualSaveBar.style.display = 'none';
      validateJsonSyntax();
    }
  }

  pillVisualMode?.addEventListener('click', () => switchView('visual'));
  pillCodeMode?.addEventListener('click', () => switchView('code'));

  // ── GitHub API Fetch & Save ──
  async function loadFileContent(fileKey) {
    currentFileKey = fileKey;
    const GITHUB_CONFIG = getGitHubConfig();
    const targetPath = GITHUB_CONFIG.fileMap[fileKey] || fileKey;
    showAlert(`Loading ${targetPath} from GitHub (${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo})...`, 'info');

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    const token = getGitHubToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${targetPath}?ref=${GITHUB_CONFIG.branch}&_t=${Date.now()}`;
      const res = await fetch(url, { headers, cache: 'no-store' });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`File "${targetPath}" not found on branch "${GITHUB_CONFIG.branch}".`);
        }
        throw new Error(`GitHub API error (${res.status}): ${res.statusText}`);
      }

      const data = await res.json();
      currentFileSha = data.sha;
      shaStatus.textContent = `SHA: ${currentFileSha ? currentFileSha.substring(0, 7) : 'none'}`;
      lastSavedStatus.textContent = `Loaded: ${new Date().toLocaleTimeString()}`;

      const content = decodeBase64Utf8(data.content);
      jsonEditor.value = content;
      currentJsonData = JSON.parse(content);

      validateJsonSyntax();
      renderVisualEditor();
      showAlert(`Loaded ${targetPath} successfully (SHA: ${currentFileSha.substring(0, 7)}).`, 'success');
    } catch (err) {
      // If fetching remote via GitHub API fails (e.g. rate limit / private), try public raw/local fetch
      console.warn('GitHub API fetch failed, trying local fallback...', err);
      try {
        const localUrl = `${fileKey}?_t=${Date.now()}`;
        const localRes = await fetch(localUrl, { cache: 'no-store' });
        if (localRes.ok) {
          const content = await localRes.text();
          jsonEditor.value = content;
          currentJsonData = JSON.parse(content);
          currentFileSha = null;
          shaStatus.textContent = `SHA: none (read-only preview)`;
          validateJsonSyntax();
          renderVisualEditor();
          showAlert(`Loaded local preview of ${fileKey}. Set a GitHub Token to commit changes.`, 'info');
          return;
        }
      } catch (_localErr) {}

      showAlert(`Error loading file: ${err.message}`, 'error');
    }
  }

  async function saveFileToGitHub() {
    if (isSaving) return;

    // 1. Validate JSON
    const parsed = validateJsonSyntax();
    if (!parsed) {
      showAlert('Cannot save: Invalid JSON syntax. Fix the syntax errors before saving.', 'error');
      switchView('code');
      return;
    }

    // 2. Check token
    const token = getGitHubToken();
    if (!token) {
      showAlert('GitHub Token is required to save changes. Please enter your PAT.', 'error');
      tokenModal.style.display = 'flex';
      inputPatToken.focus();
      return;
    }

    const GITHUB_CONFIG = getGitHubConfig();
    const targetPath = GITHUB_CONFIG.fileMap[currentFileKey] || currentFileKey;
    const confirmSave = confirm(`Commit and push changes for "${targetPath}" to GitHub branch "${GITHUB_CONFIG.branch}"?`);
    if (!confirmSave) return;

    isSaving = true;
    const saveBtn = document.getElementById('btn-save-github');
    const visualSaveBtn = document.getElementById('btn-visual-save');
    const label = document.getElementById('save-btn-label');
    if (saveBtn) saveBtn.disabled = true;
    if (visualSaveBtn) visualSaveBtn.disabled = true;
    if (label) label.textContent = '⏳ Saving...';
    showAlert(`Checking latest file state on GitHub...`, 'info');

    try {
      // 3. Fetch latest SHA to prevent overwriting conflicting changes
      const checkUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${targetPath}?ref=${GITHUB_CONFIG.branch}&_t=${Date.now()}`;
      const checkRes = await fetch(checkUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
      });

      let latestSha = currentFileSha;
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        latestSha = checkData.sha;
        if (currentFileSha && latestSha !== currentFileSha) {
          throw new Error('File changed on GitHub since you loaded it. Reload before saving to avoid overwriting newer changes.');
        }
      }

      // 4. Send PUT request to GitHub Contents API
      const formattedJson = JSON.stringify(parsed, null, 2);
      const base64Content = encodeBase64Utf8(formattedJson);

      const putUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${targetPath}`;
      const payload = {
        message: `Update ${targetPath} via Web Admin [skip ci]`,
        content: base64Content,
        branch: GITHUB_CONFIG.branch
      };
      if (latestSha) {
        payload.sha = latestSha;
      }

      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!putRes.ok) {
        const errorData = await putRes.json().catch(() => ({}));
        throw new Error(`GitHub save failed (${putRes.status}): ${errorData.message || putRes.statusText}`);
      }

      const resData = await putRes.json();
      currentFileSha = resData.content ? resData.content.sha : (resData.commit ? resData.commit.sha : null);
      shaStatus.textContent = `SHA: ${currentFileSha ? currentFileSha.substring(0, 7) : 'saved'}`;
      lastSavedStatus.textContent = `Last saved: ${new Date().toLocaleTimeString()}`;

      // Update current stored JSON
      currentJsonData = parsed;
      jsonEditor.value = formattedJson;
      validateJsonSyntax();
      renderVisualEditor();

      showAlert(`✨ Successfully pushed update to GitHub! (${currentFileSha ? currentFileSha.substring(0, 7) : 'main'}). Changes will propagate to GitHub Pages shortly.`, 'success');
    } catch (err) {
      showAlert(`❌ Save failed: ${err.message}`, 'error');
    } finally {
      isSaving = false;
      if (saveBtn) saveBtn.disabled = false;
      if (visualSaveBtn) visualSaveBtn.disabled = false;
      if (label) label.textContent = '💾 Save to GitHub';
    }
  }

  // ── JSON Syntax Validation & Utilities ──
  function validateJsonSyntax() {
    try {
      const parsed = JSON.parse(jsonEditor.value);
      syntaxStatus.textContent = '✓ JSON valid';
      syntaxStatus.style.color = 'var(--success)';
      return parsed;
    } catch (e) {
      syntaxStatus.textContent = `⚠️ Syntax Error: ${e.message}`;
      syntaxStatus.style.color = 'var(--danger)';
      return null;
    }
  }

  function formatJson() {
    const parsed = validateJsonSyntax();
    if (parsed) {
      jsonEditor.value = JSON.stringify(parsed, null, 2);
      showAlert('JSON formatted and pretty-printed.', 'info');
    } else {
      showAlert('Cannot format: JSON contains syntax errors.', 'error');
    }
  }

  function minifyJson() {
    const parsed = validateJsonSyntax();
    if (parsed) {
      jsonEditor.value = JSON.stringify(parsed);
      showAlert('JSON minified.', 'info');
    } else {
      showAlert('Cannot minify: JSON contains syntax errors.', 'error');
    }
  }

  // ── Visual Department & Template Editor Engine ──
  function syncVisualToJson() {
    if (!currentJsonData) return;
    currentJsonData.lastUpdated = new Date().toISOString();
    jsonEditor.value = JSON.stringify(currentJsonData, null, 2);
    validateJsonSyntax();
  }

  function renderVisualEditor() {
    const isTemplateFile = currentFileKey === 'data/templates.json' || (currentJsonData && currentJsonData.departments);
    if (!isTemplateFile || !currentJsonData) {
      visualEditorView.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px 20px;">
          <h3 style="font-size: 16px; margin-bottom: 8px;">Standard JSON File</h3>
          <p style="font-size: 13px; color: var(--subtitle); margin-bottom: 16px;">This file does not use the Department & Templates schema. Use the Raw JSON Editor to make edits.</p>
          <button type="button" class="btn btn-primary" onclick="document.getElementById('pill-code-mode').click()">Switch to Raw JSON Editor</button>
        </div>
      `;
      return;
    }

    // Ensure proper schema containers
    if (!currentJsonData.departments || typeof currentJsonData.departments !== 'object') {
      currentJsonData.departments = {};
    }
    if (!currentJsonData.defaultTemplates || typeof currentJsonData.defaultTemplates !== 'object') {
      currentJsonData.defaultTemplates = {};
    }

    const depts = currentJsonData.departments;
    const deptKeys = Object.keys(depts);

    // If selected dept doesn't exist, pick first or "DEFAULT"
    if (selectedDeptKey !== '__DEFAULTS__' && !depts[selectedDeptKey]) {
      selectedDeptKey = deptKeys.length > 0 ? deptKeys[0] : '__DEFAULTS__';
    }

    // Render Department Tabs
    const tabsContainer = document.getElementById('visual-dept-tabs');
    if (!tabsContainer) return;

    let tabsHtml = '';
    deptKeys.forEach(k => {
      const active = (k === selectedDeptKey) ? 'active' : '';
      const name = depts[k].name || k;
      tabsHtml += `<button type="button" class="dept-tab-btn ${active}" data-dept="${k}">🏥 ${name}</button>`;
    });

    // Default Templates Tab
    const defaultActive = (selectedDeptKey === '__DEFAULTS__') ? 'active' : '';
    tabsHtml += `<button type="button" class="dept-tab-btn ${defaultActive}" data-dept="__DEFAULTS__">📋 Default Templates (All Wards)</button>`;
    tabsContainer.innerHTML = tabsHtml;

    // Attach click listeners to tabs
    tabsContainer.querySelectorAll('.dept-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDeptKey = btn.dataset.dept;
        renderVisualEditor();
      });
    });

    // Render Department details / templates
    const deptLabel = document.getElementById('current-dept-label');
    const btnEditDept = document.getElementById('btn-edit-dept');
    const btnDeleteDept = document.getElementById('btn-delete-dept');
    const templateSelect = document.getElementById('visual-template-select');
    const itemsTbody = document.getElementById('visual-items-tbody');

    let currentTemplates = {};
    if (selectedDeptKey === '__DEFAULTS__') {
      deptLabel.textContent = 'Default Templates (Shown Below Department)';
      if (btnEditDept) btnEditDept.style.display = 'none';
      if (btnDeleteDept) btnDeleteDept.style.display = 'none';
      currentTemplates = currentJsonData.defaultTemplates;
    } else {
      const deptObj = depts[selectedDeptKey];
      deptLabel.textContent = `${deptObj.name || selectedDeptKey} Templates`;
      if (btnEditDept) btnEditDept.style.display = 'inline-flex';
      if (btnDeleteDept) btnDeleteDept.style.display = 'inline-flex';
      currentTemplates = deptObj.templates || {};
    }

    const tplKeys = Object.keys(currentTemplates);
    if (!currentTemplates[selectedTemplateKey]) {
      selectedTemplateKey = tplKeys.length > 0 ? tplKeys[0] : '';
    }

    // Populate Template Select Dropdown
    let tplOptions = '';
    tplKeys.forEach(tk => {
      const selected = (tk === selectedTemplateKey) ? 'selected' : '';
      const tName = currentTemplates[tk].name || tk;
      tplOptions += `<option value="${tk}" ${selected}>${tName}</option>`;
    });
    if (tplKeys.length === 0) {
      tplOptions = '<option value="">(No templates defined)</option>';
    }
    templateSelect.innerHTML = tplOptions;

    // Render Items for selected template
    let itemsHtml = '';
    const activeTpl = currentTemplates[selectedTemplateKey];
    const items = (activeTpl && Array.isArray(activeTpl.items)) ? activeTpl.items : [];

    items.forEach((it, idx) => {
      const name = typeof it === 'object' ? (it.item || it.name || '') : it;
      const qty = typeof it === 'object' ? (it.quantity || it.qty || 1) : 1;
      itemsHtml += `
        <tr>
          <td style="color: var(--subtitle);">${idx + 1}</td>
          <td>
            <input type="text" class="table-input item-name-field" data-idx="${idx}" value="${name}" />
          </td>
          <td>
            <input type="number" class="table-input item-qty-field" data-idx="${idx}" value="${qty}" min="1" />
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-danger btn-delete-item-row" data-idx="${idx}" style="padding: 4px 8px; font-size: 11px;">✕</button>
          </td>
        </tr>
      `;
    });

    if (items.length === 0) {
      itemsHtml = `<tr><td colspan="4" style="text-align: center; color: var(--subtitle); padding: 18px;">No items in this template. Add items below.</td></tr>`;
    }
    itemsTbody.innerHTML = itemsHtml;

    // Bind item edits
    itemsTbody.querySelectorAll('.item-name-field').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (activeTpl && activeTpl.items && activeTpl.items[idx]) {
          if (typeof activeTpl.items[idx] === 'object') {
            activeTpl.items[idx].item = e.target.value.trim();
          } else {
            activeTpl.items[idx] = { item: e.target.value.trim(), quantity: 1 };
          }
          syncVisualToJson();
        }
      });
    });

    itemsTbody.querySelectorAll('.item-qty-field').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const qtyVal = parseInt(e.target.value, 10) || 1;
        if (activeTpl && activeTpl.items && activeTpl.items[idx]) {
          if (typeof activeTpl.items[idx] === 'object') {
            activeTpl.items[idx].quantity = qtyVal;
          } else {
            activeTpl.items[idx] = { item: activeTpl.items[idx], quantity: qtyVal };
          }
          syncVisualToJson();
        }
      });
    });

    itemsTbody.querySelectorAll('.btn-delete-item-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (activeTpl && activeTpl.items) {
          activeTpl.items.splice(idx, 1);
          syncVisualToJson();
          renderVisualEditor();
        }
      });
    });
  }

  // Add Item Row Button
  document.getElementById('btn-add-item-row')?.addEventListener('click', () => {
    const nameInput = document.getElementById('new-item-name');
    const qtyInput = document.getElementById('new-item-qty');
    const name = nameInput.value.trim();
    const qty = parseInt(qtyInput.value, 10) || 1;

    if (!name) {
      showAlert('Please enter an item name.', 'warning');
      return;
    }

    const currentTemplates = (selectedDeptKey === '__DEFAULTS__')
      ? currentJsonData.defaultTemplates
      : currentJsonData.departments[selectedDeptKey]?.templates;

    if (!currentTemplates || !currentTemplates[selectedTemplateKey]) {
      showAlert('No active template selected to add item.', 'warning');
      return;
    }

    if (!Array.isArray(currentTemplates[selectedTemplateKey].items)) {
      currentTemplates[selectedTemplateKey].items = [];
    }

    currentTemplates[selectedTemplateKey].items.push({ item: name, quantity: qty });
    nameInput.value = '';
    qtyInput.value = '1';
    syncVisualToJson();
    renderVisualEditor();
    nameInput.focus();
  });

  // Template Dropdown Change
  document.getElementById('visual-template-select')?.addEventListener('change', (e) => {
    selectedTemplateKey = e.target.value;
    renderVisualEditor();
  });

  // New Template Button
  document.getElementById('btn-new-template')?.addEventListener('click', () => {
    const tName = prompt('Enter new template name (e.g. Local Anesthesia, Pediatric GA):');
    if (!tName || !tName.trim()) return;

    const key = tName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const currentTemplates = (selectedDeptKey === '__DEFAULTS__')
      ? currentJsonData.defaultTemplates
      : currentJsonData.departments[selectedDeptKey].templates;

    if (currentTemplates[key]) {
      showAlert('A template with this name already exists.', 'warning');
      return;
    }

    currentTemplates[key] = {
      name: tName.trim(),
      items: []
    };
    if (selectedDeptKey !== '__DEFAULTS__') {
      currentTemplates[key].department = selectedDeptKey;
    }

    selectedTemplateKey = key;
    syncVisualToJson();
    renderVisualEditor();
    showAlert(`Template "${tName.trim()}" created.`, 'success');
  });

  // Delete Template Button
  document.getElementById('btn-delete-template')?.addEventListener('click', () => {
    const currentTemplates = (selectedDeptKey === '__DEFAULTS__')
      ? currentJsonData.defaultTemplates
      : currentJsonData.departments[selectedDeptKey]?.templates;

    if (!currentTemplates || !currentTemplates[selectedTemplateKey]) return;
    const tName = currentTemplates[selectedTemplateKey].name || selectedTemplateKey;

    if (confirm(`Delete template "${tName}"?`)) {
      delete currentTemplates[selectedTemplateKey];
      const remaining = Object.keys(currentTemplates);
      selectedTemplateKey = remaining.length > 0 ? remaining[0] : '';
      syncVisualToJson();
      renderVisualEditor();
      showAlert(`Template "${tName}" deleted.`, 'info');
    }
  });

  // Department Modal Handling
  const deptModal = document.getElementById('dept-modal');
  const deptModalTitle = document.getElementById('dept-modal-title');
  const deptKeyInput = document.getElementById('dept-key-input');
  const deptNameInput = document.getElementById('dept-name-input');
  const deptAliasesInput = document.getElementById('dept-aliases-input');
  let isEditingDept = false;

  document.getElementById('btn-add-dept')?.addEventListener('click', () => {
    isEditingDept = false;
    deptModalTitle.textContent = 'Add Department';
    deptKeyInput.value = '';
    deptKeyInput.disabled = false;
    deptNameInput.value = '';
    deptAliasesInput.value = '';
    deptModal.style.display = 'flex';
    deptKeyInput.focus();
  });

  document.getElementById('btn-edit-dept')?.addEventListener('click', () => {
    if (selectedDeptKey === '__DEFAULTS__' || !currentJsonData.departments[selectedDeptKey]) return;
    isEditingDept = true;
    const dept = currentJsonData.departments[selectedDeptKey];
    deptModalTitle.textContent = `Edit Department: ${selectedDeptKey}`;
    deptKeyInput.value = selectedDeptKey;
    deptKeyInput.disabled = true;
    deptNameInput.value = dept.name || selectedDeptKey;
    deptAliasesInput.value = (dept.aliases || []).join(', ');
    deptModal.style.display = 'flex';
    deptNameInput.focus();
  });

  document.getElementById('btn-close-dept-modal')?.addEventListener('click', () => {
    deptModal.style.display = 'none';
  });
  document.getElementById('btn-cancel-dept-modal')?.addEventListener('click', () => {
    deptModal.style.display = 'none';
  });

  document.getElementById('btn-confirm-dept-modal')?.addEventListener('click', () => {
    const key = deptKeyInput.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const name = deptNameInput.value.trim();
    const aliases = deptAliasesInput.value.split(',').map(s => s.trim()).filter(Boolean);

    if (!key || !name) {
      showAlert('Department key and display name are required.', 'warning');
      return;
    }

    if (!isEditingDept && currentJsonData.departments[key]) {
      showAlert(`Department "${key}" already exists.`, 'warning');
      return;
    }

    if (!currentJsonData.departments[key]) {
      currentJsonData.departments[key] = {
        name: name,
        aliases: aliases,
        templates: {}
      };
    } else {
      currentJsonData.departments[key].name = name;
      currentJsonData.departments[key].aliases = aliases;
    }

    selectedDeptKey = key;
    deptModal.style.display = 'none';
    syncVisualToJson();
    renderVisualEditor();
    showAlert(`Department "${name}" updated.`, 'success');
  });

  document.getElementById('btn-delete-dept')?.addEventListener('click', () => {
    if (selectedDeptKey === '__DEFAULTS__') return;
    if (confirm(`Delete department "${selectedDeptKey}" and all of its templates?`)) {
      delete currentJsonData.departments[selectedDeptKey];
      const remaining = Object.keys(currentJsonData.departments);
      selectedDeptKey = remaining.length > 0 ? remaining[0] : '__DEFAULTS__';
      syncVisualToJson();
      renderVisualEditor();
      showAlert('Department deleted.', 'info');
    }
  });

  // ── Keyboard Shortcuts (Ctrl+S, Ctrl+Shift+F) ──
  window.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S -> Save
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !e.shiftKey) {
      e.preventDefault();
      saveFileToGitHub();
    }
    // Ctrl+Shift+F or Cmd+Shift+F -> Format
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      formatJson();
    }
  });

  const DUMMY_BULK_TEMPLATE = {
    "name": "Sample OT Template",
    "items": [
      { "name": "INJ CEFTRIAXONE 1GM", "qty": 1 },
      { "name": "INJ PARACETAMOL 100ML", "qty": 1 },
      { "name": "IV CANNULA 20G", "qty": 1 }
    ]
  };

  const DUMMY_INDIVIDUAL_TEMPLATE = {
    "templates": ["general_anesthesia"],
    "customItems": [
      { "name": "INJ CEFTRIAXONE 1GM", "qty": 1 },
      { "name": "INJ METRONIDAZOLE 100ML", "qty": 1 }
    ]
  };

  // Toolbar button listeners
  document.getElementById('btn-format')?.addEventListener('click', formatJson);
  document.getElementById('btn-minify')?.addEventListener('click', minifyJson);
  document.getElementById('btn-validate')?.addEventListener('click', () => {
    if (validateJsonSyntax()) {
      showAlert('✓ JSON syntax is perfectly valid.', 'success');
    }
  });
  document.getElementById('btn-copy-dummy-template')?.addEventListener('click', () => {
    const text = JSON.stringify(DUMMY_BULK_TEMPLATE, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      showAlert('📋 Sample bulk template JSON copied to clipboard!', 'success');
    }).catch(err => {
      showAlert('Failed to copy: ' + err, 'error');
    });
  });
  document.getElementById('btn-copy-dummy-indiv-template')?.addEventListener('click', () => {
    const text = JSON.stringify(DUMMY_INDIVIDUAL_TEMPLATE, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      showAlert('📋 Sample individual template JSON copied to clipboard!', 'success');
    }).catch(err => {
      showAlert('Failed to copy: ' + err, 'error');
    });
  });
  // ── Paste AI JSON Modal Handler ──
  const pasteJsonModal = document.getElementById('paste-json-modal');
  const pasteJsonModalTitle = document.getElementById('paste-json-modal-title');
  const pasteJsonDeptGroup = document.getElementById('paste-json-dept-group');
  const pasteJsonDeptSelect = document.getElementById('paste-json-dept-select');
  const pasteJsonDeptCustom = document.getElementById('paste-json-dept-custom');
  const pasteJsonKeyLabel = document.getElementById('paste-json-key-label');
  const pasteJsonKeyInput = document.getElementById('paste-json-key-input');
  const pasteJsonTextarea = document.getElementById('paste-json-textarea');

  let currentPasteActionType = ''; // 'dept-bulk', 'dept-indiv', 'bulk', 'indiv'

  function openPasteJsonModal(type) {
    let parsed;
    try {
      parsed = JSON.parse(jsonEditor.value);
    } catch (err) {
      showAlert('Cannot insert template: Current JSON editor content contains syntax errors.', 'error');
      return;
    }

    currentPasteActionType = type;
    pasteJsonTextarea.value = '';
    pasteJsonKeyInput.value = '';
    pasteJsonDeptCustom.value = '';
    pasteJsonDeptCustom.style.display = 'none';

    // Populate department options if needed
    if (type === 'dept-bulk' || type === 'dept-indiv') {
      pasteJsonDeptGroup.style.display = 'block';
      let depts = (parsed && parsed.departments) ? Object.keys(parsed.departments) : [];
      let optionsHtml = depts.map(d => `<option value="${d}">${parsed.departments[d].name || d}</option>`).join('');
      optionsHtml += '<option value="__NEW__">➕ Create New Department...</option>';
      pasteJsonDeptSelect.innerHTML = optionsHtml;
      if (depts.length > 0 && selectedDeptKey && selectedDeptKey !== '__DEFAULTS__' && depts.includes(selectedDeptKey)) {
        pasteJsonDeptSelect.value = selectedDeptKey;
      }
    } else {
      pasteJsonDeptGroup.style.display = 'none';
    }

    if (type === 'dept-bulk') {
      pasteJsonModalTitle.textContent = 'Add Bulk Template in Department';
      pasteJsonKeyLabel.textContent = 'Template Key (e.g. general_anesthesia)';
      pasteJsonKeyInput.placeholder = 'e.g. ent_local_anesthesia';
      pasteJsonTextarea.placeholder = JSON.stringify(DUMMY_BULK_TEMPLATE, null, 2);
    } else if (type === 'dept-indiv') {
      pasteJsonModalTitle.textContent = 'Add Individual Template in Department';
      pasteJsonKeyLabel.textContent = 'Patient Index or Override Key';
      pasteJsonKeyInput.placeholder = 'e.g. 0 or patient_0';
      pasteJsonTextarea.placeholder = JSON.stringify(DUMMY_INDIVIDUAL_TEMPLATE, null, 2);
    } else if (type === 'bulk') {
      pasteJsonModalTitle.textContent = 'Add Bulk Template';
      pasteJsonKeyLabel.textContent = 'Template Key (e.g. general_anesthesia)';
      pasteJsonKeyInput.placeholder = 'e.g. pediatric_anesthesia';
      pasteJsonTextarea.placeholder = JSON.stringify(DUMMY_BULK_TEMPLATE, null, 2);
    } else if (type === 'indiv') {
      pasteJsonModalTitle.textContent = 'Add Individual Template';
      pasteJsonKeyLabel.textContent = 'Patient Index or Override Key';
      pasteJsonKeyInput.placeholder = 'e.g. 0 or 1';
      pasteJsonTextarea.placeholder = JSON.stringify(DUMMY_INDIVIDUAL_TEMPLATE, null, 2);
    }

    pasteJsonModal.style.display = 'flex';
    if (type === 'dept-bulk' || type === 'dept-indiv') {
      pasteJsonDeptSelect.focus();
    } else {
      pasteJsonKeyInput.focus();
    }
  }

  pasteJsonDeptSelect?.addEventListener('change', (e) => {
    if (e.target.value === '__NEW__') {
      pasteJsonDeptCustom.style.display = 'block';
      pasteJsonDeptCustom.focus();
    } else {
      pasteJsonDeptCustom.style.display = 'none';
    }
  });

  document.getElementById('btn-close-paste-json-modal')?.addEventListener('click', () => {
    pasteJsonModal.style.display = 'none';
  });
  document.getElementById('btn-cancel-paste-json-modal')?.addEventListener('click', () => {
    pasteJsonModal.style.display = 'none';
  });

  document.getElementById('btn-paste-clipboard')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        pasteJsonTextarea.value = text;
        showAlert('📋 Pasted content from clipboard!', 'info');
      } else {
        showAlert('Clipboard is empty.', 'warning');
      }
    } catch (err) {
      showAlert('Unable to read clipboard automatically. Please press Ctrl+V inside the text area.', 'info');
    }
  });

  document.getElementById('btn-confirm-paste-json-modal')?.addEventListener('click', () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonEditor.value);
    } catch (err) {
      showAlert('Current JSON editor content contains syntax errors.', 'error');
      return;
    }

    const key = pasteJsonKeyInput.value.trim();
    if (!key) {
      showAlert('Please enter a valid template key / index.', 'warning');
      return;
    }

    const rawJsonText = pasteJsonTextarea.value.trim();
    if (!rawJsonText) {
      showAlert('Please paste JSON content into the text area.', 'warning');
      return;
    }

    let insertedObj;
    try {
      insertedObj = JSON.parse(rawJsonText);
    } catch (err) {
      showAlert(`Pasted JSON contains syntax errors: ${err.message}`, 'error');
      return;
    }

    // Determine target department key if department action
    let deptKey = '';
    if (currentPasteActionType === 'dept-bulk' || currentPasteActionType === 'dept-indiv') {
      const selectedVal = pasteJsonDeptSelect.value;
      if (selectedVal === '__NEW__') {
        deptKey = pasteJsonDeptCustom.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!deptKey) {
          showAlert('Please enter a valid new department key.', 'warning');
          return;
        }
      } else {
        deptKey = selectedVal;
      }

      if (!parsed.departments) parsed.departments = {};
      if (!parsed.departments[deptKey]) {
        parsed.departments[deptKey] = {
          name: deptKey,
          aliases: [deptKey],
          templates: {}
        };
      }
    }

    // Perform injection according to action type
    if (currentPasteActionType === 'dept-bulk') {
      if (!parsed.departments[deptKey].templates) {
        parsed.departments[deptKey].templates = {};
      }
      parsed.departments[deptKey].templates[key] = insertedObj;
      showAlert(`➕ Added bulk template "${key}" to department "${deptKey}"!`, 'success');
    } else if (currentPasteActionType === 'dept-indiv') {
      if (!parsed.departments[deptKey].individualTemplates) {
        parsed.departments[deptKey].individualTemplates = {};
      }
      parsed.departments[deptKey].individualTemplates[key] = insertedObj;
      showAlert(`➕ Added individual template "${key}" to department "${deptKey}"!`, 'success');
    } else if (currentPasteActionType === 'bulk') {
      if (!parsed.defaultTemplates || typeof parsed.defaultTemplates !== 'object') {
        parsed.defaultTemplates = {};
      }
      parsed.defaultTemplates[key] = insertedObj;
      showAlert(`➕ Added bulk template "${key}" to default templates!`, 'success');
    } else if (currentPasteActionType === 'indiv') {
      if (!parsed.otPatientTemplates || typeof parsed.otPatientTemplates !== 'object') {
        parsed.otPatientTemplates = {};
      }
      parsed.otPatientTemplates[key] = insertedObj;
      showAlert(`➕ Added individual template override for "${key}"!`, 'success');
    }

    currentJsonData = parsed;
    jsonEditor.value = JSON.stringify(parsed, null, 2);
    validateJsonSyntax();
    renderVisualEditor();
    pasteJsonModal.style.display = 'none';
  });

  document.getElementById('btn-add-dept-bulk-template')?.addEventListener('click', () => {
    openPasteJsonModal('dept-bulk');
  });
  document.getElementById('btn-add-dept-indiv-template')?.addEventListener('click', () => {
    openPasteJsonModal('dept-indiv');
  });
  document.getElementById('btn-add-bulk-template')?.addEventListener('click', () => {
    openPasteJsonModal('bulk');
  });
  document.getElementById('btn-add-indiv-template')?.addEventListener('click', () => {
    openPasteJsonModal('indiv');
  });
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Discard any unsaved edits and reload from repository?')) {
      loadFileContent(currentFileKey);
    }
  });
  document.getElementById('btn-save-github')?.addEventListener('click', saveFileToGitHub);
  document.getElementById('btn-visual-save')?.addEventListener('click', saveFileToGitHub);

  fileSelector?.addEventListener('change', (e) => {
    loadFileContent(e.target.value);
  });

  jsonEditor?.addEventListener('input', () => {
    validateJsonSyntax();
  });

  // ── Initialization ──
  function initAdmin() {
    updateTokenStatusBadge();
    loadFileContent(currentFileKey);
  }

  // Start Auth verification
  checkAuth();
})();
