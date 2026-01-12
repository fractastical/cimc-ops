import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { CheckCircle, Target, Calendar } from "lucide-react";
import { getMilestoneSubmissionData, createMilestoneSubmission } from "@/lib/api";
import { format, parseISO } from "date-fns";

export default function MilestoneSubmit() {
  const params = useParams<{ milestoneId: string }>();
  const milestoneId = params.milestoneId || "";

  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    teamLeadName: "",
    teamLeadEmail: "",
    progressSummary: "",
    completionPercentage: 50,
    challenges: "",
    nextSteps: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["milestoneSubmissionData", milestoneId],
    queryFn: () => getMilestoneSubmissionData(milestoneId),
    enabled: !!milestoneId,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      createMilestoneSubmission({
        milestoneId,
        projectId: data?.milestone.projectId || "",
        teamLeadName: formData.teamLeadName,
        teamLeadEmail: formData.teamLeadEmail,
        progressSummary: formData.progressSummary,
        completionPercentage: formData.completionPercentage,
        challenges: formData.challenges || undefined,
        nextSteps: formData.nextSteps || undefined,
      }),
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

  const { milestone, project } = data;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Milestone Progress Update</h1>
          <p className="text-muted-foreground">Submit your monthly progress for {project?.name}</p>
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
            <CardTitle>This Month's Milestone</CardTitle>
            <CardDescription>{milestone.description}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Progress Update</CardTitle>
            <CardDescription>Please provide details about your progress this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.teamLeadName}
                  onChange={(e) => setFormData({ ...formData, teamLeadName: e.target.value })}
                  data-testid="input-submit-name"
                />
              </div>
              <div>
                <Label htmlFor="email">Your Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.teamLeadEmail}
                  onChange={(e) => setFormData({ ...formData, teamLeadEmail: e.target.value })}
                  data-testid="input-submit-email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="summary">Progress Summary</Label>
              <Textarea
                id="summary"
                placeholder="Describe what you've accomplished towards this milestone..."
                className="min-h-[120px]"
                value={formData.progressSummary}
                onChange={(e) => setFormData({ ...formData, progressSummary: e.target.value })}
                data-testid="input-submit-summary"
              />
            </div>

            <div>
              <Label>Completion Percentage: {formData.completionPercentage}%</Label>
              <Slider
                value={[formData.completionPercentage]}
                onValueChange={([v]) => setFormData({ ...formData, completionPercentage: v })}
                max={100}
                step={5}
                className="mt-2"
                data-testid="slider-completion"
              />
            </div>

            <div>
              <Label htmlFor="challenges">Challenges (Optional)</Label>
              <Textarea
                id="challenges"
                placeholder="Any blockers or challenges you've encountered..."
                value={formData.challenges}
                onChange={(e) => setFormData({ ...formData, challenges: e.target.value })}
                data-testid="input-submit-challenges"
              />
            </div>

            <div>
              <Label htmlFor="nextSteps">Next Steps (Optional)</Label>
              <Textarea
                id="nextSteps"
                placeholder="What are your planned next steps..."
                value={formData.nextSteps}
                onChange={(e) => setFormData({ ...formData, nextSteps: e.target.value })}
                data-testid="input-submit-next-steps"
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => submitMutation.mutate()}
              disabled={
                !formData.teamLeadName ||
                !formData.teamLeadEmail ||
                !formData.progressSummary ||
                submitMutation.isPending
              }
              data-testid="button-submit-progress"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Progress Update"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
