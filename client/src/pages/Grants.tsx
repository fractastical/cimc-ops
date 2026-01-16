import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMicrograntApplications, updateMicrograntApplication, MicrograntApplication } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, FileText, Mail, Calendar, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    under_review: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
    approved: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
    rejected: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  };
  const config = variants[status] || variants.pending;
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {config.icon}
      {status.replace("_", " ")}
    </Badge>
  );
}

function ApplicationCard({ application }: { application: MicrograntApplication }) {
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState(application.reviewNotes || "");
  const [isOpen, setIsOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<MicrograntApplication>) => 
      updateMicrograntApplication(application.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["microgrants"] });
      toast.success("Application updated");
      setIsOpen(false);
    },
    onError: () => toast.error("Failed to update application"),
  });

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ status: newStatus, reviewNotes });
  };

  return (
    <Card className="glass-panel border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{application.name}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Mail className="h-3 w-3" />
              <a href={`mailto:${application.email}`} className="hover:text-primary">
                {application.email}
              </a>
            </div>
          </div>
          <StatusBadge status={application.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Project Description</h4>
          <p className="text-sm line-clamp-3">{application.projectDescription}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Monthly Deliverables</h4>
            <p className="text-sm line-clamp-2">{application.monthlyDeliverables}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Research Relevance</h4>
            <p className="text-sm line-clamp-2">{application.researchRelevance}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            SF: {application.sfAvailability}
          </div>
          {application.documentPath && (
            <a 
              href={application.documentPath} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              {application.documentName || "View Document"}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Submitted {format(new Date(application.submittedAt), "MMM d, yyyy 'at' h:mm a")}
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full" data-testid={`button-review-${application.id}`}>
              Review Application
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review: {application.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Project Description</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{application.projectDescription}</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Monthly Deliverables</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{application.monthlyDeliverables}</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Research Relevance to CIMC</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{application.researchRelevance}</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">SF Availability</h4>
                <p className="text-sm text-muted-foreground">{application.sfAvailability}</p>
              </div>
              {application.documentPath && (
                <div>
                  <h4 className="font-medium mb-2">Attached Document</h4>
                  <a 
                    href={application.documentPath} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    {application.documentName || "View Document"}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}
              <div>
                <h4 className="font-medium mb-2">Review Notes</h4>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about this application..."
                  rows={3}
                  data-testid="input-review-notes"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleStatusChange("approved")}
                  disabled={updateMutation.isPending}
                  className="flex-1"
                  data-testid="button-approve"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange("under_review")}
                  disabled={updateMutation.isPending}
                  data-testid="button-under-review"
                >
                  Under Review
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleStatusChange("rejected")}
                  disabled={updateMutation.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function Grants() {
  const [activeTab, setActiveTab] = useState("all");

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["microgrants", activeTab === "all" ? undefined : activeTab],
    queryFn: () => getMicrograntApplications(activeTab === "all" ? undefined : activeTab),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const counts = {
    all: applications.length,
    pending: applications.filter(a => a.status === "pending").length,
    under_review: applications.filter(a => a.status === "under_review").length,
    approved: applications.filter(a => a.status === "approved").length,
    rejected: applications.filter(a => a.status === "rejected").length,
  };

  const filteredApps = activeTab === "all" 
    ? applications 
    : applications.filter(a => a.status === activeTab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground glow-text">Grants</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Microgrant Applications // {applications.length} total
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({counts.pending})
          </TabsTrigger>
          <TabsTrigger value="under_review" data-testid="tab-under-review">
            Under Review ({counts.under_review})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved ({counts.approved})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected ({counts.rejected})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredApps.length === 0 ? (
            <Card className="glass-panel border-primary/20">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground font-mono">
                  No {activeTab === "all" ? "" : activeTab.replace("_", " ")} applications found.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredApps.map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
