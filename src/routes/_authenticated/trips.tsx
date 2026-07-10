import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Driver = Tables<"drivers">;
type Trip = Tables<"trips">;

export const Route = createFileRoute("/_authenticated/trips")({
  component: TripsPage,
});

function TripsPage() {
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

  const { data: trips = [] } = useQuery({
    queryKey: ["trips", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").eq("date", date);
      if (error) throw error;
      return data as Trip[];
    },
  });

  const byDriver = new Map(trips.map((t) => [t.driver_id, t]));

  const save = useMutation({
    mutationFn: async ({ driverId, count, notes }: { driverId: string; count: number; notes: string }) => {
      const { error } = await supabase
        .from("trips")
        .upsert({ driver_id: driverId, date, trip_count: count, notes: notes || null }, { onConflict: "driver_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips", date] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Trips saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const total = trips.reduce((s, t) => s + t.trip_count, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
        <p className="text-sm text-muted-foreground">Log trips completed per driver.</p>
      </div>

      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 max-w-[180px]" />
        <span className="text-sm font-semibold">Total: {total}</span>
      </div>

      {drivers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No active drivers.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {drivers.map((d) => (
            <TripRow
              key={d.id}
              driver={d}
              initial={byDriver.get(d.id)}
              onSave={(count, notes) => save.mutate({ driverId: d.id, count, notes })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TripRow({
  driver, initial, onSave,
}: { driver: Driver; initial?: Trip; onSave: (count: number, notes: string) => void }) {
  const [count, setCount] = useState(initial?.trip_count ?? 0);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [expanded, setExpanded] = useState(false);
  const dirty = count !== (initial?.trip_count ?? 0) || (notes ?? "") !== (initial?.notes ?? "");

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{driver.full_name}</div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setExpanded((x) => !x)}
            >
              {expanded ? "Hide notes" : "Add notes"}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => setCount(Math.max(0, count - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={0}
              value={count}
              onChange={(e) => setCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-10 w-14 text-center"
            />
            <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => setCount(count + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-10 w-10 ml-1" disabled={!dirty} onClick={() => onSave(count, notes)}>
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
