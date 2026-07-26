import { MetricCard } from "./metric-card";

export function MetricCardsDemo() {
  return (
    <section className="bg-[#fafafa] p-6 sm:p-10">
      <div className="grid max-w-[1040px] grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Order"
          subtitle="Last week"
          value="124K"
          change="+12.6%"
          chart="bars"
          data={[35, 78, 55, 32, 86, 35, 51]}
        />

        <MetricCard
          title="Sales Growth"
          subtitle="Last 12 Days"
          value="$12K"
          change="-18%"
          chart="area"
          data={[42, 35, 49, 37, 65, 92, 61, 41, 69, 66, 56, 48]}
        />

        <MetricCard
          title="Profit"
          subtitle="Last Month"
          value="624K"
          change="+12.6%"
          chart="line"
          data={[18, 62, 38, 78, 58, 84]}
        />

        <MetricCard
          title="Impression"
          subtitle="Last year"
          value="175K"
          change="+24%"
          chart="step"
          data={[15, 15, 39, 39, 24, 24, 6, 6, 38, 38, 76, 76]}
        />

        <MetricCard
          title="User reach"
          subtitle="Last week"
          value="32K"
          change="+12%"
          chart="donut"
          donutValue={72}
          centerValue="500"
          centerLabel="Visitors"
        />
      </div>
    </section>
  );
}
