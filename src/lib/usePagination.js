import { useState, useEffect } from 'react';

export function usePagination(items, pageSize = 15) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages]);

  const start = (page - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);

  return { page, setPage, totalPages, paginated, totalItems: items.length, pageSize };
}