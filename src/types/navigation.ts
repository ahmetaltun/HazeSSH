export type NavigationView =
  | "hosts"
  | "tunnels"
  | "sftp"
  | "snippets"
  | "history"
  | "settings";

export interface NavigationItem {
  readonly id: NavigationView;
  readonly label: string;
  readonly iconName: string;
  readonly badgeCount?: number;
}
