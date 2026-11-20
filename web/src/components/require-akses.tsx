import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { getSessionUser, hasModuleAccess, requiredModuleForPath } from '@/lib/app-auth';

const ADMIN_ONLY_PREFIXES = ['/master/asrama', '/master/pengguna'];

/** Guard route berdasarkan role & checklist hak akses modul. */
export function RequireAkses({ children }: { children: ReactNode }) {
  const location = useLocation();
  const user = getSessionUser();
  const p = location.pathname;

  if (ADMIN_ONLY_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
    if (user && user.role !== 'super_admin') return <Navigate to="/master" replace />;
    return <>{children}</>;
  }

  const modul = requiredModuleForPath(p);
  if (modul && !hasModuleAccess(user, modul)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
