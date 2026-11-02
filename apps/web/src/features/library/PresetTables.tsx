import type { Preset, Scenario } from "../../../../../packages/schema/src/index";

import { Button } from "../../components/ui";

type PresetTablesProps = {
  category: "rider" | "bike" | "movement";
  presets: Preset[];
  scenarios: Map<string, Scenario>;
  onLoad: (presetId: string) => void;
  onDuplicate: (presetId: string) => void;
};

const renderDescription = (preset: Preset) => (
  <>
    {preset.name}
    <span className="preset-row-note">{preset.note}</span>
  </>
);

export const PresetTables = ({
  category,
  presets,
  scenarios,
  onLoad,
  onDuplicate
}: PresetTablesProps) => {
  if (category === "rider") {
    return (
      <div className="preset-table-scroll" data-od-id="preset-table-scroll">
        <table className="preset-table">
          <caption className="sr-only">Rider preset table</caption>
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col">Height</th>
              <th scope="col">Mass</th>
              <th scope="col">Strength</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => {
              const scenario = scenarios.get(preset.id);
              if (!scenario) {
                return null;
              }
              return (
                <tr key={preset.id}>
                  <th scope="row">{renderDescription(preset)}</th>
                  <td>{scenario.rider.height.toFixed(2)} m</td>
                  <td>{scenario.rider.mass.toFixed(0)} kg</td>
                  <td>{scenario.rider.strengthScale.toFixed(2)} x</td>
                  <td>
                    <div className="preset-row-actions">
                      <Button data-od-id="load-preset" onClick={() => onLoad(preset.id)}>
                        Load
                      </Button>
                      <Button data-od-id="duplicate-preset" onClick={() => onDuplicate(preset.id)}>
                        Duplicate
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (category === "bike") {
    return (
      <div className="preset-table-scroll" data-od-id="preset-table-scroll">
        <table className="preset-table">
          <caption className="sr-only">Bike preset table</caption>
          <thead>
            <tr>
              <th scope="col">Build</th>
              <th scope="col">Wheel</th>
              <th scope="col">Wheelbase</th>
              <th scope="col">Travel</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => {
              const scenario = scenarios.get(preset.id);
              if (!scenario) {
                return null;
              }
              return (
                <tr key={preset.id}>
                  <th scope="row">{renderDescription(preset)}</th>
                  <td>{scenario.bike.wheelSize.toFixed(1)} in</td>
                  <td>{scenario.bike.wheelbase.toFixed(3)} m</td>
                  <td>{(scenario.bike.fork.travel * 1000).toFixed(0)} mm</td>
                  <td>
                    <div className="preset-row-actions">
                      <Button data-od-id="load-preset" onClick={() => onLoad(preset.id)}>
                        Load
                      </Button>
                      <Button data-od-id="duplicate-preset" onClick={() => onDuplicate(preset.id)}>
                        Duplicate
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="preset-table-scroll" data-od-id="preset-table-scroll">
      <table className="preset-table">
        <caption className="sr-only">Movement preset table</caption>
        <thead>
          <tr>
            <th scope="col">Experiment</th>
            <th scope="col">Interpolation</th>
            <th scope="col">Keys</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {presets.map((preset) => {
            const scenario = scenarios.get(preset.id);
            if (!scenario) {
              return null;
            }
            return (
              <tr key={preset.id}>
                <th scope="row">{renderDescription(preset)}</th>
                <td>{scenario.poseClip.interpolation}</td>
                <td>{scenario.poseClip.keys.length}</td>
                <td>
                  <div className="preset-row-actions">
                    <Button data-od-id="load-preset" onClick={() => onLoad(preset.id)}>
                      Load
                    </Button>
                    <Button data-od-id="duplicate-preset" onClick={() => onDuplicate(preset.id)}>
                      Duplicate
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
