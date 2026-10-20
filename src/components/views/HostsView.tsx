import { useState, useMemo } from "react";
import {
  Server,
  Plus,
  Search,
  Folder,
  Layers,
  LayoutGrid,
  List,
  Terminal,
  Trash2,
  Edit2,
  FolderGit2,
  Network,
  KeyRound,
  MoreVertical,
} from "lucide-react";
import { useHostStore } from "@/stores/useHostStore";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { Host } from "@/types/host";
import { HostModal } from "@/components/hosts/HostModal";
import { GroupModal } from "@/components/hosts/GroupModal";
import { IdentityModal } from "@/components/identities/IdentityModal";

export function HostsView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals state
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [hostToEdit, setHostToEdit] = useState<Host | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  const { hosts, groups, identities, deleteHost, deleteGroup } = useHostStore();
  const { openTab } = useMultiplexerStore();
  const { setView } = useLayoutStore();

  // All unique tags across all hosts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    hosts.forEach((h) => h.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [hosts]);

  // Filtered hosts based on search, group, and tag
  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      // Group filter
      if (selectedGroupId === "ungrouped" && h.group_id) {
        return false;
      }
      if (selectedGroupId && selectedGroupId !== "ungrouped" && h.group_id !== selectedGroupId) {
        return false;
      }

      // Tag filter
      if (selectedTag && !h.tags?.includes(selectedTag)) {
        return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesLabel = h.label.toLowerCase().includes(query);
        const matchesHostname = h.hostname.toLowerCase().includes(query);
        const matchesUser = h.username?.toLowerCase().includes(query);
        const matchesTags = h.tags?.some((t) => t.toLowerCase().includes(query));
        return matchesLabel || matchesHostname || matchesUser || matchesTags;
      }

      return true;
    });
  }, [hosts, selectedGroupId, selectedTag, searchTerm]);

  const handleConnect = (host: Host) => {
    openTab(
      {
        hostId: host.id,
        title: host.label,
        hostname: host.hostname,
        port: host.port,
        username: host.username || undefined,
        status: "connecting",
      },
      host.label
    );
  };

  const handleEdit = (host: Host) => {
    setHostToEdit(host);
    setIsHostModalOpen(true);
  };

  const handleDelete = async (host: Host) => {
    if (confirm(`Are you sure you want to delete "${host.label}"?`)) {
      await deleteHost(host.id);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (confirm(`Delete group "${groupName}"? Hosts will become ungrouped.`)) {
      await deleteGroup(groupId);
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
    }
  };

  return (
    <div className="flex-1 flex h-full bg-base-100 overflow-hidden">
      {/* Groups Sidebar Sub-panel */}
      <aside className="w-56 border-r border-base-200 bg-base-200/40 flex flex-col shrink-0 select-none">
        <div className="h-12 px-3 border-b border-base-200 flex items-center justify-between text-xs font-semibold text-base-content/75">
          <span className="flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-primary" />
            <span>Groups</span>
          </span>
          <button
            type="button"
            onClick={() => setIsGroupModalOpen(true)}
            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
            title="Add Group"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto text-xs">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
              selectedGroupId === null
                ? "bg-primary/15 text-primary font-semibold"
                : "text-base-content/70 hover:bg-base-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              <span>All Hosts</span>
            </span>
            <span className="badge badge-xs font-mono">{hosts.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedGroupId("ungrouped")}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
              selectedGroupId === "ungrouped"
                ? "bg-primary/15 text-primary font-semibold"
                : "text-base-content/70 hover:bg-base-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Folder className="w-3.5 h-3.5 opacity-50" />
              <span>Ungrouped</span>
            </span>
            <span className="badge badge-xs font-mono">
              {hosts.filter((h) => !h.group_id).length}
            </span>
          </button>

          {groups.length > 0 && <div className="divider my-1 opacity-50"></div>}

          {groups.map((group) => {
            const count = hosts.filter((h) => h.group_id === group.id).length;
            const isSelected = selectedGroupId === group.id;

            return (
              <div
                key={group.id}
                className={`group flex items-center justify-between px-2.5 py-1 rounded-lg transition-colors ${
                  isSelected
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-base-content/70 hover:bg-base-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className="flex items-center gap-2 flex-1 text-left truncate mr-1"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: group.color || "#3b82f6" }}
                  />
                  <span className="truncate">{group.name}</span>
                </button>

                <div className="flex items-center gap-1">
                  <span className="badge badge-xs font-mono">{count}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(group.id, group.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                    title="Delete Group"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Quick Identity Manager trigger */}
        <div className="p-2 border-t border-base-200 bg-base-200/50">
          <button
            type="button"
            onClick={() => setIsIdentityModalOpen(true)}
            className="btn btn-sm btn-ghost w-full justify-start gap-2 text-xs"
          >
            <KeyRound className="w-4 h-4 text-warning" />
            <span>Identities ({identities.length})</span>
          </button>
        </div>
      </aside>

      {/* Main Catalog Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Control Bar */}
        <div className="h-14 border-b border-base-200 px-5 flex items-center justify-between gap-3 shrink-0 bg-base-200/20">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search hosts by label, IP, username, tag..."
              className="input input-sm input-bordered w-full pl-9 bg-base-100 text-xs"
            />
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="join bg-base-200 p-0.5 rounded-lg border border-base-300">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`btn btn-xs join-item ${viewMode === "grid" ? "btn-primary shadow-xs" : "btn-ghost"}`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`btn btn-xs join-item ${viewMode === "list" ? "btn-primary shadow-xs" : "btn-ghost"}`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setHostToEdit(null);
                setIsHostModalOpen(true);
              }}
              className="btn btn-sm btn-primary gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Host</span>
            </button>
          </div>
        </div>

        {/* Tag Filter Chips */}
        {allTags.length > 0 && (
          <div className="px-5 py-2 border-b border-base-200 bg-base-200/10 flex items-center gap-1.5 overflow-x-auto select-none no-scrollbar">
            <span className="text-[11px] text-base-content/50 uppercase font-bold mr-1">Tags:</span>
            {selectedTag && (
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className="badge badge-primary badge-sm text-[10px] cursor-pointer"
              >
                Clear Filter ✕
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`badge badge-sm font-mono text-[10px] transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? "badge-primary"
                    : "badge-neutral hover:badge-primary"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-5 overflow-y-auto">
          {filteredHosts.length === 0 ? (
            <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto mt-12">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold">No hosts match your criteria</h3>
                <p className="text-xs text-base-content/60 mt-1">
                  {hosts.length === 0
                    ? "Add your first SSH host to get started."
                    : "Try clearing search filters or selecting another group."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHostToEdit(null);
                  setIsHostModalOpen(true);
                }}
                className="btn btn-sm btn-primary gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Host</span>
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredHosts.map((host) => {
                const group = groups.find((g) => g.id === host.group_id);
                const jumpHost = hosts.find((h) => h.id === host.jump_host_id);

                return (
                  <div
                    key={host.id}
                    className="card bg-base-200/50 border border-base-300 hover:border-primary/50 transition-all duration-200 shadow-xs hover:shadow-md group flex flex-col justify-between"
                  >
                    <div className="card-body p-4 space-y-2">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: host.color || "#3b82f6" }}
                          />
                          <h4 className="font-bold text-sm truncate" title={host.label}>
                            {host.label}
                          </h4>
                        </div>

                        {/* Actions menu */}
                        <div className="dropdown dropdown-end">
                          <div
                            tabIndex={0}
                            role="button"
                            className="btn btn-ghost btn-xs btn-square opacity-60 group-hover:opacity-100"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </div>
                          <ul
                            tabIndex={0}
                            className="dropdown-content z-20 menu p-1.5 shadow-xl bg-base-200 border border-base-300 rounded-box w-36 text-xs"
                          >
                            <li>
                              <button type="button" onClick={() => handleEdit(host)}>
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                onClick={() => setView("sftp")}
                              >
                                <FolderGit2 className="w-3 h-3" /> SFTP
                              </button>
                            </li>
                            <li className="text-error">
                              <button type="button" onClick={() => handleDelete(host)}>
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* Connection Address */}
                      <div className="font-mono text-xs text-base-content/70 truncate bg-base-100/60 p-1.5 rounded-md border border-base-300/40">
                        {host.username ? `${host.username}@` : ""}
                        {host.hostname}
                        <span className="text-base-content/40">:{host.port}</span>
                      </div>

                      {/* Badges / Meta */}
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {group && (
                          <span className="badge badge-xs badge-neutral truncate max-w-[100px]">
                            {group.name}
                          </span>
                        )}
                        {jumpHost && (
                          <span
                            className="badge badge-xs badge-secondary gap-1"
                            title={`Jump Host: ${jumpHost.label}`}
                          >
                            <Network className="w-2.5 h-2.5" />
                            via {jumpHost.label}
                          </span>
                        )}
                        <span className="badge badge-xs badge-outline uppercase font-mono">
                          {host.auth_type}
                        </span>
                      </div>

                      {/* Tags */}
                      {host.tags && host.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {host.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] text-base-content/50 font-mono"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="px-4 py-2.5 border-t border-base-300/40 bg-base-200/80 flex items-center justify-between rounded-b-2xl">
                      <span className="text-[10px] text-base-content/40 font-mono">
                        SSH2
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConnect(host)}
                        className="btn btn-xs btn-primary gap-1 font-semibold"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Connect</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List / Table View */
            <div className="overflow-x-auto border border-base-300 rounded-xl bg-base-200/30">
              <table className="table table-sm">
                <thead>
                  <tr className="bg-base-200/60 text-xs text-base-content/60">
                    <th className="w-8"></th>
                    <th>Label</th>
                    <th>Address</th>
                    <th>Group</th>
                    <th>Auth</th>
                    <th>Jump Host</th>
                    <th>Tags</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {filteredHosts.map((host) => {
                    const group = groups.find((g) => g.id === host.group_id);
                    const jumpHost = hosts.find((h) => h.id === host.jump_host_id);

                    return (
                      <tr key={host.id} className="hover:bg-base-200/50 transition-colors">
                        <td>
                          <span
                            className="w-2.5 h-2.5 rounded-full block"
                            style={{ backgroundColor: host.color || "#3b82f6" }}
                          />
                        </td>
                        <td className="font-bold">{host.label}</td>
                        <td className="font-mono text-base-content/75">
                          {host.username ? `${host.username}@` : ""}
                          {host.hostname}:{host.port}
                        </td>
                        <td>{group ? group.name : "-"}</td>
                        <td>
                          <span className="badge badge-xs badge-neutral uppercase font-mono">
                            {host.auth_type}
                          </span>
                        </td>
                        <td>
                          {jumpHost ? (
                            <span className="text-secondary font-medium">via {jumpHost.label}</span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {host.tags?.map((t) => (
                              <span key={t} className="badge badge-xs font-mono">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConnect(host)}
                              className="btn btn-xs btn-primary gap-1"
                            >
                              <Terminal className="w-3 h-3" />
                              <span>Connect</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(host)}
                              className="btn btn-xs btn-ghost btn-square"
                              title="Edit"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(host)}
                              className="btn btn-xs btn-ghost btn-square text-error"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isHostModalOpen && (
        <HostModal
          isOpen={true}
          hostToEdit={hostToEdit}
          onClose={() => {
            setIsHostModalOpen(false);
            setHostToEdit(null);
          }}
        />
      )}

      {isGroupModalOpen && (
        <GroupModal
          isOpen={true}
          onClose={() => setIsGroupModalOpen(false)}
        />
      )}

      {isIdentityModalOpen && (
        <IdentityModal
          isOpen={true}
          onClose={() => setIsIdentityModalOpen(false)}
        />
      )}
    </div>
  );
}
