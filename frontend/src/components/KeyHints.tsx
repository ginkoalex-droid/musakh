interface Hint {
  key: string
  label: string
}

export default function KeyHints({ hints }: { hints: Hint[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-400 pt-2 border-t border-gray-100">
      {hints.map(h => (
        <span key={h.key} className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-300 font-mono text-xs">
            {h.key}
          </kbd>
          {h.label}
        </span>
      ))}
    </div>
  )
}
