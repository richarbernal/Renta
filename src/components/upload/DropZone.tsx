import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileProcessor } from '@/hooks/useFileProcessor'
import { useAppContext } from '@/store/AppContext'

export function DropZone() {
  const { state } = useAppContext()
  const { processFiles } = useFileProcessor()
  const isLoading = state.phase === 'parsing' || state.phase === 'calculating'

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processFiles(acceptedFiles)
    }
  }, [processFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/xml': ['.xml'],
      'application/xml': ['.xml'],
    },
    disabled: isLoading,
    multiple: true,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
        isLoading && 'opacity-60 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 text-blue-600">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="font-medium">{state.parseProgress}</p>
        </div>
      ) : isDragActive ? (
        <div className="flex flex-col items-center gap-3 text-blue-600">
          <Upload className="w-10 h-10" />
          <p className="font-medium">Suelta el archivo aquí…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="flex gap-2">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-700">Arrastra tu informe de IBKR aquí</p>
            <p className="text-sm mt-1">o haz clic para seleccionar el archivo</p>
          </div>
          <div className="flex gap-2 mt-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-mono">.csv</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-mono">.xml</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Activity Statement (CSV) · Flex Query (XML)</p>
        </div>
      )}
    </div>
  )
}
