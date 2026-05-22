const MAX_FELT = (2n ** 251n) + (17n * (2n ** 192n)) + 1n;
const MAX_U128 = (2n ** 128n) - 1n;
const TWO_251 = 2n ** 251n;

const qs = (id) => document.getElementById(id);

function showToast(msg) { const t = qs('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1500); }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function toHex(v) { return '0x' + BigInt(v).toString(16); }

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
  if (input.startsWith('0x') || input.startsWith('0X')) return { kind: 'hex', value: BigInt('0x' + normalizeHex(input)) };
  if (/^[0-9]+$/.test(input)) return { kind: 'decimal', value: BigInt(input) };
  if (input.length > 31) throw new Error('String input too long (>31 chars).');
  if (![...input].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) throw new Error('String input must be printable ASCII.');
  const hx = [...input].map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  return { kind: 'string', value: BigInt('0x' + (hx || '00')) };
}

function validateFelt(v) { if (v < 0n) throw new Error('Negative values are not valid felt252.'); if (v > MAX_FELT) throw new Error('Value exceeds felt252 field range.'); }
function toBytes(v) { let h = BigInt(v).toString(16); if (h.length % 2) h = '0' + h; const out = []; for (let i=0;i<h.length;i+=2) out.push(parseInt(h.slice(i,i+2),16)); return out; }
function bytesToAscii(b) { return b.map(x => String.fromCharCode(x)).join(''); }
function isPrintableAscii(s) { return [...s].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126); }
function parseTokenList(raw) { return String(raw).split(/[\n,\s]+/).map(x=>x.trim()).filter(Boolean); }

function renderKV(mountId, items) {
  qs(mountId).innerHTML = items.map(it => `<div class="kv-item copyable" data-copy="${esc(it.value)}"><div class="label">${esc(it.label)}</div><div class="value ${it.error ? 'error':''}">${esc(it.value)}</div></div>`).join('');
}
function copyText(text) { navigator.clipboard.writeText(String(text)).then(() => showToast('Copied')); }
async function pasteInto(id, cb) { try { qs(id).value = await navigator.clipboard.readText(); if (cb) cb(); } catch { showToast('Clipboard denied. Paste manually.'); } }

document.body.addEventListener('click', (e) => {
  const row = e.target.closest('.copyable');
  if (row && row.getAttribute('data-copy')) copyText(row.getAttribute('data-copy'));
});

function keccak256Hex(input) {
  if (typeof keccak_256 !== 'function') throw new Error('keccak library failed to load.');
  return keccak_256(input);
}

async function selectorFromName(name) {
  const h = keccak256Hex(name);
  const v = BigInt('0x' + h) % TWO_251;
  return { hex: toHex(v), dec: v.toString(10), rawKeccak: '0x' + h };
}

function parseAbi(jsonRaw) {
  const abi = JSON.parse(jsonRaw);
  if (!Array.isArray(abi)) throw new Error('ABI must be a JSON array.');
  return abi;
}

function findFnInAbi(abi, fnName) {
  const fns = abi.filter(x => x && x.type === 'function' && x.name === fnName);
  if (!fns.length) throw new Error('Function not found in ABI: ' + fnName);
  return fns[0];
}

function normType(t) {
  const s = String(t || '').replace(/\s+/g,'');
  if (s === 'felt' || s === 'felt252' || s === 'core::felt252') return 'felt252';
  if (s === 'bool' || s.endsWith('::bool')) return 'bool';
  if (s.toLowerCase().includes('u256')) return 'u256';
  if (s.toLowerCase().includes('contractaddress')) return 'contractaddress';
  if (s.endsWith('*') || s.startsWith('Array<') || s.startsWith('core::array::Array<')) return 'array';
  return s;
}

function arrayInnerType(t) {
  const s = String(t).replace(/\s+/g,'');
  if (s.endsWith('*')) return s.slice(0,-1);
  const m = s.match(/Array<(.*)>$/);
  if (m) return m[1];
  const m2 = s.match(/core::array::Array<(.*)>$/);
  return m2 ? m2[1] : 'felt252';
}

function encodeOneValue(type, value) {
  const nt = normType(type);
  if (nt === 'felt252' || nt === 'contractaddress') {
    const v = parseNumberish(String(value)).value;
    validateFelt(v);
    return [v];
  }
  if (nt === 'bool') return [value ? 1n : 0n];
  if (nt === 'u256') {
    if (typeof value === 'object' && value && value.low !== undefined && value.high !== undefined) {
      return [BigInt(value.low), BigInt(value.high)];
    }
    const v = parseNumberish(String(value)).value;
    return [v & MAX_U128, v >> 128n];
  }
  if (nt === 'array') {
    if (!Array.isArray(value)) throw new Error('Expected array value.');
    const inner = arrayInnerType(type);
    const out = [BigInt(value.length)];
    for (const item of value) out.push(...encodeOneValue(inner, item));
    return out;
  }
  throw new Error('Unsupported ABI type: ' + type);
}

function decodeOneValue(type, felts, offsetRef) {
  const nt = normType(type);
  const take = () => {
    if (offsetRef.i >= felts.length) throw new Error('Not enough return felts.');
    return felts[offsetRef.i++];
  };

  if (nt === 'felt252' || nt === 'contractaddress') {
    const v = take();
    return { value: toHex(v), raw: v.toString(10) };
  }
  if (nt === 'bool') {
    const v = take();
    return { value: v !== 0n, raw: v.toString(10) };
  }
  if (nt === 'u256') {
    const low = take();
    const high = take();
    return { low: low.toString(10), high: high.toString(10), bigint: (low + (high << 128n)).toString(10) };
  }
  if (nt === 'array') {
    const inner = arrayInnerType(type);
    const len = Number(take());
    const arr = [];
    for (let k=0;k<len;k++) arr.push(decodeOneValue(inner, felts, offsetRef));
    return arr;
  }
  throw new Error('Unsupported ABI type: ' + type);
}

function stringifyPretty(obj) { return JSON.stringify(obj, null, 2); }

function decodeFeltValue(raw) {
  const parsed = parseNumberish(raw);
  validateFelt(parsed.value);
  const str = bytesToAscii(toBytes(parsed.value));
  if (!isPrintableAscii(str)) throw new Error('Contains non-printable bytes. Not a Cairo short string felt.');
  return { str, hex: toHex(parsed.value), dec: parsed.value.toString(10) };
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  qs('panel-' + name).classList.add('active');
}

async function runSelector() {
  try {
    const name = qs('selectorName').value.trim();
    if (!name) throw new Error('Function name required.');
    const s = await selectorFromName(name);
    renderKV('selectorOut', [
      { label: 'function name', value: name },
      { label: 'selector (hex)', value: s.hex },
      { label: 'selector (dec)', value: s.dec },
      { label: 'keccak256(text)', value: s.rawKeccak }
    ]);
  } catch (e) {
    renderKV('selectorOut', [{ label: 'error', value: e.message, error: true }]);
  }
}

async function runSelectorLookup() {
  const out = qs('selectorLookupOut');
  try {
    const abi = parseAbi(qs('selectorAbi').value);
    const needle = parseNumberish(qs('selectorNeedle').value).value;
    const fns = abi.filter(x => x && x.type === 'function' && x.name);
    const matches = [];
    for (const fn of fns) {
      const s = await selectorFromName(fn.name);
      if (BigInt(s.dec) === needle) matches.push(fn.name);
    }
    out.innerHTML = matches.length ? `<div class="value">${matches.map(esc).join(', ')}</div>` : '<div class="muted">No function matched.</div>';
  } catch (e) {
    out.innerHTML = `<div class="value error">${esc(e.message)}</div>`;
  }
}

function runAbiEncode() {
  const out = qs('abiEncodeOut');
  try {
    const abi = parseAbi(qs('abiJson').value);
    const fn = findFnInAbi(abi, qs('abiFn').value.trim());
    const argsObj = JSON.parse(qs('abiArgs').value || '{}');
    const inputs = fn.inputs || [];
    const calldata = [];
    for (const inp of inputs) {
      if (!(inp.name in argsObj)) throw new Error('Missing arg: ' + inp.name);
      calldata.push(...encodeOneValue(inp.type, argsObj[inp.name]));
    }
    const dec = calldata.map(x => x.toString(10));
    const hex = calldata.map(x => toHex(x));
    out.innerHTML = `<div class="label">Calldata (decimal)</div><div class="value">${esc(dec.join(', '))}</div><br/><div class="label">Calldata (hex)</div><div class="value">${esc(hex.join(', '))}</div><br/><div class="label">sncast args</div><div class="value">${esc(dec.join(' '))}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="value error">${esc(e.message)}</div>`;
  }
}

function runAbiDecode() {
  const out = qs('abiDecodeOut');
  try {
    const abi = parseAbi(qs('abiDecodeJson').value);
    const fn = findFnInAbi(abi, qs('abiDecodeFn').value.trim());
    const felts = parseTokenList(qs('abiReturnData').value).map(t => parseNumberish(t).value);
    const outputs = fn.outputs || [];
    const idx = { i: 0 };
    const res = {};
    outputs.forEach((o, n) => {
      const key = o.name || `out_${n}`;
      res[key] = decodeOneValue(o.type, felts, idx);
    });
    out.innerHTML = `<pre class="muted">${esc(stringifyPretty(res))}</pre>`;
  } catch (e) {
    out.innerHTML = `<div class="value error">${esc(e.message)}</div>`;
  }
}

function runU256Split() {
  try {
    const n = parseNumberish(qs('u256Big').value).value;
    renderKV('u256SplitOut', [
      { label: 'low (dec)', value: (n & MAX_U128).toString(10) },
      { label: 'high (dec)', value: (n >> 128n).toString(10) },
      { label: 'low (hex)', value: toHex(n & MAX_U128) },
      { label: 'high (hex)', value: toHex(n >> 128n) },
    ]);
  } catch (e) { renderKV('u256SplitOut', [{ label:'error', value:e.message, error:true }]); }
}

function runU256Pack() {
  try {
    const low = parseNumberish(qs('u256Low').value).value;
    const high = parseNumberish(qs('u256High').value).value;
    const n = low + (high << 128n);
    renderKV('u256PackOut', [
      { label: 'bigint (dec)', value: n.toString(10) },
      { label: 'bigint (hex)', value: toHex(n) },
    ]);
  } catch (e) { renderKV('u256PackOut', [{ label:'error', value:e.message, error:true }]); }
}

function runByteArrayEncode() {
  const out = qs('baEncodeOut');
  try {
    const txt = qs('baText').value;
    const bytes = Array.from(new TextEncoder().encode(txt));
    const fullWords = Math.floor(bytes.length / 31);
    const pendingLen = bytes.length % 31;
    const words = [];
    for (let i=0;i<fullWords;i++) {
      const chunk = bytes.slice(i*31, (i+1)*31);
      const hex = chunk.map(b=>b.toString(16).padStart(2,'0')).join('');
      words.push(BigInt('0x'+hex));
    }
    const pending = bytes.slice(fullWords*31);
    const pendingHex = pending.map(b=>b.toString(16).padStart(2,'0')).join('') || '00';
    const pendingWord = BigInt('0x'+pendingHex);

    const felts = [BigInt(fullWords), ...words, pendingWord, BigInt(pendingLen)];
    out.innerHTML = `<div class="label">ByteArray felts</div><div class="value">${esc(felts.map(x=>x.toString(10)).join(', '))}</div>`;
  } catch (e) { out.innerHTML = `<div class="value error">${esc(e.message)}</div>`; }
}

function runByteArrayDecode() {
  const out = qs('baDecodeOut');
  try {
    const felts = parseTokenList(qs('baFelts').value).map(t => parseNumberish(t).value);
    if (felts.length < 3) throw new Error('Need at least len, pending_word, pending_len.');
    const len = Number(felts[0]);
    const expected = 1 + len + 2;
    if (felts.length !== expected) throw new Error(`Expected ${expected} felts based on len=${len}.`);

    const words = felts.slice(1, 1+len);
    const pendingWord = felts[1+len];
    const pendingLen = Number(felts[2+len]);
    const bytes = [];
    words.forEach(w => {
      let h = w.toString(16).padStart(62, '0');
      for (let i=0;i<h.length;i+=2) bytes.push(parseInt(h.slice(i,i+2),16));
    });
    let ph = pendingWord.toString(16);
    if (ph.length % 2) ph = '0'+ph;
    const pBytes = ph.match(/.{1,2}/g)?.map(x=>parseInt(x,16)) || [];
    const tail = pBytes.slice(-pendingLen);
    bytes.push(...tail);

    const txt = new TextDecoder().decode(new Uint8Array(bytes));
    out.innerHTML = `<div class="value">${esc(txt)}</div>`;
  } catch (e) { out.innerHTML = `<div class="value error">${esc(e.message)}</div>`; }
}

function runAddrNormalize() {
  try {
    const v = parseNumberish(qs('addrInput').value).value;
    validateFelt(v);
    renderKV('addrNormOut', [
      { label: 'decimal', value: v.toString(10) },
      { label: 'hex (0x)', value: toHex(v) },
      { label: 'hex padded 64', value: '0x' + v.toString(16).padStart(64,'0') }
    ]);
  } catch (e) { renderKV('addrNormOut', [{label:'error', value:e.message, error:true}]); }
}

async function runEventDecode() {
  const out = qs('eventDecodeOut');
  try {
    const abi = parseAbi(qs('eventAbi').value);
    const keys = parseTokenList(qs('eventKeys').value).map(t => parseNumberish(t).value);
    const data = parseTokenList(qs('eventData').value).map(t => parseNumberish(t).value);
    const eventNameInput = qs('eventName').value.trim();

    const events = abi.filter(x => x && x.type === 'event' && x.name);
    if (!events.length) throw new Error('No events found in ABI.');

    let ev = null;
    if (eventNameInput) ev = events.find(e => e.name === eventNameInput);
    if (!ev && keys.length) {
      for (const cand of events) {
        const s = await selectorFromName(cand.name);
        if (BigInt(s.dec) === keys[0]) { ev = cand; break; }
      }
    }
    if (!ev) throw new Error('Could not identify event. Provide event name or selector key.');

    const allParams = ev.inputs || [];
    const keyParams = allParams.filter(p => p.kind === 'key' || p.indexed === true);
    const dataParams = allParams.filter(p => !(p.kind === 'key' || p.indexed === true));

    const keyStream = keys.length ? keys.slice(1) : [];
    const keyIdx = { i: 0 };
    const dataIdx = { i: 0 };
    const decoded = {};

    keyParams.forEach((p) => { decoded[p.name] = decodeOneValue(p.type, keyStream, keyIdx); });
    dataParams.forEach((p) => { decoded[p.name] = decodeOneValue(p.type, data, dataIdx); });

    out.innerHTML = `<div class="label">Event: ${esc(ev.name)}</div><pre class="muted">${esc(stringifyPretty(decoded))}</pre>`;
  } catch (e) {
    out.innerHTML = `<div class="value error">${esc(e.message)}</div>`;
  }
}

async function runHash() {
  try {
    const txt = qs('hashText').value;
    const h = keccak256Hex(txt);
    renderKV('hashOut', [
      { label: 'keccak256(hex)', value: '0x' + h },
      { label: 'keccak256(dec)', value: BigInt('0x'+h).toString(10) },
      { label: 'felt selector space mod 2^251', value: (BigInt('0x'+h)%TWO_251).toString(10) },
    ]);
  } catch (e) { renderKV('hashOut', [{label:'error', value:e.message, error:true}]); }
}

function runNumeric() {
  try {
    const p = parseNumberish(qs('numInput').value.trim());
    renderKV('numOut', [
      { label:'input type', value:p.kind },
      { label:'decimal', value:p.value.toString(10) },
      { label:'hex', value:toHex(p.value) },
      { label:'binary', value:'0b'+p.value.toString(2) }
    ]);
  } catch (e) { renderKV('numOut', [{label:'error', value:e.message, error:true}]); }
}

function textToHexAndDec() {
  const txt = qs('txtInput').value;
  if (!txt) return renderKV('txtOut', [{label:'error', value:'No text provided.', error:true}]);
  const bytes = new TextEncoder().encode(txt);
  const hexLower = [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  renderKV('txtOut', [
    { label:'ascii text', value:txt },
    { label:'hex (lower)', value:hexLower },
    { label:'hex (upper)', value:hexLower.toUpperCase() },
    { label:'decimal bigint', value:BigInt('0x'+(hexLower||'00')).toString(10) },
  ]);
}

function hexToTextAndDec() {
  try {
    const clean = normalizeHex(qs('hexInput').value);
    const bytes = clean.match(/.{1,2}/g).map(h=>parseInt(h,16));
    const txt = bytesToAscii(bytes);
    renderKV('hexOut', [
      { label:'ascii text', value:txt, error:!isPrintableAscii(txt) },
      { label:'decimal bigint', value:BigInt('0x'+clean).toString(10) },
      { label:'hex normalized', value:clean },
    ]);
  } catch (e) { renderKV('hexOut', [{label:'error', value:e.message, error:true}]); }
}

function runDecode() {
  const box = qs('decodeResult');
  try {
    const out = decodeFeltValue(qs('decodeInput').value);
    box.innerHTML = `<div class="label">decoded string</div><div class="value">${esc(out.str)}</div><div class="muted">hex: ${esc(out.hex)} · dec: ${esc(out.dec)}</div>`;
  } catch (e) { box.innerHTML = `<div class="value error">${esc(e.message)}</div>`; }
}

function runUint() {
  try {
    const n = parseNumberish(qs('uInput').value).value;
    validateFelt(n);
    renderKV('uOut', [
      { label:'low (dec)', value:(n & MAX_U128).toString(10) },
      { label:'high (dec)', value:(n >> 128n).toString(10) },
      { label:'low (hex)', value:toHex(n & MAX_U128) },
      { label:'high (hex)', value:toHex(n >> 128n) },
    ]);
  } catch (e) { renderKV('uOut', [{label:'error', value:e.message, error:true}]); }
}

function runBatch() {
  const lines = qs('batchInput').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (!lines.length) { qs('batchResult').innerHTML = '<div class="muted">Add one felt per line.</div>'; return; }
  qs('batchResult').innerHTML = lines.map((line,i)=>{
    try { const d = decodeFeltValue(line); return `<div><span class="label">#${i+1}</span> <span class="value">${esc(d.str)}</span></div>`; }
    catch(e){ return `<div><span class="label">#${i+1}</span> <span class="value error">${esc(e.message)}</span></div>`; }
  }).join('');
}

function runCalldata() {
  const toks = parseTokenList(qs('calldataInput').value);
  if (!toks.length) { qs('calldataResult').innerHTML = '<div class="muted">Paste values first.</div>'; return; }
  qs('calldataResult').innerHTML = toks.map((tok,i)=>{
    try {
      const v = parseNumberish(tok).value; validateFelt(v);
      const ascii = bytesToAscii(toBytes(v));
      return `<div><span class="label">[${i}]</span> <span class="muted">${esc(tok)}</span> → <span class="value">${esc(isPrintableAscii(ascii)?ascii:'non-printable')}</span></div>`;
    } catch { return `<div><span class="label">[${i}]</span> <span class="muted">${esc(tok)}</span> → <span class="value error">invalid</span></div>`; }
  }).join('');
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
  qs('tabs').addEventListener('click', (e) => { const btn = e.target.closest('.tab-btn'); if (btn) switchTab(btn.dataset.tab); });

  qs('selectorRun').addEventListener('click', runSelector);
  qs('selectorPaste').addEventListener('click', () => pasteInto('selectorName', runSelector));
  qs('selectorLookupRun').addEventListener('click', runSelectorLookup);

  qs('abiEncodeRun').addEventListener('click', runAbiEncode);
  qs('abiDecodeRun').addEventListener('click', runAbiDecode);

  qs('u256SplitRun').addEventListener('click', runU256Split);
  qs('u256PackRun').addEventListener('click', runU256Pack);
  qs('baEncodeRun').addEventListener('click', runByteArrayEncode);
  qs('baDecodeRun').addEventListener('click', runByteArrayDecode);
  qs('addrNormRun').addEventListener('click', runAddrNormalize);

  qs('eventDecodeRun').addEventListener('click', runEventDecode);
  qs('hashRun').addEventListener('click', runHash);

  qs('numRun').addEventListener('click', runNumeric);
  qs('numPaste').addEventListener('click', () => pasteInto('numInput', runNumeric));
  qs('txtRun').addEventListener('click', textToHexAndDec);
  qs('txtPaste').addEventListener('click', () => pasteInto('txtInput', textToHexAndDec));
  qs('hexRun').addEventListener('click', hexToTextAndDec);
  qs('hexPaste').addEventListener('click', () => pasteInto('hexInput', hexToTextAndDec));
  qs('decodeRun').addEventListener('click', runDecode);
  qs('decodePaste').addEventListener('click', () => pasteInto('decodeInput', runDecode));
  qs('decodeClear').addEventListener('click', () => { qs('decodeInput').value = ''; qs('decodeResult').innerHTML = '<div class="muted">Paste a felt and decode short string.</div>'; });
  qs('uRun').addEventListener('click', runUint);
  qs('uPaste').addEventListener('click', () => pasteInto('uInput', runUint));
  qs('batchRun').addEventListener('click', runBatch);
  qs('batchPaste').addEventListener('click', () => pasteInto('batchInput', runBatch));
  qs('calldataRun').addEventListener('click', runCalldata);

  renderQuickNumeric();

  qs('txtInput').value = 'Dave'; textToHexAndDec();
  qs('hexInput').value = '44415645'; hexToTextAndDec();
  qs('selectorName').value = 'transfer';
}

bind();
