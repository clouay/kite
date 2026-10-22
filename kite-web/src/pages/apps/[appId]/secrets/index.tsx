import AppLayout from "@/components/app/AppLayout";
import { getAppShellLayout } from "@/components/app/AppShell";
import AppSecretList from "@/components/app/AppSecretList";
import { Separator } from "@/components/ui/separator";
import env from "@/lib/env/client";

const breadcrumbs = [
  {
    label: "Secrets",
  },
];

export default function AppSecretsPage() {
  return (
    <AppLayout title="Secrets" breadcrumbs={breadcrumbs}>
      <div>
        <h1 className="text-lg font-semibold md:text-2xl mb-1">Secrets</h1>
        <p className="text-muted-foreground text-sm">
          Store global and command-specific API keys, secrets, and configuration
          values, so they aren&apos;t part of your flows when you share or
          export them. True secrets are censored and can&apos;t be read back
          once saved, while non-secret values stay editable across your blocks.{" "}
          <a
            href={`${env.NEXT_PUBLIC_DOCS_LINK}/reference/secrets`}
            target="_blank"
            className="text-primary hover:underline"
          >
            Learn More
          </a>
        </p>
      </div>
      <Separator className="my-8" />
      <AppSecretList />
    </AppLayout>
  );
}

AppSecretsPage.getLayout = getAppShellLayout;
