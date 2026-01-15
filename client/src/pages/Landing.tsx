import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { Rocket, FileText, Upload, CheckCircle, Lock } from "lucide-react";

export default function Landing() {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPath, setDocumentPath] = useState<string>("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    projectDescription: "",
    monthlyDeliverables: "",
    researchRelevance: "",
    sfAvailability: "",
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or Word document",
        variant: "destructive",
      });
      return;
    }

    setDocumentFile(file);
    
    const result = await uploadFile(file);
    if (result) {
      setDocumentPath(result.objectPath);
      toast({
        title: "Document uploaded",
        description: file.name,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/microgrants/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          documentPath: documentPath || null,
          documentName: documentFile?.name || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit application");
      }

      setSubmitted(true);
      toast({
        title: "Application submitted",
        description: "Thank you! We will review your application and get back to you.",
      });
    } catch (error) {
      toast({
        title: "Submission failed",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <Card className="w-full max-w-md glass-panel border-primary/20 relative z-10 text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Application Submitted!</h2>
            <p className="text-muted-foreground">
              Thank you for applying. We will review your application and contact you soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
      
      <header className="relative z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            <span className="font-mono text-xl font-bold">
              CIMC<span className="text-primary">.AI</span>
            </span>
          </div>
          <a
            href="/login"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            data-testid="link-login"
          >
            <Lock className="h-4 w-4" />
            Admin Login
          </a>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold mb-4">
              CIMC Microgrant Program
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Apply for a microgrant to support your research project aligned with CIMC's research objectives.
            </p>
          </div>

          <Card className="glass-panel border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Application Form
              </CardTitle>
              <CardDescription>
                Please fill out all fields below. All applications are reviewed monthly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Your full name"
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="projectDescription">Project Description *</Label>
                  <Textarea
                    id="projectDescription"
                    required
                    rows={4}
                    value={formData.projectDescription}
                    onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })}
                    placeholder="Describe your research project in detail..."
                    data-testid="input-project-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthlyDeliverables">Monthly Deliverables *</Label>
                  <Textarea
                    id="monthlyDeliverables"
                    required
                    rows={3}
                    value={formData.monthlyDeliverables}
                    onChange={(e) => setFormData({ ...formData, monthlyDeliverables: e.target.value })}
                    placeholder="What specific deliverables can you accomplish in one month? Be specific..."
                    data-testid="input-monthly-deliverables"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="researchRelevance">Research Relevance to CIMC *</Label>
                  <Textarea
                    id="researchRelevance"
                    required
                    rows={3}
                    value={formData.researchRelevance}
                    onChange={(e) => setFormData({ ...formData, researchRelevance: e.target.value })}
                    placeholder="How does your project relate to CIMC's research objectives?"
                    data-testid="input-research-relevance"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sfAvailability">SF Availability *</Label>
                  <Textarea
                    id="sfAvailability"
                    required
                    rows={2}
                    value={formData.sfAvailability}
                    onChange={(e) => setFormData({ ...formData, sfAvailability: e.target.value })}
                    placeholder="What dates would you be available to be in San Francisco?"
                    data-testid="input-sf-availability"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="document">Supporting Document (PDF or Word)</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="document"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="flex-1"
                      disabled={isUploading}
                      data-testid="input-document"
                    />
                    {isUploading && (
                      <span className="text-sm text-muted-foreground">Uploading...</span>
                    )}
                    {documentFile && !isUploading && (
                      <div className="flex items-center gap-1 text-sm text-primary">
                        <Upload className="h-4 w-4" />
                        {documentFile.name}
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting || isUploading}
                  data-testid="button-submit-application"
                >
                  {isSubmitting ? "Submitting..." : "Submit Application"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
