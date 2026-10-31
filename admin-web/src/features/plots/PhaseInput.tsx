'use client'

import { FieldWrap, Input, Select } from '@/components/ui/Field'
import { useAllProjects } from '@/features/projects/api'

/** The plot's phase (its block / sector too): picked from the project's phases, or typed when it has none. */
export function PhaseInput({ projectId, value, onChange }: { projectId: number | undefined; value: string; onChange: (next: string) => void }) {
  const { data: projects } = useAllProjects()
  const phases = projects?.find((p) => p.id === projectId)?.phases ?? []
  return (
    <FieldWrap label="Phase / Sector" hint={phases.length ? undefined : 'Add phases to the project to pick from a list'}>
      {phases.length ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No phase</option>
          {/* Keep a value that isn't in the project's list (e.g. an older "Sector 4") selectable */}
          {[...new Set([...phases, ...(value && !phases.includes(value) ? [value] : [])])].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Phase 1" />
      )}
    </FieldWrap>
  )
}
