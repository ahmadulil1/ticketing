import { useEffect, useState } from "react";

let toastCount = 0;
const listeners = new Set();
let memoryState = [];

function emit(nextState) {
  memoryState = nextState;
  listeners.forEach((listener) => listener(memoryState));
}

export function toast({ title, description, variant = "default" }) {
  const id = ++toastCount;
  const nextState = [
    ...memoryState,
    {
      id,
      title,
      description,
      variant,
      open: true,
    },
  ];

  emit(nextState);

  window.setTimeout(() => {
    emit(memoryState.filter((item) => item.id !== id));
  }, 3500);
}

export function dismissToast(id) {
  emit(memoryState.filter((item) => item.id !== id));
}

export function useToast() {
  const [toasts, setToasts] = useState(memoryState);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return {
    toast,
    dismissToast,
    toasts,
  };
}

