import { create } from "zustand";
import type {
  WorkspaceTab,
  SplitNode,
  SplitBranchNode,
  SplitLeafNode,
  TerminalPane,
  SplitDirection,
} from "@/types/terminal";
import { useLayoutStore } from "@/stores/useLayoutStore";

// Helper utilities for immutable recursive split-tree transformations

function createLeaf(pane: TerminalPane): SplitLeafNode {
  return {
    type: "leaf",
    id: pane.id,
    pane,
  };
}

function findPaneInNode(node: SplitNode, paneId: string): TerminalPane | null {
  if (node.type === "leaf") {
    return node.pane.id === paneId ? node.pane : null;
  }
  return findPaneInNode(node.first, paneId) || findPaneInNode(node.second, paneId);
}

function findFirstLeaf(node: SplitNode): SplitLeafNode {
  if (node.type === "leaf") {
    return node;
  }
  return findFirstLeaf(node.first);
}

function splitTargetPane(
  node: SplitNode,
  targetPaneId: string,
  newPane: TerminalPane,
  direction: SplitDirection
): SplitNode {
  if (node.type === "leaf") {
    if (node.pane.id === targetPaneId) {
      const branchId = `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const branch: SplitBranchNode = {
        type: "branch",
        id: branchId,
        direction,
        ratio: 0.5,
        first: node,
        second: createLeaf(newPane),
      };
      return branch;
    }
    return node;
  }

  return {
    ...node,
    first: splitTargetPane(node.first, targetPaneId, newPane, direction),
    second: splitTargetPane(node.second, targetPaneId, newPane, direction),
  };
}

function removePaneFromTree(node: SplitNode, targetPaneId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.pane.id === targetPaneId ? null : node;
  }

  const updatedFirst = removePaneFromTree(node.first, targetPaneId);
  const updatedSecond = removePaneFromTree(node.second, targetPaneId);

  if (updatedFirst === null && updatedSecond === null) {
    return null;
  }

  if (updatedFirst === null) {
    return updatedSecond;
  }

  if (updatedSecond === null) {
    return updatedFirst;
  }

  return {
    ...node,
    first: updatedFirst,
    second: updatedSecond,
  };
}

function updateRatioInTree(node: SplitNode, branchId: string, newRatio: number): SplitNode {
  if (node.type === "leaf") {
    return node;
  }
  if (node.id === branchId) {
    return { ...node, ratio: Math.min(0.9, Math.max(0.1, newRatio)) };
  }
  return {
    ...node,
    first: updateRatioInTree(node.first, branchId, newRatio),
    second: updateRatioInTree(node.second, branchId, newRatio),
  };
}

interface MultiplexerState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string | null;

  readonly openTab: (initialPane?: Partial<TerminalPane>, tabTitle?: string) => string;
  readonly closeTab: (tabId: string) => void;
  readonly setActiveTab: (tabId: string) => void;
  readonly splitActivePane: (direction: SplitDirection, newPaneData?: Partial<TerminalPane>) => string | null;
  readonly closePane: (tabId: string, paneId: string) => void;
  readonly setActivePane: (tabId: string, paneId: string) => void;
  readonly updateBranchRatio: (tabId: string, branchId: string, ratio: number) => void;
  readonly getActiveTab: () => WorkspaceTab | null;
  readonly getActivePane: () => TerminalPane | null;
}

export const useMultiplexerStore = create<MultiplexerState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (initialPaneData, tabTitle) => {
    const paneId = `pane_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newPane: TerminalPane = {
      id: paneId,
      title: initialPaneData?.title || initialPaneData?.hostname || "Local Terminal",
      hostId: initialPaneData?.hostId,
      hostname: initialPaneData?.hostname,
      username: initialPaneData?.username,
      status: initialPaneData?.status || "idle",
      createdAt: Date.now(),
    };

    const newTab: WorkspaceTab = {
      id: tabId,
      title: tabTitle || newPane.title,
      activePaneId: paneId,
      rootNode: createLeaf(newPane),
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));

    useLayoutStore.getState().setActiveSection("terminal");

    return tabId;
  },

  closeTab: (tabId) => {
    set((state) => {
      const remainingTabs = state.tabs.filter((t) => t.id !== tabId);
      let nextActiveId = state.activeTabId;

      if (state.activeTabId === tabId) {
        const closedIdx = state.tabs.findIndex((t) => t.id === tabId);
        if (remainingTabs.length > 0) {
          const nextIdx = Math.max(0, closedIdx - 1);
          nextActiveId = remainingTabs[nextIdx].id;
        } else {
          nextActiveId = null;
        }
      }

      return {
        tabs: remainingTabs,
        activeTabId: nextActiveId,
      };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
    useLayoutStore.getState().setActiveSection("terminal");
  },

  splitActivePane: (direction, newPaneData) => {
    const state = get();
    const activeTab = state.getActiveTab();
    if (!activeTab) return null;

    const newPaneId = `pane_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newPane: TerminalPane = {
      id: newPaneId,
      title: newPaneData?.title || newPaneData?.hostname || "Terminal",
      hostId: newPaneData?.hostId,
      hostname: newPaneData?.hostname,
      username: newPaneData?.username,
      status: newPaneData?.status || "idle",
      createdAt: Date.now(),
    };

    const updatedRoot = splitTargetPane(
      activeTab.rootNode,
      activeTab.activePaneId,
      newPane,
      direction
    );

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              rootNode: updatedRoot,
              activePaneId: newPaneId,
            }
          : t
      ),
    }));

    return newPaneId;
  },

  closePane: (tabId, paneId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const updatedRoot = removePaneFromTree(tab.rootNode, paneId);

    if (updatedRoot === null) {
      // Last pane was closed, so close the entire tab
      state.closeTab(tabId);
      return;
    }

    // Determine the next focused pane
    let nextActivePaneId = tab.activePaneId;
    if (tab.activePaneId === paneId) {
      const firstLeaf = findFirstLeaf(updatedRoot);
      nextActivePaneId = firstLeaf.pane.id;
    }

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              rootNode: updatedRoot,
              activePaneId: nextActivePaneId,
            }
          : t
      ),
    }));
  },

  setActivePane: (tabId, paneId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, activePaneId: paneId } : t
      ),
    }));
  },

  updateBranchRatio: (tabId, branchId, ratio) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              rootNode: updateRatioInTree(t.rootNode, branchId, ratio),
            }
          : t
      ),
    }));
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || null;
  },

  getActivePane: () => {
    const tab = get().getActiveTab();
    if (!tab) return null;
    return findPaneInNode(tab.rootNode, tab.activePaneId);
  },
}));
