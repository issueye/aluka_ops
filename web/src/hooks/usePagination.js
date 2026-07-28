import { useMemo, useState, useEffect } from "react";

/**
 * 前端分页 hook。
 * @param {Array} items
 * @param {number} [pageSize=10]
 */
export function usePagination(items, pageSize = 10) {
  const list = Array.isArray(items) ? items : [];
  const size = pageSize > 0 ? pageSize : 10;
  const [page, setPage] = useState(1);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);

  // 数据变化时校正页码
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // items 引用变化且长度变短时,尽量留在合理页
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [total, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  }, [list, page, size]);

  return {
    page,
    setPage,
    pageSize: size,
    total,
    totalPages,
    pageItems,
    from: total === 0 ? 0 : (page - 1) * size + 1,
    to: Math.min(page * size, total),
  };
}
