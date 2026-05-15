import './style.css';
import { TaskClient, textPart } from '@blocks-network/sdk';

const AGENT_NAME = '5090_gemma_4';
const BILLING_MODE = 'paid';
const MAX_IMAGES = 3;
const DOWNSCALE_LONG_EDGE = 1280;
const STORAGE_KEYS = {
  apiKey: 'gemma:apiKey',
  maxTokens: 'gemma:maxTokens',
  conversations: 'gemma:conversations',
  activeId: 'gemma:activeId',
};

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) || '',
  maxTokens: parseInt(localStorage.getItem(STORAGE_KEYS.maxTokens) || '1024', 10),
  conversations: JSON.parse(localStorage.getItem(STORAGE_KEYS.conversations) || '[]'),
  activeId: localStorage.getItem(STORAGE_KEYS.activeId) || null,
  pendingImages: [],
  client: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);
const els = {
  apiKey: $('apiKey'),
  saveKey: $('saveKey'),
  keyStatus: $('keyStatus'),
  newChat: $('newChat'),
  convList: $('convList'),
  maxTokens: $('maxTokens'),
  mtVal: $('mtVal'),
  messages: $('messages'),
  composer: $('composer'),
  prompt: $('prompt'),
  send: $('send'),
  composerHint: $('composerHint'),
  attach: $('attach'),
  fileInput: $('fileInput'),
  imagePreview: $('imagePreview'),
};

function save() {
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(state.conversations));
  localStorage.setItem(STORAGE_KEYS.activeId, state.activeId || '');
}

async function getClient() {
  if (state.client) return state.client;
  state.client = await TaskClient.create({
    billingMode: BILLING_MODE,
    apiKey: state.apiKey,
    onAuthError: (err) => {
      pushSystemMessage(`auth failed: ${err.message}`);
      state.client = null;
    },
  });
  return state.client;
}

function activeConv() {
  return state.conversations.find((c) => c.id === state.activeId);
}

function newConversation() {
  const c = { id: crypto.randomUUID(), title: 'new chat', messages: [], createdAt: Date.now() };
  state.conversations.unshift(c);
  state.activeId = c.id;
  save();
  renderConvList();
  renderMessages();
  els.prompt.focus();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter((c) => c.id !== id);
  if (state.activeId === id) {
    state.activeId = state.conversations[0]?.id || null;
  }
  save();
  renderConvList();
  renderMessages();
}

function renderConvList() {
  els.convList.innerHTML = '';
  for (const c of state.conversations) {
    const li = document.createElement('li');
    if (c.id === state.activeId) li.classList.add('active');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = c.title;
    title.onclick = () => {
      state.activeId = c.id;
      save();
      renderConvList();
      renderMessages();
    };
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'delete';
    del.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`delete "${c.title}"?`)) deleteConversation(c.id);
    };
    li.appendChild(title);
    li.appendChild(del);
    els.convList.appendChild(li);
  }
}

function renderMessages() {
  const c = activeConv();
  els.messages.innerHTML = '';
  if (!c) {
    if (state.conversations.length === 0 && !state.apiKey) {
      els.messages.appendChild(renderWelcome());
    } else if (state.conversations.length === 0) {
      els.messages.appendChild(renderReadyState());
    } else {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'pick a conversation from the sidebar, or start a new one.';
      els.messages.appendChild(e);
    }
    return;
  }
  for (const m of c.messages) renderMessage(m);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderWelcome() {
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = `
    <h2>Welcome to Gemma on a 5090</h2>
    <p class="lead">Chat with <strong>Gemma 4</strong> (Google's 26B-parameter model) running on an NVIDIA 5090 GPU at a desk in the UK.</p>
    <ol>
      <li>Sign up at <a href="https://app.blocks.ai" target="_blank" rel="noopener">app.blocks.ai</a> and grab your API key.</li>
      <li>Paste it into the field at the top of this page and click <strong>save</strong>.</li>
      <li>Click <strong>+ new chat</strong> in the sidebar and start asking. <strong>First 3 messages free</strong>, then <strong>$0.01</strong> each.</li>
    </ol>
    <p class="muted small">
      You can paste or drop images into the chat — Gemma can see them.<br />
      Your API key and chat history live in this browser only.
    </p>
  `;
  return w;
}

function renderReadyState() {
  const w = document.createElement('div');
  w.className = 'welcome';
  w.innerHTML = `
    <h2>You're set up.</h2>
    <p class="lead">Click <strong>+ new chat</strong> in the sidebar to start.</p>
    <p class="muted small">Tip: paste or drop images straight into the chat — Gemma can see them.</p>
  `;
  return w;
}

function renderMessage(m) {
  const div = document.createElement('div');
  div.className = `msg ${m.role}`;
  if (m.thinking) div.classList.add('thinking');
  if (m.role !== 'system') {
    const role = document.createElement('div');
    role.className = 'role';
    role.textContent = m.role;
    div.appendChild(role);
  }
  if (m.images && m.images.length) {
    const gallery = document.createElement('div');
    gallery.className = 'gallery';
    for (const b64 of m.images) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${b64}`;
      img.alt = 'attached image';
      gallery.appendChild(img);
    }
    div.appendChild(gallery);
  }
  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = m.content;
  div.appendChild(body);
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return div;
}

function pushSystemMessage(text) {
  const c = activeConv();
  if (!c) {
    newConversation();
  }
  const conv = activeConv();
  conv.messages.push({ role: 'system', content: text, ts: Date.now() });
  renderMessage({ role: 'system', content: text });
  save();
}

function setBusy(b) {
  state.busy = b;
  els.send.disabled = b || !state.apiKey || !els.prompt.value.trim();
  els.prompt.disabled = b;
  els.attach.disabled = b;
}

// ---- image handling ----

async function fileToDownscaledBase64(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('not an image');
  }
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > DOWNSCALE_LONG_EDGE ? DOWNSCALE_LONG_EDGE / longEdge : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function addImagesFromFiles(files) {
  for (const f of Array.from(files || [])) {
    if (state.pendingImages.length >= MAX_IMAGES) {
      pushSystemMessage(`max ${MAX_IMAGES} images per message; ignored extras`);
      break;
    }
    try {
      const b64 = await fileToDownscaledBase64(f);
      state.pendingImages.push(b64);
    } catch (err) {
      pushSystemMessage(`couldn't add image: ${err.message || err}`);
    }
  }
  renderImagePreview();
  updateSendEnabled();
}

function renderImagePreview() {
  els.imagePreview.innerHTML = '';
  for (let i = 0; i < state.pendingImages.length; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb';
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${state.pendingImages[i]}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = 'remove';
    x.onclick = () => {
      state.pendingImages.splice(i, 1);
      renderImagePreview();
      updateSendEnabled();
    };
    wrap.appendChild(img);
    wrap.appendChild(x);
    els.imagePreview.appendChild(wrap);
  }
}

function updateSendEnabled() {
  const hasContent = els.prompt.value.trim() || state.pendingImages.length > 0;
  els.send.disabled = state.busy || !state.apiKey || !hasContent;
}

// ---- send ----

async function sendPrompt(promptText, images) {
  let c = activeConv();
  if (!c) { newConversation(); c = activeConv(); }

  const userMsg = { role: 'user', content: promptText, ts: Date.now(), images };
  c.messages.push(userMsg);
  renderMessage(userMsg);

  if (c.messages.filter((m) => m.role === 'user').length === 1) {
    c.title = promptText.slice(0, 40).replace(/\s+/g, ' ').trim() || 'new chat';
    renderConvList();
  }
  save();

  const thinking = { role: 'assistant', content: '…', ts: Date.now(), thinking: true };
  const thinkingEl = renderMessage(thinking);

  setBusy(true);
  try {
    const client = await getClient();
    const payload = { prompt: promptText, max_tokens: state.maxTokens };
    if (images && images.length) payload.images = images;
    const session = await client.sendMessage({
      agentName: AGENT_NAME,
      requestParts: [textPart(JSON.stringify(payload), 'request')],
    });

    const terminal = await session.waitForTerminal(180_000);
    if (terminal.state !== 'completed') {
      throw new Error(`task ended in state: ${terminal.state}`);
    }

    const artifacts = session.listArtifacts();
    if (artifacts.length === 0) throw new Error('agent returned no artifact');
    const downloaded = await session.downloadArtifact(artifacts[0]);
    const text = new TextDecoder().decode(downloaded.data);
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { text }; }

    const replyText = parsed.error ? `error: ${parsed.error}` : (parsed.text ?? text);
    thinkingEl.classList.remove('thinking');
    thinkingEl.querySelector('div.body').textContent = replyText;
    c.messages.push({ role: 'assistant', content: replyText, ts: Date.now() });
    save();

    try { session.close(); } catch {}
  } catch (err) {
    thinkingEl.remove();
    pushSystemMessage(`request failed: ${err.message || err}`);
    c.messages.pop();
  } finally {
    setBusy(false);
  }
}

// ---- event wiring ----

els.apiKey.value = state.apiKey;
els.keyStatus.textContent = state.apiKey ? 'saved' : '';
els.maxTokens.value = state.maxTokens;
els.mtVal.textContent = state.maxTokens;

els.saveKey.addEventListener('click', () => {
  state.apiKey = els.apiKey.value.trim();
  localStorage.setItem(STORAGE_KEYS.apiKey, state.apiKey);
  els.keyStatus.textContent = state.apiKey ? 'saved' : 'cleared';
  if (state.client) { try { state.client.destroy(); } catch {} state.client = null; }
  updateSendEnabled();
  renderMessages();
});

els.maxTokens.addEventListener('input', (e) => {
  state.maxTokens = parseInt(e.target.value, 10);
  els.mtVal.textContent = state.maxTokens;
  localStorage.setItem(STORAGE_KEYS.maxTokens, state.maxTokens.toString());
});

els.newChat.addEventListener('click', newConversation);

els.prompt.addEventListener('input', updateSendEnabled);

els.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    els.composer.requestSubmit();
  }
});

els.prompt.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    addImagesFromFiles(files);
  }
});

els.attach.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', (e) => {
  addImagesFromFiles(e.target.files);
  e.target.value = '';
});

document.body.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    e.preventDefault();
    document.body.classList.add('drag-over');
  }
});
document.body.addEventListener('dragleave', (e) => {
  if (e.target === document.body) document.body.classList.remove('drag-over');
});
document.body.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files.length) {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    addImagesFromFiles(e.dataTransfer.files);
  }
});

function flashKeyStatus(msg) {
  els.keyStatus.textContent = msg;
  els.keyStatus.style.color = 'var(--accent-2)';
  setTimeout(() => {
    els.keyStatus.style.color = '';
    els.keyStatus.textContent = state.apiKey ? 'saved' : '';
  }, 3000);
}

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.prompt.value.trim();
  const imgs = state.pendingImages.slice();
  if (!text && imgs.length === 0) return;
  if (state.busy) return;
  if (!state.apiKey) {
    flashKeyStatus('← paste your Blocks API key first');
    els.apiKey.focus();
    return;
  }
  els.prompt.value = '';
  state.pendingImages = [];
  renderImagePreview();
  sendPrompt(text || '(no prompt)', imgs);
});

renderConvList();
renderMessages();
updateSendEnabled();
