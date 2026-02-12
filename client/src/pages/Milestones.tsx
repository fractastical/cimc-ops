import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  Target, 
  Users, 
  Mail, 
  Calendar,
  CheckCircle,
  Edit2
} from "lucide-react";
import {
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestoneSubmissions,
  getTeamLeads,
  createTeamLead,
  deleteTeamLead,
  getAdminEmails,
  createAdminEmail,
  deleteAdminEmail,
  getResearchProjects,
  type Milestone,
  type MilestoneSubmission,
  type TeamLead,
  type AdminEmail,
  type ResearchProject,
} from "@/lib/api";
import { format, parseISO } from "date-fns";

function getNextSixMonths(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    });
  }
  return months;
}

export default function Milestones() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [teamLeadDialogOpen, setTeamLeadDialogOpen] = useState(false);
  const [adminEmailDialogOpen, setAdminEmailDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const [newMilestone, setNewMilestone] = useState({ projectId: "", month: "", description: "", customQuestions: [] as { label: string; required: boolean }[] });
  const [newTeamLead, setNewTeamLead] = useState({ projectId: "", name: "", email: "" });
  const [newAdminEmail, setNewAdminEmail] = useState({ email: "", name: "" });
  const [editQuestions, setEditQuestions] = useState<{ label: string; required: boolean }[]>([]);

  const { data: projects } = useQuery({
    queryKey: ["researchProjects"],
    queryFn: getResearchProjects,
  });

  const { data: milestones } = useQuery({
    queryKey: ["milestones", selectedProjectId],
    queryFn: () => getMilestones(selectedProjectId === "all" ? undefined : selectedProjectId),
  });

  const { data: submissions } = useQuery({
    queryKey: ["milestoneSubmissions"],
    queryFn: () => getMilestoneSubmissions(),
  });

  const { data: teamLeads } = useQuery({
    queryKey: ["teamLeads"],
    queryFn: () => getTeamLeads(),
  });

  const { data: adminEmails } = useQuery({
    queryKey: ["adminEmails"],
    queryFn: getAdminEmails,
  });

  const createMilestoneMutation = useMutation({
    mutationFn: (data: { projectId: string; month: string; description: string; customQuestions?: { label: string; required: boolean }[] }) => createMilestone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Milestone created");
      setMilestoneDialogOpen(false);
      setNewMilestone({ projectId: "", month: "", description: "", customQuestions: [] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ month: string; description: string; customQuestions: { label: string; required: boolean }[] }> }) => 
      updateMilestone(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Milestone updated");
      setEditingMilestone(null);
      setEditQuestions([]);
    },
    onError: () => {
      toast.error("Failed to update milestone");
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: deleteMilestone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Milestone deleted");
    },
    onError: () => {
      toast.error("Failed to delete milestone");
    },
  });

  const createTeamLeadMutation = useMutation({
    mutationFn: createTeamLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      toast.success("Team lead added");
      setTeamLeadDialogOpen(false);
      setNewTeamLead({ projectId: "", name: "", email: "" });
    },
    onError: () => {
      toast.error("Failed to add team lead");
    },
  });

  const deleteTeamLeadMutation = useMutation({
    mutationFn: deleteTeamLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      toast.success("Team lead removed");
    },
    onError: () => {
      toast.error("Failed to remove team lead");
    },
  });

  const createAdminEmailMutation = useMutation({
    mutationFn: createAdminEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminEmails"] });
      toast.success("Admin email added");
      setAdminEmailDialogOpen(false);
      setNewAdminEmail({ email: "", name: "" });
    },
    onError: () => {
      toast.error("Failed to add admin email");
    },
  });

  const deleteAdminEmailMutation = useMutation({
    mutationFn: deleteAdminEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminEmails"] });
      toast.success("Admin email removed");
    },
    onError: () => {
      toast.error("Failed to remove admin email");
    },
  });

  const getProjectName = (projectId: string) => {
    return projects?.find((p) => p.id === projectId)?.name || "Unknown";
  };

  const months = getNextSixMonths();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Milestone Tracking</h1>
          <p className="text-muted-foreground">Manage monthly milestones, team leads, and submission notifications</p>
        </div>
      </div>

      <Tabs defaultValue="milestones" className="space-y-4">
        <TabsList>
          <TabsTrigger value="milestones" data-testid="tab-milestones">
            <Target className="h-4 w-4 mr-2" />
            Milestones
          </TabsTrigger>
          <TabsTrigger value="team-leads" data-testid="tab-team-leads">
            <Users className="h-4 w-4 mr-2" />
            Team Leads
          </TabsTrigger>
          <TabsTrigger value="admins" data-testid="tab-admins">
            <Mail className="h-4 w-4 mr-2" />
            Admin Emails
          </TabsTrigger>
          <TabsTrigger value="submissions" data-testid="tab-submissions">
            <CheckCircle className="h-4 w-4 mr-2" />
            Submissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="milestones" className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-64" data-testid="select-project-filter">
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-milestone">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Milestone</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select
                      value={newMilestone.projectId}
                      onValueChange={(v) => setNewMilestone({ ...newMilestone, projectId: v })}
                    >
                      <SelectTrigger data-testid="select-milestone-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Month</Label>
                    <Select
                      value={newMilestone.month}
                      onValueChange={(v) => setNewMilestone({ ...newMilestone, month: v })}
                    >
                      <SelectTrigger data-testid="select-milestone-month">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      placeholder="What should be accomplished this month..."
                      value={newMilestone.description}
                      onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                      data-testid="input-milestone-description"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Custom Form Questions</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setNewMilestone({
                          ...newMilestone,
                          customQuestions: [...newMilestone.customQuestions, { label: "", required: false }]
                        })}
                        data-testid="button-add-custom-question"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Question
                      </Button>
                    </div>
                    {newMilestone.customQuestions.map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="Question text..."
                          value={q.label}
                          onChange={(e) => {
                            const updated = [...newMilestone.customQuestions];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setNewMilestone({ ...newMilestone, customQuestions: updated });
                          }}
                          data-testid={`input-new-question-${idx}`}
                        />
                        <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => {
                              const updated = [...newMilestone.customQuestions];
                              updated[idx] = { ...updated[idx], required: e.target.checked };
                              setNewMilestone({ ...newMilestone, customQuestions: updated });
                            }}
                          />
                          Required
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            const updated = newMilestone.customQuestions.filter((_, i) => i !== idx);
                            setNewMilestone({ ...newMilestone, customQuestions: updated });
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      const data = {
                        ...newMilestone,
                        customQuestions: newMilestone.customQuestions.filter(q => q.label.trim()),
                      };
                      createMilestoneMutation.mutate(data);
                    }}
                    disabled={!newMilestone.projectId || !newMilestone.month || !newMilestone.description}
                    data-testid="button-save-milestone"
                  >
                    Create Milestone
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {milestones?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No milestones yet. Create one to start tracking progress.
                </CardContent>
              </Card>
            ) : (
              milestones?.map((milestone) => (
                <Card key={milestone.id} data-testid={`card-milestone-${milestone.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(parseISO(milestone.month + "-01"), "MMMM yyyy")}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{getProjectName(milestone.projectId)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingMilestone(milestone);
                            setEditQuestions(milestone.customQuestions || []);
                          }}
                          data-testid={`button-edit-milestone-${milestone.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                          data-testid={`button-delete-milestone-${milestone.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {editingMilestone?.id === milestone.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editingMilestone.description}
                          onChange={(e) =>
                            setEditingMilestone({ ...editingMilestone, description: e.target.value })
                          }
                        />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Custom Questions</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditQuestions([...editQuestions, { label: "", required: false }])}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </div>
                          {editQuestions.map((q, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Input
                                placeholder="Question text..."
                                value={q.label}
                                onChange={(e) => {
                                  const updated = [...editQuestions];
                                  updated[idx] = { ...updated[idx], label: e.target.value };
                                  setEditQuestions(updated);
                                }}
                                className="text-sm"
                              />
                              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={q.required}
                                  onChange={(e) => {
                                    const updated = [...editQuestions];
                                    updated[idx] = { ...updated[idx], required: e.target.checked };
                                    setEditQuestions(updated);
                                  }}
                                />
                                Req
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => setEditQuestions(editQuestions.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateMilestoneMutation.mutate({
                                id: milestone.id,
                                data: {
                                  description: editingMilestone.description,
                                  customQuestions: editQuestions.filter(q => q.label.trim()),
                                },
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingMilestone(null); setEditQuestions([]); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm">{milestone.description}</p>
                        {(milestone.customQuestions?.length ?? 0) > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {milestone.customQuestions!.length} custom question{milestone.customQuestions!.length !== 1 ? "s" : ""} configured
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="team-leads" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={teamLeadDialogOpen} onOpenChange={setTeamLeadDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-team-lead">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team Lead
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Lead</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select
                      value={newTeamLead.projectId}
                      onValueChange={(v) => setNewTeamLead({ ...newTeamLead, projectId: v })}
                    >
                      <SelectTrigger data-testid="select-team-lead-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input
                      placeholder="Team lead name"
                      value={newTeamLead.name}
                      onChange={(e) => setNewTeamLead({ ...newTeamLead, name: e.target.value })}
                      data-testid="input-team-lead-name"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="team.lead@example.com"
                      value={newTeamLead.email}
                      onChange={(e) => setNewTeamLead({ ...newTeamLead, email: e.target.value })}
                      data-testid="input-team-lead-email"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => createTeamLeadMutation.mutate(newTeamLead)}
                    disabled={!newTeamLead.projectId || !newTeamLead.name || !newTeamLead.email}
                    data-testid="button-save-team-lead"
                  >
                    Add Team Lead
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teamLeads?.map((lead) => (
              <Card key={lead.id} data-testid={`card-team-lead-${lead.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{lead.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTeamLeadMutation.mutate(lead.id)}
                      data-testid={`button-delete-team-lead-${lead.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <CardDescription>{lead.email}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{getProjectName(lead.projectId)}</Badge>
                </CardContent>
              </Card>
            ))}
            {(!teamLeads || teamLeads.length === 0) && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No team leads configured. Add team leads to receive monthly milestone reminders.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Admin Notification Emails</CardTitle>
              <CardDescription>
                These emails receive notifications when team leads submit milestone updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={newAdminEmail.email}
                  onChange={(e) => setNewAdminEmail({ ...newAdminEmail, email: e.target.value })}
                  data-testid="input-admin-email"
                />
                <Input
                  placeholder="Name (optional)"
                  value={newAdminEmail.name}
                  onChange={(e) => setNewAdminEmail({ ...newAdminEmail, name: e.target.value })}
                  data-testid="input-admin-name"
                />
                <Button
                  onClick={() => createAdminEmailMutation.mutate(newAdminEmail)}
                  disabled={!newAdminEmail.email}
                  data-testid="button-add-admin-email"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {adminEmails?.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    data-testid={`admin-email-${admin.id}`}
                  >
                    <div>
                      <span className="font-medium">{admin.email}</span>
                      {admin.name && <span className="text-muted-foreground ml-2">({admin.name})</span>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAdminEmailMutation.mutate(admin.id)}
                      data-testid={`button-delete-admin-${admin.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {(!adminEmails || adminEmails.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No admin emails configured
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Submissions</CardTitle>
              <CardDescription>Milestone progress updates from team leads</CardDescription>
            </CardHeader>
            <CardContent>
              {submissions?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No submissions yet
                </p>
              ) : (
                <div className="space-y-4">
                  {submissions?.map((submission) => (
                    <div
                      key={submission.id}
                      className="p-4 rounded-lg border bg-card"
                      data-testid={`submission-${submission.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{submission.teamLeadName}</span>
                          <span className="text-sm text-muted-foreground">({submission.teamLeadEmail})</span>
                        </div>
                        <Badge>{getProjectName(submission.projectId)}</Badge>
                      </div>
                      <p className="text-sm mb-2">{submission.progressSummary}</p>
                      {submission.completionPercentage !== null && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Completion:</span>
                          <span className="font-medium">{submission.completionPercentage}%</span>
                        </div>
                      )}
                      {submission.challenges && (
                        <div className="mt-2 text-sm">
                          <span className="text-muted-foreground">Challenges: </span>
                          {submission.challenges}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">
                        Submitted {format(new Date(submission.submittedAt), "PPp")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
