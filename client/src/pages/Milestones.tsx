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
import { MilestoneProgressGrid } from "@/components/dashboard/MilestoneProgressGrid";
import { MilestoneDescription } from "@/components/MilestoneDescription";
import { 
  Plus, 
  Trash2, 
  Target, 
  Users, 
  Mail, 
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  Send,
  BarChart3
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


export default function Milestones() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [teamLeadDialogOpen, setTeamLeadDialogOpen] = useState(false);
  const [adminEmailDialogOpen, setAdminEmailDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const now = new Date();
  const [newMilestoneMonth, setNewMilestoneMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [newMilestoneYear, setNewMilestoneYear] = useState(String(now.getFullYear()));
  const [newMilestone, setNewMilestone] = useState({ projectId: "", month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, description: "" });
  const [newTeamLead, setNewTeamLead] = useState({ projectId: "", name: "", email: "" });
  const [newAdminEmail, setNewAdminEmail] = useState({ email: "", name: "" });

  const { data: projects } = useQuery({
    queryKey: ["researchProjects"],
    queryFn: getResearchProjects,
  });

  const { data: milestones } = useQuery({
    queryKey: ["milestones", selectedProjectId],
    queryFn: () => getMilestones(selectedProjectId === "all" ? undefined : selectedProjectId),
  });

  const { data: allMilestones } = useQuery({
    queryKey: ["milestones", "all"],
    queryFn: () => getMilestones(),
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
    mutationFn: (data: { projectId: string; month: string; description: string }) => createMilestone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Milestone created");
      setMilestoneDialogOpen(false);
      const resetNow = new Date();
      setNewMilestoneMonth(String(resetNow.getMonth() + 1).padStart(2, "0"));
      setNewMilestoneYear(String(resetNow.getFullYear()));
      setNewMilestone({ projectId: "", month: `${resetNow.getFullYear()}-${String(resetNow.getMonth() + 1).padStart(2, "0")}`, description: "" });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ month: string; description: string }> }) => 
      updateMilestone(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Milestone updated");
      setEditingMilestone(null);
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

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/milestones/send-reminders", { method: "POST" });
      if (!res.ok) throw new Error("Failed to send reminders");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Milestone reminder emails sent to all team leads");
    },
    onError: () => {
      toast.error("Failed to send reminder emails");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Milestone Tracking</h1>
          <p className="text-muted-foreground">Manage monthly milestones, team leads, and submission notifications</p>
        </div>
        <Button
          variant="outline"
          onClick={() => sendRemindersMutation.mutate()}
          disabled={sendRemindersMutation.isPending}
          data-testid="button-send-test-reminders"
        >
          <Send className="h-4 w-4 mr-2" />
          {sendRemindersMutation.isPending ? "Sending..." : "Send Test Reminders"}
        </Button>
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
          <TabsTrigger value="progress" data-testid="tab-progress">
            <BarChart3 className="h-4 w-4 mr-2" />
            Progress
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
                    <Label>Month & Year</Label>
                    <div className="flex gap-2">
                      <Select
                        value={newMilestoneMonth}
                        onValueChange={(v) => {
                          setNewMilestoneMonth(v);
                          setNewMilestone({ ...newMilestone, month: `${newMilestoneYear}-${v}` });
                        }}
                      >
                        <SelectTrigger data-testid="select-milestone-month" className="flex-1">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m, i) => (
                            <SelectItem key={m} value={m}>
                              {format(new Date(2000, i, 1), "MMMM")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={newMilestoneYear}
                        onValueChange={(v) => {
                          setNewMilestoneYear(v);
                          setNewMilestone({ ...newMilestone, month: `${v}-${newMilestoneMonth}` });
                        }}
                      >
                        <SelectTrigger data-testid="select-milestone-year" className="w-28">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map((y) => (
                            <SelectItem key={y} value={y}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                  <Button
                    className="w-full"
                    onClick={() => createMilestoneMutation.mutate(newMilestone)}
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
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateMilestoneMutation.mutate({
                                id: milestone.id,
                                data: { description: editingMilestone.description },
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingMilestone(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <MilestoneDescription description={milestone.description} />
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
          {milestones && milestones.length > 0 ? (
            milestones.map((milestone) => {
              const projectLeads = teamLeads?.filter(tl => tl.projectId === milestone.projectId) || [];
              const milestoneSubmissions = submissions?.filter(s => s.milestoneId === milestone.id) || [];
              const submittedEmails = new Set(milestoneSubmissions.map(s => s.teamLeadEmail.toLowerCase()));
              const submitted = projectLeads.filter(tl => submittedEmails.has(tl.email.toLowerCase()));
              const notSubmitted = projectLeads.filter(tl => !submittedEmails.has(tl.email.toLowerCase()));

              return (
                <Card key={milestone.id} data-testid={`submission-tracker-${milestone.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{getProjectName(milestone.projectId)}</CardTitle>
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(parseISO(milestone.month + "-01"), "MMMM yyyy")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={notSubmitted.length === 0 && projectLeads.length > 0 ? "default" : "secondary"} data-testid={`badge-status-${milestone.id}`}>
                          {milestoneSubmissions.length}/{projectLeads.length} submitted
                        </Badge>
                      </div>
                    </div>
                    <MilestoneDescription description={milestone.description} compact className="text-muted-foreground mt-1" />
                  </CardHeader>
                  <CardContent>
                    {projectLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No team leads assigned to this project</p>
                    ) : (
                      <div className="space-y-2">
                        {submitted.map(lead => {
                          const sub = milestoneSubmissions.find(s => s.teamLeadEmail.toLowerCase() === lead.email.toLowerCase());
                          return (
                            <div key={lead.id} className="flex items-start gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/5" data-testid={`lead-submitted-${lead.id}`}>
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{lead.name}</span>
                                  <span className="text-xs text-muted-foreground">{lead.email}</span>
                                </div>
                                {sub && (() => {
                                  const answers = sub.customAnswers || {};
                                  const statusEntries: { id: string; status: string; description: string; month: string }[] = [];
                                  const questionEntries: [string, string][] = [];
                                  for (const [key, val] of Object.entries(answers)) {
                                    if (key.startsWith("milestone_status:")) {
                                      try {
                                        statusEntries.push(JSON.parse(val as string));
                                      } catch { /* skip malformed */ }
                                    } else {
                                      questionEntries.push([key, val as string]);
                                    }
                                  }
                                  const statusBadgeClass = (val: string) => {
                                    if (val === "finished") return "bg-green-500/20 text-green-400 border-green-500/40";
                                    if (val === "in-progress") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
                                    return "bg-muted text-muted-foreground border-border";
                                  };
                                  return (
                                    <div className="mt-1 space-y-1">
                                      <p className="text-xs text-muted-foreground">{sub.progressSummary}</p>
                                      {sub.challenges && (
                                        <p className="text-xs text-yellow-400/80">Challenges: {sub.challenges}</p>
                                      )}
                                      {statusEntries.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                                          <p className="text-xs font-medium text-muted-foreground">Milestone Statuses:</p>
                                          {statusEntries.map((entry) => (
                                            <div key={entry.description} className="flex items-center gap-2">
                                              <Badge variant="outline" className={`text-xs capitalize ${statusBadgeClass(entry.status)}`}>{entry.status.replace("-", " ")}</Badge>
                                              <span className="text-xs text-muted-foreground truncate">{entry.description}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {statusEntries.length === 0 && sub.completionPercentage !== null && sub.completionPercentage > 0 && (
                                        <span className="text-xs text-green-400">{sub.completionPercentage}% complete</span>
                                      )}
                                      {questionEntries.length > 0 && (
                                        <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                                          {questionEntries.map(([question, answer]) => (
                                            <div key={question}>
                                              <p className="text-xs font-medium text-muted-foreground">{question}</p>
                                              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{answer}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      <p className="text-xs text-muted-foreground/60">Submitted {format(new Date(sub.submittedAt), "PPp")}</p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                        {notSubmitted.map(lead => (
                          <div key={lead.id} className="flex items-center gap-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5" data-testid={`lead-pending-${lead.id}`}>
                            <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
                            <div>
                              <span className="font-medium text-sm">{lead.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{lead.email}</span>
                            </div>
                            <Badge variant="outline" className="ml-auto text-yellow-500 border-yellow-500/40 text-xs">Pending</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No milestones yet. Create milestones to track team submissions.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <MilestoneProgressGrid
            milestones={allMilestones || []}
            submissions={submissions || []}
            projects={projects || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
