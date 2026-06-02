'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * `<DataCard>` — Phase L3.6 "Tus datos" download.
 *
 * Single-button card that fetches `/api/v1/me/export`, blobs the
 * response, and triggers a browser download via a transient anchor.
 * Using fetch + blob (rather than a plain `<a href>`) lets us show a
 * loading spinner while the server builds the ZIP — at our scale the
 * build is sub-second but the experience matters.
 *
 * Failure modes surface inline; the user can retry without leaving
 * the page.
 */

type Status = { kind: 'idle' } | { kind: 'error'; messageKey: string };

export function DataCard() {
  const t = useTranslations('settings.sections.data');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  function handleDownload(): void {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      try {
        const response = await fetch('/api/v1/me/export', {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (!response.ok) {
          setStatus({ kind: 'error', messageKey: `error.http_${response.status}` });
          return;
        }
        const blob = await response.blob();
        const filename = extractFilename(response.headers.get('Content-Disposition'));
        triggerBrowserDownload(blob, filename);
      } catch (err) {
        console.warn('[DataCard] download failed', err);
        setStatus({ kind: 'error', messageKey: 'error.network' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('body')}</p>
      {status.kind === 'error' && <p className="text-xs text-red-700">{t(status.messageKey)}</p>}
      <div className="flex sm:justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleDownload}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{t('preparing')}</span>
            </>
          ) : (
            <>
              <Download className="size-4" aria-hidden />
              <span>{t('cta')}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Parse `Content-Disposition: attachment; filename="ifa-export-2026-06-02.zip"`
 * into just the filename. Falls back to a generic name if the header is
 * missing or malformed — the server always sends a sensible value, so
 * this is purely defensive.
 */
function extractFilename(header: string | null): string {
  if (!header) return 'ifa-export.zip';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? 'ifa-export.zip';
}

/**
 * Trigger a download via a hidden anchor + revoked object URL. This is
 * the standard pattern for "fetch then save" downloads — letting the
 * fetch complete first means we can show a spinner.
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /*
   * Revoke after a tick — Safari needs the URL to live for at least
   * one event-loop turn after the click for the download to start.
   */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
