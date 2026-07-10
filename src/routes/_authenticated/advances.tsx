import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Driver = Tables<"drivers">;
type Advance = Tables<"advances"> & { drivers: { full_name: string } | null };

export const Route = createFileRoute("/_authenticated/advances")({
  component: AdvancesPage,
});

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function AdvancesPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("full_name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: advances = [] } = useQuery({
    queryKey: ["advances", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advances")
        .select("*, drivers(full_name)")
        .eq("date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Advance[];
    },
  });

  const total = advances.reduce((s, a) => s + Number(a.amount), 0);

  const create = useMutation({
    mutationFn: async (v: { driver_id: string; amount: number; reason: string; date: string }) => {
      const { error } = await supabase.from("advances").insert(v);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Advance recorded");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("advances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Advances</h1>
          <p className="text-sm text-muted-foreground">Daily borrowed amounts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-11"><Plus className="mr-1 h-4 w-4" />Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Record advance</DialogTitle></DialogHeader>
            <AddForm drivers={drivers} defaultDate={date} onSubmit={(v) => create.mutateAsync(v)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 max-w-[180px]" />
        <div className="text-sm">
          Total: <span className="font-bold">{inr.format(total)}</span>
        </div>
      </div>

      {advances.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No advances recorded for this date.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {advances.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.drivers?.full_name ?? "Unknown"}</div>
                    {a.reason && <div className="truncate text-xs text-muted-foreground">{a.reason}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-bold text-rose-700">{inr.format(Number(a.amount))}</span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive h-9 w-9">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this advance?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(a.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddForm({
  drivers, defaultDate, onSubmit,
}: { drivers: Driver[]; defaultDate: string; onSubmit: (v: { driver_id: string; amount: number; reason: string; date: string }) => Promise<void> }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!driverId) return toast.error("Select a driver");
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) return toast.error("Enter a valid amount");
        setSaving(true);
        try { await onSubmit({ driver_id: driverId, amount: amt, reason, date }); } finally { setSaving(false); }
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label>Driver</Label>
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
          <SelectContent>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Amount (₹)</Label>
          <Input type="number" inputMode="decimal" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Reason</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fuel, family" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving} className="w-full h-11">
          {saving ? "Saving…" : "Record advance"}
        </Button>
      </DialogFooter>
    </form>
  );
}
