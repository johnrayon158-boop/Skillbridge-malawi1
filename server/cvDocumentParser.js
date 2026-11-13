import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

function decodeXmlEntities(text) {
  const namedEntities = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, value) => {
    if (!value.startsWith('#')) return namedEntities[value.toLowerCase()] || entity
    const codePoint = value[1].toLowerCase() === 'x'
      ? Number.parseInt(value.slice(2), 16)
      : Number.parseInt(value.slice(1), 10)
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : ''
  })
}

function docxXmlToText(xml) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractDocxText(fileBuffer) {
  if (fileBuffer.subarray(0, 2).toString('ascii') !== 'PK') {
    return Promise.reject(new Error('The uploaded file is not a valid DOCX document.'))
  }

  return new Promise((resolve, reject) => {
    const chunks = []
    let documentFound = false
    let settled = false
    let documentSize = 0
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    const unzip = new Unzip((file) => {
      if (file.name !== 'word/document.xml') return
      documentFound = true
      file.ondata = (error, chunk, final) => {
        if (settled) return
        if (error) {
          fail(error)
          return
        }
        documentSize += chunk.length
        if (documentSize > 4 * 1024 * 1024) {
          file.terminate()
          fail(new Error('The DOCX document content is too large to analyze.'))
          return
        }
        chunks.push(Buffer.from(chunk))
        if (final) {
          settled = true
          resolve(docxXmlToText(Buffer.concat(chunks).toString('utf8')))
        }
      }
      try {
        file.start()
      } catch (error) {
        fail(error)
      }
    })
    unzip.register(UnzipPassThrough)
    unzip.register(UnzipInflate)
    try {
      unzip.push(fileBuffer, true)
      if (!documentFound) fail(new Error('The DOCX document content could not be found.'))
    } catch (error) {
      fail(error)
    }
  })
}

export async function extractCvText(fileBuffer, extension) {
  if (extension === '.pdf') {
    if (fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('The uploaded file is not a valid PDF.')
    }
    const result = await pdfParse(fileBuffer)
    return result.text || ''
  }

  if (extension === '.docx') return extractDocxText(fileBuffer)
  throw new Error('Only PDF and DOCX CV files are supported.')
}
