import { useNavigate } from 'react-router';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Users, BedDouble, GraduationCap, CalendarDays } from 'lucide-react';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

export default function Master() {
  const navigate = useNavigate();

  const masterItems = [
    {
      title: 'Data Santri',
      description: 'Kelola data santri, kelas, dan kamar',
      icon: Users,
      path: '/master/santri',
      color: 'bg-blue-500',
    },
    {
      title: 'Data Kamar',
      description: 'Kelola kamar, kapasitas, dan ketua kamar',
      icon: BedDouble,
      path: '/master/kamar',
      color: 'bg-emerald-500',
    },
    {
      title: 'Data Kelas',
      description: 'Kelola kelas dan tingkat',
      icon: GraduationCap,
      path: '/master/kelas',
      color: 'bg-purple-500',
    },
    {
      title: 'Data Kegiatan',
      description: 'Kelola kegiatan dan jadwal',
      icon: CalendarDays,
      path: '/master/kegiatan',
      color: 'bg-orange-500',
    },
  ];

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kelas', 'kegiatan']}
      className="space-y-4"
    >
      {/* Master Menu Grid */}
      <div className="grid grid-cols-2 gap-3">
        {masterItems.map((item) => {
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
              <div className={`w-10 h-10 rounded-sm ${item.color} text-white flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-1">{item.title}</h3>
              <p className="text-[11px] text-slate-500 leading-snug">{item.description}</p>
            </button>
          );
        })}
      </div>
    </PageWithPullRefresh>
  );
}
