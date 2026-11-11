// Utilidades CSV compartidas por la ficha del arma y los reportes.
// Formato: BOM UTF-8 para Excel, separador coma, saltos CRLF y todas las celdas entre comillas.

// Antepone ' a los valores que una planilla interpretaría como fórmula (=, +, @, -).
export function csvCell(value) {
  let text = String(value ?? '')
  if (/^[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function toCsv(rows) {
  return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
