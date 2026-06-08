import type { ReactNode } from 'react'
import { RecordFieldRow, recordFieldGridClass } from '@/components/admin/record/record-field-row'

export type RecordField = {
  label: string
  value?: ReactNode
}

export function RecordFieldGrid({ fields }: { fields: RecordField[] }) {
  if (fields.length === 0) return null

  const split = Math.ceil(fields.length / 2)
  const columns = [fields.slice(0, split), fields.slice(split)]

  return (
    <div className="grid min-w-0 gap-x-8 sm:grid-cols-2">
      {columns.map((column, columnIndex) => (
        <dl key={columnIndex} className={recordFieldGridClass}>
          {column.map((field) => (
            <RecordFieldRow key={field.label} label={field.label}>
              {field.value}
            </RecordFieldRow>
          ))}
        </dl>
      ))}
    </div>
  )
}
