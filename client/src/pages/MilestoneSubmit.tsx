import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, Target, Calendar, User } from "lucide-react";
import { getMilestoneSubmissionData, createMilestoneSubmission } from "@/lib/api";
import { format, parseISO } from "date-fns";

export default function MilestoneSubmit() {
  const params = useParams<{ milestoneId: string; leadId: string }>();
  const milestoneId = params.milestoneId || "";
  const leadId = params.leadId || "";

  const [submitted, setSubmitted] = useState(false);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [milestoneStatuses, setMilestoneStatuses] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["milestoneSubmissionData", milestoneId, leadId],
    queryFn: () => getMilestoneSubmissionData(milestoneId, leadId || undefined),
    enabled: !!milestoneId,
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const allAnswers: Record<string, string> = { ...customAnswers };
      const projectMilestones = (data as any)?.projectMilestones || [];
      for (const m of projectMilestones) {
        const status = milestoneStatuses[m.id] || "to-do";
        allAnswers[`milestone_status:${m.id}`] = JSON.stringify({
          status,
          description: m.description,
          month: m.month,
        });
      }

      const teamLead = (data as any)?.teamLead;
      const statusParts: string[] = [];
      for (const m of projectMilestones) {
        const status = milestoneStatuses[m.id] || "to-do";
        statusParts.push(`${m.description}: ${status}`);
      }
      const questionParts: string[] = [];
      for (const [key, val] of Object.entries(customAnswers)) {
        if (val?.trim()) questionParts.push(`${key}: ${val}`);
      }
      const progressSummary = [...statusParts, ...questionParts].join("\n") || "Milestone statuses updated.";

      return createMilestoneSubmission({
        milestoneId,
        projectId: data?.milestone.projectId || "",
        teamLeadName: teamLead?.name || "Unknown",
        teamLeadEmail: teamLead?.email || "",
        progressSummary,
        completionPercentage: 0,
        customAnswers: Object.keys(allAnswers).length > 0 ? allAnswers : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Progress update submitted successfully!");
      setSubmitted(true);
    },
    onError: () => {
      toast.error("Failed to submit progress update");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <p className="text-destructive">Milestone not found or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">Thank You!</h2>
            <p className="text-muted-foreground">
              Your milestone progress update for {data.project?.name} has been submitted successfully.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { milestone, project, globalQuestions, teamLead } = data as any;
  const projectMilestones = (data as any).projectMilestones || [];
  const questions = (globalQuestions || milestone.customQuestions || []) as { label: string; required: boolean }[];

  const requiredCustomMissing = questions
    .filter((q: any) => q.required)
    .some((q: any) => !customAnswers[q.label]?.trim());

  const statusColor = (status: string) => {
    if (status === "finished") return "text-green-500 border-green-500/40 bg-green-500/10";
    if (status === "in-progress") return "text-yellow-500 border-yellow-500/40 bg-yellow-500/10";
    return "text-muted-foreground border-border";
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Milestone Progress Update</h1>
          <p className="text-muted-foreground">Submit your monthly progress for {project?.name}</p>
          {teamLead && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{teamLead.name}</span>
              <span className="text-muted-foreground/50">({teamLead.email})</span>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Target className="h-4 w-4" />
              <span>{project?.name}</span>
              <span>•</span>
              <Calendar className="h-4 w-4" />
              <span>{format(parseISO(milestone.month + "-01"), "MMMM yyyy")}</span>
            </div>
            <CardTitle>Project Milestones</CardTitle>
            <CardDescription>Set the current status for each milestone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectMilestones.map((m: any) => {
              const status = milestoneStatuses[m.id] || "to-do";
              const isCurrent = m.id === milestone.id;
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isCurrent ? "border-primary/50 bg-primary/5" : "border-border"}`}
                  data-testid={`milestone-status-${m.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{m.description}</p>
                      {isCurrent && (
                        <Badge variant="outline" className="text-primary border-primary/40 text-xs shrink-0">Current</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(m.month + "-01"), "MMMM yyyy")}
                    </p>
                  </div>
                  <Select
                    value={status}
                    onValueChange={(val) => setMilestoneStatuses({ ...milestoneStatuses, [m.id]: val })}
                  >
                    <SelectTrigger className={`w-[140px] shrink-0 text-xs ${statusColor(status)}`} data-testid={`select-status-${m.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to-do">To Do</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Check-In Questions</CardTitle>
              <CardDescription>Please answer the following questions about your progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((q: any, idx: number) => (
                <div key={idx}>
                  <Label htmlFor={`custom-q-${idx}`}>
                    {q.label}
                    {q.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Textarea
                    id={`custom-q-${idx}`}
                    placeholder="Enter your response..."
                    value={customAnswers[q.label] || ""}
                    onChange={(e) =>
                      setCustomAnswers({ ...customAnswers, [q.label]: e.target.value })
                    }
                    data-testid={`input-custom-question-${idx}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={() => submitMutation.mutate()}
          disabled={requiredCustomMissing || submitMutation.isPending}
          data-testid="button-submit-progress"
        >
          {submitMutation.isPending ? "Submitting..." : "Submit Progress Update"}
        </Button>
      </div>
    </div>
  );
}
