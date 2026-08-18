import { TableCell, TableRow } from "@/components/ui/table";

/** 表格加载 / 空状态行 */
export function TableStateRow({ colSpan = 6, children }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-24 text-center text-text3"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
