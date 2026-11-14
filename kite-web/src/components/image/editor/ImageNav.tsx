import React, { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useImageEditorStore } from "@/lib/image/state";
import { useAppId } from "@/lib/hooks/params";
import { useImageTemplateRenderPreviewMutation } from "@/lib/api/mutations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ThemeSwitch from "@/components/common/ThemeSwitch";
import { toast } from "sonner";

interface Props {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onExit: () => void;
}

export default function ImageNav({
  hasUnsavedChanges,
  isSaving,
  onSave,
  onExit,
}: Props) {
  const appId = useAppId();
  const template = useImageEditorStore((s) => s.template);
  const renderPreviewMutation = useImageTemplateRenderPreviewMutation(appId);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!isSaving) onSave();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onSave, isSaving]);

  const handleRenderPreview = async () => {
    setPreviewOpen(true);
    try {
      const res = await renderPreviewMutation.mutateAsync({
        width: template.width,
        height: template.height,
        format: template.format || "png",
        data: template.data,
        sample_data: template.sample_data || {},
      });
      if (res.success && res.data) {
        setPreviewDataUrl(res.data.data_url);
      } else if (!res.success) {
        toast.error(
          `Failed to render preview: ${res.error?.message || "Unknown error"}`
        );
      }
    } catch (err: any) {
      toast.error(
        `Failed to render preview: ${err?.message || "Unknown error"}`
      );
    }
  };

  const handleDownloadPreview = () => {
    if (!previewDataUrl) return;
    const a = document.createElement("a");
    a.href = previewDataUrl;
    const ext =
      template.format === "jpeg" || template.format === "jpg"
        ? "jpg"
        : "png";
    a.download = `${(template.name || "template").toLowerCase().replace(/\s+/g, "-")}.${ext}`;
    a.click();
  };

  return (
    <>
      <div className="h-12 flex-none shrink-0 flex items-center justify-between px-4 select-none bg-muted/70">
        <div className="flex items-center space-x-8">
          <div
            className="flex space-x-2 text-foreground/80 hover:text-foreground items-center cursor-pointer"
            onClick={onExit}
            role="button"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <div>Back to App</div>
          </div>

          {isSaving ? (
            <div className="flex space-x-2 text-foreground/80 hover:text-foreground items-center">
              <RefreshCwIcon className="h-5 w-5 animate-spin" />
              <div>Saving Changes</div>
            </div>
          ) : hasUnsavedChanges ? (
            <div
              className="flex space-x-2 text-foreground/80 hover:text-foreground items-center cursor-pointer"
              onClick={onSave}
              role="button"
            >
              <div className="h-3 w-3 rounded-full bg-foreground/80" />
              <div>Save Changes</div>
            </div>
          ) : (
            <div className="flex space-x-2 text-foreground/70 items-center">
              <CheckIcon className="h-5 w-5" />
              <div>No Unsaved Changes</div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-6">
          <div
            className="flex space-x-2 text-foreground/80 hover:text-foreground items-center cursor-pointer"
            onClick={handleRenderPreview}
            role="button"
          >
            <EyeIcon className="h-5 w-5" />
            <div>Preview</div>
          </div>

          <ThemeSwitch />
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              Rendered image ({template.width} × {template.height}px) using sample data.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-[#111214] p-4 border border-border overflow-auto max-h-[65vh] flex items-center justify-center">
            {renderPreviewMutation.isPending ? (
              <div className="flex items-center gap-2 py-16 text-sm text-gray-300">
                <Loader2Icon className="h-5 w-5 animate-spin" />
                <span>Rendering image...</span>
              </div>
            ) : previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Rendered output"
                className="max-w-full h-auto block"
              />
            ) : (
              <div className="py-12 text-sm text-muted-foreground">
                Could not render preview.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleRenderPreview}
              disabled={renderPreviewMutation.isPending}
            >
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Re-render
            </Button>
            <Button
              onClick={handleDownloadPreview}
              disabled={!previewDataUrl || renderPreviewMutation.isPending}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
