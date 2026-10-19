import { useState } from "react";
import {
  Server,
  Plus,
  Search,
  FolderPlus,
} from "lucide-react";

export function HostsView() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      {/* View Header */}
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between gap-4 shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">Host Catalog & Groups</h2>
          <p className="text-xs text-base-content/60">
            Manage SSH targets, credentials, and jump hosts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost border border-base-300 gap-1.5"
          >
            <FolderPlus className="w-4 h-4 text-secondary" />
            <span>New Group</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Host</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-base-200 bg-base-200/10 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search hosts by label, IP, tag, or group..."
            className="input input-sm input-bordered w-full pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <span>0 Hosts Configured</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto mt-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">No hosts configured yet</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Add your first SSH host or import existing servers from your{" "}
              <code className="text-primary font-mono">~/.ssh/config</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Host</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
