import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Upload, FileText, Image as ImageIcon, Download, Trash2,
  Eye, Pencil, Plus, File as FileIcon, Save, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/drivers/$driverId")({
  component: DriverInfoPage,
});

const BUCKET = "driver-files";

type StorageFile = {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  metadata: { size?: number; mimetype?: string } | null;
};

function formatDate(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime?: string, name?: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(name ?? "");
}
function isPdf(mime?: string, name?: string) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(name ?? "");
}

function DriverInfoPage() {
  const { driverId } = Route.useParams();
  const qc = useQueryClient();

  const { data: driver } = useQuery({
    queryKey: ["driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("id", driverId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ------ Notes ------
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["driver-notes", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_notes")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidateNotes = () => qc.invalidateQueries({ queryKey: ["driver-notes", driverId] });

  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("driver_notes").insert({ driver_id: driverId, content });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note added"); setNewNote(""); invalidateNotes(); },
    onError: (e) => toast.error(e.message),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase.from("driver_notes").update({ content }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note updated"); setEditingId(null); invalidateNotes(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("driver_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note deleted"); invalidateNotes(); },
    onError: (e) => toast.error(e.message),
  });

  // ------ Files ------
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["driver-files", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(driverId, { limit: 500, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return (data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder") as StorageFile[];
    },
  });

  const invalidateFiles = () => qc.invalidateQueries({ queryKey: ["driver-files", driverId] });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(fileList)) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${driverId}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) { fail++; console.error(error); } else ok++;
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? "s" : ""}`);
    if (fail) toast.error(`${fail} upload${fail > 1 ? "s" : ""} failed`);
    invalidateFiles();
  };

  const deleteFile = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([`${driverId}/${name}`]);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("File deleted"); invalidateFiles(); },
    onError: (e) => toast.error(e.message),
  });

  const getSignedUrl = async (name: string, download = false) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${driverId}/${name}`, 60 * 10, download ? { download: displayName(name) } : undefined);
    if (error) { toast.error(error.message); return null; }
    return data.signedUrl;
  };

  const [preview, setPreview] = useState<{ url: string; name: string; kind: "image" | "pdf" } | null>(null);

  const openPreview = async (f: StorageFile) => {
    const url = await getSignedUrl(f.name);
    if (!url) return;
    const kind = isImage(f.metadata?.mimetype, f.name) ? "image" : "pdf";
    setPreview({ url, name: displayName(f.name), kind });
  };

  const openInNewTab = async (name: string) => {
    const url = await getSignedUrl(name);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const download = async (name: string) => {
    const url = await getSignedUrl(name, true);
    if (url) window.location.href = url;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-10 w-10">
          <Link to="/drivers"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {driver?.full_name ?? "Driver"}
          </h1>
          {driver && (
            <p className="text-sm text-muted-foreground truncate">
              {driver.phone} · {driver.vehicle_number}
            </p>
          )}
        </div>
      </div>

      {!notesLoading && !filesLoading && notes.length === 0 && files.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">No information added yet.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  noteInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  noteInputRef.current?.focus();
                }}
              >
                <Plus className="mr-1 h-4 w-4" />Add Note
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1 h-4 w-4" />Upload Document
              </Button>
            </div>
          </CardContent>
        </Card>
      )}



      {/* Notes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Notes</h2>
            <span className="text-xs text-muted-foreground">{notes.length} total</span>
          </div>
          <Textarea
            rows={4}
            placeholder="Write anything about this driver…"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <Button
            className="w-full h-11"
            disabled={!newNote.trim() || addNote.isPending}
            onClick={() => addNote.mutate(newNote.trim())}
          >
            <Plus className="mr-1 h-4 w-4" />
            {addNote.isPending ? "Saving…" : "Add note"}
          </Button>

          {notesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border p-3 space-y-2">
                  {editingId === n.id ? (
                    <>
                      <Textarea rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="flex-1"
                          disabled={updateNote.isPending}
                          onClick={() => updateNote.mutate({ id: n.id, content: editContent.trim() })}
                        >
                          <Save className="mr-1 h-4 w-4" />Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="mr-1 h-4 w-4" />Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(n.updated_at ?? n.created_at)}
                        </span>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8"
                            onClick={() => { setEditingId(n.id); setEditContent(n.content); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteNote.mutate(n.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Documents & files</h2>
            <span className="text-xs text-muted-foreground">{files.length} total</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            className="w-full h-11"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1 h-4 w-4" />
            {uploading ? "Uploading…" : "Upload files"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Images, PDFs, or any document. You can select multiple.
          </p>

          {filesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No files uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => {
                const img = isImage(f.metadata?.mimetype, f.name);
                const pdf = isPdf(f.metadata?.mimetype, f.name);
                return (
                  <div key={f.name} className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        {img ? <ImageIcon className="h-5 w-5" />
                          : pdf ? <FileText className="h-5 w-5" />
                          : <FileIcon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{displayName(f.name)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(f.created_at)}{f.metadata?.size ? ` · ${formatSize(f.metadata.size)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Button size="sm" variant="outline"
                        onClick={() => (img || pdf) ? openPreview(f) : openInNewTab(f.name)}>
                        <Eye className="mr-1 h-4 w-4" />{img ? "Preview" : pdf ? "Open" : "View"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => download(f.name)}>
                        <Download className="mr-1 h-4 w-4" />Save
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-destructive">
                            <Trash2 className="mr-1 h-4 w-4" />Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
                            <AlertDialogDescription>{displayName(f.name)}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteFile.mutate(f.name)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="truncate">{preview?.name}</DialogTitle></DialogHeader>
          {preview?.kind === "image" ? (
            <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full object-contain rounded-md" />
          ) : preview ? (
            <iframe src={preview.url} title={preview.name} className="w-full h-[70vh] rounded-md" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function displayName(storedName: string) {
  // strip leading "<timestamp>_"
  return storedName.replace(/^\d+_/, "");
}
