import { useState, useEffect, useMemo } from "react";
import {
  Download,
  AlertCircle,
  X,
  Search,
  CheckCircle2,
  Key,
  Folder,
  ShieldCheck,
  RefreshCw,
  FileCode,
  Network,
  CopyCheck,
} from "lucide-react";
import { api } from "@/services/api";
import { useHostStore } from "@/stores/useHostStore";
import type { SshConfigHostCandidate, ImportResultSummary } from "@/types/importer";

interface OpenSshImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function OpenSshImportModal({ isOpen, onClose }: OpenSshImportModalProps) {
  const [customPath, setCustomPath] = useState("");
  const [candidates, setCandidates] = useState<SshConfigHostCandidate[]>([]);
  const [configPath, setConfigPath] = useState("");
  const [foundConfig, setFoundConfig] = useState(false);
  const [foundKnownHosts, setFoundKnownHosts] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [importKeysAsIdentities, setImportKeysAsIdentities] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDuplicates, setFilterDuplicates] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultSummary | null>(null);

  const loadSshConfig = async (path?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const result = await api.sshConfigParse(path);
      setConfigPath(result.config_path);
      setFoundConfig(result.found_config);
      setFoundKnownHosts(result.found_known_hosts);
      setCandidates(result.candidates);

      // By default, select all non-duplicate candidates
      const initialSelected = new Set<string>();
      result.candidates.forEach((c) => {
        if (!c.is_duplicate) {
          initialSelected.add(c.label);
        }
      });
      setSelectedLabels(initialSelected);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to parse SSH config: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSshConfig(customPath ? customPath : undefined);
    }
  }, [isOpen]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterDuplicates && c.is_duplicate) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.hostname.toLowerCase().includes(q) ||
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.group_name && c.group_name.toLowerCase().includes(q))
      );
    });
  }, [candidates, searchQuery, filterDuplicates]);

  if (!isOpen) return null;

  const toggleSelectAll = () => {
    if (selectedLabels.size === filteredCandidates.length && filteredCandidates.length > 0) {
      setSelectedLabels(new Set());
    } else {
      const newSelected = new Set(selectedLabels);
      filteredCandidates.forEach((c) => newSelected.add(c.label));
      setSelectedLabels(newSelected);
    }
  };

  const toggleSelectCandidate = (label: string) => {
    const next = new Set(selectedLabels);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    setSelectedLabels(next);
  };

  const handleImport = async () => {
    const selectedList = candidates.filter((c) => selectedLabels.has(c.label));
    if (selectedList.length === 0) {
      setErrorMsg("Please select at least one host to import.");
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);

    try {
      const result = await api.sshConfigImport({
        candidates: selectedList,
        import_keys_as_identities: importKeysAsIdentities,
      });

      setImportResult(result);
      await useHostStore.getState().fetchAll();

      setTimeout(() => {
        onClose();
        setImportResult(null);
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-4xl bg-base-100 border border-base-300 shadow-2xl p-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-base-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Import from OpenSSH</h3>
              <p className="text-xs text-base-content/60">
                Read-only selective import from ~/.ssh/config and known_hosts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            disabled={isImporting}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-error text-xs py-2 mt-4 rounded-xl flex items-start gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {importResult ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-base">Import Completed Successfully!</h4>
            <div className="flex justify-center gap-4 text-xs pt-2">
              <span className="badge badge-primary gap-1 p-3">
                {importResult.imported_hosts_count} Hosts
              </span>
              <span className="badge badge-secondary gap-1 p-3">
                {importResult.imported_groups_count} Groups
              </span>
              <span className="badge badge-accent gap-1 p-3">
                {importResult.imported_identities_count} Keys
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Path & Source Controls */}
            <div className="bg-base-200/50 p-3 rounded-xl border border-base-300 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                <span className="text-xs font-semibold whitespace-nowrap text-base-content/70">
                  Config Path:
                </span>
                <input
                  type="text"
                  placeholder={configPath || "~/.ssh/config"}
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="input input-bordered input-xs flex-1 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => loadSshConfig(customPath || undefined)}
                  className="btn btn-xs btn-outline gap-1"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                  <span>Scan</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`badge badge-xs text-[10px] ${
                    foundConfig ? "badge-success" : "badge-error"
                  }`}
                >
                  {foundConfig ? "config found" : "config missing"}
                </span>
                <span
                  className={`badge badge-xs text-[10px] ${
                    foundKnownHosts ? "badge-info" : "badge-ghost"
                  }`}
                >
                  {foundKnownHosts ? "known_hosts active" : "no known_hosts"}
                </span>
              </div>
            </div>

            {/* Filter and Selection Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 my-3 shrink-0">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Filter by label, host, group..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-bordered input-xs w-full pl-7 text-xs"
                />
                <Search className="w-3.5 h-3.5 text-base-content/40 absolute left-2 top-2" />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                <label className="cursor-pointer label py-0 gap-2">
                  <span className="label-text text-xs">Hide existing duplicates</span>
                  <input
                    type="checkbox"
                    checked={filterDuplicates}
                    onChange={(e) => setFilterDuplicates(e.target.checked)}
                    className="checkbox checkbox-xs checkbox-primary"
                  />
                </label>

                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="btn btn-xs btn-ghost text-xs gap-1"
                >
                  <CopyCheck className="w-3.5 h-3.5" />
                  <span>
                    {selectedLabels.size === filteredCandidates.length && filteredCandidates.length > 0
                      ? "Deselect All"
                      : "Select All"}
                  </span>
                </button>
              </div>
            </div>

            {/* Candidates Table */}
            <div className="flex-1 overflow-y-auto border border-base-300 rounded-xl bg-base-100 min-h-[220px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-xs text-base-content/60 gap-2">
                  <span className="loading loading-spinner loading-sm" />
                  <span>Analyzing SSH configuration file...</span>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2">
                  <FileCode className="w-8 h-8 text-base-content/30" />
                  <p className="text-xs text-base-content/60">
                    {foundConfig
                      ? "No matching SSH host entries found."
                      : "No OpenSSH config file found at the specified path."}
                  </p>
                </div>
              ) : (
                <table className="table table-xs table-pin-rows">
                  <thead>
                    <tr className="bg-base-200/80 text-[11px]">
                      <th className="w-8"></th>
                      <th>Host / Alias</th>
                      <th>Address</th>
                      <th>User</th>
                      <th>Group</th>
                      <th>Auth / Key</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidates.map((c) => {
                      const isSelected = selectedLabels.has(c.label);
                      return (
                        <tr
                          key={c.label}
                          onClick={() => toggleSelectCandidate(c.label)}
                          className={`cursor-pointer hover:bg-base-200/40 transition-colors ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectCandidate(c.label)}
                              className="checkbox checkbox-xs checkbox-primary"
                            />
                          </td>
                          <td className="font-semibold text-xs font-mono text-base-content/90">
                            {c.label}
                          </td>
                          <td className="font-mono text-[11px] text-base-content/70">
                            {c.hostname}
                            {c.port !== 22 && (
                              <span className="text-primary font-bold">:{c.port}</span>
                            )}
                          </td>
                          <td className="text-[11px] text-base-content/80">
                            {c.username || <span className="opacity-40 italic">default</span>}
                          </td>
                          <td>
                            {c.group_name ? (
                              <span className="badge badge-xs badge-ghost gap-1 text-[10px]">
                                <Folder className="w-2.5 h-2.5 text-secondary" />
                                <span>{c.group_name}</span>
                              </span>
                            ) : (
                              <span className="opacity-30 text-[10px]">—</span>
                            )}
                          </td>
                          <td>
                            {c.identity_file ? (
                              <span className="badge badge-xs badge-outline gap-1 text-[10px] font-mono">
                                <Key className="w-2.5 h-2.5 text-accent" />
                                <span>{c.identity_file.split("/").pop()}</span>
                              </span>
                            ) : c.proxy_jump ? (
                              <span className="badge badge-xs badge-outline gap-1 text-[10px] font-mono">
                                <Network className="w-2.5 h-2.5 text-info" />
                                <span>via {c.proxy_jump}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-base-content/40">Password/Agent</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              {c.is_duplicate && (
                                <span className="badge badge-xs badge-warning text-[9px]">
                                  Duplicate
                                </span>
                              )}
                              {c.is_known_host && (
                                <span className="badge badge-xs badge-success text-[9px] gap-0.5">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Known
                                </span>
                              )}
                              {!c.is_duplicate && !c.is_known_host && (
                                <span className="badge badge-xs badge-ghost text-[9px]">New</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Actions and Options */}
            <div className="pt-4 border-t border-base-200 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <label className="cursor-pointer label py-0 gap-2">
                <input
                  type="checkbox"
                  checked={importKeysAsIdentities}
                  onChange={(e) => setImportKeysAsIdentities(e.target.checked)}
                  className="toggle toggle-primary toggle-xs"
                />
                <span className="label-text text-xs text-base-content/80">
                  Automatically import referenced private keys into local credential vault
                </span>
              </label>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-sm btn-ghost"
                  disabled={isImporting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting || selectedLabels.size === 0}
                  className="btn btn-sm btn-primary gap-1.5"
                >
                  {isImporting ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Import {selectedLabels.size} Selected</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="modal-backdrop bg-base-900/60 backdrop-blur-xs" onClick={onClose} />
    </div>
  );
}
