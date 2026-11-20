import { Capacitor } from '@capacitor/core';
import { notifyFileSaved } from '@/lib/file-download-hints';
import { saveHtmlAsPdf } from '@/lib/save-html-as-pdf';
import { jenisLabel, type PenjadwalanJenis } from './penjadwalan';
import { toast } from '@/lib/toast';

export type PenjadwalanPrintOrientation = 'portrait' | 'landscape';

export type PenjadwalanPrintRow = {
  tanggal: string;
  assignee_nama: string;
  assignee_detail?: string;
  mode?: string;
};

export type PenjadwalanPrintOptions = {
  namaAsrama: string;
  jenis: PenjadwalanJenis;
  bulan: string;
  orientation: PenjadwalanPrintOrientation;
  rows: PenjadwalanPrintRow[];
  /** Jika diisi, dipakai di header menggantikan judul satu bulan. */
  periodeTeks?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBulanJudul(bulan: string): string {
  const [y, m] = bulan.split('-').map(Number);
  if (!y || !m) return bulan;
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function formatTanggalBaris(iso: string): { hari: string; tanggal: string } {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return {
    hari: d.toLocaleDateString('id-ID', { weekday: 'long' }),
    tanggal: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** Kelompokkan per minggu (Sen–Min) agar bisa pakai break antar minggu jika perlu. */
function groupByIsoWeek(rows: PenjadwalanPrintRow[]): { weekKey: string; label: string; rows: PenjadwalanPrintRow[] }[] {
  const map = new Map<string, PenjadwalanPrintRow[]>();
  for (const row of rows) {
    const d = new Date(row.tanggal.slice(0, 10) + 'T12:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const key = monday.toISOString().slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, weekRows]) => {
      const start = new Date(weekKey + 'T12:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const label = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      return { weekKey, label, rows: weekRows.sort((a, b) => a.tanggal.localeCompare(b.tanggal)) };
    });
}

export function buildPenjadwalanPrintHtml(options: PenjadwalanPrintOptions): string {
  const { namaAsrama, jenis, bulan, orientation, rows, periodeTeks } = options;
  const judulJenis = jenisLabel(jenis);
  const judulBulan = periodeTeks?.trim() || formatBulanJudul(bulan);
  const pageSize = orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
  const generatedAt = new Date().toLocaleString('id-ID');
  const weeks = groupByIsoWeek(rows);

  const weekBlocks = weeks
    .map((week) => {
      const bodyRows = week.rows
        .map((row) => {
          const { hari, tanggal } = formatTanggalBaris(row.tanggal);
          const detail = row.assignee_detail ? `<div class="sub">${escapeHtml(row.assignee_detail)}</div>` : '';
          const mode = row.mode ? `<span class="mode">${escapeHtml(row.mode)}</span>` : '';
          return `
            <tr class="schedule-row">
              <td class="col-tanggal">${escapeHtml(tanggal)}</td>
              <td class="col-hari">${escapeHtml(hari)}</td>
              <td class="col-petugas">
                <strong>${escapeHtml(row.assignee_nama)}</strong>
                ${detail}
              </td>
              <td class="col-mode">${mode}</td>
            </tr>`;
        })
        .join('');

      return `
        <section class="week-block">
          <div class="week-label">Minggu: ${escapeHtml(week.label)}</div>
          <table class="schedule-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Hari</th>
                <th>Petugas</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
            </tbody>
          </table>
        </section>`;
    })
    .join('');

  const emptyBody =
    rows.length === 0
      ? `<p class="empty">Tidak ada jadwal untuk periode ini.</p>`
      : `<div class="weeks">${weekBlocks}</div>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(judulJenis)} — ${escapeHtml(judulBulan)}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 14mm 12mm 16mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 10pt;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc-header {
      border-bottom: 2px solid #047857;
      padding-bottom: 8px;
      margin-bottom: 14px;
      break-after: avoid;
      page-break-after: avoid;
    }
    .doc-header h1 {
      margin: 0 0 4px;
      font-size: 16pt;
      color: #047857;
    }
    .doc-header .meta {
      margin: 0;
      font-size: 9pt;
      color: #475569;
      line-height: 1.45;
    }
    .weeks { display: block; }
    .week-block {
      margin-bottom: 12px;
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .week-label {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      margin: 0 0 6px;
      break-after: avoid;
      page-break-after: avoid;
    }
    table.schedule-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .schedule-table thead {
      display: table-header-group;
    }
    .schedule-table th {
      background: #ecfdf5;
      color: #065f46;
      font-size: 8.5pt;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #a7f3d0;
    }
    .schedule-table td {
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      font-size: 9.5pt;
    }
    tr.schedule-row {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    tr.schedule-row td {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .col-tanggal { width: 22%; }
    .col-hari { width: 18%; }
    .col-petugas { width: 46%; }
    .col-mode { width: 14%; text-align: center; }
    .sub {
      font-size: 8pt;
      color: #64748b;
      margin-top: 2px;
      font-weight: normal;
    }
    .mode {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .doc-footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #94a3b8;
      break-inside: avoid;
    }
    .empty {
      text-align: center;
      color: #94a3b8;
      padding: 24px;
    }
    @media screen {
      body { padding: 16px; max-width: ${orientation === 'landscape' ? '297mm' : '210mm'}; margin: 0 auto; }
    }
  </style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(namaAsrama)}</h1>
    <p class="meta">
      <strong>Jadwal:</strong> ${escapeHtml(judulJenis)}<br />
      <strong>Periode:</strong> ${escapeHtml(judulBulan)} · ${rows.length} hari terjadwal<br />
      <strong>Dicetak:</strong> ${escapeHtml(generatedAt)}
    </p>
  </header>
  ${emptyBody}
  <footer class="doc-footer">
    Dokumen jadwal asrama — simpan sebagai PDF melalui dialog cetak (Destinasi: Simpan sebagai PDF).
  </footer>
</body>
</html>`;
}

function safeFilenamePart(text: string): string {
  return text.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'jadwal';
}

function penjadwalanBundleFilename(options: PenjadwalanPrintOptions): string {
  const judul = `${jenisLabel(options.jenis)} ${formatBulanJudul(options.bulan)}`;
  return `jadwal-${safeFilenamePart(judul)}-${options.bulan}.pdf`;
}

/** Unduh jadwal (PDF di Android; HTML + cetak di web/iOS). */
export async function downloadPenjadwalanPdf(options: PenjadwalanPrintOptions): Promise<boolean> {
  const html = buildPenjadwalanPrintHtml(options);
  const filename = penjadwalanBundleFilename(options);
  try {
    const { method, filename: savedName } = await saveHtmlAsPdf(html, filename, {
      landscape: options.orientation === 'landscape',
    });
    notifyFileSaved(method, savedName);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan PDF';
    toast.error(msg.length > 160 ? 'Gagal menyimpan PDF. Coba lagi.' : msg);
    return false;
  }
}

/** Dialog cetak browser — tidak dipakai di Android (hanya membingungkan). */
export function shouldOfferBrowserPrintFallback(): boolean {
  return Capacitor.getPlatform() !== 'android';
}

/** Buka pratinjau cetak; user pilih &quot;Simpan sebagai PDF&quot; di dialog browser. */
export function printPenjadwalanPdf(options: PenjadwalanPrintOptions): void {
  const html = buildPenjadwalanPrintHtml(options);
  const judul = `${jenisLabel(options.jenis)} ${formatBulanJudul(options.bulan)}`;
  const filename = `jadwal-${safeFilenamePart(judul)}-${options.bulan}.pdf`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Cetak jadwal');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    toast.error('Gagal membuka pratinjau cetak.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 500);
  };

  win.document.title = filename.replace(/\.pdf$/i, '');

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(doPrint, 150);
  } else {
    iframe.onload = () => setTimeout(doPrint, 150);
  }
}
