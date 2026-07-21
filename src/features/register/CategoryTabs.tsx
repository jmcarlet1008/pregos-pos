import type { Category } from '../../db'

export interface CategoryTabsProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (categoryId: string | null) => void
}

export function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex gap-xs overflow-x-auto pb-xs" role="tablist" aria-label="Product categories">
      <button
        type="button"
        role="tab"
        aria-selected={selectedId === null}
        onClick={() => onSelect(null)}
        className={[
          'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
          selectedId === null
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
        ].join(' ')}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          aria-selected={selectedId === category.id}
          onClick={() => onSelect(category.id)}
          className={[
            'touch-target shrink-0 whitespace-nowrap rounded-full px-md text-body-md font-body font-bold transition-colors',
            selectedId === category.id
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
          ].join(' ')}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}
