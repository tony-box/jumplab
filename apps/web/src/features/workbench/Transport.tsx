import { Pause, Pin, Play, SkipBack, StepBack, StepForward } from "lucide-react";

import { Button } from "../../components/ui";
import type { PlaybackController } from "./usePlayback";

type TransportProps = {
  playback: PlaybackController;
  frameCount: number;
  outputHz: number;
  disabled?: boolean;
  baselinePinned: boolean;
  onToggleBaseline: () => void;
};

export const Transport = ({
  playback,
  frameCount,
  outputHz,
  disabled = false,
  baselinePinned,
  onToggleBaseline
}: TransportProps) => {
  const duration = frameCount > 1 ? (frameCount - 1) / outputHz : 0;
  const currentTime = frameCount > 1 ? playback.framePosition / outputHz : 0;

  return (
    <div
      className="transport"
      data-od-id="transport"
      onKeyDown={(event) => playback.bindKeyboard(event.nativeEvent)}
    >
      <div className="transport-head">
        <Button
          disabled={disabled}
          variant="icon"
          aria-label="Jump to start"
          onClick={playback.goToStart}
        >
          <SkipBack />
        </Button>
        <Button
          disabled={disabled}
          variant="icon"
          aria-label="Step back one frame"
          onClick={() => playback.step(-1)}
        >
          <StepBack />
        </Button>
        <Button
          data-od-id="play-toggle"
          disabled={disabled}
          onClick={playback.togglePlaying}
          icon={playback.playing ? <Pause /> : <Play />}
        >
          {playback.playing ? "Pause" : "Play"}
        </Button>
        <Button
          disabled={disabled}
          variant="icon"
          aria-label="Step forward one frame"
          onClick={() => playback.step(1)}
        >
          <StepForward />
        </Button>
        <div className="playback-rate" data-od-id="playback-rate">
          <label htmlFor="playback-rate-slider">Speed</label>
          <input
            id="playback-rate-slider"
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={playback.rate}
            disabled={disabled}
            aria-label="Playback speed"
            aria-valuetext={`${playback.rate.toFixed(1)}x`}
            list="playback-rate-detents"
            onChange={(event) => playback.setRate(event.currentTarget.valueAsNumber)}
          />
          <datalist id="playback-rate-detents">
            <option value="0.5" />
            <option value="1" />
          </datalist>
          <output htmlFor="playback-rate-slider" className="num">
            {playback.rate.toFixed(1)}x
          </output>
        </div>
        <Button
          data-od-id="pin-baseline"
          disabled={disabled}
          icon={<Pin />}
          aria-pressed={baselinePinned}
          onClick={onToggleBaseline}
        >
          {baselinePinned ? "Unpin baseline" : "Pin baseline"}
        </Button>
        <span className="timeline-time num">
          {currentTime.toFixed(3)} / {duration.toFixed(3)} s
        </span>
      </div>
      <input
        className="timeline"
        data-od-id="timeline-track"
        type="range"
        min={0}
        max={Math.max(0, frameCount - 1)}
        value={playback.framePosition}
        aria-label="Scrub playback time"
        disabled={disabled}
        onChange={(event) => playback.setFrameIndex(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
};
