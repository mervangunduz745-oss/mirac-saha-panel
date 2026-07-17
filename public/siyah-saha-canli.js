import { firebaseConfig, cloudConfig } from './firebase-config.js';

const VERSION = '11.10.0';
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}`;
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:0 }).format(Number(n)||0);
const today = new Date();
const todayKey = new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
const inDays = (dateText, days) => {
  const d = new Date(`${dateText}T12:00:00`);
  const limit = new Date(`${todayKey}T12:00:00`);
  limit.setDate(limit.getDate()+days);
  return d <= limit;
};
const daysDiff = (dateText) => {
  if (!dateText) return 0;
  return Math.floor((new Date(`${todayKey}T12:00:00`) - new Date(`${dateText}T12:00:00`))/86400000);
};
const val = (o, keys, fallback='') => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return fallback;
};
const num = (o, keys) => Number(val(o, keys, 0)) || 0;
const text = (o, keys, fallback='-') => String(val(o, keys, fallback));
const safe = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setStatus(label, kind='live') {
  const el = $('liveStatus');
  if (!el) return;
  el.textContent = label;
  el.className = `badge ${kind}`;
}

function active(row) {
  const s = text(row, ['status','stage','durum'], '').toLocaleLowerCase('tr-TR');
  return !['iptal','ödendi','tamamlandı','kapandı','teslim edildi'].some(x => s.includes(x));
}

function txAmount(tx) { return num(tx, ['amount','total','tutar','paidAmount','paymentAmount']); }
function txType(tx) { return text(tx, ['type','transactionType','islemTuru'], '').toUpperCase(); }
function txDate(tx) { return text(tx, ['date','transactionDate','createdDate','dueDate'], ''); }
function party(tx) { return text(tx, ['party','customer','supplier','cari','partyName','customerName','name'], 'İsimsiz cari'); }

function renderList(id, rows, empty='Kayıt yok') {
  const el = $(id); if (!el) return;
  el.innerHTML = rows.length ? rows.join('') : `<div class="row"><div><b>${safe(empty)}</b><small>Canlı kayıtlarda sonuç bulunmadı.</small></div></div>`;
}

async function loadCollection(fs, db, name) {
  const ref = fs.collection(db, 'orgs', cloudConfig.orgId || 'mirac', name);
  const snap = await fs.getDocs(ref);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

function summarizeAccounts(accounts, transactions) {
  if (accounts.length) return accounts.reduce((s,a)=>s+num(a,['balance','current','amount','bakiye']),0);
  return transactions.reduce((s,tx)=> {
    const t = txType(tx); const a = txAmount(tx);
    if (['TAHSILAT','SATIS','CARI_ALACAK_ACILIS'].includes(t)) return s+a;
    if (['ODEME','MASRAF','PERSONEL_ODEME','BORC_ODEME','ALIS'].includes(t)) return s-a;
    return s;
  },0);
}

function customerReceivables(transactions) {
  const map = new Map();
  for (const tx of transactions) {
    const t = txType(tx), a = txAmount(tx), p = party(tx);
    const remain = num(tx,['remaining','remainingAmount','balance','openAmount']) || a;
    if (['SATIS','SIPARIS','CARI_ALACAK_ACILIS'].includes(t)) map.set(p,(map.get(p)||0)+remain);
    if (t==='TAHSILAT') map.set(p,(map.get(p)||0)-a);
  }
  return [...map].map(([name,amount])=>({name,amount})).filter(x=>x.amount>0).sort((a,b)=>b.amount-a.amount);
}

function render(state) {
  const {accounts,transactions,debtPlans,items,productionJobs} = state;
  const cash = summarizeAccounts(accounts, transactions);
  const todayCollections = transactions.filter(tx => txType(tx)==='TAHSILAT' && txDate(tx)===todayKey).reduce((s,tx)=>s+txAmount(tx),0);
  const sevenDayDebt = debtPlans.filter(active).filter(d=>!val(d,['dueDate','date']) || inDays(val(d,['dueDate','date']),7)).reduce((s,d)=>s+Math.max(0,num(d,['amount','total','tutar'])-num(d,['paid','paidAmount','odenen'])),0);
  const prod = productionJobs.filter(active);
  const receivables = customerReceivables(transactions).slice(0,5);
  const critical = items.filter(i=> {
    const current=num(i,['current','quantity','stock','mevcut']);
    const min=num(i,['min','minimum','minStock','kritikSeviye']);
    return min>0 && current<=min;
  }).sort((a,b)=> (num(a,['current','quantity','stock'])/Math.max(1,num(a,['min','minimum','minStock']))) - (num(b,['current','quantity','stock'])/Math.max(1,num(b,['min','minimum','minStock'])))).slice(0,5);
  const debts = debtPlans.filter(active).sort((a,b)=>String(val(a,['dueDate','date'],'9999')).localeCompare(String(val(b,['dueDate','date'],'9999')))).slice(0,5);
  const riskyProd = prod.sort((a,b)=>String(val(a,['dueDate','deliveryDate','targetDate'],'9999')).localeCompare(String(val(b,['dueDate','deliveryDate','targetDate'],'9999')))).slice(0,5);

  $('cashTotal').textContent = money(cash);
  $('todayTarget').textContent = money(todayCollections);
  $('receivableTotal').textContent = money(receivables.reduce((s,r)=>s+r.amount,0));
  $('sevenDayDebt').textContent = money(sevenDayDebt);
  $('productionCount').textContent = `${prod.length} emir`;
  $('productionHint').textContent = `${riskyProd.length} iş öncelikli`;

  renderList('receivableList', receivables.map(r=>`<div class="row"><div><b>${safe(r.name)}</b><small>Açık müşteri bakiyesi</small></div><div class="money">${money(r.amount)}</div></div>`), 'Aranacak cari yok');
  renderList('productionList', riskyProd.map(j=> {
    const due=text(j,['dueDate','deliveryDate','targetDate'],'');
    const late=daysDiff(due);
    const label=[text(j,['product','productName','urun'],'Üretim işi'),text(j,['sizeVariant','size','olcu'],'')].filter(Boolean).join(' · ');
    return `<div class="row"><div><b>${safe(label)}</b><small>${safe(text(j,['stage','status','durum'],'Aşama belirtilmemiş'))}${due?` · ${safe(due)}`:''}</small></div><div class="money ${late>0?'red':'blue'}">${safe(text(j,['quantity','qty','adet'],'1'))} adet</div></div>`;
  }), 'Aktif üretim yok');
  renderList('stockList', critical.map(i=> {
    const current=num(i,['current','quantity','stock','mevcut']); const min=num(i,['min','minimum','minStock','kritikSeviye']);
    const pct=Math.max(4,Math.min(100,(current/Math.max(1,min))*100));
    return `<div class="row"><div><b>${safe(text(i,['name','itemName','productName'],'Stok kalemi'))}</b><small>${safe(text(i,['group','category','kind'],'Kritik stok'))}</small><div class="bar"><span style="width:${pct}%"></span></div></div><div class="money red">${current}/${min}</div></div>`;
  }), 'Kritik stok yok');
  renderList('debtList', debts.map(d=> {
    const rem=Math.max(0,num(d,['amount','total','tutar'])-num(d,['paid','paidAmount','odenen'])); const due=text(d,['dueDate','date'],'');
    return `<div class="row"><div><b>${safe(text(d,['party','name','institution','kurum'],'Borç kaydı'))}</b><small>${due?safe(due):'Vade yok'}</small></div><span class="money">${money(rem)}</span></div>`;
  }), 'Yakın borç yok');
  renderList('deliveryList', riskyProd.map(j=> {
    const due=text(j,['dueDate','deliveryDate','targetDate'],''); const late=daysDiff(due);
    const risk=late>0?'Yüksek':due&&inDays(due,3)?'Orta':'Düşük';
    return `<div class="row"><div><b>${safe(text(j,['product','productName','urun'],'Üretim işi'))}</b><small>${safe(text(j,['customer','party','customerName'],'Müşteri belirtilmemiş'))}${due?` · ${safe(due)}`:''}</small></div><span class="money ${risk==='Yüksek'?'red':'blue'}">${risk}</span></div>`;
  }), 'Teslim riski yok');

  const mainRisk = sevenDayDebt>cash ? 'Nakit baskısı' : critical.length ? 'Kritik stok' : riskyProd.some(j=>daysDiff(text(j,['dueDate','deliveryDate','targetDate'],''))>0) ? 'Teslim gecikmesi' : 'Kontrollü';
  $('decisionText').textContent = mainRisk==='Nakit baskısı' ? 'Önce tahsilat, sonra ödeme ve yeni alış kararı.' : mainRisk==='Kritik stok' ? 'Üretimi durduracak kritik stoklar tamamlanmadan yeni teslim sözü verilmesin.' : mainRisk==='Teslim gecikmesi' ? 'Geciken üretimler bitirilmeden yeni iş önceliği açılmasın.' : 'Bugün planlanan işler sırayla kapatılsın; yeni risk oluşursa karar satırı güncellensin.';
  $('riskBadge').textContent = `Risk: ${mainRisk}`;
  setStatus(`Canlı veri · ${transactions.length+debtPlans.length+items.length+productionJobs.length} kayıt`, 'live');
}

async function start() {
  try {
    setStatus('Bağlanıyor…','critical');
    const [appSdk,authSdk,fs] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`)
    ]);
    const appName=`mirac-saha-live-${firebaseConfig.projectId}`;
    const app=appSdk.getApps().find(a=>a.name===appName)||appSdk.initializeApp(firebaseConfig,appName);
    const auth=authSdk.getAuth(app);
    const db=fs.getFirestore(app);
    authSdk.onAuthStateChanged(auth, async user => {
      if (!user) {
        setStatus('Ana panele giriş gerekli','critical');
        $('decisionText').textContent='Canlı veriyi görmek için önce ana ERP panelinde giriş yapın, sonra bu sayfayı yenileyin.';
        return;
      }
      try {
        const names=['accounts','transactions','debtPlans','items','productionJobs'];
        const rows=await Promise.all(names.map(n=>loadCollection(fs,db,n)));
        render(Object.fromEntries(names.map((n,i)=>[n,rows[i]])));
      } catch (e) {
        console.error(e);
        setStatus('Veri okuma engeli','critical');
        $('decisionText').textContent=`Canlı veri okunamadı: ${e?.message||'Yetki veya bağlantı hatası'}`;
      }
    });
  } catch (e) {
    console.error(e);
    setStatus('Bağlantı kurulamadı','critical');
    $('decisionText').textContent=`Bağlantı hatası: ${e?.message||'Bilinmeyen hata'}`;
  }
}

start();
