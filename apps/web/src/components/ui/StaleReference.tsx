import { Button } from "./Button";

type StaleReferenceProps = {
  kind: string;
  label: string;
  reason: string;
  onClear: () => void;
  onReplace?: () => void;
};

export const StaleReference = ({
  kind,
  label,
  reason,
  onClear,
  onReplace
}: StaleReferenceProps) => (
  <article className="stale-reference" role="status">
    <p>
      <strong>{label}</strong> ({kind}) is unavailable. {reason}
    </p>
    <div className="stale-reference-actions">
      <Button onClick={onClear}>Clear</Button>
      {onReplace ? <Button onClick={onReplace}>Replace</Button> : null}
    </div>
  </article>
);
