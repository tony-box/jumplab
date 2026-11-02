type DataTableProps = {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};

export const DataTable = ({ caption, columns, rows }: DataTableProps) => (
  <table className="data-table">
    <caption className="sr-only">{caption}</caption>
    <thead>
      <tr>
        {columns.map((column) => (
          <th key={column} scope="col">
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.join(":")}>
          {row.map((cell, index) =>
            index === 0 ? (
              <th key={index} scope="row">
                {cell}
              </th>
            ) : (
              <td key={index}>{cell}</td>
            )
          )}
        </tr>
      ))}
    </tbody>
  </table>
);
