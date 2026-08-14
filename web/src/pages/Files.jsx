import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FolderOpen,
  FileEdit,
} from "lucide-react";
import { filesApi } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { formatTime, formatBytes } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  ConfirmDialog,
  DataTableCard,
  FormField,
  IconTooltip,
  InlineAlert,
  PageShell,
  RefreshButton,
  RowActions,
  TableStateRow,
} from "@/components/ued";


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
  // 右键菜单: { x, y, target: 'blank' | 'entry', entry?: object }
  const [ctxMenu, setCtxMenu] = useState(null);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const openCtxMenu = useCallback((e, payload) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      ...payload,
    });
  }, []);

  // 切换目录时关掉菜单，避免操作已失效的 entry
  useEffect(() => {
    setCtxMenu(null);
  }, [path]);

  /** 执行菜单动作：先快照再关闭，避免状态被清空后读不到 entry */
  const runCtxAction = useCallback((fn) => {
    setCtxMenu((cur) => {
      if (cur) {
        // 微任务中执行，保证已拿到快照且菜单可先卸载
        queueMicrotask(() => fn(cur));
      }
      return null;
    });
  }, []);

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
    closeCtxMenu();
    if (ent.is_dir) go(ent.path);
    else openEditor(ent.path);
  };

  const openRename = (ent) => {
    setSelected(ent);
    setRenameName(ent.name);
    setRenameOpen(true);
  };

  const openDelete = (ent) => {
    setSelected(ent);
    setDeleteOpen(true);
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
      <DataTableCard
        icon={Folder}
        title="文件管理"
        description={
          <>
            仅可管理数据目录内文件
            {data?.root ? (
              <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                ({data.root})
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <RefreshButton onClick={() => refetch()} loading={isFetching} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMkdirName("");
                setMkdirOpen(true);
              }}
            >
              <FolderPlus /> 新建目录
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewFileName("");
                setNewFileOpen(true);
              }}
            >
              <FilePlus /> 新建文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload /> 上传文件
            </Button>
            <Button size="sm" onClick={() => folderInputRef.current?.click()} disabled={uploading}>
              <FolderPlus /> 上传文件夹
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
          </>
        }
        footer={
          <p className="border-t px-6 py-3 text-[11px] text-muted-foreground">
            双击目录进入；双击文件打开文本编辑。右键打开菜单。删除非空目录会递归删除。
          </p>
        }
        pagination={
          !isLoading && entries.length > 0
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
        {/* 工具条：面包屑 + 上级目录 + 上传进度 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3">
          <div className="flex flex-wrap items-center gap-1 text-sm">
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
          {path !== "" && (
            <Button variant="ghost" size="sm" onClick={() => go(data?.parent ?? "")}>
              <ArrowUp /> 上级目录
            </Button>
          )}
          {uploadProgress && (
            <div className="ml-auto min-w-[200px] max-w-xs flex-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              上传中 {uploadProgress.done}/{uploadProgress.total}
              {uploadProgress.current ? (
                <span className="ml-2 truncate font-mono text-muted-foreground">
                  {uploadProgress.current}
                </span>
              ) : null}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
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
        </div>

        {isError && (
          <div className="m-6">
            <InlineAlert variant="error">{error?.message || "加载失败"}</InlineAlert>
          </div>
        )}

        {!isError && (
          <div
            onContextMenu={(e) => {
              // 空白区域右键：新建/上传/刷新
              if (e.target.closest("tr[data-file-row]")) return;
              openCtxMenu(e, { target: "blank" });
            }}
          >
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
                  <TableStateRow colSpan={4}>加载中…</TableStateRow>
                ) : entries.length === 0 ? (
                  <TableStateRow colSpan={4}>空目录 · 右键可新建或上传</TableStateRow>
                ) : (
                  pg.pageItems.map((ent) => (
                    <TableRow
                      key={ent.path}
                      data-file-row
                      className={
                        selected?.path === ent.path || ctxMenu?.entry?.path === ent.path
                          ? "cursor-pointer select-none bg-primary/5"
                          : "cursor-pointer select-none"
                      }
                      onClick={() => setSelected(ent)}
                      onDoubleClick={(e) => onRowDoubleClick(e, ent)}
                      onContextMenu={(e) => {
                        setSelected(ent);
                        openCtxMenu(e, { target: "entry", entry: ent });
                      }}
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
                        <RowActions>
                          {!ent.is_dir && (
                            <>
                              <IconTooltip label="编辑">
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
                              </IconTooltip>
                              <IconTooltip label="下载">
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
                              </IconTooltip>
                            </>
                          )}
                          <IconTooltip label="重命名">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="重命名"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRename(ent);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 opacity-50" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="删除"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDelete(ent);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DataTableCard>

      {/* 右键菜单 */}
      <ContextMenu
        open={!!ctxMenu}
        x={ctxMenu?.x || 0}
        y={ctxMenu?.y || 0}
        onClose={closeCtxMenu}
      >
        {ctxMenu?.target === "entry" && ctxMenu.entry ? (
          <>
            <ContextMenuLabel className="max-w-[220px] truncate font-mono">
              {ctxMenu.entry.name}
            </ContextMenuLabel>
            <ContextMenuSeparator />
            {ctxMenu.entry.is_dir ? (
              <ContextMenuItem
                icon={FolderOpen}
                onSelect={() =>
                  runCtxAction((m) => {
                    if (m.entry?.path) go(m.entry.path);
                  })
                }
              >
                打开
              </ContextMenuItem>
            ) : (
              <>
                <ContextMenuItem
                  icon={FileEdit}
                  onSelect={() =>
                    runCtxAction((m) => {
                      if (m.entry?.path) openEditor(m.entry.path);
                    })
                  }
                >
                  编辑
                </ContextMenuItem>
                <ContextMenuItem
                  icon={Download}
                  onSelect={() =>
                    runCtxAction((m) => {
                      if (m.entry) onDownload(m.entry);
                    })
                  }
                >
                  下载
                </ContextMenuItem>
              </>
            )}
            <ContextMenuItem
              icon={Pencil}
              onSelect={() =>
                runCtxAction((m) => {
                  if (m.entry) openRename(m.entry);
                })
              }
            >
              重命名
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={Trash2}
              destructive
              onSelect={() =>
                runCtxAction((m) => {
                  if (m.entry) openDelete(m.entry);
                })
              }
            >
              删除
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={RefreshCw}
              onSelect={() =>
                runCtxAction(() => {
                  refetch();
                })
              }
            >
              刷新
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuLabel>当前目录</ContextMenuLabel>
            <ContextMenuSeparator />
            {path !== "" && (
              <ContextMenuItem
                icon={ArrowUp}
                onSelect={() =>
                  runCtxAction(() => {
                    go(data?.parent ?? "");
                  })
                }
              >
                上级目录
              </ContextMenuItem>
            )}
            <ContextMenuItem
              icon={FolderPlus}
              onSelect={() =>
                runCtxAction(() => {
                  setMkdirName("");
                  setMkdirOpen(true);
                })
              }
            >
              新建目录
            </ContextMenuItem>
            <ContextMenuItem
              icon={FilePlus}
              onSelect={() =>
                runCtxAction(() => {
                  setNewFileName("");
                  setNewFileOpen(true);
                })
              }
            >
              新建文件
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={Upload}
              disabled={uploading}
              onSelect={() =>
                runCtxAction(() => {
                  // 延后触发 file input，避免菜单卸载打断浏览器手势
                  window.setTimeout(() => fileInputRef.current?.click(), 0);
                })
              }
            >
              上传文件
            </ContextMenuItem>
            <ContextMenuItem
              icon={FolderPlus}
              disabled={uploading}
              onSelect={() =>
                runCtxAction(() => {
                  window.setTimeout(() => folderInputRef.current?.click(), 0);
                })
              }
            >
              上传文件夹
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={RefreshCw}
              onSelect={() =>
                runCtxAction(() => {
                  refetch();
                })
              }
            >
              刷新
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      {/* 新建目录 */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建目录</DialogTitle>
          </DialogHeader>
          <FormField label="目录名">
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
          </FormField>
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
          <FormField label="文件名">
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
          </FormField>
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
          <FormField label="新名称">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="font-mono"
            />
          </FormField>
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
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="确认删除？"
        description={
          <>
            将删除 <span className="font-mono text-foreground">{selected?.path}</span>
            {selected?.is_dir ? "（目录将递归删除）" : ""}。此操作不可恢复。
          </>
        }
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() =>
          deleteMut.mutate({
            p: selected.path,
            recursive: !!selected?.is_dir,
          })
        }
      />

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
              <X /> 关闭
            </Button>
            <Button
              disabled={editorLoading || writeMut.isPending}
              onClick={() =>
                writeMut.mutate({ p: editorPath, content: editorContent })
              }
            >
              <Save /> 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
