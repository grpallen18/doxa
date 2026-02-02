import { Panel } from '@/components/Panel'
import { Viewpoint } from '@/lib/types'

type PartyAgreement = {
  stronglyAgree: number
  somewhatAgree: number
  somewhatDisagree: number
  stronglyDisagree: number
}

type AgreementByParty = {
  republican: PartyAgreement
  independent: PartyAgreement
  democrat: PartyAgreement
}

export function getFabricatedAgreement(viewpointName: string): AgreementByParty {
  const name = viewpointName.toLowerCase()
  if (name.includes('conservative')) {
    return {
      republican: { stronglyAgree: 45, somewhatAgree: 30, somewhatDisagree: 15, stronglyDisagree: 10 },
      independent: { stronglyAgree: 20, somewhatAgree: 35, somewhatDisagree: 25, stronglyDisagree: 20 },
      democrat: { stronglyAgree: 5, somewhatAgree: 15, somewhatDisagree: 40, stronglyDisagree: 40 },
    }
  }
  if (name.includes('progressive')) {
    return {
      republican: { stronglyAgree: 5, somewhatAgree: 15, somewhatDisagree: 35, stronglyDisagree: 45 },
      independent: { stronglyAgree: 15, somewhatAgree: 30, somewhatDisagree: 35, stronglyDisagree: 20 },
      democrat: { stronglyAgree: 40, somewhatAgree: 35, somewhatDisagree: 15, stronglyDisagree: 10 },
    }
  }
  if (name.includes('libertarian')) {
    return {
      republican: { stronglyAgree: 25, somewhatAgree: 35, somewhatDisagree: 25, stronglyDisagree: 15 },
      independent: { stronglyAgree: 30, somewhatAgree: 40, somewhatDisagree: 20, stronglyDisagree: 10 },
      democrat: { stronglyAgree: 15, somewhatAgree: 25, somewhatDisagree: 35, stronglyDisagree: 25 },
    }
  }
  return {
    republican: { stronglyAgree: 25, somewhatAgree: 35, somewhatDisagree: 25, stronglyDisagree: 15 },
    independent: { stronglyAgree: 22, somewhatAgree: 38, somewhatDisagree: 28, stronglyDisagree: 12 },
    democrat: { stronglyAgree: 20, somewhatAgree: 30, somewhatDisagree: 30, stronglyDisagree: 20 },
  }
}

type ViewpointStatisticsCardProps = {
  viewpoint: Viewpoint
  showHeading?: boolean
  /** When true, omit the Panel wrapper so the content sits inside a parent Panel. */
  embedInPanel?: boolean
}

const PARTIES = ['republican', 'independent', 'democrat'] as const
const PARTY_LABELS: Record<(typeof PARTIES)[number], string> = {
  republican: 'Republican',
  independent: 'Independent',
  democrat: 'Democrat',
}
const LEVELS: (keyof PartyAgreement)[] = [
  'stronglyAgree',
  'somewhatAgree',
  'somewhatDisagree',
  'stronglyDisagree',
]
const LEVEL_LABELS: Record<keyof PartyAgreement, string> = {
  stronglyAgree: 'Strongly agree',
  somewhatAgree: 'Somewhat agree',
  somewhatDisagree: 'Somewhat disagree',
  stronglyDisagree: 'Strongly disagree',
}

/** Fabricated sample sizes per party (same for all viewpoints until polling is live). */
const SAMPLE_SIZE_BY_PARTY: Record<(typeof PARTIES)[number], number> = {
  republican: 1200,
  independent: 847,
  democrat: 800,
}

const TOTAL_SAMPLE =
  SAMPLE_SIZE_BY_PARTY.republican + SAMPLE_SIZE_BY_PARTY.independent + SAMPLE_SIZE_BY_PARTY.democrat

/** Weighted average % for one response level across parties: sum(pct/100 * n) / total * 100 */
function weightedPct(agreement: AgreementByParty, level: keyof PartyAgreement): number {
  let count = 0
  for (const party of PARTIES) {
    count += (agreement[party][level] / 100) * SAMPLE_SIZE_BY_PARTY[party]
  }
  return (count / TOTAL_SAMPLE) * 100
}

/** One panel showing agreement-by-party stats for a single viewpoint. */
export function ViewpointStatisticsCard({
  topicViewpoint,
  showHeading = false,
  embedInPanel = false,
}: ViewpointStatisticsCardProps) {
  const agreement = getFabricatedAgreement(topicViewpoint.viewpoint.name)
  const content = (
    <div className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[160px] border-collapse text-xs text-muted">
            <thead>
              <tr>
                <th className="border-b border-subtle pb-1 pr-2 text-left font-medium text-foreground">
                  Sample size
                </th>
                {PARTIES.map((party) => (
                  <th
                    key={party}
                    className="border-b border-subtle pb-1 pl-1 text-right font-medium text-foreground"
                  >
                    {SAMPLE_SIZE_BY_PARTY[party].toLocaleString()}
                  </th>
                ))}
                <th className="border-b border-subtle pb-1 pl-1 text-right font-medium text-foreground">
                  {TOTAL_SAMPLE.toLocaleString()}
                </th>
              </tr>
              <tr>
                <th className="border-b border-subtle pb-1 pr-2 text-left font-medium text-foreground">
                  Response
                </th>
                {PARTIES.map((party) => (
                  <th
                    key={party}
                    className="border-b border-subtle pb-1 pl-1 text-right font-medium text-foreground"
                  >
                    {PARTY_LABELS[party]}
                  </th>
                ))}
                <th className="border-b border-subtle pb-1 pl-1 text-right font-medium text-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((level) => (
                <tr key={level}>
                  <td className="py-1 pr-2 text-left">{LEVEL_LABELS[level]}</td>
                  {PARTIES.map((party) => (
                    <td key={party} className="py-1 pl-1 text-right">
                      {agreement[party][level]}%
                    </td>
                  ))}
                  <td className="py-1 pl-1 text-right">
                    {weightedPct(agreement, level).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  )
  if (embedInPanel) {
    return <div className="min-w-0 space-y-4 p-5">{content}</div>
  }
  return (
    <Panel variant="soft" interactive={false} className="min-w-0 space-y-4 p-5">
      {content}
    </Panel>
  )
}

type ViewpointStatisticsProps = {
  viewpoints: Viewpoint[]
}

export function ViewpointStatistics({ viewpoints }: ViewpointStatisticsProps) {
  if (!viewpoints?.length) return null

  return (
    <>
      {viewpoints.map((v, index) => (
        <ViewpointStatisticsCard
          key={v.viewpoint_id}
          viewpoint={v}
          showHeading={index === 0}
        />
      ))}
    </>
  )
}
