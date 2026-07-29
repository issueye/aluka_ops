import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Folder,
  File,
  Upload,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Download,
  Pencil,
  Trash2,
  ChevronRight,
  Home,
  Save,
  X,
  ArrowUp,
} from "lucide-react";
import { filesApi } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatTime, formatBytes } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { PageShell } from "@/components/ued";


function joinPath(parent, name) {
  if (!parent) return name;
  return `${parent}/${name}`;
}

export function Files() {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [path, setPath] = useState("");
  const [selected, setSelected] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // {done,total,current}

  // dialogs
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPath, setEditorPath] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorLoading, setEditorLoading] = useState(false);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["files", path],
    queryFn: () => filesApi.list(path),
  });

  const crumbs = useMemo(() => {
    if (!path) return [];
    const parts = path.split("/").filter(Boolean);
    const acc = [];
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      acc.push({ name: p, path: cur });
    }
    return acc;
  }, [path]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["files", path] });

  const mkdirMut = useMutation({
    mutationFn: (name) => filesApi.mkdir({ path, name, parents: true }),
    onSuccess: () => {
      toast.success("目录已创建");
      setMkdirOpen(false);
      setMkdirName("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const newFileMut = useMutation({
    mutationFn: (name) =>
      filesApi.write({ path: joinPath(path, name), content: "" }),
    onSuccess: (_, name) => {
      toast.success("文件已创建");
      setNewFileOpen(false);
      setNewFileName("");
      invalidate();
      openEditor(joinPath(path, name));
    },
    onError: (e) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: ({ from, new_name }) => filesApi.rename({ path: from, new_name }),
    onSuccess: () => {
      toast.success("已重命名");
      setRenameOpen(false);
      setSelected(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ p, recursive }) => filesApi.remove(p, recursive),
    onSuccess: () => {
      toast.success("已删除");
      setDeleteOpen(false);
      setSelected(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const writeMut = useMutation({
    mutationFn: ({ p, content }) => filesApi.write({ path: p, content }),
    onSuccess: () => {
      toast.success("已保存");
      setEditorOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ items }) => {
      setUploadProgress({ done: 0, total: items.length, current: "" });
      return filesApi.uploadMany(path, items, (done, total, ent) => {
        setUploadProgress({
          done,
          total,
          current: ent?.path || ent?.name || "",
        });
      });
    },
    onSuccess: (list) => {
      const n = list?.length || 0;
      toast.success(n <= 1 ? `已上传: ${list?.[0]?.name || "文件"}` : `已上传 ${n} 个文件`);
      setUploadProgress(null);
      invalidate();
    },
    onError: (e) => {
      setUploadProgress(null);
      toast.error(e.message);
    },
  });

  const go = (p) => {
    setPath(p || "");
    setSelected(null);
  };

  const openEditor = async (p) => {
    setEditorLoading(true);
    setEditorPath(p);
    setEditorOpen(true);
    try {
      const res = await filesApi.read(p);
      setEditorContent(res?.content ?? "");
    } catch (e) {
      toast.error(e.message || "无法打开");
      setEditorOpen(false);
    } finally {
      setEditorLoading(false);
    }
  };

  const onRowDoubleClick = (e, ent) => {
    // 避免双击时浏览器默认选中文字
    e?.preventDefault?.();
    if (typeof window !== "undefined") {
      const sel = window.getSelection?.();
      sel?.removeAllRanges?.();
    }
    if (ent.is_dir) go(ent.path);
    else openEditor(ent.path);
  };

  const onDownload = (ent) => {
    if (ent.is_dir) return;
    const url = withAuthQuery(filesApi.downloadUrl(ent.path));
    const a = document.createElement("a");
    a.href = url;
    a.download = ent.name;
    a.click();
  };

  const onPickUpload = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    const items = list.map((file) => ({
      file,
      name: file.webkitRelativePath || file.name,
    }));
    uploadMut.mutate({ items });
  };

  const uploading = uploadMut.isPending;
  const entries = data?.entries || [];
  const pg = usePagination(entries, 15);

  return (
    <PageShell>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">文件管理</CardTitle>
              <CardDescription>
                仅可管理数据目录内文件
                {data?.root ? (
                  <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                    ({data.root})
                  </span>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMkdirName("");
                  setMkdirOpen(true);
                }}
              >
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                新建目录
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewFileName("");
                  setNewFileOpen(true);
                }}
              >
                <FilePlus className="mr-1.5 h-3.5 w-3.5" />
                新建文件
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                上传文件
              </Button>
              <Button
                size="sm"
                onClick={() => folderInputRef.current?.click()}
                disabled={uploading}
              >
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                上传文件夹
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={onPickUpload}
              />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                // 浏览器文件夹选择(Chrome/Edge/Safari)
                webkitdirectory=""
                directory=""
                multiple
                onChange={onPickUpload}
              />
            </div>
          </div>

          {uploadProgress && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              上传中 {uploadProgress.done}/{uploadProgress.total}
              {uploadProgress.current ? (
                <span className="ml-2 font-mono text-muted-foreground">
                  {uploadProgress.current}
                </span>
              ) : null}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${
                      uploadProgress.total
                        ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 面包屑 */}
          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => go("")}
            >
              <Home className="h-3.5 w-3.5" />
              data
            </button>
            {crumbs.map((c) => (
              <span key={c.path} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
                  onClick={() => go(c.path)}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {path !== "" && (
            <div className="mb-2">
              <Button variant="ghost" size="sm" onClick={() => go(data?.parent ?? "")}>
                <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
                上级目录
              </Button>
            </div>
          )}

          {isError && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger-muted p-3 text-sm text-destructive">
              {error?.message || "加载失败"}
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">名称</TableHead>
                  <TableHead className="w-[12%]">大小</TableHead>
                  <TableHead className="w-[22%]">修改时间</TableHead>
                  <TableHead className="w-[21%] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      空目录
                    </TableCell>
                  </TableRow>
                ) : (
                  pg.pageItems.map((ent) => (
                    <TableRow
                      key={ent.path}
                      className={
                        selected?.path === ent.path
                          ? "cursor-pointer select-none bg-primary/5"
                          : "cursor-pointer select-none"
                      }
                      onClick={() => setSelected(ent)}
                      onDoubleClick={(e) => onRowDoubleClick(e, ent)}
                      onMouseDown={(e) => {
                        // detail>1 为双击的第二次按下，阻止默认选中
                        if (e.detail > 1) e.preventDefault();
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {ent.is_dir ? (
                            <Folder className="h-4 w-4 shrink-0 text-warning" />
                          ) : (
                            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="select-none font-mono text-sm">{ent.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {ent.is_dir ? "—" : formatBytes(ent.size)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(ent.mod_time)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!ent.is_dir && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="编辑"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(ent.path);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="下载"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownload(ent);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="重命名"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(ent);
                              setRenameName(ent.name);
                              setRenameOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 opacity-50" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(ent);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
              {!isLoading && entries.length > 0 && (
                <PaginationBar
                  page={pg.page}
                  totalPages={pg.totalPages}
                  total={pg.total}
                  from={pg.from}
                  to={pg.to}
                  pageSize={pg.pageSize}
                  onPageChange={pg.setPage}
                />
              )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            双击目录进入；双击文件打开文本编辑。删除非空目录会递归删除。
          </p>
        </CardContent>
      </Card>

      {/* 新建目录 */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建目录</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>目录名</Label>
            <Input
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              placeholder="logs 或 nested/dir"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && mkdirName.trim()) {
                  mkdirMut.mutate(mkdirName.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!mkdirName.trim() || mkdirMut.isPending}
              onClick={() => mkdirMut.mutate(mkdirName.trim())}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建文件 */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>文件名</Label>
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="readme.txt"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFileName.trim()) {
                  newFileMut.mutate(newFileName.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!newFileName.trim() || newFileMut.isPending}
              onClick={() => newFileMut.mutate(newFileName.trim())}
            >
              创建并编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>新名称</Label>
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!renameName.trim() || !selected || renameMut.isPending}
              onClick={() =>
                renameMut.mutate({ from: selected.path, new_name: renameName.trim() })
              }
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除{" "}
              <span className="font-mono text-foreground">{selected?.path}</span>
              {selected?.is_dir ? "（目录将递归删除）" : ""}。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteMut.mutate({
                  p: selected.path,
                  recursive: !!selected?.is_dir,
                })
              }
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 文本编辑器 */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="truncate font-mono text-sm">{editorPath}</span>
            </DialogTitle>
          </DialogHeader>
          {editorLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (
            <Textarea
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              className="min-h-[360px] font-mono text-xs"
              spellCheck={false}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              关闭
            </Button>
            <Button
              disabled={editorLoading || writeMut.isPending}
              onClick={() =>
                writeMut.mutate({ p: editorPath, content: editorContent })
              }
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
