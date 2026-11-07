import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function useRemote<T>(key: unknown[], query: () => Promise<Result<T>>, enabled = true) {
  return useQuery({
    queryKey: key,
    enabled,
    refetchInterval: 20000,
    queryFn: async () => {
      const result = await query();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useSaver() {
  const { t } = useI18n();
  const client = useQueryClient();
  return async function save<T>(run: () => Promise<Result<T>>, keys: unknown[][] = []): Promise<T | null> {
    try {
      const result = await run();
      if (!result.ok) {
        const key = `err.${result.error}` as MessageKey;
        toast.error(t(key));
        return null;
      }
      toast.success(t("state.saved"));
      await Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: key })));
      return result.data;
    } catch {
      toast.error(t("state.error"));
      return null;
    }
  };
}
