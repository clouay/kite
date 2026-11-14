import React, { useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useImageTemplate } from "@/lib/hooks/api";
import { useImageEditorStore } from "@/lib/image/state";
import ImageEditor from "@/components/image/editor/ImageEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AppImageTemplatePage() {
  const router = useRouter();
  const replaceAll = useImageEditorStore((s) => s.replaceAll);
  const loadedId = useRef<string | null>(null);

  const template = useImageTemplate((res) => {
    if (!res.success) {
      toast.error(
        `Failed to load image template: ${res?.error.message} (${res?.error.code})`
      );
      if (
        res.error.code === "unknown_image" ||
        res.error.code === "not_found"
      ) {
        router.push({
          pathname: "/apps/[appId]/images",
          query: { appId: router.query.appId },
        });
      }
    }
  });

  useEffect(() => {
    if (template && loadedId.current !== template.id) {
      loadedId.current = template.id;
      replaceAll(template);
    }
  }, [template, replaceAll]);

  if (!template) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center space-y-4 max-w-sm w-full">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{template.name} - Image Editor - Kite</title>
      </Head>
      <ImageEditor />
    </>
  );
}
