'use client'

import { useParams } from 'next/navigation'
import { TicketsPage } from '@/features/tickets/TicketsPage'

/** Deep link: the inbox opened on this ticket. */
export default function Page() {
  const { id } = useParams<{ id: string }>()
  return <TicketsPage initialId={Number(id) || undefined} />
}
