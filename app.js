const MAX_FELT = (2n ** 251n) + (17n * (2n ** 192n)) + 1n;
const MAX_U128 = (2n ** 128n) - 1n;

const qs = (id) => document.getElementById(id);

function showToast(msg) {
  const t = qs('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1500);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHex(raw) {
  let s = String(raw).trim();
  if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
  if (!s) throw new Error('Empty hex input.');
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('Invalid hex input.');
  return s.length % 2 ? '0' + s : s;
}

function parseNumberish(raw) {
  const input = String(raw).trim();
  if (!input) throw new Error('No input provided.');

  if (input.startsWith('0x') || input.startsWith('0X')) {
    return { kind: 'hex', value: BigInt('0x' + normalizeHex(input)) };
  }

  if (/^[0-9]+$/.test(input)) {
    return { kind: 'decimal', value: BigInt(input) };
  }

  // short ASCII string => felt
  if (input.length > 31) throw new Error('String input too long (>31 chars).');
  const chars = [...input];
  if (!chars.every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) throw new Error('String input must be printable ASCII.');
  let hex = '';
  for (const ch of chars) hex += ch.charCodeAt(0).toString(16).padStart(2, '0');
  return { kind: 'string', value: BigInt('0x' + (hex || '00')) };
}

function validateFelt(v) {
  if (v < 0n) throw new Error('Negative values are not valid felt252.');
  if (v > MAX_FELT) throw new Error('Value exceeds felt252 field range.');
}

function toBytes(v) {
  let hex = v.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function bytesToAscii(bytes) {
  return bytes.map(b => String.fromCharCode(b)).join('');
}

function isPrintableAscii(s) {
  return [...s].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
}

function toHexPrefixed(v) {
  return '0x' + v.toString(16);
}

function copyText(text) {
  navigator.clipboard.writeText(String(text)).then(() => showToast('Copied'));
}

async function pasteInto(id, cb) {
  try {
    const txt = await navigator.clipboard.readText();
    qs(id).value = txt;
    if (cb) cb();
  } catch {
    showToast('Clipboard denied. Paste manually.');
  }
}

function renderKV(mountId, items) {
  qs(mountId).innerHTML = items.map(it =>
    `<div class="kv-item copyable" data-copy="${esc(it.value)}"><div class="label">${esc(it.label)}</div><div class="value ${it.error ? 'error' : ''}">${esc(it.value)}</div></div>`
  ).join('');
}

function wireCopyDelegation() {
  document.body.addEventListener('click', (e) => {
    const row = e.target.closest('.copyable');
    if (!row) return;
    const val = row.getAttribute('data-copy') || '';
    if (val) copyText(val);
  });
}

function runNumeric() {
  const raw = qs('numInput').value.trim();
  try {
    const parsed = parseNumberish(raw);
    const n = parsed.value;
    renderKV('numOut', [
      { label: 'input type', value: parsed.kind },
      { label: 'decimal', value: n.toString(10) },
      { label: 'hex', value: toHexPrefixed(n) },
      { label: 'binary', value: '0b' + n.toString(2) }
    ]);
  } catch (e) {
    renderKV('numOut', [{ label: 'error', value: e.message, error: true }]);
  }
}

function textToHexAndDec() {
  const txt = qs('txtInput').value;
  if (!txt) return renderKV('txtOut', [{ label: 'error', value: 'No text provided.', error: true }]);
  const bytes = new TextEncoder().encode(txt);
  const hexLower = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const hexUpper = hexLower.toUpperCase();
  const dec = BigInt('0x' + (hexLower || '00')).toString(10);
  renderKV('txtOut', [
    { label: 'ascii text', value: txt },
    { label: 'hex (lower)', value: hexLower },
    { label: 'hex (upper)', value: hexUpper },
    { label: 'decimal bigint', value: dec }
  ]);
}

function hexToTextAndDec() {
  const raw = qs('hexInput').value;
  try {
    const clean = normalizeHex(raw);
    const bytes = clean.match(/.{1,2}/g).map(h => parseInt(h, 16));
    const txt = bytesToAscii(bytes);
    const dec = BigInt('0x' + clean).toString(10);
    renderKV('hexOut', [
      { label: 'ascii text', value: txt, error: !isPrintableAscii(txt) },
      { label: 'decimal bigint', value: dec },
      { label: 'hex normalized', value: clean }
    ]);
  } catch (e) {
    renderKV('hexOut', [{ label: 'error', value: e.message, error: true }]);
  }
}

function decodeFeltValue(raw) {
  const parsed = parseNumberish(raw);
  validateFelt(parsed.value);
  const bytes = toBytes(parsed.value);
  const str = bytesToAscii(bytes);
  if (!isPrintableAscii(str)) throw new Error('Contains non-printable bytes. Not a Cairo short string felt.');
  return { str, hex: toHexPrefixed(parsed.value), dec: parsed.value.toString(10), bytes };
}

function runDecode() {
  const raw = qs('decodeInput').value;
  const box = qs('decodeResult');
  try {
    const out = decodeFeltValue(raw);
    box.innerHTML = `<div class="label">decoded string</div><div class="value">${esc(out.str)}</div><div class="muted">hex: ${esc(out.hex)} · bytes: ${out.bytes.length}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="value error">${esc(e.message)}</div>`;
  }
}

function runUint() {
  const raw = qs('uInput').value;
  try {
    const parsed = parseNumberish(raw);
    validateFelt(parsed.value);
    const n = parsed.value;
    const low = n & MAX_U128;
    const high = n >> 128n;
    renderKV('uOut', [
      { label: 'low (dec)', value: low.toString(10) },
      { label: 'high (dec)', value: high.toString(10) },
      { label: 'low (hex)', value: toHexPrefixed(low) },
      { label: 'high (hex)', value: toHexPrefixed(high) }
    ]);
  } catch (e) {
    renderKV('uOut', [{ label: 'error', value: e.message, error: true }]);
  }
}

function runBatch() {
  const lines = qs('batchInput').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) {
    qs('batchResult').innerHTML = '<div class="muted">Add one felt per line.</div>';
    return;
  }
  const html = lines.map((line, i) => {
    try {
      const out = decodeFeltValue(line);
      return `<div><span class="label">#${i + 1}</span> <span class="value">${esc(out.str)}</span></div>`;
    } catch (e) {
      return `<div><span class="label">#${i + 1}</span> <span class="value error">${esc(e.message)}</span></div>`;
    }
  }).join('');
  qs('batchResult').innerHTML = html;
}

function runCalldata() {
  const toks = qs('calldataInput').value.split(/[\n,\s]+/).map(x => x.trim()).filter(Boolean);
  if (!toks.length) {
    qs('calldataResult').innerHTML = '<div class="muted">Paste values first.</div>';
    return;
  }
  const html = toks.map((tok, i) => {
    try {
      const p = parseNumberish(tok);
      validateFelt(p.value);
      const ascii = bytesToAscii(toBytes(p.value));
      return `<div><span class="label">[${i}]</span> <span class="muted">${esc(tok)}</span> → <span class="value">${esc(isPrintableAscii(ascii) ? ascii : 'non-printable')}</span></div>`;
    } catch {
      return `<div><span class="label">[${i}]</span> <span class="muted">${esc(tok)}</span> → <span class="value error">invalid</span></div>`;
    }
  }).join('');
  qs('calldataResult').innerHTML = html;
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  qs('panel-' + name).classList.add('active');
}

function renderQuickNumeric() {
  const tests = [
    { label: '0xf4240 → 1000000', value: '0xf4240' },
    { label: '0x2710 → 10000', value: '0x2710' },
    { label: '0x1388 → 5000', value: '0x1388' },
    { label: '0xf423f → 999999', value: '0xf423f' }
  ];
  qs('quickNumeric').innerHTML = tests.map(t => `<div class="quick-item" data-val="${t.value}">${esc(t.label)}</div>`).join('');
  qs('quickNumeric').addEventListener('click', (e) => {
    const item = e.target.closest('.quick-item');
    if (!item) return;
    qs('numInput').value = item.getAttribute('data-val');
    runNumeric();
  });
}

function bind() {
  wireCopyDelegation();

  qs('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  qs('numRun').addEventListener('click', runNumeric);
  qs('numPaste').addEventListener('click', () => pasteInto('numInput', runNumeric));

  qs('txtRun').addEventListener('click', textToHexAndDec);
  qs('txtPaste').addEventListener('click', () => pasteInto('txtInput', textToHexAndDec));

  qs('hexRun').addEventListener('click', hexToTextAndDec);
  qs('hexPaste').addEventListener('click', () => pasteInto('hexInput', hexToTextAndDec));

  qs('decodeRun').addEventListener('click', runDecode);
  qs('decodePaste').addEventListener('click', () => pasteInto('decodeInput', runDecode));
  qs('decodeClear').addEventListener('click', () => {
    qs('decodeInput').value = '';
    qs('decodeResult').innerHTML = '<div class="muted">Paste a felt and decode short string.</div>';
  });

  qs('uRun').addEventListener('click', runUint);
  qs('uPaste').addEventListener('click', () => pasteInto('uInput', runUint));

  qs('batchRun').addEventListener('click', runBatch);
  qs('batchPaste').addEventListener('click', () => pasteInto('batchInput', runBatch));

  qs('calldataRun').addEventListener('click', runCalldata);

  renderQuickNumeric();

  // seed your examples
  qs('txtInput').value = 'Dave';
  textToHexAndDec();
  qs('hexInput').value = '44415645';
  hexToTextAndDec();
}

bind();
