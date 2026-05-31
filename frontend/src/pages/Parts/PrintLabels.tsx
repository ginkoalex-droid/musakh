import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchParts } from '../../api/parts'
import JsBarcode from 'jsbarcode'

export default function PrintLabels() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const ids = params.get('ids')?.split(',').map(Number) || []

  const { data: allParts = [], isLoading } = useQuery({
    queryKey: ['parts-for-print', ids.join(',')],
    queryFn: async () => {
      const parts = await fetchParts()
      return parts.filter(p => ids.includes(p.id))
    },
    enabled: ids.length > 0,
  })

  const barcodeRefs = useRef<Map<string, SVGSVGElement>>(new Map())

  useEffect(() => {
    if (allParts.length === 0) return
    barcodeRefs.current.forEach((el, code) => {
      if (el) {
        try {
          JsBarcode(el, code, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            displayValue: true,
            fontSize: 9,
            margin: 4,
          })
        } catch {}
      }
    })
  }, [allParts])

  useEffect(() => {
    if (!isLoading && allParts.length > 0) {
      setTimeout(() => window.print(), 500)
    }
  }, [isLoading, allParts.length])

  if (isLoading) return <div className="p-8 text-center">Подготовка...</div>

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 8mm; size: A4 portrait; }
        }
        .label {
          width: 63mm;
          height: 38mm;
          border: 0.3mm solid #ccc;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2mm;
          box-sizing: border-box;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .label-name {
          font-size: 7pt;
          font-weight: bold;
          text-align: center;
          line-height: 1.2;
          max-height: 12mm;
          overflow: hidden;
          word-break: break-word;
        }
        #print-area {
          display: flex;
          flex-wrap: wrap;
          gap: 1mm;
          padding: 2mm;
        }
      `}</style>

      <div className="p-4 print:hidden flex gap-3 items-center mb-4">
        <button onClick={() => window.print()} className="btn-primary">🖨 Печать</button>
        <button onClick={() => navigate(-1)} className="btn-secondary">Назад</button>
        <span className="text-sm text-gray-500">{allParts.length} этикеток · A4 · 5×7</span>
      </div>

      <div id="print-area">
        {allParts.map(part => {
          const barcode = part.barcodes[0]?.barcode
          if (!barcode) return null
          return (
            <div key={part.id} className="label">
              <svg ref={el => { if (el) barcodeRefs.current.set(barcode, el) }} />
              <div className="label-name">{part.name}</div>
            </div>
          )
        })}
      </div>
    </>
  )
}
