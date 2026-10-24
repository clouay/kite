import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { create, useStore } from "zustand";
import { immer } from "zustand/middleware/immer";

// Read-only previews, like the flows of a template, don't show the validation
// markers on blocks. Their parameters are only filled in when the template is
// added.
export const FlowReadOnlyContext = createContext(false);

export const flowContextTypes = [
  "command",
  "component_button",
  "component_select_menu",
  "event_discord",
  "event_schedule",
  "event_webhook",
] as const;

export type FlowContextType = (typeof flowContextTypes)[number];

export interface FlowContextStore {
  type: FlowContextType;
  setType(type: FlowContextType): void;
  commandId?: string;
  setCommandId(commandId?: string): void;
  eventListenerId?: string;
  setEventListenerId(eventListenerId?: string): void;
  // The blocks the flow AI changed in its last answer, which stand out until
  // the user keeps or undoes the changes.
  aiChangedNodeIds: string[];
  setAIChangedNodeIds(ids: string[]): void;
}

export const createFlowContextStore = () => {
  return create<FlowContextStore>()(
    immer((set) => ({
      type: "command",
      commandId: undefined,
      eventListenerId: undefined,

      setType: (type) => set({ type }),
      setCommandId: (commandId) => set({ commandId }),
      setEventListenerId: (eventListenerId) => set({ eventListenerId }),
      aiChangedNodeIds: [],
      setAIChangedNodeIds: (ids) => set({ aiChangedNodeIds: ids }),
    }))
  );
};

const FlowContextStoreContext = createContext<ReturnType<
  typeof createFlowContextStore
> | null>(null);

export function FlowContextStoreProvider({
  children,
  type,
  commandId,
  eventListenerId,
}: {
  children: ReactNode;
  type: FlowContextType;
  commandId?: string;
  eventListenerId?: string;
}) {
  const [contextStore] = useState(() => createFlowContextStore());

  useEffect(() => {
    contextStore.getState().setType(type);
  }, [type, contextStore]);

  useEffect(() => {
    contextStore.getState().setCommandId(commandId);
  }, [commandId, contextStore]);

  useEffect(() => {
    contextStore.getState().setEventListenerId(eventListenerId);
  }, [eventListenerId, contextStore]);

  return (
    <FlowContextStoreContext.Provider value={contextStore}>
      {children}
    </FlowContextStoreContext.Provider>
  );
}

export function useFlowContextStore() {
  const value = useContext(FlowContextStoreContext);
  if (!value) {
    throw new Error(
      "useFlowContextStore must be used within a FlowContextStore provider"
    );
  }
  return value;
}

export function useFlowContext<T>(selector: (store: FlowContextStore) => T): T {
  const store = useFlowContextStore();
  return useStore(store, selector);
}

// Blocks are also shown outside the editor, e.g. in examples, where nothing
// was changed by the AI.
const emptyContextStore = createFlowContextStore();

export function useChangedByAI(nodeId: string) {
  const store = useContext(FlowContextStoreContext);
  return useStore(store ?? emptyContextStore, (s) =>
    s.aiChangedNodeIds.includes(nodeId)
  );
}
