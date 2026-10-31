import { isDesktopApp } from "../services/desktop";
import type { SystemSnapshot } from "../types/assistant";
import { Panel } from "./Panel";

interface MeterProps {
  label: string;
  value: string;
  percent: number;
}

function Meter({ label, value, percent }: MeterProps) {
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <span className="mono">{value}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

interface SystemPanelProps {
  snapshot: SystemSnapshot | null;
  loaded: boolean;
  frameRate: number | null;
}

function emptyMessage(loaded: boolean): string {
  if (!isDesktopApp) return "System readings are available in the desktop app.";
  return loaded ? "System readings are unavailable." : "Reading system information.";
}

export function SystemPanel({ snapshot, loaded, frameRate }: SystemPanelProps) {
  return (
    <Panel title="System">
      {snapshot ? (
        <>
          <Meter label="CPU" value={`${Math.round(snapshot.cpuPercent)}%`} percent={snapshot.cpuPercent} />
          <Meter
            label="Memory"
            value={`${snapshot.memoryUsedGb.toFixed(1)} / ${snapshot.memoryTotalGb.toFixed(1)} GB`}
            percent={(snapshot.memoryUsedGb / snapshot.memoryTotalGb) * 100}
          />
          <Meter
            label={`Disk ${snapshot.diskName}`}
            value={`${snapshot.diskFreeGb.toFixed(0)} GB free`}
            percent={((snapshot.diskTotalGb - snapshot.diskFreeGb) / snapshot.diskTotalGb) * 100}
          />
        </>
      ) : (
        <p className="panel-note">{emptyMessage(loaded)}</p>
      )}
      <div className="meter-row meter-footer">
        <span>Animation</span>
        <span className="mono">{frameRate === null ? "--" : `${frameRate} FPS`}</span>
      </div>
    </Panel>
  );
}
