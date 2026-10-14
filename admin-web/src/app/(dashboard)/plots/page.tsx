import { Suspense } from 'react'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { PlotsPage } from '@/features/plots/PlotsPage'

export default function Page() {
  // PlotsPage reads ?project= via useSearchParams, which needs a Suspense boundary for prerendering.
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <PlotsPage />
    </Suspense>
  )
}
