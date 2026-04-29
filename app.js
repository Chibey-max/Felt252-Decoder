const EXAMPLES = [
  {
    number: '2804988942864152508488475094962468554181127825702932543077',
    decoded: 'result would be negative',
    context: 'sub_num underflow guard'
  },
  {
    number: '1709662608498200765433310943302104658958991953088',
    decoded: 'Caller is not the owner',
    context: 'onlyOwner access control'
  },
  {
    number: '521777237',
    decoded: 'not divisible by zero',
    context: 'div_num zero guard'
  },
  {
    number: '1650615637837965612837040',
    decoded: 'invalid sum logic',
    context: 'add_num assertion'
  },
  {
    number: '7017280452245743462819',
    decoded: 'invalid sub',
    context: 'sub_num assertion'
  },
  {
    number: '129045857820029803',
    decoded: 'invalid mul',
    context: 'mul_num assertion'
  }
];

let history = JSON.parse(localStorage.getItem('felt252_history') || '[]');

function decodeFelt252(raw) {
  raw = raw.trim();
  if (!raw) throw new Error('empty');

  const hex0x = raw.startsWith('0x') || raw.startsWith('0X');
  let num;
  try {
    num = BigInt(hex0x ? raw : raw);
  } catch {
    throw new Error('Not a valid number. Paste the raw decimal from your error trace.');
  }

  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;

  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    str += String.fromCharCode(code);
  }

  const printable = str.split('').every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
  if (!printable) {
    throw new Error('Contains non-printable characters — this may not be a short string felt252.');
  }

  return { str, hex: '0x' + hex, charCount: str.length };
}

function decode() {
  const input = document.getElementById('input').value;
  const resultIdle = document.getElementById('resultIdle');
  const resultOutput = document.getElementById('resultOutput');
  const resultValue = document.getElementById('resultValue');
  const resultMeta = document.getElementById('resultMeta');

  try {
    const { str, hex, charCount } = decodeFelt252(input);

    resultIdle.classList.add('hidden');
    resultOutput.classList.remove('hidden');
    resultValue.textContent = str;
    resultValue.className = 'result-value';
    resultMeta.textContent = `hex: ${hex}  ·  ${charCount} chars`;

    addToHistory(input.trim(), str);
  } catch (e) {
    resultIdle.classList.add('hidden');
    resultOutput.classList.remove('hidden');
    resultValue.textContent = e.message === 'empty' ? 'No input provided.' : e.message;
    resultValue.className = 'result-value error';
    resultMeta.textContent = '';
  }
}

function clearInput() {
  document.getElementById('input').value = '';
  document.getElementById('clearBtn').classList.remove('visible');
  document.getElementById('resultIdle').classList.remove('hidden');
  document.getElementById('resultOutput').classList.add('hidden');
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('input').value = text;
    document.getElementById('clearBtn').classList.add('visible');
    decode();
  } catch {
    showToast('Clipboard access denied — paste manually');
  }
}

function copyResult() {
  const val = document.getElementById('resultValue').textContent;
  navigator.clipboard.writeText(val).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

function addToHistory(number, decoded) {
  const entry = { number, decoded, time: Date.now() };
  history = [entry, ...history.filter(h => h.number !== number)].slice(0, 20);
  localStorage.setItem('felt252_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const section = document.getElementById('historySection');
  const list = document.getElementById('historyList');

  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = history.map(h => `
    <div class="history-item" onclick="loadFromHistory('${h.number.replace(/'/g, "\\'")}')">
      <span class="history-decoded">${escHtml(h.decoded)}</span>
      <span class="history-num">${h.number}</span>
      <span class="history-time">${timeAgo(h.time)}</span>
    </div>
  `).join('');
}

function loadFromHistory(number) {
  document.getElementById('input').value = number;
  document.getElementById('clearBtn').classList.add('visible');
  decode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearHistory() {
  history = [];
  localStorage.removeItem('felt252_history');
  renderHistory();
}

function renderExamples() {
  const grid = document.getElementById('examplesGrid');
  grid.innerHTML = EXAMPLES.map((ex, i) => `
    <div class="example-card" onclick="loadExample('${ex.number}')" style="animation-delay:${i * 0.05}s">
      <div class="example-decoded">'${escHtml(ex.decoded)}'</div>
      <div class="example-number">${ex.number.slice(0, 40)}...</div>
      <div class="example-try">→ click to decode</div>
    </div>
  `).join('');
}

function loadExample(number) {
  document.getElementById('input').value = number;
  document.getElementById('clearBtn').classList.add('visible');
  decode();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

document.getElementById('input').addEventListener('input', function() {
  document.getElementById('clearBtn').classList.toggle('visible', this.value.length > 0);
});

document.getElementById('input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    decode();
  }
});

renderExamples();
renderHistory();
