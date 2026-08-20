import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileArchive } from "lucide-react";
import { artifactApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ued/FormDialog";
import { FormField, FileDropzone } from "@/components/ued";
import { formatBytes } from "@/lib/utils";

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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="上传制品"
      description="支持单文件（jar/exe/bat/ps1）与 zip 压缩包，zip 会解压并自动探测主入口"
      onSubmit={handleSubmit}
      loading={uploadMut.isPending}
      submitText="上传"
    >
          <FormField label="版本号" htmlFor="a-version" required error={errors.version}>
            <Input
              id="a-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="如:1.0.0"
            />
          </FormField>

          <FormField label="制品文件" required error={errors.file}>
            <FileDropzone
              accept=".jar,.exe,.bat,.ps1,.zip,application/zip"
              onFiles={(files) => setFile(files[0] || null)}
              hint="点击或拖拽选择制品文件"
            >
              {file ? (
                <>
                  <FileArchive className="mb-2 h-7 w-7 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="mt-1 text-xs text-text3">
                    {formatBytes(file.size)}
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="mb-2 h-7 w-7 text-text3" />
                  <p className="text-sm text-text3">点击或拖拽选择文件</p>
                  <p className="mt-1 text-xs text-text3/70">jar / exe / zip</p>
                </>
              )}
            </FileDropzone>
          </FormField>

          <FormField label="描述" htmlFor="a-desc">
            <Textarea
              id="a-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选,如:修复登录问题"
            />
          </FormField>

    </FormDialog>
  );
}
