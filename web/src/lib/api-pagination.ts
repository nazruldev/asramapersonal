export const DEFAULT_LIST_PAGE_SIZE = 50;
export const MAX_LIST_PAGE_SIZE = 100;

export type PagedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export function parsePageParams(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  q: string;
  kamar: string;
  summary: boolean;
} {
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(
    MAX_LIST_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIST_PAGE_SIZE)
  );
  const q = (searchParams.get('q') ?? '').trim();
  const kamar = (searchParams.get('kamar') ?? '').trim();
  const summary = searchParams.get('summary') === '1';
  return { page, limit, q, kamar, summary };
}

export function paginateInMemory<T>(
  rows: T[],
  page: number,
  limit: number
): PagedResponse<T> {
  const total = rows.length;
  const offset = (page - 1) * limit;
  return {
    items: rows.slice(offset, offset + limit),
    total,
    page,
    limit,
  };
}

/** Terbaru diubah/ditambah paling atas; fallback nama A→Z. */
export function sortByUpdatedDesc<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(
      String(a.updated_at ?? a.updatedAt ?? a.created_at ?? a.createdAt ?? '')
    );
    const tb = Date.parse(
      String(b.updated_at ?? b.updatedAt ?? b.created_at ?? b.createdAt ?? '')
    );
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (nb !== na) return nb - na;
    return String(a.nama ?? '').localeCompare(String(b.nama ?? ''), 'id');
  });
}
