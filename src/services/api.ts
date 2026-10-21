import { invoke, Channel } from "@tauri-apps/api/core";
import type { VaultStatus } from "@/types/vault";
import type {
  Host,
  CreateHostInput,
  UpdateHostInput,
  HostGroup,
  CreateGroupInput,
  Identity,
  CreateIdentityInput,
} from "@/types/host";
import type { Snippet, CreateSnippetInput, UpdateSnippetInput } from "@/types/snippet";
import type { Tunnel, CreateTunnelInput, TunnelRuntimeStatus } from "@/types/tunnel";
import type { GeneratedKeyPair } from "@/types/crypto";
import type { SshEvent } from "@/types/ssh";
import type { FileEntry } from "@/types/sftp";
import type { BackupSummary, RestoreStrategy } from "@/types/backup";
import type {
  SshConfigParseResult,
  ImportSshHostsInput,
  ImportResultSummary,
  TermiusParseResult,
  ImportTermiusInput,
  SshConfigHostCandidate,
} from "@/types/importer";
import type { ServerMetrics } from "@/types/monitor";
import type { SerialPortInfo, SerialConnectOptions } from "@/types/serial";
import type { TelnetConnectOptions } from "@/types/telnet";

export const api = {
  // --- Vault ---
  vaultGetStatus: async (): Promise<VaultStatus> => {
    return await invoke<VaultStatus>("vault_get_status");
  },

  vaultSetMasterPassword: async (password: string | null): Promise<void> => {
    return await invoke<void>("vault_set_master_password", { password });
  },

  vaultUnlock: async (password: string): Promise<boolean> => {
    return await invoke<boolean>("vault_unlock", { password });
  },

  vaultLock: async (): Promise<void> => {
    return await invoke<void>("vault_lock");
  },

  // --- Hosts ---
  hostList: async (): Promise<Host[]> => {
    return await invoke<Host[]>("host_list");
  },

  hostCreate: async (input: CreateHostInput): Promise<Host> => {
    return await invoke<Host>("host_create", { input });
  },

  hostUpdate: async (input: UpdateHostInput): Promise<Host> => {
    return await invoke<Host>("host_update", { input });
  },

  hostDelete: async (id: string): Promise<boolean> => {
    return await invoke<boolean>("host_delete", { id });
  },

  // --- Groups ---
  groupList: async (): Promise<HostGroup[]> => {
    return await invoke<HostGroup[]>("group_list");
  },

  groupCreate: async (input: CreateGroupInput): Promise<HostGroup> => {
    return await invoke<HostGroup>("group_create", { input });
  },

  groupDelete: async (id: string): Promise<boolean> => {
    return await invoke<boolean>("group_delete", { id });
  },

  // --- Identities ---
  identityList: async (): Promise<Identity[]> => {
    return await invoke<Identity[]>("identity_list");
  },

  identityCreate: async (input: CreateIdentityInput): Promise<Identity> => {
    return await invoke<Identity>("identity_create", { input });
  },

  identityDelete: async (id: string): Promise<boolean> => {
    return await invoke<boolean>("identity_delete", { id });
  },

  // --- Snippets ---
  snippetList: async (): Promise<Snippet[]> => {
    return await invoke<Snippet[]>("snippet_list");
  },

  snippetCreate: async (input: CreateSnippetInput): Promise<Snippet> => {
    return await invoke<Snippet>("snippet_create", { input });
  },

  snippetUpdate: async (input: UpdateSnippetInput): Promise<Snippet> => {
    return await invoke<Snippet>("snippet_update", { input });
  },

  snippetDelete: async (id: string): Promise<boolean> => {
    return await invoke<boolean>("snippet_delete", { id });
  },

  // --- Tunnels ---
  tunnelList: async (): Promise<Tunnel[]> => {
    return await invoke<Tunnel[]>("tunnel_list");
  },

  tunnelCreate: async (input: CreateTunnelInput): Promise<Tunnel> => {
    return await invoke<Tunnel>("tunnel_create", { input });
  },

  tunnelDelete: async (id: string): Promise<boolean> => {
    return await invoke<boolean>("tunnel_delete", { id });
  },

  tunnelStart: async (id: string): Promise<void> => {
    return await invoke<void>("tunnel_start", { id });
  },

  tunnelStop: async (id: string): Promise<void> => {
    return await invoke<void>("tunnel_stop", { id });
  },

  tunnelGetStatuses: async (): Promise<TunnelRuntimeStatus[]> => {
    return await invoke<TunnelRuntimeStatus[]>("tunnel_get_statuses");
  },

  // --- Key Generation ---
  keyGenerate: async (algorithm: string, comment?: string): Promise<GeneratedKeyPair> => {
    return await invoke<GeneratedKeyPair>("key_generate", { algorithm, comment });
  },

  // --- SSH Streaming ---
  sshConnect: async (params: {
    hostId?: string;
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    cols: number;
    rows: number;
    onEvent: (event: SshEvent) => void;
  }): Promise<string> => {
    const channel = new Channel<SshEvent>();
    channel.onmessage = params.onEvent;

    return await invoke<string>("ssh_connect", {
      hostId: params.hostId,
      hostname: params.hostname,
      port: params.port,
      username: params.username,
      password: params.password,
      cols: params.cols,
      rows: params.rows,
      onEvent: channel,
    });
  },

  sshWrite: async (sessionId: string, data: number[]): Promise<void> => {
    return await invoke<void>("ssh_write", { sessionId, data });
  },

  sshResize: async (sessionId: string, cols: number, rows: number): Promise<void> => {
    return await invoke<void>("ssh_resize", { sessionId, cols, rows });
  },

  sshDisconnect: async (sessionId: string): Promise<void> => {
    return await invoke<void>("ssh_disconnect", { sessionId });
  },

  // --- SFTP File Operations ---
  sftpListRemote: async (hostId: string, remotePath: string): Promise<FileEntry[]> => {
    return await invoke<FileEntry[]>("sftp_list_remote", { hostId, remotePath });
  },

  sftpReadFile: async (hostId: string, remotePath: string): Promise<string> => {
    return await invoke<string>("sftp_read_file", { hostId, remotePath });
  },

  sftpWriteFile: async (hostId: string, remotePath: string, content: string): Promise<void> => {
    return await invoke<void>("sftp_write_file", { hostId, remotePath, content });
  },

  sftpDeleteFile: async (hostId: string, remotePath: string, isDir: boolean): Promise<void> => {
    return await invoke<void>("sftp_delete_file", { hostId, remotePath, isDir });
  },

  sftpMkdir: async (hostId: string, remotePath: string): Promise<void> => {
    return await invoke<void>("sftp_mkdir", { hostId, remotePath });
  },

  sftpRenameFile: async (hostId: string, oldPath: string, newPath: string): Promise<void> => {
    return await invoke<void>("sftp_rename_file", { hostId, oldPath, newPath });
  },

  sftpListLocal: async (path: string): Promise<FileEntry[]> => {
    return await invoke<FileEntry[]>("sftp_list_local", { path });
  },

  sftpGetLocalHome: async (): Promise<string> => {
    return await invoke<string>("sftp_get_local_home");
  },

  // --- Backup & Restore ---
  backupExport: async (passphrase: string): Promise<string> => {
    return await invoke<string>("backup_export", { passphrase });
  },

  backupInspect: async (backupJson: string, passphrase: string): Promise<BackupSummary> => {
    return await invoke<BackupSummary>("backup_inspect", { backupJson, passphrase });
  },

  backupRestore: async (
    backupJson: string,
    passphrase: string,
    strategy: RestoreStrategy,
  ): Promise<BackupSummary> => {
    return await invoke<BackupSummary>("backup_restore", { backupJson, passphrase, strategy });
  },

  // --- OpenSSH Importer ---
  sshConfigParse: async (customPath?: string): Promise<SshConfigParseResult> => {
    return await invoke<SshConfigParseResult>("ssh_config_parse", { customPath });
  },

  sshConfigImport: async (input: ImportSshHostsInput): Promise<ImportResultSummary> => {
    return await invoke<ImportResultSummary>("ssh_config_import", { input });
  },

  // --- Termius Importer ---
  termiusParse: async (jsonContent: string): Promise<TermiusParseResult> => {
    return await invoke<TermiusParseResult>("termius_parse", { jsonContent });
  },

  termiusImport: async (input: ImportTermiusInput): Promise<ImportResultSummary> => {
    return await invoke<ImportResultSummary>("termius_import", { input });
  },

  // --- PuTTY Importer ---
  puttyParse: async (regContent: string): Promise<SshConfigHostCandidate[]> => {
    return await invoke<SshConfigHostCandidate[]>("putty_parse", { regContent });
  },

  puttyImport: async (input: ImportSshHostsInput): Promise<ImportResultSummary> => {
    return await invoke<ImportResultSummary>("putty_import", { input });
  },

  // --- Server Health Monitor ---
  hostFetchMetrics: async (hostId: string): Promise<ServerMetrics> => {
    return await invoke<ServerMetrics>("host_fetch_metrics", { hostId });
  },

  // --- Hardware Serial Console ---
  serialListPorts: async (): Promise<SerialPortInfo[]> => {
    return await invoke<SerialPortInfo[]>("serial_list_ports");
  },

  serialConnect: async (params: {
    options: SerialConnectOptions;
    onEvent: (event: SshEvent) => void;
  }): Promise<string> => {
    const channel = new Channel<SshEvent>();
    channel.onmessage = params.onEvent;
    return await invoke<string>("serial_connect", {
      options: params.options,
      onEvent: channel,
    });
  },

  serialWrite: async (sessionId: string, data: number[]): Promise<void> => {
    return await invoke<void>("serial_write", { sessionId, data });
  },

  serialDisconnect: async (sessionId: string): Promise<void> => {
    return await invoke<void>("serial_disconnect", { sessionId });
  },

  // --- Telnet Client Engine ---
  telnetConnect: async (params: {
    options: TelnetConnectOptions;
    onEvent: (event: SshEvent) => void;
  }): Promise<string> => {
    const channel = new Channel<SshEvent>();
    channel.onmessage = params.onEvent;
    return await invoke<string>("telnet_connect", {
      options: params.options,
      onEvent: channel,
    });
  },

  telnetWrite: async (sessionId: string, data: number[]): Promise<void> => {
    return await invoke<void>("telnet_write", { sessionId, data });
  },

  telnetDisconnect: async (sessionId: string): Promise<void> => {
    return await invoke<void>("telnet_disconnect", { sessionId });
  },
};
