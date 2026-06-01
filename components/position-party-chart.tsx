'use client'

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { PartyAgreement } from '@/lib/mock/topic-explore'

const REP_COLOR = '#991b1b'
const DEM_COLOR = '#2563eb'

export function PositionPartyChart({ agreement }: { agreement: PartyAgreement }) {
  const data = [
    { party: 'Republican', agreePct: agreement.republican },
    { party: 'Democrat', agreePct: agreement.democrat },
  ]

  return (
    <div className="h-[100px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="8%"
          barGap={2}
        >
          <XAxis
            dataKey="party"
            tick={{ fontSize: 9, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            tickMargin={2}
            interval={0}
            padding={{ left: 0, right: 0 }}
            height={22}
          />
          <YAxis hide domain={[0, 100]} />
          <Bar dataKey="agreePct" radius={[2, 2, 0, 0]}>
            {data.map((row) => (
              <Cell
                key={row.party}
                fill={row.party === 'Republican' ? REP_COLOR : DEM_COLOR}
              />
            ))}
            <LabelList
              dataKey="agreePct"
              position="top"
              offset={4}
              formatter={(value: number) => `${value}%`}
              className="fill-foreground text-[10px] font-medium"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
