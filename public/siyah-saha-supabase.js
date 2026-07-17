import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(n) || 0);
const today = new Date();
const todayKey = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (days) => { const d = new Date(`${todayKey}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const safe = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function status(text, kind = 'live') {
  const el = $('liveStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${kind}`;
}

function rowsHtml(rows, emptyText, mapper) {
  return rows.length ? rows.map(mapper).join('') : `<div class="row"><small>${safe(emptyText)}</small></div>`;
}

function configReady() {
  return supabaseConfig.url && supabaseConfig.anonKey && !/SUPABASE_/i.test(`${supabaseConfig.url}${supabaseConfig.anonKey}`);
}

function setDemoState(message) {
  status('Kurulum bekliyor', 'critical');
  $('decisionText').textContent = message;
  $('riskBadge').textContent = 'Risk: Veri kaynağı yok';
}

if (!configReady()) {
  setDemoState('Supabase proje adresi ve anon anahtarı tanımlanınca canlı işletme verileri burada görünecek.');
} else {
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session) {
    setDemoState('Canlı veriyi görmek için Supabase hesabıyla giriş yapılmalı.');
  } else {
    try {
      status('Canlı veri bağlanıyor…');
      const orgId = supabaseConfig.orgId || 'mirac';
      const [accountsQ, txQ, debtsQ, itemsQ, jobsQ] = await Promise.all([
        supabase.from('accounts').select('*').eq('org_id', orgId),
        supabase.from('transactions').select('*').eq('org_id', orgId),
        supabase.from('debt_plans').select('*').eq('org_id', orgId),
        supabase.from('items').select('*').eq('org_id', orgId),
        supabase.from('production_jobs').select('*').eq('org_id', orgId)
      ]);

      const errors = [accountsQ, txQ, debtsQ, itemsQ, jobsQ].map(x => x.error).filter(Boolean);
      if (errors.length) throw errors[0];

      const accounts = accountsQ.data || [];
      const tx = txQ.data || [];
      const debts = debtsQ.data || [];
      const items = itemsQ.data || [];
      const jobs = jobsQ.data || [];

      const cash = accounts.reduce((sum, r) => sum + Number(r.balance || r.current_balance || 0), 0);
      const receivables = tx.filter(r => ['SATIS','SIPARIS','CARI_ALACAK_ACILIS'].includes(String(r.type || '').toUpperCase()) && String(r.status || '').toLowerCase() !== 'iptal');
      const receipts = tx.filter(r => String(r.type || '').toUpperCase() === 'TAHSILAT');
      const receivableTotal = Math.max(0, receivables.reduce((s,r)=>s+Number(r.amount||0),0) - receipts.reduce((s,r)=>s+Number(r.amount||0),0));
      const todayReceipts = receipts.filter(r => String(r.date || r.created_at || '').slice(0,10) === todayKey).reduce((s,r)=>s+Number(r.amount||0),0);
      const sevenDayDebts = debts.filter(r => String(r.status || '').toLowerCase() !== 'ödendi' && String(r.due_date || '') <= plusDays(7));
      const sevenDayDebtTotal = sevenDayDebts.reduce((s,r)=>s+Math.max(0, Number(r.amount||0)-Number(r.paid||0)),0);
      const activeJobs = jobs.filter(r => !['tamamlandı','iptal','teslim edildi'].includes(String(r.stage || r.status || '').toLowerCase()));
      const criticalItems = items.filter(r => Number(r.current_qty ?? r.current ?? 0) <= Number(r.min_qty ?? r.min ?? 0));

      $('cashTotal').textContent = money(cash);
      $('receivableTotal').textContent = money(receivableTotal);
      $('todayTarget').textContent = money(todayReceipts);
      $('sevenDayDebt').textContent = money(sevenDayDebtTotal);
      $('productionCount').textContent = `${activeJobs.length} emir`;
      $('productionHint').textContent = activeJobs.length ? 'Canlı üretim baskısı' : 'Aktif üretim yok';

      $('receivableList').innerHTML = rowsHtml(receivables.slice(0,5), 'Açık müşteri alacağı yok.', r => `<div class="row"><div><b>${safe(r.party || r.customer || r.name || 'Müşteri')}</b><small>${safe(r.note || r.status || '')}</small></div><div class="money">${money(r.amount)}</div></div>`);
      $('productionList').innerHTML = rowsHtml(activeJobs.slice(0,5), 'Aktif üretim emri yok.', r => `<div class="row"><div><b>${safe(r.product_name || r.product || 'Üretim')}</b><small>${safe(r.size || r.stage || '')}</small></div><div class="money blue">${safe(r.quantity || r.qty || 1)} adet</div></div>`);
      $('stockList').innerHTML = rowsHtml(criticalItems.slice(0,5), 'Kritik stok görünmüyor.', r => `<div class="row"><div><b>${safe(r.name || r.code || 'Stok')}</b><small>Minimum: ${safe(r.min_qty ?? r.min ?? 0)}</small></div><div class="money red">${safe(r.current_qty ?? r.current ?? 0)}</div></div>`);
      $('debtList').innerHTML = rowsHtml(sevenDayDebts.slice(0,5), '7 gün içinde ödeme yok.', r => `<div class="row"><b>${safe(r.party || r.name || r.type || 'Borç')}</b><span class="money">${money(Math.max(0, Number(r.amount||0)-Number(r.paid||0)))}</span></div>`);
      $('deliveryList').innerHTML = rowsHtml(activeJobs.filter(r => r.due_date).slice(0,5), 'Teslim tarihi girilmiş aktif iş yok.', r => `<div class="row"><b>${safe(r.product_name || r.product || 'Sipariş')}</b><span class="money ${String(r.due_date) < todayKey ? 'red' : 'blue'}">${safe(r.due_date)}</span></div>`);

      const risk = sevenDayDebtTotal > cash ? 'Nakit baskısı' : criticalItems.length ? 'Kritik stok' : activeJobs.length > 5 ? 'Üretim yükü' : 'Kontrollü';
      $('riskBadge').textContent = `Risk: ${risk}`;
      $('decisionText').textContent = sevenDayDebtTotal > cash
        ? 'Bugün tahsilat yapılmadan yeni vadeli alış açılmayacak.'
        : criticalItems.length
          ? 'Kritik stok tamamlanmadan yeni teslim sözü verilmeyecek.'
          : 'Tahsilat, üretim ve teslim sırası günlük plana göre yürütülecek.';
      status(`Canlı veri · ${accounts.length + tx.length + debts.length + items.length + jobs.length} kayıt`);
    } catch (error) {
      console.error(error);
      setDemoState(`Supabase bağlantısı kurulamadı: ${error.message || error}`);
    }
  }
}
