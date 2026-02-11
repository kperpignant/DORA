type Severity = "critical" | "major" | "minor" | "trivial";

interface SeverityBadgeProps {
  severity: Severity;
}

const severityConfig: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Critical", className: "severity-critical" },
  major: { label: "Major", className: "severity-major" },
  minor: { label: "Minor", className: "severity-minor" },
  trivial: { label: "Trivial", className: "severity-trivial" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const config = severityConfig[severity];
  return <span className={`badge ${config.className}`}>{config.label}</span>;
}
