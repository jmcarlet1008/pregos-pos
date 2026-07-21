import { Card } from './ui'

export interface PlaceholderPageProps {
  title: string
  phase: string
}

export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="max-w-[448px] text-center" padding="md">
        <h1 className="text-headline-lg text-on-surface">{title}</h1>
        <p className="mt-sm text-body-md text-on-surface-variant">
          Coming in {phase}.
        </p>
      </Card>
    </div>
  )
}
