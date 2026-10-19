import { Code2, Plus } from "lucide-react";

export function SnippetsView() {
  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">Snippets & Automation</h2>
          <p className="text-xs text-base-content/60">
            Reusable shell scripts with dynamic variables and batch execution
          </p>
        </div>

        <button type="button" className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-4 h-4" />
          <span>New Snippet</span>
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg">
          <div className="w-12 h-12 rounded-xl bg-warning/10 text-warning flex items-center justify-center">
            <Code2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">No snippets saved</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Store frequently run shell commands and scripts with variable placeholders like{" "}
              <code className="text-warning font-mono">{"{{host}}"}</code>.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-primary gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Create First Snippet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
