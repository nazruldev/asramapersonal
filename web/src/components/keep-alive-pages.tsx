import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { normalizeAppPathname } from '@/lib/app-navigation';

type RouteEntry = {
  path: string;
  match: (pathname: string) => boolean;
  element: ReactNode;
};

type KeepAlivePagesProps = {
  routes: RouteEntry[];
  fallback?: ReactNode;
};

function findActiveRoute(routes: RouteEntry[], pathname: string): RouteEntry | undefined {
  return routes.find((r) => r.match(pathname));
}

export function KeepAlivePages({ routes, fallback = null }: KeepAlivePagesProps) {
  const { pathname: rawPathname } = useLocation();
  const pathname = normalizeAppPathname(rawPathname);
  const activeRoute = findActiveRoute(routes, pathname);

  const [visited, setVisited] = useState<Set<string>>(() => {
    const initial = findActiveRoute(routes, pathname);
    return initial ? new Set([initial.path]) : new Set();
  });

  useLayoutEffect(() => {
    const route = findActiveRoute(routes, pathname);
    if (!route) return;
    setVisited((prev) => {
      if (prev.has(route.path)) return prev;
      const next = new Set(prev);
      next.add(route.path);
      return next;
    });
    // routes didefinisikan di App; matcher-nya stabil per path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!activeRoute) {
    return <>{fallback}</>;
  }

  return (
    <>
      {routes.map((route) => {
        const active = route.match(pathname);
        const shouldMount = visited.has(route.path) || active;
        if (!shouldMount) return null;
        return (
          <div
            key={route.path}
            className={active ? 'block w-full min-h-0' : 'hidden'}
            aria-hidden={!active}
          >
            {route.element}
          </div>
        );
      })}
    </>
  );
}
