import { NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'
import { readSheet } from 'read-excel-file/node'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CellValue = string | number | boolean | Date | null | undefined
type SheetRow = CellValue[]

type ParsedItem = {
  sectionName: string
  cardNumber: string
  playerName: string
  printedTeam: string | null
  rookieFlag: boolean
  autoFlag: boolean
  relicFlag: boolean
  serialFlag: boolean
  printRun: number | null
  variation: string | null
  parallelName: string | null
  notes: string | null
  sortOrder: number
  people: Array<{
    playerName: string
    printedTeam: string | null
    sortOrder: number
  }>
}

type TeamRow = {
  sectionName: string
  cardNumber: string
  playerName: string
  printedTeam: string
}

type ImportStats = {
  totalRowsSeen: number
  normalizedRows: number
  insertedRows: number
  skippedRows: number
  sectionsCreated: number
  checklistItemsCreated: number
  teamRowsSeen: number
  errors: string[]
}

type ProductMetadata = {
  category: string
  sportOrGame: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  productName: string
  editionName: string | null
  displayName: string
  productKey: string
}

type GenericMapping = {
  sectionName: number | null
  cardNumber: number | null
  playerName: number | null
  printedTeam: number | null
  rookieFlag: number | null
  autoFlag: number | null
  relicFlag: number | null
  serialFlag: number | null
  printRun: number | null
  variation: number | null
  parallelName: number | null
  notes: number | null
}

type ProductMetadataOverride = {
  year?: string
  manufacturer?: string
  brand?: string
  productName?: string
}

type GenericMetadataInput = {
  category?: string
  sportOrGame?: string
  year?: string
  manufacturer?: string
  brand?: string
  productName?: string
  editionName?: string
}

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 2000
const MAX_EXPANDED_BYTES = 60 * 1024 * 1024
const MAX_SINGLE_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 200
const INSERT_BATCH_SIZE = 250
const GENERIC_PREVIEW_ROWS = 20
const MAX_GENERIC_ROWS = 50000

const CHECKLIST_SOURCE_PRIORITY: Record<string, number> = {
  generic: 100,
  manufacturer: 150,
  checklist_insider: 200,
  beckett: 300,
}

function checklistSourcePriority(sourceType: string | null | undefined) {
  return CHECKLIST_SOURCE_PRIORITY[normalizedKey(String(sourceType ?? ''))] ?? 0
}

function sourceLabel(sourceType: string | null | undefined) {
  const value = normalizedKey(String(sourceType ?? ''))

  if (value === 'beckett') return 'Beckett'
  if (value === 'checklist_insider') return 'Checklist Insider'
  if (value === 'manufacturer') return 'Manufacturer'
  if (value === 'generic') return 'Structured XLSX'

  return String(sourceType ?? 'Unknown source')
}


function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function readZipEntry(buffer: Buffer, wantedName: string) {
  const CENTRAL_FILE_SIGNATURE = 0x02014b50
  const LOCAL_FILE_SIGNATURE = 0x04034b50
  const EOCD_SIGNATURE = 0x06054b50
  const minimumEocdSize = 22
  const maximumCommentSize = 0xffff

  let eocdOffset = -1
  const searchStart = Math.max(
    0,
    buffer.length - minimumEocdSize - maximumCommentSize
  )

  for (
    let offset = buffer.length - minimumEocdSize;
    offset >= searchStart;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocdOffset = offset
      break
    }
  }

  if (eocdOffset < 0) return null

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)

  let cursor = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== CENTRAL_FILE_SIGNATURE
    ) {
      return null
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)

    const fileNameStart = cursor + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const fileName = buffer
      .subarray(fileNameStart, fileNameEnd)
      .toString('utf8')
      .replace(/\\/g, '/')

    if (fileName === wantedName) {
      if (
        localHeaderOffset + 30 > buffer.length ||
        buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE
      ) {
        return null
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
      const dataStart =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength
      const dataEnd = dataStart + compressedSize

      if (dataEnd > buffer.length) return null

      const compressed = buffer.subarray(dataStart, dataEnd)

      if (compressionMethod === 0) {
        return Buffer.from(compressed)
      }

      if (compressionMethod === 8) {
        return inflateRawSync(compressed)
      }

      return null
    }

    cursor += 46 + fileNameLength + extraLength + commentLength
  }

  return null
}

function readWorkbookSheetNames(buffer: Buffer) {
  const workbookXml = readZipEntry(buffer, 'xl/workbook.xml')
  if (!workbookXml) {
    throw new Error('The XLSX workbook metadata could not be read.')
  }

  const xml = workbookXml.toString('utf8')
  const names: string[] = []
  // XLSX producers may namespace worksheet elements (for example <x:sheet>)
  // and may use either single or double quotes for XML attributes.
  const pattern = /<(?:[A-Za-z_][\w.-]*:)?sheet\b[^>]*\bname=(["'])(.*?)\1/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    const name = decodeXmlEntities(match[2]).trim()
    if (name) names.push(name)
  }

  if (names.length === 0) {
    throw new Error('The XLSX workbook does not contain any readable worksheets.')
  }

  return names
}

function newStats(): ImportStats {
  return {
    totalRowsSeen: 0,
    normalizedRows: 0,
    insertedRows: 0,
    skippedRows: 0,
    sectionsCreated: 0,
    checklistItemsCreated: 0,
    teamRowsSeen: 0,
    errors: [],
  }
}

function validateXlsxArchive(buffer: Buffer) {
  const EOCD_SIGNATURE = 0x06054b50
  const CENTRAL_FILE_SIGNATURE = 0x02014b50
  const ZIP64_SENTINEL_16 = 0xffff
  const ZIP64_SENTINEL_32 = 0xffffffff

  const minimumEocdSize = 22
  const maximumCommentSize = 0xffff

  if (buffer.length < minimumEocdSize) {
    throw new Error('The uploaded file is not a valid XLSX archive.')
  }

  const searchStart = Math.max(
    0,
    buffer.length - minimumEocdSize - maximumCommentSize
  )

  let eocdOffset = -1

  for (
    let offset = buffer.length - minimumEocdSize;
    offset >= searchStart;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocdOffset = offset
      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error('The uploaded file is not a valid XLSX ZIP archive.')
  }

  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8)
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)

  if (
    entriesOnDisk === ZIP64_SENTINEL_16 ||
    totalEntries === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error('ZIP64 XLSX archives are not accepted by this importer.')
  }

  if (entriesOnDisk !== totalEntries) {
    throw new Error('Multi-disk XLSX archives are not accepted.')
  }

  if (totalEntries <= 0 || totalEntries > MAX_ARCHIVE_ENTRIES) {
    throw new Error(
      `The XLSX archive contains an unexpected number of files (${totalEntries}).`
    )
  }

  if (
    centralDirectoryOffset < 0 ||
    centralDirectorySize < 0 ||
    centralDirectoryOffset + centralDirectorySize > buffer.length
  ) {
    throw new Error('The XLSX archive directory is invalid.')
  }

  let cursor = centralDirectoryOffset
  let totalCompressedBytes = 0
  let totalExpandedBytes = 0

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length) {
      throw new Error('The XLSX archive directory is truncated.')
    }

    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('The XLSX archive contains an invalid directory entry.')
    }

    const flags = buffer.readUInt16LE(cursor + 8)
    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const expandedSize = buffer.readUInt32LE(cursor + 24)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)

    if (
      compressedSize === ZIP64_SENTINEL_32 ||
      expandedSize === ZIP64_SENTINEL_32
    ) {
      throw new Error('ZIP64 XLSX entries are not accepted.')
    }

    if ((flags & 0x0001) !== 0) {
      throw new Error('Encrypted XLSX archives are not accepted.')
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(
        `Unsupported XLSX ZIP compression method (${compressionMethod}).`
      )
    }

    if (expandedSize > MAX_SINGLE_ENTRY_BYTES) {
      throw new Error(
        'The XLSX archive contains an individual file that expands beyond the safety limit.'
      )
    }

    totalCompressedBytes += compressedSize
    totalExpandedBytes += expandedSize

    if (totalExpandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error(
        'The XLSX archive expands beyond the checklist import safety limit.'
      )
    }

    cursor += 46 + fileNameLength + extraLength + commentLength

    if (cursor > centralDirectoryOffset + centralDirectorySize) {
      throw new Error('The XLSX archive directory is malformed.')
    }
  }

  if (
    totalCompressedBytes > 0 &&
    totalExpandedBytes / totalCompressedBytes > MAX_COMPRESSION_RATIO
  ) {
    throw new Error(
      'The XLSX archive has an unsafe compression ratio and was rejected.'
    )
  }
}

function text(value: CellValue) {
  return String(value ?? '').trim()
}

function cleanPlayer(value: CellValue) {
  return text(value).replace(/,\s*$/, '').trim()
}

function normalizedKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function itemKey(sectionName: string, cardNumber: string, playerName: string) {
  return [
    normalizedKey(sectionName),
    normalizedKey(cardNumber),
    normalizedKey(playerName),
  ].join('||')
}

function isCountRow(value: string) {
  return /^\d[\d,]*\s+cards?[.!:]?$/i.test(value.trim())
}

function isSectionHeader(row: SheetRow) {
  const first = text(row[0])

  if (!first || isCountRow(first) || !isTrustworthySectionHeading(first)) {
    return false
  }

  return !text(row[1]) && !text(row[2]) && !text(row[3]) && !text(row[4])
}

function sectionType(sectionName: string) {
  const value = normalizedKey(sectionName)

  if (value.includes('autograph')) return 'autograph'
  if (value.includes('prospect')) return 'prospect'
  if (value.includes('variation')) return 'variation'
  if (value === 'base set' || value === 'base') return 'base'

  return 'insert'
}

function flagsFromRow(sectionName: string, marker: string) {
  const combined = `${sectionName} ${marker}`.toLowerCase()

  return {
    rookieFlag:
      /\brc\b/.test(marker.toLowerCase()) || combined.includes('rookie'),
    autoFlag: combined.includes('autograph') || /\bauto\b/.test(combined),
    relicFlag:
      combined.includes('relic') ||
      combined.includes('patch') ||
      combined.includes('memorabilia'),
    serialFlag:
      /\/\s*\d+/.test(marker) ||
      combined.includes('numbered') ||
      combined.includes('serial'),
  }
}

function parsePrintRun(marker: string) {
  const match = marker.match(/\/\s*(\d+)/)
  if (!match) return null

  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseExplicitPrintRun(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return null

  const slash = cleaned.match(/\/\s*(\d+)/)
  const numeric = slash?.[1] ?? cleaned.replace(/[^0-9]/g, '')
  if (!numeric) return null

  const parsed = Number(numeric)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function splitPeople(playerName: string, printedTeam: string | null) {
  const players = playerName
    .split('/')
    .map((value) => value.trim())
    .filter(Boolean)

  if (players.length <= 1) return []

  const teams = String(printedTeam ?? '')
    .split('/')
    .map((value) => value.trim())
    .filter(Boolean)

  return players.map((player, index) => ({
    playerName: player,
    printedTeam:
      teams.length === players.length ? teams[index] || null : printedTeam,
    sortOrder: index + 1,
  }))
}

function looksLikeMasterChecklistRows(rows: SheetRow[]) {
  let matches = 0

  for (const row of rows.slice(0, 300)) {
    const sectionName = text(row[0])
    const cardNumber = text(row[1])
    const playerName = cleanPlayer(row[2])

    if (
      sectionName &&
      playerName &&
      (looksLikeCardNumber(cardNumber) || cardNumber === '')
    ) {
      matches += 1
    }
  }

  return matches >= 5
}

function looksLikeSectionPlayerTeamRows(rows: SheetRow[]) {
  let matches = 0

  for (const row of rows.slice(0, 500)) {
    const sectionName = text(row[0])
    const playerName = cleanPlayer(row[1])
    const printedTeam = text(row[2])

    if (
      sectionName &&
      playerName &&
      printedTeam &&
      !looksLikeCardNumber(playerName) &&
      (looksLikeBaseballTeam(printedTeam) || looksLikePersonName(playerName))
    ) {
      matches += 1
    }
  }

  return matches >= 5
}

function parseSectionPlayerTeamRows(rows: SheetRow[], stats: ImportStats) {
  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let sortOrder = 0

  for (const row of rows) {
    stats.totalRowsSeen += 1

    const sectionName = text(row[0])
    const playerName = cleanPlayer(row[1])
    const printedTeam = text(row[2]) || null
    const marker = text(row[3])

    if (!sectionName || !playerName || !printedTeam) continue
    if (!isTrustworthySectionHeading(sectionName)) continue
    if (looksLikeHeaderRow(row)) continue

    const key = itemKey(sectionName, '', playerName)
    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)

    const normalizedSection = normalizedKey(sectionName)
    if (!seenSections.has(normalizedSection)) {
      seenSections.add(normalizedSection)
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, marker)

    items.push({
      sectionName,
      cardNumber: '',
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: normalizedSection.includes('variation') ? sectionName : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  return { sections, items }
}

function parseMasterChecklist(rows: SheetRow[], stats: ImportStats) {
  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let sortOrder = 0

  for (const row of rows) {
    stats.totalRowsSeen += 1

    const sectionName = text(row[0])
    const cardNumber = text(row[1])
    const playerName = cleanPlayer(row[2])
    const printedTeam = text(row[3]) || null
    const marker = text(row[4])

    if (!sectionName || !playerName || isCountRow(cardNumber)) continue

    if (
      normalizedKey(sectionName) === 'section' &&
      /player|athlete|name/i.test(playerName)
    ) {
      continue
    }

    const key = itemKey(sectionName, cardNumber, playerName)
    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)

    if (!seenSections.has(normalizedKey(sectionName))) {
      seenSections.add(normalizedKey(sectionName))
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, marker)

    items.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: normalizedKey(sectionName).includes('variation')
        ? sectionName
        : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  return { sections, items }
}

function parseFullChecklist(rows: SheetRow[], stats: ImportStats) {
  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()

  let currentSection = ''
  let sortOrder = 0

  for (const row of rows) {
    stats.totalRowsSeen += 1

    if (isSectionHeader(row)) {
      currentSection = text(row[0])

      if (!seenSections.has(currentSection)) {
        seenSections.add(currentSection)
        sections.push(currentSection)
      }

      continue
    }

    const cardNumber = text(row[0])
    const playerName = cleanPlayer(row[1])
    const printedTeam = text(row[2]) || null
    const marker = text(row[3])

    // Beckett does not always assign a card number to autograph/insert rows.
    // A real player row is still valid when the card-number cell is blank.
    if (!currentSection || !playerName) {
      continue
    }

    if (isCountRow(cardNumber)) {
      continue
    }

    const key = itemKey(currentSection, cardNumber, playerName)

    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)
    sortOrder += 1

    const flags = flagsFromRow(currentSection, marker)

    items.push({
      sectionName: currentSection,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: normalizedKey(currentSection).includes('variation')
        ? currentSection
        : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  return { sections, items }
}

function parseTeamSets(rows: SheetRow[], stats: ImportStats) {
  const teamRows: TeamRow[] = []

  // Beckett uses two closely related team-index layouts:
  //
  // Classic Team Sets:
  //   Section | Card # | Player | Team
  //
  // Newer Teams:
  //   Index | Section | Card # | Player | Team | Detail
  //
  // Detect the newer form by structure instead of worksheet name so the
  // proven classic parser remains unchanged for existing workbooks.
  const sample = rows
    .slice(0, 200)
    .filter((row) => row.some((value) => text(value)))

  const indexedLayoutMatches = sample.filter((row) => {
    const indexValue = text(row[0])
    const sectionName = text(row[1])
    const cardNumber = text(row[2])
    const playerName = cleanPlayer(row[3])
    const printedTeam = text(row[4])

    return (
      /^\d+$/.test(indexValue) &&
      Boolean(sectionName) &&
      (cardNumber === '' || looksLikeCardNumber(cardNumber)) &&
      Boolean(playerName) &&
      Boolean(printedTeam)
    )
  }).length

  const useIndexedTeamsLayout =
    sample.length >= 5 &&
    indexedLayoutMatches >= Math.max(5, Math.floor(sample.length * 0.6))

  for (const row of rows) {
    const sectionName = text(row[useIndexedTeamsLayout ? 1 : 0])
    const cardNumber = text(row[useIndexedTeamsLayout ? 2 : 1])
    const playerName = cleanPlayer(row[useIndexedTeamsLayout ? 3 : 2])
    const printedTeam = text(row[useIndexedTeamsLayout ? 4 : 3])

    if (!sectionName || !playerName || !printedTeam) {
      continue
    }

    teamRows.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
    })
  }

  stats.teamRowsSeen = teamRows.length
  return teamRows
}

function applyTeamSetData(items: ParsedItem[], teamRows: TeamRow[]) {
  const exact = new Map<string, TeamRow>()

  for (const row of teamRows) {
    exact.set(itemKey(row.sectionName, row.cardNumber, row.playerName), row)
  }

  let matched = 0

  for (const item of items) {
    const direct = exact.get(
      itemKey(item.sectionName, item.cardNumber, item.playerName)
    )

    if (!direct) continue

    item.printedTeam = direct.printedTeam
    item.people = splitPeople(item.playerName, direct.printedTeam)
    matched += 1
  }

  return matched
}

function inferProductMetadata(fileName: string): ProductMetadata {
  const base = fileName
    .replace(/\.xlsx$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const yearMatch = base.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch?.[0] ?? null

  const withoutYear = year ? base.replace(year, '').trim() : base
  const withoutChecklist = withoutYear
    .replace(/\bchecklist\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  const category = 'Sports Cards'
  const sportOrGame = 'Baseball'
  const manufacturer =
    /\b(topps|bowman)\b/i.test(base)
      ? 'Topps'
      : /\bpanini\b/i.test(base)
        ? 'Panini'
        : null

  const brand =
    /\bbowman\b/i.test(base)
      ? 'Bowman'
      : /\btopps chrome\b/i.test(base)
        ? 'Topps Chrome'
        : /\bprizm\b/i.test(base)
          ? 'Prizm'
          : /\bdonruss\b/i.test(base)
            ? 'Donruss'
            : /\btopps\b/i.test(base)
              ? 'Topps'
              : null

  let cleanedProductName =
    withoutChecklist.replace(/\bbaseball\b/gi, 'Baseball').trim()

  if (manufacturer && brand && normalizedKey(manufacturer) !== normalizedKey(brand)) {
    cleanedProductName = cleanedProductName
      .replace(new RegExp(`^${manufacturer}\\s+`, 'i'), '')
      .trim()
  }

  // Preserve release-defining product modifiers. Bowman Draft, Bowman Chrome,
  // Mega Box, Sapphire, Logofractor, Update, etc. are distinct products and
  // must never collapse into the parent brand simply because they share a year.
  if (/\bbowman\s+draft\b/i.test(withoutChecklist)) {
    cleanedProductName = /\bbaseball\b/i.test(cleanedProductName)
      ? cleanedProductName
      : `${cleanedProductName} Baseball`.trim()
  }

  const productName = cleanedProductName || 'Imported Checklist'

  const displayName =
    [year, productName].filter(Boolean).join(' ').trim() ||
    'Imported Checklist'

  const editionName = /\bmega box\b/i.test(productName) ? 'Mega Box' : null

  const productKey = buildProductKey({
    category,
    sportOrGame,
    year,
    manufacturer,
    brand,
    productName,
    editionName,
  }).productKey

  return {
    category,
    sportOrGame,
    year,
    manufacturer,
    brand,
    productName,
    editionName,
    displayName,
    productKey,
  }
}

function buildProductKey(input: {
  category: string
  sportOrGame: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  productName: string
  editionName: string | null
}): ProductMetadata {
  const displayName = [input.year, input.productName]
    .filter(Boolean)
    .join(' ')
    .trim()

  const productKey = [
    'cards',
    normalizedKey(input.sportOrGame),
    normalizedKey(input.year ?? ''),
    normalizedKey(input.manufacturer ?? ''),
    normalizedKey(input.brand ?? ''),
    normalizedKey(input.productName),
    normalizedKey(displayName),
  ].join('|')

  return {
    ...input,
    displayName,
    productKey,
  }
}

function applyProductMetadataOverride(
  metadata: ProductMetadata,
  override: ProductMetadataOverride | null | undefined
) {
  if (!override) return metadata

  const year = text(override.year) || metadata.year
  const manufacturer = text(override.manufacturer) || metadata.manufacturer
  const brand = text(override.brand) || metadata.brand
  const productName = text(override.productName) || metadata.productName

  return buildProductKey({
    category: metadata.category,
    sportOrGame: metadata.sportOrGame,
    year,
    manufacturer,
    brand,
    productName,
    editionName: metadata.editionName,
  })
}

function parseCsv(input: string): SheetRow[] {
  const rows: SheetRow[] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const normalized = input.replace(/^\uFEFF/, '')

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]

    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && normalized[index + 1] === '\n') {
        index += 1
      }

      row.push(field)
      field = ''

      if (row.some((value) => value.trim() !== '')) {
        rows.push(row)
      }

      row = []
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((value) => value.trim() !== '')) {
    rows.push(row)
  }

  return rows
}

function safeBoolean(value: string) {
  const normalized = normalizedKey(value)
  if (!normalized) return false

  return [
    '1',
    'true',
    'yes',
    'y',
    'x',
    'rc',
    'rookie',
    'auto',
    'autograph',
    'relic',
    'serial',
    'numbered',
  ].includes(normalized)
}

function cellAt(row: SheetRow, index: number | null) {
  if (index === null || index < 0) return ''
  return text(row[index])
}

function isDescriptiveParallelHeading(value: string) {
  const candidate = normalizedKey(value)
  if (!candidate) return false

  return (
    /\b1\s*\/\s*1\b/.test(candidate) ||
    /(?:^|\s)\/\s*\d+\b/.test(candidate) ||
    /\bprinting plates?\b/.test(candidate) ||
    /\bparallel(?:s)?\b/.test(candidate) ||
    /\bplatinum\b/.test(candidate) ||
    /\bwood mini\b/.test(candidate) ||
    /\bglossy\b/.test(candidate) ||
    /\bfoilfractor\b/.test(candidate) ||
    /\bsuperfractor\b/.test(candidate) ||
    /\brefractor(?:s)?\b/.test(candidate) ||
    /\bnumbered to\b/.test(candidate) ||
    /\bodds\b/.test(candidate) ||
    /\bhobby(?:\s+packs?)?\s+only\b/.test(candidate) ||
    /\bretail(?:\s+packs?)?\s+only\b/.test(candidate) ||
    /\b(?:packs?|boxes?)\s+only\b/.test(candidate)
  )
}

function isTrustworthySectionHeading(value: string) {
  const candidate = value.trim()
  if (!candidate || isCountRow(candidate)) return false
  if (isDescriptiveParallelHeading(candidate)) return false

  if (
    /\b(?:download|spreadsheet|excel)\b/i.test(candidate) ||
    (/\bchecklist\b/i.test(candidate) && /\b(?:19|20)\d{2}\b/.test(candidate))
  ) {
    return false
  }

  return true
}

function parseGenericRows(
  rows: SheetRow[],
  headerRowIndex: number,
  mapping: GenericMapping,
  stats: ImportStats
) {
  if (
    !Number.isInteger(headerRowIndex) ||
    headerRowIndex < -1 ||
    headerRowIndex >= rows.length
  ) {
    throw new Error('Choose a valid header row before importing.')
  }

  const playerNameColumn = mapping.playerName

  if (!Number.isInteger(playerNameColumn) || playerNameColumn === null || playerNameColumn < 0) {
    throw new Error('Player / Item Name must be mapped before importing.')
  }

  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let sortOrder = 0

  const dataRows = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows
  const sectionedLayout = headerRowIndex === -1 && mapping.sectionName === null
  let currentSection = 'Base Set'

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const row = dataRows[rowIndex]
    stats.totalRowsSeen += 1

    const nonBlankValues = row.map((value) => text(value)).filter(Boolean)

    if (sectionedLayout && nonBlankValues.length === 1) {
      const candidate = nonBlankValues[0]

      // A one-cell row can be either a true checklist section or merely a
      // parallel/odds note. Only trustworthy headings are allowed to change
      // the section. Otherwise the cards remain in the current safe section
      // (Base Set by default) and are still organized by printed team.
      if (isTrustworthySectionHeading(candidate)) {
        currentSection = candidate
      }
      continue
    }

    if (looksLikeHeaderRow(row)) continue

    const playerName = cleanPlayer(cellAt(row, playerNameColumn))

    if (!playerName) {
      if (row.some((value) => text(value))) {
        stats.skippedRows += 1
        if (stats.errors.length < 50) {
          const physicalRow =
            headerRowIndex >= 0
              ? headerRowIndex + rowIndex + 2
              : rowIndex + 1
          stats.errors.push(
            `Row ${physicalRow}: skipped because Player / Item Name is blank.`
          )
        }
      }
      continue
    }

    const sectionName =
      cellAt(row, mapping.sectionName) || currentSection || 'Base Set'
    const cardNumber = cellAt(row, mapping.cardNumber)
    const printedTeam = cellAt(row, mapping.printedTeam) || null
    const notes = cellAt(row, mapping.notes) || null
    const variation = cellAt(row, mapping.variation) || null
    const parallelName = cellAt(row, mapping.parallelName) || null

    const inferredFlags = flagsFromRow(
      sectionName,
      [
        notes,
        cellAt(row, mapping.rookieFlag),
        cellAt(row, mapping.autoFlag),
        cellAt(row, mapping.relicFlag),
        cellAt(row, mapping.serialFlag),
      ]
        .filter(Boolean)
        .join(' ')
    )

    const rookieFlag =
      mapping.rookieFlag !== null
        ? safeBoolean(cellAt(row, mapping.rookieFlag))
        : inferredFlags.rookieFlag

    const autoFlag =
      mapping.autoFlag !== null
        ? safeBoolean(cellAt(row, mapping.autoFlag))
        : inferredFlags.autoFlag

    const relicFlag =
      mapping.relicFlag !== null
        ? safeBoolean(cellAt(row, mapping.relicFlag))
        : inferredFlags.relicFlag

    const explicitPrintRun = parseExplicitPrintRun(
      cellAt(row, mapping.printRun)
    )

    const serialFlag =
      mapping.serialFlag !== null
        ? safeBoolean(cellAt(row, mapping.serialFlag))
        : inferredFlags.serialFlag || explicitPrintRun !== null

    const key = itemKey(sectionName, cardNumber, playerName)

    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)

    if (!seenSections.has(normalizedKey(sectionName))) {
      seenSections.add(normalizedKey(sectionName))
      sections.push(sectionName)
    }

    sortOrder += 1

    items.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag,
      autoFlag,
      relicFlag,
      serialFlag,
      printRun: explicitPrintRun,
      variation,
      parallelName,
      notes,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  return { sections, items }
}

async function readGenericRows(uploaded: File) {
  const lowerName = uploaded.name.toLowerCase()

  if (uploaded.size <= 0 || uploaded.size > MAX_FILE_BYTES) {
    throw new Error('The checklist file is empty or larger than the 15 MB import limit.')
  }

  if (lowerName.endsWith('.csv')) {
    const raw = await uploaded.text()
    const rows = parseCsv(raw)

    if (rows.length > MAX_GENERIC_ROWS) {
      throw new Error(
        `The checklist contains more than ${MAX_GENERIC_ROWS.toLocaleString()} rows and was rejected.`
      )
    }

    return { rows, format: 'csv' as const }
  }

  if (lowerName.endsWith('.xlsx')) {
    const buffer = Buffer.from(await uploaded.arrayBuffer())
    validateXlsxArchive(buffer)

    const rawRows = await readSheet(buffer)
    const rows: SheetRow[] = rawRows.map((row) =>
      row.map((value) => {
        if (value === null || value === undefined) return null
        if (value instanceof Date) return value
        if (typeof value === 'number') return value
        if (typeof value === 'boolean') return value
        return String(value)
      })
    )

    if (rows.length > MAX_GENERIC_ROWS) {
      throw new Error(
        `The checklist contains more than ${MAX_GENERIC_ROWS.toLocaleString()} rows and was rejected.`
      )
    }

    return { rows, format: 'xlsx' as const }
  }

  throw new Error('Generic checklist mapping currently accepts .xlsx or .csv files.')
}

function looksLikeHeaderRow(row: SheetRow) {
  const values = row.map((value) => normalizedKey(text(value))).filter(Boolean)
  if (values.length < 2) return false

  const headerWords = [
    /card.*number/,
    /^card #$/,
    /^number$/,
    /^no\.?$/,
    /player/,
    /athlete/,
    /^name$/,
    /^team$/,
    /club/,
    /rookie/,
    /^rc$/,
    /section/,
    /subset/,
  ]

  const matches = values.filter((value) =>
    headerWords.some((pattern) => pattern.test(value))
  ).length

  return matches >= 2
}

function guessHeaderRowIndex(rows: SheetRow[]) {
  const candidates = rows.slice(0, 20)

  for (let index = 0; index < candidates.length; index += 1) {
    if (looksLikeHeaderRow(candidates[index])) return index
  }

  // Some publisher spreadsheets (including Topps downloads) are sectioned
  // lists with no dedicated header row. Returning -1 preserves the first card
  // row and lets the mapper use synthetic Column 1 / Column 2 labels.
  return -1
}

function buildSyntheticHeaders(rows: SheetRow[]) {
  const width = Math.max(
    1,
    ...rows.slice(0, 100).map((row) => row.length)
  )

  return Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
}

function looksLikeCardNumber(value: string) {
  const cleaned = value.trim()
  if (!cleaned) return false

  // Card numbers are not always numeric. Modern checklists commonly use
  // identifiers such as US1, 89ASA-ABE, OCMC, RR-07, CPA-GJ, etc.
  // Keep this structural rather than product-specific: short, compact codes
  // with no spaces are strong card-number candidates, especially when they
  // contain a digit, hyphen, or are fully uppercase.
  if (/^#?\d{1,6}$/.test(cleaned)) return true

  if (!/^[A-Za-z0-9]{1,14}(?:-[A-Za-z0-9]{1,14}){0,3}$/.test(cleaned)) {
    return false
  }

  return /\d/.test(cleaned) || cleaned.includes('-') || cleaned === cleaned.toUpperCase()
}

function looksLikeNaturalText(value: string) {
  const cleaned = value.trim()
  if (!cleaned || looksLikeCardNumber(cleaned)) return false
  if (/^(?:RC|Rookie|SP|SSP|Auto|Autograph|Relic)$/i.test(cleaned)) return false
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cleaned)) return false

  const words = cleaned
    .replace(/[.,'’()&\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return words.length >= 1 && words.length <= 8
}

function averageWordCount(values: string[]) {
  if (values.length === 0) return 0

  const total = values.reduce((sum, value) => {
    const words = value
      .trim()
      .replace(/[.,'’()&\-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    return sum + words.length
  }, 0)

  return total / values.length
}

function normalizedColumnValues(rows: SheetRow[], column: number, limit = 2500) {
  const values: string[] = []

  for (const row of rows.slice(0, limit)) {
    if (looksLikeHeaderRow(row)) continue
    const value = text(row[column])
    if (!value) continue
    values.push(normalizedKey(value))
  }

  return values
}

function distinctColumnValues(rows: SheetRow[], column: number, limit = 2500) {
  return new Set(normalizedColumnValues(rows, column, limit))
}

function columnOverlapScore(
  leftRows: SheetRow[],
  leftColumn: number,
  rightRows: SheetRow[],
  rightColumn: number
) {
  const left = distinctColumnValues(leftRows, leftColumn)
  const right = distinctColumnValues(rightRows, rightColumn)

  if (left.size === 0 || right.size === 0) return 0

  let matches = 0
  for (const value of left) {
    if (right.has(value)) matches += 1
  }

  return matches / Math.max(1, Math.min(left.size, right.size))
}

function columnCardNumberRatio(rows: SheetRow[], column: number) {
  const values = rows
    .slice(0, 1200)
    .map((row) => text(row[column]))
    .filter(Boolean)

  if (values.length === 0) return 0
  return values.filter(looksLikeCardNumber).length / values.length
}

function columnNaturalTextRatio(rows: SheetRow[], column: number) {
  const values = rows
    .slice(0, 1200)
    .map((row) => text(row[column]))
    .filter(Boolean)

  if (values.length === 0) return 0
  return values.filter(looksLikeNaturalText).length / values.length
}

function columnDistinctRatio(rows: SheetRow[], column: number) {
  const values = normalizedColumnValues(rows, column, 1200)
  if (values.length === 0) return 0
  return new Set(values).size / values.length
}

type PairedIndexProfile = {
  masterSheetName: string
  teamsSheetName: string
  sectionColumn: number
  cardNumberColumn: number | null
  personColumns: number[]
  personMode: 'single' | 'split_name' | 'multi_person'
  teamColumn: number
  markerColumns: number[]
  confidence: number
}

function looksLikeParentAffiliateTeamIndex(rows: SheetRow[]) {
  const sample = rows
    .slice(0, 500)
    .filter((row) => row.filter((value) => text(value)).length >= 5)

  if (sample.length < 10) return false

  const cardRatio = sample.filter((row) => looksLikeCardNumber(text(row[1]))).length / sample.length
  const playerRatio = sample.filter((row) => looksLikeNaturalText(text(row[2]))).length / sample.length
  const affiliateRatio = sample.filter((row) => looksLikeNaturalText(text(row[3]))).length / sample.length
  const parentRatio = sample.filter((row) => looksLikeNaturalText(text(row[5]))).length / sample.length

  if (cardRatio < 0.6 || playerRatio < 0.6 || affiliateRatio < 0.5 || parentRatio < 0.5) {
    return false
  }

  const affiliateValues = sample.map((row) => normalizedKey(text(row[3]))).filter(Boolean)
  const parentValues = sample.map((row) => normalizedKey(text(row[5]))).filter(Boolean)
  const affiliateDistinct = new Set(affiliateValues).size
  const parentDistinct = new Set(parentValues).size

  // A parent organization normally groups one or more immediate affiliations.
  // This relationship is structural: no MLB/MiLB dictionary is required.
  return parentDistinct > 0 && parentDistinct <= affiliateDistinct
}

function parseParentAffiliateTeamIndex(rows: SheetRow[], stats: ImportStats) {
  const sections: string[] = []
  const items: ParsedItem[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let sortOrder = 0

  for (const row of rows) {
    stats.totalRowsSeen += 1

    const sectionName = text(row[0])
    const cardNumber = text(row[1])
    const playerName = cleanPlayer(row[2])
    const affiliateTeam = text(row[3])
    const parentTeam = text(row[5])

    if (!sectionName || !cardNumber || !playerName || !looksLikeCardNumber(cardNumber)) {
      continue
    }

    const printedTeam = parentTeam || affiliateTeam || null
    const sourceAffiliationNote =
      affiliateTeam && parentTeam && normalizedKey(affiliateTeam) !== normalizedKey(parentTeam)
        ? `Affiliate / Printed Team: ${affiliateTeam}`
        : null

    const key = itemKey(sectionName, cardNumber, playerName)
    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }
    seenItems.add(key)

    const sectionKey = normalizedKey(sectionName)
    if (!seenSections.has(sectionKey)) {
      seenSections.add(sectionKey)
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, sourceAffiliationNote ?? '')

    items.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: null,
      variation: sectionKey.includes('variation') ? sectionName : null,
      parallelName: null,
      notes: sourceAffiliationNote,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  stats.teamRowsSeen = items.filter((item) => Boolean(item.printedTeam)).length
  return { sections, items }
}

function detectPairedMasterTeamsProfile(params: {
  masterSheetName: string
  teamsSheetName: string
  masterRows: SheetRow[]
  teamRows: SheetRow[]
}) {
  const { masterSheetName, teamsSheetName, masterRows, teamRows } = params
  const masterWidth = Math.max(1, ...masterRows.slice(0, 500).map((row) => row.length))
  const teamWidth = Math.max(1, ...teamRows.slice(0, 500).map((row) => row.length))

  // In the paired index layout, the Teams worksheet is organized by
  // affiliation first and section second. We do not blindly trust that
  // ordering: the candidate Master columns must strongly cross-match those
  // values before the profile is accepted.
  if (teamWidth < 4 || masterWidth < 3) return null

  const bestMasterColumnForTeam = Array.from({ length: masterWidth }, (_, index) => ({
    index,
    score: columnOverlapScore(masterRows, index, teamRows, 0),
  })).sort((a, b) => b.score - a.score)[0]

  if (!bestMasterColumnForTeam || bestMasterColumnForTeam.score < 0.45) {
    return null
  }

  const bestMasterColumnForSection = Array.from({ length: masterWidth }, (_, index) => ({
    index,
    score:
      index === bestMasterColumnForTeam.index
        ? 0
        : columnOverlapScore(masterRows, index, teamRows, 1),
  })).sort((a, b) => b.score - a.score)[0]

  if (!bestMasterColumnForSection || bestMasterColumnForSection.score < 0.45) {
    return null
  }

  const excluded = new Set([
    bestMasterColumnForTeam.index,
    bestMasterColumnForSection.index,
  ])

  let cardNumberColumn: number | null = null
  let cardScore = 0
  const pairedCardEvidence =
    teamWidth > 2 ? columnCardNumberRatio(teamRows, 2) : 0

  // Only declare a card-number column when both sides of the paired index
  // support it. This prevents date/serial/detail columns in unnumbered sets
  // (such as split-name layouts) from being mistaken for card numbers merely
  // because they contain numeric values.
  if (pairedCardEvidence >= 0.45) {
    for (let masterColumn = 0; masterColumn < masterWidth; masterColumn += 1) {
      if (excluded.has(masterColumn)) continue

      const cardRatio = columnCardNumberRatio(masterRows, masterColumn)
      const pairedOverlap = columnOverlapScore(
        masterRows,
        masterColumn,
        teamRows,
        2
      )
      const score = cardRatio * 0.65 + pairedOverlap * 0.35

      if (
        cardRatio >= 0.45 &&
        pairedOverlap >= 0.35 &&
        score > cardScore
      ) {
        cardScore = score
        cardNumberColumn = masterColumn
      }
    }
  }

  if (cardNumberColumn !== null) excluded.add(cardNumberColumn)

  const personCandidates = Array.from({ length: masterWidth }, (_, index) => {
    if (excluded.has(index)) {
      return { index, score: 0, naturalRatio: 0, distinctRatio: 0 }
    }

    const naturalRatio = columnNaturalTextRatio(masterRows, index)
    const distinctRatio = columnDistinctRatio(masterRows, index)

    // Player/person columns tend to be natural-language text and relatively
    // high-cardinality. This also allows single-name players such as Ichiro.
    const score = naturalRatio * 0.7 + Math.min(1, distinctRatio / 0.6) * 0.3
    return { index, score, naturalRatio, distinctRatio }
  })
    .filter(
      (candidate) =>
        candidate.naturalRatio >= 0.55 &&
        candidate.distinctRatio >= 0.25 &&
        candidate.score >= 0.55
    )
    .sort((a, b) => a.index - b.index)

  if (personCandidates.length === 0) return null

  // Marker/detail columns can occasionally contain words, so cap person
  // columns to the strongest contiguous candidates nearest the core data.
  const strongest = [...personCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)

  const personColumns = strongest.map((candidate) => candidate.index)
  const samplePersonColumns = personColumns.map((column) =>
    masterRows
      .slice(0, 500)
      .map((row) => text(row[column]))
      .filter(Boolean)
  )

  let personMode: PairedIndexProfile['personMode'] = 'single'

  if (personColumns.length >= 2) {
    const firstTwoAverageWords = samplePersonColumns
      .slice(0, 2)
      .map((values) => averageWordCount(values))

    personMode =
      firstTwoAverageWords.length === 2 &&
      firstTwoAverageWords.every((value) => value <= 1.45)
        ? 'split_name'
        : 'multi_person'
  }

  // If more than two natural-text columns were found, prefer multi-person
  // semantics. Split-name layouts observed in older Beckett files use exactly
  // two adjacent name columns.
  if (personColumns.length > 2) personMode = 'multi_person'

  const used = new Set([
    bestMasterColumnForSection.index,
    bestMasterColumnForTeam.index,
    ...personColumns,
  ])
  if (cardNumberColumn !== null) used.add(cardNumberColumn)

  const markerColumns = Array.from({ length: masterWidth }, (_, index) => index).filter(
    (index) => !used.has(index)
  )

  const confidence =
    bestMasterColumnForTeam.score * 0.4 +
    bestMasterColumnForSection.score * 0.35 +
    Math.min(1, Math.max(...personCandidates.map((candidate) => candidate.score))) * 0.25

  if (confidence < 0.55) return null

  return {
    masterSheetName,
    teamsSheetName,
    sectionColumn: bestMasterColumnForSection.index,
    cardNumberColumn,
    personColumns,
    personMode,
    teamColumn: bestMasterColumnForTeam.index,
    markerColumns,
    confidence,
  } satisfies PairedIndexProfile
}

function mergeDelimitedValues(left: string | null, right: string | null) {
  const values = [left, right]
    .flatMap((value) => String(value ?? '').split('/'))
    .map((value) => value.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const unique: string[] = []

  for (const value of values) {
    const key = normalizedKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }

  return unique.length > 0 ? unique.join(' / ') : null
}

function mergeNoteValues(left: string | null, right: string | null) {
  const values = [left, right]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  const unique: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const key = normalizedKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(value)
  }

  return unique.length > 0 ? unique.join('; ') : null
}

function parsePairedMasterTeamsProfile(
  masterRows: SheetRow[],
  profile: PairedIndexProfile,
  stats: ImportStats
) {
  const sections: string[] = []
  const items: ParsedItem[] = []
  const seenSections = new Set<string>()
  const itemByKey = new Map<string, ParsedItem>()
  let sortOrder = 0

  for (const row of masterRows) {
    stats.totalRowsSeen += 1
    if (looksLikeHeaderRow(row)) continue

    const sectionName = text(row[profile.sectionColumn])
    const printedTeam = text(row[profile.teamColumn]) || null
    const cardNumber =
      profile.cardNumberColumn === null
        ? ''
        : text(row[profile.cardNumberColumn])

    const personParts = profile.personColumns
      .map((column) => cleanPlayer(row[column]))
      .filter(Boolean)

    if (!sectionName || personParts.length === 0) continue
    if (!isTrustworthySectionHeading(sectionName)) continue

    const playerName =
      profile.personMode === 'split_name'
        ? personParts.join(' ').replace(/\s+/g, ' ').trim()
        : personParts.join(' / ')

    if (!playerName) continue

    const marker = profile.markerColumns
      .map((column) => text(row[column]))
      .filter(Boolean)
      .join(' ')
      .trim()

    const key = itemKey(sectionName, cardNumber, playerName)
    const existing = itemByKey.get(key)

    if (existing) {
      existing.printedTeam = mergeDelimitedValues(existing.printedTeam, printedTeam)
      existing.notes = mergeNoteValues(existing.notes, marker || null)

      if (profile.personMode === 'multi_person') {
        existing.people = profile.personColumns
          .map((column, index) => ({
            playerName: cleanPlayer(row[column]),
            printedTeam: existing.printedTeam,
            sortOrder: index + 1,
          }))
          .filter((person) => Boolean(person.playerName))
      }

      continue
    }

    const sectionKey = normalizedKey(sectionName)
    if (!seenSections.has(sectionKey)) {
      seenSections.add(sectionKey)
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, marker)

    const people =
      profile.personMode === 'multi_person'
        ? personParts.map((person, index) => ({
            playerName: person,
            printedTeam,
            sortOrder: index + 1,
          }))
        : splitPeople(playerName, printedTeam)

    const item: ParsedItem = {
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: sectionKey.includes('variation') ? sectionName : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people,
    }

    itemByKey.set(key, item)
    items.push(item)
    stats.normalizedRows += 1
  }

  stats.teamRowsSeen = items.filter((item) => Boolean(item.printedTeam)).length
  return { sections, items }
}

function validateParsedChecklistStructure(
  parsed: { sections: string[]; items: ParsedItem[] },
  context: string
) {
  if (parsed.sections.length === 0 || parsed.items.length < 5) {
    throw new Error(
      `${context}: HITS could not identify enough checklist rows safely. Nothing was imported.`
    )
  }

  const teams = parsed.items
    .map((item) => text(item.printedTeam))
    .filter(Boolean)
  const sections = parsed.items.map((item) => item.sectionName).filter(Boolean)

  if (teams.length >= 10) {
    const cardLikeTeams = teams.filter(looksLikeCardNumber).length / teams.length
    const uniqueTeamRatio =
      new Set(teams.map((value) => normalizedKey(value))).size / teams.length

    if (cardLikeTeams >= 0.25 || (uniqueTeamRatio >= 0.85 && cardLikeTeams >= 0.1)) {
      throw new Error(
        `${context}: the detected Team / Affiliation field looks like card numbers (${Math.round(
          cardLikeTeams * 100
        )}% card-number-like values). Nothing was imported.`
      )
    }
  }

  if (sections.length >= 10) {
    const cardLikeSections =
      sections.filter(looksLikeCardNumber).length / sections.length

    if (cardLikeSections >= 0.25) {
      throw new Error(
        `${context}: the detected Section field looks like card numbers. Nothing was imported.`
      )
    }
  }
}

const BASEBALL_TEAM_TERMS = [
  'angels',
  'astros',
  'athletics',
  'blue jays',
  'braves',
  'brewers',
  'cardinals',
  'cubs',
  'diamondbacks',
  'dodgers',
  'giants',
  'guardians',
  'mariners',
  'marlins',
  'mets',
  'nationals',
  'orioles',
  'padres',
  'phillies',
  'pirates',
  'rangers',
  'rays',
  'red sox',
  'reds',
  'rockies',
  'royals',
  'tigers',
  'twins',
  'white sox',
  'yankees',
  // Historical labels that legitimately appear on modern checklists.
  'expos',
  'devil rays',
  'brooklyn dodgers',
  'new york giants',
  'oakland athletics',
  'montreal expos',
]

const BASEBALL_TEAM_CITIES = [
  'arizona',
  'atlanta',
  'baltimore',
  'boston',
  'chicago',
  'cincinnati',
  'cleveland',
  'colorado',
  'detroit',
  'houston',
  'kansas city',
  'los angeles',
  'miami',
  'milwaukee',
  'minnesota',
  'new york',
  'philadelphia',
  'pittsburgh',
  'san diego',
  'san francisco',
  'seattle',
  'st louis',
  'st. louis',
  'tampa bay',
  'texas',
  'toronto',
  'washington',
]

const COUNTRY_TEAM_NAMES = new Set([
  'australia',
  'canada',
  'china',
  'chinese taipei',
  'colombia',
  'cuba',
  'czech republic',
  'dominican republic',
  'great britain',
  'israel',
  'italy',
  'japan',
  'korea',
  'mexico',
  'netherlands',
  'nicaragua',
  'panama',
  'puerto rico',
  'united states',
  'usa',
  'venezuela',
])

function normalizeTeamDetectionValue(value: string) {
  return normalizedKey(value)
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeBaseballTeam(value: string) {
  const normalized = normalizeTeamDetectionValue(value)
  if (!normalized) return false

  if (COUNTRY_TEAM_NAMES.has(normalized)) return true

  if (
    normalized.startsWith('usa baseball ') ||
    normalized.endsWith(' national team') ||
    normalized.includes(' athlete development program')
  ) {
    return true
  }

  if (
    BASEBALL_TEAM_TERMS.some(
      (term) => normalized === term || normalized.endsWith(` ${term}`)
    )
  ) {
    return true
  }

  return BASEBALL_TEAM_CITIES.some((city) => normalized === city)
}

function looksLikePersonName(value: string) {
  const cleaned = value.trim()
  if (!cleaned || looksLikeBaseballTeam(cleaned)) return false
  if (/^(?:RC|Rookie)$/i.test(cleaned)) return false
  if (/\d/.test(cleaned)) return false

  const words = cleaned
    .replace(/[.,'’\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return words.length >= 2 && words.length <= 6
}

function suggestedMappingsFromRows(rows: SheetRow[]) {
  const sample = rows
    .slice(0, 500)
    .filter((row) => row.filter((value) => text(value)).length >= 2)

  const width = Math.max(1, ...sample.map((row) => row.length))
  const scores = Array.from({ length: width }, () => ({
    card: 0,
    player: 0,
    team: 0,
    rookie: 0,
  }))

  const columnValues = Array.from({ length: width }, () => [] as string[])

  for (const row of sample) {
    for (let index = 0; index < width; index += 1) {
      const value = text(row[index])
      if (!value) continue

      columnValues[index].push(value)

      if (looksLikeCardNumber(value)) scores[index].card += 5
      if (looksLikeNaturalText(value)) scores[index].player += 2

      // A known team/country is useful evidence when available, but it is only
      // a bonus. Affiliation detection must also work for MiLB, colleges,
      // countries, future sports, and sources we have never seen before.
      if (looksLikeBaseballTeam(value)) scores[index].team += 3
      if (looksLikeNaturalText(value) && !looksLikeCardNumber(value)) {
        scores[index].team += 1
      }

      if (/^(?:RC|Rookie)$/i.test(value)) scores[index].rookie += 8
    }
  }

  for (let index = 0; index < width; index += 1) {
    const values = columnValues[index]
    if (values.length === 0) continue

    const normalizedValues = values.map((value) => normalizedKey(value))
    const distinctRatio = new Set(normalizedValues).size / values.length
    const cardRatio = values.filter(looksLikeCardNumber).length / values.length
    const naturalRatio = values.filter(looksLikeNaturalText).length / values.length

    // Player/item columns are usually high-cardinality natural text.
    scores[index].player += naturalRatio * 10 + distinctRatio * 8

    // Team/affiliation columns generally repeat more than player names. This
    // is intentionally source-neutral and does not require a team dictionary.
    scores[index].team +=
      naturalRatio * 8 + Math.max(0, 1 - distinctRatio) * 12 - cardRatio * 12

    scores[index].card += cardRatio * 12
  }

  const best = (
    key: 'card' | 'player' | 'team' | 'rookie',
    excluded: number[] = []
  ) => {
    let bestIndex: number | null = null
    let bestScore = 0

    scores.forEach((score, index) => {
      if (excluded.includes(index)) return
      if (score[key] > bestScore) {
        bestScore = score[key]
        bestIndex = index
      }
    })

    return bestIndex
  }

  const compactIndices = (...values: Array<number | null>): number[] => {
    const indices: number[] = []

    for (const value of values) {
      if (value !== null) indices.push(value)
    }

    return indices
  }

  const cardNumber = best('card')
  const playerName = best('player', compactIndices(cardNumber))

  const teamCandidate = best('team', compactIndices(cardNumber, playerName))
  const printedTeam =
    teamCandidate !== null &&
    columnValues[teamCandidate].length >= 5 &&
    columnCardNumberRatio(rows, teamCandidate) < 0.1 &&
    columnNaturalTextRatio(rows, teamCandidate) >= 0.5 &&
    columnDistinctRatio(rows, teamCandidate) <= 0.75
      ? teamCandidate
      : null
  const rookieFlag = best(
    'rookie',
    compactIndices(cardNumber, printedTeam, playerName)
  )

  return {
    sectionName: null,
    cardNumber: cardNumber ?? (width >= 1 ? 0 : null),
    playerName: playerName ?? (width >= 2 ? 1 : null),
    printedTeam: printedTeam ?? (width >= 3 ? 2 : null),
    rookieFlag: rookieFlag ?? (width >= 4 ? 3 : null),
    autoFlag: null,
    relicFlag: null,
    serialFlag: null,
    printRun: null,
    variation: null,
    parallelName: null,
    notes: null,
  }
}

function validateChecklistInsiderTeams(parsed: {
  items: ParsedItem[]
}) {
  // Team/Affiliation is enrichment, not core identity. A legitimate checklist
  // may omit it entirely. When a team-like field is present, use the shared
  // semantic guardrail to make sure it was not actually a card-number column.
  validateParsedChecklistStructure(
    {
      sections: Array.from(
        new Set(parsed.items.map((item) => item.sectionName).filter(Boolean))
      ),
      items: parsed.items,
    },
    'Checklist Insider checklist validation'
  )
}

function buildHeaders(row: SheetRow) {
  const width = Math.max(row.length, 1)

  return Array.from({ length: width }, (_, index) => {
    const value = text(row[index])
    return value || `Column ${index + 1}`
  })
}

function suggestedMappings(headers: string[]) {
  const normalized = headers.map((header) => normalizedKey(header))

  function find(...patterns: RegExp[]) {
    const index = normalized.findIndex((header) =>
      patterns.some((pattern) => pattern.test(header))
    )
    return index >= 0 ? index : null
  }

  return {
    sectionName: find(/^section$/, /subset/, /^set$/, /card.*set/, /^type$/),
    cardNumber: find(/card.*number/, /^card #$/, /^card$/, /^checklist$/, /^number$/, /^no\.?$/),
    playerName: find(/player/, /athlete/, /item.*name/, /^name$/),
    printedTeam: find(/^team$/, /printed.*team/, /club/),
    rookieFlag: find(/rookie/, /^rc$/, /^1st\??$/),
    autoFlag: find(/autograph/, /^auto$/),
    relicFlag: find(/relic/, /memorabilia/, /patch/),
    serialFlag: find(/serial/, /numbered/),
    printRun: find(/print.*run/, /^\/\d+$/, /numbered.*to/),
    variation: find(/variation/),
    parallelName: find(/parallel/),
    notes: find(/notes?/, /marker/, /features?/),
  }
}

function genericMetadataFromInput(input: GenericMetadataInput): ProductMetadata {
  const category = text(input.category) || 'Sports Cards'
  const sportOrGame = text(input.sportOrGame)
  const year = text(input.year) || null
  const manufacturer = text(input.manufacturer) || null
  const brand = text(input.brand) || null
  const rawProductName = text(input.productName)
  const editionName = text(input.editionName) || null
  const productName =
    editionName &&
    rawProductName &&
    !normalizedKey(rawProductName).includes(normalizedKey(editionName))
      ? `${rawProductName} ${editionName}`.trim()
      : rawProductName

  if (!sportOrGame) {
    throw new Error('Sport / Game is required for a generic checklist import.')
  }

  if (!productName) {
    throw new Error('Product Name is required for a generic checklist import.')
  }

  return buildProductKey({
    category,
    sportOrGame,
    year,
    manufacturer,
    brand,
    productName,
    editionName,
  })
}

async function insertInBatches<T extends Record<string, unknown>>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: T[]
) {
  const inserted: any[] = []

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE)

    const { data, error } = await supabase.from(table).insert(batch).select()

    if (error) throw error
    inserted.push(...(data ?? []))
  }

  return inserted
}

async function getOrCreateGlobalProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  metadata: ProductMetadata
) {
  const { data: existing, error: existingError } = await supabase
    .from('products')
    .select('id, display_name')
    .eq('visibility', 'global')
    .eq('product_key', metadata.productKey)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    return {
      product: existing,
      created: false,
    }
  }

  const { data: created, error: createError } = await supabase
    .from('products')
    .insert({
      owner_user_id: userId,
      visibility: 'global',
      category: metadata.category,
      sport_or_game: metadata.sportOrGame,
      year: metadata.year,
      manufacturer: metadata.manufacturer,
      brand: metadata.brand,
      product_name: metadata.productName,
      edition_name: metadata.editionName,
      display_name: metadata.displayName,
      product_key: metadata.productKey,
      notes: null,
    })
    .select('id, display_name')
    .single()

  if (createError) throw createError

  return {
    product: created,
    created: true,
  }
}

async function loadExistingChecklistStructure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checklistId: string
) {
  const [
    { data: sections, error: sectionsError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabase
      .from('checklist_sections')
      .select('id, name, section_type, sort_order')
      .eq('checklist_id', checklistId),
    supabase
      .from('checklist_items')
      .select(
        'id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
      )
      .eq('checklist_id', checklistId),
  ])

  if (sectionsError) throw sectionsError
  if (itemsError) throw itemsError

  return {
    sections: sections ?? [],
    items: items ?? [],
  }
}

async function persistChecklist(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  uploadedName: string
  metadata: ProductMetadata
  parsed: { sections: string[]; items: ParsedItem[] }
  stats: ImportStats
  sourceType: string
  importFormat: string
  checklistNotes: string
  importNotes: string
}) {
  const {
    supabase,
    userId,
    uploadedName,
    metadata,
    parsed,
    stats,
    sourceType,
    importFormat,
    checklistNotes,
    importNotes,
  } = params

  // Final semantic guardrail shared by every importer. Source-specific adapters
  // can contribute clues, but malformed role assignments never reach Supabase.
  validateParsedChecklistStructure(parsed, `${sourceLabel(sourceType)} checklist validation`)

  let checklistId: string | null = null
  let productId: string | null = null
  let createdChecklistThisRequest = false
  let createdProductThisRequest = false
  let insertedSectionIdsForCleanup: string[] = []
  let insertedItemIdsForCleanup: string[] = []

  try {
    const productResult = await getOrCreateGlobalProduct(
      supabase,
      userId,
      metadata
    )

    const product = productResult.product
    productId = String(product.id)
    createdProductThisRequest = productResult.created

    const { data: existingChecklistRows, error: existingChecklistError } =
      await supabase
        .from('checklists')
        .select(
          'id, name, product_id, source_type, created_at, is_active, superseded_by_checklist_id'
        )
        .eq('visibility', 'global')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(2)

    if (existingChecklistError) throw existingChecklistError

    const existingChecklist = (existingChecklistRows ?? [])[0] ?? null
    const existingSource = String(existingChecklist?.source_type ?? '')
    const incomingPriority = checklistSourcePriority(sourceType)
    const existingPriority = checklistSourcePriority(existingSource)
    const isCrossSource = Boolean(
      existingChecklist &&
        existingSource &&
        normalizedKey(existingSource) !== normalizedKey(sourceType)
    )
    const isSourceUpgrade =
      isCrossSource && incomingPriority > existingPriority
    const isSameSourceRebuild = Boolean(
      existingChecklist &&
        existingSource &&
        normalizedKey(existingSource) === normalizedKey(sourceType)
    )
    const createsReplacementChecklist = isSourceUpgrade || isSameSourceRebuild

    if (isCrossSource && !isSourceUpgrade) {
      throw new Error(
        `This product already has an active checklist from ${sourceLabel(
          existingSource
        )}. HITS kept that checklist because ${sourceLabel(
          sourceType
        )} is not a higher-priority source.`
      )
    }

    let checklist: { id: string; name: string }

    if (existingChecklist && !createsReplacementChecklist) {
      checklist = {
        id: String(existingChecklist.id),
        name: String(existingChecklist.name),
      }
      checklistId = checklist.id
    } else {
      const { data: createdChecklist, error: checklistError } = await supabase
        .from('checklists')
        .insert({
          owner_user_id: null,
          visibility: 'global',
          product_id: product.id,
          sport: metadata.sportOrGame.toLowerCase(),
          year: metadata.year,
          manufacturer: metadata.manufacturer,
          brand: metadata.brand,
          product_name: metadata.productName,
          name: metadata.displayName,
          source_type: sourceType,
          source_reference: uploadedName,
          verified: false,
          is_active: true,
          notes: isSourceUpgrade
            ? `${checklistNotes} Upgraded from ${sourceLabel(existingSource)}.`
            : isSameSourceRebuild
              ? `${checklistNotes} Rebuilt from a fresh ${sourceLabel(sourceType)} import.`
              : checklistNotes,
        })
        .select('id, name')
        .single()

      if (checklistError) throw checklistError

      checklist = createdChecklist
      checklistId = checklist.id
      createdChecklistThisRequest = true
    }

    const existingStructure = await loadExistingChecklistStructure(
      supabase,
      checklist.id
    )

    const sectionIdByNormalizedName = new Map<string, string>()
    const sectionNameById = new Map<string, string>()

    for (const section of existingStructure.sections) {
      const sectionName = String(section.name)
      const sectionId = String(section.id)

      sectionIdByNormalizedName.set(normalizedKey(sectionName), sectionId)
      sectionNameById.set(sectionId, sectionName)
    }

    const missingSectionRows = parsed.sections
      .filter(
        (name) => !sectionIdByNormalizedName.has(normalizedKey(name))
      )
      .map((name, index) => ({
        checklist_id: checklist.id,
        name,
        section_type: sectionType(name),
        sort_order: existingStructure.sections.length + index + 1,
        notes: null,
      }))

    const insertedSections =
      missingSectionRows.length > 0
        ? await insertInBatches(supabase, 'checklist_sections', missingSectionRows)
        : []

    stats.sectionsCreated = insertedSections.length
    insertedSectionIdsForCleanup = insertedSections.map((section) =>
      String(section.id)
    )

    for (const section of insertedSections) {
      const sectionName = String(section.name)
      const sectionId = String(section.id)

      sectionIdByNormalizedName.set(normalizedKey(sectionName), sectionId)
      sectionNameById.set(sectionId, sectionName)
    }

    const existingItemKeys = new Set<string>()

    for (const existingItem of existingStructure.items) {
      const sectionName =
        sectionNameById.get(String(existingItem.section_id)) ?? ''

      existingItemKeys.add(
        itemKey(
          sectionName,
          String(existingItem.card_number ?? ''),
          String(existingItem.player_name ?? '')
        )
      )
    }

    const newParsedItems: ParsedItem[] = []

    for (const item of parsed.items) {
      const key = itemKey(item.sectionName, item.cardNumber, item.playerName)

      if (existingItemKeys.has(key)) {
        stats.skippedRows += 1
        continue
      }

      existingItemKeys.add(key)
      newParsedItems.push(item)
    }

    const itemRows = newParsedItems.map((item) => {
      const sectionId = sectionIdByNormalizedName.get(
        normalizedKey(item.sectionName)
      )

      if (!sectionId) {
        throw new Error(`Section ID was not created for "${item.sectionName}".`)
      }

      return {
        checklist_id: checklist.id,
        section_id: sectionId,
        card_number: item.cardNumber,
        player_name: item.playerName,
        printed_team: item.printedTeam,
        franchise_id: null,
        parallel_name: item.parallelName,
        variation: item.variation,
        rookie_flag: item.rookieFlag,
        auto_flag: item.autoFlag,
        relic_flag: item.relicFlag,
        serial_flag: item.serialFlag,
        print_run: item.printRun,
        quantity_required: 1,
        sort_order: item.sortOrder,
        notes: item.notes,
      }
    })

    const insertedItems =
      itemRows.length > 0
        ? await insertInBatches(supabase, 'checklist_items', itemRows)
        : []

    stats.checklistItemsCreated = insertedItems.length
    stats.insertedRows = insertedItems.length
    insertedItemIdsForCleanup = insertedItems.map((item) => String(item.id))

    const originalByIdentity = new Map<string, ParsedItem>()

    for (const item of newParsedItems) {
      originalByIdentity.set(
        itemKey(item.sectionName, item.cardNumber, item.playerName),
        item
      )
    }

    const peopleRows: Array<Record<string, unknown>> = []

    for (const insertedItem of insertedItems) {
      const sectionName =
        sectionNameById.get(String(insertedItem.section_id)) ?? ''

      const original = originalByIdentity.get(
        itemKey(
          sectionName,
          String(insertedItem.card_number ?? ''),
          String(insertedItem.player_name ?? '')
        )
      )

      if (!original || original.people.length === 0) continue

      for (const person of original.people) {
        peopleRows.push({
          checklist_item_id: insertedItem.id,
          player_name: person.playerName,
          printed_team: person.printedTeam,
          franchise_id: null,
          sort_order: person.sortOrder,
        })
      }
    }

    if (peopleRows.length > 0) {
      await insertInBatches(supabase, 'checklist_item_people', peopleRows)
    }

    const importMode =
      existingChecklist && isSourceUpgrade
        ? `upgraded checklist source from ${sourceLabel(
            existingSource
          )} to ${sourceLabel(sourceType)}`
        : existingChecklist && isSameSourceRebuild
          ? 'rebuilt existing HITS checklist from this file'
          : createdChecklistThisRequest
            ? 'created new product checklist'
          : stats.insertedRows > 0 || stats.sectionsCreated > 0
            ? 'merged new checklist data into existing product'
            : 'duplicate upload; no new checklist rows added'

    const { error: importHistoryError } = await supabase
      .from('checklist_imports')
      .insert({
        checklist_id: checklist.id,
        imported_by_user_id: userId,
        source_type: sourceType,
        original_filename: uploadedName,
        source_reference: uploadedName,
        import_format: importFormat,
        rows_imported: stats.insertedRows,
        rows_skipped: stats.skippedRows,
        rows_with_errors: stats.errors.length,
        notes: `Import mode: ${importMode}. ${importNotes} Sections created: ${stats.sectionsCreated}. Checklist items created: ${stats.checklistItemsCreated}.`,
      })

    if (importHistoryError) throw importHistoryError

    if (existingChecklist && createsReplacementChecklist) {
      const { error: supersedeError } = await supabase
        .from('checklists')
        .update({
          is_active: false,
          superseded_by_checklist_id: checklist.id,
          superseded_at: new Date().toISOString(),
          supersede_reason: isSourceUpgrade
            ? `Upgraded from ${sourceLabel(
                existingSource
              )} to ${sourceLabel(sourceType)} via ${uploadedName}.`
            : `Rebuilt ${sourceLabel(
                sourceType
              )} checklist from a fresh import of ${uploadedName}.`,
        })
        .eq('id', existingChecklist.id)
        .eq('visibility', 'global')
        .eq('is_active', true)

      if (supersedeError) throw supersedeError
    }

    return {
      checklist,
      product,
      importMode,
    }
  } catch (error) {
    if (checklistId && createdChecklistThisRequest) {
      const { error: cleanupError } = await supabase
        .from('checklists')
        .delete()
        .eq('id', checklistId)
        .eq('visibility', 'global')

      if (cleanupError) {
        console.error('Checklist import cleanup failed:', cleanupError)
      }
    } else if (checklistId) {
      if (insertedItemIdsForCleanup.length > 0) {
        const { error: itemCleanupError } = await supabase
          .from('checklist_items')
          .delete()
          .in('id', insertedItemIdsForCleanup)
          .eq('checklist_id', checklistId)

        if (itemCleanupError) {
          console.error('Checklist item merge cleanup failed:', itemCleanupError)
        }
      }

      if (insertedSectionIdsForCleanup.length > 0) {
        const { error: sectionCleanupError } = await supabase
          .from('checklist_sections')
          .delete()
          .in('id', insertedSectionIdsForCleanup)
          .eq('checklist_id', checklistId)

        if (sectionCleanupError) {
          console.error(
            'Checklist section merge cleanup failed:',
            sectionCleanupError
          )
        }
      }
    }

    if (productId && createdProductThisRequest && !checklistId) {
      const { error: productCleanupError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('visibility', 'global')

      if (productCleanupError) {
        console.error('Product cleanup failed:', productCleanupError)
      }
    }

    throw error
  }
}

async function handleGenericPreview(uploaded: File) {
  const { rows, format } = await readGenericRows(uploaded)

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No rows could be read from this checklist file.' },
      { status: 400 }
    )
  }

  const headerRowIndex = guessHeaderRowIndex(rows)
  const sectioned = headerRowIndex === -1
  const headers = sectioned
    ? buildSyntheticHeaders(rows)
    : buildHeaders(rows[headerRowIndex] ?? [])
  const suggestions = sectioned
    ? suggestedMappingsFromRows(rows)
    : suggestedMappings(headers)

  return NextResponse.json({
    ok: true,
    mode: 'generic-preview',
    layout: sectioned ? 'sectioned' : 'header',
    fileName: uploaded.name,
    format,
    totalRows: rows.length,
    headerRowIndex,
    headers,
    suggestions,
    previewRows: rows.slice(0, GENERIC_PREVIEW_ROWS).map((row) =>
      row.map((value) => text(value))
    ),
  })
}

async function handleGenericImport(params: {
  uploaded: File
  formData: FormData
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}) {
  const { uploaded, formData, supabase, userId } = params
  const stats = newStats()

  const mappingRaw = formData.get('mapping')
  const metadataRaw = formData.get('metadata')
  const headerRowRaw = formData.get('headerRowIndex')

  if (typeof mappingRaw !== 'string' || typeof metadataRaw !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Checklist mapping information was not received.' },
      { status: 400 }
    )
  }

  let mapping: GenericMapping
  let metadataInput: GenericMetadataInput

  try {
    mapping = JSON.parse(mappingRaw) as GenericMapping
    metadataInput = JSON.parse(metadataRaw) as GenericMetadataInput
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Checklist mapping information is invalid.' },
      { status: 400 }
    )
  }

  const headerRowIndex = Number(headerRowRaw)
  const metadata = genericMetadataFromInput(metadataInput)
  const { rows, format } = await readGenericRows(uploaded)
  const parsed = parseGenericRows(rows, headerRowIndex, mapping, stats)

  if (parsed.sections.length === 0 || parsed.items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No checklist card rows could be created from the selected mapping.',
        files: [{ fileName: uploaded.name, ...stats }],
      },
      { status: 400 }
    )
  }

  const persisted = await persistChecklist({
    supabase,
    userId,
    uploadedName: uploaded.name,
    metadata,
    parsed,
    stats,
    sourceType: 'generic',
    importFormat: format,
    checklistNotes: `Imported from mapped ${format.toUpperCase()} checklist: ${uploaded.name}.`,
    importNotes: `Mapped rows seen: ${stats.totalRowsSeen}. `,
  })

  return NextResponse.json({
    ok: true,
    checklistId: persisted.checklist.id,
    checklistName: persisted.checklist.name,
    productId: persisted.product.id,
    productName: persisted.product.display_name,
    importMode: persisted.importMode,
    files: [{ fileName: uploaded.name, ...stats }],
    totals: {
      files: 1,
      totalRowsSeen: stats.totalRowsSeen,
      normalizedRows: stats.normalizedRows,
      insertedRows: stats.insertedRows,
      skippedRows: stats.skippedRows,
      sectionsCreated: stats.sectionsCreated,
      checklistItemsCreated: stats.checklistItemsCreated,
      teamRowsSeen: stats.teamRowsSeen,
    },
  })
}

function looksLikeSimpleChecklistRows(rows: SheetRow[]) {
  let matches = 0

  for (const row of rows.slice(0, 300)) {
    if (
      looksLikeCardNumber(text(row[0])) &&
      Boolean(cleanPlayer(row[1]))
    ) {
      matches += 1
    }
  }

  return matches >= 5
}

function parseSimpleChecklistSheet(
  rows: SheetRow[],
  sheetName: string,
  stats: ImportStats,
  startingSortOrder: number
) {
  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let currentSection = isTrustworthySectionHeading(sheetName) ? sheetName : 'Base Set'
  let sortOrder = startingSortOrder

  for (const row of rows) {
    stats.totalRowsSeen += 1

    if (isSectionHeader(row)) {
      const candidate = text(row[0])
      if (isTrustworthySectionHeading(candidate)) {
        currentSection = candidate
      }
      continue
    }

    const cardNumber = text(row[0])
    const playerName = cleanPlayer(row[1])
    const printedTeam = text(row[2]) || null
    const marker = text(row[3])

    if (!playerName || !looksLikeCardNumber(cardNumber)) continue

    const sectionName = currentSection || sheetName || 'Checklist'
    const key = itemKey(sectionName, cardNumber, playerName)

    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)

    if (!seenSections.has(normalizedKey(sectionName))) {
      seenSections.add(normalizedKey(sectionName))
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, marker)

    items.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: normalizedKey(sectionName).includes('variation')
        ? sectionName
        : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  return { sections, items, sortOrder }
}


function inferStructuredMetadataFromRows(
  fileName: string,
  rows: SheetRow[]
): ProductMetadata {
  const fallback = inferProductMetadata(fileName)
  const headerRowIndex = guessHeaderRowIndex(rows)

  if (headerRowIndex < 0) return fallback

  const headers = buildHeaders(rows[headerRowIndex] ?? [])
  const normalizedHeaders = headers.map((value) => normalizedKey(value))

  const findColumn = (...patterns: RegExp[]) => {
    const index = normalizedHeaders.findIndex((header) =>
      patterns.some((pattern) => pattern.test(header))
    )
    return index >= 0 ? index : null
  }

  const sportColumn = findColumn(/^sport$/, /sport.*game/)
  const yearColumn = findColumn(/^year$/)
  const manufacturerColumn = findColumn(/^manufacturer$/, /^mfr$/)
  const brandColumn = findColumn(/^brand$/)
  const programColumn = findColumn(/^program$/, /^product$/)

  const firstDataRow = rows
    .slice(headerRowIndex + 1)
    .find((row) => row.some((value) => text(value)))

  if (!firstDataRow) return fallback

  const sportOrGame =
    cellAt(firstDataRow, sportColumn) || fallback.sportOrGame || 'Baseball'
  const year = cellAt(firstDataRow, yearColumn) || fallback.year

  // Panini publisher exports commonly use BRAND=Panini and PROGRAM=Prizm.
  // Treat the publisher/brand column as manufacturer when no dedicated
  // manufacturer column exists, while PROGRAM becomes the consumer-facing brand.
  const rawManufacturer =
    cellAt(firstDataRow, manufacturerColumn) ||
    cellAt(firstDataRow, brandColumn) ||
    fallback.manufacturer
  const rawBrand =
    cellAt(firstDataRow, programColumn) ||
    cellAt(firstDataRow, brandColumn) ||
    fallback.brand

  const productName =
    [rawBrand, sportOrGame].filter(Boolean).join(' ').trim() ||
    fallback.productName

  return buildProductKey({
    category: 'Sports Cards',
    sportOrGame,
    year: year || null,
    manufacturer: rawManufacturer || null,
    brand: rawBrand || null,
    productName,
    editionName: null,
  })
}

async function handleStructuredWorkbookImport(params: {
  uploaded: File
  buffer: Buffer
  sheetNames: string[]
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  metadataOverride?: ProductMetadataOverride | null
}) {
  const { uploaded, buffer, sheetNames, supabase, userId, metadataOverride } = params
  const stats = newStats()

  // Some publisher/price-guide team indexes preserve two levels of affiliation:
  // Section | Card # | Player | immediate/printed affiliate | ... | parent organization.
  // When that relationship is explicit in the source, organize Browse by Team under
  // the parent organization while preserving the immediate affiliate in notes.
  // This is an additive structural fallback and does not replace richer proven adapters.
  for (const sheetName of sheetNames) {
    const normalizedSheetName = normalizedKey(sheetName)
    if (normalizedSheetName !== 'teams' && normalizedSheetName !== 'team sets') continue

    const hierarchyRows = (await readSheet(buffer, sheetName)) as SheetRow[]
    if (!looksLikeParentAffiliateTeamIndex(hierarchyRows)) continue

    const hierarchyParsed = parseParentAffiliateTeamIndex(hierarchyRows, stats)
    validateParsedChecklistStructure(
      hierarchyParsed,
      `Parent/affiliate ${sheetName} workbook`
    )

    const metadata = applyProductMetadataOverride(
      inferProductMetadata(uploaded.name),
      metadataOverride
    )
    const beckettLike = sheetNames.some((name) =>
      ['full checklist', 'base', 'autographs', 'inserts', 'variations', 'memorabilia'].includes(
        normalizedKey(name)
      )
    )
    const sourceType = beckettLike
      ? 'beckett'
      : normalizedKey(metadata.manufacturer ?? '') === 'panini'
        ? 'manufacturer'
        : 'generic'

    const persisted = await persistChecklist({
      supabase,
      userId,
      uploadedName: uploaded.name,
      metadata,
      parsed: hierarchyParsed,
      stats,
      sourceType,
      importFormat: 'xlsx',
      checklistNotes:
        'Imported from a checklist index that explicitly supplies immediate affiliate and parent organization. HITS organizes Team by parent organization and preserves the immediate affiliate on each card.',
      importNotes:
        `Parent/affiliate structural profile detected on ${sheetName}. ` +
        `Card number + player were treated as the core identity; parent organization was used for Team when supplied.`,
    })

    return NextResponse.json({
      ok: true,
      detectedSource: 'Parent/Affiliate team checklist',
      checklistId: persisted.checklist.id,
      checklistName: persisted.checklist.name,
      productId: persisted.product.id,
      productName: persisted.product.display_name,
      importMode: persisted.importMode,
      files: [{ fileName: uploaded.name, ...stats }],
      totals: {
        files: 1,
        totalRowsSeen: stats.totalRowsSeen,
        normalizedRows: stats.normalizedRows,
        insertedRows: stats.insertedRows,
        skippedRows: stats.skippedRows,
        sectionsCreated: stats.sectionsCreated,
        checklistItemsCreated: stats.checklistItemsCreated,
        teamRowsSeen: stats.teamRowsSeen,
      },
    })
  }

  // First try a paired canonical-index profile. This is especially valuable
  // for Beckett's Master + Teams workbooks, but the detection itself is based
  // on cross-sheet agreement rather than blindly trusting fixed column
  // positions. The paired sheets tell HITS which values behave like sections
  // and affiliations, then the Master rows are analyzed for card-number,
  // single-player, split-name, or multi-person layouts.
  const pairedMasterSheetName =
    sheetNames.find((name) => {
      const normalized = normalizedKey(name)
      return normalized === 'master' || normalized === 'master checklist'
    }) ?? null
  const pairedTeamsSheetName =
    sheetNames.find((name) => normalizedKey(name) === 'teams') ?? null

  if (pairedMasterSheetName && pairedTeamsSheetName) {
    const pairedMasterRows = (await readSheet(
      buffer,
      pairedMasterSheetName
    )) as SheetRow[]
    const pairedTeamRows = (await readSheet(
      buffer,
      pairedTeamsSheetName
    )) as SheetRow[]

    const pairedProfile = detectPairedMasterTeamsProfile({
      masterSheetName: pairedMasterSheetName,
      teamsSheetName: pairedTeamsSheetName,
      masterRows: pairedMasterRows,
      teamRows: pairedTeamRows,
    })

    if (pairedProfile) {
      const pairedParsed = parsePairedMasterTeamsProfile(
        pairedMasterRows,
        pairedProfile,
        stats
      )

      validateParsedChecklistStructure(
        pairedParsed,
        `Paired ${pairedMasterSheetName}/${pairedTeamsSheetName} workbook`
      )

      const metadata = applyProductMetadataOverride(
        inferProductMetadata(uploaded.name),
        metadataOverride
      )

      const beckettLikeSheetNames = new Set([
        'base',
        'variations',
        'autographs',
        'memorabilia',
        'inserts',
        'silver packs',
      ])
      const looksLikeBeckettWorkbook = sheetNames.some((name) =>
        beckettLikeSheetNames.has(normalizedKey(name))
      )
      const pairedSourceType = looksLikeBeckettWorkbook
        ? 'beckett'
        : normalizedKey(metadata.manufacturer ?? '') === 'panini'
          ? 'manufacturer'
          : 'generic'

      const persisted = await persistChecklist({
        supabase,
        userId,
        uploadedName: uploaded.name,
        metadata,
        parsed: pairedParsed,
        stats,
        sourceType: pairedSourceType,
        importFormat: 'xlsx',
        checklistNotes:
          pairedSourceType === 'beckett'
            ? 'Imported from a Beckett-style paired Master/Teams workbook using cross-sheet structural validation.'
            : 'Imported from a paired Master/Teams XLSX workbook using cross-sheet structural validation.',
        importNotes:
          `Paired profile: section column ${pairedProfile.sectionColumn + 1}; ` +
          `card column ${
            pairedProfile.cardNumberColumn === null
              ? 'none'
              : pairedProfile.cardNumberColumn + 1
          }; person columns ${pairedProfile.personColumns
            .map((column) => column + 1)
            .join(', ')} (${pairedProfile.personMode}); affiliation column ${
            pairedProfile.teamColumn + 1
          }; confidence ${Math.round(pairedProfile.confidence * 100)}%. `,
      })

      return NextResponse.json({
        ok: true,
        detectedSource:
          pairedSourceType === 'beckett'
            ? 'Beckett paired Master/Teams checklist'
            : 'Paired Master/Teams XLSX checklist',
        checklistId: persisted.checklist.id,
        checklistName: persisted.checklist.name,
        productId: persisted.product.id,
        productName: persisted.product.display_name,
        importMode: persisted.importMode,
        structure: {
          sectionColumn: pairedProfile.sectionColumn,
          cardNumberColumn: pairedProfile.cardNumberColumn,
          personColumns: pairedProfile.personColumns,
          personMode: pairedProfile.personMode,
          teamColumn: pairedProfile.teamColumn,
          confidence: pairedProfile.confidence,
        },
        files: [{ fileName: uploaded.name, ...stats }],
        totals: {
          files: 1,
          totalRowsSeen: stats.totalRowsSeen,
          normalizedRows: stats.normalizedRows,
          insertedRows: stats.insertedRows,
          skippedRows: stats.skippedRows,
          sectionsCreated: stats.sectionsCreated,
          checklistItemsCreated: stats.checklistItemsCreated,
          teamRowsSeen: stats.teamRowsSeen,
        },
      })
    }
  }

  // Before positional fallbacks, prefer a worksheet with explicit headers that
  // identify the two core card fields: Card # + Player/Item Name. This is the
  // safest fallback for manufacturer/older workbooks because optional fields
  // such as Team/Affiliation are not required. Example layouts such as
  // Subset | Foil | Checklist | Name are therefore read as
  // Section | ... | Card # | Player rather than being forced into a four-column
  // Section | Card # | Player | Team shape.
  let headerCanonical:
    | {
        sheetName: string
        parsed: { sections: string[]; items: ParsedItem[] }
        stats: ImportStats
      }
    | null = null

  for (const sheetName of sheetNames) {
    const rows = (await readSheet(buffer, sheetName)) as SheetRow[]
    const headerRowIndex = guessHeaderRowIndex(rows)
    if (headerRowIndex < 0) continue

    const headers = buildHeaders(rows[headerRowIndex] ?? [])
    const mapping = suggestedMappings(headers)

    // Card number + player/item name are the core identity. Team, affiliation,
    // section and other enrichment fields are optional when the source does not
    // provide them reliably.
    if (mapping.cardNumber === null || mapping.playerName === null) continue

    const probeStats = newStats()
    const parsed = parseGenericRows(rows, headerRowIndex, mapping, probeStats)
    if (parsed.items.length < 5 || parsed.sections.length === 0) continue

    const coreIdentityRatio =
      parsed.items.filter(
        (item) => Boolean(text(item.cardNumber)) && Boolean(text(item.playerName))
      ).length / parsed.items.length

    if (coreIdentityRatio < 0.8) continue

    // Reject only if an optional field was positively detected but is plainly
    // nonsensical. A missing Team/Affiliation is valid.
    validateParsedChecklistStructure(
      parsed,
      `Header-mapped ${sheetName} workbook`
    )

    if (!headerCanonical || parsed.items.length > headerCanonical.parsed.items.length) {
      headerCanonical = { sheetName, parsed, stats: probeStats }
    }
  }

  if (headerCanonical) {
    Object.assign(stats, headerCanonical.stats)
    stats.teamRowsSeen = headerCanonical.parsed.items.filter((item) =>
      Boolean(item.printedTeam)
    ).length

    const metadata = applyProductMetadataOverride(
      inferProductMetadata(uploaded.name),
      metadataOverride
    )
    const headerSourceType =
      normalizedKey(metadata.manufacturer ?? '') === 'panini'
        ? 'manufacturer'
        : 'generic'

    const persisted = await persistChecklist({
      supabase,
      userId,
      uploadedName: uploaded.name,
      metadata,
      parsed: headerCanonical.parsed,
      stats,
      sourceType: headerSourceType,
      importFormat: 'xlsx',
      checklistNotes:
        headerSourceType === 'manufacturer'
          ? 'Imported from a manufacturer XLSX checklist using explicit Card # + Player headers. Optional organization fields were preserved only when confidently identified.'
          : 'Imported from a structured XLSX checklist using explicit Card # + Player headers. Optional organization fields were preserved only when confidently identified.',
      importNotes:
        `Header-mapped canonical worksheet: ${headerCanonical.sheetName}. ` +
        'Card number + player/item name were treated as the core identity; optional fields were not required.',
    })

    return NextResponse.json({
      ok: true,
      detectedSource: 'Structured XLSX checklist',
      checklistId: persisted.checklist.id,
      checklistName: persisted.checklist.name,
      productId: persisted.product.id,
      productName: persisted.product.display_name,
      importMode: persisted.importMode,
      files: [{ fileName: uploaded.name, ...stats }],
      totals: {
        files: 1,
        totalRowsSeen: stats.totalRowsSeen,
        normalizedRows: stats.normalizedRows,
        insertedRows: stats.insertedRows,
        skippedRows: stats.skippedRows,
        sectionsCreated: stats.sectionsCreated,
        checklistItemsCreated: stats.checklistItemsCreated,
        teamRowsSeen: stats.teamRowsSeen,
      },
    })
  }

  // Prefer the strongest already-normalized card index anywhere in the
  // workbook. Real-world workbooks often call this sheet Master, Team Sets,
  // Checklist Index, etc. We intentionally recognize it by structure rather
  // than by worksheet name:
  //   Section | Card # | Player | Team
  //
  // This prevents summary/ranking/helper sheets from winning merely because
  // they contain team names and numbers.
  let canonical:
    | {
        sheetName: string
        parsed: { sections: string[]; items: ParsedItem[] }
        stats: ImportStats
      }
    | null = null

  for (const sheetName of sheetNames) {
    const rows = (await readSheet(buffer, sheetName)) as SheetRow[]
    if (!looksLikeMasterChecklistRows(rows)) continue

    const probeStats = newStats()
    const parsed = parseMasterChecklist(rows, probeStats)

    if (
      parsed.sections.length === 0 ||
      parsed.items.length < 5 ||
      parsed.items.filter((item) => Boolean(item.printedTeam)).length <
        Math.max(5, Math.floor(parsed.items.length * 0.5))
    ) {
      continue
    }

    if (!canonical || parsed.items.length > canonical.parsed.items.length) {
      canonical = { sheetName, parsed, stats: probeStats }
    }
  }

  if (!canonical) {
    for (const sheetName of sheetNames) {
      const rows = (await readSheet(buffer, sheetName)) as SheetRow[]
      if (!looksLikeSectionPlayerTeamRows(rows)) continue

      const probeStats = newStats()
      const parsed = parseSectionPlayerTeamRows(rows, probeStats)

      if (
        parsed.sections.length === 0 ||
        parsed.items.length < 5 ||
        parsed.items.filter((item) => Boolean(item.printedTeam)).length <
          Math.max(5, Math.floor(parsed.items.length * 0.5))
      ) {
        continue
      }

      if (!canonical || parsed.items.length > canonical.parsed.items.length) {
        canonical = { sheetName, parsed, stats: probeStats }
      }
    }
  }

  if (canonical) {
    Object.assign(stats, canonical.stats)
    stats.teamRowsSeen = canonical.parsed.items.filter((item) =>
      Boolean(item.printedTeam)
    ).length

    const metadata = applyProductMetadataOverride(
      inferProductMetadata(uploaded.name),
      metadataOverride
    )
    const canonicalSourceType =
      normalizedKey(metadata.manufacturer ?? '') === 'panini'
        ? 'manufacturer'
        : 'generic'

    const persisted = await persistChecklist({
      supabase,
      userId,
      uploadedName: uploaded.name,
      metadata,
      parsed: canonical.parsed,
      stats,
      sourceType: canonicalSourceType,
      importFormat: 'xlsx',
      checklistNotes:
        canonicalSourceType === 'manufacturer'
          ? 'Imported from a manufacturer XLSX checklist using its strongest canonical card index.'
          : 'Imported from a structured XLSX checklist using its strongest canonical card index.',
      importNotes:
        `Canonical card index worksheet: ${canonical.sheetName}. `,
    })

    return NextResponse.json({
      ok: true,
      detectedSource: 'Structured XLSX checklist',
      checklistId: persisted.checklist.id,
      checklistName: persisted.checklist.name,
      productId: persisted.product.id,
      productName: persisted.product.display_name,
      importMode: persisted.importMode,
      files: [{ fileName: uploaded.name, ...stats }],
      totals: {
        files: 1,
        totalRowsSeen: stats.totalRowsSeen,
        normalizedRows: stats.normalizedRows,
        insertedRows: stats.insertedRows,
        skippedRows: stats.skippedRows,
        sectionsCreated: stats.sectionsCreated,
        checklistItemsCreated: stats.checklistItemsCreated,
        teamRowsSeen: stats.teamRowsSeen,
      },
    })
  }

  // Otherwise inspect each worksheet for repeated card-number + item/name rows.
  // Sheet names help organize sections but are not required for recognition.
  const combinedSections: string[] = []
  const combinedItems: ParsedItem[] = []
  const seenSectionNames = new Set<string>()
  const seenIdentities = new Set<string>()
  let runningSortOrder = 0
  let qualifyingSheets = 0

  let metadataRows: SheetRow[] | null = null

  for (const sheetName of sheetNames) {
    const rows = (await readSheet(buffer, sheetName)) as SheetRow[]

    let parsedSheet:
      | { sections: string[]; items: ParsedItem[]; sortOrder?: number }
      | null = null

    const headerRowIndex = guessHeaderRowIndex(rows)

    if (headerRowIndex >= 0) {
      const headers = buildHeaders(rows[headerRowIndex] ?? [])
      const mapping = suggestedMappings(headers)

      if (mapping.playerName !== null && mapping.cardNumber !== null) {
        const beforeNormalized = stats.normalizedRows
        const parsed = parseGenericRows(rows, headerRowIndex, mapping, stats)

        if (parsed.items.length >= 5) {
          parsedSheet = parsed
          qualifyingSheets += 1
          metadataRows ??= rows

          // Keep sort order continuous across worksheets.
          for (const item of parsedSheet.items) {
            runningSortOrder += 1
            item.sortOrder = runningSortOrder
          }
        } else {
          // parseGenericRows counted rows while probing a non-checklist sheet.
          // Do not let a rejected sheet distort the import summary.
          stats.normalizedRows = beforeNormalized
        }
      }
    }

    if (!parsedSheet && looksLikeSimpleChecklistRows(rows)) {
      qualifyingSheets += 1
      const parsed = parseSimpleChecklistSheet(
        rows,
        sheetName,
        stats,
        runningSortOrder
      )
      runningSortOrder = parsed.sortOrder
      parsedSheet = parsed
      metadataRows ??= rows
    }

    if (!parsedSheet) continue

    for (const sectionName of parsedSheet.sections) {
      const normalized = normalizedKey(sectionName)
      if (!seenSectionNames.has(normalized)) {
        seenSectionNames.add(normalized)
        combinedSections.push(sectionName)
      }
    }

    for (const item of parsedSheet.items) {
      const identity = itemKey(item.sectionName, item.cardNumber, item.playerName)
      if (seenIdentities.has(identity)) {
        stats.skippedRows += 1
        continue
      }
      seenIdentities.add(identity)
      combinedItems.push(item)
    }
  }

  if (qualifyingSheets === 0 || combinedItems.length < 5) {
    return null
  }

  const metadata = applyProductMetadataOverride(
    metadataRows
      ? inferStructuredMetadataFromRows(uploaded.name, metadataRows)
      : inferProductMetadata(uploaded.name),
    metadataOverride
  )
  const parsed = { sections: combinedSections, items: combinedItems }
  const persisted = await persistChecklist({
    supabase,
    userId,
    uploadedName: uploaded.name,
    metadata,
    parsed,
    stats,
    sourceType:
      normalizedKey(metadata.manufacturer ?? '') === 'panini'
        ? 'manufacturer'
        : 'generic',
    importFormat: 'xlsx',
    checklistNotes:
      normalizedKey(metadata.manufacturer ?? '') === 'panini'
        ? 'Imported automatically from a manufacturer XLSX checklist. Worksheet names were used only as organizational clues.'
        : 'Imported automatically from a structured XLSX checklist. Worksheet names were used only as organizational clues.',
    importNotes:
      `Recognized checklist worksheets: ${qualifyingSheets}. `,
  })

  return NextResponse.json({
    ok: true,
    detectedSource: 'Structured XLSX checklist',
    checklistId: persisted.checklist.id,
    checklistName: persisted.checklist.name,
    productId: persisted.product.id,
    productName: persisted.product.display_name,
    importMode: persisted.importMode,
    files: [{ fileName: uploaded.name, ...stats }],
    totals: {
      files: 1,
      totalRowsSeen: stats.totalRowsSeen,
      normalizedRows: stats.normalizedRows,
      insertedRows: stats.insertedRows,
      skippedRows: stats.skippedRows,
      sectionsCreated: stats.sectionsCreated,
      checklistItemsCreated: stats.checklistItemsCreated,
      teamRowsSeen: stats.teamRowsSeen,
    },
  })
}

async function handleBeckettImport(params: {
  uploaded: File
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  metadataOverride?: ProductMetadataOverride | null
}) {
  const { uploaded, supabase, userId, metadataOverride } = params
  const stats = newStats()

  if (!uploaded.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json(
      {
        ok: false,
        error: 'This Beckett import adapter currently accepts .xlsx workbooks.',
      },
      { status: 400 }
    )
  }

  if (uploaded.size <= 0 || uploaded.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'The checklist workbook is empty or larger than the 15 MB import limit.',
      },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await uploaded.arrayBuffer())
  validateXlsxArchive(buffer)

  let fullRows: SheetRow[]
  let teamRowsRaw: SheetRow[]

  const workbookSheetNames = readWorkbookSheetNames(buffer)
  const beckettTeamSheetName =
    workbookSheetNames.find(
      (name) => normalizedKey(name) === 'team sets'
    ) ??
    workbookSheetNames.find(
      (name) => normalizedKey(name) === 'teams'
    ) ??
    null

  try {
    fullRows = (await readSheet(buffer, 'Full Checklist')) as SheetRow[]
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '')

    if (
      message.toLowerCase().includes('sheet') &&
      message.toLowerCase().includes('not')
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This workbook does not contain the Beckett "Full Checklist" sheet.',
        },
        { status: 400 }
      )
    }

    throw error
  }

  if (!beckettTeamSheetName) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'This workbook does not contain a Beckett "Team Sets" or "Teams" sheet.',
      },
      { status: 400 }
    )
  }

  try {
    teamRowsRaw = (await readSheet(buffer, beckettTeamSheetName)) as SheetRow[]
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '')

    if (
      message.toLowerCase().includes('sheet') &&
      message.toLowerCase().includes('not')
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'This workbook does not contain a readable Beckett team index sheet.',
        },
        { status: 400 }
      )
    }

    throw error
  }

  const parsed = parseFullChecklist(fullRows, stats)
  const teamRows = parseTeamSets(teamRowsRaw, stats)
  const teamMatches = applyTeamSetData(parsed.items, teamRows)

  if (parsed.sections.length === 0 || parsed.items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No checklist sections or card rows could be recognized in the Beckett workbook.',
      },
      { status: 400 }
    )
  }

  if (teamRows.length > 0 && teamMatches === 0) {
    stats.errors.push(
      'The Team Sets sheet was found, but no rows matched Full Checklist rows exactly. The checklist was not imported.'
    )

    return NextResponse.json(
      {
        ok: false,
        error:
          'Team Sets could not be matched to the Full Checklist. Import stopped so the source data can be reviewed safely.',
        files: [{ fileName: uploaded.name, ...stats }],
      },
      { status: 400 }
    )
  }

  const metadata = applyProductMetadataOverride(
    inferProductMetadata(uploaded.name),
    metadataOverride
  )

  const persisted = await persistChecklist({
    supabase,
    userId,
    uploadedName: uploaded.name,
    metadata,
    parsed,
    stats,
    sourceType: 'beckett',
    importFormat: 'xlsx',
    checklistNotes: `Imported from Beckett XLSX. Team Sets matched ${teamMatches} of ${teamRows.length} team rows.`,
    importNotes: `Full Checklist rows seen: ${stats.totalRowsSeen}. Team Sets rows: ${stats.teamRowsSeen}. Exact Team Sets matches: ${teamMatches}. `,
  })

  return NextResponse.json({
    ok: true,
    checklistId: persisted.checklist.id,
    checklistName: persisted.checklist.name,
    productId: persisted.product.id,
    productName: persisted.product.display_name,
    importMode: persisted.importMode,
    files: [{ fileName: uploaded.name, ...stats }],
    totals: {
      files: 1,
      totalRowsSeen: stats.totalRowsSeen,
      normalizedRows: stats.normalizedRows,
      insertedRows: stats.insertedRows,
      skippedRows: stats.skippedRows,
      sectionsCreated: stats.sectionsCreated,
      checklistItemsCreated: stats.checklistItemsCreated,
      teamRowsSeen: stats.teamRowsSeen,
    },
  })
}

function inferChecklistInsiderMetadata(fileName: string): ProductMetadata {
  const base = fileName
    .replace(/\.xlsx$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\bchecklist\s+insider\b/gi, ' ')
    .replace(/\bchecklist\b/gi, ' ')
    .replace(/\binsider\b/gi, ' ')
    .replace(/\bdownloads?\b/gi, ' ')
    .replace(/\bexcel\b/gi, ' ')
    .replace(/\bspreadsheet\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const yearMatch = base.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch?.[0] ?? null
  const withoutYear = year ? base.replace(year, '').trim() : base
  const productName = withoutYear || 'Imported Checklist'
  const sportOrGame = 'Baseball'
  const manufacturer = /\bbowman\b/i.test(base) ? 'Topps' : null
  const brand = /\bbowman\b/i.test(base) ? 'Bowman' : null

  return buildProductKey({
    category: 'Sports Cards',
    sportOrGame,
    year,
    manufacturer,
    brand,
    productName,
    editionName: /\bmega box\b/i.test(productName) ? 'Mega Box' : null,
  })
}


function scoreChecklistInsiderTeamsLayout(
  rows: SheetRow[],
  layout: {
    section: number
    cardNumber: number
    playerName: number
    printedTeam: number
  }
) {
  let score = 0

  for (const row of rows.slice(0, 300)) {
    const sectionName = text(row[layout.section])
    const cardNumber = text(row[layout.cardNumber])
    const playerName = cleanPlayer(row[layout.playerName])
    const printedTeam = text(row[layout.printedTeam])

    if (
      sectionName &&
      playerName &&
      printedTeam &&
      (cardNumber === '' || looksLikeCardNumber(cardNumber))
    ) {
      score += 1
    }
  }

  return score
}

function parseChecklistInsiderTeamsSheet(
  rows: SheetRow[],
  stats: ImportStats
) {
  const layouts = [
    {
      // Section | Card # | Player | Team | detail
      section: 0,
      cardNumber: 1,
      playerName: 2,
      printedTeam: 3,
      marker: 4,
    },
    {
      // Team | Section | Card # | Player | detail
      section: 1,
      cardNumber: 2,
      playerName: 3,
      printedTeam: 0,
      marker: 4,
    },
  ]

  const ranked = layouts
    .map((layout) => ({
      layout,
      score: scoreChecklistInsiderTeamsLayout(rows, layout),
    }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]

  if (!best || best.score < 5) return null

  const items: ParsedItem[] = []
  const sections: string[] = []
  const seenSections = new Set<string>()
  const seenItems = new Set<string>()
  let sortOrder = 0

  for (const row of rows) {
    stats.totalRowsSeen += 1

    const sectionName = text(row[best.layout.section])
    const cardNumber = text(row[best.layout.cardNumber])
    const playerName = cleanPlayer(row[best.layout.playerName])
    const printedTeam = text(row[best.layout.printedTeam]) || null
    const marker = text(row[best.layout.marker])

    if (!sectionName || !playerName || !printedTeam) continue

    if (
      normalizedKey(sectionName) === 'section' ||
      normalizedKey(sectionName) === 'card set'
    ) {
      continue
    }

    if (cardNumber && !looksLikeCardNumber(cardNumber)) continue

    const key = itemKey(sectionName, cardNumber, playerName)

    if (seenItems.has(key)) {
      stats.skippedRows += 1
      continue
    }

    seenItems.add(key)

    const sectionKey = normalizedKey(sectionName)
    if (!seenSections.has(sectionKey)) {
      seenSections.add(sectionKey)
      sections.push(sectionName)
    }

    sortOrder += 1
    const flags = flagsFromRow(sectionName, marker)

    items.push({
      sectionName,
      cardNumber,
      playerName,
      printedTeam,
      rookieFlag: flags.rookieFlag,
      autoFlag: flags.autoFlag,
      relicFlag: flags.relicFlag,
      serialFlag: flags.serialFlag,
      printRun: parsePrintRun(marker),
      variation: sectionKey.includes('variation') ? sectionName : null,
      parallelName: null,
      notes: marker || null,
      sortOrder,
      people: splitPeople(playerName, printedTeam),
    })

    stats.normalizedRows += 1
  }

  stats.teamRowsSeen = items.length

  if (items.length < 5 || sections.length === 0) return null

  return { sections, items }
}

function looksLikeChecklistInsiderRows(rows: SheetRow[]) {
  const sample = rows.slice(0, 250)
  let sectionRows = 0
  let cardRows = 0
  let rowsWithThirdColumn = 0

  for (const row of sample) {
    const values = row.map((value) => text(value)).filter(Boolean)
    if (values.length === 1 && !looksLikeCardNumber(values[0])) {
      sectionRows += 1
      continue
    }

    if (
      values.length >= 2 &&
      looksLikeCardNumber(text(row[0])) &&
      Boolean(text(row[1]))
    ) {
      cardRows += 1
      if (Boolean(text(row[2]))) rowsWithThirdColumn += 1
    }
  }

  return sectionRows >= 1 && cardRows >= 5 && rowsWithThirdColumn >= 5
}

async function handleChecklistInsiderImport(params: {
  uploaded: File
  buffer: Buffer
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  metadataOverride?: ProductMetadataOverride | null
}) {
  const { uploaded, buffer, supabase, userId, metadataOverride } = params
  const stats = newStats()
  const rawRows = await readSheet(buffer)
  const rows: SheetRow[] = rawRows.map((row) =>
    row.map((value) => {
      if (value === null || value === undefined) return null
      if (value instanceof Date) return value
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value
      return String(value)
    })
  )

  if (!looksLikeChecklistInsiderRows(rows)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Unsupported checklist format. HITS currently supports Beckett and Checklist Insider XLSX checklist files. If you would like another source supported, please submit a feature request.',
      },
      { status: 400 }
    )
  }

  // Some Checklist Insider workbooks include a dedicated Teams worksheet
  // that is already normalized as either:
  //   Section | Card # | Player | Team
  // or
  //   Team | Section | Card # | Player
  // Prefer that structural index when available. It prevents parallel,
  // packaging, odds, and count notes on the display sheets from being
  // mistaken for checklist section names.
  const sheetNames = readWorkbookSheetNames(buffer)
  const teamsSheetName =
    sheetNames.find((name) => normalizedKey(name) === 'teams') ?? null

  let parsed: { sections: string[]; items: ParsedItem[] } | null = null

  if (teamsSheetName) {
    const rawTeamRows = (await readSheet(buffer, teamsSheetName)) as SheetRow[]
    const teamRows: SheetRow[] = rawTeamRows.map((row) =>
      row.map((value) => {
        if (value === null || value === undefined) return null
        if (value instanceof Date) return value
        if (typeof value === 'number') return value
        if (typeof value === 'boolean') return value
        return String(value)
      })
    )

    parsed = parseChecklistInsiderTeamsSheet(teamRows, stats)
  }

  if (!parsed) {
    const mapping = suggestedMappingsFromRows(rows)
    parsed = parseGenericRows(rows, -1, mapping, stats)
  }

  if (parsed.sections.length === 0 || parsed.items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'HITS recognized a Checklist Insider workbook but could not safely identify its checklist rows. Nothing was imported.',
      },
      { status: 400 }
    )
  }

  validateChecklistInsiderTeams(parsed)

  const metadata = applyProductMetadataOverride(
    inferChecklistInsiderMetadata(uploaded.name),
    metadataOverride
  )
  const persisted = await persistChecklist({
    supabase,
    userId,
    uploadedName: uploaded.name,
    metadata,
    parsed,
    stats,
    sourceType: 'checklist_insider',
    importFormat: 'xlsx',
    checklistNotes: `Imported automatically from Checklist Insider XLSX: ${uploaded.name}.`,
    importNotes: `Checklist Insider rows seen: ${stats.totalRowsSeen}. ${
      stats.teamRowsSeen > 0
        ? 'Dedicated Teams worksheet used as the canonical checklist index. '
        : ''
    }`,
  })

  return NextResponse.json({
    ok: true,
    detectedSource: 'Checklist Insider',
    checklistId: persisted.checklist.id,
    checklistName: persisted.checklist.name,
    productId: persisted.product.id,
    productName: persisted.product.display_name,
    importMode: persisted.importMode,
    files: [{ fileName: uploaded.name, ...stats }],
    totals: {
      files: 1,
      totalRowsSeen: stats.totalRowsSeen,
      normalizedRows: stats.normalizedRows,
      insertedRows: stats.insertedRows,
      skippedRows: stats.skippedRows,
      sectionsCreated: stats.sectionsCreated,
      checklistItemsCreated: stats.checklistItemsCreated,
      teamRowsSeen: stats.teamRowsSeen,
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'You must be signed in to import a checklist.' },
      { status: 401 }
    )
  }

  const signedInEmail = String(user.email ?? '').trim().toLowerCase()

  if (!signedInEmail) {
    return NextResponse.json(
      { ok: false, error: 'Your account email could not be verified.' },
      { status: 403 }
    )
  }

  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('role, is_active')
    .ilike('email', signedInEmail)
    .maybeSingle()

  if (appUserError) {
    console.error('Checklist import admin lookup failed:', appUserError)
    return NextResponse.json(
      { ok: false, error: 'HITS could not verify checklist import access.' },
      { status: 500 }
    )
  }

  if (!appUser?.is_active || String(appUser.role ?? '').toLowerCase() !== 'admin') {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Checklist Library imports are managed by HITS administrators. You can still browse and use the shared checklist library.',
      },
      { status: 403 }
    )
  }

  try {
    const formData = await request.formData()
    const uploaded = formData.get('file')
    const metadataOverrideRaw = formData.get('metadataOverride')

    let metadataOverride: ProductMetadataOverride | null = null

    if (typeof metadataOverrideRaw === 'string' && metadataOverrideRaw.trim()) {
      try {
        metadataOverride = JSON.parse(
          metadataOverrideRaw
        ) as ProductMetadataOverride
      } catch {
        return NextResponse.json(
          { ok: false, error: 'Product identity information is invalid.' },
          { status: 400 }
        )
      }
    }

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'No checklist file was received.' },
        { status: 400 }
      )
    }

    if (!uploaded.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unsupported checklist format. HITS currently supports Beckett and Checklist Insider XLSX checklist files.',
        },
        { status: 400 }
      )
    }

    if (uploaded.size <= 0 || uploaded.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: 'The checklist workbook is empty or larger than the 15 MB import limit.',
        },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer())
    validateXlsxArchive(buffer)

    const sheetNames = readWorkbookSheetNames(buffer)
    const normalizedSheetNames = new Set(
      sheetNames.map((name) => normalizedKey(name))
    )

    // Preserve the proven Beckett adapter when its richer paired sheets exist,
    // but do not require those exact worksheet names for checklist recognition.
    if (
      normalizedSheetNames.has('full checklist') &&
      (
        normalizedSheetNames.has('team sets') ||
        normalizedSheetNames.has('teams')
      )
    ) {
      const beckettTeamSheetName =
        sheetNames.find((name) => normalizedKey(name) === 'team sets') ??
        sheetNames.find((name) => normalizedKey(name) === 'teams') ??
        null

      if (beckettTeamSheetName) {
        const beckettTeamRows = (await readSheet(
          buffer,
          beckettTeamSheetName
        )) as SheetRow[]

        if (looksLikeParentAffiliateTeamIndex(beckettTeamRows)) {
          const hierarchyResult = await handleStructuredWorkbookImport({
            uploaded,
            buffer,
            sheetNames,
            supabase,
            userId: user.id,
            metadataOverride,
          })

          if (hierarchyResult) return hierarchyResult
        }
      }

      return handleBeckettImport({
        uploaded,
        supabase,
        userId: user.id,
        metadataOverride,
      })
    }

    const hasMasterLikeSheet = sheetNames.some((name) => {
      const normalized = normalizedKey(name)
      return normalized === 'master' || normalized === 'master checklist'
    })

    if (hasMasterLikeSheet) {
      const masterStructuredResult = await handleStructuredWorkbookImport({
        uploaded,
        buffer,
        sheetNames,
        supabase,
        userId: user.id,
        metadataOverride,
      })

      if (masterStructuredResult) return masterStructuredResult
    }

    // A workbook can look superficially like Checklist Insider on its first
    // sheet while also carrying a richer Teams index with both immediate
    // affiliate and parent organization. Give that explicit relationship
    // priority before source-style recognition so Pro Debut-like products are
    // organized Parent Team -> Affiliate -> original checklist section.
    let hasParentAffiliateIndex = false
    for (const sheetName of sheetNames) {
      const normalized = normalizedKey(sheetName)
      if (normalized !== 'teams' && normalized !== 'team sets') continue

      const candidateRows = (await readSheet(buffer, sheetName)) as SheetRow[]
      if (looksLikeParentAffiliateTeamIndex(candidateRows)) {
        hasParentAffiliateIndex = true
        break
      }
    }

    if (hasParentAffiliateIndex) {
      const hierarchyResult = await handleStructuredWorkbookImport({
        uploaded,
        buffer,
        sheetNames,
        supabase,
        userId: user.id,
        metadataOverride,
      })

      if (hierarchyResult) return hierarchyResult
    }

    // Preserve the proven Checklist Insider path when the first worksheet has
    // its known sectioned card-list structure and actually contains a third
    // data column. Two-column Topps/Beckett-style files are handled by the
    // structural importer instead.
    const firstRows = (await readSheet(buffer, sheetNames[0])) as SheetRow[]
    if (looksLikeChecklistInsiderRows(firstRows)) {
      return handleChecklistInsiderImport({
        uploaded,
        buffer,
        supabase,
        userId: user.id,
        metadataOverride,
      })
    }

    // For other legitimate XLSX checklist layouts, inspect the workbook's
    // structure. Worksheet names can organize sections, but card-like row
    // patterns determine whether the workbook is safe to import.
    const structuredResult = await handleStructuredWorkbookImport({
      uploaded,
      buffer,
      sheetNames,
      supabase,
      userId: user.id,
      metadataOverride,
    })

    if (structuredResult) return structuredResult

    return NextResponse.json(
      {
        ok: false,
        error:
          'HITS could not confidently identify checklist card rows in this workbook. Nothing was imported.',
      },
      { status: 400 }
    )
  } catch (error) {
    console.error('Checklist import failed:', error)

    const message =
      error instanceof Error ? error.message : 'Checklist import failed.'

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
