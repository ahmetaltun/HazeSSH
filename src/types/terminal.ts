import type { SerialConnectOptions } from "@/types/serial";
import type { TelnetConnectOptions } from "@/types/telnet";

export type SplitDirection = "horizontal" | "vertical";

export interface TerminalPane {
  readonly id: string;
  readonly title: string;
  readonly connectionType?: "ssh" | "serial" | "telnet";
  readonly hostId?: string;
  readonly hostname?: string;
  readonly port?: number;
  readonly username?: string;
  readonly serialOptions?: SerialConnectOptions;
  readonly telnetOptions?: TelnetConnectOptions;
  readonly status: "idle" | "connecting" | "connected" | "disconnected" | "error";
  readonly errorMessage?: string;
  readonly createdAt: number;
  readonly sourceHost?: {
    readonly hostId?: string;
    readonly hostname?: string;
    readonly port?: number;
    readonly username?: string;
    readonly title?: string;
    readonly connectionType?: "ssh" | "serial" | "telnet";
  };
}

export interface SplitBranchNode {
  readonly type: "branch";
  readonly id: string;
  readonly direction: SplitDirection;
  readonly ratio: number; // 0.1 to 0.9 (default 0.5)
  readonly first: SplitNode;
  readonly second: SplitNode;
}

export interface SplitLeafNode {
  readonly type: "leaf";
  readonly id: string;
  readonly pane: TerminalPane;
}

export type SplitNode = SplitBranchNode | SplitLeafNode;

export interface WorkspaceTab {
  readonly id: string;
  readonly title: string;
  readonly activePaneId: string;
  readonly rootNode: SplitNode;
  readonly isLocked?: boolean;
}
