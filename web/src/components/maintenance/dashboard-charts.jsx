import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const PIE_COLORS = ["#0f766e", "#0891b2", "#2563eb", "#65a30d", "#ea580c", "#dc2626"];
const tooltipContentStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "12px",
  color: "hsl(var(--foreground))",
  boxShadow: "0 12px 30px -18px rgba(15, 23, 42, 0.45)",
};

const tooltipLabelStyle = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
};

const tooltipItemStyle = {
  color: "hsl(var(--foreground))",
};

const chartAxisStyle = {
  fontSize: 12,
  fill: "hsl(var(--muted-foreground))",
};

export function DashboardCharts({ yearly = [], activities = [] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="min-w-0 border-border/70">
        <CardHeader className="pb-2">
          <CardTitle>Maintenance per Tahun</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {yearly.length ? (
            <div className="h-[320px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                <BarChart data={yearly}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                  <XAxis dataKey="tahun" tick={chartAxisStyle} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={chartAxisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  />
                  <Bar
                    dataKey="total_maintenance"
                    name="Maintenance"
                    fill="#0f766e"
                    radius={[10, 10, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Grafik tahunan belum tersedia"
              description="Tambahkan data maintenance atau ubah filter agar ringkasan tahunan muncul."
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 border-border/70">
        <CardHeader className="pb-2">
          <CardTitle>Maintenance per Jenis Kegiatan</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {activities.length ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
              <div className="h-[320px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                  <PieChart>
                    <Pie
                      data={activities}
                      dataKey="total_maintenance"
                      nameKey="jenis_kegiatan"
                      innerRadius={70}
                      outerRadius={105}
                      paddingAngle={4}
                    >
                      {activities.map((entry, index) => (
                        <Cell key={entry.jenis_kegiatan} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3 lg:pl-3">
                {activities.map((item, index) => (
                  <div
                    key={item.jenis_kegiatan}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-muted/45 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-sm font-medium capitalize">
                        {item.jenis_kegiatan}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {item.total_maintenance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Grafik kegiatan belum tersedia"
              description="Belum ada data yang cocok dengan filter untuk divisualisasikan."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
