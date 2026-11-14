import { useImageTemplates } from "@/lib/hooks/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AutoAnimate from "@/components/common/AutoAnimate";
import AppEmptyPlaceholder from "@/components/app/AppEmptyPlaceholder";
import SearchableList, { ListActions } from "@/components/app/SearchableList";
import ImageListEntry from "./ImageListEntry";
import ImageCreateDialog from "./ImageCreateDialog";
import { ImageIcon } from "lucide-react";
import { ImageTemplate } from "@/lib/types/wire.gen";

export default function ImageList() {
  const templates = useImageTemplates();

  const actions = (
    <ImageCreateDialog>
      <Button>Create image template</Button>
    </ImageCreateDialog>
  );

  return (
    <AutoAnimate className="flex flex-col md:flex-1 space-y-5">
      {!templates ? (
        <>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </>
      ) : templates.length === 0 ? (
        <AppEmptyPlaceholder
          icon={ImageIcon}
          title="No image templates yet"
          description="Design rank cards, welcomers, leaderboards, or custom banners with dynamic bot data."
          action={<ListActions>{actions}</ListActions>}
        />
      ) : (
        <SearchableList<ImageTemplate>
          items={templates.filter((t): t is ImageTemplate => !!t)}
          fields={(t: ImageTemplate) => [t.name, t.description || ""]}
          renderItem={(t: ImageTemplate) => (
            <ImageListEntry template={t} key={t.id} />
          )}
          placeholder="Search image templates"
          actions={actions}
        />
      )}
    </AutoAnimate>
  );
}
