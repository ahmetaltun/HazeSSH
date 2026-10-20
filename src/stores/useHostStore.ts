import { create } from "zustand";
import { api } from "@/services/api";
import type {
  Host,
  CreateHostInput,
  UpdateHostInput,
  HostGroup,
  CreateGroupInput,
  Identity,
  CreateIdentityInput,
} from "@/types/host";
import { useLayoutStore } from "@/stores/useLayoutStore";

interface HostState {
  readonly hosts: readonly Host[];
  readonly groups: readonly HostGroup[];
  readonly identities: readonly Identity[];
  readonly isLoading: boolean;
  readonly error: string | null;

  readonly fetchAll: () => Promise<void>;
  readonly fetchHosts: () => Promise<void>;
  readonly fetchGroups: () => Promise<void>;
  readonly fetchIdentities: () => Promise<void>;

  readonly createHost: (input: CreateHostInput) => Promise<Host>;
  readonly updateHost: (input: UpdateHostInput) => Promise<Host>;
  readonly deleteHost: (id: string) => Promise<void>;

  readonly createGroup: (input: CreateGroupInput) => Promise<HostGroup>;
  readonly deleteGroup: (id: string) => Promise<void>;

  readonly createIdentity: (input: CreateIdentityInput) => Promise<Identity>;
  readonly deleteIdentity: (id: string) => Promise<void>;
}

export const useHostStore = create<HostState>((set) => ({
  hosts: [],
  groups: [],
  identities: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [hosts, groups, identities] = await Promise.all([
        api.hostList(),
        api.groupList(),
        api.identityList(),
      ]);
      set({ hosts, groups, identities, isLoading: false });
      useLayoutStore.getState().updateCounters({ activeHosts: hosts.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
    }
  },

  fetchHosts: async () => {
    try {
      const hosts = await api.hostList();
      set({ hosts });
      useLayoutStore.getState().updateCounters({ activeHosts: hosts.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
    }
  },

  fetchGroups: async () => {
    try {
      const groups = await api.groupList();
      set({ groups });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
    }
  },

  fetchIdentities: async () => {
    try {
      const identities = await api.identityList();
      set({ identities });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
    }
  },

  createHost: async (input: CreateHostInput) => {
    const newHost = await api.hostCreate(input);
    set((state) => {
      const nextHosts = [...state.hosts, newHost];
      useLayoutStore.getState().updateCounters({ activeHosts: nextHosts.length });
      return { hosts: nextHosts };
    });
    return newHost;
  },

  updateHost: async (input: UpdateHostInput) => {
    const updated = await api.hostUpdate(input);
    set((state) => ({
      hosts: state.hosts.map((h) => (h.id === updated.id ? updated : h)),
    }));
    return updated;
  },

  deleteHost: async (id: string) => {
    await api.hostDelete(id);
    set((state) => {
      const nextHosts = state.hosts.filter((h) => h.id !== id);
      useLayoutStore.getState().updateCounters({ activeHosts: nextHosts.length });
      return { hosts: nextHosts };
    });
  },

  createGroup: async (input: CreateGroupInput) => {
    const newGroup = await api.groupCreate(input);
    set((state) => ({
      groups: [...state.groups, newGroup],
    }));
    return newGroup;
  },

  deleteGroup: async (id: string) => {
    await api.groupDelete(id);
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
    }));
  },

  createIdentity: async (input: CreateIdentityInput) => {
    const newIdentity = await api.identityCreate(input);
    set((state) => ({
      identities: [...state.identities, newIdentity],
    }));
    return newIdentity;
  },

  deleteIdentity: async (id: string) => {
    await api.identityDelete(id);
    set((state) => ({
      identities: state.identities.filter((i) => i.id !== id),
    }));
  },
}));
