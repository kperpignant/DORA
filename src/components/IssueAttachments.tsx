import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const LOG_PREVIEW_MAX_BYTES = 50 * 1024;

interface IssueAttachmentsProps {
  issueId: Id<"issues">;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LogPreview({ url, fileName }: { url: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load file");
      const buffer = await response.arrayBuffer();
      const slice = buffer.slice(0, LOG_PREVIEW_MAX_BYTES);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
      const truncated = buffer.byteLength > LOG_PREVIEW_MAX_BYTES;
      setContent(truncated ? `${text}\n\n… (preview truncated)` : text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  return (
    <div className="attachment-log-preview">
      <div className="attachment-log-header">
        <span className="attachment-file-name" title={fileName}>
          {fileName}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="attachment-download-link"
        >
          Download
        </a>
      </div>
      {loading && <p className="attachment-log-status">Loading preview…</p>}
      {error && <p className="attachment-log-error">{error}</p>}
      {content !== null && (
        <pre className="attachment-log-content">{content}</pre>
      )}
    </div>
  );
}

function FileCard({
  fileName,
  size,
  url,
  icon,
}: {
  fileName: string;
  size: number;
  url: string;
  icon: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="attachment-file-card"
    >
      <span className="attachment-file-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="attachment-file-info">
        <span className="attachment-file-name" title={fileName}>
          {fileName}
        </span>
        <span className="attachment-file-size">{formatFileSize(size)}</span>
      </span>
    </a>
  );
}

export function IssueAttachments({ issueId }: IssueAttachmentsProps) {
  const attachments = useQuery(api.attachments.listByIssue, { issueId });
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const createAttachment = useMutation(api.attachments.create);
  const removeAttachment = useMutation(api.attachments.remove);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);
    setUploading(true);

    try {
      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`"${file.name}" exceeds the 50 MB size limit.`);
        }

        const uploadUrl = await generateUploadUrl({ issueId });
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload "${file.name}".`);
        }

        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };

        await createAttachment({
          issueId,
          storageId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void uploadFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = async (attachmentId: Id<"attachments">) => {
    if (!confirm("Remove this attachment?")) return;
    await removeAttachment({ attachmentId });
  };

  return (
    <div className="issue-attachments">
      <div
        className={`attachment-dropzone${isDragging ? " attachment-dropzone-active" : ""}${uploading ? " attachment-dropzone-uploading" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="attachment-file-input"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <p className="attachment-dropzone-text">
          {uploading ? "Uploading…" : "Drag files here or "}
          {!uploading && (
            <button
              type="button"
              className="attachment-browse-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              browse
            </button>
          )}
        </p>
        <p className="attachment-dropzone-hint">Max 50 MB per file</p>
      </div>

      {uploadError && <p className="attachment-upload-error">{uploadError}</p>}

      {attachments === undefined ? (
        <p className="empty-text">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="empty-text">No attachments yet</p>
      ) : (
        <div className="attachment-grid">
          {attachments.map((attachment) => (
            <div key={attachment._id} className="attachment-item">
              <button
                type="button"
                className="attachment-remove-btn"
                onClick={() => void handleRemove(attachment._id)}
                title="Remove attachment"
                aria-label={`Remove ${attachment.fileName}`}
              >
                ×
              </button>

              {attachment.kind === "image" && attachment.url && (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-image-link"
                >
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="attachment-thumbnail"
                  />
                  <span className="attachment-image-caption">
                    {attachment.fileName}
                  </span>
                </a>
              )}

              {attachment.kind === "log" && attachment.url && (
                <LogPreview url={attachment.url} fileName={attachment.fileName} />
              )}

              {attachment.kind === "video" && attachment.url && (
                <FileCard
                  fileName={attachment.fileName}
                  size={attachment.size}
                  url={attachment.url}
                  icon="🎬"
                />
              )}

              {attachment.kind === "other" && attachment.url && (
                <FileCard
                  fileName={attachment.fileName}
                  size={attachment.size}
                  url={attachment.url}
                  icon="📎"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
