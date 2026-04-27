import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileProcessor } from '@/hooks/useFileProcessor'
import { useAppContext } from '@/store/AppContext'

export function DropZone() {
  const { state } = useAppContext()
  const { stageFiles } = useFileProcessor()
  const isProcessing = state.phase === 'fetching-rates' || state.phase === 'parsing' || state.phase === 'calculating'

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      stageFiles(acceptedFiles)
    }
  }, [stageFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
    },
    disabled: isProcessing,
    multiple: true,
  })

  if (isProcessing) {
    return (
      <div className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center bg-blue-50">
        <div className="flex flex-col items-center gap-3 text-blue-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-medium text-sm">{state.parseProgress}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2 text-gray-500">
        <Upload className={cn('w-7 h-7', isDragActive ? 'text-blue-500' : 'text-gray-400')} />
        {isDragActive ? (
          <p className="font-medium text-blue-600 text-sm">Suelta los archivos aquí…</p>
        ) : (
          <>
            <p className="font-medium text-gray-700 text-sm">
              {state.stagedFiles.length > 0 ? 'Añadir más archivos' : 'Arrastra los archivos aquí'}
            </p>
            <p className="text-xs text-gray-400">o haz clic para seleccionar</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">.csv</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">.xml</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
