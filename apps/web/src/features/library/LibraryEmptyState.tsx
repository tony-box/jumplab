import { Button, StaleReference } from "../../components/ui";

type LibraryEmptyStateProps = {
  query: string;
  onClear: () => void;
  onCreate: () => void;
  stale?: {
    kind: string;
    label: string;
    reason: string;
  } | null;
  onClearStale: () => void;
};

export const LibraryEmptyState = ({
  query,
  onClear,
  onCreate,
  stale,
  onClearStale
}: LibraryEmptyStateProps) => {
  if (stale) {
    return (
      <section className="library-empty" data-od-id="library-empty-state">
        <h2>Saved preset reference unavailable</h2>
        <p>Recover by clearing the stale reference or creating a new scenario.</p>
        <StaleReference
          kind={stale.kind}
          label={stale.label}
          reason={stale.reason}
          onClear={onClearStale}
        />
        <div className="library-empty-actions">
          <Button onClick={onCreate}>Create scenario</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="library-empty" data-od-id="library-empty-state" role="status">
      <h2>No presets match</h2>
      <p>
        No results for <strong>{query}</strong>. Clear the filter or create a new scenario.
      </p>
      <div className="library-empty-actions">
        <Button data-od-id="library-clear-search" onClick={onClear}>
          Clear search
        </Button>
        <Button onClick={onCreate}>Create scenario</Button>
      </div>
    </section>
  );
};
