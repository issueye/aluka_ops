import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileArchive } from "lucide-react";
import { artifactApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ArtifactUpload 上传制品对话框。
export function ArtifactUpload({ open, onOpenChange, serviceId }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setVersion("");
      setDescription("");
      setFile(null);
      setErrors({});
    }
  }, [open]);

  const uploadMut = useMutation({
    mutationFn: (data) => artifactApi.upload(serviceId, data),
    onSuccess: (a) => {
      toast.success(`制品 v${a.version} 已上传`);
      queryClient.invalidateQueries({ queryKey: ["artifacts", serviceId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(`上传失败: ${e.message}`),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!version.trim()) errs.version = "版本号不能为空";
    if (!file) errs.file = "请选择文件";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    uploadMut.mutate({
      file,
      version: version.trim(),
      description: description.trim(),
    });
  };

  const fmtSize = (n) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>上传制品</DialogTitle>
          <DialogDescription>
            支持单文件(jar/exe/bat/ps1)与 zip 压缩包。zip 安装时会解压并自动探测主入口。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-version">版本号 *</Label>
            <Input
              id="a-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="如:1.0.0"
            />
            {errors.version && <p className="text-xs text-red-400">{errors.version}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-file">制品文件 *</Label>
            <label
              htmlFor="a-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-sm transition-colors hover:border-primary hover:bg-muted/50"
            >
              {file ? (
                <>
                  <FileArchive className="h-7 w-7 text-primary" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-7 w-7 text-muted-foreground" />
                  <span className="text-muted-foreground">点击选择文件</span>
                  <span className="text-xs text-muted-foreground/70">jar / exe / zip</span>
                </>
              )}
            </label>
            <Input
              id="a-file"
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {errors.file && <p className="text-xs text-red-400">{errors.file}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-desc">描述</Label>
            <Textarea
              id="a-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选,如:修复登录问题"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploadMut.isPending}>
              取消
            </Button>
            <Button type="submit" disabled={uploadMut.isPending}>
              {uploadMut.isPending ? "上传中..." : "上传"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
