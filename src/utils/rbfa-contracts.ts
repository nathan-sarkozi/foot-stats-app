import { z } from 'zod'
import { isValidRbfaStartTime } from './rbfaDate'

const nonEmptyString = z.string().refine(value => value.trim().length > 0)
const teamId = z.union([nonEmptyString, z.number().finite()])
const numberOrNumericString = z.union([
  z.number().finite(),
  z.string().refine(value => /^[+-]?\d+(?:\.\d+)?$/.test(value.trim())),
]).nullable()

const matchTeamSchema = z.looseObject({
  name: nonEmptyString,
  logo: z.string().nullable().optional(),
})

// Keep all additional RBFA fields in the JSON cache. Only the fields consumed by
// the widget are checked, and missing required fields never mean an empty result.
export const UpcomingMatchSchema = z.looseObject({
  homeTeam: matchTeamSchema,
  awayTeam: matchTeamSchema,
  startTime: z.string().refine(isValidRbfaStartTime).nullable(),
  series: z.looseObject({ name: z.string().nullable().optional() }).nullable().optional(),
})

export const RankingsSchema = z.looseObject({
  teams: z.array(z.looseObject({
    teamId,
    name: nonEmptyString,
    logo: z.string().nullable().optional(),
    position: numberOrNumericString,
    points: numberOrNumericString,
    matchesPlayed: numberOrNumericString,
    goalDifference: numberOrNumericString,
  })),
})

export type UpcomingMatch = z.infer<typeof UpcomingMatchSchema>
export type Rankings = z.infer<typeof RankingsSchema>

export class RbfaDataError extends Error {
  readonly code: 'GRAPHQL_ERROR' | 'INVALID_RESPONSE'

  constructor(code: 'GRAPHQL_ERROR' | 'INVALID_RESPONSE') {
    super(code === 'GRAPHQL_ERROR'
      ? 'La réponse GraphQL RBFA signale un échec.'
      : 'La réponse RBFA est invalide ou incomplète.')
    this.name = 'RbfaDataError'
    this.code = code
  }
}

const envelopeSchema = z.looseObject({
  data: z.record(z.string(), z.unknown()),
  errors: z.array(z.unknown()).optional(),
})

function readGraphQLData(input: unknown): Record<string, unknown> {
  // GraphQL may return HTTP 200 and partial data alongside errors. None of that
  // data is authoritative enough to replace a previously successful snapshot.
  if (typeof input === 'object' && input !== null && 'errors' in input
    && Array.isArray(input.errors) && input.errors.length > 0) {
    throw new RbfaDataError('GRAPHQL_ERROR')
  }
  const result = envelopeSchema.safeParse(input)
  if (!result.success) throw new RbfaDataError('INVALID_RESPONSE')
  return result.data.data
}

export function parseUpcomingResponse(input: unknown): UpcomingMatch | null {
  const data = readGraphQLData(input)
  const result = z.looseObject({ upcomingMatch: UpcomingMatchSchema.nullable() }).safeParse(data)
  if (!result.success) throw new RbfaDataError('INVALID_RESPONSE')
  return result.data.upcomingMatch
}

export function parseRankingsResponse(input: unknown): Rankings | null {
  const data = readGraphQLData(input)
  const result = z.looseObject({
    teamSeriesAndRankings: z.looseObject({ rankings: z.array(z.unknown()) }),
  }).safeParse(data)
  if (!result.success) throw new RbfaDataError('INVALID_RESPONSE')

  const groups = result.data.teamSeriesAndRankings.rankings
  if (groups.length === 0) return null
  const group = z.looseObject({ rankings: z.array(z.unknown()) }).safeParse(groups[0])
  if (!group.success) throw new RbfaDataError('INVALID_RESPONSE')
  if (group.data.rankings.length === 0) return null

  // Preserve the historical selection: the first table of the first series.
  const table = RankingsSchema.safeParse(group.data.rankings[0])
  if (!table.success) throw new RbfaDataError('INVALID_RESPONSE')
  return table.data
}
