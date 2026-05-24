import React from 'react'

type ReportTableColumn<T> = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  className?: string
  render: (row: T) => React.ReactNode
}

type ReportTableProps<T> = {
  columns: ReportTableColumn<T>[]
  rows: T[]
  emptyMessage?: string
  rowHref?: (row: T) => string | null | undefined
}

function getAlignClass(align?: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return ''
}

export default function ReportTable<T>({
  columns,
  rows,
  emptyMessage = 'No records matched those filters.',
  rowHref,
}: ReportTableProps<T>) {
  return (
    <div className="app-table-wrap">
      <div className="app-table-scroll">
        <table className="app-table text-sm">
          <thead className="app-thead">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`app-th whitespace-nowrap px-2.5 py-1.5 text-[11px] leading-tight ${getAlignClass(
                    column.align
                  )} ${column.className ?? ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const href = rowHref ? rowHref(row) : null

              return (
                <tr
                  key={rowIndex}
                  className={`app-tr align-top ${
                    href ? 'cursor-pointer transition hover:bg-zinc-900/60' : ''
                  }`}
                >
                  {columns.map((column) => {
                    const cellContent = column.render(row)

                    return (
                      <td
                        key={column.key}
                        className={`app-td px-2.5 py-1.5 leading-snug ${getAlignClass(
                          column.align
                        )} ${column.className ?? ''}`}
                      >
                        {href ? (
                          <a
                            href={href}
                            className="block h-full w-full text-inherit"
                          >
                            {cellContent}
                          </a>
                        ) : (
                          cellContent
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-sm text-zinc-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
