export interface ContainerItem {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  engine: string;
}

export interface ServiceItem {
  unit: string;
  load_state: string;
  active_state: string;
  sub_state: string;
  description: string;
}

export interface OpenPortItem {
  protocol: string;
  local_address: string;
  local_port: number;
  foreign_address: string;
  state: string;
  process?: string;
  pid?: number;
}

export interface ServerToolboxOverview {
  host_id: string;
  containers: ContainerItem[];
  services: ServiceItem[];
  ports: OpenPortItem[];
  docker_installed: boolean;
  systemd_installed: boolean;
  timestamp: number;
  error?: string;
}

export interface HostToolboxState {
  overview?: ServerToolboxOverview;
  isLoading: boolean;
  error?: string;
  lastUpdated?: number;
}
