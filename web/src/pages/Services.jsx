import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { ServiceActions } from "@/components/services/ServiceActions";
import { ServiceDialog } from "@/components/services/ServiceDialog";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  CodeText,
  ConfirmDialog,
  RowActions,
  SegmentedPicker,
  TableStateRow,
  TextActionButton,
  TextActionLink,
  TypeChip,
} from "@/components/ued";

const TYPE_LABEL = { jar: "JAR", exe: "EXE", bat: "BAT", sh: "SH", ps1: "PS1" };
const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "stopped", label: "已停止" },
  { value: "crashed", label: "异常" },
  { value: "created", label: "待启动" },
];

export function Services() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const { data: services = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["services"],
    queryFn: () => serviceApi.list(),
    refetchInterval: 5000,
  });

  const filtered = useMemo(() => {
    let list = services;
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(kw) ||
          s.code?.toLowerCase().includes(kw)
      );
    }
    return list;
  }, [services, statusFilter, keyword]);

  const pg = usePagination(filtered, PAGE_SIZE);

  const statusCount = useMemo(() => {
    const count = { all: services.length, running: 0, stopped: 0, crashed: 0, created: 0 };
    for (const s of services) {
      if (count[s.status] !== undefined) count[s.status]++;
    }
    return count;
  }, [services]);

  const deleteMut = useMutation({
    mutationFn: (id) => serviceApi.remove(id),
    onSuccess: () => {
      toast.success("已删除服务");
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  return (
    <PageTemplate
      list
      title="服务管理"
      description={`管理服务进程的启动、停止与重启。共 ${services.length} 个服务。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载服务列表失败，请确认后端服务已启动。" : null}
      actions={
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 新建服务
        </Button>
      }
      filters={
        <>
          <SegmentedPicker
            options={STATUS_FILTERS.map((f) => ({
              ...f,
              label: `${f.label}(${statusCount[f.value] ?? 0})`,
            }))}
            value={statusFilter}
            onChange={setStatusFilter}
            size="sm"
          />
          <div className="ml-auto flex h-8 items-center gap-1.5 rounded-sm bg-bg1 px-3 shadow-[0_0_0_1px_var(--border-2)]">
            <Search className="h-4 w-4 shrink-0 text-text3" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索服务名称或代码"
              className="h-8 w-44 border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            />
          </div>
        </>
      }
      pagination={
        !isLoading && filtered.length > 0
          ? {
              page: pg.page,
              totalPages: pg.totalPages,
              total: pg.total,
              from: pg.from,
              to: pg.to,
              pageSize: pg.pageSize,
              setPage: pg.setPage,
            }
          : null
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">状态</TableHead>
            <TableHead>名称 / 编码</TableHead>
            <TableHead className="w-[70px]">类型</TableHead>
            <TableHead className="w-[90px]">PID</TableHead>
            <TableHead className="w-[150px]">启动时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={6}>加载中...</TableStateRow>
          ) : filtered.length === 0 ? (
            <TableStateRow colSpan={6}>暂无服务，点击右上角「新建服务」创建。</TableStateRow>
          ) : (
            pg.pageItems.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <ServiceStatusBadge status={s.status} />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/services/${s.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  <div>
                    <CodeText>{s.code}</CodeText>
                  </div>
                </TableCell>
                <TableCell>
                  <TypeChip>{TYPE_LABEL[s.type] || s.type}</TypeChip>
                </TableCell>
                <TableCell>
                  <CodeText>{s.pid ? s.pid : "—"}</CodeText>
                </TableCell>
                <TableCell className="text-xs text-text3">
                  {formatTime(s.started_at)}
                </TableCell>
                <TableCell>
                  <RowActions className="justify-end">
                    <ServiceActions service={s} />
                    <TextActionLink to={`/services/${s.id}`}>详情</TextActionLink>
                    <TextActionButton
                      tone="danger"
                      disabled={s.status === "running"}
                      title={s.status === "running" ? "运行中不可删除" : "删除"}
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="h-3 w-3" /> 删除
                    </TextActionButton>
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="确认删除服务?"
        description={
          deleting ? (
            <>
              将删除「
              <span className="font-medium text-text1">{deleting.name}</span>
              」及其配置。该操作不可撤销(日志文件保留在磁盘上)。
            </>
          ) : null
        }
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate(deleting.id)}
      />
    </PageTemplate>
  );
}
