import { jenisLabel, parsePenjadwalanJenisFromPath } from '@/lib/penjadwalan';
import { parsePembinaanSantriIdFromPath } from '@/lib/pembinaan-group';
import { parseIzinSantriIdFromPath } from '@/lib/izin-group';
import { isAppHubScreen, normalizeAppPathname } from '@/lib/app-navigation';
import { parseKamarIdFromPath } from '@/lib/kamar-path';
import { parseSantriIdFromDetailPath } from '@/lib/santri-detail';
import { parseSantriIdFromKamarRiwayatPath } from '@/lib/santri-kamar-riwayat';
import { parseSantriIdFromTunggakanPath } from '@/lib/santri-tunggakan';

export type ScreenHeaderMeta = {
  title: string;
  /** Navigasi tombol kembali; default ke beranda jika tidak diisi */
  backTo: string;
  /** Halaman hub (Master, Laporan, dll.) — tanpa tombol kembali */
  showBack?: boolean;
};

function withHubBackRule(path: string, meta: ScreenHeaderMeta): ScreenHeaderMeta {
  if (isAppHubScreen(path)) {
    return { ...meta, showBack: false };
  }
  return meta;
}

export function getScreenHeader(pathname: string): ScreenHeaderMeta | null {
  const path = normalizeAppPathname(pathname);
  if (path === '/') return null;

  const pembinaanSantriId = parsePembinaanSantriIdFromPath(path);
  if (pembinaanSantriId) {
    return {
      title: 'Detail Pelanggaran',
      backTo: '/laporan/pembinaan',
    };
  }

  const izinSantriId = parseIzinSantriIdFromPath(path);
  if (izinSantriId) {
    return {
      title: 'Riwayat Izin Santri',
      backTo: '/laporan/izin',
    };
  }

  const santriKamarRiwayatId = parseSantriIdFromKamarRiwayatPath(path);
  if (santriKamarRiwayatId) {
    return {
      title: 'Riwayat Kamar',
      backTo: '/master/santri',
    };
  }

  const santriTagihanId = parseSantriIdFromTunggakanPath(path);
  if (santriTagihanId) {
    return {
      title: 'Tagihan Santri',
      backTo: '/master/santri',
    };
  }

  const santriDetailId = parseSantriIdFromDetailPath(path);
  if (santriDetailId) {
    return {
      title: 'Profil Santri',
      backTo: '/master/santri',
    };
  }

  const kamarId = parseKamarIdFromPath(path);
  if (kamarId) {
    return {
      title: 'Kelola Kamar',
      backTo: '/master/kamar',
    };
  }

  const jenisFromPath = parsePenjadwalanJenisFromPath(path);
  if (jenisFromPath) {
    return {
      title: jenisLabel(jenisFromPath),
      backTo: '/penjadwalan',
    };
  }
  if (path === '/penjadwalan/generate') {
    return {
      title: 'Buat Jadwal',
      backTo: '/penjadwalan',
    };
  }

  const map: Record<string, ScreenHeaderMeta> = {
    '/master': {
      title: 'Kelola Data',
      backTo: '/',
    },
    '/master/santri': {
      title: 'Data Santri',
      backTo: '/master',
    },
    '/master/kamar': {
      title: 'Data Kamar',
      backTo: '/master',
    },
    '/master/kelas': {
      title: 'Data Kelas',
      backTo: '/master',
    },
    '/master/kenaikan-kelas': {
      title: 'Kenaikan Kelas',
      backTo: '/master',
    },
    '/master/kegiatan': {
      title: 'Data Kegiatan',
      backTo: '/master',
    },
    '/master/pembayaran': {
      title: 'Pembayaran Santri',
      backTo: '/master',
    },
    '/master/asrama': {
      title: 'Data Asrama',
      backTo: '/master',
    },
    '/master/pengguna': {
      title: 'Akun & Pengawas',
      backTo: '/master',
    },
    '/laporan': {
      title: 'Laporan',
      backTo: '/',
    },
    '/laporan/absensi': {
      title: 'Absensi Santri',
      backTo: '/laporan',
    },
    '/laporan/izin': {
      title: 'Perizinan Santri',
      backTo: '/laporan',
    },
    '/laporan/pembinaan': {
      title: 'Pelanggaran',
      backTo: '/laporan',
    },
    '/laporan/peringkat': {
      title: 'Peringkat Santri',
      backTo: '/',
    },
    '/laporan/wilayah': {
      title: 'Sebaran Wilayah',
      backTo: '/laporan',
    },
    '/pengaturan': {
      title: 'Pengaturan',
      backTo: '/',
    },
    '/penjadwalan': {
      title: 'Penjadwalan',
      backTo: '/',
    },
    '/database': {
      title: 'Cadangan Data',
      backTo: '/',
    },
    '/profil': {
      title: 'Profil',
      backTo: '/',
    },
    '/notifikasi': {
      title: 'Notifikasi',
      backTo: '/',
    },
    '/ganti-akun': {
      title: 'Ganti Akun',
      backTo: '/profil',
    },
  };

  const meta = map[path] ?? {
    title: 'Pengelola Asrama',
    backTo: '/',
  };
  return withHubBackRule(path, meta);
}
