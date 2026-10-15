import { useState } from 'react';

export default function CopyCommand({
  command,
  label = '复制命令',
}: {
  command: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy}>
      {copied ? '已复制' : label}
    </button>
  );
}
