type Listener = () => void;

interface GlobalSearchState {
  open: boolean;
}

let state: GlobalSearchState = { open: false };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => fn());
}

function setState(patch: Partial<GlobalSearchState>) {
  state = { ...state, ...patch };
  emit();
}

export const globalSearchStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getState() {
    return state;
  },

  open() {
    setState({ open: true });
  },

  close() {
    setState({ open: false });
  },
};
