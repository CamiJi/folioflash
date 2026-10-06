const byId = (id) => document.getElementById(id);
const briefForm = byId('brief-form');
const briefInput = byId('brief-input');
const briefStatus = byId('brief-status');
const briefMessages = byId('brief-messages');
const attachmentInput = byId('image-input');
const attachmentStrip = byId('brief-attachments');
const composer = byId('brief-composer');
const sendButton = byId('brief-send');
const pendingFiles = [];
const pendingAssetIds = [];
let activeSite = null;
let busy = false;

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Ça n’a pas fonctionné. Réessaie.');
  return body;
}

function makeMessage(message) {
  const article = document.createElement('article');
  article.className = `message message--${message.role === 'user' ? 'user' : 'assistant'}`;
  article.textContent = message.content || '';
  if (message.attachments?.length) {
    const images = document.createElement('div');
    images.className = 'message-attachments';
    for (const attachment of message.attachments) {
      const image = document.createElement('img');
      image.src = `/api/sites/${encodeURIComponent(activeSite.id)}/assets/${encodeURIComponent(attachment.id)}`;
      image.alt = attachment.name ? `Image jointe : ${attachment.name}` : 'Image jointe au brief';
      image.loading = 'lazy';
      images.append(image);
    }
    article.append(images);
  }
  return article;
}

function renderMessages(messages) {
  briefMessages.replaceChildren(...messages.map(makeMessage));
  briefMessages.scrollTop = briefMessages.scrollHeight;
}

function drawPendingFiles() {
  attachmentStrip.replaceChildren();
  for (const [index, item] of pendingFiles.entries()) {
    const card = document.createElement('div');
    card.className = 'attachment';
    const image = document.createElement('img');
    image.src = item.preview;
    image.alt = `Aperçu : ${item.file.name}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Retirer ${item.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', async () => {
      if (item.asset && activeSite) {
        try {
          await api(`/api/sites/${encodeURIComponent(activeSite.id)}/assets/${encodeURIComponent(item.asset.id)}`, { method: 'DELETE' });
          activeSite.attachments = (activeSite.attachments ?? []).filter((asset) => asset.id !== item.asset.id);
          const index = pendingAssetIds.indexOf(item.asset.id);
          if (index >= 0) pendingAssetIds.splice(index, 1);
        } catch (error) {
          briefStatus.textContent = error.message;
          return;
        }
      }
      URL.revokeObjectURL(item.preview);
      pendingFiles.splice(index, 1);
      drawPendingFiles();
    });
    card.append(image, remove);
    attachmentStrip.append(card);
  }
}

function addFiles(fileList) {
  const files = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
  if (files.length !== fileList.length) briefStatus.textContent = 'Choisis des images JPG, PNG ou WebP.';
  const existing = activeSite?.attachments?.length ?? 0;
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      briefStatus.textContent = `${file.name} dépasse 5 Mo. Choisis une image plus légère.`;
      continue;
    }
    if (pendingFiles.length + existing >= 8) {
      briefStatus.textContent = 'Tu peux joindre 8 images au maximum.';
      break;
    }
    pendingFiles.push({ file, preview: URL.createObjectURL(file) });
  }
  drawPendingFiles();
  attachmentInput.value = '';
}

async function imageAsWebp(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 680 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Impossible de convertir cette image.')), 'image/webp', 0.7));
  if (blob.size > 700 * 1024) throw new Error(`${file.name} est encore trop volumineuse après optimisation.`);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}.`));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, width: canvas.width, height: canvas.height };
}

async function ensureDraft() {
  if (activeSite) return activeSite;
  activeSite = await api('/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return activeSite;
}

async function uploadPendingImages() {
  const uploaded = [];
  for (const item of pendingFiles) {
    let asset = item.asset;
    if (!asset) {
      const optimized = await imageAsWebp(item.file);
      asset = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/assets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: item.file.name, dataUrl: optimized.dataUrl, width: optimized.width, height: optimized.height }),
      });
      item.asset = asset;
      pendingAssetIds.push(asset.id);
    }
    uploaded.push({ id: asset.id, name: asset.name });
    activeSite.attachments ??= [];
    if (!activeSite.attachments.some((existing) => existing.id === asset.id)) activeSite.attachments.push(asset);
  }
  for (const item of pendingFiles) URL.revokeObjectURL(item.preview);
  pendingFiles.splice(0, pendingFiles.length);
  drawPendingFiles();
  return uploaded;
}

function renderBriefState(state) {
  activeSite = { ...activeSite, ...state.site };
  const isRebrief = Boolean(state.site.rebriefing);
  byId('site-panel').hidden = true;
  byId('brief-panel').hidden = false;
  byId('page-title').textContent = isRebrief ? 'Préparons une nouvelle version.' : 'On commence par parler de ton travail.';
  byId('page-description').textContent = isRebrief
    ? 'Ton site actuel reste en ligne pendant qu’on prépare la suite.'
    : 'Raconte-moi ce que tu fais, même en vrac. Je vais t’aider à trouver les bons éléments avant de créer ton portfolio.';
  byId('generation-note').textContent = isRebrief
    ? 'L’ancienne version reste en ligne jusqu’au build réussi.'
    : 'Ta première génération est offerte.';
  renderMessages(state.messages ?? []);
  byId('turn-count').textContent = state.ready ? 'Tu peux relire le résumé avant de créer ton site.' : 'Une question à la fois. « Je ne sais pas » ou « passe » sont des réponses possibles.';
  const ready = Boolean(state.ready);
  byId('brief-ready').hidden = !ready;
  byId('brief-summary-text').textContent = state.summary || '';
  byId('brief-image-consent').hidden = !(state.site.attachments?.length);
  byId('rebrief-warning').hidden = !isRebrief;
  byId('cancel-rebrief').hidden = !isRebrief;
  byId('generate-site').textContent = isRebrief ? 'Remplacer mon site par cette version' : 'Créer mon portfolio';
  briefInput.disabled = state.budgetReached || (state.turn >= state.limits.maxTurns && !ready);
  if (state.budgetReached) {
    briefStatus.textContent = 'Le budget de préparation est atteint. Le brief ne peut pas encore être généré.';
  } else if (state.turn >= state.limits.maxTurns && !ready) {
    briefStatus.textContent = 'On a atteint le nombre de réponses prévu, mais il manque encore des informations. Supprime ce brouillon et recommence avec les détails manquants dans ton premier message.';
    briefInput.placeholder = 'Rassemble les derniers détails dans une réponse : le résumé doit être assez précis pour créer le site.';
  } else briefStatus.textContent = '';
  if (ready) byId('generate-site').focus({ preventScroll: true });
}

async function sendBrief(event) {
  event.preventDefault();
  const message = briefInput.value.trim();
  if (!message && pendingFiles.length === 0) {
    briefInput.focus();
    return;
  }
  if (busy) return;
  busy = true;
  sendButton.disabled = true;
  briefStatus.textContent = 'Je prépare le brief…';
  try {
    await ensureDraft();
    await uploadPendingImages();
    const state = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/brief`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, assetIds: [...new Set(pendingAssetIds)] }),
    });
    pendingAssetIds.splice(0, pendingAssetIds.length);
    briefInput.value = '';
    renderBriefState(state);
  } catch (error) {
    briefStatus.textContent = error.message;
  } finally {
    busy = false;
    sendButton.disabled = briefInput.disabled;
    briefInput.focus();
  }
}

async function createPortfolio() {
  if (!activeSite || busy) return;
  busy = true;
  byId('generate-site').disabled = true;
  briefStatus.textContent = 'Je crée ton portfolio. Ça peut prendre une minute…';
  try {
    const site = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/v1`, { method: 'POST' });
    activeSite = { ...activeSite, ...site, status: 'live' };
    briefStatus.textContent = 'Ton portfolio est en ligne.';
    await showActiveSite(activeSite);
  } catch (error) {
    briefStatus.textContent = error.message;
    byId('generate-site').disabled = false;
  } finally {
    busy = false;
  }
}

function dictate(target, status) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    status.textContent = 'La dictée n’est pas disponible dans ce navigateur. Tu peux écrire ou coller ton texte.';
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.onresult = (event) => { target.value += `${target.value ? ' ' : ''}${event.results[0][0].transcript}`; };
  recognition.onerror = () => { status.textContent = 'La dictée a échoué. Réessaie ou écris ton message.'; };
  recognition.onend = () => { if (status.textContent === 'Je t’écoute…') status.textContent = ''; };
  recognition.start();
  status.textContent = 'Je t’écoute…';
}

async function showActiveSite(site) {
  byId('brief-panel').hidden = true;
  byId('site-panel').hidden = false;
  byId('page-title').textContent = 'Ton portfolio évolue avec toi.';
  byId('page-description').textContent = 'Dis-moi ce que tu veux changer. Une seule conversation, pas de menus compliqués.';
  byId('site-name').textContent = site.name;
  byId('site-credit-count').textContent = `${site.credits ?? 0} crédits`;
  byId('site-view').href = `/s/${encodeURIComponent(site.slug)}`;
  byId('start-rebrief').hidden = !site.canRebrief;
}

async function refresh() {
  try {
    const sites = await api('/api/sites');
    activeSite = sites[0] ?? null;
    if (!activeSite) return;
    if (activeSite.rebriefing) {
      const state = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/brief`);
      renderBriefState(state);
      return;
    }
    if (activeSite.status === 'live') {
      await showActiveSite(activeSite);
      return;
    }
    const state = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/brief`);
    renderBriefState(state);
  } catch (error) {
    briefStatus.textContent = error.message;
  }
}

briefForm.addEventListener('submit', sendBrief);
attachmentInput.addEventListener('change', () => addFiles(attachmentInput.files));
byId('brief-mic').addEventListener('click', () => dictate(briefInput, briefStatus));
byId('generate-site').addEventListener('click', createPortfolio);
byId('start-rebrief').addEventListener('click', async () => {
  if (!activeSite || busy) return;
  busy = true;
  try {
    const state = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/brief/start`, { method: 'POST' });
    renderBriefState(state);
    briefStatus.textContent = '';
    briefInput.focus();
  } catch (error) {
    byId('edit-status').textContent = error.message;
  } finally {
    busy = false;
  }
});
byId('cancel-rebrief').addEventListener('click', async () => {
  if (!activeSite || busy || !window.confirm('Garder le portfolio actuellement en ligne ?')) return;
  busy = true;
  try {
    const site = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/brief/cancel`, { method: 'POST' });
    activeSite = { ...activeSite, ...site, rebriefing: false };
    await showActiveSite(activeSite);
  } catch (error) {
    briefStatus.textContent = error.message;
  } finally {
    busy = false;
  }
});
composer.addEventListener('dragover', (event) => { event.preventDefault(); composer.classList.add('is-dragging'); });
composer.addEventListener('dragleave', (event) => { if (!composer.contains(event.relatedTarget)) composer.classList.remove('is-dragging'); });
composer.addEventListener('drop', (event) => {
  event.preventDefault();
  composer.classList.remove('is-dragging');
  addFiles(event.dataTransfer.files);
});

byId('edit-mic').addEventListener('click', () => dictate(byId('edit-input'), byId('edit-status')));
byId('edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeSite || busy || !byId('edit-input').value.trim()) return;
  busy = true;
  byId('edit-send').disabled = true;
  byId('edit-status').textContent = 'Je modifie ton portfolio…';
  try {
    const result = await api(`/api/sites/${encodeURIComponent(activeSite.id)}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: byId('edit-input').value.trim() }),
    });
    activeSite = { ...activeSite, ...result };
    byId('edit-input').value = '';
    byId('edit-status').textContent = `C’est en ligne. Il te reste ${result.credits ?? 0} crédits.`;
    byId('site-view').href = `/s/${encodeURIComponent(result.slug)}`;
    byId('site-credit-count').textContent = `${result.credits ?? 0} crédits`;
  } catch (error) {
    byId('edit-status').textContent = error.message;
  } finally {
    busy = false;
    byId('edit-send').disabled = false;
  }
});

byId('delete-site').addEventListener('click', async () => {
  if (!activeSite || !window.confirm('Supprimer définitivement ce portfolio ?')) return;
  try {
    await api(`/api/sites/${encodeURIComponent(activeSite.id)}`, { method: 'DELETE' });
    activeSite = null;
    byId('site-panel').hidden = true;
    byId('brief-panel').hidden = false;
    byId('page-title').textContent = 'On commence par parler de ton travail.';
    byId('page-description').textContent = 'Raconte-moi ce que tu fais, même en vrac. Je vais t’aider à trouver les bons éléments avant de créer ton portfolio.';
    briefStatus.textContent = 'Portfolio supprimé. La génération gratuite déjà utilisée ne revient pas.';
  } catch (error) {
    byId('edit-status').textContent = error.message;
  }
});

byId('logout').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/login'; }
});

refresh();
