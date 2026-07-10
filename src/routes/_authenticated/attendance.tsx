import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Driver = Tables<"drivers">;
type Attendance = Tables<"attendance">;

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("status", "active").order("full_name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("*").eq("date", date);
      if (error) throw error;
      return data as Attendance[];
    },
  });

  const map = new Map(records.map((r) => [r.driver_id, r.status]));

  const mark = useMutation({
    mutationFn: async ({ driverId, status }: { driverId: string; status: "present" | "absent" }) => {
      const { error } = await supabase
        .from("attendance")
        .upsert({ driver_id: driverId, date, status }, { onConflict: "driver_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">Tap Present or Absent for each driver.</p>
      </div>

      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 max-w-[180px]" />
        <div className="flex gap-3 text-sm">
          <span className="text-green-700 font-semibold">P: {presentCount}</span>
          <span className="text-rose-700 font-semibold">A: {absentCount}</span>
        </div>
      </div>

      {drivers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No active drivers. Add drivers first.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {drivers.map((d) => {
            const s = map.get(d.id);
            return (
              <Card key={d.id}>
                <CardContent className="p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{d.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{d.vehicle_number}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant={s === "present" ? "default" : "outline"}
                        className={`h-11 w-14 ${s === "present" ? "bg-green-600 hover:bg-green-700" : ""}`}
                        onClick={() => mark.mutate({ driverId: d.id, status: "present" })}
                      >
                        <Check className="h-5 w-5" />
                      </Button>
                      <Button
                        size="sm"
                        variant={s === "absent" ? "default" : "outline"}
                        className={`h-11 w-14 ${s === "absent" ? "bg-rose-600 hover:bg-rose-700" : ""}`}
                        onClick={() => mark.mutate({ driverId: d.id, status: "absent" })}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
