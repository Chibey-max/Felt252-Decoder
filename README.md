# Dave Felt252 Decoder — Starknet/Cairo Toolkit

A lightweight, static web toolkit for Starknet/Cairo developers.

This project started as a felt252 short-string decoder and has been upgraded into a **multi-tool converter/debug utility** for common smart contract and CLI workflows.

---

## Live App

- Production: **https://davefelt252-decoder.vercel.app**
- Owner: **https://github.com/Chibey-max**
- Repository: **https://github.com/Chibey-max/Felt252-Decoder**

---

## What this tool does

### 1) Numeric converter (Hex ⇄ Decimal)
Convert between hex and decimal like shell snippets:

```sh
printf "%d\n" 0xf4240   # 1000000
printf "%d\n" 0x2710    # 10000
printf "%d\n" 0x1388    # 5000
printf "%d\n" 0xf423f   # 999999
```

The app supports these directly in the **Numeric** tab.

---

### 2) Text/Hex converter (xxd-style)
Convert ASCII text to hex/decimal and decode hex back to text.

Examples:

```sh
echo 44617665 | xxd -r -p   # Dave
echo 44415645 | xxd -r -p   # DAVE
```

In the app:
- **Text → Hex/Dec** for `Dave`, `DAVE`, etc.
- **Hex → Text** for `44617665`, `0x44415645`, etc.

---

### 3) felt252 short-string decoding
Decode Starknet/Cairo short-string felts from decimal or hex inputs.

- Input formats: decimal (`123...`) or hex (`0x...`)
- Validates felt range:

```text
0 <= felt <= 2^251 + 17*2^192 + 1
```

- Detects non-printable byte results and reports clearly.

---

### 4) uint256 helper
Split any supported numeric input into:
- `low` / `high` (decimal)
- `low` / `high` (hex)

Useful for Starknet calldata and contract argument formatting.

---

### 5) Batch tools
- **Batch decode**: one felt per line
- **Calldata inspector**: parse CSV/newline/space-separated values and attempt readable decoding

---

## Project structure

```text
.
├── index.html   # app layout + sections + tabs
├── styles.css   # styling/theme
├── app.js       # conversion and decode logic
└── .gitignore
```

This is intentionally framework-free and easy to deploy as static content.

---

## How to run locally

Because this is a static app, you can open `index.html` directly, or run a simple local server.

### Option A: Open directly
- Double-click `index.html` in your file manager

### Option B: Python static server
```sh
python3 -m http.server 8080
```
Then open `http://localhost:8080`.

---

## Deploying to Vercel

This repo is already configured for static deployment.

### Deploy production
```sh
vercel deploy --prod --yes
```

### Current project URL
- `https://davefelt252-decoder.vercel.app`

---

## Usage examples (copy/paste)

### A) Felt decode examples

| String | Hex | Decimal |
|---|---|---:|
| `result` | `0x726573756c74` | `125780054338676` |
| `hello` | `0x68656c6c6f` | `448378203247` |
| `starknet` | `0x737461726b6e6574` | `8319381555716711796` |
| `invalid sub` | `0x696e76616c696420737562` | `127458855108554219970590050` |

### B) Big felt example

- `2804988942864152508488475094962468554181127825702932543077`
- Expected decode: `result would be negative`

### C) uint256 split example

Input decimal:

```text
1606938044258990275541962092341162602522202993782792958758165
```

Expected:
- low (dec): `123456789`
- high (dec): `4722366482869645213696`
- low (hex): `0x75bcd15`
- high (hex): `0x1000000000000000000`

---

## Validation / edge cases

Try these to verify guardrails:

- Felt max (valid):
  - `3618502788666131213697322783095070105623107215331596699973092056135872020481`
- Felt max + 1 (invalid)
- Negative values (invalid)
- Invalid hex like `0xZZ12` (invalid)
- Overlong string (>31 chars) when using string-to-felt mode

---

## Notes

- String-based felt conversion assumes printable ASCII and Cairo short-string conventions.
- Not all felt values represent text; non-printable decodes are flagged.
- The app is intentionally dependency-free for simplicity and portability.

---

## Roadmap ideas

Potential next upgrades:

- Function selector tools
- Felt array encode/decode helpers
- Poseidon/Pedersen hash utilities
- Sncast-ready output formatters
- Advanced Cairo serialization helpers

---

## License

MIT (recommended). If you want, add a `LICENSE` file to make this explicit.
