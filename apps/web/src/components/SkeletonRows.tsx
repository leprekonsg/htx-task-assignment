// Placeholder table rows shown while the task list is loading. Product convention for this app is
// "skeleton rows, never a spinner" — a spinner tells you nothing about the shape of what's coming;
// grey bars roughly where the real text will be do. Five rows is an arbitrary but typical page size
// for the empty-loading moment; it just needs to look like "a table is coming," not match the real
// row count (which isn't known yet).
const COLUMNS = 6;
const ROWS = 5;

export default function SkeletonRows() {
  return (
    <>
      {Array.from({ length: ROWS }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: COLUMNS }, (_, column) => (
            <td key={column} className="px-3 py-3.5">
              <div className="h-4 animate-pulse rounded-sm bg-surface-sunken" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
