import './style.css';
import { TaskClient, textPart } from '@blocks-network/sdk';

const AGENT_NAME = '5090_gemma_4';
const BILLING_MODE = 'paid';
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
};

function save() {
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(state.conversations));
  localStorage.setItem(STORAGE_KEYS.activeId, state.activeId || '');
}

function ensureClient() {
  if (!state.apiKey) return null;
  if (state.client) return state.client;
  return null; // created lazily in send()
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
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.conversations.length === 0
      ? 'no conversations yet — paste your API key above and start a new chat.'
      : 'pick a conversation from the sidebar, or start a new one.';
    els.messages.appendChild(empty);
    return;
  }
  for (const m of c.messages) renderMessage(m);
  els.messages.scrollTop = els.messages.scrollHeight;
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
  const body = document.createElement('div');
  body.textContent = m.content;
  div.appendChild(body);
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return div;
}

function pushSystemMessage(text) {
  const c = activeConv();
  if (!c) return;
  c.messages.push({ role: 'system', content: text, ts: Date.now() });
  renderMessage({ role: 'system', content: text });
  save();
}

function setBusy(b) {
  state.busy = b;
  els.send.disabled = b || !state.apiKey || !els.prompt.value.trim();
  els.prompt.disabled = b;
}

async function sendPrompt(promptText) {
  let c = activeConv();
  if (!c) { newConversation(); c = activeConv(); }

  const userMsg = { role: 'user', content: promptText, ts: Date.now() };
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
    const session = await client.sendMessage({
      agentName: AGENT_NAME,
      requestParts: [textPart(JSON.stringify({ prompt: promptText, max_tokens: state.maxTokens }))],
    });

    const terminal = await session.waitForTerminal(120_000);
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
    thinkingEl.querySelector('div:last-child').textContent = replyText;
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
  els.send.disabled = !state.apiKey || !els.prompt.value.trim();
});

els.maxTokens.addEventListener('input', (e) => {
  state.maxTokens = parseInt(e.target.value, 10);
  els.mtVal.textContent = state.maxTokens;
  localStorage.setItem(STORAGE_KEYS.maxTokens, state.maxTokens.toString());
});

els.newChat.addEventListener('click', newConversation);

els.prompt.addEventListener('input', () => {
  els.send.disabled = state.busy || !state.apiKey || !els.prompt.value.trim();
});

els.prompt.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    els.composer.requestSubmit();
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
  if (!text || state.busy) return;
  if (!state.apiKey) {
    flashKeyStatus('← paste your Blocks API key first');
    els.apiKey.focus();
    return;
  }
  els.prompt.value = '';
  sendPrompt(text);
});

renderConvList();
renderMessages();
els.send.disabled = !state.apiKey;
