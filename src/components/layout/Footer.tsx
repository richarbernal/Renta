export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-6 text-xs text-gray-500 space-y-2">
        <p className="font-medium text-gray-600">Aviso legal importante</p>
        <p>
          Esta herramienta tiene carácter meramente informativo y orientativo. Los cálculos son una estimación basada
          en los datos del informe de Interactive Brokers y las normas generales del IRPF 2024. No constituye
          asesoramiento fiscal ni jurídico.
        </p>
        <p>
          Verifica siempre los resultados con un asesor fiscal o con los datos de la Agencia Tributaria.
          Los tipos y casillas pueden variar según tu comunidad autónoma, situación familiar y otras circunstancias personales.
        </p>
        <p className="pt-2 text-gray-400">
          Software libre. Todo el procesamiento ocurre localmente en tu navegador. Ningún dato financiero sale de tu dispositivo.
        </p>
      </div>
    </footer>
  )
}
