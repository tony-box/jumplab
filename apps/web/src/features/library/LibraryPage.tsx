import { Plus } from "lucide-react";
import { Link } from "react-router";

import { Callout, AppShell, handleRovingKeyDown, rovingTabIndex } from "../../components/ui";
import { JumpPresetCard } from "./JumpPresetCard";
import { LibraryEmptyState } from "./LibraryEmptyState";
import { PresetTables } from "./PresetTables";
import { useLibrary } from "./useLibrary";

const tabOptions: Array<{
  value: "jump" | "rider" | "bike" | "movement";
  label: string;
  id: string;
}> = [
  { value: "jump", label: "Jumps", id: "view-jumps" },
  { value: "rider", label: "Riders", id: "view-riders" },
  { value: "bike", label: "Bikes", id: "view-bikes" },
  { value: "movement", label: "Moves", id: "view-moves" }
];

export const LibraryPage = () => {
  const library = useLibrary();

  return (
    <AppShell
      scenarioLabel="Scenario library"
      status={library.loading ? "loading" : library.error ? "error" : "ready"}
      source="solver"
      primaryLabel="New scenario"
      primaryId="new-scenario"
      primaryIcon={<Plus aria-hidden="true" />}
      onPrimary={() => void library.createScenario()}
    >
      <main className="library-page" data-od-id="library-page">
        <header className="library-header">
          <h1>Scenario library</h1>
          <p>
            Search immutable jump, rider, bike, and movement presets. Load or duplicate any preset
            into an editable scenario, then refine its bike and movement in Designer.
          </p>
          <Link className="btn" to="/designer">
            Open Designer
          </Link>
          <label className="library-search" data-od-id="library-search">
            <span className="sr-only">Search presets</span>
            <input
              ref={library.searchRef}
              type="search"
              value={library.query}
              onChange={(event) => library.setQuery(event.target.value)}
              placeholder="Filter presets by name, tags, or note"
            />
          </label>
        </header>

        <div
          className="library-tabs"
          role="tablist"
          data-od-id="library-tabs"
          aria-label="Preset categories"
          onKeyDown={(event) =>
            handleRovingKeyDown(
              event,
              '[role="tab"]',
              (item) => {
                if (item.dataset.value) library.setCategory(item.dataset.value);
              },
              { vertical: false }
            )
          }
        >
          {tabOptions.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              data-value={option.value}
              aria-selected={library.category === option.value}
              tabIndex={rovingTabIndex(
                library.category === option.value,
                index,
                tabOptions.some((candidate) => candidate.value === library.category)
              )}
              aria-controls={library.loading ? undefined : option.id}
              onClick={() => library.setCategory(option.value)}
            >
              {option.label}
              <span className="num">{library.counts[option.value]}</span>
            </button>
          ))}
        </div>

        {library.loading ? (
          <section className="library-empty" role="status">
            Loading presets...
          </section>
        ) : null}

        {!library.loading && library.results.length === 0 ? (
          <LibraryEmptyState
            query={library.query || "all presets"}
            onClear={library.clearQuery}
            onCreate={() => void library.createScenario()}
            stale={library.stale}
            onClearStale={library.clearStale}
          />
        ) : null}

        {!library.loading ? (
          <>
            <section
              id="view-jumps"
              data-od-id="view-jumps"
              hidden={library.category !== "jump"}
              className="library-view"
            >
              {library.results.length > 0 ? (
                <div className="library-card-grid">
                  {library.results.map((preset) => {
                    const scenario = library.previews.get(preset.id);
                    if (!scenario) {
                      return null;
                    }
                    return (
                      <JumpPresetCard
                        key={preset.id}
                        preset={preset}
                        scenario={scenario}
                        onLoad={(presetId) => void library.loadPreset(presetId)}
                        onDuplicate={(presetId) => void library.duplicatePreset(presetId)}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">No jump presets match this filter.</p>
              )}
              <div data-od-id="window-explainer">
                <Callout title="Speed-window guidance" tone="info">
                  The speed window is shown only when measured. Unavailable guidance always names
                  its reason and never renders as a zero window.
                </Callout>
              </div>
            </section>

            <section
              id="view-riders"
              data-od-id="view-riders"
              hidden={library.category !== "rider"}
              className="library-view"
            >
              {library.results.length > 0 ? (
                <PresetTables
                  category="rider"
                  presets={library.results}
                  scenarios={library.previews}
                  onLoad={(presetId) => void library.loadPreset(presetId)}
                  onDuplicate={(presetId) => void library.duplicatePreset(presetId)}
                />
              ) : (
                <p className="empty-state">No rider presets match this filter.</p>
              )}
            </section>

            <section
              id="view-bikes"
              data-od-id="view-bikes"
              hidden={library.category !== "bike"}
              className="library-view"
            >
              {library.results.length > 0 ? (
                <PresetTables
                  category="bike"
                  presets={library.results}
                  scenarios={library.previews}
                  onLoad={(presetId) => void library.loadPreset(presetId)}
                  onDuplicate={(presetId) => void library.duplicatePreset(presetId)}
                />
              ) : (
                <p className="empty-state">No bike presets match this filter.</p>
              )}
            </section>

            <section
              id="view-moves"
              data-od-id="view-moves"
              hidden={library.category !== "movement"}
              className="library-view"
            >
              {library.results.length > 0 ? (
                <PresetTables
                  category="movement"
                  presets={library.results}
                  scenarios={library.previews}
                  onLoad={(presetId) => void library.loadPreset(presetId)}
                  onDuplicate={(presetId) => void library.duplicatePreset(presetId)}
                />
              ) : (
                <p className="empty-state">No movement presets match this filter.</p>
              )}
            </section>
          </>
        ) : null}

        {library.error ? (
          <section className="library-empty" role="status">
            <strong>Preset recovery required</strong>
            <p>{library.error}</p>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
};
