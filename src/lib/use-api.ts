"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

interface ApiState<T> {
  /** Last loaded value. Kept while a new path loads so lists don't flash empty. */
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (data: T) => void;
}

interface Loaded<T> {
  path: string | null;
  data: T | undefined;
  error: unknown;
}

/** GET `path` on mount and whenever it changes. Pass null to skip the request. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<Loaded<T>>({
    path: null,
    data: undefined,
    error: null,
  });
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api<T>(path).then(
      (data) => !cancelled && setState({ path, data, error: null }),
      (error) => !cancelled && setState((s) => ({ path, data: s.data, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const reload = useCallback(async () => {
    if (path === null) return;
    setReloading(true);
    try {
      const data = await api<T>(path);
      setState({ path, data, error: null });
    } catch (error) {
      setState((s) => ({ ...s, path, error }));
    } finally {
      setReloading(false);
    }
  }, [path]);

  const setData = useCallback(
    (data: T) => setState((s) => ({ ...s, data, error: null })),
    [],
  );

  return {
    data: state.data,
    error: state.path === path ? state.error : null,
    loading: path !== null && (state.path !== path || reloading),
    reload,
    setData,
  };
}
