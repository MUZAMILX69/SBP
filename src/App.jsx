import React, { useState, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  LayoutDashboard, ClipboardList, Boxes, Receipt, PackageCheck, Truck,
  Plus, Trash2, Pencil, Check, X, Printer, Search, ChevronDown, ChevronRight,
  Loader2, Lock, LogOut, Users, ArrowUpDown, Download
} from "lucide-react";

/* ================= Supabase ================= */
const SUPABASE_URL = "https://eovfcjadpyjxavymtqwf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UmpsvgnasiG799Xpw86KlA_UQv-plKX";
let ACCESS_TOKEN = null;
const setAccessToken = (t) => { ACCESS_TOKEN = t; };

async function sbRequest(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${ACCESS_TOKEN || SUPABASE_ANON_KEY}`, "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.msg || data.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
const authSignIn = (email, password) => sbRequest("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
const authSignUp = (email, password, fullName) => sbRequest("/auth/v1/signup", { method: "POST", body: { email, password, data: fullName ? { full_name: fullName } : undefined } });
const authRefresh = (rt) => sbRequest("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: rt } });
const authRecover = (email) => sbRequest("/auth/v1/recover", { method: "POST", body: { email } });

const toCamelKey = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toSnakeKey = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const rowToCamel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamelKey(k), v]));
const rowsToCamel = (rows) => (rows || []).map(rowToCamel);
const objToSnake = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnakeKey(k), v]));
const sbList = async (table, query = "?select=*") => rowsToCamel(await sbRequest(`/rest/v1/${table}${query}`));
const sbInsert = async (table, rows) => { if (!rows.length) return; await sbRequest(`/rest/v1/${table}`, { method: "POST", body: rows.map(objToSnake), headers: { Prefer: "return=minimal" } }); };
const sbUpdate = async (table, id, patch) => { const { id: _d, ...rest } = patch; await sbRequest(`/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", body: objToSnake(rest), headers: { Prefer: "return=minimal" } }); };
const sbDeleteById = async (table, id) => { await sbRequest(`/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); };
async function syncTable(table, prevArr, nextArr) {
  const prevMap = new Map(prevArr.map((x) => [x.id, x]));
  const nextMap = new Map(nextArr.map((x) => [x.id, x]));
  const toInsert = nextArr.filter((x) => !prevMap.has(x.id));
  const toDelete = prevArr.filter((x) => !nextMap.has(x.id));
  const toUpdate = nextArr.filter((x) => { const p = prevMap.get(x.id); return p && JSON.stringify(p) !== JSON.stringify(x); });
  const ops = [];
  if (toInsert.length) ops.push(sbInsert(table, toInsert));
  toDelete.forEach((x) => ops.push(sbDeleteById(table, x.id)));
  toUpdate.forEach((x) => ops.push(sbUpdate(table, x.id, x)));
  await Promise.all(ops);
}
const saveRefreshToken = (t) => { try { sessionStorage.setItem("sbs-refresh-token", t); } catch (e) {} };
const loadRefreshToken = () => { try { return sessionStorage.getItem("sbs-refresh-token"); } catch (e) { return null; } };
const clearRefreshToken = () => { try { sessionStorage.removeItem("sbs-refresh-token"); } catch (e) {} };

/* ================= utils ================= */
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16); });
const money = (n) => "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });
const num = (n, d = 2) => (Number(n) || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: d });
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const confirmDelete = (label) => window.confirm(`Delete ${label || "this"}? This can't be undone.`);
const N = (x) => Number(x || 0);
const tightDesc = (s) => String(s || "").replace(/\s*[x×]\s*/i, "x").replace(/\s*\/\s*/, "/").replace(/\s+/g, " ").trim();

function buildSequentialLabelMap(arr, idKey, prefix) {
  const sorted = [...arr].sort((a, b) => {
    const ca = a.createdAt || "", cb = b.createdAt || "";
    if (ca && cb) return ca < cb ? -1 : ca > cb ? 1 : 0;
    const da = a.date || "", db = b.date || "";
    if (da !== db) return da < db ? -1 : 1;
    return String(a[idKey] || a.id) < String(b[idKey] || b.id) ? -1 : 1;
  });
  const map = new Map(); let n = 0;
  sorted.forEach((x) => { const k = x[idKey] || x.id; if (!map.has(k)) { n += 1; map.set(k, `${prefix}-${n}`); } });
  return map;
}
const groupByDate = (arr) => { const m = {}; arr.forEach((x) => { (m[x.date] = m[x.date] || []).push(x); }); return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1)); };
const sortGroups = (groups, sort, getters) => {
  let gs = [...groups];
  if (sort.field === "date") gs.sort((a, b) => (a[0] < b[0] ? -1 : 1) * (sort.dir === "asc" ? 1 : -1));
  else gs.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const g = getters[sort.field];
  if (g) { const dir = sort.dir === "asc" ? 1 : -1; gs = gs.map(([d, rs]) => [d, [...rs].sort((a, b) => (g(a) - g(b)) * dir)]); }
  return gs;
};
const sortRows = (rows, sort, getters) => {
  const g = getters[sort.field]; if (!g) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => { const va = g(a), vb = g(b); if (typeof va === "string") return va.localeCompare(vb) * dir; return (va - vb) * dir; });
};

/* ================= stock engine (In − Purchase − Udhaar) ================= */
function calculatePktStock({ descriptions, pktIn, purchases, udhaar, descLabel }) {
  const rows = new Map();
  const ensure = (id, snap) => {
    if (!rows.has(id)) {
      const d = descriptions.find((x) => x.id === id);
      rows.set(id, {
        descriptionId: id, description: d ? descLabel(d) : tightDesc(snap || "(removed)"), pktsPerPlt: d ? N(d.pktsPerPlt) : 0,
        inPlts: 0, inPkts: 0, inWeight: 0, purPlts: 0, purPkts: 0, purWeight: 0, purAmount: 0, udPlts: 0, udPkts: 0, udWeight: 0,
      });
    }
    return rows.get(id);
  };
  pktIn.forEach((t) => { const r = ensure(t.descriptionId, t.descriptionSnapshot); r.inPlts += N(t.plts); r.inPkts += N(t.totalPkts); r.inWeight += N(t.weight); });
  purchases.forEach((t) => { const r = ensure(t.descriptionId, t.descriptionSnapshot); r.purPlts += N(t.plts); r.purPkts += N(t.totalPkts); r.purWeight += N(t.weight); r.purAmount += N(t.totalAmount); });
  udhaar.forEach((t) => { const r = ensure(t.descriptionId, t.descriptionSnapshot); r.udPlts += N(t.plts); r.udPkts += N(t.totalPkts); r.udWeight += N(t.weight); });
  return [...rows.values()].map((r) => ({
    ...r,
    totalPlts: r.inPlts, totalPkts: r.inPkts, totalWeight: r.inWeight,
    godownPlts: r.inPlts - r.purPlts, godownPkts: r.inPkts - r.purPkts, godownWeight: r.inWeight - r.purWeight,
    availablePlts: r.inPlts - r.purPlts - r.udPlts, availablePkts: r.inPkts - r.purPkts - r.udPkts, availableWeight: r.inWeight - r.purWeight - r.udWeight,
  })).sort((a, b) => a.description.localeCompare(b.description));
}
const suggestPlts = (perPlt, udhaarPkts) => {
  const pp = N(perPlt), ud = N(udhaarPkts);
  if (!pp || ud <= 0) return 0;
  const full = Math.floor(ud / pp);
  const rem = ud - full * pp;
  return full + (rem >= 0.75 * pp ? 1 : 0);
};

function printHTML(title, bodyHtml) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title><style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#23261F;padding:24px}h1{font-size:17px;text-transform:uppercase;margin:0 0 4px}.meta{font-size:11px;color:#666;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}th,td{padding:5px 7px;border-bottom:1px solid #ccc;text-align:left}th{font-size:9px;text-transform:uppercase;color:#666;border-bottom:1.5px solid #23261F}tfoot td{font-weight:bold;border-top:1.5px solid #23261F;border-bottom:none}.tag{font-family:monospace}tr.hot td{background:#fdf1d7}tr.over td{background:#fdeaea}</style></head><body><h1>${esc(title)}</h1><div class="meta">Printed ${esc(new Date().toLocaleString("en-GB"))}</div>${bodyHtml}</body></html>`);
  doc.close();
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 1000); }, 250);
}
/* Download real, searchable, paginated PDF reports. */
function downloadReportFile(title, bodyHtml) {
  try {
    const source = new DOMParser().parseFromString(bodyHtml, "text/html");
    const saleBase = title === "Sale Base Stock";
    const pdf = new jsPDF({ orientation: saleBase ? "portrait" : "landscape", unit: "mm", format: "a4" });
    const margin = saleBase ? 8 : 12;
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    const clean = (text) => String(text || "").replace(/\u2212/g, "-").replace(/\u202f|\u00a0/g, " ");
    let y = 18;
    const addText = (text, size, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(27, 37, 89);
      const lines = pdf.splitTextToSize(clean(text), width - margin * 2);
      for (const line of lines) {
        if (y > height - 20) { pdf.addPage(); y = 18; }
        pdf.text(line, margin, y);
        y += size * 0.45;
      }
      y += 3;
    };
    addText(title, 17, true);
    addText(`Downloaded ${new Date().toLocaleString("en-GB")}`, 9);
    for (const element of source.body.children) {
      if (element.tagName !== "TABLE") {
        if (element.textContent.trim()) addText(element.textContent, 11, /^H[1-6]$/.test(element.tagName));
        continue;
      }
      if (y > height - 35) { pdf.addPage(); y = 18; }
      autoTable(pdf, {
        html: element,
        includeHiddenHtml: true,
        startY: y,
        margin: { top: 12, right: margin, bottom: 16, left: margin },
        theme: saleBase ? "grid" : "striped",
        styles: { font: "helvetica", fontSize: saleBase ? 7 : 8, cellPadding: saleBase ? 1.5 : 2.5, overflow: "linebreak", textColor: [23, 50, 77], ...(saleBase ? { lineWidth: 0.15, lineColor: [180, 188, 205], valign: "middle" } : {}) },
        ...(saleBase ? { columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 19, halign: "center" },
          2: { cellWidth: 20, halign: "center" },
          3: { cellWidth: 15, halign: "center" },
          4: { cellWidth: 28, halign: "center" },
          5: { cellWidth: 25, halign: "right" },
          6: { cellWidth: 31, halign: "right" },
        } } : {}),
        headStyles: { fillColor: [67, 24, 255], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [238, 234, 255], textColor: [67, 24, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 249, 255] },
        showHead: "everyPage",
        showFoot: "lastPage",
        rowPageBreak: "avoid",
        didParseCell: (data) => {
          data.cell.text = data.cell.text.map(clean);
          const row = data.cell.raw?.parentElement;
          if (row?.classList.contains("hot")) data.cell.styles.fillColor = [253, 241, 215];
          if (row?.classList.contains("over")) data.cell.styles.fillColor = [253, 234, 234];
        },
      });
      y = pdf.lastAutoTable.finalY + 8;
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text(`Page ${page} of ${pages}`, width - margin, height - 7, { align: "right" });
    }
    pdf.save((title.replace(/[^\w\-]+/g, "_") || "Report") + ".pdf");
  } catch (error) {
    console.error("PDF export failed", error);
    window.alert("PDF download failed: " + (error.message || "Please try again."));
  }
}

/* ================= nav ================= */
const NAV_GROUPS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
  { id: "masters", label: "Masters", icon: ClipboardList, children: [
    { id: "m-brands", label: "Brands", view: "m-brands" },
    { id: "m-suppliers", label: "Suppliers", view: "m-suppliers" },
    { id: "m-desc", label: "PKT Descriptions", view: "m-desc" },
  ] },
  { id: "pkt-in", label: "PKT In", icon: Boxes, children: [
    { id: "in-entries", label: "Entries", view: "in-entries" },
    { id: "in-report", label: "Report", view: "in-report" },
    { id: "in-edit", label: "Edit", view: "in-edit" },
  ] },
  { id: "purchases", label: "Purchases", icon: Receipt, children: [
    { id: "pu-entries", label: "Entries", view: "pu-entries" },
    { id: "pu-report", label: "Report", view: "pu-report" },
    { id: "pu-edit", label: "Edit", view: "pu-edit" },
  ] },
  { id: "udhaar", label: "Udhaar", icon: PackageCheck, children: [
    { id: "ud-entries", label: "Entries", view: "ud-entries" },
    { id: "ud-table", label: "Udhaar Table", view: "ud-table" },
    { id: "ud-report", label: "Report", view: "ud-report" },
    { id: "ud-edit", label: "Edit", view: "ud-edit" },
  ] },
  { id: "stock", label: "Stock Reports", icon: Truck, children: [
    { id: "stock-main", label: "PKT Stock", view: "stock" },
    { id: "stock-salebase", label: "Sale Base Stock", view: "salebase-stock" },
  ] },
];
const VIEW_TITLES = {
  dashboard: "Dashboard", "m-brands": "Brands", "m-suppliers": "Suppliers", "m-desc": "PKT Description Master",
  "in-entries": "PKT In (Stock In)", "in-report": "PKT In Report", "in-edit": "PKT In — Edit",
  "pu-entries": "PKT Purchases", "pu-report": "Purchase Report", "pu-edit": "Purchases — Edit",
  "ud-entries": "PKT Udhaar — Entries", "ud-table": "PKT Udhaar", "ud-report": "Udhaar Report", "ud-edit": "Udhaar — Edit",
  stock: "PKT Stock Report", "salebase-stock": "Sale Base Stock", team: "Team & access",
};
const groupForView = (view) => { const g = NAV_GROUPS.find((g) => g.children && g.children.some((c) => c.view === view)); return g ? g.id : null; };

/* ================= shell ================= */
function Rail({ view, setView, isAdmin, onSignOut, permissions }) {
  const activeGroup = view === "dashboard" ? "dashboard" : view === "team" ? "team" : groupForView(view);
  const groupPermMap = { dashboard: "dashboard", masters: "masters", "pkt-in": "pktIn", purchases: "purchases", udhaar: "udhaar", stock: "stock" };
  const canViewModule = (moduleId) => { if (isAdmin) return true; return !!(permissions && permissions[moduleId] && permissions[moduleId].view === true); };
  const filteredGroups = NAV_GROUPS.filter((g) => canViewModule(groupPermMap[g.id]));
  const groups = isAdmin ? [...filteredGroups, { id: "team", label: "Team & access", icon: Users, view: "team" }] : filteredGroups;
  const [openId, setOpenId] = useState(activeGroup);
  useEffect(() => { if (activeGroup) setOpenId(activeGroup); }, [activeGroup]);
  useEffect(() => {
    if (!groups.some((g) => g.id === activeGroup || (g.children && g.children.some((c) => c.view === view)))) {
      if (view !== "dashboard") setView("dashboard");
    }
  }, [groups, view, activeGroup]); // eslint-disable-line
  const onGroup = (g) => {
    if (!g.children) { setView(g.view); return; }
    const willOpen = openId !== g.id;
    setOpenId(willOpen ? g.id : null);
    if (willOpen && !g.children.some((c) => c.view === view)) setView(g.children[0].view);
  };
  return (
    <aside className="rail no-print">
      <div className="rail-top">
        <div className="rail-logo"><Boxes size={20} /></div>
        <div className="rail-brand"><div className="rail-brand-title">SALE BASE</div><div className="rail-brand-sub">Stock · PKT</div></div>
      </div>
      <nav className="rail-nav">
        {groups.map((g) => {
          const Icon = g.icon; const active = activeGroup === g.id; const isOpen = openId === g.id;
          return (
            <div className="rail-group" key={g.id}>
              <button className={"rail-btn " + (active ? "active" : "")} title={g.label} onClick={() => onGroup(g)}>
                <Icon size={17} /><span className="rail-label">{g.label}</span>
                {g.children && <ChevronRight size={13} className={"rail-chevron " + (isOpen ? "open" : "")} />}
              </button>
              {g.children && (
                <div className={"rail-drop " + (isOpen ? "open" : "")}>
                  <div className="rail-drop-inner">
                    <div className="rail-children">
                      {g.children.map((c) => (
                        <button key={c.id} className={"rail-child " + (view === c.view ? "active" : "")} onClick={() => setView(c.view)}>{c.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="rail-foot"><button className="rail-btn rail-signout" onClick={onSignOut}><LogOut size={17} /><span className="rail-label">Sign out</span></button></div>
    </aside>
  );
}
const Stamp = ({ children, tone = "gray" }) => <span className={`stamp stamp-${tone}`}>{children}</span>;
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const EmptyRow = ({ children }) => <div className="empty-row">{children}</div>;
const LockedNote = ({ text }) => <div className="locked-panel"><Lock size={15} /><span>{text || "You don't have permission to view this."}</span></div>;
const SectionHead = ({ title, onPrint, onDownload }) => (
  <div className="section-head">
    <h2>{title}</h2>
    {(onPrint || onDownload) && (
      <div style={{ display: "flex", gap: 8 }}>
        {onDownload && <button className="btn no-print download-btn" onClick={onDownload}><Download size={14} /> Download</button>}
        {onPrint && <button className="btn no-print" onClick={onPrint}><Printer size={14} /> Print</button>}
      </div>
    )}
  </div>
);
function SortControl({ value, onChange, options }) {
  return (
    <Field label="Sort by">
      <div className="sort-control">
        <select value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className="btn sort-dir-btn" onClick={() => onChange({ ...value, dir: value.dir === "asc" ? "desc" : "asc" })}>
          <ArrowUpDown size={13} /> {value.dir === "asc" ? "Low → High" : "High → Low"}
        </button>
      </div>
    </Field>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ================= description picker (1-click search + programmatic focus) ================= */
function DescPicker({ ctx, value, onChange, placeholder, apiRef }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState(null);
  const boxRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const selected = ctx.descOf(value);
  const label = selected ? ctx.descLabel(selected) : "";
  const q = query.trim().toLowerCase();
  const list = ctx.descriptions.filter((d) => d.active !== false && (!q || ctx.descLabel(d).toLowerCase().includes(q)));
  const place = () => { if (boxRef.current) setRect(boxRef.current.getBoundingClientRect()); };
  useEffect(() => {
    if (apiRef) apiRef.current = () => { setOpen(true); setQuery(""); };
    return () => { if (apiRef) apiRef.current = null; };
  }, [apiRef]);
  useEffect(() => { if (open) place(); }, [open]);
  useEffect(() => { if (open && rect && searchRef.current) searchRef.current.focus(); }, [open, rect]);
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open]);
  const pick = (d) => { onChange(d.id); setOpen(false); setQuery(""); };
  let panelStyle = null;
  if (open && rect) {
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const flip = spaceBelow < 160 && rect.top - 12 > spaceBelow;
    panelStyle = flip
      ? { position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, maxHeight: Math.min(260, rect.top - 12), zIndex: 1200 }
      : { position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: Math.min(260, spaceBelow), zIndex: 1200 };
  }
  return (
    <div className="desc-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setQuery(""); } }}>
      <style>{`.desc-picker{position:relative;width:100%;min-width:0}
.desc-picker .dp-box{display:flex;align-items:center;gap:8px;width:100%;background:#fff;border:1px solid #e3e9f0;border-radius:9px;padding:8px 10px;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#17324d;cursor:pointer;text-align:left}
.desc-picker .dp-box:hover{border-color:#4318FF}
.desc-picker .dp-box>svg{color:#7b8ba3;flex-shrink:0}
.desc-picker .dp-val{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.desc-picker .dp-ph{flex:1;color:#9aa7b8;font-weight:500}
.desc-picker .dp-clear{border:none;background:transparent;color:#7b8ba3;cursor:pointer;padding:2px;border-radius:5px;display:inline-flex}
.desc-picker .dp-clear:hover{color:#e5484d;background:#fdeaea}
.desc-picker .dp-panel{background:#fff;border:1px solid #dfe7ef;border-radius:12px;box-shadow:0 14px 40px rgba(23,50,77,.25);overflow:hidden;display:flex;flex-direction:column}
.desc-picker .dp-search{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #e3e9f0;flex-shrink:0}
.desc-picker .dp-search svg{color:#7b8ba3;flex-shrink:0}
.desc-picker .dp-search input{border:none;background:transparent;width:100%;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#17324d}
.desc-picker .dp-search input:focus{outline:none}
.desc-picker .dp-list{overflow-y:auto;flex:1}
.desc-picker .dp-opt{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:9px 12px;border:none;border-top:1px solid #eef2f6;background:#fff;cursor:pointer;text-align:left}
.desc-picker .dp-opt:first-child{border-top:none}
.desc-picker .dp-opt:hover{background:#eef0ff}
.desc-picker .dp-name{font-size:12.5px;font-weight:700;color:#17324d}
.desc-picker .dp-badge{font-family:'JetBrains Mono',monospace;font-size:10px;color:#7551FF;background:#eef0ff;border-radius:999px;padding:3px 9px;white-space:nowrap}
.desc-picker .dp-empty{padding:12px;font-size:12px;color:#7b8ba3;font-weight:600}`}</style>
      <button ref={boxRef} type="button" className="dp-box" onClick={() => setOpen((o) => !o)}>
        <Search size={13} />
        <span className={label ? "dp-val" : "dp-ph"}>{label || placeholder || "Type to search item…"}</span>
        {selected && (
          <span className="dp-clear" title="Clear" onClick={(e) => { e.stopPropagation(); onChange(""); setQuery(""); }}>
            <X size={12} />
          </span>
        )}
      </button>
      {open && panelStyle && (
        <div className="dp-panel" style={panelStyle}>
          <div className="dp-search">
            <Search size={13} />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              placeholder="Type to search item…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                if (e.key === "Enter" && list[0]) { e.preventDefault(); pick(list[0]); }
              }}
            />
          </div>
          <div className="dp-list">
            {list.length === 0 && <div className="dp-empty">No matching item — try “20x30” or “270”.</div>}
            {list.map((d) => (
              <button type="button" key={d.id} className="dp-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)}>
                <span className="dp-name">{ctx.descLabel(d)}</span>
                <span className="dp-badge">{num(d.pktsPerPlt, 0)} /PLT</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= masters ================= */
function NameListEditor({ title, items, setItems, withContact, placeholder, canManage, isAdmin, blockedIds = [] }) {
  const [name, setName] = useState(""); const [contact, setContact] = useState("");
  const [editId, setEditId] = useState(null); const [en, setEn] = useState(""); const [ec, setEc] = useState("");
  const add = () => {
    if (!name.trim()) return;
    const item = { id: uid(), name: name.trim() };
    if (withContact) item.contact = contact.trim() || null;
    setItems([...items, item]);
    setName(""); setContact("");
  };
  const save = () => {
    if (!en.trim()) return;
    setItems(items.map((it) => {
      if (it.id !== editId) return it;
      const item = { ...it, name: en.trim() };
      if (withContact) item.contact = ec.trim() || null;
      else delete item.contact;
      return item;
    }));
    setEditId(null);
  };
  const remove = (id) => { if (blockedIds.includes(id)) return; if (!confirmDelete(title.slice(0, -1))) return; setItems(items.filter((it) => it.id !== id)); };
  return (
    <div>
      <SectionHead title={title} />
      {canManage && (
        <div className="ticket-form">
          <div className="grid-2">
            <Field label={title.slice(0, -1) + " name"}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} /></Field>
            {withContact && <Field label="Contact (optional)"><input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>}
          </div>
          <button className="btn primary" onClick={add}><Plus size={14} /> Add</button>
        </div>
      )}
      <div className="list panel-list">
        {items.length === 0 && <EmptyRow>Nothing added yet.</EmptyRow>}
        {items.map((it) => (
          <div className="row" key={it.id}>
            {editId === it.id ? (
              <div className="edit-row">
                <input value={en} onChange={(e) => setEn(e.target.value)} />
                {withContact && <input value={ec} onChange={(e) => setEc(e.target.value)} />}
                <button className="icon-btn" onClick={save}><Check size={15} /></button>
                <button className="icon-btn" onClick={() => setEditId(null)}><X size={15} /></button>
              </div>
            ) : (
              <>
                <div><div className="row-title">{it.name}</div>{it.contact && <div className="row-sub">{it.contact}</div>}</div>
                <div className="row-actions">
                  {canManage && <button className="icon-btn" onClick={() => { setEditId(it.id); setEn(it.name); setEc(it.contact || ""); }}><Pencil size={15} /></button>}
                  {isAdmin && <button className="icon-btn" disabled={blockedIds.includes(it.id)} onClick={() => remove(it.id)}><Trash2 size={15} /></button>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
function DescriptionsEditor({ ctx, canManage, isAdmin }) {
  const { descriptions, brands, persist, descLabel, pktWeight, brandName, descInUse } = ctx;
  const blank = { width: "", length: "", gsm: "", brandId: brands[0]?.id || "", pktsPerPlt: "", note: "" };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState(null); const [ef, setEf] = useState(blank);
  useEffect(() => { if (!f.brandId && brands[0]) setF((p) => ({ ...p, brandId: brands[0].id })); }, [brands]); // eslint-disable-line
  const previewName = f.width && f.length && f.gsm && f.brandId ? `${f.width}x${f.length}/${f.gsm} ${brandName(f.brandId)}` : "";
  const previewW = f.width && f.length && f.gsm ? (N(f.width) * N(f.length) * N(f.gsm)) / 15500 : 0;
  const add = () => {
    if (!previewName || !N(f.pktsPerPlt)) return;
    persist.descriptions([...descriptions, { id: uid(), brandId: f.brandId, width: N(f.width), length: N(f.length), gsm: N(f.gsm), pktsPerPlt: N(f.pktsPerPlt), note: f.note.trim(), active: true, description: previewName, weightPerPkt: previewW }]);
    setF({ ...blank, brandId: f.brandId });
  };
  const saveEdit = () => {
    const name = `${ef.width}x${ef.length}/${ef.gsm} ${brandName(ef.brandId)}`;
    persist.descriptions(descriptions.map((d) => d.id === editId ? { ...d, brandId: ef.brandId, width: N(ef.width), length: N(ef.length), gsm: N(ef.gsm), pktsPerPlt: N(ef.pktsPerPlt), note: ef.note.trim(), active: ef.active, description: name, weightPerPkt: (N(ef.width) * N(ef.length) * N(ef.gsm)) / 15500 } : d));
    setEditId(null);
  };
  return (
    <div>
      <SectionHead title="PKT Description Master" />
      <div className="info-banner">Name = <b>Width x Length / GSM + Brand</b>. Packet weight auto = (W x L x GSM) / 15500 kg.</div>
      {canManage && (
        <div className="ticket-form">
          <div className="grid-2">
            <Field label="Width"><input type="number" value={f.width} onChange={(e) => setF({ ...f, width: e.target.value })} placeholder="20" /></Field>
            <Field label="Length"><input type="number" value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })} placeholder="30" /></Field>
            <Field label="Gram (GSM)"><input type="number" value={f.gsm} onChange={(e) => setF({ ...f, gsm: e.target.value })} placeholder="270" /></Field>
            <Field label="Brand"><select value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="PKTs in 1 PLT *"><input type="number" value={f.pktsPerPlt} onChange={(e) => setF({ ...f, pktsPerPlt: e.target.value })} placeholder="500" /></Field>
            <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
          {previewName && <div className="computed">Will save as: <b>{previewName}</b> · {N(f.pktsPerPlt)} pkts/PLT · weight <b>{num(previewW, 4)} kg/pkt</b></div>}
          {brands.length === 0 && <div className="notice-warn">Add at least one brand first (Masters → Brands).</div>}
          <button className="btn primary" onClick={add} disabled={!previewName || !N(f.pktsPerPlt)}><Plus size={14} /> Add description</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="ledger-table">
          <thead><tr><th>Description</th><th>Brand</th><th>PKTs/PLT</th><th>Weight/Pkt</th><th>Status</th><th className="no-print" /></tr></thead>
          <tbody>
            {descriptions.length === 0 && <tr><td colSpan={6}><EmptyRow>No descriptions yet.</EmptyRow></td></tr>}
            {descriptions.map((d) => (
              <tr key={d.id}>
                {editId === d.id ? (
                  <td colSpan={6}>
                    <div className="edit-row">
                      <input type="number" value={ef.width} onChange={(e) => setEf({ ...ef, width: e.target.value })} />
                      <input type="number" value={ef.length} onChange={(e) => setEf({ ...ef, length: e.target.value })} />
                      <input type="number" value={ef.gsm} onChange={(e) => setEf({ ...ef, gsm: e.target.value })} />
                      <select value={ef.brandId} onChange={(e) => setEf({ ...ef, brandId: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                      <input type="number" value={ef.pktsPerPlt} onChange={(e) => setEf({ ...ef, pktsPerPlt: e.target.value })} />
                      <label className="checkbox-field"><input type="checkbox" checked={!!ef.active} onChange={(e) => setEf({ ...ef, active: e.target.checked })} /><span>Active</span></label>
                      <button className="icon-btn" onClick={saveEdit}><Check size={15} /></button>
                      <button className="icon-btn" onClick={() => setEditId(null)}><X size={15} /></button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td><b>{descLabel(d)}</b>{d.note && <div className="row-sub">{d.note}</div>}</td>
                    <td>{brandName(d.brandId)}</td>
                    <td className="mono">{num(d.pktsPerPlt, 0)}</td>
                    <td className="mono">{num(pktWeight(d), 4)} kg</td>
                    <td>{d.active === false ? <Stamp tone="rust">Inactive</Stamp> : <Stamp tone="green">Active</Stamp>}</td>
                    <td className="row-actions no-print">
                      {canManage && <button className="icon-btn" onClick={() => { setEditId(d.id); setEf({ width: d.width, length: d.length, gsm: d.gsm, brandId: d.brandId, pktsPerPlt: d.pktsPerPlt, note: d.note || "", active: d.active !== false }); }}><Pencil size={15} /></button>}
                      {isAdmin && <button className="icon-btn" disabled={descInUse.has(d.id)} onClick={() => { if (confirmDelete("this description")) persist.descriptions(descriptions.filter((x) => x.id !== d.id)); }}><Trash2 size={15} /></button>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= line builders (auto-focus next item) ================= */
function PktLineBuilder({ ctx, mode, onAdd }) {
  const [descriptionId, setDescriptionId] = useState("");
  const [plts, setPlts] = useState("");
  const [loose, setLoose] = useState("");
  const [rate, setRate] = useState("");
  const descApi = React.useRef(null);
  const d = ctx.descOf(descriptionId);
  const perPlt = d ? N(d.pktsPerPlt) : 0;
  const wpp = d ? ctx.pktWeight(d) : 0;
  const total = N(plts) * perPlt + N(loose);
  const weight = total * wpp;
  const amount = weight * N(rate);
  const ok = descriptionId && total > 0 && (mode !== "purchase" || N(rate) >= 0);
  const add = () => {
    if (!ok) return;
    onAdd({ descriptionId, plts: N(plts), loose: N(loose), total, weight, rate: N(rate), amount });
    setPlts(""); setLoose(""); setDescriptionId("");
    setTimeout(() => { if (descApi.current) descApi.current(); }, 30);
  };
  return (
    <div className="builder">
      <div className="builder-row">
        <div className="builder-desc"><DescPicker ctx={ctx} value={descriptionId} onChange={setDescriptionId} apiRef={descApi} /></div>
        <Field label="PLTs"><input type="number" value={plts} onChange={(e) => setPlts(e.target.value)} placeholder="0" /></Field>
        <Field label="Loose pkts"><input type="number" value={loose} onChange={(e) => setLoose(e.target.value)} placeholder="0" /></Field>
        {mode === "purchase" && <Field label="Rate /kg"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" /></Field>}
        <button className="btn primary builder-add" onClick={add} disabled={!ok}><Plus size={14} /> Add line</button>
      </div>
      <div className="builder-chips">
        <span className="b-chip">Pkts/PLT<b>{num(perPlt, 0)}</b></span>
        <span className="b-chip">Total PKTs<b>{num(total, 0)}</b></span>
        <span className="b-chip">Weight<b>{num(weight)} kg</b></span>
        {mode === "purchase" && <span className="b-chip">Amount<b>{money(amount)}</b></span>}
      </div>
    </div>
  );
}
function UdhaarLineBuilder({ ctx, onAdd }) {
  const [descriptionId, setDescriptionId] = useState("");
  const [pkts, setPkts] = useState("");
  const [note, setNote] = useState("");
  const descApi = React.useRef(null);
  const d = ctx.descOf(descriptionId);
  const perPlt = d ? N(d.pktsPerPlt) : 0;
  const wpp = d ? ctx.pktWeight(d) : 0;
  const p = N(pkts);
  const weight = p * wpp;
  const ok = descriptionId && p > 0;
  const add = () => {
    if (!ok) return;
    onAdd({ descriptionId, pkts: p, weight, note: note.trim() });
    setPkts(""); setNote(""); setDescriptionId("");
    setTimeout(() => { if (descApi.current) descApi.current(); }, 30);
  };
  return (
    <div className="builder">
      <div className="builder-row">
        <div className="builder-desc"><DescPicker ctx={ctx} value={descriptionId} onChange={setDescriptionId} apiRef={descApi} /></div>
        <Field label="PKTs"><input type="number" value={pkts} onChange={(e) => setPkts(e.target.value)} placeholder="0" /></Field>
        <Field label="Item note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field>
        <button className="btn primary builder-add" onClick={add} disabled={!ok}><Plus size={14} /> Add item</button>
      </div>
      <div className="builder-chips">
        <span className="b-chip">Pkts/PLT<b>{num(perPlt, 0)}</b></span>
        <span className="b-chip">= PLTs<b>{num(perPlt ? p / perPlt : 0, 2)}</b></span>
        <span className="b-chip">Weight<b>{num(weight)} kg</b></span>
      </div>
    </div>
  );
}
function LinesList({ ctx, lines, setLines, mode }) {
  const t = lines.reduce((a, l) => ({ plts: a.plts + l.plts, pkts: a.pkts + l.total, weight: a.weight + l.weight, amount: a.amount + (l.amount || 0) }), { plts: 0, pkts: 0, weight: 0, amount: 0 });
  return (
    <div className="lines-box">
      <div className="lines-head">Lines in this entry ({lines.length})</div>
      {lines.length === 0 ? <EmptyRow>No lines yet — pick an item above and press “Add line”.</EmptyRow> : (
        <div className="list panel-list">
          {lines.map((l, i) => (
            <div className="row" key={i}>
              <div>
                <div className="row-title">{ctx.descLabel(ctx.descOf(l.descriptionId))}</div>
                <div className="row-sub">{num(l.plts, 0)} PLTs + {num(l.loose, 0)} loose = {num(l.total, 0)} pkts · {num(l.weight)} kg{mode === "purchase" ? ` · ${num(l.rate)}/kg = ${money(l.amount)}` : ""}</div>
              </div>
              <div className="row-actions"><button className="icon-btn" onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 size={15} /></button></div>
            </div>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="lines-total">
          <span>{lines.length} line(s)</span>
          <span className="mono">{num(t.plts, 0)} PLTs</span>
          <span className="mono">{num(t.pkts, 0)} pkts</span>
          <span className="mono">{num(t.weight)} kg</span>
          {mode === "purchase" && <span className="mono">{money(t.amount)}</span>}
        </div>
      )}
    </div>
  );
}

/* ================= PKT IN ================= */
function PktInAddForm({ ctx }) {
  const { suppliers, persist, pktIn, inLabel, descriptions } = ctx;
  const [date, setDate] = useState(todayISO());
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [lines, setLines] = useState([]);
  const [last, setLast] = useState(null);
  useEffect(() => { if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id); }, [suppliers]); // eslint-disable-line
  const save = () => {
    if (!date || !supplierId || !lines.length) return;
    const batchId = uid();
    const recs = lines.map((l) => {
      const d = ctx.descOf(l.descriptionId);
      return { id: uid(), batchId, date, supplierId, descriptionId: d.id, descriptionSnapshot: ctx.descLabel(d), pktsPerPltSnapshot: N(d.pktsPerPlt), weightPerPktSnapshot: ctx.pktWeight(d), plts: l.plts, loosePkts: l.loose, totalPkts: l.total, weight: l.weight, note: "" };
    });
    persist.pktIn([...pktIn, ...recs]);
    setLast(batchId); setLines([]);
  };
  if (suppliers.length === 0 || descriptions.length === 0) return <EmptyRow>Add a supplier and at least one description first.</EmptyRow>;
  return (
    <div className="entry2">
      <div className="entry2-head">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Supplier *"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <div className="info-banner" style={{ margin: 0 }}>Fast entry: pick item → PLTs → <b>Add line</b> → cursor jumps back to the item search for the next line.</div>
      <PktLineBuilder ctx={ctx} mode="in" onAdd={(l) => setLines([...lines, l])} />
      <LinesList ctx={ctx} lines={lines} setLines={setLines} mode="in" />
      <div className="form-actions">
        <span className="computed">{last ? <>Saved under <b>{inLabel.get(last)}</b></> : ""}</span>
        <button className="btn primary" onClick={save} disabled={!lines.length || !supplierId}>Save PKT In entry</button>
      </div>
    </div>
  );
}
function useInBatches(ctx) {
  const { pktIn, inLabel, supplierName } = ctx;
  return useMemo(() => {
    const m = new Map();
    pktIn.forEach((r) => { if (!m.has(r.batchId)) m.set(r.batchId, []); m.get(r.batchId).push(r); });
    return [...m.entries()].map(([batchId, lines]) => ({
      batchId, label: inLabel.get(batchId), date: lines[0].date, supplierId: lines[0].supplierId, lines,
      pkts: lines.reduce((a, l) => a + N(l.totalPkts), 0), weight: lines.reduce((a, l) => a + N(l.weight), 0),
    })).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [pktIn, inLabel, supplierName]);
}
function PktInEntriesTab({ ctx }) {
  const batches = useInBatches(ctx);
  const [expanded, setExpanded] = useState(null);
  const canAdd = ctx.canModule("pktIn", "add");
  return (
    <div>
      <SectionHead title="Add PKT In (stock in)" />
      {canAdd ? <PktInAddForm ctx={ctx} /> : <LockedNote />}
      <h3 className="sub-heading">All entries (view only — edit in Edit)</h3>
      {batches.length === 0 && <EmptyRow>No PKT In entries yet.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.batchId;
        return (
          <div className="entry-card" key={b.batchId}>
            <div className="entry-card-head" onClick={() => setExpanded(open ? null : b.batchId)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                <span>{fmtDate(b.date)} · {ctx.supplierName(b.supplierId)} · {b.lines.length} line(s) · {num(b.pkts, 0)} pkts · {num(b.weight)} kg</span>
              </div>
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="tbl-wrap">
                  <table className="ledger-table">
                    <thead><tr><th>Description</th><th>PLTs</th><th>Pkts/PLT</th><th>Total PKTs</th><th>Weight</th></tr></thead>
                    <tbody>{b.lines.map((l) => (<tr key={l.id}><td>{tightDesc(l.descriptionSnapshot)}</td><td className="mono">{num(l.plts, 0)}</td><td className="mono">{num(l.pktsPerPltSnapshot, 0)}</td><td className="mono">{num(l.totalPkts, 0)}</td><td className="mono">{num(l.weight)} kg</td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function ManageInModal({ ctx, batch, onClose }) {
  const { pktIn, persist } = ctx;
  const [lines, setLines] = useState(batch.lines.map((l) => ({ ...l })));
  const [adds, setAdds] = useState([]);
  const save = () => {
    const newRecs = adds.map((l) => {
      const d = ctx.descOf(l.descriptionId);
      return { id: uid(), batchId: batch.batchId, date: batch.date, supplierId: batch.supplierId, descriptionId: d.id, descriptionSnapshot: ctx.descLabel(d), pktsPerPltSnapshot: N(d.pktsPerPlt), weightPerPktSnapshot: ctx.pktWeight(d), plts: l.plts, loosePkts: l.loose, totalPkts: l.total, weight: l.weight, note: "" };
    });
    const others = pktIn.filter((r) => r.batchId !== batch.batchId);
    persist.pktIn([...others, ...lines, ...newRecs]);
    onClose();
  };
  return (
    <Modal title={`Manage ${batch.label} — add / remove items`} onClose={onClose}>
      <h4 className="modal-sub">Existing items</h4>
      {lines.length === 0 && <EmptyRow>All rows removed — saving leaves this entry empty.</EmptyRow>}
      <div className="list panel-list">
        {lines.map((l) => (
          <div className="row" key={l.id}>
            <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}</div><div className="row-sub">{num(l.plts, 0)} PLTs · {num(l.totalPkts, 0)} pkts · {num(l.weight)} kg</div></div>
            <div className="row-actions"><button className="icon-btn" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}><Trash2 size={15} /></button></div>
          </div>
        ))}
      </div>
      <h4 className="modal-sub">Add more items</h4>
      <PktLineBuilder ctx={ctx} mode="in" onAdd={(l) => setAdds([...adds, l])} />
      {adds.length > 0 && <LinesList ctx={ctx} lines={adds} setLines={setAdds} mode="in" />}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}><Check size={14} /> Save changes</button>
      </div>
    </Modal>
  );
}
function PktInEditTab({ ctx }) {
  const canEdit = ctx.canModule("pktIn", "edit"), canDelete = ctx.canModule("pktIn", "delete");
  const { pktIn, persist, supplierName, suppliers } = ctx;
  const allBatches = useInBatches(ctx);
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [headEdit, setHeadEdit] = useState(null); const [hd, setHd] = useState({ date: "", supplierId: "" });
  const [editId, setEditId] = useState(null); const [ef, setEf] = useState(null);
  const [manage, setManage] = useState(null);
  if (!canEdit && !canDelete) return <LockedNote />;
  const batches = allBatches.filter((b) => {
    if (from && b.date < from) return false;
    if (to && b.date > to) return false;
    if (!q.trim()) return true;
    const query = q.trim().toLowerCase();
    return b.label.toLowerCase().includes(query) || b.date.includes(query) || fmtDate(b.date).toLowerCase().includes(query) ||
      b.lines.some((l) => tightDesc(l.descriptionSnapshot).toLowerCase().includes(query) || supplierName(l.supplierId).toLowerCase().includes(query));
  });
  const saveHead = (batchId) => { persist.pktIn(pktIn.map((r) => r.batchId === batchId ? { ...r, date: hd.date, supplierId: hd.supplierId } : r)); setHeadEdit(null); };
  const saveRow = () => {
    const d = ctx.descOf(ef.descriptionId);
    const total = N(ef.plts) * N(ef.pktsPerPltSnapshot) + N(ef.loosePkts);
    persist.pktIn(pktIn.map((r) => r.id === editId ? { ...r, date: ef.date, descriptionId: ef.descriptionId, descriptionSnapshot: d ? ctx.descLabel(d) : r.descriptionSnapshot, plts: N(ef.plts), loosePkts: N(ef.loosePkts), totalPkts: total, weight: total * N(ef.weightPerPktSnapshot) } : r));
    setEditId(null);
  };
  const mb = batches.find((b) => b.batchId === manage) || allBatches.find((b) => b.batchId === manage);
  return (
    <div>
      <SectionHead title="Edit PKT In entries" />
      <div className="filter-bar no-print">
        <Field label="Search entry / item"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PI-1, description, date…" /></div></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="info-banner">Use <b>+</b> on an entry to open the popup: add more items or delete existing ones.</div>
      {batches.length === 0 && <EmptyRow>Nothing to edit.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.batchId, editingHead = headEdit === b.batchId;
        return (
          <div className="entry-card" key={b.batchId}>
            <div className="entry-card-head" onClick={() => !editingHead && setExpanded(open ? null : b.batchId)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                {editingHead ? (
                  <span className="entry-date-edit" onClick={(e) => e.stopPropagation()}>
                    <input type="date" value={hd.date} onChange={(e) => setHd({ ...hd, date: e.target.value })} />
                    <select value={hd.supplierId} onChange={(e) => setHd({ ...hd, supplierId: e.target.value })}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <button className="icon-btn" onClick={() => saveHead(b.batchId)}><Check size={14} /></button>
                    <button className="icon-btn" onClick={() => setHeadEdit(null)}><X size={14} /></button>
                  </span>
                ) : (<span>{fmtDate(b.date)} · {supplierName(b.supplierId)} · {b.lines.length} line(s) · {num(b.pkts, 0)} pkts</span>)}
              </div>
              {!editingHead && (
                <div className="row-actions">
                  {canEdit && <button className="icon-btn" title="Add / remove items" onClick={(e) => { e.stopPropagation(); setManage(b.batchId); }}><Plus size={15} /></button>}
                  {canEdit && <button className="icon-btn" title="Edit date / supplier" onClick={(e) => { e.stopPropagation(); setHeadEdit(b.batchId); setHd({ date: b.date, supplierId: b.supplierId }); }}><Pencil size={15} /></button>}
                  {canDelete && <button className="icon-btn" onClick={(e) => { e.stopPropagation(); if (confirmDelete(b.label)) persist.pktIn(pktIn.filter((r) => r.batchId !== b.batchId)); }}><Trash2 size={15} /></button>}
                </div>
              )}
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="list panel-list">
                  {b.lines.map((l) => (
                    <div className="row" key={l.id}>
                      {editId === l.id ? (
                        <div className="edit-row">
                          <DescPicker ctx={ctx} value={ef.descriptionId} onChange={(id) => setEf({ ...ef, descriptionId: id })} />
                          <input type="number" value={ef.plts} onChange={(e) => setEf({ ...ef, plts: e.target.value })} />
                          <input type="number" value={ef.loosePkts} onChange={(e) => setEf({ ...ef, loosePkts: e.target.value })} />
                          <input type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} />
                          <button className="icon-btn" onClick={saveRow}><Check size={15} /></button>
                          <button className="icon-btn" onClick={() => setEditId(null)}><X size={15} /></button>
                        </div>
                      ) : (
                        <>
                          <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}</div><div className="row-sub">{num(l.plts, 0)} PLTs · {num(l.totalPkts, 0)} pkts · {num(l.weight)} kg · {fmtDate(l.date)}</div></div>
                          <div className="row-actions">
                            {canEdit && <button className="icon-btn" onClick={() => { setEditId(l.id); setEf({ descriptionId: l.descriptionId, plts: l.plts, loosePkts: l.loosePkts, date: l.date, pktsPerPltSnapshot: l.pktsPerPltSnapshot, weightPerPktSnapshot: l.weightPerPktSnapshot }); }}><Pencil size={15} /></button>}
                            {canDelete && <button className="icon-btn" onClick={() => { if (confirmDelete("this line")) persist.pktIn(pktIn.filter((x) => x.id !== l.id)); }}><Trash2 size={15} /></button>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {mb && <ManageInModal ctx={ctx} batch={mb} onClose={() => setManage(null)} />}
    </div>
  );
}
function PktInReportView({ ctx }) {
  const { pktIn, inLabel, supplierName, suppliers } = ctx;
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [sup, setSup] = useState("");
  const [sort, setSort] = useState({ field: "date", dir: "desc" });
  if (!ctx.canModule("pktIn", "report")) return <LockedNote />;
  const filtered = pktIn.filter((r) => {
    if (sup && r.supplierId !== sup) return false;
    if (from && r.date < from) return false; if (to && r.date > to) return false;
    if (q.trim() && !`${inLabel.get(r.batchId)} ${tightDesc(r.descriptionSnapshot)} ${supplierName(r.supplierId)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const getters = { pkts: (r) => N(r.totalPkts), weight: (r) => N(r.weight), plts: (r) => N(r.plts) };
  const groups = sortGroups(groupByDate(filtered), sort, getters);
  const gP = filtered.reduce((a, r) => a + N(r.totalPkts), 0), gW = filtered.reduce((a, r) => a + N(r.weight), 0);
  const bodyHtml = () => {
    let html = "";
    groups.forEach(([d, rs]) => {
      html += `<h2>${esc(fmtDate(d))}</h2><table><thead><tr><th>Entry</th><th>Description</th><th>Supplier</th><th>PLTs</th><th>Pkts/PLT</th><th>Total PKTs</th><th>Weight</th></tr></thead><tbody>`;
      rs.forEach((r) => { html += `<tr><td class="tag">${esc(inLabel.get(r.batchId))}</td><td>${esc(tightDesc(r.descriptionSnapshot))}</td><td>${esc(supplierName(r.supplierId))}</td><td>${num(r.plts, 0)}</td><td>${num(r.pktsPerPltSnapshot, 0)}</td><td>${num(r.totalPkts, 0)}</td><td>${num(r.weight)}</td></tr>`; });
      html += `</tbody><tfoot><tr><td colspan="5">${rs.length} line(s)</td><td>${num(rs.reduce((a, r) => a + N(r.totalPkts), 0), 0)}</td><td>${num(rs.reduce((a, r) => a + N(r.weight), 0))}</td></tr></tfoot></table>`;
    });
    html += `<h2>Grand total</h2><table><tbody><tr><td>Pkts</td><td>${num(gP, 0)}</td></tr><tr><td>Weight</td><td>${num(gW)} kg</td></tr></tbody></table>`;
    return html;
  };
  return (
    <div>
      <SectionHead title="PKT In report" onPrint={() => printHTML("PKT In report", bodyHtml() || "<p>No entries.</p>")} onDownload={() => downloadReportFile("PKT In report", bodyHtml() || "<p>No entries.</p>")} />
      <div className="filter-bar no-print">
        <Field label="Search"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <Field label="Supplier"><select value={sup} onChange={(e) => setSup(e.target.value)}><option value="">All</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <SortControl value={sort} onChange={setSort} options={[{ value: "date", label: "Date" }, { value: "pkts", label: "Total PKTs" }, { value: "plts", label: "PLTs" }, { value: "weight", label: "Weight" }]} />
      </div>
      {groups.length === 0 && <EmptyRow>No PKT In records match.</EmptyRow>}
      {groups.map(([d, rs]) => (
        <div className="date-block" key={d}>
          <div className="date-block-head">{fmtDate(d)} <span>{rs.length} line(s) · {num(rs.reduce((a, r) => a + N(r.totalPkts), 0), 0)} pkts</span></div>
          <div className="tbl-wrap">
            <table className="ledger-table">
              <thead><tr><th>Entry</th><th>Description</th><th>Supplier</th><th>PLTs</th><th>Pkts/PLT</th><th>Total PKTs</th><th>Weight</th></tr></thead>
              <tbody>{rs.map((r) => (<tr key={r.id}><td className="mono">{inLabel.get(r.batchId)}</td><td>{tightDesc(r.descriptionSnapshot)}</td><td>{supplierName(r.supplierId)}</td><td className="mono">{num(r.plts, 0)}</td><td className="mono">{num(r.pktsPerPltSnapshot, 0)}</td><td className="mono">{num(r.totalPkts, 0)}</td><td className="mono">{num(r.weight)} kg</td></tr>))}</tbody>
              <tfoot><tr><td colSpan={5}>{rs.length} line(s)</td><td className="mono">{num(rs.reduce((a, r) => a + N(r.totalPkts), 0), 0)}</td><td className="mono">{num(rs.reduce((a, r) => a + N(r.weight), 0))}</td></tr></tfoot>
            </table>
          </div>
        </div>
      ))}
      {filtered.length > 0 && <div className="report-grand-total"><span>Grand total — {filtered.length} line(s)</span><span className="mono">{num(gP, 0)} pkts</span><span className="mono">{num(gW)} kg</span></div>}
    </div>
  );
}

/* ================= PURCHASES ================= */
function PurchaseAddForm({ ctx }) {
  const { persist, purchases, puLabel, descriptions } = ctx;
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const [last, setLast] = useState(null);
  const save = async () => {
    if (!date || !lines.length) return;
    const batchId = uid();
    let recs = lines.map((l) => {
      const d = ctx.descOf(l.descriptionId);
      return { id: uid(), batchId, date, descriptionId: d.id, descriptionSnapshot: ctx.descLabel(d), pktsPerPltSnapshot: N(d.pktsPerPlt), weightPerPktSnapshot: ctx.pktWeight(d), plts: l.plts, loosePkts: l.loose, totalPkts: l.total, weight: l.weight, rate: l.rate, rateBasis: "kg", totalAmount: l.amount, udhaarSettled: 0, note: "" };
    });
    const { next, settledMap } = ctx.applyUdhaarSettle(ctx.udhaar, recs);
    recs = recs.map((r) => ({ ...r, udhaarSettled: settledMap[r.descriptionId] || 0 }));
    await persist.purchases([...purchases, ...recs]);
    if (Object.keys(settledMap).length) await persist.udhaar(next);
    setLast(batchId); setLines([]);
  };
  if (descriptions.length === 0) return <EmptyRow>Add a description first.</EmptyRow>;
  return (
    <div className="entry2">
      <div className="entry2-head">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="info-banner" style={{ flex: 2, margin: 0 }}>Amount = weight × rate/kg · purchase subtracts from PKT In · saves clear udhaar first (delete returns it) · <b>Add line</b> jumps cursor back to item search.</div>
      </div>
      <PktLineBuilder ctx={ctx} mode="purchase" onAdd={(l) => setLines([...lines, l])} />
      <LinesList ctx={ctx} lines={lines} setLines={setLines} mode="purchase" />
      <div className="form-actions">
        <span className="computed">{last ? <>Saved under <b>{puLabel.get(last)}</b></> : ""}</span>
        <button className="btn primary" onClick={save} disabled={!lines.length}>Save purchase entry</button>
      </div>
    </div>
  );
}
function usePuBatches(ctx) {
  const { purchases, puLabel } = ctx;
  return useMemo(() => {
    const m = new Map();
    purchases.forEach((r) => { if (!m.has(r.batchId)) m.set(r.batchId, []); m.get(r.batchId).push(r); });
    return [...m.entries()].map(([batchId, lines]) => ({
      batchId, label: puLabel.get(batchId), date: lines[0].date, lines,
      pkts: lines.reduce((a, l) => a + N(l.totalPkts), 0), weight: lines.reduce((a, l) => a + N(l.weight), 0),
      amount: lines.reduce((a, l) => a + N(l.totalAmount), 0),
    })).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [purchases, puLabel]);
}
function PurchaseEntriesTab({ ctx }) {
  const batches = usePuBatches(ctx);
  const [expanded, setExpanded] = useState(null);
  const canAdd = ctx.canModule("purchases", "add");
  return (
    <div>
      <SectionHead title="Record purchases" />
      {canAdd ? <PurchaseAddForm ctx={ctx} /> : <LockedNote />}
      <h3 className="sub-heading">All entries (view only — edit in Edit)</h3>
      {batches.length === 0 && <EmptyRow>No purchases yet.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.batchId;
        return (
          <div className="entry-card" key={b.batchId}>
            <div className="entry-card-head" onClick={() => setExpanded(open ? null : b.batchId)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                <span>{fmtDate(b.date)} · {b.lines.length} line(s) · {num(b.pkts, 0)} pkts · {money(b.amount)}</span>
              </div>
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="tbl-wrap">
                  <table className="ledger-table">
                    <thead><tr><th>Description</th><th>PLTs</th><th>Total PKTs</th><th>Weight</th><th>Rate/kg</th><th>Amount</th><th>Udhaar settled</th></tr></thead>
                    <tbody>{b.lines.map((l) => (<tr key={l.id}><td>{tightDesc(l.descriptionSnapshot)}</td><td className="mono">{num(l.plts, 0)}</td><td className="mono">{num(l.totalPkts, 0)}</td><td className="mono">{num(l.weight)} kg</td><td className="mono">{num(l.rate)}</td><td className="mono">{money(l.totalAmount)}</td><td className="mono">{num(l.udhaarSettled || 0, 0)}</td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function ManagePuModal({ ctx, batch, onClose }) {
  const { purchases, persist } = ctx;
  const [lines, setLines] = useState(batch.lines.map((l) => ({ ...l })));
  const [adds, setAdds] = useState([]);
  const save = async () => {
    const removed = batch.lines.filter((l) => !lines.some((x) => x.id === l.id));
    const newBase = adds.map((l) => {
      const d = ctx.descOf(l.descriptionId);
      return { id: uid(), batchId: batch.batchId, date: batch.date, descriptionId: d.id, descriptionSnapshot: ctx.descLabel(d), pktsPerPltSnapshot: N(d.pktsPerPlt), weightPerPktSnapshot: ctx.pktWeight(d), plts: l.plts, loosePkts: l.loose, totalPkts: l.total, weight: l.weight, rate: l.rate, rateBasis: "kg", totalAmount: l.amount, udhaarSettled: 0, note: "" };
    });
    let ud = ctx.udhaar;
    if (removed.length) ud = ctx.applyUdhaarRestore(ud, removed);
    const { next, settledMap } = newBase.length ? ctx.applyUdhaarSettle(ud, newBase) : { next: ud, settledMap: {} };
    const newRecs = newBase.map((r) => ({ ...r, udhaarSettled: settledMap[r.descriptionId] || 0 }));
    const others = purchases.filter((r) => r.batchId !== batch.batchId);
    await persist.purchases([...others, ...lines, ...newRecs]);
    if (JSON.stringify(next) !== JSON.stringify(ctx.udhaar)) await persist.udhaar(next);
    onClose();
  };
  return (
    <Modal title={`Manage ${batch.label} — add / remove items`} onClose={onClose}>
      <h4 className="modal-sub">Existing items (delete returns its udhaar)</h4>
      {lines.length === 0 && <EmptyRow>All rows removed.</EmptyRow>}
      <div className="list panel-list">
        {lines.map((l) => (
          <div className="row" key={l.id}>
            <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}</div><div className="row-sub">{num(l.totalPkts, 0)} pkts · {num(l.weight)} kg · {money(l.totalAmount)}{N(l.udhaarSettled) > 0 ? ` · settled ${num(l.udhaarSettled, 0)} udhaar` : ""}</div></div>
            <div className="row-actions"><button className="icon-btn" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}><Trash2 size={15} /></button></div>
          </div>
        ))}
      </div>
      <h4 className="modal-sub">Add more items</h4>
      <PktLineBuilder ctx={ctx} mode="purchase" onAdd={(l) => setAdds([...adds, l])} />
      {adds.length > 0 && <LinesList ctx={ctx} lines={adds} setLines={setAdds} mode="purchase" />}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}><Check size={14} /> Save changes</button>
      </div>
    </Modal>
  );
}
function PurchaseEditTab({ ctx }) {
  const canEdit = ctx.canModule("purchases", "edit"), canDelete = ctx.canModule("purchases", "delete");
  const { purchases, persist } = ctx;
  const allBatches = usePuBatches(ctx);
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [headEdit, setHeadEdit] = useState(null); const [hd, setHd] = useState("");
  const [editId, setEditId] = useState(null); const [ef, setEf] = useState(null);
  const [manage, setManage] = useState(null);
  if (!canEdit && !canDelete) return <LockedNote />;
  const batches = allBatches.filter((b) => {
    if (from && b.date < from) return false;
    if (to && b.date > to) return false;
    if (!q.trim()) return true;
    const query = q.trim().toLowerCase();
    return b.label.toLowerCase().includes(query) || b.date.includes(query) || fmtDate(b.date).toLowerCase().includes(query) ||
      b.lines.some((l) => tightDesc(l.descriptionSnapshot).toLowerCase().includes(query));
  });
  const saveRow = async () => {
    const oldLine = purchases.find((p) => p.id === editId);
    const total = N(ef.plts) * N(ef.pktsPerPltSnapshot) + N(ef.loosePkts);
    const weight = total * N(ef.weightPerPktSnapshot);
    let ud = ctx.udhaar;
    if (oldLine && N(oldLine.udhaarSettled) > 0) ud = ctx.applyUdhaarRestore(ud, [oldLine]);
    const { next, settledMap } = ctx.applyUdhaarSettle(ud, [{ descriptionId: oldLine.descriptionId, totalPkts: total }]);
    const settled = settledMap[oldLine.descriptionId] || 0;
    await persist.purchases(purchases.map((r) => r.id === editId ? { ...r, date: ef.date, plts: N(ef.plts), loosePkts: N(ef.loosePkts), totalPkts: total, weight, rate: N(ef.rate), totalAmount: weight * N(ef.rate), udhaarSettled: settled } : r));
    if (JSON.stringify(next) !== JSON.stringify(ctx.udhaar)) await persist.udhaar(next);
    setEditId(null);
  };
  const removeRow = async (id) => {
    if (!confirmDelete("this purchase")) return;
    const line = purchases.find((p) => p.id === id);
    await persist.purchases(purchases.filter((x) => x.id !== id));
    if (line && N(line.udhaarSettled) > 0) await persist.udhaar(ctx.applyUdhaarRestore(ctx.udhaar, [line]));
  };
  const removeBatch = async (batchId) => {
    const lines = purchases.filter((p) => p.batchId === batchId);
    if (!confirmDelete(`${allBatches.find((b) => b.batchId === batchId)?.label} (${lines.length} lines)`)) return;
    await persist.purchases(purchases.filter((x) => x.batchId !== batchId));
    const withSettle = lines.filter((l) => N(l.udhaarSettled) > 0);
    if (withSettle.length) await persist.udhaar(ctx.applyUdhaarRestore(ctx.udhaar, withSettle));
  };
  const mb = batches.find((b) => b.batchId === manage) || allBatches.find((b) => b.batchId === manage);
  return (
    <div>
      <SectionHead title="Edit purchase entries" />
      <div className="filter-bar no-print">
        <Field label="Search entry / item"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PP-1, description, date…" /></div></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="info-banner">Deleting a purchase <b>returns its settled udhaar</b> to that item. Use <b>+</b> for the add/remove popup.</div>
      {batches.length === 0 && <EmptyRow>Nothing to edit.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.batchId, editingHead = headEdit === b.batchId;
        return (
          <div className="entry-card" key={b.batchId}>
            <div className="entry-card-head" onClick={() => !editingHead && setExpanded(open ? null : b.batchId)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                {editingHead ? (
                  <span className="entry-date-edit" onClick={(e) => e.stopPropagation()}>
                    <input type="date" value={hd} onChange={(e) => setHd(e.target.value)} />
                    <button className="icon-btn" onClick={() => { persist.purchases(purchases.map((r) => r.batchId === b.batchId ? { ...r, date: hd } : r)); setHeadEdit(null); }}><Check size={14} /></button>
                    <button className="icon-btn" onClick={() => setHeadEdit(null)}><X size={14} /></button>
                  </span>
                ) : (<span>{fmtDate(b.date)} · {b.lines.length} line(s) · {num(b.pkts, 0)} pkts · {money(b.amount)}</span>)}
              </div>
              {!editingHead && (
                <div className="row-actions">
                  {canEdit && <button className="icon-btn" title="Add / remove items" onClick={(e) => { e.stopPropagation(); setManage(b.batchId); }}><Plus size={15} /></button>}
                  {canEdit && <button className="icon-btn" title="Edit date" onClick={(e) => { e.stopPropagation(); setHeadEdit(b.batchId); setHd(b.date); }}><Pencil size={15} /></button>}
                  {canDelete && <button className="icon-btn" onClick={(e) => { e.stopPropagation(); removeBatch(b.batchId); }}><Trash2 size={15} /></button>}
                </div>
              )}
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="list panel-list">
                  {b.lines.map((l) => (
                    <div className="row" key={l.id}>
                      {editId === l.id ? (
                        <div className="edit-row">
                          <input type="number" value={ef.plts} onChange={(e) => setEf({ ...ef, plts: e.target.value })} />
                          <input type="number" value={ef.loosePkts} onChange={(e) => setEf({ ...ef, loosePkts: e.target.value })} />
                          <input type="number" value={ef.rate} onChange={(e) => setEf({ ...ef, rate: e.target.value })} />
                          <input type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} />
                          <button className="icon-btn" onClick={saveRow}><Check size={15} /></button>
                          <button className="icon-btn" onClick={() => setEditId(null)}><X size={15} /></button>
                        </div>
                      ) : (
                        <>
                          <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}{N(l.udhaarSettled) > 0 && <Stamp tone="amber">settled {num(l.udhaarSettled, 0)} udhaar</Stamp>}</div><div className="row-sub">{num(l.totalPkts, 0)} pkts · {num(l.weight)} kg × {num(l.rate)}/kg = {money(l.totalAmount)}</div></div>
                          <div className="row-actions">
                            {canEdit && <button className="icon-btn" onClick={() => { setEditId(l.id); setEf({ plts: l.plts, loosePkts: l.loosePkts, rate: l.rate, date: l.date, pktsPerPltSnapshot: l.pktsPerPltSnapshot, weightPerPktSnapshot: l.weightPerPktSnapshot }); }}><Pencil size={15} /></button>}
                            {canDelete && <button className="icon-btn" onClick={() => removeRow(l.id)}><Trash2 size={15} /></button>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {mb && <ManagePuModal ctx={ctx} batch={mb} onClose={() => setManage(null)} />}
    </div>
  );
}
function PurchaseReportView({ ctx }) {
  const { purchases, puLabel } = ctx;
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [sort, setSort] = useState({ field: "date", dir: "desc" });
  if (!ctx.canModule("purchases", "report")) return <LockedNote />;
  const filtered = purchases.filter((r) => {
    if (from && r.date < from) return false; if (to && r.date > to) return false;
    if (q.trim() && !`${puLabel.get(r.batchId)} ${tightDesc(r.descriptionSnapshot)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const getters = { pkts: (r) => N(r.totalPkts), weight: (r) => N(r.weight), amount: (r) => N(r.totalAmount), rate: (r) => N(r.rate) };
  const groups = sortGroups(groupByDate(filtered), sort, getters);
  const gW = filtered.reduce((a, r) => a + N(r.weight), 0), gA = filtered.reduce((a, r) => a + N(r.totalAmount), 0);
  const bodyHtml = () => {
    let html = "";
    groups.forEach(([d, rs]) => {
      html += `<h2>${esc(fmtDate(d))}</h2><table><thead><tr><th>Entry</th><th>Description</th><th>PLTs</th><th>Pkts</th><th>Weight</th><th>Rate/kg</th><th>Amount</th></tr></thead><tbody>`;
      rs.forEach((r) => { html += `<tr><td class="tag">${esc(puLabel.get(r.batchId))}</td><td>${esc(tightDesc(r.descriptionSnapshot))}</td><td>${num(r.plts, 0)}</td><td>${num(r.totalPkts, 0)}</td><td>${num(r.weight)}</td><td>${num(r.rate)}</td><td>${money(r.totalAmount)}</td></tr>`; });
      html += `</tbody><tfoot><tr><td colspan="4">${rs.length} line(s)</td><td>${num(rs.reduce((a, r) => a + N(r.weight), 0))}</td><td></td><td>${money(rs.reduce((a, r) => a + N(r.totalAmount), 0))}</td></tr></tfoot></table>`;
    });
    html += `<h2>Grand total</h2><table><tbody><tr><td>Weight</td><td>${num(gW)} kg</td></tr><tr><td>Amount</td><td>${money(gA)}</td></tr></tbody></table>`;
    return html;
  };
  return (
    <div>
      <SectionHead title="Purchase report (minus from stock)" onPrint={() => printHTML("Purchase report", bodyHtml() || "<p>No entries.</p>")} onDownload={() => downloadReportFile("Purchase report", bodyHtml() || "<p>No entries.</p>")} />
      <div className="filter-bar no-print">
        <Field label="Search"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <SortControl value={sort} onChange={setSort} options={[{ value: "date", label: "Date" }, { value: "pkts", label: "Total PKTs" }, { value: "weight", label: "Weight" }, { value: "rate", label: "Rate" }, { value: "amount", label: "Amount" }]} />
      </div>
      {groups.length === 0 && <EmptyRow>No purchases match.</EmptyRow>}
      {groups.map(([d, rs]) => (
        <div className="date-block" key={d}>
          <div className="date-block-head">{fmtDate(d)} <span>{money(rs.reduce((a, r) => a + N(r.totalAmount), 0))}</span></div>
          <div className="tbl-wrap">
            <table className="ledger-table">
              <thead><tr><th>Entry</th><th>Description</th><th>PLTs</th><th>Pkts</th><th>Weight</th><th>Rate/kg</th><th>Amount</th></tr></thead>
              <tbody>{rs.map((r) => (<tr key={r.id}><td className="mono">{puLabel.get(r.batchId)}</td><td>{tightDesc(r.descriptionSnapshot)}</td><td className="mono">{num(r.plts, 0)}</td><td className="mono">{num(r.totalPkts, 0)}</td><td className="mono">{num(r.weight)} kg</td><td className="mono">{num(r.rate)}</td><td className="mono">{money(r.totalAmount)}</td></tr>))}</tbody>
              <tfoot><tr><td colSpan={4}>{rs.length} line(s)</td><td className="mono">{num(rs.reduce((a, r) => a + N(r.weight), 0))}</td><td /><td className="mono">{money(rs.reduce((a, r) => a + N(r.totalAmount), 0))}</td></tr></tfoot>
            </table>
          </div>
        </div>
      ))}
      {filtered.length > 0 && <div className="report-grand-total"><span>Grand total</span><span className="mono">{num(gW)} kg</span><span className="mono">{money(gA)}</span></div>}
    </div>
  );
}

/* ================= UDHAAR ================= */
function UdhaarAddForm({ ctx }) {
  const { persist, udhaar, udLabel, stockMap, descriptions } = ctx;
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [last, setLast] = useState(null);
  const [err, setErr] = useState("");
  const balFor = (id) => udhaar.filter((u) => u.descriptionId === id).reduce((a, u) => a + N(u.totalPkts), 0);
  const pendingFor = (id) => lines.filter((l) => l.descriptionId === id).reduce((a, l) => a + l.pkts, 0);
  const addLine = (l) => {
    const godown = stockMap.get(l.descriptionId)?.godownPkts || 0;
    const after = balFor(l.descriptionId) + pendingFor(l.descriptionId) + l.pkts;
    if (after > godown) { setErr(`${ctx.descLabel(ctx.descOf(l.descriptionId))}: udhaar would reach ${num(after, 0)} pkts but godown is only ${num(godown, 0)} pkts.`); return; }
    setErr("");
    setLines([...lines, l]);
  };
  const save = () => {
    if (!date || !lines.length) return;
    const batchId = uid();
    const recs = lines.map((l) => {
      const dd = ctx.descOf(l.descriptionId);
      const pp = N(dd.pktsPerPlt);
      return {
        id: uid(), batchId, date, partyName: null, reference: note.trim(),
        descriptionId: dd.id, descriptionSnapshot: ctx.descLabel(dd), pktsPerPltSnapshot: pp, weightPerPktSnapshot: ctx.pktWeight(dd),
        plts: pp ? Math.floor(l.pkts / pp) : 0, loosePkts: pp ? l.pkts % pp : l.pkts, totalPkts: l.pkts, weight: l.weight, note: l.note,
      };
    });
    persist.udhaar([...udhaar, ...recs]);
    setLast(batchId); setLines([]); setNote("");
  };
  const tPk = lines.reduce((a, l) => a + l.pkts, 0), tW = lines.reduce((a, l) => a + l.weight, 0);
  if (descriptions.length === 0) return <EmptyRow>Add a description first.</EmptyRow>;
  return (
    <div className="entry2">
      <div className="entry2-head">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (entry level)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. udhaar to ABC shop" /></Field>
      </div>
      <div className="info-banner" style={{ margin: 0 }}>Udhaar is entered in <b>PKTs</b> per item with an optional item note · <b>Add item</b> jumps cursor back to the item search · godown cap is checked.</div>
      <UdhaarLineBuilder ctx={ctx} onAdd={addLine} />
      {err && <div className="notice-warn">{err}</div>}
      <div className="lines-box">
        <div className="lines-head">Items in this udhaar entry ({lines.length})</div>
        {lines.length === 0 ? <EmptyRow>No items yet — pick an item above and press “Add item”.</EmptyRow> : (
          <div className="list panel-list">
            {lines.map((l, i) => (
              <div className="row" key={i}>
                <div>
                  <div className="row-title">{ctx.descLabel(ctx.descOf(l.descriptionId))}</div>
                  <div className="row-sub">{num(l.pkts, 0)} pkts · {num(l.weight)} kg{l.note ? ` · ${l.note}` : ""}</div>
                </div>
                <div className="row-actions"><button className="icon-btn" onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 size={15} /></button></div>
              </div>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <div className="lines-total">
            <span>{lines.length} item(s)</span>
            <span className="mono">{num(tPk, 0)} pkts</span>
            <span className="mono">{num(tW)} kg</span>
          </div>
        )}
      </div>
      <div className="form-actions">
        <span className="computed">{last ? <>Saved under <b>{udLabel.get(last)}</b></> : ""}</span>
        <button className="btn primary" onClick={save} disabled={!lines.length || !date}>Save udhaar entry</button>
      </div>
    </div>
  );
}
function useUdhaarBatches(ctx) {
  const { udhaar, udLabel } = ctx;
  return useMemo(() => {
    const m = new Map();
    udhaar.forEach((r) => { const k = r.batchId || r.id; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].map(([key, lines]) => ({
      key, label: udLabel.get(key), date: lines[0].date, note: lines[0].reference || "", lines,
      pkts: lines.reduce((a, l) => a + N(l.totalPkts), 0),
      weight: lines.reduce((a, l) => a + N(l.weight), 0),
    })).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [udhaar, udLabel]);
}
function UdhaarEntriesTab({ ctx }) {
  const batches = useUdhaarBatches(ctx);
  const [expanded, setExpanded] = useState(null);
  const canAdd = ctx.canModule("udhaar", "add");
  return (
    <div>
      <SectionHead title="Add udhaar entry" />
      {canAdd ? <UdhaarAddForm ctx={ctx} /> : <LockedNote />}
      <h3 className="sub-heading">All udhaar entries (view only — edit in Edit)</h3>
      {batches.length === 0 && <EmptyRow>No udhaar entries yet.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.key;
        return (
          <div className="entry-card" key={b.key}>
            <div className="entry-card-head" onClick={() => setExpanded(open ? null : b.key)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                <span>{fmtDate(b.date)} · {b.lines.length} item(s) · {num(b.pkts, 0)} pkts · {num(b.weight)} kg{b.note ? ` · ${b.note}` : ""}</span>
              </div>
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="tbl-wrap">
                  <table className="ledger-table">
                    <thead><tr><th>Description</th><th>PKTs</th><th>Weight</th><th>Item note</th></tr></thead>
                    <tbody>{b.lines.map((l) => (<tr key={l.id}><td>{tightDesc(l.descriptionSnapshot)}</td><td className="mono">{num(l.totalPkts, 0)}</td><td className="mono">{num(l.weight)} kg</td><td>{l.note || "—"}</td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function ManageUdhaarModal({ ctx, batch, onClose }) {
  const { udhaar, persist, stockMap } = ctx;
  const [lines, setLines] = useState(batch.lines.map((l) => ({ ...l })));
  const [adds, setAdds] = useState([]);
  const [err, setErr] = useState("");
  const inBatch = new Set(batch.lines.map((l) => l.id));
  const otherBal = (id) => udhaar.filter((u) => u.descriptionId === id && !inBatch.has(u.id)).reduce((a, u) => a + N(u.totalPkts), 0);
  const keptBal = (id) => lines.filter((l) => l.descriptionId === id).reduce((a, l) => a + N(l.totalPkts), 0);
  const addBal = (id) => adds.filter((l) => l.descriptionId === id).reduce((a, l) => a + l.pkts, 0);
  const addLine = (l) => {
    const godown = stockMap.get(l.descriptionId)?.godownPkts || 0;
    if (otherBal(l.descriptionId) + keptBal(l.descriptionId) + addBal(l.descriptionId) + l.pkts > godown) { setErr("Exceeds godown stock for that item."); return; }
    setErr("");
    setAdds([...adds, l]);
  };
  const save = () => {
    const targetBatchId = batch.lines[0].batchId || batch.key;
    const newRecs = adds.map((l) => {
      const dd = ctx.descOf(l.descriptionId);
      const pp = N(dd.pktsPerPlt);
      return {
        id: uid(), batchId: targetBatchId, date: batch.date, partyName: null, reference: batch.note,
        descriptionId: dd.id, descriptionSnapshot: ctx.descLabel(dd), pktsPerPltSnapshot: pp, weightPerPktSnapshot: ctx.pktWeight(dd),
        plts: pp ? Math.floor(l.pkts / pp) : 0, loosePkts: pp ? l.pkts % pp : l.pkts, totalPkts: l.pkts, weight: l.weight, note: l.note,
      };
    });
    const others = udhaar.filter((r) => !inBatch.has(r.id));
    persist.udhaar([...others, ...lines, ...newRecs]);
    onClose();
  };
  return (
    <Modal title={`Manage ${batch.label} — add / remove items`} onClose={onClose}>
      <h4 className="modal-sub">Existing items</h4>
      {lines.length === 0 && <EmptyRow>All rows removed — saving deletes this entry.</EmptyRow>}
      <div className="list panel-list">
        {lines.map((l) => (
          <div className="row" key={l.id}>
            <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}</div><div className="row-sub">{num(l.totalPkts, 0)} pkts · {num(l.weight)} kg{l.note ? ` · ${l.note}` : ""}</div></div>
            <div className="row-actions"><button className="icon-btn" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}><Trash2 size={15} /></button></div>
          </div>
        ))}
      </div>
      <h4 className="modal-sub">Add more items</h4>
      <UdhaarLineBuilder ctx={ctx} onAdd={addLine} />
      {err && <div className="notice-warn">{err}</div>}
      {adds.length > 0 && (
        <div className="list panel-list">
          {adds.map((l, i) => (
            <div className="row" key={i}>
              <div><div className="row-title">{ctx.descLabel(ctx.descOf(l.descriptionId))}</div><div className="row-sub">{num(l.pkts, 0)} pkts{l.note ? ` · ${l.note}` : ""}</div></div>
              <div className="row-actions"><button className="icon-btn" onClick={() => setAdds(adds.filter((_, x) => x !== i))}><Trash2 size={15} /></button></div>
            </div>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}><Check size={14} /> Save changes</button>
      </div>
    </Modal>
  );
}
function UdhaarEditTab({ ctx }) {
  const canEdit = ctx.canModule("udhaar", "edit"), canDelete = ctx.canModule("udhaar", "delete");
  const { udhaar, persist } = ctx;
  const allBatches = useUdhaarBatches(ctx);
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [headEdit, setHeadEdit] = useState(null); const [hd, setHd] = useState({ date: "", note: "" });
  const [editId, setEditId] = useState(null); const [ef, setEf] = useState(null);
  const [manage, setManage] = useState(null);
  if (!canEdit && !canDelete) return <LockedNote />;
  const batches = allBatches.filter((b) => {
    if (from && b.date < from) return false;
    if (to && b.date > to) return false;
    if (!q.trim()) return true;
    const query = q.trim().toLowerCase();
    return b.label.toLowerCase().includes(query) || b.date.includes(query) || fmtDate(b.date).toLowerCase().includes(query) ||
      (b.note || "").toLowerCase().includes(query) ||
      b.lines.some((l) => tightDesc(l.descriptionSnapshot).toLowerCase().includes(query) || (l.note || "").toLowerCase().includes(query));
  });
  const saveHead = (ids) => { persist.udhaar(udhaar.map((r) => ids.has(r.id) ? { ...r, date: hd.date, reference: hd.note } : r)); setHeadEdit(null); };
  const saveRow = () => {
    const pp = N(ef.pktsPerPltSnapshot), wpp = N(ef.weightPerPktSnapshot);
    const pkts = N(ef.pkts);
    persist.udhaar(udhaar.map((r) => r.id === editId ? {
      ...r, date: ef.date, note: ef.note,
      plts: pp ? Math.floor(pkts / pp) : 0, loosePkts: pp ? pkts % pp : pkts, totalPkts: pkts, weight: pkts * wpp,
    } : r));
    setEditId(null);
  };
  const mb = batches.find((b) => b.key === manage);
  return (
    <div>
      <SectionHead title="Edit udhaar entries" />
      <div className="filter-bar no-print">
        <Field label="Search entry / item"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="UD-1, description, note…" /></div></Field>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="info-banner">Use <b>+</b> on an entry to open the popup: add more items or delete existing ones. Deleting an entry returns that udhaar from stock.</div>
      {batches.length === 0 && <EmptyRow>Nothing to edit.</EmptyRow>}
      {batches.map((b) => {
        const open = expanded === b.key, editingHead = headEdit === b.key;
        const ids = new Set(b.lines.map((l) => l.id));
        return (
          <div className="entry-card" key={b.key}>
            <div className="entry-card-head" onClick={() => !editingHead && setExpanded(open ? null : b.key)}>
              <div className="entry-card-title">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="mono-tag entry-tag">{b.label}</span>
                {editingHead ? (
                  <span className="entry-date-edit" onClick={(e) => e.stopPropagation()}>
                    <input type="date" value={hd.date} onChange={(e) => setHd({ ...hd, date: e.target.value })} />
                    <input value={hd.note} onChange={(e) => setHd({ ...hd, note: e.target.value })} placeholder="note" style={{ width: 180 }} />
                    <button className="icon-btn" onClick={() => saveHead(ids)}><Check size={14} /></button>
                    <button className="icon-btn" onClick={() => setHeadEdit(null)}><X size={14} /></button>
                  </span>
                ) : (<span>{fmtDate(b.date)} · {b.lines.length} item(s) · {num(b.pkts, 0)} pkts{b.note ? ` · ${b.note}` : ""}</span>)}
              </div>
              {!editingHead && (
                <div className="row-actions">
                  {canEdit && <button className="icon-btn" title="Add / remove items" onClick={(e) => { e.stopPropagation(); setManage(b.key); }}><Plus size={15} /></button>}
                  {canEdit && <button className="icon-btn" title="Edit date / note" onClick={(e) => { e.stopPropagation(); setHeadEdit(b.key); setHd({ date: b.date, note: b.note }); }}><Pencil size={15} /></button>}
                  {canDelete && <button className="icon-btn" onClick={(e) => { e.stopPropagation(); if (confirmDelete(b.label)) persist.udhaar(udhaar.filter((r) => !ids.has(r.id))); }}><Trash2 size={15} /></button>}
                </div>
              )}
            </div>
            {open && (
              <div className="entry-card-body">
                <div className="list panel-list">
                  {b.lines.map((l) => (
                    <div className="row" key={l.id}>
                      {editId === l.id ? (
                        <div className="edit-row">
                          <input type="number" value={ef.pkts} onChange={(e) => setEf({ ...ef, pkts: e.target.value })} />
                          <input value={ef.note} onChange={(e) => setEf({ ...ef, note: e.target.value })} placeholder="note" />
                          <input type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} />
                          <button className="icon-btn" onClick={saveRow}><Check size={15} /></button>
                          <button className="icon-btn" onClick={() => setEditId(null)}><X size={15} /></button>
                        </div>
                      ) : (
                        <>
                          <div><div className="row-title">{tightDesc(l.descriptionSnapshot)}</div><div className="row-sub">{num(l.totalPkts, 0)} pkts · {num(l.weight)} kg{l.note ? ` · ${l.note}` : ""} · {fmtDate(l.date)}</div></div>
                          <div className="row-actions">
                            {canEdit && <button className="icon-btn" onClick={() => { setEditId(l.id); setEf({ pkts: l.totalPkts, note: l.note || "", date: l.date, pktsPerPltSnapshot: l.pktsPerPltSnapshot, weightPerPktSnapshot: l.weightPerPktSnapshot }); }}><Pencil size={15} /></button>}
                            {canDelete && <button className="icon-btn" onClick={() => { if (confirmDelete("this line")) persist.udhaar(udhaar.filter((x) => x.id !== l.id)); }}><Trash2 size={15} /></button>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {mb && <ManageUdhaarModal ctx={ctx} batch={mb} onClose={() => setManage(null)} />}
    </div>
  );
}
function UdhaarTableView({ ctx }) {
  const { descriptions, udhaar, persist, stockMap, descLabel, pktWeight } = ctx;
  const canEdit = ctx.canModule("udhaar", "edit");
  const [q, setQ] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState("");
  const [savedId, setSavedId] = useState(null);
  const balMap = useMemo(() => {
    const m = new Map();
    udhaar.forEach((u) => {
      const cur = m.get(u.descriptionId) || { pkts: 0, weight: 0, date: u.date };
      cur.pkts += N(u.totalPkts); cur.weight += N(u.weight);
      if ((u.date || "") > (cur.date || "")) cur.date = u.date;
      m.set(u.descriptionId, cur);
    });
    return m;
  }, [udhaar]);
  const get = (id) => {
    if (draft[id]) return draft[id];
    const b = balMap.get(id);
    const d = descriptions.find((x) => x.id === id);
    const perPlt = d ? N(d.pktsPerPlt) : 0;
    const pk = b ? b.pkts : 0;
    return { plts: b && perPlt ? String(Math.floor(pk / perPlt)) : "", loose: b && perPlt ? String(pk % perPlt) : "" };
  };
  const linePkts = (d) => N(get(d.id).plts) * N(d.pktsPerPlt) + N(get(d.id).loose);
  const list = descriptions.filter((d) => {
    if (onlyStock && (stockMap.get(d.id)?.godownPkts || 0) <= 0) return false;
    return !q.trim() || descLabel(d).toLowerCase().includes(q.toLowerCase());
  });
  const saveRow = (d) => {
    setErr("");
    const plts = N(get(d.id).plts), loose = N(get(d.id).loose);
    const pk = plts * N(d.pktsPerPlt) + loose;
    const godown = stockMap.get(d.id)?.godownPkts || 0;
    if (pk > godown) { setErr(`${descLabel(d)}: udhaar ${num(pk, 0)} pkts exceeds godown stock ${num(godown, 0)} pkts (In − Purchased).`); return; }
    const rest = udhaar.filter((u) => u.descriptionId !== d.id);
    const next = pk > 0 ? [...rest, {
      id: uid(), batchId: null, date: todayISO(), partyName: null, reference: null,
      descriptionId: d.id, descriptionSnapshot: descLabel(d), pktsPerPltSnapshot: N(d.pktsPerPlt), weightPerPktSnapshot: pktWeight(d),
      plts, loosePkts: loose, totalPkts: pk, weight: pk * pktWeight(d), note: "adjusted in table",
    }] : rest;
    persist.udhaar(next);
    setDraft({ ...draft, [d.id]: { plts: pk ? String(plts) : "", loose: pk ? String(loose) : "" } });
    setSavedId(d.id); setTimeout(() => setSavedId(null), 1500);
  };
  return (
    <div>
      <SectionHead title="Udhaar table — set balance per item" />
      <div className="info-banner">Balances come from udhaar entries (In − Purchased cap applies). Amber = udhaar more than one PLT (with pallet suggestion). Red = over godown. Setting 0 clears udhaar. Purchases auto-settle udhaar; deleting them returns it.</div>
      <div className="filter-bar no-print">
        <Field label="Search item"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="description..." /></div></Field>
        <Field label="Filter">
          <button type="button" className={"btn " + (onlyStock ? "primary" : "")} onClick={() => setOnlyStock((o) => !o)}>
            <Boxes size={14} /> Only current stock {onlyStock ? "✓" : ""}
          </button>
        </Field>
      </div>
      {err && <div className="notice-warn">{err}</div>}
      <div className="tbl-wrap">
        <table className="ledger-table">
          <thead><tr><th>Description</th><th>Pkts/PLT</th><th>Godown PKTs</th><th>Udhaar PLTs</th><th>Loose pkts</th><th>Udhaar PKTs</th><th>Available PKTs</th><th>Udhaar Weight</th><th>Suggest purchase</th><th className="no-print" /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={10}><EmptyRow>{onlyStock ? "No items with current stock match." : "No items match."}</EmptyRow></td></tr>}
            {list.map((d) => {
              const godown = stockMap.get(d.id)?.godownPkts || 0;
              const bal = balMap.get(d.id);
              const savedPk = bal ? bal.pkts : 0;
              const pk = linePkts(d);
              const over = savedPk > godown;
              const hot = !over && savedPk > N(d.pktsPerPlt);
              const sug = suggestPlts(d.pktsPerPlt, savedPk);
              return (
                <tr key={d.id} className={over ? "row-over" : hot ? "row-hot" : ""}>
                  <td><b>{descLabel(d)}</b></td>
                  <td className="mono">{num(d.pktsPerPlt, 0)}</td>
                  <td className="mono">{num(godown, 0)}</td>
                  <td>{canEdit ? <input className="tbl-input" type="number" value={get(d.id).plts} onChange={(e) => setDraft({ ...draft, [d.id]: { ...get(d.id), plts: e.target.value } })} placeholder="0" /> : <span className="mono">{num(d.pktsPerPlt ? Math.floor(savedPk / N(d.pktsPerPlt)) : 0, 0)}</span>}</td>
                  <td>{canEdit ? <input className="tbl-input" type="number" value={get(d.id).loose} onChange={(e) => setDraft({ ...draft, [d.id]: { ...get(d.id), loose: e.target.value } })} placeholder="0" /> : <span className="mono">{num(d.pktsPerPlt ? savedPk % N(d.pktsPerPlt) : 0, 0)}</span>}</td>
                  <td className="mono"><b>{num(pk, 0)}</b></td>
                  <td className="mono">{num(godown - savedPk, 0)}</td>
                  <td className="mono">{num(pk * pktWeight(d))} kg</td>
                  <td>{sug > 0 ? <Stamp tone="amber">Buy {sug} PLT</Stamp> : <span className="mono">—</span>}</td>
                  <td className="row-actions no-print">
                    {canEdit && <button className="icon-btn" title="Save udhaar" onClick={() => saveRow(d)}>{savedId === d.id ? <Check size={15} /> : <Pencil size={15} />}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function UdhaarReportView({ ctx }) {
  const { udhaar, stockMap, descriptions } = ctx;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ field: "description", dir: "asc" });
  if (!ctx.canModule("udhaar", "report")) return <LockedNote />;
  const balMap = useMemo(() => {
    const m = new Map();
    udhaar.forEach((u) => {
      if (N(u.totalPkts) <= 0) return;
      const cur = m.get(u.descriptionId) || { pkts: 0, weight: 0, date: u.date, perPlt: N(u.pktsPerPltSnapshot) };
      cur.pkts += N(u.totalPkts); cur.weight += N(u.weight);
      if ((u.date || "") > (cur.date || "")) cur.date = u.date;
      m.set(u.descriptionId, cur);
    });
    return m;
  }, [udhaar]);
  const base = [...balMap.entries()].map(([id, b]) => {
    const d = descriptions.find((x) => x.id === id);
    const row = udhaar.find((u) => u.descriptionId === id);
    return {
      descriptionId: id,
      description: d ? ctx.descLabel(d) : tightDesc(row ? row.descriptionSnapshot : ""),
      pkts: b.pkts, weight: b.weight, date: b.date,
      perPlt: d ? N(d.pktsPerPlt) : b.perPlt,
    };
  }).filter((r) => !q.trim() || r.description.toLowerCase().includes(q.toLowerCase()));
  const getters = {
    description: (r) => r.description, pkts: (r) => r.pkts, weight: (r) => r.weight,
    godown: (r) => stockMap.get(r.descriptionId)?.godownPkts || 0,
    available: (r) => (stockMap.get(r.descriptionId)?.godownPkts || 0) - r.pkts,
  };
  const rows = sortRows(base, sort, getters);
  const gP = rows.reduce((a, r) => a + r.pkts, 0), gW = rows.reduce((a, r) => a + r.weight, 0);
  const flagFor = (r) => {
    const godown = stockMap.get(r.descriptionId)?.godownPkts || 0;
    if (r.pkts > godown) return "over";
    if (r.pkts > r.perPlt) return "hot";
    return "";
  };
  const bodyHtml = () => {
    let html = `<table><thead><tr><th>Description</th><th>Pkts/PLT</th><th>Udhaar PKTs</th><th>Godown</th><th>Available</th><th>Weight</th><th>Suggest</th><th>Updated</th></tr></thead><tbody>`;
    rows.forEach((r) => {
      const godown = stockMap.get(r.descriptionId)?.godownPkts || 0;
      const fl = flagFor(r);
      const sug = suggestPlts(r.perPlt, r.pkts);
      html += `<tr class="${fl}"><td>${esc(r.description)}</td><td>${num(r.perPlt, 0)}</td><td>${num(r.pkts, 0)}</td><td>${num(godown, 0)}</td><td>${num(godown - r.pkts, 0)}</td><td>${num(r.weight)}</td><td>${sug > 0 ? sug + " PLT" : ""}</td><td>${esc(fmtDate(r.date))}</td></tr>`;
    });
    html += `</tbody><tfoot><tr><td colspan="2">${rows.length} item(s)</td><td>${num(gP, 0)}</td><td></td><td></td><td>${num(gW)}</td><td></td><td></td></tr></tfoot></table>`;
    return html;
  };
  return (
    <div>
      <SectionHead title="Udhaar report" onPrint={() => printHTML("Udhaar report", bodyHtml() || "<p>No udhaar.</p>")} onDownload={() => downloadReportFile("Udhaar report", bodyHtml() || "<p>No udhaar.</p>")} />
      <div className="filter-bar no-print">
        <Field label="Search item"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <SortControl value={sort} onChange={setSort} options={[{ value: "description", label: "Description" }, { value: "pkts", label: "Udhaar PKTs" }, { value: "godown", label: "Godown" }, { value: "available", label: "Available" }, { value: "weight", label: "Weight" }]} />
      </div>
      <div className="tbl-wrap">
        <table className="ledger-table">
          <thead><tr><th>Description</th><th>Pkts/PLT</th><th>Udhaar PKTs</th><th>Godown PKTs</th><th>Available</th><th>Weight</th><th>Suggest purchase</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8}><EmptyRow>No udhaar recorded.</EmptyRow></td></tr>}
            {rows.map((r) => {
              const godown = stockMap.get(r.descriptionId)?.godownPkts || 0;
              const fl = flagFor(r);
              const sug = suggestPlts(r.perPlt, r.pkts);
              return (
                <tr key={r.descriptionId} className={fl === "over" ? "row-over" : fl === "hot" ? "row-hot" : ""}>
                  <td><b>{r.description}</b></td>
                  <td className="mono">{num(r.perPlt, 0)}</td>
                  <td className="mono"><b>{num(r.pkts, 0)}</b></td>
                  <td className="mono">{num(godown, 0)}</td>
                  <td className="mono">{num(godown - r.pkts, 0)}</td>
                  <td className="mono">{num(r.weight)} kg</td>
                  <td>{sug > 0 ? <Stamp tone="amber">Buy {sug} PLT</Stamp> : <span className="mono">—</span>}</td>
                  <td className="mono">{fmtDate(r.date)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (<tfoot><tr><td colSpan={2}>{rows.length} item(s)</td><td className="mono">{num(gP, 0)}</td><td /><td /><td className="mono">{num(gW)}</td><td /><td /></tr></tfoot>)}
        </table>
      </div>
    </div>
  );
}

/* ================= STOCK REPORTS ================= */
function StockReportTab({ ctx }) {
  const { pktStock } = ctx;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ field: "description", dir: "asc" });
  if (!ctx.canModule("stock", "report")) return <LockedNote />;
  const base = pktStock.filter((r) => !q.trim() || r.description.toLowerCase().includes(q.toLowerCase()));
  const getters = { description: (r) => r.description, plts: (r) => r.totalPlts, pkts: (r) => r.totalPkts, purchase: (r) => r.purPkts, udhaar: (r) => r.udPkts, available: (r) => r.availablePkts, weight: (r) => r.totalWeight };
  const rows = sortRows(base, sort, getters);
  const T = rows.reduce((a, r) => ({ plts: a.plts + r.totalPlts, pkts: a.pkts + r.totalPkts, pur: a.pur + r.purPkts, ud: a.ud + r.udPkts, av: a.av + r.availablePkts, wt: a.wt + r.totalWeight, wtAv: a.wtAv + r.availableWeight }), { plts: 0, pkts: 0, pur: 0, ud: 0, av: 0, wt: 0, wtAv: 0 });
  const bodyHtml = () => {
    let html = `<table><thead><tr><th>Description</th><th>PLTs</th><th>Pkts Total (In)</th><th>Purchased (−)</th><th>Udhaar (−)</th><th>Pkts After</th><th>Weight Total</th><th>Weight After</th></tr></thead><tbody>`;
    rows.forEach((r) => { html += `<tr><td>${esc(r.description)}</td><td>${num(r.totalPlts, 0)}</td><td>${num(r.totalPkts, 0)}</td><td>${num(r.purPkts, 0)}</td><td>${num(r.udPkts, 0)}</td><td>${num(r.availablePkts, 0)}</td><td>${num(r.totalWeight)}</td><td>${num(r.availableWeight)}</td></tr>`; });
    html += `</tbody><tfoot><tr><td>${rows.length} description(s)</td><td>${num(T.plts, 0)}</td><td>${num(T.pkts, 0)}</td><td>${num(T.pur, 0)}</td><td>${num(T.ud, 0)}</td><td>${num(T.av, 0)}</td><td>${num(T.wt)}</td><td>${num(T.wtAv)}</td></tr></tfoot></table>`;
    return html;
  };
  return (
    <div>
      <SectionHead title="PKT Stock Report (In − Purchase − Udhaar)" onPrint={() => printHTML("PKT stock report", bodyHtml())} onDownload={() => downloadReportFile("PKT Stock Report", bodyHtml())} />
      <div className="filter-bar no-print">
        <Field label="Search"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <SortControl value={sort} onChange={setSort} options={[{ value: "description", label: "Description" }, { value: "plts", label: "PLTs" }, { value: "pkts", label: "Pkts Total" }, { value: "purchase", label: "Purchased" }, { value: "udhaar", label: "Udhaar" }, { value: "available", label: "Available" }, { value: "weight", label: "Weight" }]} />
      </div>
      <div className="tbl-wrap">
        <table className="ledger-table">
          <thead><tr><th>Description</th><th>PLTs</th><th>Pkts Total (In)</th><th>Purchased (−)</th><th>Udhaar (−)</th><th>Pkts After</th><th>Weight Total</th><th>Weight After</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8}><EmptyRow>No stock yet.</EmptyRow></td></tr>}
            {rows.map((r) => (
              <tr key={r.descriptionId}>
                <td><b>{r.description}</b></td>
                <td className="mono">{num(r.totalPlts, 0)}</td>
                <td className="mono">{num(r.totalPkts, 0)}</td>
                <td className="mono">{num(r.purPkts, 0)}</td>
                <td className="mono">{num(r.udPkts, 0)}</td>
                <td className="mono"><b>{num(r.availablePkts, 0)}</b></td>
                <td className="mono">{num(r.totalWeight)} kg</td>
                <td className="mono">{num(r.availableWeight)} kg</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (<tfoot><tr><td>{rows.length} description(s)</td><td className="mono">{num(T.plts, 0)}</td><td className="mono">{num(T.pkts, 0)}</td><td className="mono">{num(T.pur, 0)}</td><td className="mono">{num(T.ud, 0)}</td><td className="mono">{num(T.av, 0)}</td><td className="mono">{num(T.wt)}</td><td className="mono">{num(T.wtAv)}</td></tr></tfoot>)}
        </table>
      </div>
    </div>
  );
}
function SaleBaseStockTab({ ctx }) {
  const { pktStock } = ctx;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ field: "description", dir: "asc" });
  if (!ctx.canModule("stock", "report")) return <LockedNote />;
  const base = pktStock.filter((r) => !q.trim() || r.description.toLowerCase().includes(q.toLowerCase()));
  const getters = {
    description: (r) => r.description, plts: (r) => r.godownPlts, pkts: (r) => r.godownPkts,
    udhaar: (r) => r.udPkts, afterUdhaar: (r) => r.availablePkts,
    weight: (r) => r.godownWeight, weightAfter: (r) => r.availableWeight,
  };
  const rows = sortRows(base, sort, getters);
  const T = rows.reduce((a, r) => ({ plts: a.plts + r.godownPlts, pkts: a.pkts + r.godownPkts, ud: a.ud + r.udPkts, au: a.au + r.availablePkts, wt: a.wt + r.godownWeight, wa: a.wa + r.availableWeight }), { plts: 0, pkts: 0, ud: 0, au: 0, wt: 0, wa: 0 });
  const bodyHtml = () => {
    let html = `<table><thead><tr><th>Description</th><th>Current PLTs</th><th>Current PKTs</th><th>Udhaar</th><th>PKTs After Udhaar</th><th>Weight</th><th>Weight After Udhaar</th></tr></thead><tbody>`;
    rows.forEach((r) => { html += `<tr><td>${esc(r.description)} <span class="badge">${num(r.pktsPerPlt, 0)}/PLT</span></td><td>${num(r.godownPlts, 0)}</td><td>${num(r.godownPkts, 0)}</td><td>${num(r.udPkts, 0)}</td><td>${num(r.availablePkts, 0)}</td><td>${num(r.godownWeight)}</td><td>${num(r.availableWeight)}</td></tr>`; });
    html += `</tbody><tfoot><tr><td>${rows.length} description(s)</td><td>${num(T.plts, 0)}</td><td>${num(T.pkts, 0)}</td><td>${num(T.ud, 0)}</td><td>${num(T.au, 0)}</td><td>${num(T.wt)}</td><td>${num(T.wa)}</td></tr></tfoot></table>`;
    return html;
  };
  return (
    <div>
      <SectionHead title="Sale Base Stock" onPrint={() => printHTML("Sale Base Stock", bodyHtml())} onDownload={() => downloadReportFile("Sale Base Stock", bodyHtml())} />
      <div className="info-banner">Current PLTs / PKTs = after purchases (In − Purchased). Weight = weight of current pkts. PKTs After Udhaar = current − udhaar.</div>
      <div className="filter-bar no-print">
        <Field label="Search"><div className="search-input"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <SortControl value={sort} onChange={setSort} options={[{ value: "description", label: "Description" }, { value: "plts", label: "Current PLTs" }, { value: "pkts", label: "Current PKTs" }, { value: "udhaar", label: "Udhaar" }, { value: "afterUdhaar", label: "After Udhaar" }, { value: "weight", label: "Weight" }, { value: "weightAfter", label: "Weight After" }]} />
      </div>
      <div className="tbl-wrap">
        <table className="ledger-table">
          <thead><tr><th>Description</th><th>Current PLTs</th><th>Current PKTs</th><th>Udhaar (−)</th><th>PKTs After Udhaar</th><th>Weight</th><th>Weight After Udhaar</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}><EmptyRow>No stock yet.</EmptyRow></td></tr>}
            {rows.map((r) => (
              <tr key={r.descriptionId}>
                <td><b>{r.description}</b> <span className="mono-tag entry-tag">{num(r.pktsPerPlt, 0)}/PLT</span></td>
                <td className="mono">{num(r.godownPlts, 0)}</td>
                <td className="mono">{num(r.godownPkts, 0)}</td>
                <td className="mono">{num(r.udPkts, 0)}</td>
                <td className="mono"><b>{num(r.availablePkts, 0)}</b></td>
                <td className="mono">{num(r.godownWeight)} kg</td>
                <td className="mono">{num(r.availableWeight)} kg</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (<tfoot><tr><td>{rows.length} description(s)</td><td className="mono">{num(T.plts, 0)}</td><td className="mono">{num(T.pkts, 0)}</td><td className="mono">{num(T.ud, 0)}</td><td className="mono">{num(T.au, 0)}</td><td className="mono">{num(T.wt)}</td><td className="mono">{num(T.wa)}</td></tr></tfoot>)}
        </table>
      </div>
    </div>
  );
}

/* ================= DASHBOARD (unchanged interface) ================= */
function Dashboard({ ctx, setView }) {
  const { pktStock, pktIn, purchases, udhaar, inLabel, puLabel, udLabel } = ctx;
  const canView = ctx.canModule("dashboard", "view");
  const T = pktStock.reduce((a, r) => ({ plts: a.plts + r.totalPlts, pkts: a.pkts + r.totalPkts, pur: a.pur + r.purPkts, ud: a.ud + r.udPkts, av: a.av + r.availablePkts, wt: a.wt + r.totalWeight, wtAv: a.wtAv + r.availableWeight }), { plts: 0, pkts: 0, pur: 0, ud: 0, av: 0, wt: 0, wtAv: 0 });
  const purchAmount = purchases.reduce((a, p) => a + N(p.totalAmount), 0);
  if (!canView) return <LockedNote />;
  const cards = [
    { label: "Total Stock (In)", value: num(T.pkts, 0), sub: num(T.plts, 0) + " PLTs received", cls: "blue", icon: Boxes },
    { label: "Purchased (out)", value: money(purchAmount), sub: num(T.pur, 0) + " pkts minus from stock", cls: "red", icon: Receipt },
    { label: "Udhaar Out", value: num(T.ud, 0), sub: num(T.udWeight) + " kg with parties", cls: "green", icon: PackageCheck },
    { label: "Available", value: num(T.av, 0), sub: num(T.wtAv) + " kg left (In−Purch−Udhaar)", cls: "purple", icon: Truck },
  ];
  const top = [...pktStock].sort((a, b) => b.totalPkts - a.totalPkts).slice(0, 5);
  const maxBar = Math.max(1, ...top.map((r) => Math.max(r.inPkts, r.purPkts, r.udPkts)));
  const donutPool = pktStock.filter((r) => r.availablePkts > 0);
  const donutTop = [...donutPool].sort((a, b) => b.availablePkts - a.availablePkts).slice(0, 5);
  const others = donutPool.filter((r) => !donutTop.includes(r)).reduce((a, r) => a + r.availablePkts, 0);
  const slices = [...donutTop.map((r) => ({ label: r.description, v: r.availablePkts }))];
  if (others > 0) slices.push({ label: "Others", v: others });
  const donutTotal = slices.reduce((a, s) => a + s.v, 0) || 1;
  const palette = ["#4318FF", "#2eb872", "#f5a524", "#7551FF", "#12b3d6", "#e5484d"];
  let acc = 0;
  const udhaarRecent = (() => {
    const m = new Map();
    udhaar.forEach((u) => { const k = u.batchId || u.id; if (!m.has(k)) m.set(k, []); m.get(k).push(u); });
    return [...m.entries()].map(([k, ls]) => ({
      date: ls[0].date, tag: udLabel.get(k),
      text: ls[0].reference || `${ls.length} item(s)`,
      val: num(ls.reduce((a, l) => a + N(l.totalPkts), 0), 0) + " pkts udhaar", cls: "red",
    }));
  })();
  const recent = [
    ...pktIn.map((r) => ({ date: r.date, tag: inLabel.get(r.batchId), text: tightDesc(r.descriptionSnapshot), val: num(r.totalPkts, 0) + " pkts in", cls: "blue" })),
    ...purchases.map((r) => ({ date: r.date, tag: puLabel.get(r.batchId), text: tightDesc(r.descriptionSnapshot), val: money(r.totalAmount), cls: "green" })),
    ...udhaarRecent,
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const inStock = pktStock.filter((r) => r.availablePkts >= r.pktsPerPlt && r.pktsPerPlt > 0).length;
  const low = pktStock.filter((r) => r.availablePkts > 0 && r.availablePkts < r.pktsPerPlt).length;
  const out = pktStock.filter((r) => r.availablePkts <= 0).length;
  const sumCount = Math.max(1, inStock + low + out);
  return (
    <div>
      <div className="dash-cards">
        {cards.map((c) => { const Icon = c.icon; return (
          <div className={`stat-card ${c.cls}`} key={c.label}>
            <div className="ic"><Icon size={18} /></div>
            <div><div className="l">{c.label}</div><div className="v">{c.value}</div><div className="s">{c.sub}</div></div>
          </div>); })}
      </div>
      <div className="dash-row">
        <div className="chart-card">
          <h3 className="chart-title">In vs Purchase (out) vs Udhaar (pkts)</h3>
          {top.length === 0 && <EmptyRow>No data yet.</EmptyRow>}
          {top.length > 0 && (
            <>
              <div className="bars">
                {top.map((r) => (
                  <div className="bar-group" key={r.descriptionId}>
                    <div className="bar b-in" style={{ height: `${(r.inPkts / maxBar) * 100}%` }} title={`In ${num(r.inPkts, 0)}`} />
                    <div className="bar b-pu" style={{ height: `${(r.purPkts / maxBar) * 100}%` }} title={`Purchase ${num(r.purPkts, 0)}`} />
                    <div className="bar b-ud" style={{ height: `${(r.udPkts / maxBar) * 100}%` }} title={`Udhaar ${num(r.udPkts, 0)}`} />
                  </div>
                ))}
              </div>
              <div className="bar-x">{top.map((r) => (<span key={r.descriptionId} title={r.description}>{r.description}</span>))}</div>
              <div className="legend"><span><i style={{ background: "#4318FF" }} />PKT In</span><span><i style={{ background: "#2eb872" }} />Purchase (out)</span><span><i style={{ background: "#e5484d" }} />Udhaar</span></div>
            </>
          )}
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Available stock share</h3>
          {slices.length === 0 && <EmptyRow>No available stock.</EmptyRow>}
          {slices.length > 0 && (
            <div className="donut-wrap">
              <svg viewBox="0 0 42 42" width="150" height="150">
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="#eef2f6" strokeWidth="6" />
                {slices.map((s, i) => {
                  const frac = (s.v / donutTotal) * 100;
                  const el = (<circle key={s.label} cx="21" cy="21" r="15.915" fill="none" stroke={palette[i % palette.length]} strokeWidth="6" strokeDasharray={`${frac} ${100 - frac}`} strokeDashoffset={-acc} transform="rotate(-90 21 21)" />);
                  acc += frac;
                  return el;
                })}
                <text x="21" y="20.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#1B2559">{num(donutTotal, 0)}</text>
                <text x="21" y="26" textAnchor="middle" fontSize="3" fill="#7b8ba3">pkts available</text>
              </svg>
              <div className="donut-legend">
                {slices.map((s, i) => (<div key={s.label}><i style={{ background: palette[i % palette.length], width: 10, height: 10, borderRadius: 3, display: "inline-block", marginRight: 6 }} />{s.label} — <b>{Math.round((s.v / donutTotal) * 100)}%</b></div>))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="dash-row">
        <div className="chart-card">
          <h3 className="chart-title">Recent activity</h3>
          {recent.length === 0 && <EmptyRow>Nothing yet — add PKT In first.</EmptyRow>}
          {recent.map((r, i) => (
            <div className="recent-row" key={i}>
              <span><span className={`dot ${r.cls}`} /> <b className="mono-tag">{r.tag}</b> {r.text}</span>
              <span className="mono-tag">{r.val} · {fmtDate(r.date)}</span>
            </div>
          ))}
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Stock summary</h3>
          {[["In stock (≥ 1 PLT)", inStock, "#2eb872"], ["Low (< 1 PLT)", low, "#f5a524"], ["Out of stock", out, "#e5484d"]].map(([lb, v, col]) => (
            <div className="summary-row" key={lb}>
              <div className="summary-head"><span>{lb}</span><span>{v} item(s)</span></div>
              <div className="summary-track"><div className="summary-fill" style={{ width: `${(v / sumCount) * 100}%`, background: col }} /></div>
            </div>
          ))}
          <h3 className="chart-title" style={{ marginTop: 12 }}>Quick links</h3>
          <div className="ql-grid">
            <button className="ql-btn" onClick={() => setView("in-entries")}><Boxes size={18} /> PKT In</button>
            <button className="ql-btn" onClick={() => setView("pu-entries")}><Receipt size={18} /> Purchase</button>
            <button className="ql-btn" onClick={() => setView("ud-entries")}><PackageCheck size={18} /> Udhaar</button>
            <button className="ql-btn" onClick={() => setView("salebase-stock")}><Truck size={18} /> Sale Base Stock</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= TEAM (module permissions) ================= */
function TeamTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [dirty, setDirty] = useState({});
  const [err, setErr] = useState("");
  const MODULES = [
    { id: "dashboard", label: "Dashboard", desc: "Overview cards & charts", icon: LayoutDashboard, actions: [] },
    { id: "masters", label: "Masters", desc: "Brands, suppliers & descriptions", icon: ClipboardList, actions: ["add", "edit", "delete"] },
    { id: "pktIn", label: "PKT In", desc: "Stock-in entries & report", icon: Boxes, actions: ["add", "edit", "delete", "report"] },
    { id: "purchases", label: "Purchases", desc: "Purchase entries & report", icon: Receipt, actions: ["add", "edit", "delete", "report"] },
    { id: "udhaar", label: "Udhaar", desc: "Udhaar entries, table & report", icon: PackageCheck, actions: ["add", "edit", "delete", "report"] },
    { id: "stock", label: "Stock Reports", desc: "PKT stock & Sale Base stock", icon: Truck, actions: ["report"] },
  ];
  useEffect(() => {
    (async () => {
      try { setRows(await sbList("profiles", "?select=*&order=created_at.asc")); }
      catch (e) { setErr(e.message); }
      setLoading(false);
    })();
  }, []);
  const markDirty = (id) => setDirty((d) => ({ ...d, [id]: true }));
  const updatePerm = (userId, moduleId, actionId, checked) => {
    markDirty(userId);
    setRows(rows.map((r) => {
      if (r.id !== userId) return r;
      const perms = r.permissions || {};
      const mod = perms[moduleId] || {};
      if (actionId === "view" && !checked) return { ...r, permissions: { ...perms, [moduleId]: {} } };
      const nextMod = { ...mod, [actionId]: checked };
      if (checked && actionId !== "view") nextMod.view = true;
      return { ...r, permissions: { ...perms, [moduleId]: nextMod } };
    }));
  };
  const setRole = (userId, role) => { markDirty(userId); setRows(rows.map((r) => (r.id === userId ? { ...r, role } : r))); };
  const applyPreset = (userId, preset) => {
    markDirty(userId);
    const perms = {};
    MODULES.forEach((m) => {
      if (preset === "clear") { perms[m.id] = {}; return; }
      const mod = { view: true };
      if (preset === "full") m.actions.forEach((a) => { mod[a] = true; });
      perms[m.id] = mod;
    });
    setRows(rows.map((r) => (r.id === userId ? { ...r, permissions: perms } : r)));
  };
  const permCount = (r) => {
    const perms = r.permissions || {};
    let n = 0;
    MODULES.forEach((m) => {
      const mod = perms[m.id] || {};
      if (mod.view) n += 1;
      m.actions.forEach((a) => { if (mod[a]) n += 1; });
    });
    return n;
  };
  const save = async (row) => {
    setSavingId(row.id);
    try {
      await sbUpdate("profiles", row.id, { role: row.role, permissions: row.permissions || {} });
      setDirty((d) => { const n = { ...d }; delete n[row.id]; return n; });
      setSavedId(row.id);
      setTimeout(() => setSavedId(null), 1600);
    } catch (e) { alert("Save failed: " + e.message); }
    setSavingId(null);
  };
  if (loading) return <EmptyRow>Loading team…</EmptyRow>;
  if (err) return <LockedNote text={err} />;
  return (
    <div>
      <SectionHead title="Team & Access Control" />
      <div className="info-banner">Admins have full access to everything. For employees, switch on <b>View</b> for each module they can open, then tap the action chips (Add / Edit / Delete / Report) to grant rights inside that module. These permissions are enforced everywhere in the app.</div>
      <div className="team-grid-container">
        {rows.length === 0 && <EmptyRow>No accounts yet.</EmptyRow>}
        {rows.map((r) => {
          const isAdminUser = r.role === "admin";
          const perms = r.permissions || {};
          const initials = (r.fullName || r.email || "?").trim().charAt(0).toUpperCase();
          return (
            <div className="team-card" key={r.id}>
              <div className="team-card-top">
                <div className="team-avatar">{initials}</div>
                <div className="team-id">
                  <div className="team-name">{r.fullName || r.email}</div>
                  {r.fullName && <div className="team-mail">{r.email}</div>}
                </div>
                <div className="role-seg">
                  <button type="button" className={r.role === "admin" ? "on" : ""} onClick={() => setRole(r.id, "admin")}>Admin</button>
                  <button type="button" className={r.role === "employee" ? "on" : ""} onClick={() => setRole(r.id, "employee")}>Employee</button>
                </div>
                <div className="team-save">
                  {dirty[r.id] && <span className="dirty-dot" title="Unsaved changes" />}
                  <button className="btn primary" onClick={() => save(r)} disabled={savingId === r.id}>
                    {savingId === r.id ? "Saving…" : savedId === r.id ? "Saved ✓" : "Save"}
                  </button>
                </div>
              </div>
              {isAdminUser ? (
                <div className="team-admin-note"><Lock size={15} /> Admins automatically have full access to all modules — no per-module settings needed.</div>
              ) : (
                <>
                  <div className="perm-presets">
                    <span>Quick set</span>
                    <button type="button" className="preset-btn" onClick={() => applyPreset(r.id, "full")}>Full access</button>
                    <button type="button" className="preset-btn" onClick={() => applyPreset(r.id, "read")}>Read only</button>
                    <button type="button" className="preset-btn" onClick={() => applyPreset(r.id, "clear")}>Clear all</button>
                    <span className="perm-count">{permCount(r)} permission{permCount(r) === 1 ? "" : "s"}</span>
                  </div>
                  <div className="perm-list">
                    {MODULES.map((m) => {
                      const Icon = m.icon;
                      const mod = perms[m.id] || {};
                      return (
                        <div className={"perm-row " + (mod.view ? "on" : "off")} key={m.id}>
                          <div className="perm-mod">
                            <div className="perm-mod-ic"><Icon size={16} /></div>
                            <div>
                              <div className="perm-mod-label">{m.label}</div>
                              <div className="perm-mod-desc">{m.desc}</div>
                            </div>
                          </div>
                          <label className="switch">
                            <input type="checkbox" checked={!!mod.view} onChange={(e) => updatePerm(r.id, m.id, "view", e.target.checked)} />
                            <span className="switch-track"><span className="switch-thumb" /></span>
                            <span className="switch-label">View</span>
                          </label>
                          <div className="perm-actions">
                            {m.actions.length === 0 && <span className="perm-none">view only</span>}
                            {m.actions.map((a) => (
                              <button key={a} type="button" className={"perm-chip " + (mod[a] ? "on" : "")} disabled={!mod.view}
                                onClick={() => updatePerm(r.id, m.id, a, !mod[a])}>
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= AUTH + APP ================= */
function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [notice, setNotice] = useState("");
  const submit = async () => {
    setErr(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signin") {
        const d = await authSignIn(email.trim(), password);
        setAccessToken(d.access_token); await saveRefreshToken(d.refresh_token);
        onAuthed({ accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user });
      } else if (mode === "signup") {
        const d = await authSignUp(email.trim(), password, fullName.trim());
        if (d && d.access_token) { setAccessToken(d.access_token); await saveRefreshToken(d.refresh_token); onAuthed({ accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user }); }
        else { setNotice("Account created. If email confirmation is on, check your inbox, then sign in."); setMode("signin"); }
      } else { await authRecover(email.trim()); setNotice("If that email has an account, a reset link was sent."); }
    } catch (e) { setErr(e.message || "Something went wrong."); } finally { setBusy(false); }
  };
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); if (!busy && email && (mode === "forgot" || password)) submit(); }}>
        <div className="login-logo"><Boxes size={22} /></div>
        <h1 className="login-title">SALE BASE STOCK</h1>
        <div className="login-sub">{mode === "signin" ? "Sign in to continue" : mode === "signup" ? "Create an account" : "Reset your password"}</div>
        {mode === "signup" && <Field label="Full name (optional)"><input name="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>}
        <Field label="Email"><input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {mode !== "forgot" && <Field label="Password"><input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
        {err && <div className="login-error">{err}</div>}
        {notice && <div className="login-notice">{notice}</div>}
        <button type="submit" className="btn primary login-submit" disabled={busy || !email || (mode !== "forgot" && !password)}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        {mode === "signin" && (<>
          <button type="button" className="login-switch" onClick={() => { setMode("signup"); setErr(""); setNotice(""); }}>New here? Create an account</button>
          <button type="button" className="login-switch" onClick={() => { setMode("forgot"); setErr(""); setNotice(""); }}>Forgot password?</button>
        </>)}
        {mode !== "signin" && <button type="button" className="login-switch" onClick={() => { setMode("signin"); setErr(""); setNotice(""); }}>Back to sign in</button>}
      </form>
    </div>
  );
}
export default function PktStockManager() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  useEffect(() => {
    (async () => {
      const rt = loadRefreshToken();
      if (!rt) { setBooting(false); return; }
      try {
        const d = await authRefresh(rt);
        setAccessToken(d.access_token); saveRefreshToken(d.refresh_token);
        setSession({ accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user });
      } catch (e) { clearRefreshToken(); } finally { setBooting(false); }
    })();
  }, []);
  const signOut = async () => { setAccessToken(null); clearRefreshToken(); setSession(null); };
  if (booting) return <><Style /><div className="login-page"><div className="boot-loader"><Loader2 className="spin" size={22} /><span>Checking session...</span></div></div></>;
  if (!session) return <><Style /><LoginScreen onAuthed={setSession} /></>;
  return <AuthedApp session={session} onSignOut={signOut} />;
}
function AuthedApp({ session, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("dashboard");
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [pktIn, setPktIn] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [udhaar, setUdhaar] = useState([]);
  useEffect(() => {
    setAccessToken(session.accessToken);
    (async () => {
      try {
        const prof = await sbList("profiles", `?id=eq.${session.user.id}&select=*`);
        if (!prof[0]) { setLoadError("No profile row for this account. Run the schema SQL (with signup trigger) in Supabase, then sign in again."); setLoading(false); return; }
        setProfile(prof[0]);
        const [br, su, de, pi, pu, ud] = await Promise.all([
          sbList("pkt_brands"), sbList("pkt_suppliers"), sbList("pkt_descriptions"),
          sbList("pkt_in"), sbList("pkt_purchases"), sbList("pkt_udhaar"),
        ]);
        setBrands(br); setSuppliers(su); setDescriptions(de); setPktIn(pi); setPurchases(pu); setUdhaar(ud);
      } catch (e) { setLoadError(e.message || "Failed to load."); } finally { setLoading(false); }
    })();
  }, [session]);
  const mk = (getter, setter, table) => (v) => { const p = getter(); setter(v); return syncTable(table, p, v).catch((e) => { alert("Save failed: " + e.message); throw e; }); };
  const persist = {
    brands: mk(() => brands, setBrands, "pkt_brands"),
    suppliers: mk(() => suppliers, setSuppliers, "pkt_suppliers"),
    descriptions: mk(() => descriptions, setDescriptions, "pkt_descriptions"),
    pktIn: mk(() => pktIn, setPktIn, "pkt_in"),
    purchases: mk(() => purchases, setPurchases, "pkt_purchases"),
    udhaar: mk(() => udhaar, setUdhaar, "pkt_udhaar"),
  };
  const brandName = (id) => brands.find((b) => b.id === id)?.name || "—";
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const descOf = (id) => descriptions.find((d) => d.id === id);
  const descLabel = (d) => d ? `${d.width}x${d.length}/${d.gsm} ${brandName(d.brandId)}` : "—";
  const pktWeight = (d) => d ? (N(d.width) * N(d.length) * N(d.gsm)) / 15500 : 0;
  const descInUse = useMemo(() => new Set([...pktIn.map((x) => x.descriptionId), ...purchases.map((x) => x.descriptionId), ...udhaar.map((x) => x.descriptionId)]), [pktIn, purchases, udhaar]);
  const pktStock = useMemo(() => calculatePktStock({ descriptions, pktIn, purchases, udhaar, descLabel }), [descriptions, pktIn, purchases, udhaar, brands]); // eslint-disable-line
  const stockMap = useMemo(() => new Map(pktStock.map((r) => [r.descriptionId, r])), [pktStock]);
  const inLabel = useMemo(() => buildSequentialLabelMap(pktIn, "batchId", "PI"), [pktIn]);
  const puLabel = useMemo(() => buildSequentialLabelMap(purchases, "batchId", "PP"), [purchases]);
  const udLabel = useMemo(() => buildSequentialLabelMap(udhaar, "batchId", "UD"), [udhaar]);
  const applyUdhaarSettle = (udArr, lines) => {
    let next = udArr.map((u) => ({ ...u }));
    const settledMap = {};
    lines.forEach((ln) => {
      const d = descOf(ln.descriptionId); const perPlt = d ? N(d.pktsPerPlt) : 0; const wpp = d ? pktWeight(d) : 0;
      let remaining = N(ln.totalPkts); let settled = 0;
      next = next.map((u) => {
        if (u.descriptionId !== ln.descriptionId || remaining <= 0) return u;
        const cur = N(u.totalPkts);
        const take = Math.min(cur, remaining);
        remaining -= take; settled += take;
        const rem = cur - take;
        const plts = perPlt ? Math.floor(rem / perPlt) : 0;
        return { ...u, plts, loosePkts: rem - plts * perPlt, totalPkts: rem, weight: rem * wpp, date: todayISO() };
      });
      settledMap[ln.descriptionId] = (settledMap[ln.descriptionId] || 0) + settled;
    });
    next = next.filter((u) => N(u.totalPkts) > 0);
    return { next, settledMap };
  };
  const applyUdhaarRestore = (udArr, lines) => {
    let next = udArr.map((u) => ({ ...u }));
    lines.forEach((ln) => {
      const add = N(ln.udhaarSettled); if (!add) return;
      const d = descOf(ln.descriptionId); const perPlt = d ? N(d.pktsPerPlt) : 0; const wpp = d ? pktWeight(d) : 0;
      const idx = next.findIndex((u) => u.descriptionId === ln.descriptionId);
      if (idx >= 0) {
        const u = next[idx]; const rem = N(u.totalPkts) + add; const plts = perPlt ? Math.floor(rem / perPlt) : 0;
        next[idx] = { ...u, plts, loosePkts: rem - plts * perPlt, totalPkts: rem, weight: rem * wpp, date: todayISO() };
      } else {
        const plts = perPlt ? Math.floor(add / perPlt) : 0;
        next.push({ id: uid(), batchId: null, date: todayISO(), partyName: null, reference: null, descriptionId: ln.descriptionId, descriptionSnapshot: d ? descLabel(d) : "", pktsPerPltSnapshot: perPlt, weightPerPktSnapshot: wpp, plts, loosePkts: add - plts * perPlt, totalPkts: add, weight: add * wpp, note: "" });
      }
    });
    return next;
  };
  /* module-level permission check (reads permissions JSONB saved by Team page) */
  const canModule = (moduleId, action) => {
    if (!profile) return false;
    if (profile.role === "admin") return true;
    const mod = (profile.permissions || {})[moduleId] || {};
    if (!mod.view) return false;
    if (action === "view") return true;
    return mod[action] === true;
  };
  const can = (perm) => !!profile && (profile.role === "admin" || profile[perm]);
  const isAdmin = profile?.role === "admin";
  const mastersCanManage = canModule("masters", "add") || canModule("masters", "edit");
  const ctx = { brands, suppliers, descriptions, pktIn, purchases, udhaar, persist, brandName, supplierName, descOf, descLabel, pktWeight, descInUse, pktStock, stockMap, inLabel, puLabel, udLabel, applyUdhaarSettle, applyUdhaarRestore, can, canModule, isAdmin };
  if (loading) return <div className="app-shell loading-shell"><Loader2 className="spin" size={22} /><span>Opening PKT ledger...</span></div>;
  if (loadError) return <div className="app-shell"><div style={{ padding: 24 }}><LockedNote text={loadError} /><button className="btn" style={{ marginTop: 14 }} onClick={onSignOut}>Sign out</button></div></div>;
  return (
    <div className="app-shell">
      <Style />
      <div className="app-layout">
        <Rail view={view} setView={setView} isAdmin={isAdmin} onSignOut={onSignOut} permissions={profile?.permissions || {}} />
        <div className="main-area">
          <header className="page-head no-print">
            <div><h1>{VIEW_TITLES[view] || "Dashboard"}</h1><div className="page-sub">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div></div>
            <div className="user-chip"><div className="user-avatar">{(session.user.email || "U").charAt(0).toUpperCase()}</div><div><div className="user-mail">{session.user.email}</div><div className="user-role">{profile.role}</div></div></div>
          </header>
          <main className="app-main">
            {view === "dashboard" && <Dashboard ctx={ctx} setView={setView} />}
            {view === "m-brands" && <NameListEditor title="Brands" items={brands} setItems={persist.brands} placeholder="e.g. Ningbo Fold" canManage={mastersCanManage} isAdmin={isAdmin} blockedIds={descriptions.map((d) => d.brandId)} />}
            {view === "m-suppliers" && <NameListEditor title="Suppliers" items={suppliers} setItems={persist.suppliers} withContact placeholder="e.g. Punjab Board Mills" canManage={mastersCanManage} isAdmin={isAdmin} blockedIds={pktIn.map((r) => r.supplierId)} />}
            {view === "m-desc" && <DescriptionsEditor ctx={ctx} canManage={mastersCanManage} isAdmin={isAdmin} />}
            {view === "in-entries" && <PktInEntriesTab ctx={ctx} />}
            {view === "in-report" && <PktInReportView ctx={ctx} />}
            {view === "in-edit" && <PktInEditTab ctx={ctx} />}
            {view === "pu-entries" && <PurchaseEntriesTab ctx={ctx} />}
            {view === "pu-report" && <PurchaseReportView ctx={ctx} />}
            {view === "pu-edit" && <PurchaseEditTab ctx={ctx} />}
            {view === "ud-entries" && <UdhaarEntriesTab ctx={ctx} />}
            {view === "ud-table" && <UdhaarTableView ctx={ctx} />}
            {view === "ud-report" && <UdhaarReportView ctx={ctx} />}
            {view === "ud-edit" && <UdhaarEditTab ctx={ctx} />}
            {view === "stock" && <StockReportTab ctx={ctx} />}
            {view === "salebase-stock" && <SaleBaseStockTab ctx={ctx} />}
            {view === "team" && isAdmin && <TeamTab />}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ================= styles (embedded, responsive) ================= */
function Style() {
  return (<style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box}
:root{--navy:#1B2559;--blue:#4318FF;--blue2:#7551FF;--blue-soft:#EEEAFF;--red:#e5484d;--green:#2eb872;--amber:#f5a524;--bg:#eef2f6;--line:#e3e9f0;--text:#17324d;--muted:#7b8ba3;--shadow:0 4px 14px rgba(23,50,77,.08);--radius:12px}
html,body,#root{height:100%;margin:0;padding:0;width:100%;background:var(--bg);color:var(--text);font-family:'Inter','Segoe UI',sans-serif;font-size:14px}
input,textarea,select,button{font-family:inherit;color:var(--text)}
.mono,.mono-tag{font-family:'JetBrains Mono',monospace}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.app-shell{min-height:100vh}
.loading-shell{display:flex;align-items:center;justify-content:center;gap:10px;padding:60px 0;color:var(--muted);font-weight:600}
.app-layout{display:flex;min-height:100vh}
.main-area{flex:1;min-width:0;padding:16px 20px 34px}
.app-main{max-width:1240px;margin:0 auto}
.download-btn{background:linear-gradient(135deg,#01B574,#2eb872);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(1,181,116,.28)}
.download-btn:hover{color:#fff;filter:brightness(1.06)}
.team-grid-container{display:flex;flex-direction:column;gap:16px}
.team-card{background:#fff;border-radius:18px;box-shadow:var(--shadow);overflow:hidden;border:1px solid var(--line);padding:0}
.team-card-top{display:flex;align-items:center;gap:14px;padding:16px 20px;background:linear-gradient(180deg,#fbfcff,#fff);border-bottom:1px solid var(--line);flex-wrap:wrap}
.team-avatar{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 14px rgba(67,24,255,.25)}
.team-id{flex:1;min-width:140px}
.team-name{font-weight:800;font-size:14px;color:var(--navy)}
.team-mail{font-size:11.5px;color:var(--muted);font-weight:600;margin-top:1px}
.role-seg{display:flex;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px}
.role-seg button{border:none;background:transparent;font-size:11.5px;font-weight:800;color:var(--muted);padding:6px 14px;border-radius:999px;cursor:pointer;transition:.15s}
.role-seg button.on{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;box-shadow:0 4px 10px rgba(67,24,255,.3)}
.team-save{display:flex;align-items:center;gap:8px}
.dirty-dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 0 3px rgba(245,165,36,.2)}
.team-admin-note{margin:14px 20px 18px;display:flex;align-items:center;gap:10px;background:var(--blue-soft);border:1px solid rgba(67,24,255,.25);color:var(--blue);border-radius:12px;padding:10px 14px;font-size:12.5px;font-weight:700}
.perm-presets{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--line);background:#fbfcff}
.perm-presets>span:first-child{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.preset-btn{border:1px solid var(--line);background:#fff;border-radius:999px;font-size:11px;font-weight:700;color:var(--navy);padding:5px 12px;cursor:pointer;transition:.15s}
.preset-btn:hover{border-color:var(--blue);color:var(--blue)}
.perm-count{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);font-weight:700}
.perm-list{display:flex;flex-direction:column}
.perm-row{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--line);transition:background .15s;flex-wrap:wrap}
.perm-row:last-child{border-bottom:none}
.perm-row:hover{background:#fbfcff}
.perm-row.off .perm-mod-ic,.perm-row.off .perm-mod-label,.perm-row.off .perm-mod-desc{opacity:.45}
.perm-mod{display:flex;align-items:center;gap:12px;flex:1;min-width:190px}
.perm-mod-ic{width:34px;height:34px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.perm-mod-label{font-weight:800;font-size:13px;color:var(--navy)}
.perm-mod-desc{font-size:11px;color:var(--muted);font-weight:600;margin-top:1px}
.perm-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.perm-chip{border:1px solid var(--line);background:#fff;border-radius:999px;font-size:11px;font-weight:800;color:var(--muted);padding:6px 13px;cursor:pointer;transition:.15s;text-transform:uppercase;letter-spacing:.04em}
.perm-chip:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}
.perm-chip.on{background:var(--blue-soft);border-color:rgba(67,24,255,.4);color:var(--blue)}
.perm-chip:disabled{opacity:.35;cursor:not-allowed}
.perm-none{font-size:11px;color:var(--muted);font-style:italic}
.switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.switch input{display:none}
.switch-track{width:38px;height:22px;border-radius:999px;background:#d7dcea;position:relative;transition:.2s;flex-shrink:0}
.switch-thumb{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 2px 5px rgba(0,0,0,.2)}
.switch input:checked + .switch-track{background:linear-gradient(135deg,var(--blue),var(--blue2))}
.switch input:checked + .switch-track .switch-thumb{left:19px}
.switch-label{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.rail{width:248px;flex-shrink:0;background:linear-gradient(180deg,#fff 0%,#f7f8ff 100%);border-right:1px solid #e6e8f5;display:flex;flex-direction:column;padding:12px 10px;gap:3px;position:sticky;top:0;height:100vh;z-index:30;box-shadow:4px 0 24px rgba(23,50,77,.06)}
.rail-top{display:flex;align-items:center;gap:10px;padding:4px 6px 12px;border-bottom:1px solid #eceef8;margin-bottom:8px}
.rail-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 8px 18px rgba(67,24,255,.35)}
.rail-brand-title{font-size:14px;font-weight:800;color:var(--navy);white-space:nowrap}
.rail-brand-sub{font-size:9.5px;color:var(--blue2);font-weight:800;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
.rail-nav{display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto}
.rail-group{display:flex;flex-direction:column;gap:2px}
.rail-btn{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:10px;border:none;background:transparent;color:#5a6b8c;font-size:13px;font-weight:700;cursor:pointer;text-align:left;transition:.15s}
.rail-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail-chevron{opacity:.6;flex-shrink:0;transition:.15s}.rail-chevron.open{transform:rotate(90deg)}
.rail-btn:hover{background:var(--blue-soft);color:var(--blue)}
.rail-btn.active{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;box-shadow:0 6px 16px rgba(67,24,255,.28)}
.rail-btn.active .rail-chevron{color:#fff}
.rail-drop{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.4,0,.2,1)}
.rail-drop.open{grid-template-rows:1fr}
.rail-drop-inner{overflow:hidden;min-height:0}
.rail-children{margin:1px 0 4px 16px;border-left:2px solid #e6e8f5;padding-left:8px;display:flex;flex-direction:column;gap:1px}
.rail-child{border:none;background:transparent;text-align:left;font-size:12px;font-weight:600;color:#7b8ba3;padding:7px 10px;border-radius:8px;cursor:pointer;transition:.12s}
.rail-child:hover{color:var(--blue);background:var(--blue-soft)}
.rail-child.active{color:var(--blue);background:var(--blue-soft);font-weight:800;box-shadow:inset 0 0 0 1px rgba(67,24,255,.25)}
.rail-foot{margin-top:auto;padding-top:8px;border-top:1px solid #eceef8}
.rail-signout:hover{background:#fdeaea;color:var(--red)}
.page-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:#fff;border-radius:var(--radius);padding:10px 16px;box-shadow:var(--shadow);margin-bottom:12px}
.page-head h1{font-size:19px;font-weight:800;margin:0;color:var(--navy)}
.page-sub{color:var(--muted);font-size:11.5px;margin-top:2px;font-weight:600}
.user-chip{display:flex;align-items:center;gap:10px;background:var(--bg);border-radius:12px;padding:6px 12px 6px 6px}
.user-avatar{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.user-mail{font-size:12px;font-weight:700}
.user-role{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-weight:800}
.section-head{margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.section-head h2{font-weight:800;font-size:15px;margin:0;color:var(--navy)}
.sub-heading{font-weight:800;font-size:11px;text-transform:uppercase;color:var(--muted);margin:16px 0 8px;letter-spacing:.07em}
.btn{font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:#fff;color:var(--navy);cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:var(--shadow)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.primary{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-color:transparent}
.icon-btn{border:none;background:transparent;color:var(--muted);cursor:pointer;padding:6px;border-radius:8px;display:inline-flex}
.icon-btn:hover:not(:disabled){background:var(--blue-soft);color:var(--blue)}
.icon-btn:disabled{opacity:.3;cursor:not-allowed}
.field{display:flex;flex-direction:column;gap:5px;font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.07em}
.field input,.field select{font-family:'JetBrains Mono',monospace;font-size:12.5px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;width:100%}
.search-input{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:0 10px;min-width:180px}
.search-input input{border:none;padding:8px 0;background:transparent;width:100%;font-family:'JetBrains Mono',monospace;font-size:12.5px}
.search-input input:focus{outline:none}
.sort-control{display:flex;gap:6px}
.sort-control select{font-family:'JetBrains Mono',monospace;font-size:12px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:#fff}
.sort-dir-btn{white-space:nowrap}
.stamp{font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;padding:3px 9px;border-radius:999px;white-space:nowrap;display:inline-block;font-weight:700}
.stamp-green{color:#157347;background:#e3f6ec}.stamp-rust{color:var(--red);background:#fdeaea}.stamp-gray{color:var(--muted);background:#eef1f5}.stamp-amber{color:#8a5b00;background:#fdf1d7}
.entry-tag{background:var(--blue-soft);color:var(--blue);padding:3px 8px;border-radius:7px;font-size:10px;font-weight:800}
.info-banner{background:var(--blue-soft);border:1px solid rgba(67,24,255,.3);color:var(--blue);border-radius:10px;padding:9px 13px;font-size:12px;font-weight:600;margin-bottom:10px}
.notice-warn{background:#fdf1d7;border:1px solid var(--amber);color:#8a5b00;border-radius:10px;padding:9px 13px;font-size:12px;font-weight:600;margin:8px 0}
.ticket-form{background:#fff;border-radius:var(--radius);padding:16px;margin-bottom:10px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.computed{font-size:12.5px;color:var(--muted);font-weight:600}.computed b{color:var(--navy);font-family:'JetBrains Mono',monospace}
.form-actions{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.checkbox-field{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.checkbox-field input{accent-color:var(--blue)}
.entry2{background:#fff;border-radius:16px;box-shadow:var(--shadow);padding:18px;margin-bottom:12px;display:flex;flex-direction:column;gap:14px}
.entry2-head{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.entry2-head .field{flex:1;min-width:180px}
.builder{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
.builder-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.builder-desc{flex:2;min-width:220px}
.builder-row .field{flex:0 0 110px}
.builder-add{flex:0 0 auto;margin-left:auto}
.builder-chips{display:flex;gap:8px;flex-wrap:wrap}
.b-chip{font-size:11px;font-weight:700;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:999px;padding:5px 12px}
.b-chip b{color:var(--blue);font-family:'JetBrains Mono',monospace;margin-left:5px}
.lines-box{display:flex;flex-direction:column;gap:8px}
.lines-head{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}
.lines-total{display:flex;gap:18px;justify-content:flex-end;flex-wrap:wrap;background:var(--blue-soft);border:1px solid rgba(67,24,255,.25);color:var(--blue);border-radius:10px;padding:9px 14px;font-size:12px;font-weight:800}
.lines-total .mono{font-family:'JetBrains Mono',monospace}
.list{display:flex;flex-direction:column}
.panel-list{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);padding:4px 14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:8px 4px;gap:12px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row-title{font-weight:700;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--navy)}
.row-sub{font-size:11px;color:var(--muted);margin-top:2px;font-weight:600}
.row-actions{display:flex;align-items:center;gap:5px;flex-shrink:0}
.edit-row{display:flex;gap:6px;flex:1;align-items:center;flex-wrap:wrap}
.edit-row input,.edit-row select{font-family:'JetBrains Mono',monospace;font-size:12px;padding:7px;border:1.5px solid var(--blue);border-radius:8px;width:auto;min-width:88px;background:#fff}
.entry-card{border-radius:12px;margin-bottom:8px;overflow:hidden;background:#fff;box-shadow:var(--shadow)}
.entry-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;cursor:pointer}
.entry-card-head:hover{background:var(--bg)}
.entry-card-title{display:flex;align-items:center;gap:8px;font-size:12.5px;flex-wrap:wrap;font-weight:600}
.entry-card-body{padding:8px 14px 10px;border-top:1px solid var(--line)}
.entry-date-edit{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.entry-date-edit input,.entry-date-edit select{font-family:'JetBrains Mono',monospace;font-size:12px;padding:5px 7px;border:1px solid var(--line);border-radius:7px}
.modal-overlay{position:fixed;inset:0;background:rgba(27,37,89,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px}
.modal-panel{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(27,37,89,.35);width:100%;max-width:860px;max-height:88vh;display:flex;flex-direction:column}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
.modal-head h3{margin:0;font-size:14px;font-weight:800;color:var(--navy)}
.modal-body{padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.modal-sub{margin:0 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800}
.tbl-wrap{overflow-x:auto;border-radius:10px}
.date-block{margin-bottom:12px}
.date-block-head{font-family:'JetBrains Mono',monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;background:var(--navy);color:#fff;padding:7px 14px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.date-block-head span{color:rgba(255,255,255,.65);text-transform:none;letter-spacing:0;font-weight:500}
.ledger-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:var(--shadow)}
.ledger-table th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:800;padding:7px 10px;border-bottom:1px solid var(--line);background:#f8fafc}
.ledger-table td{padding:7px 10px;border-bottom:1px solid var(--line)}
.ledger-table tr:last-child td{border-bottom:none}
.ledger-table td.mono{font-family:'JetBrains Mono',monospace}
.ledger-table tfoot td{font-weight:800;border-top:2px solid var(--navy);border-bottom:none;font-family:'JetBrains Mono',monospace;background:#f8fafc}
tr.row-hot td{background:#fdf1d7}tr.row-over td{background:#fdeaea}
.tbl-input{width:100px;font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
.filter-bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;background:#fff;border-radius:var(--radius);padding:10px 12px;box-shadow:var(--shadow)}
.report-grand-total{display:flex;gap:20px;align-items:center;justify-content:flex-end;flex-wrap:wrap;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:12px;padding:11px 18px;margin-top:8px;font-size:12.5px;font-weight:700}
.report-grand-total .mono{font-family:'JetBrains Mono',monospace;font-size:13px}
.empty-row{padding:18px 4px;color:var(--muted);font-size:12.5px;border:1.5px dashed var(--line);border-radius:12px;text-align:center;font-weight:600;background:#fff}
.locked-panel{display:flex;align-items:flex-start;gap:10px;padding:14px;border:1px solid var(--red);background:#fdeaea;border-radius:12px;color:var(--red);font-size:12.5px;line-height:1.5;font-weight:600}
.dash-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.stat-card{border-radius:12px;padding:12px;color:#fff;display:flex;gap:10px;align-items:center;box-shadow:var(--shadow)}
.stat-card .ic{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.stat-card .l{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.92}
.stat-card .v{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700;margin-top:1px}
.stat-card .s{font-size:10px;font-weight:600;opacity:.85;margin-top:1px}
.stat-card.blue{background:linear-gradient(135deg,#4318FF,#1e63c4)}
.stat-card.red{background:linear-gradient(135deg,#f0646a,#e5484d)}
.stat-card.green{background:linear-gradient(135deg,#3cc98a,#1f9d5d)}
.stat-card.purple{background:linear-gradient(135deg,#8b6cff,#5f3de0)}
.dash-row{display:grid;grid-template-columns:1.4fr 1fr;gap:10px;margin-bottom:12px}
.chart-card{background:#fff;border-radius:12px;box-shadow:var(--shadow);padding:12px}
.chart-title{font-size:12.5px;font-weight:800;color:var(--navy);margin:0 0 10px}
.bars{display:flex;align-items:flex-end;gap:16px;height:150px;padding:0 6px}
.bar-group{flex:1;display:flex;align-items:flex-end;gap:4px;height:100%}
.bar{flex:1;border-radius:4px 4px 0 0;min-height:2px}
.bar.b-in{background:#4318FF}.bar.b-pu{background:#2eb872}.bar.b-ud{background:#e5484d}
.bar-x{display:flex;gap:16px;padding:5px 6px 0}
.bar-x span{flex:1;text-align:center;font-size:9px;color:var(--muted);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.legend{display:flex;gap:12px;font-size:10px;color:var(--muted);font-weight:700;margin-top:10px;flex-wrap:wrap}
.legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px}
.donut-wrap{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.donut-legend{flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px;font-size:10.5px;font-weight:600;color:var(--muted)}
.donut-legend b{color:var(--navy)}
.recent-row{display:flex;justify-content:space-between;gap:10px;padding:6px 2px;border-bottom:1px solid var(--line);font-size:11.5px;font-weight:600;flex-wrap:wrap}
.recent-row:last-child{border-bottom:none}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.dot.blue{background:#4318FF}.dot.green{background:#2eb872}.dot.red{background:#e5484d}
.summary-row{margin-bottom:9px}
.summary-head{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px}
.summary-track{height:7px;border-radius:99px;background:var(--bg);overflow:hidden}
.summary-fill{height:100%;border-radius:99px}
.ql-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ql-btn{border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:10px;font-size:11.5px;font-weight:700;color:var(--navy);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px}
.ql-btn:hover{border-color:var(--blue);color:var(--blue)}
.login-page{display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;padding:24px;background:var(--bg)}
.boot-loader{display:flex;align-items:center;gap:10px;color:var(--muted);font-weight:600}
.login-card{max-width:410px;width:100%;display:flex;flex-direction:column;gap:13px;background:#fff;border-radius:18px;padding:32px 28px;box-shadow:var(--shadow)}
.login-logo{width:50px;height:50px;border-radius:14px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;display:flex;align-items:center;justify-content:center}
.login-title{font-weight:800;font-size:21px;margin:0;color:var(--navy)}
.login-sub{font-size:12.5px;color:var(--muted);font-weight:600}
.login-error{font-size:12px;color:var(--red);background:#fdeaea;border:1px solid var(--red);border-radius:9px;padding:9px 12px;font-weight:600}
.login-notice{font-size:12px;color:#157347;background:#e3f6ec;border:1px solid #157347;border-radius:9px;padding:9px 12px;font-weight:600}
.login-submit{justify-content:center}
.login-switch{background:none;border:none;color:var(--blue);font-size:12px;font-weight:700;cursor:pointer;padding:0;text-align:left}
@media print{.no-print{display:none !important}.rail{display:none !important}.main-area{padding:0}.page-head{box-shadow:none}}
@media (max-width:980px){.dash-cards{grid-template-columns:1fr 1fr}.dash-row{grid-template-columns:1fr}}
@media (max-width:900px){
.app-layout{flex-direction:column}
.rail{position:static;height:auto;width:100%;flex-direction:row;align-items:center;padding:8px 10px;gap:6px;overflow-x:auto;box-shadow:none;border-right:none;border-bottom:1px solid #e6e8f5}
.rail-top{display:none}
.rail-nav{flex-direction:row;gap:4px;overflow:visible}
.rail-btn{width:auto;padding:8px 10px;white-space:nowrap}
.rail-chevron{display:none}
.rail-group{position:relative}
.rail-drop{display:block}
.rail-drop-inner{overflow:visible}
.rail-children{position:absolute;top:100%;left:0;margin:0;border-left:none;background:#fff;border:1px solid #e6e8f5;border-radius:10px;box-shadow:0 12px 30px rgba(23,50,77,.18);padding:6px;min-width:170px;z-index:60;display:none}
.rail-drop.open .rail-children{display:flex}
.rail-foot{margin:0;padding:0;border:none}
}
@media (max-width:640px){
.main-area{padding:12px 10px 26px}
.grid-2{grid-template-columns:1fr}
.filter-bar{flex-direction:column}
.dash-cards{grid-template-columns:1fr}
.edit-row input,.edit-row select{width:100%}
.builder-row .field{flex:1 1 40%}
.builder-add{margin-left:0;width:100%;justify-content:center}
.tbl-wrap .ledger-table{min-width:680px}
.entry2{padding:14px}
.modal-panel{max-width:100%}
.team-card-top{padding:14px}
.perm-presets{padding:10px 14px}
.perm-row{padding:12px 14px}
.perm-mod{min-width:100%}
.team-admin-note{margin:12px 14px 14px}
}
`}</style>);
}
