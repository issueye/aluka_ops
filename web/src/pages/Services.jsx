import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { serviceApi } from "@/lib/api";
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
  TextActionButton,
  TextActionLink,
  TypeChip,
  ActionButton,
  SearchInput,
  DataTable,
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
        <ActionButton icon={Plus} onClick={() => setDialogOpen(true)}>
          新建服务
        </ActionButton>
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
          <SearchInput
            className="ml-auto"
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索服务名称或代码"
          />
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
      <DataTable
        loading={isLoading}
        data={pg.pageItems}
        empty="暂无服务，点击右上角「新建服务」创建。"
        columns={[
          {
            key: "status",
            title: "状态",
            width: "w-[110px]",
            render: (s) => <ServiceStatusBadge status={s.status} />,
          },
          {
            key: "name",
            title: "名称 / 编码",
            render: (s) => (
              <>
                <Link
                  to={`/services/${s.id}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {s.name}
                </Link>
                <div>
                  <CodeText>{s.code}</CodeText>
                </div>
              </>
            ),
          },
          {
            key: "type",
            title: "类型",
            width: "w-[70px]",
            render: (s) => <TypeChip>{TYPE_LABEL[s.type] || s.type}</TypeChip>,
          },
          {
            key: "pid",
            title: "PID",
            width: "w-[90px]",
            render: (s) => <CodeText>{s.pid ? s.pid : "—"}</CodeText>,
          },
          {
            key: "started_at",
            title: "启动时间",
            width: "w-[150px]",
            className: "text-xs text-text3",
            render: (s) => formatTime(s.started_at),
          },
          {
            key: "actions",
            title: "操作",
            align: "right",
            render: (s) => (
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
            ),
          },
        ]}
      />

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
