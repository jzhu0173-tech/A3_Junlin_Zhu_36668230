import { jsPDF } from 'jspdf'
import { escapeCsvValue } from './security'

export function downloadCsv(filename, rows) {
  if (!rows.length) {
    return false
  }

  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export function downloadPdf(filename, title, sections) {
  const pdf = new jsPDF()
  let y = 18

  pdf.setFontSize(18)
  pdf.text(title, 14, y)
  y += 10

  pdf.setFontSize(11)

  sections.forEach((section) => {
    if (y > 270) {
      pdf.addPage()
      y = 18
    }

    pdf.setFont(undefined, 'bold')
    pdf.text(section.heading, 14, y)
    y += 7
    pdf.setFont(undefined, 'normal')

    const lines = pdf.splitTextToSize(section.body, 180)
    lines.forEach((line) => {
      if (y > 280) {
        pdf.addPage()
        y = 18
      }
      pdf.text(line, 14, y)
      y += 6
    })

    y += 4
  })

  pdf.save(filename)
}
