import { Page } from "@/components/layout";
import { Action } from "@/components/action";
import { EmptyState } from "@/components/page-parts";

export default function NotFound() {
  return (
    <Page crumbs={[{ label: "Not found" }]}>
      <div className="mx-auto max-w-md px-4 py-20">
        <EmptyState title="Nothing here" body="This address leads nowhere. Your rooms are one click away." testId="text-not-found"
          action={<Action k="ui.nav.home" tone="primary" href="/" testId="link-not-found-home" />} />
      </div>
    </Page>
  );
}
