export type SyncProviderType = "git" | "webdav" | "local_folder";

export type GitProviderType = "github" | "gitlab" | "gitea" | "custom";

export interface GitSyncConfig {
  readonly gitProvider: GitProviderType;
  readonly repository: string; // "owner/repo" or "project_id"
  readonly branch: string; // default "main"
  readonly filePath: string; // default "haze-vault.haze"
  readonly token: string;
  readonly customBaseUrl?: string;
}

export interface WebDavSyncConfig {
  readonly serverUrl: string;
  readonly username?: string;
  readonly password?: string;
  readonly remotePath: string; // default "haze-vault.haze"
}

export interface LocalFolderSyncConfig {
  readonly targetDirectory: string;
  readonly fileName?: string; // default "haze-vault.haze"
}

export type SyncStatus = "idle" | "checking" | "syncing" | "synced" | "conflict" | "error";

export interface SyncConflictInfo {
  readonly remoteExportedAt?: number;
  readonly remoteVersion?: number;
  readonly remoteHostsCount?: number;
  readonly remoteGroupsCount?: number;
  readonly remoteIdentitiesCount?: number;
  readonly remoteSnippetsCount?: number;
  readonly remoteTunnelsCount?: number;
  readonly localHostsCount: number;
  readonly localIdentitiesCount: number;
}

export interface GitFileGetInput {
  readonly provider: string;
  readonly repository: string;
  readonly branch?: string;
  readonly file_path: string;
  readonly token: string;
  readonly base_url?: string;
}

export interface GitFileGetOutput {
  readonly content: string;
  readonly sha: string;
  readonly file_path: string;
}

export interface GitFilePutInput {
  readonly provider: string;
  readonly repository: string;
  readonly branch?: string;
  readonly file_path: string;
  readonly token: string;
  readonly content: string;
  readonly commit_message?: string;
  readonly sha?: string;
  readonly base_url?: string;
}

export interface GitFilePutOutput {
  readonly sha: string;
  readonly commit_url?: string;
}

export interface WebDavRequestInput {
  readonly url: string;
  readonly method: string;
  readonly username?: string;
  readonly password?: string;
  readonly body?: string;
  readonly timeout_seconds?: number;
}

export interface WebDavRequestOutput {
  readonly status: number;
  readonly body: string;
  readonly etag?: string;
}

export interface LocalFolderSyncInput {
  readonly folder_path: string;
  readonly file_name?: string;
  readonly content?: string;
}

export interface LocalFolderSyncOutput {
  readonly content: string;
  readonly full_path: string;
  readonly modified_at: number;
}
