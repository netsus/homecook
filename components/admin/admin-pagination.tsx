"use client";

interface AdminPaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ page, limit, total, onPageChange }: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        className="flex h-11 w-11 items-center justify-center rounded-lg border text-sm disabled:opacity-30"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        style={{ borderColor: "var(--line, #E9ECEF)" }}
        type="button"
      >
        &#8249;
      </button>
      <span className="px-3 text-sm text-[var(--text-3,#868E96)]">
        {page} / {totalPages}
      </span>
      <button
        className="flex h-11 w-11 items-center justify-center rounded-lg border text-sm disabled:opacity-30"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        style={{ borderColor: "var(--line, #E9ECEF)" }}
        type="button"
      >
        &#8250;
      </button>
    </div>
  );
}
