import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableStateRow } from "./TableStateRow";
import { EmptyState } from "./EmptyState";

function alignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return undefined;
}

function widthStyle(width) {
  if (typeof width === "number") return { width };
  return undefined;
}

function widthClass(width) {
  return typeof width === "string" ? width : undefined;
}

/**
 * 声明式表格。columns: [{ key, title, width, align, className, headerClassName, render, dataIndex }]
 */
export function DataTable({
  columns = [],
  data = [],
  rowKey = "id",
  loading = false,
  empty = "暂无数据",
  emptyIcon,
  className,
  onRowClick,
}) {
  const colSpan = Math.max(columns.length, 1);

  const getKey = (row, index) => {
    if (typeof rowKey === "function") return rowKey(row, index);
    return row?.[rowKey] ?? index;
  };

  const renderEmpty = () => {
    if (empty == null) return "暂无数据";
    if (typeof empty === "string") return empty;
    return empty;
  };

  return (
    <Table className={cn("table-fixed", className)}>
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            className={widthClass(col.width)}
            style={widthStyle(col.width)}
          />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(alignClass(col.align), col.headerClassName)}
            >
              {col.title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableStateRow colSpan={colSpan}>加载中...</TableStateRow>
        ) : data.length === 0 ? (
          <TableStateRow colSpan={colSpan}>
            {typeof empty === "string" || empty == null ? (
              emptyIcon ? (
                <EmptyState compact icon={emptyIcon} title={renderEmpty()} />
              ) : (
                renderEmpty()
              )
            ) : (
              empty
            )}
          </TableStateRow>
        ) : (
          data.map((row, index) => (
            <TableRow
              key={getKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((col) => {
                const content = col.render
                  ? col.render(row, index)
                  : row?.[col.dataIndex || col.key];
                return (
                  <TableCell
                    key={col.key}
                    className={cn(alignClass(col.align), col.className)}
                  >
                    {content}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
