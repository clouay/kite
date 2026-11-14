import React, { useCallback, useState } from "react";
import ImageNav from "./ImageNav";
import ImageMenu from "./ImageMenu";
import ImageCanvas from "./ImageCanvas";
import { useImageEditorStore } from "@/lib/image/state";
import { useAppId } from "@/lib/hooks/params";
import { useImageTemplateUpdateMutation } from "@/lib/api/mutations";
import { toast } from "sonner";
import { useUnsavedChangesWarning } from "@/lib/hooks/exit";
import UnsavedChangesDialog from "@/components/common/UnsavedChangesDialog";

export default function ImageEditor() {
  const appId = useAppId();
  const template = useImageEditorStore((s) => s.template);
  const selectedLayerId = useImageEditorStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useImageEditorStore((s) => s.setSelectedLayerId);
  const hasUnsavedChanges = useImageEditorStore((s) => s.hasUnsavedChanges);
  const setHasUnsavedChanges = useImageEditorStore((s) => s.setHasUnsavedChanges);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);

  const updateMutation = useImageTemplateUpdateMutation(appId, template.id);

  const handleSave = useCallback(async () => {
    try {
      await updateMutation.mutateAsync({
        name: template.name,
        description: template.description,
        width: template.width,
        height: template.height,
        format: template.format,
        data: template.data,
        sample_data: template.sample_data,
      });
      setHasUnsavedChanges(false);
      toast.success("Image template saved!");
    } catch (e: any) {
      toast.error(`Failed to save template: ${e.message || e}`);
    }
  }, [template, updateMutation, setHasUnsavedChanges]);

  const leave = useUnsavedChangesWarning(hasUnsavedChanges);

  const doExit = useCallback(() => {
    leave({
      pathname: "/apps/[appId]/images",
      query: { appId },
    });
  }, [leave, appId]);

  const handleExitRequest = useCallback(() => {
    if (hasUnsavedChanges) {
      setUnsavedDialogOpen(true);
    } else {
      doExit();
    }
  }, [hasUnsavedChanges, doExit]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <ImageNav
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={updateMutation.isPending}
        onSave={handleSave}
        onExit={handleExitRequest}
      />

      <div className="flex flex-auto min-h-0 overflow-hidden relative">
        <ImageMenu
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
        />

        <div className="flex-auto min-h-0 relative pb-14 md:pb-0">
          <ImageCanvas />
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        onOpenChange={setUnsavedDialogOpen}
        onSaveAndExit={async () => {
          await handleSave();
          setUnsavedDialogOpen(false);
          doExit();
        }}
        onDiscardAndExit={() => {
          setUnsavedDialogOpen(false);
          doExit();
        }}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
