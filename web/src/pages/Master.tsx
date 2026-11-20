import { useNavigate } from 'react-router';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Users, BedDouble, GraduationCap, CalendarDays, Wallet, Building2, UserCog } from 'lucide-react';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { getSessionUser, hasModuleAccess } from '@/lib/app-auth';
import type { ModulAkses } from '@/lib/app-settings';

export default function Master() {
  const navigate = useNavigate();
  const sessionUser = getSessionUser();
  const isAdmin = !sessionUser || sessionUser.role === 'super_admin';

  const masterItems = [
    {
      title: 'Data Santri',
      description: 'Kelola data santri, kelas, dan kamar',
      icon: Users,
      path: '/master/santri',
      color: 'text-blue-500',
      modul: 'santri' as ModulAkses,
    },
    {
      title: 'Data Kamar',
      description: 'Kelola kamar, kapasitas, dan ketua kamar',
      icon: BedDouble,
      path: '/master/kamar',
      color: 'text-emerald-500',
      modul: 'kamar' as ModulAkses,
    },
    {
      title: 'Data Kelas',
      description: 'Kelola kelas dan tingkat',
      icon: GraduationCap,
      path: '/master/kelas',
      color: 'text-purple-500',
      modul: 'kelas' as ModulAkses,
    },
    {
      title: 'Data Kegiatan',
      description: 'Kelola kegiatan dan jadwal',
      icon: CalendarDays,
      path: '/master/kegiatan',
      color: 'text-orange-500',
      modul: 'kegiatan' as ModulAkses,
    },
    {
      title: 'Pembayaran',
      description: 'Tagihan, cicilan, dan tunggakan santri',
      icon: Wallet,
      path: '/master/pembayaran',
      color: 'text-rose-500',
      modul: 'pembayaran' as ModulAkses,
    },
    {
      title: 'Data Asrama',
      description: 'Kelola daftar asrama (multi-asrama)',
      icon: Building2,
      path: '/master/asrama',
      color: 'text-cyan-500',
      modul: null,
      adminOnly: true,
    },
    {
      title: 'Akun & Pengawas',
      description: 'Akun pengawas, PIN, asrama & hak akses',
      icon: UserCog,
      path: '/master/pengguna',
      color: 'text-amber-500',
      modul: null,
      adminOnly: true,
    },
  ];

  const visibleItems = masterItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (!item.modul) return true;
    return hasModuleAccess(sessionUser, item.modul);
  });

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kelas', 'kegiatan']}
      className="space-y-4"
    >
      {/* Master Menu Grid */}
      <div className="grid grid-cols-2 gap-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                appCardClass,
                'p-4 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md dark:hover:shadow-none transition-all text-left active:scale-[0.98]'
              )}
            >
              <Icon className={cn('w-6 h-6 mb-3', item.color)} />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-1">{item.title}</h3>
              <p className="text-[11px] text-slate-500 leading-snug">{item.description}</p>
            </button>
          );
        })}
      </div>
    </PageWithPullRefresh>
  );
}
