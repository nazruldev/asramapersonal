import type { PembinaanRow } from '@/lib/pembinaan-group';

export function formatWhatsAppPhone(nomorWali: string): string | null {
  const clean = nomorWali.replace(/[^0-9]/g, '');
  if (!clean) return null;
  return clean.startsWith('0') ? `62${clean.slice(1)}` : clean;
}

function formatTanggalId(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function buildPelanggaranWaliWhatsAppMessage(input: {
  namaAsrama: string;
  santriNama: string;
  kelas: string;
  kamar: string;
  ketuaKamar: string;
  akumulasiHitungan: number;
  tierLabel?: string | null;
  totalPelanggaran: number;
  pelanggaranRecords: PembinaanRow[];
}): string {
  const {
    namaAsrama,
    santriNama,
    kelas,
    kamar,
    ketuaKamar,
    akumulasiHitungan,
    tierLabel,
    totalPelanggaran,
    pelanggaranRecords,
  } = input;

  const lines: string[] = [
    `Assalamu'alaikum Warahmatullahi Wabarakatuh`,
    ``,
    `Yth. Bapak/Ibu wali santri *${namaAsrama}*`,
    ``,
    `Kami informasikan perkembangan kedisiplinan putra/putri Bapak/Ibu:`,
    ``,
    `*Identitas Santri*`,
    `• Nama: *${santriNama}*`,
    `• Kelas: ${kelas || '-'}`,
    `• Kamar: ${kamar || '-'}`,
    `• Ketua kamar: ${ketuaKamar || '-'}`,
    ``,
    `*Ringkasan catatan pelanggaran*`,
    `• Total: *${totalPelanggaran}* catatan`,
    `• Akumulasi hitungan aktif: *${akumulasiHitungan}x*${tierLabel ? ` (${tierLabel})` : ''}`,
    ``,
  ].filter(Boolean);

  if (pelanggaranRecords.length > 0) {
    lines.push(`*Rincian pelanggaran terbaru:*`);
    const recent = pelanggaranRecords.slice(0, 8);
    recent.forEach((row, idx) => {
      lines.push(`${idx + 1}. ${formatTanggalId(row.tanggal)}`);
      lines.push(`   ${row.keterangan}`);
      if (row.tindak_lanjut?.trim()) {
        lines.push(`   Tindak lanjut: ${row.tindak_lanjut.trim()}`);
      }
    });
    if (pelanggaranRecords.length > recent.length) {
      lines.push(`   _(dan ${pelanggaranRecords.length - recent.length} catatan lainnya)_`);
    }
    lines.push('');
  }

  lines.push(
    `Mohon bimbingan dan perhatian Bapak/Ibu di rumah agar pembinaan di asrama lebih optimal.`,
    ``,
    `Terima kasih atas kerja samanya.`,
    ``,
    `_Pesan ini dikirim dari aplikasi Pengelola Asrama._`
  );

  return lines.join('\n');
}

export function openWhatsAppWithText(phone: string, text: string): boolean {
  const waNumber = formatWhatsAppPhone(phone);
  if (!waNumber) return false;
  const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
