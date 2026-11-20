/**
 * HTTP-style handler /api/pembayaran/* — dipanggil dari dispatch client-api.
 * Data santri disuplai via callback agar modul ini tidak menyentuh db internal.
 */
import {
  addTransaksi,
  deleteTagihan,
  deleteTagihanJenis,
  deleteTransaksi,
  generateTagihan,
  listTagihan,
  listTagihanJenis,
  listTransaksi,
  listTunggakan,
  pullPembayaranFromTurso,
  sisaTagihan,
  updateTagihan,
  upsertTagihanJenis,
  type TagihanFilter,
  type TagihanRow,
  type TagihanStatus,
} from './pembayaran-store';

export type PembayaranApiResult = { status: number; body: unknown };

type SantriLite = {
  id: string;
  nama?: string;
  kamar?: string;
  kelas?: string;
  kelas_id?: string;
  nomor_wali?: string;
};

export type PembayaranApiCtx = {
  listSantri: () => Record<string, unknown>[];
};

const TAGIHAN_STATUS: TagihanStatus[] = ['belum', 'sebagian', 'lunas'];

function err(status: number, message: string): PembayaranApiResult {
  return { status, body: { error: message } };
}

function santriMapOf(list: Record<string, unknown>[]): Map<string, SantriLite> {
  const map = new Map<string, SantriLite>();
  for (const s of list) {
    map.set(String(s.id), {
      id: String(s.id),
      nama: s.nama ? String(s.nama) : undefined,
      kamar: s.kamar ? String(s.kamar) : undefined,
      kelas: s.kelas ? String(s.kelas) : undefined,
      kelas_id: s.kelas_id ? String(s.kelas_id) : undefined,
      nomor_wali: s.nomor_wali ? String(s.nomor_wali) : undefined,
    });
  }
  return map;
}

function enrichTagihan(t: TagihanRow, map: Map<string, SantriLite>) {
  const s = map.get(t.santri_id);
  return {
    ...t,
    sisa: sisaTagihan(t),
    santri_nama: s?.nama ?? '',
    santri_kamar: s?.kamar ?? '',
    santri_kelas: s?.kelas ?? '',
    santri_wali: s?.nomor_wali ?? '',
  };
}

export async function handlePembayaranApi(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown> | null,
  ctx: PembayaranApiCtx
): Promise<PembayaranApiResult | null> {
  if (!pathname.startsWith('/api/pembayaran')) return null;
  const m = method.toUpperCase();
  const santriMap = () => santriMapOf(ctx.listSantri());

  try {
    // ——— Jenis pembayaran ———
    if (pathname === '/api/pembayaran/jenis' && m === 'GET') {
      return { status: 200, body: await listTagihanJenis() };
    }
    if (pathname === '/api/pembayaran/jenis' && m === 'POST' && body) {
      const nama = String(body.nama ?? '').trim();
      if (!nama) return err(400, 'Nama jenis pembayaran wajib diisi.');
      const row = await upsertTagihanJenis({
        nama,
        nominal_default: Number(body.nominal_default) || 0,
        periode_jenis: (body.periode_jenis as 'bulanan' | 'sekali' | 'bebas') || 'bulanan',
        aktif: body.aktif !== false,
      });
      return { status: 200, body: row };
    }

    const jenisIdMatch = pathname.match(/^\/api\/pembayaran\/jenis\/([^/]+)$/);
    if (jenisIdMatch) {
      const id = jenisIdMatch[1];
      if (m === 'PUT' && body) {
        const nama = String(body.nama ?? '').trim();
        if (!nama) return err(400, 'Nama jenis pembayaran wajib diisi.');
        const row = await upsertTagihanJenis({
          id,
          nama,
          nominal_default: Number(body.nominal_default) || 0,
          periode_jenis: (body.periode_jenis as 'bulanan' | 'sekali' | 'bebas') || 'bulanan',
          aktif: body.aktif !== false,
        });
        return { status: 200, body: row };
      }
      if (m === 'DELETE') {
        await deleteTagihanJenis(id);
        return { status: 200, body: { success: true } };
      }
    }

    // ——— Generate tagihan massal ———
    if (pathname === '/api/pembayaran/tagihan/generate' && m === 'POST' && body) {
      const jenisId = String(body.jenis_id ?? '');
      const jenisList = await listTagihanJenis();
      const jenis = jenisList.find((j) => j.id === jenisId);
      if (!jenis) return err(400, 'Jenis pembayaran tidak ditemukan.');

      const periode = String(body.periode ?? '').trim();
      if (jenis.periode_jenis === 'bulanan' && !/^\d{4}-\d{2}$/.test(periode)) {
        return err(400, 'Periode bulanan wajib format YYYY-MM (mis. 2026-11).');
      }

      const santri = ctx.listSantri();
      const target = String(body.target ?? 'semua');
      let santriIds: string[] = [];
      if (target === 'kelas') {
        const kelasIds = new Set(
          (Array.isArray(body.kelas_ids) ? body.kelas_ids : []).map(String)
        );
        if (!kelasIds.size) return err(400, 'Pilih minimal satu kelas.');
        santriIds = santri
          .filter((s) => kelasIds.has(String(s.kelas_id ?? '')))
          .map((s) => String(s.id));
      } else if (target === 'santri') {
        santriIds = (Array.isArray(body.santri_ids) ? body.santri_ids : []).map(String);
        if (!santriIds.length) return err(400, 'Pilih minimal satu santri.');
      } else {
        santriIds = santri.map((s) => String(s.id));
      }
      if (!santriIds.length) return err(400, 'Tidak ada santri yang cocok dengan target.');

      const nominalOverride =
        body.nominal !== undefined && body.nominal !== null && String(body.nominal) !== ''
          ? Number(body.nominal)
          : undefined;
      const nominalPerSantri =
        body.nominal_per_santri && typeof body.nominal_per_santri === 'object'
          ? (body.nominal_per_santri as Record<string, number>)
          : undefined;

      const result = await generateTagihan({
        jenis,
        periode,
        santriIds,
        jatuhTempo: body.jatuh_tempo ? String(body.jatuh_tempo) : undefined,
        nominalOverride,
        nominalPerSantri,
      });
      return { status: 200, body: result };
    }

    // ——— Daftar tagihan ———
    if (pathname === '/api/pembayaran/tagihan' && m === 'GET') {
      const filter: TagihanFilter = {};
      const periode = searchParams.get('periode');
      const jenisId = searchParams.get('jenis_id');
      const santriId = searchParams.get('santri_id');
      const status = searchParams.get('status');
      if (periode) filter.periode = periode;
      if (jenisId) filter.jenis_id = jenisId;
      if (santriId) filter.santri_id = santriId;
      if (status && TAGIHAN_STATUS.includes(status as TagihanStatus)) {
        filter.status = status as TagihanStatus;
      }
      const rows = await listTagihan(filter);
      const map = santriMap();
      return { status: 200, body: rows.map((t) => enrichTagihan(t, map)) };
    }

    const transaksiMatch = pathname.match(/^\/api\/pembayaran\/tagihan\/([^/]+)\/transaksi$/);
    if (transaksiMatch && m === 'GET') {
      return { status: 200, body: await listTransaksi(transaksiMatch[1]) };
    }

    const bayarMatch = pathname.match(/^\/api\/pembayaran\/tagihan\/([^/]+)\/bayar$/);
    if (bayarMatch && m === 'POST' && body) {
      const jumlah = Number(body.jumlah);
      if (!Number.isFinite(jumlah) || jumlah <= 0) {
        return err(400, 'Jumlah pembayaran harus lebih dari 0.');
      }
      const row = await addTransaksi(bayarMatch[1], {
        jumlah,
        tanggal: body.tanggal ? String(body.tanggal) : undefined,
        catatan: body.catatan ? String(body.catatan) : undefined,
      });
      if (!row) return err(404, 'Tagihan tidak ditemukan.');
      const tagihan = (await listTagihan()).find((t) => t.id === bayarMatch[1]);
      const map = santriMap();
      return {
        status: 200,
        body: { transaksi: row, tagihan: tagihan ? enrichTagihan(tagihan, map) : null },
      };
    }

    const transaksiIdMatch = pathname.match(/^\/api\/pembayaran\/transaksi\/([^/]+)$/);
    if (transaksiIdMatch && m === 'DELETE') {
      await deleteTransaksi(transaksiIdMatch[1]);
      return { status: 200, body: { success: true } };
    }

    // ——— Rekap tunggakan ———
    if (pathname === '/api/pembayaran/tunggakan' && m === 'GET') {
      const periode = searchParams.get('periode') || undefined;
      const rows = await listTunggakan(periode);
      const map = santriMap();
      return {
        status: 200,
        body: rows.map((r) => {
          const s = map.get(r.santri_id);
          return {
            santri_id: r.santri_id,
            santri_nama: s?.nama ?? '',
            santri_kamar: s?.kamar ?? '',
            santri_kelas: s?.kelas ?? '',
            santri_wali: s?.nomor_wali ?? '',
            total_sisa: r.total_sisa,
            jumlah_tagihan: r.jumlah_tagihan,
            tagihan: r.rows.map((t) => enrichTagihan(t, map)),
          };
        }),
      };
    }

    // ——— Sinkron manual dari cloud ———
    if (pathname === '/api/pembayaran/sync' && m === 'POST') {
      const ok = await pullPembayaranFromTurso();
      return { status: 200, body: { synced: ok } };
    }

    const tagihanIdMatch = pathname.match(/^\/api\/pembayaran\/tagihan\/([^/]+)$/);
    if (tagihanIdMatch) {
      const id = tagihanIdMatch[1];
      if (m === 'PUT' && body) {
        const patch: { nominal?: number; jatuh_tempo?: string | null; catatan?: string | null } = {};
        if (body.nominal !== undefined) patch.nominal = Number(body.nominal) || 0;
        if (body.jatuh_tempo !== undefined) {
          patch.jatuh_tempo = body.jatuh_tempo ? String(body.jatuh_tempo) : null;
        }
        if (body.catatan !== undefined) {
          patch.catatan = body.catatan ? String(body.catatan) : null;
        }
        const row = await updateTagihan(id, patch);
        if (!row) return err(404, 'Tagihan tidak ditemukan.');
        return { status: 200, body: enrichTagihan(row, santriMap()) };
      }
      if (m === 'DELETE') {
        await deleteTagihan(id);
        return { status: 200, body: { success: true } };
      }
    }

    return { status: 404, body: { error: 'Endpoint pembayaran tidak ditemukan' } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal memproses data pembayaran';
    return { status: 500, body: { error: message } };
  }
}
