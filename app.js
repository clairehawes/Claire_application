'use strict';

const STORAGE_KEY = 'event-planner-data-v1';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const fmtMoney = (n) => money.format(Number(n) || 0);
const fmtDate = (d) => {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return isNaN(date) ? d : date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- State ----------

let state = load();
let currentId = state.events[0]?.id || null;
let currentTab = 'overview';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.events)) return data;
    }
  } catch (e) { /* storage unavailable or corrupt: fall back to sample */ }
  return { events: [sampleEvent()] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save to local storage', e);
  }
}

function blankEvent() {
  return {
    id: uid(),
    name: 'Untitled event',
    location: '',
    startDate: '',
    endDate: '',
    expectedAttendees: 0,
    budget: 0,
    notes: '',
    planner: { name: '', company: '', phone: '', email: '' },
    attendees: [],
    suppliers: [],
    expenses: [],
    agenda: [],
  };
}

function sampleEvent() {
  const s1 = uid(), s2 = uid(), s3 = uid();
  return {
    ...blankEvent(),
    name: 'Annual Sales Conference',
    location: 'The Grand Hotel, Brighton',
    startDate: '2026-11-12',
    endDate: '2026-11-13',
    expectedAttendees: 120,
    budget: 25000,
    notes: 'Sample event – edit or delete it once you have added your own.',
    planner: { name: 'Jane Smith', company: 'Smith Events', phone: '07700 900123', email: 'jane@example.com' },
    attendees: [
      { id: uid(), name: 'Sam Patel', email: 'sam.patel@example.com', phone: '', company: 'Acme Ltd', rsvp: 'Confirmed', dietary: 'Vegetarian' },
      { id: uid(), name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '', company: 'Acme Ltd', rsvp: 'Confirmed', dietary: '' },
      { id: uid(), name: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '', company: 'Northwind', rsvp: 'Invited', dietary: 'Gluten free' },
    ],
    suppliers: [
      { id: s1, name: 'The Grand Hotel', service: 'Venue', contactName: 'Events Team', phone: '01273 000000', email: 'events@example.com', notes: '' },
      { id: s2, name: 'Fresh Plate Catering', service: 'Catering', contactName: 'Priya Shah', phone: '01273 111111', email: 'priya@example.com', notes: 'Final numbers 7 days before' },
      { id: s3, name: 'SoundWorks AV', service: 'Audio visual', contactName: 'Tom Reid', phone: '01273 222222', email: 'tom@example.com', notes: '' },
    ],
    expenses: [
      { id: uid(), description: 'Venue hire (2 days)', supplierId: s1, amount: 9500, invoiceNumber: 'GH-1042', dueDate: '2026-10-01', paid: true },
      { id: uid(), description: 'Lunch & refreshments', supplierId: s2, amount: 6200, invoiceNumber: 'FP-311', dueDate: '2026-11-20', paid: false },
      { id: uid(), description: 'Stage, sound & projection', supplierId: s3, amount: 3800, invoiceNumber: 'SW-88', dueDate: '2026-11-01', paid: false },
    ],
    agenda: [
      { id: uid(), date: '2026-11-12', time: '09:00', endTime: '09:30', title: 'Registration & coffee', location: 'Foyer', notes: '' },
      { id: uid(), date: '2026-11-12', time: '09:30', endTime: '10:30', title: 'Opening keynote', location: 'Main hall', notes: '' },
      { id: uid(), date: '2026-11-12', time: '12:30', endTime: '13:30', title: 'Lunch', location: 'Restaurant', notes: '' },
      { id: uid(), date: '2026-11-13', time: '10:00', endTime: '12:00', title: 'Breakout workshops', location: 'Rooms 1–3', notes: '' },
    ],
  };
}

const currentEvent = () => state.events.find((e) => e.id === currentId);

// ---------- Calculations ----------

function totals(ev) {
  const spend = ev.expenses.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const paid = ev.expenses.filter((x) => x.paid).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const budget = Number(ev.budget) || 0;
  return { budget, spend, paid, outstanding: spend - paid, remaining: budget - spend };
}

// ---------- Modal form ----------

const modal = document.getElementById('modal');
const modalForm = document.getElementById('modalForm');
let modalSubmit = null;

/**
 * fields: [{ key, label, type?, options?, required?, section? }]
 * values: initial values object. onSave receives the collected values.
 */
function openForm(title, fields, values, onSave) {
  document.getElementById('modalTitle').textContent = title;
  const container = document.getElementById('modalFields');
  container.innerHTML = fields.map((f) => {
    if (f.section) return `<div class="section">${esc(f.section)}</div>`;
    const v = values[f.key] ?? '';
    const req = f.required ? 'required' : '';
    const name = `name="${f.key}"`;
    if (f.type === 'checkbox') {
      return `<label class="check"><input type="checkbox" ${name} ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    }
    let input;
    if (f.type === 'select') {
      input = `<select ${name} ${req}>${f.options.map((o) => {
        const [val, text] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`;
      }).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea ${name} ${req}>${esc(v)}</textarea>`;
    } else {
      const extra = f.type === 'number' ? 'step="0.01" min="0"' : '';
      input = `<input type="${f.type || 'text'}" ${name} value="${esc(v)}" ${req} ${extra}>`;
    }
    return `<label>${esc(f.label)}${input}</label>`;
  }).join('');

  modalSubmit = () => {
    const out = {};
    fields.forEach((f) => {
      if (!f.key) return;
      const el = modalForm.elements[f.key];
      out[f.key] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? Number(el.value) || 0 : el.value.trim();
    });
    onSave(out);
    save();
    render();
  };
  modal.showModal();
  container.querySelector('input, select, textarea')?.focus();
}

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (modalSubmit) modalSubmit();
  modal.close();
});
document.getElementById('modalCancel').addEventListener('click', () => modal.close());

// ---------- Field definitions ----------

const eventFields = [
  { key: 'name', label: 'Event name', required: true },
  { key: 'location', label: 'Event location' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'expectedAttendees', label: 'Expected number of attendees', type: 'number' },
  { key: 'budget', label: 'Budget (£)', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const plannerFields = [
  { key: 'name', label: 'Planner name' },
  { key: 'company', label: 'Company' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
];

const attendeeFields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'company', label: 'Company / organisation' },
  { key: 'rsvp', label: 'RSVP status', type: 'select', options: ['Invited', 'Confirmed', 'Declined', 'Attended'] },
  { key: 'dietary', label: 'Dietary / access requirements' },
];

const supplierFields = [
  { key: 'name', label: 'Supplier name', required: true },
  { key: 'service', label: 'Service provided (e.g. Venue, Catering, AV)' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const expenseFields = (ev) => [
  { key: 'description', label: 'Description', required: true },
  { key: 'supplierId', label: 'Supplier', type: 'select', options: [['', '— None —'], ...ev.suppliers.map((s) => [s.id, s.name])] },
  { key: 'amount', label: 'Amount (£)', type: 'number', required: true },
  { key: 'invoiceNumber', label: 'Invoice number' },
  { key: 'dueDate', label: 'Due date', type: 'date' },
  { key: 'paid', label: 'Invoice paid', type: 'checkbox' },
];

const agendaFields = (ev) => [
  { key: 'date', label: 'Day', type: 'date', required: true },
  { key: 'time', label: 'Start time', type: 'time' },
  { key: 'endTime', label: 'End time', type: 'time' },
  { key: 'title', label: 'Session / activity', required: true },
  { key: 'location', label: 'Room / location' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

// ---------- Rendering ----------

const main = document.getElementById('main');
const eventList = document.getElementById('eventList');
const searchBox = document.getElementById('eventSearch');

function render() {
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const q = searchBox.value.trim().toLowerCase();
  const events = state.events
    .filter((e) => !q || `${e.name} ${e.location}`.toLowerCase().includes(q))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'));
  eventList.innerHTML = events.length
    ? events.map((e) => `
      <li><button type="button" data-id="${e.id}" class="${e.id === currentId ? 'active' : ''}">
        ${esc(e.name)}
        <span class="sub">${esc(fmtDate(e.startDate) || 'No date')}${e.location ? ' · ' + esc(e.location) : ''}</span>
      </button></li>`).join('')
    : '<li class="muted">No events found</li>';
}

function renderMain() {
  const ev = currentEvent();
  if (!ev) {
    main.innerHTML = `<div class="empty"><p>No event selected.</p><button class="btn primary" data-action="new-event">+ Create your first event</button></div>`;
    return;
  }
  const dates = [fmtDate(ev.startDate), ev.endDate && ev.endDate !== ev.startDate ? fmtDate(ev.endDate) : ''].filter(Boolean).join(' – ');
  const tabs = [
    ['overview', 'Overview'],
    ['attendees', `Attendees (${ev.attendees.length})`],
    ['agenda', 'Agenda'],
    ['suppliers', `Suppliers (${ev.suppliers.length})`],
    ['budget', 'Budget & invoices'],
    ['contacts', 'Contacts'],
  ];

  main.innerHTML = `
    <div class="event-header">
      <div>
        <h2>${esc(ev.name)}</h2>
        <div class="meta">${esc(ev.location || 'No location set')}${dates ? ' · ' + esc(dates) : ''}</div>
      </div>
      <div class="topbar-actions">
        <button class="btn" data-action="edit-event">Edit details</button>
        <button class="btn" data-action="print">Print</button>
        <button class="btn danger" data-action="delete-event">Delete</button>
      </div>
    </div>
    <nav class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${k === currentTab ? 'active' : ''}">${esc(t)}</button>`).join('')}</nav>
    <section>${views[currentTab](ev)}</section>`;
}

function statCards(ev) {
  const t = totals(ev);
  const confirmed = ev.attendees.filter((a) => a.rsvp === 'Confirmed' || a.rsvp === 'Attended').length;
  return `
    <div class="cards">
      <div class="card"><div class="label">Attendees</div><div class="value">${ev.attendees.length}${ev.expectedAttendees ? ` <span class="muted" style="font-size:.9rem">/ ${ev.expectedAttendees} expected</span>` : ''}</div></div>
      <div class="card"><div class="label">Confirmed</div><div class="value">${confirmed}</div></div>
      <div class="card"><div class="label">Budget</div><div class="value">${fmtMoney(t.budget)}</div></div>
      <div class="card"><div class="label">Spend</div><div class="value">${fmtMoney(t.spend)}</div></div>
      <div class="card"><div class="label">Invoices paid</div><div class="value good">${fmtMoney(t.paid)}</div></div>
      <div class="card"><div class="label">Outstanding</div><div class="value ${t.outstanding > 0 ? 'bad' : ''}">${fmtMoney(t.outstanding)}</div></div>
      <div class="card"><div class="label">Budget remaining</div><div class="value ${t.remaining < 0 ? 'bad' : 'good'}">${fmtMoney(t.remaining)}</div></div>
    </div>`;
}

function budgetBar(ev) {
  const t = totals(ev);
  const pct = t.budget ? Math.round((t.spend / t.budget) * 100) : 0;
  return `
    <div class="panel">
      <div class="panel-head"><h3>Budget used</h3><span class="muted">${fmtMoney(t.spend)} of ${fmtMoney(t.budget)} (${pct}%)</span></div>
      <div class="progress ${pct > 100 ? 'over' : ''}"><div style="width:${Math.min(pct, 100)}%"></div></div>
    </div>`;
}

function contactCard(c, title) {
  return `
    <div class="contact">
      ${title ? `<span class="badge neutral">${esc(title)}</span>` : ''}
      <strong>${esc(c.name || c.contactName || '—')}</strong>
      ${c.contactName && c.name ? `<div class="muted">Contact: ${esc(c.contactName)}</div>` : ''}
      ${c.company ? `<div class="muted">${esc(c.company)}</div>` : ''}
      ${c.phone ? `<div><a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></div>` : ''}
      ${c.email ? `<div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
    </div>`;
}

function agendaByDay(ev) {
  const byDay = {};
  [...ev.agenda]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .forEach((item) => (byDay[item.date] ||= []).push(item));
  return byDay;
}

const views = {
  overview(ev) {
    const upcoming = ev.expenses.filter((x) => !x.paid).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 5);
    return `
      ${statCards(ev)}
      ${budgetBar(ev)}
      <div class="panel">
        <div class="panel-head"><h3>Event planner</h3><button class="btn small" data-action="edit-planner">Edit</button></div>
        <div class="contact-grid">${contactCard(ev.planner)}</div>
      </div>
      <div class="panel">
        <h3>Unpaid invoices</h3>
        ${upcoming.length ? `<div class="table-wrap"><table>
          <tr><th>Description</th><th>Supplier</th><th>Due</th><th class="num">Amount</th></tr>
          ${upcoming.map((x) => `<tr><td>${esc(x.description)}</td><td>${esc(supplierName(ev, x.supplierId))}</td><td>${esc(fmtDate(x.dueDate))}</td><td class="num">${fmtMoney(x.amount)}</td></tr>`).join('')}
        </table></div>` : '<p class="muted">All invoices are paid.</p>'}
      </div>
      ${ev.notes ? `<div class="panel"><h3>Notes</h3><p style="white-space:pre-wrap;margin:0">${esc(ev.notes)}</p></div>` : ''}`;
  },

  attendees(ev) {
    const counts = ['Invited', 'Confirmed', 'Declined', 'Attended'].map((s) => `${s}: ${ev.attendees.filter((a) => a.rsvp === s).length}`).join(' · ');
    return `
      <div class="panel">
        <div class="panel-head">
          <div><h3>Attendee list</h3><span class="muted">${ev.attendees.length} attendees${ev.expectedAttendees ? ` of ${ev.expectedAttendees} expected` : ''} · ${counts}</span></div>
          <div class="topbar-actions">
            <button class="btn small" data-action="export-attendees">Download CSV</button>
            <button class="btn primary small" data-action="add-attendee">+ Add attendee</button>
          </div>
        </div>
        ${ev.attendees.length ? `<div class="table-wrap"><table>
          <tr><th>#</th><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>RSVP</th><th>Dietary / access</th><th></th></tr>
          ${ev.attendees.map((a, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td>${esc(a.name)}</td><td>${esc(a.company)}</td>
            <td>${a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ''}</td>
            <td>${esc(a.phone)}</td>
            <td><span class="badge ${a.rsvp === 'Declined' ? 'unpaid' : a.rsvp === 'Invited' ? 'neutral' : 'paid'}">${esc(a.rsvp)}</span></td>
            <td>${esc(a.dietary)}</td>
            <td class="actions">${rowButtons('attendee', a.id)}</td>
          </tr>`).join('')}
        </table></div>` : '<p class="muted">No attendees yet.</p>'}
      </div>`;
  },

  agenda(ev) {
    const byDay = agendaByDay(ev);
    const days = Object.keys(byDay);
    return `
      <div class="panel">
        <div class="panel-head"><h3>Days agenda</h3><button class="btn primary small" data-action="add-agenda">+ Add session</button></div>
        ${days.length ? days.map((d, i) => `
          <div class="day">
            <h4>Day ${i + 1} – ${esc(fmtDate(d))}</h4>
            <div class="table-wrap"><table>
              <tr><th style="width:130px">Time</th><th>Session</th><th>Location</th><th>Notes</th><th></th></tr>
              ${byDay[d].map((a) => `<tr>
                <td>${esc(a.time)}${a.endTime ? '–' + esc(a.endTime) : ''}</td>
                <td>${esc(a.title)}</td><td>${esc(a.location)}</td><td>${esc(a.notes)}</td>
                <td class="actions">${rowButtons('agenda', a.id)}</td>
              </tr>`).join('')}
            </table></div>
          </div>`).join('') : '<p class="muted">No sessions yet.</p>'}
      </div>`;
  },

  suppliers(ev) {
    return `
      <div class="panel">
        <div class="panel-head"><h3>Suppliers used</h3><button class="btn primary small" data-action="add-supplier">+ Add supplier</button></div>
        ${ev.suppliers.length ? `<div class="table-wrap"><table>
          <tr><th>Supplier</th><th>Service</th><th>Contact</th><th>Phone</th><th>Email</th><th class="num">Spend</th><th></th></tr>
          ${ev.suppliers.map((s) => {
            const spend = ev.expenses.filter((x) => x.supplierId === s.id).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
            return `<tr>
              <td>${esc(s.name)}${s.notes ? `<div class="muted" style="font-size:.85rem">${esc(s.notes)}</div>` : ''}</td>
              <td>${esc(s.service)}</td><td>${esc(s.contactName)}</td>
              <td>${s.phone ? `<a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a>` : ''}</td>
              <td>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}</td>
              <td class="num">${fmtMoney(spend)}</td>
              <td class="actions">${rowButtons('supplier', s.id)}</td>
            </tr>`;
          }).join('')}
        </table></div>` : '<p class="muted">No suppliers yet.</p>'}
      </div>`;
  },

  budget(ev) {
    const t = totals(ev);
    return `
      ${statCards(ev)}
      ${budgetBar(ev)}
      <div class="panel">
        <div class="panel-head"><h3>Spend & invoices</h3><button class="btn primary small" data-action="add-expense">+ Add cost / invoice</button></div>
        ${ev.expenses.length ? `<div class="table-wrap"><table>
          <tr><th>Description</th><th>Supplier</th><th>Invoice #</th><th>Due</th><th class="num">Amount</th><th>Status</th><th></th></tr>
          ${ev.expenses.map((x) => `<tr>
            <td>${esc(x.description)}</td><td>${esc(supplierName(ev, x.supplierId))}</td>
            <td>${esc(x.invoiceNumber)}</td><td>${esc(fmtDate(x.dueDate))}</td>
            <td class="num">${fmtMoney(x.amount)}</td>
            <td><button class="badge ${x.paid ? 'paid' : 'unpaid'}" style="border:none;cursor:pointer" data-action="toggle-paid" data-id="${x.id}" title="Click to toggle">${x.paid ? 'Paid' : 'Unpaid'}</button></td>
            <td class="actions">${rowButtons('expense', x.id)}</td>
          </tr>`).join('')}
          <tfoot><tr><td colspan="4">Total spend</td><td class="num">${fmtMoney(t.spend)}</td><td colspan="2"></td></tr></tfoot>
        </table></div>` : '<p class="muted">No costs recorded yet.</p>'}
      </div>`;
  },

  contacts(ev) {
    return `
      <div class="panel">
        <div class="panel-head"><h3>Event planner contact details</h3><button class="btn small" data-action="edit-planner">Edit</button></div>
        <div class="contact-grid">${contactCard(ev.planner, 'Event planner')}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Supplier contact details</h3><button class="btn primary small" data-action="add-supplier">+ Add supplier</button></div>
        ${ev.suppliers.length ? `<div class="contact-grid">${ev.suppliers.map((s) => contactCard(s, s.service)).join('')}</div>` : '<p class="muted">No suppliers yet.</p>'}
      </div>`;
  },
};

function supplierName(ev, id) {
  return ev.suppliers.find((s) => s.id === id)?.name || '';
}

function rowButtons(type, id) {
  return `<button class="btn small" data-action="edit-${type}" data-id="${id}">Edit</button>
          <button class="btn small danger" data-action="delete-${type}" data-id="${id}" aria-label="Delete">✕</button>`;
}

// ---------- Actions ----------

const collections = {
  attendee: { list: 'attendees', title: 'attendee', fields: () => attendeeFields, defaults: { rsvp: 'Invited' } },
  supplier: { list: 'suppliers', title: 'supplier', fields: () => supplierFields, defaults: {} },
  expense: { list: 'expenses', title: 'cost / invoice', fields: expenseFields, defaults: { paid: false } },
  agenda: { list: 'agenda', title: 'agenda session', fields: agendaFields, defaults: {} },
};

function addItem(type) {
  const ev = currentEvent();
  const c = collections[type];
  const defaults = { ...c.defaults };
  if (type === 'agenda') defaults.date = ev.agenda.at(-1)?.date || ev.startDate || '';
  openForm(`Add ${c.title}`, c.fields(ev), defaults, (vals) => ev[c.list].push({ id: uid(), ...vals }));
}

function editItem(type, id) {
  const ev = currentEvent();
  const c = collections[type];
  const item = ev[c.list].find((x) => x.id === id);
  if (!item) return;
  openForm(`Edit ${c.title}`, c.fields(ev), item, (vals) => Object.assign(item, vals));
}

function deleteItem(type, id) {
  const ev = currentEvent();
  const c = collections[type];
  if (!confirm(`Delete this ${c.title}?`)) return;
  ev[c.list] = ev[c.list].filter((x) => x.id !== id);
  if (type === 'supplier') ev.expenses.forEach((x) => { if (x.supplierId === id) x.supplierId = ''; });
  save();
  render();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s) {
  return (s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const actions = {
  'new-event'() {
    openForm('New event', eventFields, blankEvent(), (vals) => {
      const ev = { ...blankEvent(), ...vals };
      state.events.push(ev);
      currentId = ev.id;
      currentTab = 'overview';
    });
  },
  'edit-event'() {
    const ev = currentEvent();
    openForm('Edit event details', eventFields, ev, (vals) => Object.assign(ev, vals));
  },
  'delete-event'() {
    const ev = currentEvent();
    if (!confirm(`Delete "${ev.name}" and all its data? This cannot be undone.`)) return;
    state.events = state.events.filter((e) => e.id !== ev.id);
    currentId = state.events[0]?.id || null;
    save();
    render();
  },
  'edit-planner'() {
    const ev = currentEvent();
    openForm('Event planner contact details', plannerFields, ev.planner, (vals) => { ev.planner = vals; });
  },
  'toggle-paid'(id) {
    const x = currentEvent().expenses.find((e) => e.id === id);
    if (x) { x.paid = !x.paid; save(); render(); }
  },
  'export-attendees'() {
    const ev = currentEvent();
    const rows = [['Name', 'Company', 'Email', 'Phone', 'RSVP', 'Dietary / access'],
      ...ev.attendees.map((a) => [a.name, a.company, a.email, a.phone, a.rsvp, a.dietary])];
    download(`${slug(ev.name)}-attendees.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  },
  print() { window.print(); },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { currentTab = tab.dataset.tab; renderMain(); return; }

  const eventBtn = e.target.closest('#eventList button[data-id]');
  if (eventBtn) { currentId = eventBtn.dataset.id; render(); return; }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const m = action.match(/^(add|edit|delete)-(attendee|supplier|expense|agenda)$/);
  if (m) {
    ({ add: addItem, edit: editItem, delete: deleteItem })[m[1]](m[2], id);
  } else if (actions[action]) {
    actions[action](id);
  }
});

document.getElementById('newEventBtn').addEventListener('click', () => actions['new-event']());
searchBox.addEventListener('input', renderSidebar);

document.getElementById('exportBtn').addEventListener('click', () => {
  download(`event-planner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json');
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.events)) throw new Error('Missing events list');
    if (!confirm(`Import ${data.events.length} event(s)? This replaces your current data.`)) return;
    state = data;
    currentId = state.events[0]?.id || null;
    save();
    render();
  } catch (err) {
    alert('Could not import file: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

render();
