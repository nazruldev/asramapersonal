import type { PagedResponse } from './api-pagination';
import { DEFAULT_LIST_PAGE_SIZE, paginateInMemory, sortByUpdatedDesc } from './api-pagination';

export type SantriListRow = Record<string, unknown> & { id: string };

export async function fetchSantriPage(params: {
  page: number;
  limit?: number;
  q?: string;
  kamar?: string;
}): Promise<PagedResponse<SantriListRow>> {
  const sp = new URLSearchParams();
  sp.set('page', String(params.page));
  sp.set('limit', String(params.limit ?? DEFAULT_LIST_PAGE_SIZE));
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.kamar && params.kamar !== 'Semua') sp.set('kamar', params.kamar);
  const res = await fetch(`/api/santri?${sp.toString()}`);
  if (!res.ok) throw new Error('Gagal memuat daftar santri');
  const data = (await res.json()) as PagedResponse<SantriListRow> | SantriListRow[];
  if (Array.isArray(data)) {
    return paginateInMemory(
      sortByUpdatedDesc(data),
      params.page,
      params.limit ?? DEFAULT_LIST_PAGE_SIZE
    );
  }
  return {
    items: data.items ?? [],
    total: Number(data.total) || 0,
    page: Number(data.page) || params.page,
    limit: Number(data.limit) || (params.limit ?? DEFAULT_LIST_PAGE_SIZE),
  };
}

export async function fetchSantriById(id: string): Promise<SantriListRow> {
  const res = await fetch(`/api/santri/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal memuat profil santri');
  return data as SantriListRow;
}
