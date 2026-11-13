import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { extractCvText } from './cvDocumentParser.js'

function createDocx(documentXml) {
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(documentXml),
  }, { level: 6 }))
}

test('extracts paragraph, tab, and line-break text from DOCX', async () => {
  const document = createDocx(
    '<w:document><w:body><w:p><w:r><w:t>First &amp; foremost</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Second</w:t><w:tab/><w:t>line</w:t></w:r><w:br/><w:t>Next</w:t></w:p>'
    + '</w:body></w:document>',
  )

  assert.equal(await extractCvText(document, '.docx'), 'First & foremost\nSecond\tline\nNext')
})

test('rejects invalid DOCX archives and archives without a document body', async () => {
  await assert.rejects(extractCvText(Buffer.from('not a zip'), '.docx'), /valid DOCX/)
  const missingBody = Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>') }))
  await assert.rejects(extractCvText(missingBody, '.docx'), /document content could not be found/)
})

test('rejects oversized expanded DOCX document XML', async () => {
  const oversizedDocument = createDocx(`<w:document><w:t>${'A'.repeat(4 * 1024 * 1024 + 1)}</w:t></w:document>`)
  await assert.rejects(extractCvText(oversizedDocument, '.docx'), /too large to analyze/)
})

test('rejects unsupported and invalid PDF inputs', async () => {
  await assert.rejects(extractCvText(Buffer.from('document'), '.pdf'), /valid PDF/)
  await assert.rejects(extractCvText(Buffer.from('document'), '.txt'), /Only PDF and DOCX/)
})
