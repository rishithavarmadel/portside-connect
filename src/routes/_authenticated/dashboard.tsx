import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ClipboardCheck, Route as RouteIcon, Wallet, UserPlus, IndianRupee } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const today = () => new Date().toISOString().slice(0, 10);

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", today()],
    queryFn: async () => {
      const d = today();
      const [drivers, present, trips, advances] = await Promise.all([
        supabase.from("drivers").select("id", { count: "exact", head: true }),
        supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", d).eq("status", "present"),
        supabase.from("trips").select("trip_count").eq("date", d),
        supabase.from("advances").select("amount").eq("date", d),
      ]);
      const tripsTotal = (trips.data ?? []).reduce((s, r) => s + (r.trip_count ?? 0), 0);
      const advTotal = (advances.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      return {
        totalDrivers: drivers.count ?? 0,
        presentToday: present.count ?? 0,
        tripsToday: tripsTotal,
        advancesToday: advTotal,
      };
    },
  });
}

function StatCard({ label, value, icon: Icon, tint }: { label: string; value: string | number; icon: React.ElementType; tint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</div>
            <div className="text-2xl font-bold truncate">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useDashboardStats();
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Drivers" value={isLoading ? "…" : data!.totalDrivers} icon={Users} tint="bg-blue-100 text-blue-700" />
        <StatCard label="Present today" value={isLoading ? "…" : data!.presentToday} icon={ClipboardCheck} tint="bg-green-100 text-green-700" />
        <StatCard label="Trips today" value={isLoading ? "…" : data!.tripsToday} icon={RouteIcon} tint="bg-amber-100 text-amber-700" />
        <StatCard label="Advances today" value={isLoading ? "…" : inr.format(data!.advancesToday)} icon={Wallet} tint="bg-rose-100 text-rose-700" />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button asChild size="lg" className="h-16 justify-start">
            <Link to="/attendance"><ClipboardCheck className="mr-2 h-5 w-5" />Mark attendance</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-16 justify-start">
            <Link to="/trips"><RouteIcon className="mr-2 h-5 w-5" />Log trips</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-16 justify-start">
            <Link to="/advances"><IndianRupee className="mr-2 h-5 w-5" />Add advance</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="h-16 justify-start">
            <Link to="/drivers"><UserPlus className="mr-2 h-5 w-5" />Add driver</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
