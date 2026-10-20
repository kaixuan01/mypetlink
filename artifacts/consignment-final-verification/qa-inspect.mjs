// Synthetic Physical QA inspection of one returned unit via the real HTTP endpoints (disposable DB only).
import fs from 'node:fs';
const [,, tokenFile, dispatchId, unitId, decision] = process.argv;
const T = fs.readFileSync(tokenFile, 'utf8').trim();
const base = 'http://localhost:5281/api/v1/admin';
const h = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const j = async (r) => { const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const m = await j(await fetch(`${base}/merchant-sales/consignment/dispatches/${dispatchId}/manifest`, { headers: h }));
const code = m.b.data.units.find(u => u.id === unitId).tagCode;
const look = await j(await fetch(`${base}/tag-inventory/qa/lookup?code=${encodeURIComponent(code)}`, { headers: h }));
const item = look.b.data;
const keys = Object.keys(item).filter(k => /url|version|id$/i.test(k));
const qrUrl = item.expectedQrUrl, nfcUrl = item.expectedNfcUrl, version = item.qaVersion ?? item.version;
const cap = async (Source, Url, SerialNumber) => j(await fetch(`${base}/tag-inventory/qa/capture`, { method: 'POST', headers: h, body: JSON.stringify({ TagCode: code, ExpectedVersion: version, Source, Url, SerialNumber }) }));
const qr = await cap('Camera', qrUrl, null);
const nfc = await cap('WebNfc', nfcUrl, item.nfcSerialNumber ?? '04A1B2C3D4E5F6');
const save = await j(await fetch(`${base}/tag-inventory/qa/${item.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ InspectionId: crypto.randomUUID(), ExpectedVersion: version, Decision: decision, PhysicalCondition: decision === 'Passed' ? 'Good' : 'Damaged', QrEvidence: qr.b.data?.evidence, NfcEvidence: nfc.b.data?.evidence, Remarks: 'SYNTHETIC return re-inspection (simulated reader input)' }) }));
console.log(JSON.stringify({ lookup: look.s, keys, qr: [qr.s, qr.b.data?.matches, qr.b.data?.problem, qrUrl?.replace(code,'<code>')], nfc: [nfc.s, nfc.b.data?.matches, nfc.b.data?.problem], save: [save.s, save.b.data?.qaStatus ?? save.b.data?.status ?? save.b.error?.message] }));
