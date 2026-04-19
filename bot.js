/**
 * DACHAIN GOD-LEVEL BOT
 * V2.8: Master P2P Loop Edition
 */

const { ethers } = require('ethers');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const readline  = require('readline');

// ═══════════════════════════════════════════════════════════════
//  CONFIG & ANSI COLORS
// ═══════════════════════════════════════════════════════════════

const DIR       = __dirname;
const PK_FILE   = path.join(DIR, 'pk.txt');
const STATE_FILE= path.join(DIR, 'state.json');
const LOG_FILE  = path.join(DIR, 'bot.log');

const CFG = {
  rpc:        'https://rpctest.dachain.tech',
  chainId:    21894,
  api:        'https://inception.dachain.io',
  qeContract: '0x3691A78bE270dB1f3b1a86177A8f23F89A8Cef24',
  qeAbi:      ['function burnForQE() payable'],
  loopMs:     10 * 60 * 1000,   // 10 min
  txFaucet:   86400000,         // 24 h
  crateCd:    86400000,         // 24 h
};

let TX_AMOUNT   = '0.0001';
let TX_COUNT    = 3;
let BURN_AMOUNT = '0.0001';
let BURN_COUNT  = 1;

const c = {
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', 
  red: '\x1b[31m', white: '\x1b[1;37m', reset: '\x1b[0m', 
  gray: '\x1b[90m', blue: '\x1b[34m'
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

// ═══════════════════════════════════════════════════════════════
//  LOGGER & UI
// ═══════════════════════════════════════════════════════════════

function ts()  { return new Date().toISOString().split('T')[1].slice(0, 8); }
function tag(a) { return a ? a.slice(0, 6) + '..' + a.slice(-4) : 'System'; }

function log(level, addr, msg) {
  const icons = { ok: `${c.green}✅${c.reset}`, err: `${c.red}❌${c.reset}`, warn: `${c.yellow}⚠️${c.reset}`, info: `${c.blue}ℹ️${c.reset}`, step: `${c.cyan}🔹${c.reset}` };
  const line = `${c.gray}[${ts()}]${c.reset} ${c.cyan}[${tag(addr)}]${c.reset} ${icons[level] || ''} ${msg}`;
  console.log(line);
}

function clearScreen() { console.clear(); }

function printBanner() {
  console.log(`${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║${c.reset}   🚀 ${c.green}DACHAIN GOD-LEVEL BOT${c.reset} 🚀                         ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}   🛡️  ${c.yellow}V2.8: Master P2P Loop Edition${c.reset}                        ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
}

function printDashboard(walletCount, bal, qe, rank, badges) {
  console.log(`${c.white}📊 [ LIVE DASHBOARD ]${c.reset}`);
  console.log(`   ${c.yellow}•${c.reset} Wallets Loaded : ${c.green}${walletCount}${c.reset}      |   ${c.yellow}•${c.reset} Main Wallet QE   : ${c.cyan}${qe}${c.reset}`);
  console.log(`   ${c.blue}•${c.reset} Main Bal (DAC) : ${c.green}${bal}${c.reset} |   ${c.blue}•${c.reset} Main Rank      : ${c.cyan}#${rank}${c.reset}`);
  console.log(`   ${c.cyan}•${c.reset} Default TX/Cyc : ${c.green}${TX_COUNT}${c.reset}         |   ${c.cyan}•${c.reset} Badges Earned  : ${c.yellow}${badges}${c.reset}`);
  console.log(`   ${c.green}•${c.reset} Burn Per Cycle : ${c.yellow}${BURN_AMOUNT}${c.reset} DAC (x${BURN_COUNT})\n`);
}

// ═══════════════════════════════════════════════════════════════
//  API CLIENT
// ═══════════════════════════════════════════════════════════════

class ApiClient {
  constructor(wallet) {
    this.w = wallet; this.csrf = ''; this.cookies = '';
    this.http = axios.create({ baseURL: CFG.api, timeout: 30000 });
  }
  _saveCookies(res) {
    const sc = res.headers['set-cookie']; if (!sc) return;
    for (const cookie of sc) {
      const [pair] = cookie.split(';'); const [name] = pair.split('=');
      const re = new RegExp(`${name}=[^;]*`);
      this.cookies = re.test(this.cookies) ? this.cookies.replace(re, pair) : this.cookies + (this.cookies ? '; ' : '') + pair;
    }
  }
  async _fetchCsrf() {
    const r = await this.http.get('/csrf/', { headers: { Accept: 'application/json', Cookie: this.cookies } });
    this._saveCookies(r); const m = this.cookies.match(/csrftoken=([^;]+)/); if (m) this.csrf = m[1];
  }
  _hdr(post = false) {
    const h = { Cookie: this.cookies, Accept: 'application/json' };
    if (post) { h['Content-Type'] = 'application/json'; h['X-CSRFToken'] = this.csrf; h['Origin'] = CFG.api; }
    return h;
  }
  async init() {
    await this._fetchCsrf();
    const r = await this.http.post('/api/auth/wallet/', { wallet_address: this.w.address.toLowerCase() }, { headers: this._hdr(true) });
    this._saveCookies(r); await this._fetchCsrf(); return r.data;
  }
  profile()      { return this.get('/api/inception/profile/'); }
  faucetClaim()  { return this.post('/api/inception/faucet/'); }
  crateOpen()    { return this.post('/api/inception/crate/open/', { crate_name: 'daily' }); }
  confirmBurn(h) { return this.post('/api/inception/exchange/confirm-burn/', { tx_hash: h }); }
  sync(h)        { return this.post('/api/inception/sync/', { tx_hash: h || '0x' }); }
  async get(p)   { const r = await this.http.get(p, { headers: this._hdr() }); this._saveCookies(r); return r.data; }
  async post(p,b){ const r = await this.http.post(p,b, { headers: this._hdr(true) }); this._saveCookies(r); return r.data; }
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITIES (SMART P2P ENGINE)
// ═══════════════════════════════════════════════════════════════

async function claimFaucet(api, addr, st, now, silent) {
  if (now - st.lastFaucet < CFG.txFaucet) { if(!silent) log('info', addr, 'Faucet cooldown'); return; }
  try { const r = await api.faucetClaim(); if(r?.success) { st.lastFaucet = now; log('ok', addr, 'Faucet claimed'); } } catch(e) { log('err', addr, 'Faucet failed'); }
}

async function openCrate(api, addr, st, now, silent) {
  if (now - st.lastCrate < CFG.crateCd) { if(!silent) log('info', addr, 'Crate already opened today'); return; }
  try { const r = await api.crateOpen(); if(r?.success) { st.lastCrate = now; log('ok', addr, 'Crate opened'); } } catch(e) { log('err', addr, 'Crate failed'); }
}

async function executeTxs(signer, api, addr, allKeys, st) {
  const otherAddrs = allKeys.map(k => new ethers.Wallet(k).address).filter(a => a.toLowerCase() !== addr.toLowerCase());
  const isP2P = otherAddrs.length > 0;
  for (let i = 0; i < TX_COUNT; i++) {
    const target = isP2P ? otherAddrs[i % otherAddrs.length] : addr;
    try {
      const tx = await signer.sendTransaction({ to: target, value: ethers.parseEther(TX_AMOUNT) });
      log('ok', addr, `${isP2P ? 'P2P' : 'Self'} TX Sent to ${tag(target)}`);
      await api.sync(tx.hash); await sleep(3000);
    } catch(e) { log('err', addr, 'TX Failed'); break; }
  }
}

async function executeBurn(signer, api, addr) {
  for (let i = 0; i < BURN_COUNT; i++) {
    try {
      const c = new ethers.Contract(CFG.qeContract, CFG.qeAbi, signer);
      const tx = await c.burnForQE({ value: ethers.parseEther(BURN_AMOUNT) });
      await tx.wait(); log('ok', addr, `Burned ${BURN_AMOUNT} DAC (Batch #${i+1})`);
      await api.confirmBurn(tx.hash); await api.sync(tx.hash);
      if (i < BURN_COUNT - 1) await sleep(2000);
    } catch(e) { log('err', addr, 'Burn failed'); break; }
  }
}

// ═══════════════════════════════════════════════════════════════
//  CORE ENGINE
// ═══════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function runTask(pk, type, allKeys) {
  const wallet = new ethers.Wallet(pk);
  const provider = new ethers.JsonRpcProvider(CFG.rpc);
  const signer = wallet.connect(provider);
  const api = new ApiClient(wallet);
  const state = loadState();
  const addr = wallet.address;
  if (!state[addr]) state[addr] = { lastFaucet: 0, lastCrate: 0 };
  const st = state[addr];
  const now = Date.now();

  try {
    await api.init();
    if (type === 'hybrid' || type === 'faucet') { await claimFaucet(api, addr, st, now, type==='hybrid'); await openCrate(api, addr, st, now, type==='hybrid'); }
    if (type === 'hybrid' || type === 'fast' || type === 'tx') await executeTxs(signer, api, addr, allKeys, st);
    if (type === 'hybrid' || type === 'fast' || type === 'burn') await executeBurn(signer, api, addr);
    saveState(state);
    const p = await api.profile(); log('ok', addr, `Sync Done: QE ${p.qe_balance} | Rank #${p.user_rank}`);
  } catch(e) { log('err', addr, e.message); }
}

async function runBatch(keys, type) {
  const sep = `${c.gray}──────────────────────────────────────────────────${c.reset}`;
  for (let i = 0; i < keys.length; i++) {
    console.log(`\n${sep}\n${c.cyan}➤ Processing Wallet ${i+1}/${keys.length}${c.reset}\n${sep}`);
    await runTask(keys[i], type, keys);
    await sleep(2000);
  }
  console.log(`\n${c.green}✨ Batch Task Complete!${c.reset}\n`);
}

async function startApp() {
  clearScreen(); printBanner();
  if (!fs.existsSync(PK_FILE)) { console.log(`${c.red}❌ pk.txt not found!${c.reset}`); process.exit(1); }
  const keys = fs.readFileSync(PK_FILE, 'utf8').split('\n').map(k => k.trim()).filter(k => k.startsWith('0x'));
  if (!keys.length) { console.log(`${c.red}❌ No keys found in pk.txt${c.reset}`); process.exit(1); }

  console.log(`${c.yellow}⏳ Loading Dashboard Data...${c.reset}`);
  const stats = await fetchStats(keys[0]);
  clearScreen(); printBanner(); printDashboard(keys.length, stats.bal, stats.qe, stats.rank, stats.badges);

  const menu = `
${c.cyan}⚙️  Select Menu Option:${c.reset}
${c.yellow}[1]${c.reset} Fast Auto Loop (Smart P2P-TX & Burn)
${c.yellow}[2]${c.reset} True Hybrid Loop (All Tasks)
${c.yellow}[3]${c.reset} Claim Faucet & Crate
${c.yellow}[4]${c.reset} Batch Send TXs (Smart P2P Auto-Detect)
${c.yellow}[5]${c.reset} Burn DAC to QE (Custom Amount & Count)

👉 Enter your choice (1-5): `;

  const answer = await ask(menu);

  switch (answer.trim()) {
    case '1': console.log(`\n${c.green}🔄 Loop Started...${c.reset}`); while(true) { await runBatch(keys, 'fast'); await sleep(CFG.loopMs); }
    case '2': console.log(`\n${c.green}🔄 Hybrid Started...${c.reset}`); while(true) { await runBatch(keys, 'hybrid'); await sleep(CFG.loopMs); }
    case '3': await runBatch(keys, 'faucet'); break;
    case '4':
      TX_AMOUNT = await ask(`\n${c.yellow}👉 How much DAC per TX? (e.g. 0.0001): ${c.reset}`);
      TX_COUNT = await ask(`${c.yellow}👉 How many TXs per wallet? (e.g. 50): ${c.reset}`);
      await runBatch(keys, 'tx');
      break;
    case '5':
      BURN_AMOUNT = await ask(`\n${c.yellow}👉 How much DAC to burn per TX? (e.g. 0.0001): ${c.reset}`);
      BURN_COUNT = await ask(`${c.yellow}👉 How many times to burn? (e.g. 10): ${c.reset}`);
      await runBatch(keys, 'burn');
      break;
    default: console.log(`\n${c.red}❌ Invalid choice!${c.reset}`); break;
  }
  rl.close();
}

async function fetchStats(pk) {
  try {
    const w = new ethers.Wallet(pk);
    const p = new ethers.JsonRpcProvider(CFG.rpc);
    const b = await p.getBalance(w.address);
    const api = new ApiClient(w); await api.init();
    const prof = await api.profile();
    return { bal: ethers.formatEther(b).slice(0,6), qe: prof.qe_balance, rank: prof.user_rank, badges: prof.badges.length };
  } catch { return { bal: '0', qe: '0', rank: '?', badges: '0' }; }
}

startApp();
                                                                           
