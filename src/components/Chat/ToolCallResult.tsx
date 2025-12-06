import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ToolCallResult } from "../../types";

interface ToolCallResultProps {
  result: ToolCallResult;
}

function getStatusIcon(status: ToolCallResult["status"]) {
  switch (status) {
    case "pending":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function getStatusBadge(status: ToolCallResult["status"]) {
  switch (status) {
    case "pending":
      return { className: "bg-blue-100 text-blue-700", text: "执行中" };
    case "success":
      return { className: "bg-green-100 text-green-700", text: "成功" };
    case "error":
      return { className: "bg-red-100 text-red-700", text: "失败" };
  }
}

export function ToolCallResultItem({ result }: ToolCallResultProps) {
  const statusBadge = getStatusBadge(result.status);

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        {getStatusIcon(result.status)}
        <span className="text-xs font-medium text-gray-700">执行工具调用: {result.toolName}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
      </div>

      {/* 参数 */}
      {typeof result.arguments === "object" && result.arguments !== null && (
        <div className="text-xs text-gray-600 mb-2">
          <span className="font-medium">参数:</span>
          <pre className="mt-1 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
            {(() => {
              try {
                return JSON.stringify(result.arguments, null, 2);
              } catch {
                return String(result.arguments);
              }
            })()}
          </pre>
        </div>
      )}

      {/* 结果 */}
      {result.result !== null && result.result !== undefined && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">结果:</span>
          <pre className="mt-1 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
            {(() => {
              if (typeof result.result === "string") {
                return result.result;
              }
              try {
                return JSON.stringify(result.result, null, 2);
              } catch {
                return String(result.result);
              }
            })()}
          </pre>
        </div>
      )}
    </div>
  );
}
