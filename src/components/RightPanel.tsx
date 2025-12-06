import type { FileEntry, ToolTrace } from "../types";
import { InstantToolPanel } from "./InstantToolPanel";
import { ToolTracePanel } from "./ToolTracePanel";

interface RightPanelProps {
  toolTrace: ToolTrace[];
  listPath: string;
  listPattern: string;
  listRecursive: boolean;
  listResults: FileEntry[];
  listLoading: boolean;
  listError: string | null;
  onPathChange: (path: string) => void;
  onPatternChange: (pattern: string) => void;
  onRecursiveChange: (recursive: boolean) => void;
  onExecute: () => void;
  onReset: () => void;
}

export function RightPanel({
  toolTrace,
  listPath,
  listPattern,
  listRecursive,
  listResults,
  listLoading,
  listError,
  onPathChange,
  onPatternChange,
  onRecursiveChange,
  onExecute,
  onReset,
}: RightPanelProps) {
  return (
    <aside className="hidden w-full min-h-0 overflow-y-auto border-t border-white/5 px-6 py-6 lg:block lg:w-80 lg:border-l lg:border-t-0">
      {/* 工具轨迹面板 */}
      <ToolTracePanel toolTrace={toolTrace} />

      {/* 即时工具面板 */}
      <div className="mt-6">
        <InstantToolPanel
          listPath={listPath}
          listPattern={listPattern}
          listRecursive={listRecursive}
          listResults={listResults}
          listLoading={listLoading}
          listError={listError}
          onPathChange={onPathChange}
          onPatternChange={onPatternChange}
          onRecursiveChange={onRecursiveChange}
          onExecute={onExecute}
          onReset={onReset}
        />
      </div>
    </aside>
  );
}

