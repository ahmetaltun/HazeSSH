export interface ContainerItem {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  engine: string;
  cpu_percent?: string;
  memory_usage?: string;
  memory_percent?: string;
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

export interface ProcessItem {
  pid: number;
  user: string;
  cpu_percent: number;
  memory_percent: number;
  command: string;
}

export interface StorageMountItem {
  filesystem: string;
  total_size: string;
  used_size: string;
  available_size: string;
  usage_percent: number;
  mount_point: string;
}

export interface DockerDiskUsage {
  images_size?: string;
  containers_size?: string;
  volumes_size?: string;
  build_cache_size?: string;
}

export interface ServerToolboxOverview {
  host_id: string;
  containers: ContainerItem[];
  services: ServiceItem[];
  ports: OpenPortItem[];
  processes: ProcessItem[];
  storage: StorageMountItem[];
  docker_disk_usage?: DockerDiskUsage;
  docker_installed: boolean;
  systemd_installed: boolean;
  timestamp: number;
  error?: string;
}

export interface ContainerStatsMetric {
  cpu_percent: string;
  memory_usage: string;
  memory_percent: string;
}

export interface ToolboxTelemetry {
  host_id: string;
  container_stats: Record<string, ContainerStatsMetric>;
  docker_disk_usage?: DockerDiskUsage;
}

export interface HostToolboxState {
  overview?: ServerToolboxOverview;
  isLoading: boolean;
  isTelemetryLoading?: boolean;
  error?: string;
  lastUpdated?: number;
}
