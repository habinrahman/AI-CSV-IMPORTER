"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const DEFAULT_MAX_UPLOAD_MB = 5;

interface UploadCardProps {
  file: File | null;
  onFileSelected: (file: File | null) => void;
  /** Client-side size limit; must match the server's MAX_FILE_SIZE_MB. */
  maxSizeMb?: number;
  /** When true, shows the progress bar and locks removal. */
  uploading?: boolean;
  /** 0–100, rendered while uploading. */
  progress?: number;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rejectionMessage(rejection: FileRejection, maxSizeMb: number): string {
  const code = rejection.errors[0]?.code;
  if (code === "file-too-large") {
    return `File is larger than the ${maxSizeMb} MB limit.`;
  }
  if (code === "file-invalid-type") {
    return "Only .csv files are accepted.";
  }
  if (code === "too-many-files") {
    return "Please drop a single file.";
  }
  return rejection.errors[0]?.message ?? "This file cannot be used.";
}

/**
 * Reusable CSV picker: drag & drop or click, client-side type/size validation,
 * selected-file preview with removal, and an upload progress bar. Purely
 * presentational — the network call is composed in by the page via props,
 * so the component works with any upload mechanism.
 */
export function UploadCard({
  file,
  onFileSelected,
  maxSizeMb = DEFAULT_MAX_UPLOAD_MB,
  uploading = false,
  progress = 0,
  disabled = false,
}: UploadCardProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const rejection = rejected[0];
      if (rejection) {
        setValidationError(rejectionMessage(rejection, maxSizeMb));
        onFileSelected(null);
        return;
      }
      setValidationError(null);
      onFileSelected(accepted[0] ?? null);
    },
    [onFileSelected, maxSizeMb],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] },
    maxSize: maxSizeMb * 1024 * 1024,
    maxFiles: 1,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: disabled || uploading,
  });

  if (file) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={uploading || disabled}
              onClick={() => {
                setValidationError(null);
                onFileSelected(null);
              }}
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {uploading ? (
            <div className="space-y-1">
              {/* Radix Progress carries role="progressbar" + aria-value* itself.
                  Meter track stays on the fill's own ramp (blue-on-blue). */}
              <Progress
                value={progress}
                aria-label="Upload progress"
                className="h-1.5 bg-primary/15"
              />
              <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          isDragActive && !isDragReject && "border-primary bg-primary/5",
          isDragReject && "border-destructive bg-destructive/5",
          !isDragActive && !disabled && "hover:border-muted-foreground/40",
        )}
        onClick={() => !disabled && open()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload a CSV file"
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            open();
          }
        }}
      >
        <input {...getInputProps()} />
        <div className="rounded-full bg-muted p-3">
          <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <p className="font-medium">
            {isDragActive ? "Drop the file here" : "Drag a CSV here, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            One .csv file, up to {maxSizeMb} MB — any column layout
          </p>
        </div>
      </div>
      {validationError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}
