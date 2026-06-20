interface CodeBlockProps {
  value: string;
  className?: string;
}

export function CodeBlock({ value, className }: CodeBlockProps) {
  const classes = ["code-block", className].filter(Boolean).join(" ");
  return (
    <pre className={classes}>
      <code>{value}</code>
    </pre>
  );
}
