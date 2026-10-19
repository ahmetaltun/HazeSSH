import { Network, Plus } from "lucide-react";

export function TunnelsView() {
  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      <div className="h-14 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <h2 className="text-base font-bold">Port Forwarding & Tunnels</h2>
          <p className="text-xs text-base-content/60">
            Manage Local, Remote, and Dynamic (SOCKS5) SSH tunnels
          </p>
        </div>

        <button type="button" className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-4 h-4" />
          <span>New Tunnel</span>
        </button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center">
        <div className="border-2 border-dashed border-base-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg">
          <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">No active tunnels</h3>
            <p className="text-xs text-base-content/60 mt-1">
              Forward local ports to remote databases or configure SOCKS5 dynamic proxies.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-accent gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Create First Tunnel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
