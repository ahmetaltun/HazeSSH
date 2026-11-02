export type ConnectionType = "ssh" | "local" | "serial" | "telnet";
export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SessionHistoryEntry {
  readonly id: string;
  readonly host_id?: string | null;
  readonly title: string;
  readonly connection_type: ConnectionType;
  readonly target: string;
  readonly status: SessionStatus;
  readonly error_message?: string | null;
  readonly log_file_path?: string | null;
  readonly recording_file_path?: string | null;
  readonly started_at: number;
  readonly ended_at?: number | null;
  readonly duration_seconds?: number | null;
}

export interface CreateSessionHistoryInput {
  readonly id: string;
  readonly host_id?: string | null;
  readonly title: string;
  readonly connection_type: ConnectionType;
  readonly target: string;
  readonly status: SessionStatus;
  readonly started_at: number;
  readonly log_file_path?: string | null;
}

export interface UpdateSessionHistoryInput {
  readonly id: string;
  readonly status?: SessionStatus;
  readonly error_message?: string | null;
  readonly ended_at?: number | null;
  readonly duration_seconds?: number | null;
  readonly log_file_path?: string | null;
  readonly recording_file_path?: string | null;
}

export interface AuditLogFileInfo {
  readonly filename: string;
  readonly file_path: string;
  readonly size_bytes: number;
  readonly created_at: number;
  readonly modified_at: number;
}

export interface RecordingFileInfo {
  readonly filename: string;
  readonly file_path: string;
  readonly size_bytes: number;
  readonly title?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly created_at: number;
  readonly modified_at: number;
}
