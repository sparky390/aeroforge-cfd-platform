import { useEffect, useRef } from 'react';
import { ChevronDown, TerminalSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import type { JobStatus, LogEntry, LogLevel } from '../types';

interface Props {
  logs: LogEntry[];
  open: boolean;
  status: JobStatus;
  onToggle: () => void;
}

const levelClasses: Record<LogLevel, string> = {
  INFO: 'text-blueGlow',
  WARNING: 'text-amberWarn',
  ERROR: 'text-danger',
  SUCCESS: 'text-success',
};

export function DebugConsole({ logs, open, status, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, open]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel overflow-hidden"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-cyanGlow/10 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md border border-cyanGlow/30 bg-cyanGlow/10 text-cyanGlow">
            <TerminalSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Live Debug Console</p>
            <p className="font-mono text-xs text-slate-500">{status === 'Unknown' ? 'diagnostics://idle' : `diagnostics://${status.toLowerCase()}`}</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-cyanGlow transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div ref={scrollRef} className="debug-scroll scanline h-48 overflow-y-auto bg-black/42 p-4 font-mono text-xs leading-6">
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="grid grid-cols-[88px_84px_minmax(0,1fr)] gap-3">
              <span className="text-slate-600">{formatTime(log.timestamp)}</span>
              <span className={levelClasses[log.level]}>[{log.level}]</span>
              <span className="min-w-0 text-slate-200">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
