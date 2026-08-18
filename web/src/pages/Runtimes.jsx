import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, CheckCircle2 } from "lucide-react";
import { runtimeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuntimeDialog } from "@/components/runtimes/RuntimeDialog";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  TableStateRow,
  ConfirmDialog,
  TypeChip,
  RowActions,
  SegmentedPicker,
  TextActionButton,
  PathText,
} from "@/components/ued";

const TYPES = ["jdk", "node", "python", "go"];
const TYPE_LABEL = { jdk: "JDK", node: "Node", python: "Python", go: "Go" };
const PAGE_SIZE = 10;

export function Runtimes() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=新建, 对象=编辑
  const [deleting, setDeleting] = useState(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [detected, setDetected] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const { data: runtimes = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["runtimes"],
    queryFn: runtimeApi.list,
  });

  const typeCount = useMemo(() => {
    const count = { all: runtimes.length };
    for (const rt of runtimes) {
      if (count[rt.type] === undefined) count[rt.type] = 0;
      count[rt.type]++;
    }
    return count;
  }, [runtimes]);

  const filtered = useMemo(() => {
    let list = runtimes;
    if (typeFilter !== "all") {
      list = list.filter((rt) => rt.type === typeFilter);
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (rt) =>
          rt.name?.toLowerCase().includes(kw) ||
          rt.description?.toLowerCase().includes(kw)
      );
    }
    return list;
  }, [runtimes, typeFilter, keyword]);

  const pg = usePagination(filtered, PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: (id) => runtimeApi.remove(id),
    onSuccess: () => {
      toast.success("已删除运行环境");
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const detectMutation = useMutation({
    mutationFn: () => runtimeApi.detect(),
    onSuccess: (items) => {
      setDetected(items || []);
      setDetectOpen(true);
      if (!items?.length) toast.message("未探测到本机 JDK");
    },
    onError: (e) => toast.error(`探测失败: ${e.message}`),
  });

  const registerMutation = useMutation({
    mutationFn: (item) =>
      runtimeApi.create({
        name: item.name || `JDK ${item.version || ""}`.trim(),
        type: "jdk",
        version: item.version || "",
        install_path: item.install_path,
        is_default: false,
        env_template: JSON.stringify({
          JAVA_HOME: "{{install_path}}",
          PATH: "{{install_path}}\\bin;{{PATH}}",
        }),
        description: `本机探测(${item.source})`,
      }),
    onSuccess: () => {
      toast.success("已登记运行环境");
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      detectMutation.mutate();
    },
    onError: (e) => toast.error(`登记失败: ${e.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (rt) => {
    setEditing(rt);
    setDialogOpen(true);
  };

  return (
    <PageTemplate
      list
      title="环境管理"
      description={`管理服务可绑定的运行环境（如 JDK），每个类型仅可设置一个默认环境。共 ${runtimes.length} 个环境。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载运行环境失败，请确认后端服务已启动。" : null}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => detectMutation.mutate()}
            disabled={detectMutation.isPending}
          >
            <Search className="h-3.5 w-3.5 mr-1" /> 探测本机 JDK
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 新建环境
          </Button>
        </>
      }
      filters={
        <>
          <SegmentedPicker
            options={[
              { value: "all", label: `全部(${typeCount.all})` },
              ...TYPES.filter((t) => (typeCount[t] ?? 0) > 0).map((t) => ({
                value: t,
                label: `${TYPE_LABEL[t]}(${typeCount[t]})`,
              })),
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
            size="sm"
          />
          <div className="ml-auto flex h-8 items-center gap-1.5 rounded-sm bg-bg1 px-3 shadow-[0_0_0_1px_var(--border-2)]">
            <Search className="h-4 w-4 shrink-0 text-text3" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索环境名称"
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
            <TableHead>名称</TableHead>
            <TableHead className="w-[80px]">类型</TableHead>
            <TableHead className="w-[100px]">版本</TableHead>
            <TableHead>安装路径</TableHead>
            <TableHead className="w-[70px] text-center">默认</TableHead>
            <TableHead className="w-[150px]">更新时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={7}>加载中...</TableStateRow>
          ) : filtered.length === 0 ? (
            <TableStateRow colSpan={7}>
              暂无运行环境，点击右上角「新建环境」或「探测本机 JDK」快速登记。
            </TableStateRow>
          ) : (
            pg.pageItems.map((rt) => (
              <TableRow key={rt.id}>
                <TableCell className="font-medium">
                  <div>{rt.name}</div>
                  {rt.description && (
                    <div className="text-xs text-text3">{rt.description}</div>
                  )}
                </TableCell>
                <TableCell>
                  <TypeChip tone={rt.type}>{TYPE_LABEL[rt.type] || rt.type}</TypeChip>
                </TableCell>
                <TableCell className="text-xs">{rt.version || "—"}</TableCell>
                <TableCell>
                  <PathText>{rt.install_path}</PathText>
                </TableCell>
                <TableCell className="text-center">
                  {rt.is_default ? (
                    <TypeChip tone="primary">默认</TypeChip>
                  ) : (
                    <span className="text-text4">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-text3">
                  {formatTime(rt.updated_at || rt.created_at)}
                </TableCell>
                <TableCell>
                  <RowActions className="justify-end">
                    <TextActionButton onClick={() => openEdit(rt)}>
                      <Pencil className="h-3 w-3" /> 编辑
                    </TextActionButton>
                    <TextActionButton tone="danger" onClick={() => setDeleting(rt)}>
                      <Trash2 className="h-3 w-3" /> 删除
                    </TextActionButton>
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <RuntimeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        runtime={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="确认删除运行环境?"
        description={deleting ? (
            <>
              将删除「
              <span className="font-medium text-text1">{deleting.name}</span>
              」(版本 {deleting.version || "—"})。若该环境正被服务引用，可能影响启动，请谨慎操作。
            </>
          ) : null}
        confirmText="删除"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(deleting.id)}
      />

      {/* 本机 JDK 探测结果弹窗 */}
      <Dialog open={detectOpen} onOpenChange={setDetectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>本机 JDK 探测结果</DialogTitle>
            <DialogDescription>
              扫描 JAVA_HOME、PATH 与常见安装目录。可一键登记未注册的环境。
            </DialogDescription>
          </DialogHeader>
          {detected.length === 0 ? (
            <p className="py-6 text-center text-sm text-text3">未发现可用 JDK</p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {detected.map((item, idx) => (
                <div
                  key={`${item.install_path}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border1 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.source}
                      </Badge>
                      {item.registered && (
                        <Badge variant="success" className="gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> 已登记
                        </Badge>
                      )}
                    </div>
                    <div className="truncate mt-1">
                      <PathText>
                        {item.version ? `v${item.version} · ` : ""}
                        {item.install_path}
                      </PathText>
                    </div>
                  </div>
                  {!item.registered && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={registerMutation.isPending}
                      onClick={() => registerMutation.mutate(item)}
                    >
                      登记
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageTemplate>
  );
}
