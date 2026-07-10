import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search, Phone, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Driver = Tables<"drivers">;

export const Route = createFileRoute("/_authenticated/drivers")({
  component: DriversPage,
});

function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("full_name");
      if (error) throw error;
      return data as Driver[];
    },
  });
}

const empty = {
  full_name: "",
  phone: "",
  vehicle_number: "",
  status: "active" as "active" | "inactive",
  date_joined: new Date().toISOString().slice(0, 10),
  notes: "",
};

function DriverForm({
  initial, onSubmit, submitLabel,
}: { initial: typeof empty; onSubmit: (v: typeof empty) => Promise<void>; submitLabel: string }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try { await onSubmit(v); } finally { setSaving(false); }
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label>Full name</Label>
        <Input required value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input required inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Vehicle no.</Label>
          <Input required value={v.vehicle_number} onChange={(e) => setV({ ...v, vehicle_number: e.target.value.toUpperCase() })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={v.status} onValueChange={(x) => setV({ ...v, status: x as typeof v.status })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Date joined</Label>
          <Input type="date" value={v.date_joined} onChange={(e) => setV({ ...v, date_joined: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea rows={3} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving} className="w-full h-11">
          {saving ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DriversPage() {
  const qc = useQueryClient();
  const { data: drivers = [], isLoading } = useDrivers();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drivers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const create = useMutation({
    mutationFn: async (v: typeof empty) => {
      const { error } = await supabase.from("drivers").insert(v);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Driver added"); setAddOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: typeof empty }) => {
      const { error } = await supabase.from("drivers").update(v).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Driver updated"); setEditing(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Driver deleted"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? drivers.filter((d) =>
        [d.full_name, d.phone, d.vehicle_number].some((f) => f.toLowerCase().includes(q)))
    : drivers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Drivers</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-11"><Plus className="mr-1 h-4 w-4" />Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add driver</DialogTitle></DialogHeader>
            <DriverForm initial={empty} submitLabel="Add driver" onSubmit={(v) => create.mutateAsync(v)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-11"
          placeholder="Search name, phone, vehicle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          {drivers.length === 0 ? "No drivers yet. Tap Add to create one." : "No drivers match your search."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{d.full_name}</h3>
                      <Badge variant={d.status === "active" ? "default" : "secondary"} className="shrink-0">
                        {d.status}
                      </Badge>
                    </div>
                    <a href={`tel:${d.phone}`} className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />{d.phone}
                    </a>
                    <div className="mt-0.5 text-sm text-muted-foreground truncate">
                      Vehicle: <span className="font-medium text-foreground">{d.vehicle_number}</span>
                    </div>
                    {d.notes && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{d.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button asChild size="icon" variant="ghost" title="Driver information">
                      <Link to="/drivers/$driverId" params={{ driverId: d.id }}>
                        <Info className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(d)}>
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {d.full_name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This also removes their attendance, trips and advance records.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(d.id)}>Delete</AlertDialogAction>
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit driver</DialogTitle></DialogHeader>
          {editing && (
            <DriverForm
              initial={{
                full_name: editing.full_name,
                phone: editing.phone,
                vehicle_number: editing.vehicle_number,
                status: editing.status,
                date_joined: editing.date_joined,
                notes: editing.notes ?? "",
              }}
              submitLabel="Save changes"
              onSubmit={(v) => update.mutateAsync({ id: editing.id, v })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
