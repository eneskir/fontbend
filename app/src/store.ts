import type { EditorState } from "./core/editor";

export type Store = {
  get(): EditorState;
  update(change: (state: EditorState) => EditorState): void;
  /** Called after every change with the new and the previous state. */
  subscribe(listener: (now: EditorState, before: EditorState) => void): void;
};

export function createStore(initial: EditorState): Store {
  let state = initial;
  const listeners: ((now: EditorState, before: EditorState) => void)[] = [];
  return {
    get: () => state,
    update(change) {
      const before = state;
      state = change(state);
      if (state !== before) for (const listener of listeners) listener(state, before);
    },
    subscribe: (listener) => void listeners.push(listener),
  };
}
