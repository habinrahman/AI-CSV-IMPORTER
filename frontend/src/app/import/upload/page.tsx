"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Ban } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/fade-in";
import { UploadCard } from "@/features/import/components/upload-card";
import { useUploadCsv } from "@/features/import/hooks/use-upload-csv";
import { useImportFlow } from "@/features/import/import-flow-context";
import { ApiError, isAbortError } from "@/lib/api/client";

function errorText(error: Error): { title: string; description: string } {
  if (error instanceof ApiError) {
    return {
      title: "Upload rejected",
      description: error.requestId
        ? `${error.message} (request ${error.requestId})`
        : error.message,
    };
  }
  return { title: "Upload failed", description: error.message };
}

export default function UploadPage() {
  const router = useRouter();
  const { file, setFile, upload, setUpload } = useImportFlow();
  const { upload: uploadFile, isUploading, error, progress, cancel, reset } = useUploadCsv();

  // Cancellation is a user action, not a failure — don't render it as one.
  const failure = error && !isAbortError(error) ? errorText(error) : null;

  const handleFileSelected = (next: File | null) => {
    reset();
    setFile(next);
  };

  const handleContinue = async () => {
    if (!file) return;
    // Already uploaded this exact selection (user came back from preview).
    if (upload) {
      router.push("/import/preview");
      return;
    }
    try {
      const response = await uploadFile(file);
      setUpload(response);
      router.push("/import/preview");
    } catch {
      // Shown via the mutation's error state below.
    }
  };

  return (
    <FadeIn className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload your CSV</h1>
        <p className="mt-1 text-muted-foreground">
          Any column layout works — the AI figures out what each column means.
        </p>
      </div>

      <UploadCard
        file={file}
        onFileSelected={handleFileSelected}
        uploading={isUploading}
        progress={progress}
      />

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{failure.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-3">
        {isUploading ? (
          <Button variant="outline" size="lg" onClick={cancel}>
            <Ban className="mr-1 h-4 w-4" aria-hidden />
            Cancel
          </Button>
        ) : null}
        <Button size="lg" disabled={!file || isUploading} onClick={handleContinue}>
          {isUploading
            ? `Uploading… ${progress}%`
            : upload
              ? "Continue to preview"
              : "Upload & continue"}
          {!isUploading ? <ArrowRight className="ml-1 h-4 w-4" aria-hidden /> : null}
        </Button>
      </div>
    </FadeIn>
  );
}
