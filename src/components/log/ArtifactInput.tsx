'use client';

import { useState } from 'react';
import { isValidUrl } from '@/lib/utils';
import { upsertTask } from '@/lib/actions/log';

interface ArtifactInputProps {
  taskId: string;
  logId: string;
  position: number;
  initialUrl: string | null;
  description: string;
  objectiveId: string | null;
}

export function ArtifactInput({
  taskId,
  logId,
  position,
  initialUrl,
  description,
  objectiveId,
}: ArtifactInputProps) {
  const [url, setUrl]     = useState(initialUrl ?? '');
  const [saved, setSaved] = useState(!!initialUrl);
  const [error, setError] = useState<string | null>(null);

  async function handleBlur() {
    if (!url) return;
    if (!isValidUrl(url)) {
      setError('Must be a valid https:// URL');
      return;
    }
    setError(null);

    const result = await upsertTask({
      id: taskId,
      log_id: logId,
      description,
      position,
      objective_id: objectiveId,
      artifact_url: url,
      status: 'complete',
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-500">Artifact URL *</label>
      <div className="flex items-center gap-2">
        <input
          type="url"
          placeholder="https://docs.google.com/..."
          className={`input-base text-xs flex-1 ${error ? 'border-red-700 focus:ring-red-500' : ''} ${saved ? 'border-green-800' : ''}`}
          value={url}
          onChange={e => { setUrl(e.target.value); setSaved(false); }}
          onBlur={handleBlur}
        />
        {saved && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 text-xs shrink-0"
            title="Open artifact"
          >
            ✓ Open
          </a>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
