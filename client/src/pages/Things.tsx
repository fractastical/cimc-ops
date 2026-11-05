import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createThing,
  deleteThing,
  getThings,
  updateThing,
  type Thing,
  type ThingStatus,
} from "@/lib/api";

const COLUMNS: { status: ThingStatus; label: string; hint: string }[] = [
  { status: "doing", label: "Doing", hint: "In progress" },
  { status: "open", label: "Open", hint: "Not started" },
  { status: "done", label: "Done", hint: "Finished" },
  { status: "dropped", label: "Dropped", hint: "Not pursuing" },
];

export default function Things() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [area, setArea] = useState("");
  const [url, setUrl] = useState("");

  const { data: things = [], isLoading } = useQuery({
    queryKey: ["things"],
    queryFn: getThings,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["things"] });

  const addMutation = useMutation({
    mutationFn: createThing,
    onSuccess: () => {
      setTitle("");
      setNotes("");
      setArea("");
      setUrl("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Thing> }) => updateThing(id, updates),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteThing,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addMutation.mutate({
      title: trimmed,
      notes: notes.trim() || null,
      area: area.trim() || null,
      url: url.trim() || null,
      status: "open",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Things</h1>
        <p className="text-muted-foreground font-mono text-sm">
          {things.filter((thing) => thing.status === "doing").length} doing
          <span className="mx-2 text-border">/</span>
          {things.filter((thing) => thing.status === "open").length} open
          <span className="mx-2 text-border">/</span>
          {things.length} tracked
        </p>
      </div>

      <Card className="glass-panel border-primary/20">
        <CardContent className="p-4">
          <form onSubmit={submit} className="space-y-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a thing to track"
              className="font-medium"
              data-testid="input-thing-title"
              autoFocus
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="Area (optional)"
                data-testid="input-thing-area"
              />
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Link (optional)"
                data-testid="input-thing-url"
              />
            </div>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              data-testid="input-thing-notes"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!title.trim() || addMutation.isPending} data-testid="button-add-thing">
                <Plus className="h-4 w-4 mr-1" />
                {addMutation.isPending ? "Adding" : "Add thing"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {COLUMNS.map((column) => {
          const items = things.filter((thing) => thing.status === column.status);
          return (
            <section key={column.status} className="space-y-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-mono text-sm uppercase tracking-wider">{column.label}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <p className="px-1 text-xs text-muted-foreground">{column.hint}</p>
              <div className="space-y-2 min-h-24">
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Nothing {column.label.toLowerCase()}
                  </div>
                )}
                {items.map((thing) => (
                  <ThingCard
                    key={thing.id}
                    thing={thing}
                    onStatus={(status) => updateMutation.mutate({ id: thing.id, updates: { status } })}
                    onDelete={() => {
                      if (window.confirm(`Delete "${thing.title}"?`)) deleteMutation.mutate(thing.id);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ThingCard({
  thing,
  onStatus,
  onDelete,
}: {
  thing: Thing;
  onStatus: (status: ThingStatus) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="border-border/80">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="font-medium leading-snug">{thing.title}</p>
            {thing.area && (
              <p className="text-xs font-mono text-primary/80">{thing.area}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {thing.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{thing.notes}</p>}
        {thing.url && (
          <a
            href={thing.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {thing.url.replace(/^https?:\/\//, "")}
          </a>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {COLUMNS.filter((column) => column.status !== thing.status).map((column) => (
            <Button
              key={column.status}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onStatus(column.status)}
            >
              {column.status === "done" && <Check className="h-3 w-3 mr-1" />}
              {column.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
