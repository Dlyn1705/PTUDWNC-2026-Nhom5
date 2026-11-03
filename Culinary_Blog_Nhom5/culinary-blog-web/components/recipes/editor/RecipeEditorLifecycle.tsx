"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RecipeLifecycleDialog, lifecycleLabels, type LifecycleAction } from "@/components/dashboard/RecipeLifecycleDialog";
import { useRecipeMutations } from "@/hooks/mutations/useRecipeMutations";
import type { RecipeStatusValue } from "@/types/recipe.types";

type Props = {
  recipeId: string; title: string; status: RecipeStatusValue; disabled: boolean; dirty: boolean;
  onBusyChange: (busy: boolean) => void; onCompleted: () => void; onReload: () => void;
};

export function RecipeEditorLifecycle({ recipeId, title, status, disabled, dirty, onBusyChange, onCompleted, onReload }: Props) {
  const { publish, unpublish, archive, restore } = useRecipeMutations();
  const headingId = `${useId()}-editor-status`;
  const mutations = { publish, unpublish, archive, restore };
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState<unknown>(null);
  const locked = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const busy = Object.values(mutations).some(mutation => mutation.isPending);
  const actions: LifecycleAction[] = status === 0 ? ["publish", "archive"] : status === 1 ? ["unpublish", "archive"] : ["restore"];

  async function confirm() {
    if (!action || disabled || dirty || locked.current) return;
    locked.current = true; onBusyChange(true); setError(null);
    try {
      await mutations[action].mutateAsync(recipeId);
      setAction(null);
      onCompleted();
    } catch (cause) { setError(cause); }
    finally { locked.current = false; onBusyChange(false); }
  }

  return <section aria-label="Trạng thái trong trình chỉnh sửa" className="space-y-3 rounded-2xl border border-border bg-card p-6">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id={headingId} data-editor-status-heading tabIndex={-1} className="text-xl font-semibold">Trạng thái công thức</h2>
      <StatusBadge status={status} />
    </div>
    <p className="text-sm text-muted-foreground">Lưu riêng nội dung, nguyên liệu và các bước trước khi đổi trạng thái. Xóa công thức dùng nút xác nhận ở cuối trang.</p>
    {dirty && <p role="status" className="text-sm text-warning">Có dữ liệu chưa lưu. Hãy lưu hoặc tải lại bản mới trước khi đổi trạng thái.</p>}
    <div className="flex flex-wrap gap-2">
      {actions.map(next => <button key={next} type="button" disabled={disabled || dirty || busy} className="rounded-lg border px-4 py-2 disabled:opacity-50"
        onClick={event => { trigger.current = event.currentTarget; setError(null); setAction(next); }}>{lifecycleLabels[next]}</button>)}
      <Link className="rounded-lg px-3 py-2 underline" href={`/dashboard/recipes?status=${status}`}>Xem danh sách theo trạng thái</Link>
    </div>
    <RecipeLifecycleDialog target={action ? { id: recipeId, title, action } : null} busy={busy} error={error}
      returnFocusRef={trigger} onCancel={() => { if (!locked.current) setAction(null); }} onConfirm={() => void confirm()}
      reloadLabel="Tải lại công thức" fallbackFocusId={headingId}
      onReload={() => { if (!locked.current) { setAction(null); onReload(); } }} />
  </section>;
}
