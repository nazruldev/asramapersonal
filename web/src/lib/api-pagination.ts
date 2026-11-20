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
