import { useAppContext } from '@/store/AppContext'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { UploadPage } from '@/components/upload/UploadPage'
import { ResultsTabs } from '@/components/results/ResultsTabs'

export function App() {
  const { state } = useAppContext()
  const showResults = state.phase === 'ready' && state.results !== null

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {showResults
          ? <ResultsTabs results={state.results!} />
          : <UploadPage />
        }
      </main>

      <Footer />
    </div>
  )
}
